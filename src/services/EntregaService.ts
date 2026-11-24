import type { EntregaDto, ModoEntrega } from '../shared/tipos/Entrega';
import type { NotificacaoRepository } from '../repositories/NotificacaoRepository';
import { AvisosService } from './AvisosService';
import { DataAcademia } from './DataAcademia';
import { TelegramCliente } from './TelegramCliente';
import type { RespostaEntrega } from './TelegramCliente';

export class EntregaService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private ocupado = false;
  private encerrado = false;
  private static readonly maximo = 3;

  public constructor(private readonly avisos: NotificacaoRepository, public readonly modo: ModoEntrega,
    private readonly cliente: TelegramCliente, private readonly automatica: boolean,
    private readonly relogio: () => Date = () => new Date()) {}

  public static doAmbiente(repo: NotificacaoRepository, token: string | undefined): EntregaService {
    const modo = process.env.MENSAGENS_MODO === 'telegram' ? 'telegram' : 'simulado';
    return new EntregaService(repo, modo, new TelegramCliente(token),
      process.env.MENSAGENS_AUTOMATICAS === 'true');
  }

  public consultar(id: number, agora = this.relogio()): EntregaDto {
    const tentativas = this.avisos.historico(id), ultima = tentativas[0];
    const destino = this.avisos.destino(id, DataAcademia.civil(agora));
    const resposta = (estado: EntregaDto['estado'], motivo: string, pode_processar = false): EntregaDto =>
      ({ modo: this.modo, tentativas, estado, motivo, pode_processar });
    if (ultima && ['processando','enviado','simulado','incerto'].includes(ultima.estado)) {
      return resposta(ultima.estado, ultima.motivo ?? '');
    }
    if (!destino?.vigente || destino.situacao === 'cancelada' || AvisosService.marco(destino.dias) !== destino.antecedencia_dias) {
      return resposta('inelegivel', 'Aviso cancelado, vencido ou substituído.');
    }
    if (destino.situacao === 'enviada' || destino.situacao === 'processando') {
      return resposta(destino.situacao === 'enviada' ? 'enviado' : 'processando', 'Registro anterior de entrega.');
    }
    if (!destino.chat || !/^[1-9]\d{0,15}$/.test(destino.chat) || !Number.isSafeInteger(Number(destino.chat))) {
      return resposta('inelegivel', 'Chat privado sem vínculo válido.');
    }
    if (!destino.consentimento) return resposta('inelegivel', 'Aluno sem autorização de recebimento.');
    if (this.modo === 'telegram' && !this.cliente.configurado) return resposta('inelegivel', 'Token do bot ausente ou inválido.');
    if (ultima && ultima.numero >= EntregaService.maximo) return resposta('falhou', 'Limite de três tentativas atingido.');
    const agoraIso = agora.toISOString();
    const limitado = this.modo === 'telegram' && this.avisos.limitadoAte(agoraIso);
    if (limitado) return resposta(ultima?.estado ?? 'pendente', 'Telegram em espera até ' + limitado);
    if (ultima?.proxima && ultima.proxima > agoraIso) return resposta('falhou', 'Aguardando próxima tentativa.');
    return resposta(ultima?.estado ?? 'pendente', ultima?.motivo ?? '', true);
  }

  public async processar(id: number, manual: boolean, modo: ModoEntrega): Promise<void> {
    if (this.encerrado || modo !== this.modo) return;
    const reserva = this.avisos.transacao(() => {
      const agora = this.relogio();
      const dados = this.consultar(id, agora), ultima = dados.tentativas[0];
      if (!dados.pode_processar || (ultima && !manual && !ultima.proxima)) return undefined;
      const destino = this.avisos.destino(id, DataAcademia.civil(agora))!;
      const numero = (ultima?.numero ?? 0) + 1;
      this.avisos.iniciarTentativa(id,numero,modo,agora.toISOString());
      return { chat: destino.chat!, numero, data: destino.data_alvo };
    });
    if (!reserva) return;
    const texto = 'Academia: a vigência do seu plano termina em ' + reserva.data.split('-').reverse().join('/') + '.';
    const resultado: RespostaEntrega = modo === 'simulado' ? { estado: 'simulado' } : await this.cliente.enviar(reserva.chat,texto);
    if (this.encerrado) return; // Na próxima abertura, a reserva sem confirmação fica incerta.
    const agora = this.relogio();
    let proxima: string | null = null;
    if (resultado.estado === 'falhou' && resultado.espera_segundos !== undefined) {
      const segundos = Math.max(resultado.espera_segundos, 60 * 2 ** (reserva.numero - 1));
      proxima = new Date(agora.getTime() + segundos * 1000).toISOString();
    }
    this.avisos.transacao(() => this.avisos.concluir(id,reserva.numero,resultado,agora.toISOString(),proxima));
  }

  public iniciar(): void {
    if (this.timer) return;
    this.encerrado = false;
    const ciclo = async () => {
      if (this.ocupado || this.encerrado) return;
      this.ocupado = true;
      try {
        const agora = this.relogio();
        this.avisos.recuperar(agora);
        if (this.automatica) {
          for (const id of this.avisos.candidatos(agora.toISOString(),DataAcademia.civil(agora))) {
            if (this.encerrado) break;
            await this.processar(id,false,this.modo);
          }
        }
      } catch { console.error('Falha ao consultar a fila local de mensagens.'); }
      finally { this.ocupado = false; }
    };
    void ciclo();
    this.timer = setInterval(() => void ciclo(), 60000);
    this.timer.unref();
  }

  public encerrar(): void {
    this.encerrado = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
