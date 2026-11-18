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
    const matriculas: NonNullable<ContratoPonte['matriculas']> = Object.freeze({
      criar: entrada => ipcRenderer.invoke('matriculas:criar', entrada),
      cancelar: entrada => ipcRenderer.invoke('matriculas:cancelar', entrada),
      encerrar: entrada => ipcRenderer.invoke('matriculas:encerrar', entrada),
      listar: entrada => ipcRenderer.invoke('matriculas:listar', entrada),
      obter: entrada => ipcRenderer.invoke('matriculas:obter', entrada)
    });
    const capacidades: Readonly<ContratoPonte> = Object.freeze({ autenticacao, usuarios, inicializacao, alunos, endereco, planos, matriculas });
    contextBridge.exposeInMainWorld('academia', capacidades);
  }
}

new PonteAcademia().expor();
