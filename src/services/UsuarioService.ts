import type { ContratoIpc, UsuarioDto } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao, ContratoHashSenha } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { ValidacaoUsuario } from './ValidacaoUsuario';
import { ErroUsuario } from './ErroUsuario';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type CanalUsuario = Extract<keyof ContratoIpc, `usuarios:${string}`>;
type Saida = ContratoIpc[CanalUsuario]['saida'];
type AlvoUsuario = Readonly<{ id: number; identidadeConta: string | undefined }>;
type CapturaAlvo = { sucesso: true; alvo: AlvoUsuario | undefined } | { sucesso: false; erro: unknown };

export class UsuarioService {
  private readonly chaveReferencia = randomBytes(32);
  public constructor(private readonly repository: UsuarioRepository, private readonly hash: ContratoHashSenha,
    private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}

  /** A guarda de origem é criada pelo handler Main, nunca recebida pelo IPC. */
  public async executar(canal: CanalUsuario, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto);
    const sessao = this.sessoes.obter(contexto);
    const conferir = (): void => {
      conferirOrigem();
      this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroUsuario('NAO_AUTENTICADO');
    };
    // O vínculo do alvo precisa existir antes da PRIMEIRA suspensão, inclusive
    // a autorização do solicitante. Nunca o recapturar depois de um await.
    const captura = this.capturarAlvo(canal, entrada);
    const administrador = await this.autorizador.exigirPerfil(contexto, ['admin']);
    conferir();
    if (!captura.sucesso) throw captura.erro;
    ValidacaoUsuario.objeto(entrada);
    // Parse antes de hash; senha só é aceita nos dois canais específicos.
    const schema = canal === 'usuarios:criar' ? ValidacaoUsuario.criar
      : canal === 'usuarios:atualizar' ? ValidacaoUsuario.atualizar
      : canal === 'usuarios:alterar-senha' ? ValidacaoUsuario.senha
      : canal === 'usuarios:listar' ? ValidacaoUsuario.lista
      : canal === 'usuarios:excluir' ? ValidacaoUsuario.alvo : ValidacaoUsuario.id;
    if (!schema.safeParse(entrada).success) throw new ErroUsuario('VALIDACAO');
    const criacao = canal === 'usuarios:criar' ? ValidacaoUsuario.criar.parse(entrada) : undefined;
    const senha = canal === 'usuarios:alterar-senha' ? ValidacaoUsuario.senha.parse(entrada) : undefined;
    const alvo = captura.alvo;
    const digest = criacao !== undefined ? await this.hash.gerar(criacao.senha)
      : senha !== undefined ? await this.hash.gerar(senha.senha) : undefined;

