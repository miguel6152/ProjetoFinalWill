export class HorarioAula {
  private static readonly formato = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  public static local(iso: string): string {
    return this.formato.format(new Date(iso)).replace(' ', 'T');
  }

  public static instante(local: string): string {
    const base = Date.parse(local + ':00Z');
    // Os dois lados de uma mudança de horário podem ter deslocamentos diferentes.
    const candidatos = new Set<string>();
    for (const dia of [-1, 0, 1]) {
      const amostra = base + dia * 86400000;
      const civil = this.local(new Date(amostra).toISOString());
      const deslocamento = Date.parse(civil + ':00Z') - amostra;
      const iso = new Date(base - deslocamento).toISOString();
      if (this.local(iso) === local) candidatos.add(iso);
    }
    if (candidatos.size !== 1) throw new Error('Horário inexistente ou ambíguo em São Paulo.');
    return [...candidatos][0]!;
  }
}
