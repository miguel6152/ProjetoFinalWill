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

export class AvisoHandler {
  private readonly canais: readonly Canal[] = ['avisos:listar', 'avisos:verificar', 'avisos:ler'];
  private encerrado = false;

  public constructor(private readonly avisos: AvisosService, private readonly repository: NotificacaoRepository,
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
      const dados = this.repository.transacao(() => {
        this.origem.contexto(evento);
        this.sessoes.conferir(contexto, versao);
        if (this.encerrado) throw new ErroAutenticacao('SEM_PERMISSAO');
        const ator = this.atores.atorAtual(usuario.id);
        if (!ator?.ativo || ator.identidadeConta !== usuario.identidadeConta || ator.versaoCredencial !== usuario.versaoCredencial) {
          throw new ErroAutenticacao('NAO_AUTENTICADO');
        }
        if (ator.perfil !== 'admin' && ator.perfil !== 'recepcao') throw new ErroAutenticacao('SEM_PERMISSAO');
        if (args.length !== 1) throw new ErroAutenticacao('VALIDACAO');
        switch (canal) {
          case 'avisos:listar': return this.repository.listar(filtro.parse(args[0]));
          case 'avisos:verificar':
            z.undefined().parse(args[0]);
            return this.avisos.verificar();
          case 'avisos:ler': return { lido: this.repository.ler(alvo.parse(args[0]).id, new Date().toISOString()) };
        }
      });
      return { sucesso: true, dados };
    } catch (erro) {
      if (erro instanceof ErroAutenticacao) return { sucesso: false, erro: erro.paraPublico() };
      if (erro instanceof z.ZodError) return { sucesso: false, erro: { codigo: 'VALIDACAO', mensagem: 'Confira os dados da consulta de avisos.' } };
      return { sucesso: false, erro: { codigo: 'INTERNO', mensagem: 'Não foi possível concluir a operação de avisos.' } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
