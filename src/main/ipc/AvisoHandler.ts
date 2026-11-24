import type { EntregaService } from '../../services/EntregaService';
import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import type { NotificacaoRepository } from '../../repositories/NotificacaoRepository';
import type { PlanoRepository } from '../../repositories/PlanoRepository';
import type { AvisosService } from '../../services/AvisosService';
import type { AutenticacaoHandler } from './AutenticacaoHandler';
import type { Autorizador } from '../seguranca/Autorizador';
import type { SessaoManager } from '../seguranca/SessaoManager';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';

type Canal = Extract<keyof ContratoIpc, `avisos:${string}`>;
const filtro = z.object({ busca: z.string().trim().max(120),
  estado: z.enum(['ativos','nao_lidos','lidos','invalidados','todos']) }).strict();
const alvo = z.object({ id: z.number().int().safe().positive() }).strict();
const envio = alvo.extend({ modo: z.enum(['simulado','telegram']) });
const preferencia = alvo.extend({
  chat: z.string().regex(/^[1-9]\d{0,15}$/).refine(s => Number.isSafeInteger(Number(s))).nullable(),
  autorizar: z.boolean()
}).refine(p => !p.autorizar || p.chat !== null);

export class AvisoHandler {
  private readonly canais: readonly Canal[] = ['avisos:listar', 'avisos:verificar', 'avisos:ler',
    'avisos:entrega','avisos:processar','avisos:preferencia','avisos:configurar'];
  private encerrado = false;

  public constructor(private readonly entregas: EntregaService, private readonly avisos: AvisosService, private readonly repository: NotificacaoRepository,
    private readonly origem: AutenticacaoHandler, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager, private readonly atores: PlanoRepository) {
    const registrados: Canal[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...args: unknown[]) => this.atender(canal, evento, args));
        registrados.push(canal);
      }
    } catch (erro) {
      for (const canal of registrados) ipcMain.removeHandler(canal);
      throw erro;
    }
  }

  private async atender(canal: Canal, evento: IpcMainInvokeEvent, args: unknown[]): Promise<Resultado<ContratoIpc[Canal]['saida']>> {
    try {
      const contexto = this.origem.contexto(evento);
      const versao = this.sessoes.versao(contexto);
      const usuario = await this.autorizador.exigirPerfil(contexto, ['admin','recepcao']);
      const conferir = () => {
        this.origem.contexto(evento);
        this.sessoes.conferir(contexto, versao);
        if (this.encerrado) throw new ErroAutenticacao('SEM_PERMISSAO');
        const ator = this.atores.atorAtual(usuario.id);
        if (!ator?.ativo || ator.identidadeConta !== usuario.identidadeConta || ator.versaoCredencial !== usuario.versaoCredencial) {
          throw new ErroAutenticacao('NAO_AUTENTICADO');
        }
        if (ator.perfil !== 'admin' && ator.perfil !== 'recepcao') throw new ErroAutenticacao('SEM_PERMISSAO');
      };
      const dados = this.repository.transacao(() => {
        conferir();
        if (args.length !== 1) throw new ErroAutenticacao('VALIDACAO');
        switch (canal) {
          case 'avisos:preferencia': return this.repository.preferencia(alvo.parse(args[0]).id) ?? null;
          case 'avisos:configurar': return { salvo: this.repository.alterarPreferencia(preferencia.parse(args[0]),new Date().toISOString()) };
          case 'avisos:entrega': return this.entregas.consultar(alvo.parse(args[0]).id);
          case 'avisos:processar': {
            const { id, modo } = envio.parse(args[0]);
            // A requisição de rede começa depois do commit da transação de autorização.
            return async () => {
              await this.entregas.processar(id,true,modo);
              conferir();
              return this.entregas.consultar(id);
            };
          }
          case 'avisos:listar': return this.repository.listar(filtro.parse(args[0]));
          case 'avisos:verificar':
            z.undefined().parse(args[0]);
            return this.avisos.verificar();
          case 'avisos:ler': return { lido: this.repository.ler(alvo.parse(args[0]).id, new Date().toISOString()) };
        }
      });
      return { sucesso: true, dados: typeof dados === 'function' ? await dados() : dados };
    } catch (erro) {
      if (erro instanceof ErroAutenticacao) return { sucesso: false, erro: erro.paraPublico() };
      if (erro && typeof erro === 'object' && 'code' in erro && erro.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { sucesso: false, erro: { codigo: 'CONFLITO', mensagem: 'Este chat já está vinculado a outro aluno.' } };
      }
      if (erro instanceof z.ZodError) return { sucesso: false, erro: { codigo: 'VALIDACAO', mensagem: 'Confira os dados da consulta de avisos.' } };
      return { sucesso: false, erro: { codigo: 'INTERNO', mensagem: 'Não foi possível concluir a operação de avisos.' } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
