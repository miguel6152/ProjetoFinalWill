export interface NovaInscricao { aula_id: number; aluno_id: number; situacao: 'ativa' | 'cancelada'; presenca: 'nao_registrada' | 'presente' | 'ausente' }
export interface InscricaoDto extends NovaInscricao { id:number; criado_em:string; atualizado_em:string; referencia:string }
export interface FiltroInscricoes { pagina:number; tamanho:number; aula_id?:number | undefined; aluno_id?:number | undefined }
