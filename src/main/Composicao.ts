import { ClimaService } from '../services/ClimaService';
import { RelatorioRepository } from '../repositories/RelatorioRepository';
import { RelatorioService } from '../services/RelatorioService';
import { ConsultaRelatorioService } from '../services/ConsultaRelatorioService';
import { RelatorioHandler } from './ipc/RelatorioHandler';
import { CredenciaisRelatorios } from '../api/CredenciaisRelatorios';
import { ServidorRelatorios } from '../api/ServidorRelatorios';
import type { ContextoSessao } from './seguranca/ContratosAutenticacao';
import { ClimaHandler } from './ipc/ClimaHandler';
import { EntregaService } from '../services/EntregaService';
import { Migracao005Entregas } from '../database/migrations/Migracao005Entregas';
import { AvisoHandler } from './ipc/AvisoHandler';
import { Migracao004AvisosInternos } from '../database/migrations/Migracao004AvisosInternos';
import { NotificacaoRepository } from '../repositories/NotificacaoRepository';
import { AvisosService } from '../services/AvisosService';
import { PagamentoHandler } from '../main/ipc/PagamentoHandler';
import { PagamentoService } from '../services/PagamentoService';
import { PagamentoRepository } from '../repositories/PagamentoRepository';
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
import { ViaCepService } from '../services/ViaCepService';
import { EnderecoHandler } from './ipc/EnderecoHandler';
import { PlanoRepository } from '../repositories/PlanoRepository';
import { InstrutorRepository } from '../repositories/InstrutorRepository';
import { AulaRepository } from '../repositories/AulaRepository';
import { InscricaoRepository } from '../repositories/InscricaoRepository';
import { AvaliacaoRepository } from '../repositories/AvaliacaoRepository';
import { PlanoService } from '../services/PlanoService';
import { InstrutorService } from '../services/InstrutorService';
import { AulaService } from '../services/AulaService';
import { InscricaoService } from '../services/InscricaoService';
import { AvaliacaoService } from '../services/AvaliacaoService';
import { PlanoHandler } from './ipc/PlanoHandler';
import { InstrutorHandler } from './ipc/InstrutorHandler';
import { AulaHandler } from './ipc/AulaHandler';
import { InscricaoHandler } from './ipc/InscricaoHandler';
import { AvaliacaoHandler } from './ipc/AvaliacaoHandler';
import { MatriculaRepository } from '../repositories/MatriculaRepository';
import { MatriculaService } from '../services/MatriculaService';
import { MatriculaHandler } from './ipc/MatriculaHandler';

export class Composicao {
  private relatorioHandler: RelatorioHandler | undefined;
  private apiRelatorios: ServidorRelatorios | undefined;
  private credenciaisRelatorios: CredenciaisRelatorios | undefined;
  private climaHandler: ClimaHandler | undefined;
  private entregas: EntregaService | undefined;
  private avisoHandler: AvisoHandler | undefined;
  private avisos: AvisosService | undefined;
  private notificacoes: NotificacaoRepository | undefined;
  private pagamentos: PagamentoService | undefined;
  private pagamentoHandler: PagamentoHandler | undefined;
  private matriculas: MatriculaService | undefined;
  private matriculaHandler: MatriculaHandler | undefined;
  private planos: PlanoService | undefined;
  private instrutores: InstrutorService | undefined;
  private aulas: AulaService | undefined;
  private inscricoes: InscricaoService | undefined;
  private avaliacoes: AvaliacaoService | undefined;
  private planoHandler: PlanoHandler | undefined;
  private instrutorHandler: InstrutorHandler | undefined;
  private aulaHandler: AulaHandler | undefined;
  private inscricaoHandler: InscricaoHandler | undefined;
  private avaliacaoHandler: AvaliacaoHandler | undefined;
  private enderecoHandler: EnderecoHandler | undefined;
  private autorizador: Autorizador | undefined;
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

