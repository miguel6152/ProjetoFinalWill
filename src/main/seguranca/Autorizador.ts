import type { ContextoSessao, ContratoAutorizador, ContratoDadosAutenticacao, ContratoSessaoManager, IdentidadeAutenticada, SessaoInterna } from './ContratosAutenticacao';
import type { Perfil } from '../../shared/tipos/Autenticacao';
import { ErroAutenticacao } from './ErroAutenticacao';
import { ValidacaoAutenticacao } from '../../services/ValidacaoAutenticacao';

export class Autorizador implements ContratoAutorizador {
  public constructor(private readonly sessoes: ContratoSessaoManager, private readonly dados: ContratoDadosAutenticacao) {}

  public async exigirIdentidade(contexto: ContextoSessao): Promise<IdentidadeAutenticada> {
    let sessao: Readonly<SessaoInterna> | undefined;
    try {
      sessao = this.sessoes.obter(contexto);
      if (sessao === undefined) throw new ErroAutenticacao('NAO_AUTENTICADO');
      const encontrado = await this.dados.buscarIdentidadePorId(sessao.usuarioId);
      // Logout, troca de usuário e destruição durante a consulta impedem resposta tardia.
      if (this.sessoes.obter(contexto) !== sessao) throw new ErroAutenticacao('NAO_AUTENTICADO');
      const atual = encontrado === undefined ? undefined : ValidacaoAutenticacao.identidade.parse(encontrado);
      if (atual === undefined || !atual.ativo || atual.id !== sessao.usuarioId) {
        this.sessoes.encerrar(contexto);
        throw new ErroAutenticacao('NAO_AUTENTICADO');
      }
      return { id: atual.id, nome: atual.nome, perfil: atual.perfil, ativo: atual.ativo };
    } catch (erro: unknown) {
      if (erro instanceof ErroAutenticacao) throw new ErroAutenticacao(erro.codigo);
      // Um erro da consulta antiga não tem autoridade sobre a sessão substituta.
      if (sessao !== undefined && this.sessoes.obter(contexto) === sessao) this.sessoes.encerrar(contexto);
      throw new ErroAutenticacao('INTERNO');
    }
  }

  public async exigirPerfil(contexto: ContextoSessao, permitidos: readonly Perfil[]): Promise<IdentidadeAutenticada> {
    const identidade = await this.exigirIdentidade(contexto);
    if (!permitidos.includes(identidade.perfil)) throw new ErroAutenticacao('SEM_PERMISSAO');
    return identidade;
  }
}
