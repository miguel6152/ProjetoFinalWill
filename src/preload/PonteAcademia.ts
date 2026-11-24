import { contextBridge, ipcRenderer } from 'electron';
import type { PonteAcademia as ContratoPonte } from '../shared/ipc/ContratoIpc';

class PonteAcademia {
  public expor(): void {
    if (!process.contextIsolated || !process.sandboxed) {
      throw new Error('A ponte exige isolamento de contexto e sandbox.');
    }
    const autenticacao: NonNullable<ContratoPonte['autenticacao']> = Object.freeze({
      entrar: (entrada) => ipcRenderer.invoke('auth:entrar', entrada),
      sessao: (entrada) => ipcRenderer.invoke('auth:sessao', entrada),
      sair: (entrada) => ipcRenderer.invoke('auth:sair', entrada)
    });
    const usuarios: NonNullable<ContratoPonte['usuarios']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('usuarios:criar', entrada),
      listar: entrada => ipcRenderer.invoke('usuarios:listar', entrada),
      obter: entrada => ipcRenderer.invoke('usuarios:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('usuarios:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('usuarios:excluir', entrada),
      alterarSenha: entrada => ipcRenderer.invoke('usuarios:alterar-senha', entrada)
    });
    const inicializacao: NonNullable<ContratoPonte['inicializacao']> = Object.freeze({
      estado: entrada => ipcRenderer.invoke('inicializacao:estado', entrada),
      criarAdministrador: entrada => ipcRenderer.invoke('inicializacao:criar-admin', entrada)
    });
    const alunos: NonNullable<ContratoPonte['alunos']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('alunos:criar', entrada),
      listar: entrada => ipcRenderer.invoke('alunos:listar', entrada),
      obter: entrada => ipcRenderer.invoke('alunos:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('alunos:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('alunos:excluir', entrada)
    });
    const endereco: NonNullable<ContratoPonte['endereco']> = Object.freeze({
      consultarCep: entrada => ipcRenderer.invoke('endereco:consultar-cep', entrada)
    });
    const planos: NonNullable<ContratoPonte['planos']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('planos:criar', entrada),
      listar: entrada => ipcRenderer.invoke('planos:listar', entrada),
      obter: entrada => ipcRenderer.invoke('planos:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('planos:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('planos:excluir', entrada)
    });
    const instrutores: NonNullable<ContratoPonte['instrutores']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('instrutores:criar', entrada),
      listar: entrada => ipcRenderer.invoke('instrutores:listar', entrada),
      obter: entrada => ipcRenderer.invoke('instrutores:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('instrutores:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('instrutores:excluir', entrada)
    });
    const aulas: NonNullable<ContratoPonte['aulas']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('aulas:criar', entrada),
      listar: entrada => ipcRenderer.invoke('aulas:listar', entrada),
      obter: entrada => ipcRenderer.invoke('aulas:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('aulas:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('aulas:excluir', entrada)
    });
    const inscricoes: NonNullable<ContratoPonte['inscricoes']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('inscricoes:criar', entrada),
      listar: entrada => ipcRenderer.invoke('inscricoes:listar', entrada),
      obter: entrada => ipcRenderer.invoke('inscricoes:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('inscricoes:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('inscricoes:excluir', entrada)
    });
    const avaliacoes: NonNullable<ContratoPonte['avaliacoes']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('avaliacoes:criar', entrada),
      listar: entrada => ipcRenderer.invoke('avaliacoes:listar', entrada),
      obter: entrada => ipcRenderer.invoke('avaliacoes:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('avaliacoes:atualizar', entrada),
      excluir: entrada => ipcRenderer.invoke('avaliacoes:excluir', entrada)
    });
    const matriculas: NonNullable<ContratoPonte['matriculas']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('matriculas:criar', entrada),
      cancelar: entrada => ipcRenderer.invoke('matriculas:cancelar', entrada),
      encerrar: entrada => ipcRenderer.invoke('matriculas:encerrar', entrada),
      excluir: entrada => ipcRenderer.invoke('matriculas:excluir', entrada),
      listar: entrada => ipcRenderer.invoke('matriculas:listar', entrada),
      obter: entrada => ipcRenderer.invoke('matriculas:obter', entrada),
      atualizar: entrada => ipcRenderer.invoke('matriculas:atualizar', entrada)
    });
    const pagamentos: NonNullable<ContratoPonte['pagamentos']> = Object.freeze({
      inadimplentes: entrada => ipcRenderer.invoke('pagamentos:inadimplentes', entrada),
      criar: entrada => ipcRenderer.invoke('pagamentos:criar', entrada),
      listar: entrada => ipcRenderer.invoke('pagamentos:listar', entrada),
      obter: entrada => ipcRenderer.invoke('pagamentos:obter', entrada),
      quitar: entrada => ipcRenderer.invoke('pagamentos:quitar', entrada),
      atualizar: entrada => ipcRenderer.invoke('pagamentos:atualizar', entrada),
      cancelar: entrada => ipcRenderer.invoke('pagamentos:cancelar', entrada)
    });
    const avisos: NonNullable<ContratoPonte['avisos']> = Object.freeze({
      entrega: entrada => ipcRenderer.invoke('avisos:entrega', entrada),
      processar: entrada => ipcRenderer.invoke('avisos:processar', entrada),
      preferencia: entrada => ipcRenderer.invoke('avisos:preferencia', entrada),
      configurar: entrada => ipcRenderer.invoke('avisos:configurar', entrada),
      listar: entrada => ipcRenderer.invoke('avisos:listar', entrada),
      verificar: entrada => ipcRenderer.invoke('avisos:verificar', entrada),
      ler: entrada => ipcRenderer.invoke('avisos:ler', entrada)
    });
    const clima: NonNullable<ContratoPonte['clima']> = Object.freeze({
      consultarAula: entrada => ipcRenderer.invoke('clima:consultar-aula', entrada)
    });
    const relatorios: NonNullable<ContratoPonte['relatorios']> = Object.freeze({
      evolucao: entrada => ipcRenderer.invoke('relatorios:evolucao', entrada),
      frequencia: entrada => ipcRenderer.invoke('relatorios:frequencia', entrada)
    });
    const capacidades: Readonly<ContratoPonte> = Object.freeze({ relatorios, clima, autenticacao, usuarios, inicializacao, alunos, endereco, avaliacoes, inscricoes, aulas, instrutores, planos, matriculas, pagamentos, avisos });
    contextBridge.exposeInMainWorld('academia', capacidades);
  }
}

new PonteAcademia().expor();
