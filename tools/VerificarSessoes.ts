import assert from 'node:assert/strict';
import type { ContextoSessao, ContratoDadosAutenticacao, IdentidadeAutenticada } from '../src/main/seguranca/ContratosAutenticacao';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';

class VerificarSessoes {
  public async executar(): Promise<void> {
    const contexto: ContextoSessao = { webContentsId: 7 };
    const sessoes = new SessaoManager();
    let atual: IdentidadeAutenticada | undefined = { id: 1, nome: 'Sintético', perfil: 'admin', ativo: true };
    let falhar = false;
    let aguardar: Promise<void> | undefined;
    const dados: ContratoDadosAutenticacao = {
      buscarPorEmail: async () => undefined,
      buscarIdentidadePorId: async () => { if (falhar) throw new Error('SEGREDO_SQL'); return atual; }
    };
    const autorizador = new Autorizador(sessoes, dados);
    const servico = new SessaoAutenticacaoService({ entrar: async () => {
      await aguardar;
      return { id: 1, nome: 'Sintético', perfil: 'admin' };
    } }, sessoes, autorizador);
    await this.erro(servico.obterSessao(contexto), 'SEM_PERMISSAO');
    await this.erro(servico.entrar({ email: 'sintetico@example.invalid', senha: 'sintetica' }, contexto), 'SEM_PERMISSAO');
    sessoes.registrar(contexto);
    assert.throws(() => sessoes.registrar(contexto));
    const entrada = { email: 'sintetico@example.invalid', senha: 'sintetica' };
    assert.equal((await servico.entrar(entrada, contexto)).id, 1);
    const interna = sessoes.obter(contexto);
    assert.ok(Object.isFrozen(interna));
    assert.deepEqual(Object.keys(interna ?? {}).sort(), ['criadaEm', 'usuarioId']);
    assert.notEqual(interna?.criadaEm, undefined);
    assert.equal(Number.isNaN(Date.parse(interna?.criadaEm ?? '')), false);
    atual = { id: 1, nome: 'Atualizado', perfil: 'instrutor', ativo: true };
    assert.deepEqual(await servico.obterSessao(contexto), { id: 1, nome: 'Atualizado', perfil: 'instrutor' });
    await this.erro(autorizador.exigirPerfil(contexto, []), 'SEM_PERMISSAO');
    await this.erro(autorizador.exigirPerfil(contexto, ['admin']), 'SEM_PERMISSAO');
    atual = { ...atual, ativo: false };
    await this.erro(servico.obterSessao(contexto), 'NAO_AUTENTICADO');
    assert.equal(sessoes.obter(contexto), undefined);
    atual = { ...atual, ativo: true };
    await servico.entrar(entrada, contexto);
    servico.sair(contexto);
    await this.erro(servico.obterSessao(contexto), 'NAO_AUTENTICADO');
    assert.throws(() => servico.sair(contexto), (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'NAO_AUTENTICADO');
    for (const invalidar of [() => servico.sair(contexto), () => sessoes.remover(contexto), () => sessoes.encerrarTodas()]) {
      let liberar: (() => void) | undefined;
      aguardar = new Promise<void>((resolve) => { liberar = resolve; });
      const pendente = servico.entrar(entrada, contexto);
      await this.erro(servico.entrar(entrada, contexto), 'SEM_PERMISSAO');
      try { invalidar(); } catch (e: unknown) { assert.ok(e instanceof ErroAutenticacao); }
      liberar?.();
      await this.erro(pendente, 'NAO_AUTENTICADO');
      assert.equal(sessoes.obter(contexto), undefined);
      sessoes.remover(contexto);
      sessoes.registrar(contexto);
    }
    aguardar = undefined;
    await servico.entrar(entrada, contexto);
    falhar = true;
    await this.erro(servico.obterSessao(contexto), 'INTERNO');
    assert.equal(sessoes.obter(contexto), undefined);
    falhar = false;
    await servico.entrar(entrada, contexto);
    const consultaPendente = servico.obterSessao(contexto);
    servico.sair(contexto);
    await this.erro(consultaPendente, 'NAO_AUTENTICADO');
    await servico.entrar(entrada, contexto);
    atual = undefined;
    await this.erro(servico.obterSessao(contexto), 'NAO_AUTENTICADO');
    await this.erro(servico.obterSessao({ webContentsId: -1 }), 'VALIDACAO');
    sessoes.encerrarTodas();
    console.log('OK: sessões, DTOs mínimos, perfil atual, conta inativa/excluída, logout, contexto inválido, concorrência, cancelamento e falhas internas.');
  }

  private async erro(promessa: Promise<unknown>, codigo: string): Promise<void> {
    await assert.rejects(promessa, (erro: unknown): boolean => {
      assert.ok(erro instanceof ErroAutenticacao);
      assert.equal(erro.codigo, codigo);
      assert.equal(JSON.stringify(erro.paraPublico()).includes('SEGREDO'), false);
      return true;
    });
  }
}

void new VerificarSessoes().executar().catch((erro: unknown): void => {
  console.error(erro instanceof Error ? erro.message : 'Falha nos testes sintéticos de sessão.');
  process.exitCode = 1;
});
