import assert from 'node:assert/strict';
import { app } from 'electron';
import { Composicao } from '../src/main/Composicao';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { VerificarAutenticacao } from './VerificarAutenticacao';

/** Exercita o módulo nativo de hash e o SQLite no runtime real do aplicativo. */
class VerificarAutenticacaoBanco {
  public async executar(): Promise<void> {
    const limite = setTimeout((): void => app.exit(1), 60000);
    const composicao = new Composicao();
    let conexao: Conexao | undefined;
    try {
      await app.whenReady();
      await new VerificarAutenticacao().executar();
      conexao = new Conexao(':memory:');
      new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const hash = new HashSenhaArgon2();
      const senha = 'Senha sintética de integração 🔒';
      const digest = await hash.gerar(senha);
      const instante = '2026-11-13T12:00:00.000Z';
      const insercao = conexao.preparar<[string, string, string, string, number, string, string], never>(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      insercao.run('Pessoa', 'pessoa@example.invalid', digest, 'admin', 1, instante, instante);
      insercao.run('Inativa', 'inativa@example.invalid', digest, 'instrutor', 0, instante, instante);
      const dados = new ConsultaAutenticacaoRepository(conexao);
      const servico = new AutenticacaoService({ dados, hash });
      assert.equal((await dados.buscarPorEmail('pessoa@example.invalid'))?.senhaHash, digest);
      const identidadeConta = conexao.preparar<[], { identidade_conta: string }>('SELECT identidade_conta FROM usuarios WHERE id = 1').get()?.identidade_conta;
      assert.match(identidadeConta ?? '', /^[0-9a-f]{32}$/);
      assert.deepEqual(await dados.buscarIdentidadePorId(1), { id: 1, nome: 'Pessoa', perfil: 'admin', ativo: true, identidadeConta, versaoCredencial: 1 });
      assert.equal(await dados.buscarPorEmail("' OR 1=1 --"), undefined);
      assert.equal(await dados.buscarIdentidadePorId(9999), undefined);
      const saida = await servico.entrar({ email: ' PESSOA@EXAMPLE.INVALID ', senha }, { webContentsId: 1 });
      assert.deepEqual(saida, { id: 1, nome: 'Pessoa', perfil: 'admin' });
      assert.deepEqual(Object.keys(saida).sort(), ['id', 'nome', 'perfil']);
      for (const email of ['inativa@example.invalid', 'ausente@example.invalid']) {
        await assert.rejects(servico.entrar({ email, senha }, { webContentsId: 1 }), (erro: unknown): boolean =>
          erro instanceof ErroAutenticacao && erro.codigo === 'NAO_AUTENTICADO');
      }
      for (const generica of [(): unknown => dados.create(), (): unknown => dados.update(),
        (): unknown => dados.delete(), (): unknown => dados.findById(), (): unknown => dados.findAll()]) {
        assert.throws(generica);
      }
      const persistido = conexao.preparar<[], { senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = 1').get();
      assert.equal(persistido?.senha_hash, digest);
      assert.deepEqual(conexao.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      composicao.iniciar(':memory:');
      await assert.rejects(composicao.obterAutenticacao().entrar({ email: 'ausente@example.invalid', senha }, { webContentsId: 2 }),
        (erro: unknown): boolean => erro instanceof ErroAutenticacao && erro.codigo === 'NAO_AUTENTICADO');
      composicao.encerrar();
      assert.throws((): unknown => composicao.obterAutenticacao());
      conexao.fechar();
      await assert.rejects(servico.entrar({ email: 'pessoa@example.invalid', senha }, { webContentsId: 1 }),
        (erro: unknown): boolean => erro instanceof ErroAutenticacao && erro.codigo === 'INTERNO');
      console.log(`OK: Argon2id e SQLite no Main Electron ${process.versions.electron}/Node ${process.versions.node}; projeções, SQL parametrizado, conta inativa, falha de banco e composição. Somente :memory:.`);
      clearTimeout(limite);
      app.exit(0);
    } catch {
      composicao.encerrar();
      conexao?.fechar();
      clearTimeout(limite);
      console.error('FALHA: integração da autenticação no Electron. Detalhes sensíveis omitidos.');
      app.exit(1);
    }
  }
}

void new VerificarAutenticacaoBanco().executar();