    let identidadeExcluida: string | undefined;
    let credencialRevogada: { identidadeConta: string; versaoAnterior: number } | undefined;
    const resultado = this.repository.atomico<Saida>(() => {
      conferir();
      // Releitura síncrona sob IMMEDIATE: inclui revogação durante hash/await.
      const ator = this.repository.obterPublico(administrador.id);
      if (ator === undefined || ator.ativo !== 1 || ator.perfil !== 'admin'
          || this.repository.identidadeConta(administrador.id) !== administrador.identidadeConta
          || this.repository.versaoCredencial(administrador.id) !== administrador.versaoCredencial) throw new ErroUsuario('SEM_PERMISSAO');
      if (criacao !== undefined && digest !== undefined) {
        const criado = this.repository.create({ nome: criacao.nome, email: criacao.email, perfil: criacao.perfil, ativo: criacao.ativo, senha_hash: digest });
        return this.dto(criado);
      }
      if (canal === 'usuarios:listar') {
        const lista = ValidacaoUsuario.lista.parse(entrada);
        const pagina = this.repository.listarPublico({ pagina: lista.pagina, tamanho: lista.tamanho,
          ...(lista.busca === undefined ? {} : { busca: lista.busca }) });
        return { ...pagina, itens: pagina.itens.map(usuario => this.dto(usuario)) };
      }
      if (alvo === undefined) throw new ErroUsuario('INTERNO');
      const { id, identidadeConta: identidadeAlvo } = alvo;
      // Ausência inicial também é um resultado fixo: uma conta que apareça
      // depois não pode herdar uma operação iniciada sem alvo disponível.
      if (identidadeAlvo === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
      const atual = this.repository.obterPublico(id);
      if (atual === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
      if (this.repository.identidadeConta(id) !== identidadeAlvo) throw new ErroUsuario('CONFLITO');
      if (canal === 'usuarios:obter') return this.dto(atual);
      if (canal === 'usuarios:excluir') {
        if (id === administrador.id) throw new ErroUsuario('CONFLITO');
        this.protegerAdmin(atual, false);
        if (!this.repository.delete(id)) throw new ErroUsuario('NAO_ENCONTRADO');
        identidadeExcluida = identidadeAlvo;
        return { id, excluido: true };
      }
      if (senha !== undefined && digest !== undefined) {
        const versaoAnterior = this.repository.versaoCredencial(id);
        if (versaoAnterior === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
        const atualizado = this.repository.update(id, { senha_hash: digest });
        if (atualizado === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
        credencialRevogada = { identidadeConta: identidadeAlvo, versaoAnterior };
        return this.dto(atualizado);
      }
      const patch = ValidacaoUsuario.atualizar.parse(entrada).alteracoes;
      const perfil = patch.perfil ?? atual.perfil;
      const ativo = patch.ativo ?? atual.ativo;
      this.protegerAdmin(atual, perfil === 'admin' && ativo === 1);
      if (this.repository.possuiInstrutor(id) && (perfil !== 'instrutor' || ativo !== 1)) throw new ErroUsuario('CONFLITO');
      const atualizado = this.repository.update(id, {
        ...(patch.nome === undefined ? {} : { nome: patch.nome }),
        ...(patch.email === undefined ? {} : { email: patch.email }),
        ...(patch.perfil === undefined ? {} : { perfil: patch.perfil }),
        ...(patch.ativo === undefined ? {} : { ativo: patch.ativo })
      });
      if (atualizado === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
    // atomico já confirmou o COMMIT. Sem await/callback externo entre commit
    // e revogação; rollback/FK/erro de commit não chegam a este ponto.
    if (identidadeExcluida !== undefined) this.sessoes.revogarIdentidade(identidadeExcluida);
    if (credencialRevogada !== undefined) this.sessoes.revogarCredencial(credencialRevogada.identidadeConta, credencialRevogada.versaoAnterior);
    return resultado;
  }

  private capturarAlvo(canal: CanalUsuario, entrada: unknown): CapturaAlvo {
    if (canal === 'usuarios:criar' || canal === 'usuarios:listar') return { sucesso: true, alvo: undefined };
    try {
      ValidacaoUsuario.objeto(entrada);
      const identificador = ValidacaoUsuario.id.safeParse({ id: Object.getOwnPropertyDescriptor(entrada, 'id')?.value });
      if (!identificador.success) throw new ErroUsuario('VALIDACAO');
      const id = identificador.data.id;
      const identidadeConta = this.repository.identidadeConta(id);
      const referencia: unknown = Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value;
      if (referencia !== undefined) {
        if (typeof referencia !== 'string' || !/^[0-9a-f]{64}$/.test(referencia)) throw new ErroUsuario('VALIDACAO');
        if (identidadeConta !== undefined && !timingSafeEqual(Buffer.from(referencia, 'hex'), Buffer.from(this.referencia(id, identidadeConta), 'hex'))) throw new ErroUsuario('CONFLITO');
      }
      return { sucesso: true, alvo: Object.freeze({ id, identidadeConta }) };
    } catch (erro: unknown) {
      // Preparar não autoriza: erros de entrada/banco só podem ser publicados
      // depois de confirmar o solicitante, sem expor existência a outro perfil.
      return { sucesso: false, erro };
    }
  }

  private protegerAdmin(atual: UsuarioDto, permanece: boolean): void {
    if (atual.perfil === 'admin' && atual.ativo === 1 && !permanece && this.repository.contarAdministradores() <= 1) throw new ErroUsuario('CONFLITO');
  }

  private dto(usuario: UsuarioDto): UsuarioDto {
    const identidade = this.repository.identidadeConta(usuario.id);
    if (identidade === undefined) throw new ErroUsuario('NAO_ENCONTRADO');
    return { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil,
      ativo: usuario.ativo, criado_em: usuario.criado_em, atualizado_em: usuario.atualizado_em,
      referencia: this.referencia(usuario.id, identidade) };
  }

  private referencia(id: number, identidade: string): string {
    return createHmac('sha256', this.chaveReferencia).update(`${id}\0${identidade}`).digest('hex');
  }
}