  public constructor(private readonly viaCep: ViaCepService = new ViaCepService(),
    private readonly telegramToken = process.env.TELEGRAM_BOT_TOKEN,
    private readonly clima = new ClimaService()) {}

  public iniciar(caminho: string): void {
    if (this.conexao !== undefined) return;
    // Configuração inválida é rejeitada dentro do fluxo de inicialização tratado
    // por Aplicacao, antes de abrir ou migrar o arquivo de banco.
    const politica = PoliticaSessao.doAmbiente(), limitador = LimitadorLogin.doAmbiente();
    if (caminho !== ':memory:') mkdirSync(path.dirname(caminho), { recursive: true });
    const conexao: Conexao = new Conexao(caminho);
    try {
      new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial(), new Migracao004AvisosInternos(), new Migracao005Entregas()]).executar();
      const dados = new ConsultaAutenticacaoRepository(conexao);
      this.sessoes = new SessaoManager(politica);
      this.autorizador = new Autorizador(this.sessoes, dados);
      this.autenticacao = new AutenticacaoService({ dados, hash: new HashSenhaArgon2() }, limitador);
      this.sessaoAutenticacao = new SessaoAutenticacaoService(this.autenticacao, this.sessoes, new Autorizador(this.sessoes, dados));
      this.usuarios = new UsuarioService(new UsuarioRepository(conexao), new HashSenhaArgon2(), new Autorizador(this.sessoes, dados), this.sessoes);
      this.alunos = new AlunoService(new AlunoRepository(conexao), new Autorizador(this.sessoes, dados), this.sessoes);
      this.planos = new PlanoService(new PlanoRepository(conexao), this.autorizador, this.sessoes);
      this.instrutores = new InstrutorService(new InstrutorRepository(conexao), this.autorizador, this.sessoes);
      this.aulas = new AulaService(new AulaRepository(conexao), this.autorizador, this.sessoes);
      this.inscricoes = new InscricaoService(new InscricaoRepository(conexao), this.autorizador, this.sessoes);
      this.avaliacoes = new AvaliacaoService(new AvaliacaoRepository(conexao), this.autorizador, this.sessoes);
      const matriculas = new MatriculaRepository(conexao);
      this.pagamentos = new PagamentoService(new PagamentoRepository(conexao), matriculas, this.autorizador, this.sessoes);
      this.matriculas = new MatriculaService(matriculas, this.autorizador, this.sessoes);
      this.provisionamento = new ProvisionamentoService(new UsuarioRepository(conexao), new HashSenhaArgon2(), limitador);
      this.notificacoes = new NotificacaoRepository(conexao);
      this.avisos = new AvisosService(this.notificacoes);
      this.avisos.iniciar();
      this.entregas = EntregaService.doAmbiente(this.notificacoes, this.telegramToken);
      this.entregas.iniciar();
      this.conexao = conexao;
      this.credenciaisRelatorios = new CredenciaisRelatorios(this.sessoes);
      this.apiRelatorios = new ServidorRelatorios(
        new ConsultaRelatorioService(new RelatorioRepository(conexao), this.autorizador, this.sessoes), this.credenciaisRelatorios);
      void this.apiRelatorios.iniciar(Number(process.env.API_RELATORIOS_PORTA ?? 0));
    } catch (erro: unknown) {
      conexao.fechar();
      throw erro;
    }
  }

  public encerrar(): void {
    this.relatorioHandler?.encerrar(); this.relatorioHandler = undefined;
    this.encerrarApiRelatorios();
    this.climaHandler?.encerrar(); this.climaHandler = undefined;
    this.entregas?.encerrar();
    this.entregas = undefined;
    this.avisoHandler?.encerrar();
    this.avisoHandler = undefined;
    this.avisos?.encerrar();
    this.avisos = undefined;
    this.notificacoes = undefined;
    this.pagamentoHandler?.encerrar();
    this.pagamentoHandler = undefined;
    this.pagamentos = undefined;
    this.matriculaHandler?.encerrar();
    this.matriculaHandler = undefined;
    this.matriculas = undefined;
    this.planoHandler?.encerrar();
    this.instrutorHandler?.encerrar();
    this.aulaHandler?.encerrar();
    this.inscricaoHandler?.encerrar();
    this.avaliacaoHandler?.encerrar();
    this.planoHandler = undefined;
    this.instrutorHandler = undefined;
    this.aulaHandler = undefined;
    this.inscricaoHandler = undefined;
    this.avaliacaoHandler = undefined;
    this.planos = undefined;
    this.instrutores = undefined;
    this.aulas = undefined;
    this.inscricoes = undefined;
    this.avaliacoes = undefined;
    this.enderecoHandler?.encerrar();
    this.enderecoHandler = undefined;
    this.autorizador = undefined;
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
    if (this.pagamentos === undefined) throw new ErroAutenticacao('INTERNO');
    this.pagamentoHandler ??= new PagamentoHandler(this.pagamentos, this.handler);
    if (this.matriculas === undefined) throw new ErroAutenticacao('INTERNO');
    this.matriculaHandler ??= new MatriculaHandler(this.matriculas, this.handler);
    if (this.planos === undefined) throw new ErroAutenticacao('INTERNO');
    if (this.instrutores === undefined) throw new ErroAutenticacao('INTERNO');
    if (this.aulas === undefined) throw new ErroAutenticacao('INTERNO');
    if (this.inscricoes === undefined) throw new ErroAutenticacao('INTERNO');
    if (this.avaliacoes === undefined) throw new ErroAutenticacao('INTERNO');
    this.planoHandler ??= new PlanoHandler(this.planos, this.handler);
    this.instrutorHandler ??= new InstrutorHandler(this.instrutores, this.handler);
    this.climaHandler ??= new ClimaHandler(this.clima, this.aulas, this.handler, this.sessoes);
    this.aulaHandler ??= new AulaHandler(this.aulas, this.handler);
    this.inscricaoHandler ??= new InscricaoHandler(this.inscricoes, this.handler);
    this.avaliacaoHandler ??= new AvaliacaoHandler(this.avaliacoes, this.handler);
    if (this.autorizador === undefined) throw new ErroAutenticacao('INTERNO');
    this.relatorioHandler ??= new RelatorioHandler(new RelatorioService(contexto => this.acessoRelatorios(contexto, true),
      this.autorizador, this.sessoes), this.handler, this.sessoes);
    if (!this.entregas || !this.avisos || !this.notificacoes || !this.conexao) throw new ErroAutenticacao('INTERNO');
    this.avisoHandler ??= new AvisoHandler(this.entregas, this.avisos, this.notificacoes, this.handler, this.autorizador,
      this.sessoes, new PlanoRepository(this.conexao));
    this.enderecoHandler ??= new EnderecoHandler(this.viaCep, this.handler, this.autorizador, this.sessoes);
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

  /** Acessível somente aos componentes do Main. */
  public acessoRelatorios(contexto: ContextoSessao, reutilizar = false): {endereco:string;token:string} {
    const endereco=this.apiRelatorios?.estado().endereco;
    if(!endereco || !this.credenciaisRelatorios) throw new ErroAutenticacao('INTERNO');
    return {endereco,token:this.credenciaisRelatorios.emitir(contexto, reutilizar)};
  }

  public estadoRelatorios(): {endereco:string|null;erro:string|null} {
    return this.apiRelatorios?.estado() ?? {endereco:null,erro:'API encerrada.'};
  }

  /** Ciclo de vida interno do Main; não exposto pelo preload. */
  public encerrarApiRelatorios(): void {
    this.apiRelatorios?.encerrar(); this.apiRelatorios = undefined;
    this.credenciaisRelatorios = undefined;
  }
}
