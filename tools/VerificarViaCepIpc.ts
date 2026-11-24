import assert from 'node:assert/strict';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { Composicao } from '../src/main/Composicao';
import { Conexao } from '../src/database/Conexao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { ViaCepService } from '../src/services/ViaCepService';
import { TransporteViaCepTeste } from './TransporteViaCepTeste';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';
import type { EnderecoDto } from '../src/shared/tipos/Endereco';

class VerificarViaCepIpc {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica apenas ViaCEP';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-cep-ipc-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const transporte = new TransporteViaCepTeste(), composicao = new Composicao(new ViaCepService(transporte.requisitar, 1000));
    let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1), 60000);
    app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const a = await this.abrir(composicao), r = await this.abrir(composicao), i = await this.abrir(composicao), semSessao = await this.abrir(composicao);
      await this.login(a, 'admin'); await this.login(r, 'recepcao'); await this.login(i, 'instrutor');
      const naoVinculada = await new JanelaPrincipal().abrir(false); this.janelas.push(naoVinculada);
      for (const [janela, codigo] of [[i,'SEM_PERMISSAO'], [semSessao,'NAO_AUTENTICADO'], [naoVinculada,'SEM_PERMISSAO']] as const) this.falha(await this.consultar(janela, { cep: '01001000' }), codigo);
      this.falha(await this.consultar(a, { cep: 'invalido' }), 'VALIDACAO');
      this.falha(await this.consultar(a, { cep: '01001000', url: 'https://example.invalid' }), 'VALIDACAO');
      assert.equal(transporte.chamadas, 0);
      for (const janela of [a,r]) {
        const resposta = await this.consultar(janela, { cep: '01001-000' }); assert.equal(resposta.sucesso, true);
        if (resposta.sucesso) assert.deepEqual(resposta.dados, { cep: '01001000', logradouro: 'Praça sintética', bairro: 'Bairro sintético', cidade: 'São Paulo', uf: 'SP' });
      }
      for (const [cenario, codigo] of [['inexistente','NAO_ENCONTRADO'], ['rede','REDE'], ['timeout','REDE'], ['indisponivel','REDE']] as const) {
        transporte.cenario = cenario; this.falha(await this.consultar(a, { cep: '01001000' }), codigo);
      }
      assert.deepEqual(await a.webContents.executeJavaScript(`({metodos:Object.keys(window.academia.endereco),congelada:Object.isFrozen(window.academia.endereco),invoke:typeof window.academia.invoke,require:typeof window.require})`),
        { metodos: ['consultarCep'], congelada: true, invoke: 'undefined', require: 'undefined' });
      console.log('OK ViaCEP IPC: origem, sessão, perfis, validação antes de HTTP, DTO, erros sanitizados e ponte específica com isolamento.');

      for (const alteracao of ['logout', 'perfil', 'credencial'] as const) {
        transporte.cenario = 'pendente';
        const iniciou = new Promise<void>(resolver => { transporte.iniciou = resolver; });
        const pendente = this.consultar(a, { cep: '01001000' }); await iniciou;
        if (alteracao === 'logout') await a.webContents.executeJavaScript('window.academia.autenticacao.sair()');
        else if (alteracao === 'perfil') usuarios.update(1, { perfil: 'instrutor' });
        else usuarios.update(1, { senha_hash: await new HashSenhaArgon2().gerar(this.senha) });
        transporte.liberar?.(); this.falha(await pendente, alteracao === 'perfil' ? 'SEM_PERMISSAO' : 'NAO_AUTENTICADO');
        usuarios.update(1, { perfil: 'admin' }); await this.login(a, 'admin');
      }
      transporte.cenario = 'pendente';
      const iniciou = new Promise<void>(resolver => { transporte.iniciou = resolver; });
      const encerrada = this.consultar(a, { cep: '01001000' }); await iniciou;
      composicao.encerrar(); transporte.liberar?.(); this.falha(await encerrada, 'SEM_PERMISSAO');
      assert.equal(banco.preparar<[], { total: number }>('SELECT COUNT(*) AS total FROM alunos').get()?.total, 0);
      console.log('OK ViaCEP IPC: logout/perda de perfil/redefinição durante HTTP e encerramento impedem resposta tardia; consultas não gravam alunos.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar();
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome, /^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta,nome)); }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async abrir(composicao: Composicao): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false,(j,url) => composicao.vincularJanela(j,url)); this.janelas.push(janela); return janela;
  }
  private async login(janela: BrowserWindow, perfil: string): Promise<void> {
    const resposta = await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: `${perfil}@example.invalid`, senha: this.senha })})`);
    assert.equal(resposta.sucesso,true);
  }
  private async consultar(janela: BrowserWindow, entrada: unknown): Promise<Resultado<EnderecoDto>> {
    return janela.webContents.executeJavaScript(`window.academia.endereco.consultarCep(${JSON.stringify(entrada)})`) as Promise<Resultado<EnderecoDto>>;
  }
  private falha(resposta: Resultado<unknown>, codigo: string): void {
    assert.equal(resposta.sucesso,false); if (resposta.sucesso) throw new Error('Esperada recusa.');
    assert.equal(resposta.erro.codigo,codigo); assert.doesNotMatch(resposta.erro.mensagem,/DETALHE_INTERNO|SELECT|stack/);
  }
}
void new VerificarViaCepIpc().executar().catch(erro => { console.error(erro); app.exit(1); });
