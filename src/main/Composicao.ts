import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Conexao } from '../database/Conexao';
import { Migrador } from '../database/Migrador';
import { Migracao001EstruturaInicial } from '../database/migrations/Migracao001EstruturaInicial';
import { ConsultaAutenticacaoRepository } from '../repositories/ConsultaAutenticacaoRepository';
import { AutenticacaoService } from '../services/AutenticacaoService';
import { HashSenhaArgon2 } from '../services/HashSenhaArgon2';
import { ErroAutenticacao } from './seguranca/ErroAutenticacao';
import type { BrowserWindow } from 'electron';
import { SessaoManager } from './seguranca/SessaoManager';
import { Autorizador } from './seguranca/Autorizador';
import { SessaoAutenticacaoService } from '../services/SessaoAutenticacaoService';
import { AutenticacaoHandler } from './ipc/AutenticacaoHandler';

export class Composicao {
  private conexao: Conexao | undefined;
  private autenticacao: AutenticacaoService | undefined;
  private readonly sessoes = new SessaoManager();
  private sessaoAutenticacao: SessaoAutenticacaoService | undefined;
  private handler: AutenticacaoHandler | undefined;

  public iniciar(caminho: string): void {
    if (this.conexao !== undefined) return;
    if (caminho !== ':memory:') mkdirSync(path.dirname(caminho), { recursive: true });
    const conexao: Conexao = new Conexao(caminho);
    try {
      new Migrador(conexao, [new Migracao001EstruturaInicial()]).executar();
      const dados = new ConsultaAutenticacaoRepository(conexao);
      this.autenticacao = new AutenticacaoService({ dados, hash: new HashSenhaArgon2() });
      this.sessaoAutenticacao = new SessaoAutenticacaoService(this.autenticacao, this.sessoes, new Autorizador(this.sessoes, dados));
      this.conexao = conexao;
    } catch (erro: unknown) {
      conexao.fechar();
      throw erro;
    }
  }

  public encerrar(): void {
    this.handler?.encerrar();
    this.handler = undefined;
    this.sessoes.encerrarTodas();
    this.sessaoAutenticacao = undefined;
    this.autenticacao = undefined;
    this.conexao?.fechar();
    this.conexao = undefined;
  }

  public vincularJanela(janela: BrowserWindow, url: string): void {
    if (this.sessaoAutenticacao === undefined) throw new ErroAutenticacao('INTERNO');
    this.handler ??= new AutenticacaoHandler(this.sessaoAutenticacao, this.sessoes);
    this.handler.vincular(janela, url);
  }

  /** Verificador parcial da 4.2, para uso interno; IPC usa o coordenador de sessões. */
  public obterAutenticacao(): AutenticacaoService {
    if (this.autenticacao === undefined) throw new ErroAutenticacao('INTERNO');
    return this.autenticacao;
  }
}
