// Classifica o resultado de uma ligação e calcula a próxima data de recontato.
// Alimentado pelo cruzamento resultados_discador × leads.

export type RecontatoCategoria =
  // Categorias originais (cruzamento Argus × tabulação manual)
  | "nao_atendeu"
  | "mae_atendeu"
  | "nao_podia_falar"
  | "nao_gostou"
  | "terceiro_nao_conhece"
  | "fora_politica"
  | "qualificado"
  | "convertido"
  | "outros"
  // Categorias IA (tabulacao_ia — análise automática de ligação)
  | "ocupado_recontatar"
  | "interessado_sem_fechar"
  | "mae_familiar_atendeu"
  | "nao_reconhece_aguardar"
  | "objecao_financeira"
  | "objecao_prazo"
  | "nao_gostou_proposta"
  | "ja_resolveu"
  | "numero_invalido"
  | "recusa_definitiva"
  | "nao_atendeu_multiplas"

export const CATEGORIA_LABEL: Record<RecontatoCategoria, string> = {
  // Originais
  nao_atendeu:           "Não Atendeu",
  mae_atendeu:           "Mãe / Responsável Atendeu",
  nao_podia_falar:       "Não Podia Falar",
  nao_gostou:            "Não Gostou / Recusa",
  terceiro_nao_conhece:  "Terceiro Não Conhece",
  fora_politica:         "Fora da Política",
  qualificado:           "Qualificado",
  convertido:            "Convertido",
  outros:                "Outros",
  // IA
  ocupado_recontatar:    "Ocupado / Recontatar",
  interessado_sem_fechar:"Interessado sem Fechar",
  mae_familiar_atendeu:  "Mãe / Familiar Atendeu (IA)",
  nao_reconhece_aguardar:"Não Reconhece / Aguardar",
  objecao_financeira:    "Objeção Financeira",
  objecao_prazo:         "Objeção de Prazo",
  nao_gostou_proposta:   "Não Gostou da Proposta (IA)",
  ja_resolveu:           "Já Resolveu",
  numero_invalido:       "Número Inválido",
  recusa_definitiva:     "Recusa Definitiva",
  nao_atendeu_multiplas: "Não Atendeu (Múltiplas)",
}

// Dias para recontato por categoria (null = não recontatar automaticamente)
const DIAS_RECONTATO: Record<RecontatoCategoria, number | null> = {
  // Originais
  nao_atendeu:           2,
  mae_atendeu:           7,
  nao_podia_falar:       2,
  nao_gostou:            25,
  terceiro_nao_conhece:  15,
  fora_politica:         null,
  qualificado:           null,
  convertido:            null,
  outros:                5,
  // IA
  ocupado_recontatar:    2,
  interessado_sem_fechar:3,
  mae_familiar_atendeu:  7,
  nao_reconhece_aguardar:15,
  objecao_financeira:    20,
  objecao_prazo:         15,
  nao_gostou_proposta:   30,
  ja_resolveu:           45,
  numero_invalido:       null,
  recusa_definitiva:     null,
  nao_atendeu_multiplas: 7,
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
