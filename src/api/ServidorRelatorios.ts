import express from 'express';
import type { Server } from 'node:http';
import type { RelatorioService } from '../services/RelatorioService';
import type { CredenciaisRelatorios } from './CredenciaisRelatorios';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';

export class ServidorRelatorios {
  private servidor:Server|undefined;
  private encerrado=false;
  private endereco:string|null=null;
  private falha:string|null=null;
  public constructor(private readonly consultas:RelatorioService,private readonly credenciais:CredenciaisRelatorios) {}
  public estado(){return {endereco:this.endereco,erro:this.falha};}
  public iniciar(porta=0):Promise<boolean> {
    if(this.servidor || this.encerrado) return Promise.resolve(false);
    if(!Number.isInteger(porta)||porta<0||porta>65535){this.falha='Porta inválida.';return Promise.resolve(false);}
    const api=express();
    api.disable('x-powered-by');
    api.set('query parser','simple');
    for(const tipo of ['evolucao','frequencia'] as const){
      api.get('/relatorios/'+tipo,async(req,res)=>{
        res.set('Cache-Control','no-store');
        try {
          if(this.encerrado) throw new ErroAutenticacao('NAO_AUTENTICADO');
          const contexto=this.credenciais.resolver(req.headers.authorization);
          const dados=await this.consultas.consultar(tipo,req.query,contexto);
          this.credenciais.resolver(req.headers.authorization);
          if(this.encerrado) throw new ErroAutenticacao('NAO_AUTENTICADO');
          res.json(dados);
        } catch(erro:unknown){
          const codigo=erro instanceof ErroAutenticacao?erro.codigo:'INTERNO';
          const status=codigo==='VALIDACAO'?400:codigo==='NAO_AUTENTICADO'?401:codigo==='SEM_PERMISSAO'?403:500;
          res.status(status).json({erro:codigo});
        }
      });
    }
    return new Promise(resolve=>{
      const servidor=api.listen(porta,'127.0.0.1');
      this.servidor=servidor;
      servidor.once('listening',()=>{
        if(this.encerrado){servidor.close();resolve(false);return;}
        const endereco=servidor.address();
        if(endereco && typeof endereco!=='string') this.endereco='http://127.0.0.1:'+endereco.port;
        resolve(true);
      });
      servidor.on('error',()=>{this.falha='API indisponível. Verifique se a porta está ocupada.';this.endereco=null;resolve(false);});
      servidor.requestTimeout=10000;servidor.headersTimeout=10000;
    });
  }
  public encerrar():void {
    this.encerrado=true;this.endereco=null;this.credenciais.encerrar();
    this.servidor?.close();this.servidor?.closeAllConnections();this.servidor=undefined;
  }
}
