import { randomBytes } from 'node:crypto';
import type { ContextoSessao, SessaoInterna } from '../main/seguranca/ContratosAutenticacao';
import type { SessaoManager } from '../main/seguranca/SessaoManager';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';

export class CredenciaisRelatorios {
  private readonly registros=new Map<string,{contexto:ContextoSessao;sessao:Readonly<SessaoInterna>;versao:symbol;expira:number}>();
  public constructor(private readonly sessoes:SessaoManager,private readonly agora:()=>number=Date.now) {}
  /** Uso exclusivo do Main. Credenciais nunca integram contratos do preload. */
  public emitir(contexto:ContextoSessao):string {
    const sessao=this.sessoes.obter(contexto);
    if(!sessao) throw new ErroAutenticacao('NAO_AUTENTICADO');
    for(const [token,registro] of this.registros){
      if(registro.expira<=this.agora() || registro.contexto.webContentsId===contexto.webContentsId) this.registros.delete(token);
    }
    if(this.registros.size>=100) throw new ErroAutenticacao('INTERNO');
    const token=randomBytes(32).toString('hex');
    this.registros.set(token,{contexto:{...contexto},sessao,versao:this.sessoes.versao(contexto),expira:this.agora()+300000});
    return token;
  }
  public resolver(authorization:string|undefined):ContextoSessao {
    const token=/^Bearer ([0-9a-f]{64})$/.exec(authorization??'')?.[1];
    const registro=token?this.registros.get(token):undefined;
    if(!registro) throw new ErroAutenticacao('NAO_AUTENTICADO');
    try {
      this.sessoes.conferir(registro.contexto,registro.versao);
      if(registro.expira<=this.agora() || this.sessoes.obter(registro.contexto)!==registro.sessao)
        throw new ErroAutenticacao('NAO_AUTENTICADO');
      return registro.contexto;
    } catch {this.registros.delete(token!);throw new ErroAutenticacao('NAO_AUTENTICADO');}
  }
  public encerrar():void {this.registros.clear();}
}
