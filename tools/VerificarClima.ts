import assert from 'node:assert/strict';
import { ClimaService } from '../src/services/ClimaService';
import type { AulaDto } from '../src/shared/tipos/Aula';
import { HorarioAula } from '../src/renderer/componentes/HorarioAula';

class VerificarClima {
  public async executar(): Promise<void> {
    let chamadas = 0, agora = Date.parse('2026-11-22T00:00:00Z');
    const aula: AulaDto = {id:1,instrutor_id:1,modalidade:'funcional',inicio_em:'2026-11-23T02:30:00Z',fim_em:'2026-11-23T03:30:00Z',
      capacidade:2,situacao:'agendada',local:'Praça',ao_ar_livre:1,latitude:0,longitude:0,criado_em:'UTC',atualizado_em:'UTC',referencia:'teste'};
    const resposta = {hourly_units:{time:'unixtime',precipitation:'mm',precipitation_probability:'%'},
      hourly:{time:[Date.parse('2026-11-23T03:00:00Z')/1000,Date.parse('2026-11-23T04:00:00Z')/1000],
        precipitation:[1,2] as (number|null)[],precipitation_probability:[70,20]}};
    const transporte:typeof fetch=async (url,opcoes)=>{
      chamadas++;
      const endereco=new URL(String(url));
      assert.equal(endereco.origin,'https://api.open-meteo.com');
      assert.equal(endereco.searchParams.get('latitude'),'0');
      assert.equal(endereco.searchParams.get('longitude'),'0');
      assert.equal(endereco.searchParams.get('timeformat'),'unixtime');
      assert.equal(opcoes?.redirect,'error');
      return new Response(JSON.stringify(resposta));
    };
    const servico=new ClimaService(transporte,()=>agora,60,100);
    assert.equal((await servico.consultar({...aula,ao_ar_livre:0})).disponivel,false);
    assert.equal(chamadas,0);
    const previsao=await servico.consultar(aula);
    assert.equal(previsao.alerta,true); assert.equal(previsao.horas.length,2);
    assert.equal(HorarioAula.local(previsao.horas[0]!.inicio_em),'2026-11-22T23:00');
    assert.equal(HorarioAula.local(previsao.horas[1]!.inicio_em),'2026-11-23T00:00');
    assert.equal((await servico.consultar(aula)).origem,'cache'); assert.equal(chamadas,1);
    agora+=300001;
    resposta.hourly.precipitation_probability=[10,20];
    assert.equal((await servico.consultar(aula)).alerta,false); assert.equal(chamadas,2);
    resposta.hourly.precipitation[1]=null;
    const parcial=await new ClimaService(transporte,()=>agora,60,100,true).consultar(aula);
    assert.equal(parcial.disponivel,false); assert.equal(parcial.alerta,null);
    assert.equal(parcial.horas[1]?.precipitacao_mm,null);assert.equal(parcial.origem,'simulacao');
    const espera:typeof fetch=()=>new Promise(()=>{});
    assert.equal((await new ClimaService(espera,()=>agora,60,5).consultar(aula)).disponivel,false);
    assert.equal((await servico.consultar({...aula,inicio_em:'2027-01-01T12:00:00Z',fim_em:'2027-01-01T13:00:00Z'})).disponivel,false);
    assert.equal(chamadas,3);
    assert.equal(aula.situacao,'agendada');
    console.log('OK simulação: aula interna sem HTTP, zero, virada do dia, limiar, cache/expiração, resposta parcial, timeout e horizonte.');
  }
}
void new VerificarClima().executar().catch(erro=>{console.error(erro);process.exitCode=1;});
