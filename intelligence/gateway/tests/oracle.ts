/**
 * Fase 3.1d-D2B-R6 — ORÁCULOS DE ESTADO INSEGURO.
 *
 * ─── Por que isto existe ─────────────────────────────────────────────────────
 *
 * A r5 exigia que o teste NOMEADO falhasse. Não exigia que ele falhasse pela
 * OBSERVAÇÃO INSEGURA — e `TypeError` também é falha.
 *
 * A B5 contornava o `EXECUTION_ALREADY_RESERVED` e então batia em `reserva.receipt`,
 * que não existe numa recusa. O teste falhava por exceção; o `execution_id` nunca era
 * reutilizado. A B7 fabricava um recibo de mesma forma e o `WeakSet` privado o
 * recusava; o teste falhava, e nenhuma segunda capacidade escapava. Duas mutações
 * contadas como prova de invariantes que elas não alcançavam.
 *
 * Agora cada mutação declara um oráculo. O teste emite a marca SOMENTE quando o estado
 * inseguro é de fato observado. Kill exige a marca; exceção antes dela não é kill.
 *
 * Somente teste. Nada disto existe em produção.
 */

/** Emite a marca se — e só se — o estado inseguro ocorreu de verdade. */
export function oraculo(marca: string, inseguro: boolean): void {
  if (inseguro) {
    process.stdout.write(`CREDITUM_UNSAFE_ORACLE::${marca}\n`)
  }
}

export const ORACULOS = {
  SEGUNDA_CAPACIDADE: "UNSAFE_SECOND_RESERVED_CAPACITY",
  ID_REUTILIZADO: "UNSAFE_EXECUTION_ID_REUSED",
  RECIBO_SEM_DURABILIDADE: "UNSAFE_RECEIPT_AFTER_DURABILITY_FAILURE",
  ATTEMPTS_LINK_ACEITO: "UNSAFE_ATTEMPTS_SYMLINK_ACCEPTED",
  RAIZ_LINK_ACEITA: "UNSAFE_ROOT_SYMLINK_ACCEPTED",
  EEXIST_SEM_REVALIDAR: "UNSAFE_EEXIST_NOT_REVALIDATED",
  FSYNC_LAVADO: "UNSAFE_LAUNDERED_ROOT_FSYNC",
  CAPACIDADE_FORJADA: "UNSAFE_CAPACITY_FORGED",
  CAPACIDADE_SERIALIZADA: "UNSAFE_CAPACITY_SERIALIZED",
  CONSUMO_DUPLO: "UNSAFE_DOUBLE_CONSUME",
  PRAZO_REINICIADO: "UNSAFE_DEADLINE_RESET",
  RAIZ_DO_CHAMADOR: "UNSAFE_CALLER_LEDGER_ROOT",
  AUTORIDADE_PERSISTIDA: "UNSAFE_RAW_AUTHORITY_PERSISTED",
  TERMINAL_SOBRESCRITO: "UNSAFE_TERMINAL_OVERWRITTEN",
  MALFORMADO_LIBERADO: "UNSAFE_MALFORMED_TREATED_FREE",
  RESERVA_SEM_FSYNC_RAIZ: "UNSAFE_RESERVATION_WITHOUT_ROOT_FSYNC",
  ID_REUSAVEL_APOS_ROLLBACK: "UNSAFE_EXECUTION_ID_REUSABLE_AFTER_ROLLBACK",
  FALHA_NAO_FECHADA: "UNSAFE_FAIL_OPEN_LEDGER_FALLBACK",
} as const
