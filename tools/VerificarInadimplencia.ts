import assert from 'node:assert/strict';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { Migracao004AvisosInternos } from '../src/database/migrations/Migracao004AvisosInternos';
import { Migracao005Entregas } from '../src/database/migrations/Migracao005Entregas';
import { Migracao006AuditoriaPagamentos } from '../src/database/migrations/Migracao006AuditoriaPagamentos';
import { PagamentoRepository } from '../src/repositories/PagamentoRepository';
import { InadimplenciaService } from '../src/services/InadimplenciaService';
import type { FiltroInadimplencia } from '../src/shared/tipos/Inadimplencia';

class VerificarInadimplencia {
  public executar(): void {
    const banco = new Conexao(':memory:');
    try {
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(),
        new Migracao003VersaoCredencial(), new Migracao004AvisosInternos(), new Migracao005Entregas(),
        new Migracao006AuditoriaPagamentos()]).executar();
      banco.preparar<[], never>(`INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo,criado_em,atualizado_em)
        VALUES ('Admin','admin@example.invalid','hash-sintetico','admin',1,'UTC','UTC')`).run();
      banco.executarEstrutura(`
        INSERT INTO planos (id,nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em)
        VALUES (1,'Mensal',1,10000,1,'UTC','UTC');
      `);
      const aluno = banco.preparar<[string, string], never>(`INSERT INTO alunos
        (nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em)
        VALUES (?,?,'2000-01-01','01001000','Rua','1','Centro','São Paulo','SP',1,'UTC','UTC')`);
      aluno.run('Ana Silva', '00000000001');
      aluno.run('Bia Lima', '00000000002');
      aluno.run('Caio Luz', '00000000003');
      const matricula = banco.preparar<[number, string], never>(`INSERT INTO matriculas
        (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
        VALUES (?,1,'2025-01-01','2025-12-31',10000,?,'UTC','UTC')`);
      matricula.run(1, 'encerrada');
      matricula.run(1, 'cancelada');
      matricula.run(2, 'ativa');
      matricula.run(3, 'ativa');
      const pagamentos = new PagamentoRepository(banco);
      const criar = (matricula_id: number, competencia: string, data_vencimento: string, valor_centavos: number,
        situacao: 'pago' | 'cancelado' | 'pendente' = 'pendente') => {
        const pagamento = pagamentos.create({ matricula_id, competencia, data_vencimento, valor_centavos,
          situacao: situacao === 'cancelado' ? 'pendente' : situacao,
          pago_em: situacao === 'pago' ? '2025-12-31T00:00:00Z' : null,
          forma_pagamento: situacao === 'pago' ? 'pix' : null,
          cancelado_em: null, motivo_cancelamento: null, cancelado_por: null });
        if (situacao !== 'cancelado') return pagamento;
        assert.ok(pagamentos.cancelarPendente(pagamento.id, pagamento.atualizado_em, 'Cancelamento de teste.', 1));
        const cancelado = pagamentos.findById(pagamento.id);
        assert.ok(cancelado);
        return cancelado;
      };
      const primeira = criar(1, '2025-11', '2025-11-30', 10000);
      const segunda = criar(2, '2025-12', '2025-12-31', 15000);
      criar(3, '2026-01', '2026-01-01', 10000);
      criar(3, '2026-02', '2026-01-02', 15000);
      criar(3, '2025-10', '2025-10-01', 10000, 'pago');
      criar(3, '2025-11', '2025-11-01', 10000, 'cancelado');
      criar(3, '2025-12', '2025-12-01', 0);
      const servico = new InadimplenciaService(pagamentos);
      const virada = new Date('2026-01-01T03:00:00Z');
      const consultar = (filtro: Partial<FiltroInadimplencia> = {}) => servico.consultar({ ordem: 'atraso', ...filtro }, virada);
      const antes = servico.consultar({ ordem: 'atraso' }, new Date('2026-01-01T02:59:59Z'));
      assert.equal(antes.data_referencia, '2025-12-31');
      assert.equal(antes.total_centavos, 10000);
      const resumo = consultar();
      assert.equal(resumo.data_referencia, '2026-01-01');
      assert.equal(resumo.quantidade_alunos, 1);
      assert.equal(resumo.total_centavos, 25000);
      const [ana] = resumo.alunos;
      assert.ok(ana);
      assert.equal(ana.quantidade, 2);
      assert.equal(ana.vencimento_mais_antigo, '2025-11-30');
      assert.deepEqual(ana.mensalidades.map(p => [p.id, p.dias_atraso]), [[primeira.id, 32], [segunda.id, 1]]);
      assert.equal(ana.mensalidades.reduce((s, p) => s + p.valor_centavos, 0), ana.total_centavos);
      assert.equal(ana.total_centavos, resumo.total_centavos);
      assert.equal(consultar({ inicio: '2025-12-31', fim: '2025-12-31', busca: 'silva' }).total_centavos, 15000);
      assert.equal(consultar({ busca: '2' }).quantidade_alunos, 0);
      assert.equal(consultar({ busca: 'Caio' }).quantidade_alunos, 0);
      criar(4, '2025-12', '2025-12-20', 30000);
      assert.deepEqual(consultar().alunos.map(a => a.aluno_id), [1, 3]);
      assert.deepEqual(consultar({ ordem: 'valor' }).alunos.map(a => a.aluno_id), [3, 1]);
      assert.ok(pagamentos.quitar({ id: primeira.id, data: '2026-01-01', forma_pagamento: 'pix' }));
      assert.equal(consultar({ busca: '1' }).total_centavos, 15000);
      assert.ok(pagamentos.quitar({ id: segunda.id, data: '2026-01-01', forma_pagamento: 'pix' }));
      assert.equal(consultar({ busca: '1' }).quantidade_alunos, 0);
      console.log('OK: virada civil em São Paulo, ontem/hoje/amanhã, históricos, filtros, ordenação, totais e quitação.');
    } finally { banco.fechar(); }
  }
}
new VerificarInadimplencia().executar();
