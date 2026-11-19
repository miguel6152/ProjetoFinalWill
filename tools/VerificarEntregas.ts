import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { Migracao004AvisosInternos } from '../src/database/migrations/Migracao004AvisosInternos';
import { Migracao005Entregas } from '../src/database/migrations/Migracao005Entregas';
import { NotificacaoRepository } from '../src/repositories/NotificacaoRepository';
import { AvisosService } from '../src/services/AvisosService';
import { EntregaService } from '../src/services/EntregaService';
import { TelegramCliente } from '../src/services/TelegramCliente';

class VerificarEntregas {
  public static async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-entregas-')), arquivo = path.join(pasta,'teste.sqlite3');
    const db = new Conexao(arquivo), outra = new Conexao(arquivo);
    try {
      new Migrador(db,[new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial(),
        new Migracao004AvisosInternos(), new Migracao005Entregas()]).executar();
      db.executarEstrutura(`INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em)
        VALUES ('Teste',1,10000,1,'UTC','UTC');
        INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em)
        VALUES ('Pessoa sintética','00000000001','2000-01-01','00000000','Rua','1','Centro','São Paulo','SP',1,'UTC','UTC');`);
      let agora = new Date('2027-01-02T12:00:00Z');
      const repo = new NotificacaoRepository(db), repo2 = new NotificacaoRepository(outra);
      const avisos = new AvisosService(repo);
      const novo = () => {
        db.executarEstrutura(`INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
          VALUES (1,1,'2027-01-01','2027-01-05',10000,'ativa','UTC','UTC')`);
        assert.equal(avisos.verificar(agora).criados,1);
        return db.preparar<[],{id:number}>('SELECT MAX(id) AS id FROM notificacoes').get()!.id;
      };
      let chamadas = 0;
      const resposta = (status: number, dados: unknown) => new Response(JSON.stringify(dados), {status});
      const sucesso = () => resposta(200,{ ok:true,result:{ message_id:17,chat:{ id:123,type:'private' } } });
      let transporte: typeof fetch = async () => sucesso();
      const cliente = new TelegramCliente('1:TESTE', async (url,op) => {
        chamadas++;
        assert.equal(new URL(String(url)).hostname,'api.telegram.org');
        assert.equal(op?.method,'POST');
        assert.equal(op.redirect,'error');
        assert.deepEqual(JSON.parse(String(op.body)), {chat_id:'123', text:'Academia: a vigência do seu plano termina em 05/01/2027.'});
        return transporte(url,op);
      },5000);
      const criarFila = (repositorio: NotificacaoRepository, modo: 'telegram'|'simulado'='telegram', bot=cliente) =>
        new EntregaService(repositorio,modo,bot,false,() => agora);
      const fila = criarFila(repo), paralelo = criarFila(repo2), simulador = criarFila(repo,'simulado');
      const id = novo();
      assert.match(fila.consultar(id).motivo,/sem vínculo/);
      repo.alterarPreferencia({ id:1,chat:'123',autorizar:false },agora.toISOString());
      assert.match(fila.consultar(id).motivo,/sem autorização/);
      repo.alterarPreferencia({ id:1,chat:'123',autorizar:true },agora.toISOString());
      const semToken = criarFila(repo,'telegram',new TelegramCliente(undefined));
      assert.match(semToken.consultar(id).motivo,/Token/);
      await semToken.processar(id,true,'telegram');
      assert.equal(repo.historico(id).length,0);
      await simulador.processar(id,true,'simulado');
      assert.equal(chamadas,0);
      assert.equal(fila.consultar(id).estado,'simulado');
      await fila.processar(id,true,'telegram');
      assert.equal(chamadas,0);
      assert.equal(repo.findById(id)?.enviada_em,null);

      const duplo = novo();
      let liberar!: (r: Response) => void;
      const porta = new Promise<Response>(resolver => { liberar = resolver; });
      transporte = () => porta;
      const primeiro = fila.processar(duplo,true,'telegram');
      await paralelo.processar(duplo,true,'telegram');
      assert.equal(paralelo.consultar(duplo).estado,'processando');
      assert.equal(chamadas,1);
      liberar(sucesso());
      await primeiro;
      assert.equal(repo.historico(duplo)[0]?.mensagem_id,'17');
      assert.equal(repo.findById(duplo)?.situacao,'enviada');

      const limitado = novo(), outro = novo();
      transporte = async () => resposta(429,{ok:false,error_code:429,parameters:{retry_after:90}});
      await fila.processar(limitado,true,'telegram');
      assert.equal(repo.historico(limitado)[0]?.proxima,'2027-01-02T12:01:30.000Z');
      await paralelo.processar(outro,true,'telegram');
      assert.equal(repo.historico(outro).length,0);
      agora = new Date('2027-01-02T12:01:30.000Z');
      transporte = async () => resposta(503,{ok:false,error_code:503});
      await fila.processar(limitado,false,'telegram');
      assert.equal(repo.historico(limitado)[0]?.proxima,'2027-01-02T12:03:30.000Z');
      agora = new Date('2027-01-02T12:03:30.000Z');
      await fila.processar(limitado,false,'telegram');
      assert.equal(fila.consultar(limitado).pode_processar,false);

      transporte = async () => resposta(403,{ok:false,error_code:403});
      await fila.processar(outro,true,'telegram');
      assert.match(fila.consultar(outro).motivo,/bloqueado/);
      await fila.processar(outro,false,'telegram');
      assert.equal(repo.historico(outro).length,1);
      transporte = async () => sucesso();
      await fila.processar(outro,true,'telegram');
      assert.equal(fila.consultar(outro).estado,'enviado');
      for (const defeito of [async () => resposta(200,{ok:true}),async () => new Response('resposta incompleta')]) {
        const incerto = novo(); transporte = defeito;
        await fila.processar(incerto,true,'telegram');
        assert.equal(fila.consultar(incerto).estado,'incerto');
        await fila.processar(incerto,true,'telegram');
        assert.equal(repo.historico(incerto).length,1);
      }
      const timeout = novo();
      const lento = new TelegramCliente('1:TESTE',(_,op) => new Promise<Response>((_,rejeitar) => {
        const guarda = setTimeout(() => rejeitar(new Error('Timeout do teste')),1000);
        op!.signal!.addEventListener('abort',() => { clearTimeout(guarda); rejeitar(op!.signal!.reason); },{once:true});
      }),10);
      await criarFila(repo,'telegram',lento).processar(timeout,true,'telegram');
      assert.equal(fila.consultar(timeout).estado,'incerto');
      const interrompido = novo();
      repo.transacao(() => repo.iniciarTentativa(interrompido,1,'telegram',agora.toISOString()));
      repo2.recuperar(agora);
      assert.equal(paralelo.consultar(interrompido).estado,'processando');
      agora = new Date(agora.getTime()+120001);
      repo2.recuperar(agora);
      assert.equal(paralelo.consultar(interrompido).estado,'incerto');
      assert.equal(paralelo.consultar(interrompido).pode_processar,false);
      const cancelado = novo();
      db.preparar<[number],never>("UPDATE matriculas SET situacao='cancelada' WHERE id=(SELECT matricula_id FROM notificacoes WHERE id=?)").run(cancelado);
      await fila.processar(cancelado,true,'telegram');
      assert.equal(repo.historico(cancelado).length,0);
      const revogado = novo();
      repo.alterarPreferencia({id:1,chat:null,autorizar:false},agora.toISOString());
      await fila.processar(revogado,true,'telegram');
      assert.equal(repo.historico(revogado).length,0);
      repo.alterarPreferencia({id:1,chat:'123',autorizar:true},agora.toISOString());
      const automatico = novo();
      const filaAuto = new EntregaService(repo, 'simulado', cliente, true, () => agora);
      const antes = chamadas;
      filaAuto.iniciar();
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(filaAuto.consultar(automatico).estado, 'simulado');
        assert.equal(chamadas, antes);
      } finally { filaAuto.encerrar(); }
      assert.deepEqual(db.preparar<[],unknown>('PRAGMA foreign_key_check').all(),[]);
      console.log('OK: elegibilidade, confirmação, simulação, concorrência, limites, backoff, timeout, interrupção, revogação e histórico.');
    } finally { outra.fechar(); db.fechar(); rmSync(pasta,{recursive:true,force:true}); }
  }
}
void VerificarEntregas.executar().catch(erro => { console.error(erro); process.exitCode=1; });
