export class DataAcademia {
  private static readonly calendario = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  });

  public static civil(instante: Date): string { return this.calendario.format(instante); }
}
