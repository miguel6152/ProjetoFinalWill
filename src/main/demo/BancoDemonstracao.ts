import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, linkSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import Database = require('better-sqlite3');
import argon2 from 'argon2';
import { Conexao } from '../../database/Conexao';
import { Migrador } from '../../database/Migrador';
import { Migracao001EstruturaInicial } from '../../database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../../database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../../database/migrations/Migracao003VersaoCredencial';
import { Migracao004AvisosInternos } from '../../database/migrations/Migracao004AvisosInternos';
import { Migracao005Entregas } from '../../database/migrations/Migracao005Entregas';
import { Migracao006AuditoriaPagamentos } from '../../database/migrations/Migracao006AuditoriaPagamentos';

export const ARQUIVO_DEMO = 'academia-demo.sqlite3';
export const EMAIL_ADMIN_DEMO = 'administrador.demo@example.invalid';

/** Cria exclusivamente um banco novo; nunca abre o banco de produção. */
export class BancoDemonstracao {
  public static async preparar(diretorio: string, senha: string): Promise<'criado' | 'ja-preparado'> {
    const destino = path.join(path.resolve(diretorio), ARQUIVO_DEMO);
    const producao = path.join(path.dirname(destino), 'academia.sqlite3');
    if (path.resolve(destino).toLowerCase() === path.resolve(producao).toLowerCase()) throw new Error('Caminho de demonstração inválido.');
    mkdirSync(path.dirname(destino), { recursive: true });
    if (existsSync(destino)) {
      const db = new Database(destino, { readonly: true, fileMustExist: true });
      try {
        const marcador = db.prepare('SELECT email FROM usuarios WHERE perfil=?').get('admin') as { email: string } | undefined;
        if (marcador?.email !== EMAIL_ADMIN_DEMO) throw new Error('Já existe um banco demo não reconhecido; nada foi alterado.');
        const tabelas = ['alunos','instrutores','planos','matriculas','pagamentos','aulas','inscricoes_aula','avaliacoes_fisicas','notificacoes'] as const;
        const esperadas = [15,5,5,15,15,6,24,20,3];
        for (const [i, tabela] of tabelas.entries()) {
          const quantidade = db.prepare(`SELECT count(*) AS total FROM ${tabela}`).get() as { total: number };
          if (quantidade.total !== esperadas[i]) throw new Error('Banco demo incompleto; nada foi alterado.');
        }
        if ((db.pragma('foreign_key_check') as unknown[]).length !== 0) throw new Error('Banco demo com vínculos inválidos; nada foi alterado.');
        return 'ja-preparado';
      } finally { db.close(); }
    }
    const pastaTemporaria = mkdtempSync(path.join(path.dirname(destino), '.demo-preparacao-'));
    const temporario = path.join(pastaTemporaria, ARQUIVO_DEMO);
    try {
      await this.criar(temporario, senha);
      // linkSync é criação exclusiva: se outro processo vencer a corrida, não sobrescreve seu arquivo.
      linkSync(temporario, destino);
      return 'criado';
    } finally { rmSync(pastaTemporaria, { recursive: true, force: true }); }
  }

