import type { ContextoMigracao, Migracao } from '../Migracao';

export class Migracao001EstruturaInicial implements Migracao {
  public readonly versao: number = 1;
  public readonly nome: string = 'estrutura_inicial';

  public aplicar(conexao: ContextoMigracao): undefined {
    // Fragmentos internos constantes; não recebem identificadores ou dados do usuário.
    const auditoria: string = 'criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL';
    conexao.executarEstrutura(`
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
        senha_hash TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'recepcao', 'instrutor')),
        ativo INTEGER NOT NULL CHECK (ativo IN (0, 1)),
        ${auditoria}
      ) STRICT;
      CREATE TABLE alunos (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        cpf TEXT NOT NULL UNIQUE CHECK (length(cpf) = 11 AND cpf NOT GLOB '*[^0-9]*'),
        data_nascimento TEXT NOT NULL ${this.dataCivil('data_nascimento')},
        email TEXT,
        telefone TEXT,
        cep TEXT NOT NULL,
        logradouro TEXT NOT NULL,
        numero TEXT NOT NULL,
        complemento TEXT,
        bairro TEXT NOT NULL,
        cidade TEXT NOT NULL,
        uf TEXT NOT NULL,
        telegram_chat_id TEXT UNIQUE,
        autorizado_notificar_em TEXT,
        ativo INTEGER NOT NULL CHECK (ativo IN (0, 1)),
        ${auditoria}
      ) STRICT;
      CREATE TABLE planos (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        duracao_meses INTEGER NOT NULL CHECK (duracao_meses IN (1, 3, 12)),
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
        ativo INTEGER NOT NULL CHECK (ativo IN (0, 1)),
        ${auditoria}
      ) STRICT;
      CREATE TABLE matriculas (
        id INTEGER PRIMARY KEY,
        aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
        plano_id INTEGER NOT NULL REFERENCES planos(id) ON DELETE RESTRICT,
        data_inicio TEXT NOT NULL ${this.dataCivil('data_inicio')},
        data_fim TEXT NOT NULL ${this.dataCivil('data_fim')},
        valor_contratado_centavos INTEGER NOT NULL CHECK (valor_contratado_centavos >= 0),
        situacao TEXT NOT NULL CHECK (situacao IN ('ativa', 'cancelada', 'encerrada')),
        ${auditoria},
        CHECK (data_fim >= data_inicio)
      ) STRICT;
      CREATE TABLE pagamentos (
        id INTEGER PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE RESTRICT,
        competencia TEXT NOT NULL CHECK (
          competencia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(competencia, 6, 2) BETWEEN '01' AND '12'
        ),
        data_vencimento TEXT NOT NULL ${this.dataCivil('data_vencimento')},
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
        pago_em TEXT,
        forma_pagamento TEXT CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'transferencia')),
        situacao TEXT NOT NULL CHECK (situacao IN ('pendente', 'pago', 'cancelado')),
        ${auditoria},
        UNIQUE (matricula_id, competencia),
        CHECK (situacao <> 'pago' OR (pago_em IS NOT NULL AND forma_pagamento IS NOT NULL))
      ) STRICT;
      CREATE TABLE instrutores (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL,
        telefone TEXT NOT NULL,
        especialidade TEXT NOT NULL,
        ativo INTEGER NOT NULL CHECK (ativo IN (0, 1)),
        ${auditoria}
      ) STRICT;
      CREATE TABLE aulas (
        id INTEGER PRIMARY KEY,
        instrutor_id INTEGER NOT NULL REFERENCES instrutores(id) ON DELETE RESTRICT,
        modalidade TEXT NOT NULL CHECK (modalidade IN ('musculacao', 'funcional', 'danca')),
        inicio_em TEXT NOT NULL,
        fim_em TEXT NOT NULL,
        capacidade INTEGER NOT NULL CHECK (capacidade > 0),
        ao_ar_livre INTEGER NOT NULL CHECK (ao_ar_livre IN (0, 1)),
        local TEXT NOT NULL,
        latitude REAL CHECK (latitude BETWEEN -90 AND 90),
        longitude REAL CHECK (longitude BETWEEN -180 AND 180),
        situacao TEXT NOT NULL CHECK (situacao IN ('agendada', 'cancelada', 'concluida')),
        ${auditoria},
        CHECK (julianday(inicio_em) IS NOT NULL AND julianday(fim_em) IS NOT NULL AND julianday(fim_em) > julianday(inicio_em)),
        CHECK (ao_ar_livre = 0 OR (latitude IS NOT NULL AND longitude IS NOT NULL))
      ) STRICT;
      CREATE TABLE inscricoes_aula (
        id INTEGER PRIMARY KEY,
        aula_id INTEGER NOT NULL REFERENCES aulas(id) ON DELETE RESTRICT,
        aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
        situacao TEXT NOT NULL CHECK (situacao IN ('ativa', 'cancelada')),
        presenca TEXT NOT NULL CHECK (presenca IN ('nao_registrada', 'presente', 'ausente')),
        ${auditoria},
        UNIQUE (aula_id, aluno_id)
      ) STRICT;
      CREATE TABLE avaliacoes_fisicas (
        id INTEGER PRIMARY KEY,
        aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
        instrutor_id INTEGER NOT NULL REFERENCES instrutores(id) ON DELETE RESTRICT,
        realizada_em TEXT NOT NULL,
        peso_kg REAL NOT NULL CHECK (peso_kg > 0),
        altura_cm REAL NOT NULL CHECK (altura_cm > 0),
        cintura_cm REAL CHECK (cintura_cm > 0),
        quadril_cm REAL CHECK (quadril_cm > 0),
        braco_cm REAL CHECK (braco_cm > 0),
        coxa_cm REAL CHECK (coxa_cm > 0),
        observacoes TEXT,
        ${auditoria}
      ) STRICT;
      CREATE TABLE notificacoes (
        id INTEGER PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE RESTRICT,
        tipo TEXT NOT NULL CHECK (tipo = 'vencimento_plano'),
        canal TEXT NOT NULL,
        chave_deduplicacao TEXT NOT NULL UNIQUE,
        agendada_para TEXT NOT NULL,
        enviada_em TEXT,
        situacao TEXT NOT NULL CHECK (situacao IN ('pendente', 'processando', 'enviada', 'falhou', 'cancelada')),
        tentativas INTEGER NOT NULL CHECK (tentativas >= 0),
        proxima_tentativa_em TEXT,
        mensagem_id_externo TEXT,
        erro_codigo TEXT,
        ${auditoria}
      ) STRICT;
      CREATE INDEX idx_matriculas_aluno ON matriculas(aluno_id);
      CREATE INDEX idx_matriculas_plano ON matriculas(plano_id);
      CREATE INDEX idx_matriculas_fim ON matriculas(data_fim);
      CREATE INDEX idx_pagamentos_vencimento ON pagamentos(data_vencimento);
      CREATE INDEX idx_aulas_instrutor ON aulas(instrutor_id);
      CREATE INDEX idx_aulas_inicio ON aulas(inicio_em);
      CREATE INDEX idx_inscricoes_aluno ON inscricoes_aula(aluno_id);
      CREATE INDEX idx_avaliacoes_aluno_data ON avaliacoes_fisicas(aluno_id, realizada_em);
      CREATE INDEX idx_avaliacoes_instrutor ON avaliacoes_fisicas(instrutor_id);
      CREATE INDEX idx_notificacoes_matricula ON notificacoes(matricula_id);
    `);
  }

  private dataCivil(coluna: string): string {
    return `CHECK (length(${coluna}) = 10 AND ${coluna} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(${coluna}, '+0 days') IS NOT NULL AND date(${coluna}, '+0 days') = ${coluna})`;
  }
}
