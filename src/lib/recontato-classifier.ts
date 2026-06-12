// Classifica o resultado de uma ligação e calcula a próxima data de recontato.
// Alimentado pelo cruzamento resultados_discador × leads.

export type RecontatoCategoria =
  | "nao_atendeu"
  | "mae_atendeu"
  | "nao_podia_falar"
  | "nao_gostou"
  | "terceiro_nao_conhece"
  | "fora_politica"
  | "qualificado"
  | "convertido"
  | "outros"

export const CATEGORIA_LABEL: Record<RecontatoCategoria, string> = {
  nao_atendeu:           "Não Atendeu",
  mae_atendeu:           "Mãe / Responsável Atendeu",
  nao_podia_falar:       "Não Podia Falar",
  nao_gostou:            "Não Gostou / Recusa",
  terceiro_nao_conhece:  "Terceiro Não Conhece",
  fora_politica:         "Fora da Política",
  qualificado:           "Qualificado",
  convertido:            "Convertido",
  outros:                "Outros",
}

// Dias para recontato por categoria (null = não recontatar)
const DIAS_RECONTATO: Record<RecontatoCategoria, number | null> = {
  nao_atendeu:           2,
  mae_atendeu:           7,
  nao_podia_falar:       2,
  nao_gostou:            25,
  terceiro_nao_conhece:  15,
  fora_politica:         null,
  qualificado:           null,
  convertido:            null,
  outros:                5,
}

function upper(s: string | null | undefined): string {
  return (s ?? "").toUpperCase()
}

export function classifyRecontato(
  tabulacao: string | null | undefined,
  resultadoLigacao: string | null | undefined
): RecontatoCategoria {
  const tab = upper(tabulacao)
  const res = upper(resultadoLigacao)

  // Convertido: contrato ou fechamento (antes de qualificado para não engolir)
  if (tab.includes("CONTRATO") || tab.includes("FECHAMENTO")) return "convertido"

  // Qualificado
  if (tab.includes("QUALIFICA")) return "qualificado"

  // Fora da política
  if (tab.includes("FORA DA POLÍTICA") || tab.includes("FORA DA POLITICA")) return "fora_politica"

  // Não gostou / recusa
  if (tab.includes("NÃO TEM INTERESSE") || tab.includes("NAO TEM INTERESSE") ||
      tab.includes("RECUSA") || tab.includes("SEM INTERESSE")) return "nao_gostou"

  // Terceiro não conhece
  if (tab.includes("NÃO RECONHECE") || tab.includes("NAO RECONHECE") ||
      tab.includes("DESCONHECIDO") || tab.includes("TERCEIRO")) return "terceiro_nao_conhece"

  // Mãe / responsável atendeu
  if (tab.includes("MÃE") || tab.includes("MAE") || tab.includes("RESPONSÁVEL") ||
      tab.includes("RESPONSAVEL") || tab.includes("FAMILIAR")) return "mae_atendeu"

  // Não podia falar
  if (tab.includes("NÃO PODIA") || tab.includes("NAO PODIA") ||
      tab.includes("LIGAR DEPOIS") || tab.includes("OCUPADO") ||
      tab.includes("EM AULA") || tab.includes("VOLTAR")) return "nao_podia_falar"

  // Não atendeu: resultado cancelado/não atende ou tabulação vazia
  if (res.includes("CANCELAD") || res.includes("NÃO ATEND") || res.includes("NAO ATEND") ||
      res.includes("CAIXA POSTAL") || res.includes("INEXISTENTE") ||
      tab === "") return "nao_atendeu"

  return "outros"
}

export function calcRecontatoEm(categoria: RecontatoCategoria): string | null {
  const dias = DIAS_RECONTATO[categoria]
  if (dias === null) return null
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().split("T")[0]
}