  private static async criar(caminho: string, senha: string): Promise<void> {
    const conexao = new Conexao(caminho);
    try {
      new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial(),
        new Migracao004AvisosInternos(), new Migracao005Entregas(), new Migracao006AuditoriaPagamentos()]).executar();
      const agora = new Date(), instante = agora.toISOString(), hoje = this.civil(agora);
      const hash = await argon2.hash(senha, { type: argon2.argon2id });
      const hashesInstrutores = await Promise.all(Array.from({ length: 5 }, () =>
        argon2.hash(randomBytes(32).toString('base64url'), { type: argon2.argon2id })));
      conexao.transacao(() => {
        const usuario = conexao.preparar<[string,string,string,string,string,string,number], { lastInsertRowid: number }>(
          'INSERT INTO usuarios(nome,email,senha_hash,perfil,criado_em,atualizado_em,ativo) VALUES(?,?,?, ?,?,?,?)'
        );
        const adminId = Number(usuario.run('Administrador da demonstração', EMAIL_ADMIN_DEMO, hash, 'admin', instante, instante, 1).lastInsertRowid);
        const instrutores: number[] = [];
        for (let i=0;i<5;i++) {
          const id = Number(usuario.run(`Instrutor Demo ${i+1}`, `instrutor${i+1}@example.invalid`, hashesInstrutores[i]!, 'instrutor', instante, instante, 1).lastInsertRowid);
          conexao.preparar<[number,string,string,string,string,number,string,string], never>(
            'INSERT INTO instrutores(usuario_id,nome,email,telefone,especialidade,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?)'
          ).run(id,`Instrutor Demo ${i+1}`,`instrutor${i+1}@example.invalid`,`1190000${String(i+1).padStart(4,'0')}`,['Musculação','Funcional','Dança','Condicionamento','Mobilidade'][i]!,1,instante,instante);
          instrutores.push(Number(conexao.preparar<[],{id:number}>('SELECT last_insert_rowid() AS id').get()!.id));
        }
        const planos: number[]=[];
        for (const [i,duracao] of [1,1,3,3,12].entries()) planos.push(Number(conexao.preparar<[string,number,number,number,string,string],{lastInsertRowid:number}>(
          'INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,?,?)'
        ).run(['Mensal Essencial','Mensal Livre','Trimestral','Trimestral Plus','Anual Completo'][i]!,duracao,[12990,15990,34990,42990,149900][i]!,1,instante,instante).lastInsertRowid));
        const alunos: number[]=[];
        for(let i=0;i<15;i++) {
          const nome=`Aluno Fictício ${String(i+1).padStart(2,'0')}`, cpf=this.cpf(i+1);
          const nascimento=this.dataAjustada(agora,-(20+(i%30))*365);
          const id=conexao.preparar<[string,string,string,string,string,string,string,string,string|null,string,string,string,number,string,string],{lastInsertRowid:number}>(
            'INSERT INTO alunos(nome,cpf,data_nascimento,email,telefone,cep,logradouro,numero,complemento,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(nome,cpf,nascimento,`aluno${i+1}@example.invalid`,`1198888${String(i+1).padStart(4,'0')}`,'01001000','Rua Exemplo',String(i+1),null,'Centro','Cidade Fictícia','SP',1,instante,instante).lastInsertRowid;
          alunos.push(Number(id));
        }
        const matriculas: number[]=[];
        for(let i=0;i<15;i++) {
          const meses=[1,1,3,3,12][i%5]!;
          const inicio=i<3?this.addDays(this.addMonths(hoje,-meses),7-i):this.addDays(hoje,-(i%5)*8);
          const fim=this.addMonths(inicio,meses);
          const valor=[12990,15990,34990,42990,149900][i%5]!;
          const id=Number(conexao.preparar<[number,number,string,string,number,string,string,string],{lastInsertRowid:number}>(
            'INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?)'
          ).run(alunos[i]!,planos[i%5]!,inicio,fim,valor,'ativa',instante,instante).lastInsertRowid);
          matriculas.push(id);
          const vencimento=this.addDays(inicio,0), competencia=inicio.slice(0,7), status=i%5===0?'cancelado':i%3===0?'pendente':'pago';
          conexao.preparar<[number,string,string,number,string,string|null,string|null,string|null,string|null,string,string,number|null],never>(
            'INSERT INTO pagamentos(matricula_id,competencia,data_vencimento,valor_centavos,situacao,pago_em,forma_pagamento,cancelado_em,motivo_cancelamento,criado_em,atualizado_em,cancelado_por) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(id,competencia,vencimento,valor,status,status==='pago'?instante:null,status==='pago'?['pix','cartao','dinheiro'][i%3]!:null,status==='cancelado'?instante:null,status==='cancelado'?'Registro fictício cancelado para demonstração.':null,instante,instante,status==='cancelado'?adminId:null);
        }
        for(let i=0;i<6;i++) {
          const inicio = new Date(agora.getTime()+(i===0?-7:(i+1)*86400000));
          inicio.setHours(i===0?9:17+(i%2),0,0,0);
          const fim = new Date(inicio.getTime()+60*60*1000), encerrada=i===0;
          const aula=Number(conexao.preparar<[number,string,string,string,number,number,string,number|null,number|null,string,string,string],{lastInsertRowid:number}>(
            'INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,latitude,longitude,situacao,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(instrutores[i%5]!,['musculacao','funcional','danca'][i%3]!,inicio.toISOString(),fim.toISOString(),12,0,'Sala principal',null,null,encerrada?'concluida':'agendada',instante,instante).lastInsertRowid);
          for(let j=0;j<Math.min(4,15);j++) {
            const situacao='ativa', presenca=encerrada?(j%2===0?'presente':'ausente'):'nao_registrada';
            conexao.preparar<[number,number,string,string,string,string],never>(
              'INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES(?,?,?,?,?,?)'
            ).run(aula,alunos[(i+j)%15]!,situacao,presenca,instante,instante);
          }
        }
        for(let i=0;i<15;i++) for(let marco=0;marco<(i<5?2:1);marco++) {
          const data=this.addDays(hoje,-(marco === 0 ? 60-i%7 : 20-i%7));
          conexao.preparar<[number,number,string,number,number,number,number,number,number,string,string,string],never>(
            'INSERT INTO avaliacoes_fisicas(aluno_id,instrutor_id,realizada_em,peso_kg,altura_cm,cintura_cm,quadril_cm,braco_cm,coxa_cm,observacoes,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(alunos[i]!,instrutores[i%5]!,data,70+i+(marco?-.8:0),160+(i%25),80+i%12,95+i%10,30+i%5,52+i%8,marco?'Reavaliação fictícia; evolução positiva.':'Avaliação inicial fictícia.',instante,instante);
        }
        // Avisos internos, sem identificador de Telegram nem consentimento; não podem gerar envio externo.
        for(let i=0;i<matriculas.length;i++) {
          const dataFim=conexao.preparar<[number],{data_fim:string}>('SELECT data_fim FROM matriculas WHERE id=?').get(matriculas[i]!)!.data_fim;
          const dias=Math.round((Date.parse(`${dataFim}T00:00:00Z`)-Date.parse(`${hoje}T00:00:00Z`))/86400000);
          if(dias>=0&&dias<=7) {
            const antecedencia=dias<=0?0:dias<=3?3:7, chave=`interno:vencimento_plano:${matriculas[i]}:${dataFim}:${antecedencia}`;
            conexao.preparar<[number,string,string,string,number,string,string],never>(
              "INSERT OR IGNORE INTO notificacoes(matricula_id,tipo,canal,chave_deduplicacao,agendada_para,data_alvo,antecedencia_dias,situacao,tentativas,criado_em,atualizado_em) VALUES(?,'vencimento_plano','interno',?,?,?,?,'pendente',0,?,?)"
            ).run(matriculas[i]!,chave,instante,dataFim,antecedencia,instante,instante);
          }
        }
      });
      const fk=conexao.preparar<[],{table:string}>('PRAGMA foreign_key_check').all();
      if(fk.length) throw new Error('A preparação demo gerou relações inválidas.');
    } finally { conexao.fechar(); }
  }

  private static cpf(n:number):string {
    const base=String(900000000+n).padStart(9,'0').split('').map(Number);
    for(const tamanho of [9,10]) { let soma=0; for(let i=0;i<tamanho;i++) soma+=base[i]!*(tamanho+1-i); const d=(soma*10)%11; base.push(d===10?0:d); }
    return base.join('');
  }
  private static civil(d:Date):string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  private static addDays(d:string,n:number):string { const x=new Date(`${d}T12:00:00`); x.setDate(x.getDate()+n); return this.civil(x); }
  private static addMonths(d:string,n:number):string { const x=new Date(`${d}T12:00:00`); x.setMonth(x.getMonth()+n); return this.civil(x); }
  private static dataAjustada(agora:Date,delta:number):string { const d=new Date(agora); d.setFullYear(d.getFullYear()+Math.floor(delta/365)); return this.civil(d); }

  public static sha256(arquivo:string):string { return createHash('sha256').update(readFileSync(arquivo)).digest('hex'); }
  public static tamanho(arquivo:string):number { return statSync(arquivo).size; }
}
