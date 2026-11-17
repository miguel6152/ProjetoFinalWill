import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Conexao } from '../database/Conexao';
import { Migrador } from '../database/Migrador';
import { Migracao001EstruturaInicial } from '../database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../database/migrations/Migracao003VersaoCredencial';
import { ConsultaAutenticacaoRepository } from '../repositories/ConsultaAutenticacaoRepository';
import { AutenticacaoService } from '../services/AutenticacaoService';
import { HashSenhaArgon2 } from '../services/HashSenhaArgon2';
import { ErroAutenticacao } from './seguranca/ErroAutenticacao';
import type { BrowserWindow } from 'electron';
import { SessaoManager } from './seguranca/SessaoManager';
import { Autorizador } from './seguranca/Autorizador';
import { SessaoAutenticacaoService } from '../services/SessaoAutenticacaoService';
import { AutenticacaoHandler } from './ipc/AutenticacaoHandler';
import { UsuarioHandler } from './ipc/UsuarioHandler';
import { UsuarioService } from '../services/UsuarioService';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { InicializacaoHandler } from './ipc/InicializacaoHandler';
import { ProvisionamentoService } from '../services/ProvisionamentoService';
import { PoliticaSessao } from './seguranca/PoliticaSessao';
import { LimitadorLogin } from './seguranca/LimitadorLogin';
import { AlunoRepository } from '../repositories/AlunoRepository';
import { AlunoService } from '../services/AlunoService';
import { AlunoHandler } from './ipc/AlunoHandler';

export class Composicao {
  private alunos: AlunoService | undefined;
  private alunoHandler: AlunoHandler | undefined;
  private conexao: Conexao | undefined;
  private autenticacao: AutenticacaoService | undefined;
  private sessoes = new SessaoManager();
  private sessaoAutenticacao: SessaoAutenticacaoService | undefined;
  private handler: AutenticacaoHandler | undefined;
  private usuarios: UsuarioService | undefined;
  private usuarioHandler: UsuarioHandler | undefined;
  private provisionamento: ProvisionamentoService | undefined;
  private inicializacaoHandler: InicializacaoHandler | undefined;

  public iniciar(caminho: string): void {
    if (this.conexao !== undefined) return;
    // Configuração inválida é rejeitada dentro do fluxo de inicialização tratado
    // por Aplicacao, antes de abrir ou migrar o arquivo de banco.
    const politica = PoliticaSessao.doAmbiente(), limitador = LimitadorLogin.doAmbiente();
    if (caminho !== ':memory:') mkdirSync(path.dirname(caminho), { recursive: true });
    const conexao: Conexao = new Conexao(caminho);
    try {
      new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const dados = new ConsultaAutenticacaoRepository(conexao);
      this.sessoes = new SessaoManager(politica);
      this.autenticacao = new AutenticacaoService({ dados, hash: new HashSenhaArgon2() }, limitador);
      this.sessaoAutenticacao = new SessaoAutenticacaoService(this.autenticacao, this.sessoes, new Autorizador(this.sessoes, dados));
      this.usuarios = new UsuarioService(new UsuarioRepository(conexao), new HashSenhaArgon2(), new Autorizador(this.sessoes, dados), this.sessoes);
      this.alunos = new AlunoService(new AlunoRepository(conexao), new Autorizador(this.sessoes, dados), this.sessoes);
      this.provisionamento = new ProvisionamentoService(new UsuarioRepository(conexao), new HashSenhaArgon2(), limitador);
      this.conexao = conexao;
    } catch (erro: unknown) {
      conexao.fechar();
      throw erro;
    }
  }

  public encerrar(): void {
    this.alunoHandler?.encerrar();
    this.alunoHandler = undefined;
    this.alunos = undefined;
    this.inicializacaoHandler?.encerrar();
    this.inicializacaoHandler = undefined;
    this.provisionamento = undefined;
    this.usuarioHandler?.encerrar();
    this.usuarioHandler = undefined;
    this.usuarios = undefined;
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
    if (this.alunos === undefined) throw new ErroAutenticacao('INTERNO');
    this.alunoHandler ??= new AlunoHandler(this.alunos, this.handler);
    if (this.usuarios === undefined) throw new ErroAutenticacao('INTERNO');
    this.usuarioHandler ??= new UsuarioHandler(this.usuarios, this.handler);
    if (this.provisionamento === undefined) throw new ErroAutenticacao('INTERNO');
    this.inicializacaoHandler ??= new InicializacaoHandler(this.provisionamento, this.handler, this.sessoes);
  }

  /** Verificador parcial da 4.2, para uso interno; IPC usa o coordenador de sessões. */
  public obterAutenticacao(): AutenticacaoService {
    if (this.autenticacao === undefined) throw new ErroAutenticacao('INTERNO');
    return this.autenticacao;
  }
}
