/**
 * Escolha do arquivo mensal entre candidatos. Determinística e auditável.
 *
 * ─── O defeito que isto substitui ─────────────────────────────────────────────
 *
 * O workflow oficial faz busca GLOBAL no Drive por nome com `limit: 1`. Duas
 * consequências medidas na Fase 2.10:
 *
 *   · pega o primeiro que a API devolver — ordem incidental, não regra;
 *   · não restringe pasta, então um homônimo em outra pasta é lido sem aviso.
 *
 * Nenhuma das duas é decisão governada: são efeitos colaterais de uma chamada
 * conveniente. Como não existia regra oficial para reutilizar, esta fase define
 * uma — explícita, nomeada e testada contra permutação da ordem da API.
 *
 * ─── Duplicidade NÃO bloqueia ─────────────────────────────────────────────────
 *
 * A tentação é recusar tudo quando há dois arquivos do mesmo mês. Seria errado:
 * duplicidade é uma condição de QUALIDADE, e recusar transformaria "há dois
 * arquivos" em "não há dado" — que é a confusão que este subsistema inteiro existe
 * para não cometer. Selecionamos um, seguimos, e o aviso viaja junto com a lista
 * completa de candidatos para auditoria posterior.
 *
 * ─── Por que MIME incompatível não é descartado em silêncio ───────────────────
 *
 * Um `.xlsx` chamado `Novos Alunos - Agosto` na pasta oficial é sinal de que
 * alguém exportou, editou fora e devolveu. Descartá-lo silenciosamente esconde
 * isso. Ele sai da disputa — não é a fonte — mas fica registrado.
 */

import { deepFreeze } from "../../../gateway/src/immutability"
import { GOOGLE_SHEETS_MIME } from "./drive-port"
import type { DriveFileMeta } from "./drive-port"
import { compareCodeUnits, compareSourceInstant, sourceInstant } from "./source-time"
import type { SourceInstant } from "./source-time"

/**
 * A regra de desempate, nomeada. O nome viaja no resultado.
 *
 * Uma string constante em vez de um comentário porque a pergunta "por que este
 * arquivo?" é feita meses depois, por quem lê o snapshot, não o código.
 */
export const SELECTION_RULE = "LATEST_MODIFIED_THEN_STABLE_FILE_ID" as const
// Semântica, para que ninguém a reimplemente por string outra vez:
//   1. comparar `modified_time` pelo instante EXATO (segundos + nanos);
//   2. instante mais recente vence;
//   3. instantes iguais ATÉ O NANOSSEGUNDO → menor `file_id` por code unit.
export type SelectionRule = typeof SELECTION_RULE

/** Candidato considerado, com o veredito de elegibilidade preservado. */
export interface CandidateRecord {
  readonly file_id: string
  readonly name: string
  readonly mime_type: string
  readonly modified_time: string
  /**
   * O instante EXATO de `modified_time`, ou `null` quando não representável.
   *
   * Fica no registro porque é o valor que a REGRA usa. Guardar só o texto foi o que
   * permitiu comparar string sem ninguém notar (2.11c), e guardar milissegundos foi o
   * que colapsou `.1004` com `.1009` (2.11d).
   */
  readonly modified_instant: SourceInstant | null
  /** `false` quando o MIME não é Sheets nativo. Fica registrado, não some. */
  readonly eligible: boolean
}

export interface FileSelection {
  readonly selected_file_id: string
  readonly selected_file_name: string
  readonly selected_modified_time: string
  /**
   * Instante EXATO do escolhido. Quem consome não reparseia.
   *
   * Deliberadamente NÃO se chama `_ms` e não é `number`: enquanto era, um consumidor
   * podia comparar milissegundos e reintroduzir o colapso de sub-milissegundo sem que
   * nada falhasse.
   */
  readonly selected_modified_instant: SourceInstant
  readonly selection_rule: SelectionRule
  /** TODOS os candidatos, elegíveis ou não, em ordem determinística. */
  readonly candidates: readonly CandidateRecord[]
  readonly candidate_count: number
  /** Quantos disputaram de fato. `> 1` é o que dispara o aviso de duplicidade. */
  readonly eligible_count: number
  readonly duplicate: boolean
  readonly incompatible_mime_present: boolean
}

/** Nenhum candidato elegível. Não é erro — é ausência, e o chamador decide. */
export interface NoSelection {
  readonly candidates: readonly CandidateRecord[]
  readonly candidate_count: number
  readonly incompatible_mime_present: boolean
}

/**
 * Um candidato elegível tem `modified_time` ilegível.
 *
 * A regra governada é LATEST_MODIFIED. Sem poder ler o tempo de um candidato que
 * participa da comparação, ela não consegue dizer com verdade qual é o mais recente —
 * e escolher entre os que sobraram seria decidir a partir de um conjunto incompleto,
 * sem que nada no resultado dissesse isso.
 */
export interface UnparseableSelectionTime {
  readonly candidates: readonly CandidateRecord[]
  readonly candidate_count: number
  readonly incompatible_mime_present: boolean
  /** Quais candidatos elegíveis têm tempo ilegível, com o valor bruto. */
  readonly offending: readonly { readonly file_id: string; readonly modified_time: string }[]
}

export type SelectionOutcome =
  | { readonly outcome: "selected"; readonly selection: FileSelection }
  | { readonly outcome: "none"; readonly detail: NoSelection }
  | { readonly outcome: "time_unparseable"; readonly detail: UnparseableSelectionTime }

/**
 * Comparação de nome tolerante a caixa e espaço, estrita quanto ao resto.
 *
 * Acento é PRESERVADO: `Março` e `Marco` são grafias diferentes e a fonte usa a
 * acentuada. Tolerar acento aqui abriria a porta para casar `Novos Alunos - Marco`
 * — que, se existir, é um arquivo diferente que alguém criou por engano e deve
 * aparecer como tal.
 */
const nomeComparavel = (s: string): string => s.replace(/\s+/gu, " ").trim().toLowerCase()

/**
 * Seleciona exatamente um candidato, ou reporta ausência.
 *
 * A ordenação é aplicada à lista INTEIRA antes de escolher, e a chave de desempate
 * final é o `file_id` — que é único por construção no Drive. Por isso o resultado
 * não depende da ordem em que a API devolveu: qualquer permutação da entrada produz
 * a mesma saída. Um teste prova isso com permutações explícitas.
 */
export function selectMonthlyFile(
  candidatos: readonly DriveFileMeta[],
  expectedName: string,
): SelectionOutcome {
  const alvo = nomeComparavel(expectedName)

  const registros: CandidateRecord[] = candidatos
    .filter((c) => nomeComparavel(c.name) === alvo)
    .map((c) => ({
      file_id: c.file_id,
      name: c.name,
      mime_type: c.mime_type,
      modified_time: c.modified_time,
      // Parseado para TODOS, antes de qualquer ordenação. A versão anterior
      // ordenava por string e só o provider parseava — o do vencedor, depois de a
      // escolha estar feita, quando já não havia como corrigi-la.
      modified_instant: sourceInstant(c.modified_time),
      eligible: c.mime_type === GOOGLE_SHEETS_MIME,
    }))

  // Ordem determinística para o REGISTRO, não só para a escolha: o mesmo conjunto
  // de candidatos precisa produzir a mesma lista auditável, senão o hash de um
  // relatório de duplicidade mudaria sem nada ter mudado na fonte.
  //
  // Comparação pelo comparador CANÔNICO, até o nanossegundo. Igualdade exige mesmo
  // segundo E mesmos nanos — só aí o desempate por `file_id` entra. `...00Z` contra
  // `...00.000Z` empata; `.1004` contra `.1009` NÃO.
  //
  // Tempo não representável vai para o fim da lista auditável. Isso é ordenação de
  // REGISTRO, não seleção: candidato elegível sem instante recusa a captura inteira
  // logo abaixo.
  const ordenados = [...registros].sort((a, b) => {
    const ta = a.modified_instant
    const tb = b.modified_instant
    if (ta !== null && tb !== null) {
      const c = compareSourceInstant(tb, ta) // decrescente: mais recente primeiro
      if (c !== 0) return c
    } else if (ta === null && tb !== null) {
      return 1
    } else if (ta !== null && tb === null) {
      return -1
    }
    return compareCodeUnits(a.file_id, b.file_id)
  })

  const incompativel = ordenados.some((c) => !c.eligible)
  const elegiveis = ordenados.filter((c) => c.eligible)

  // Falha fechada ANTES de escolher. Um candidato elegível sem tempo legível torna a
  // regra LATEST_MODIFIED indeterminada, e nenhum atalho é aceitável: tratá-lo como
  // o mais antigo, como o mais novo, pulá-lo, ou cair no `file_id` — todos escolhem
  // um vencedor que a regra não sustenta.
  const semTempo = elegiveis.filter((c) => c.modified_instant === null)
  if (semTempo.length > 0) {
    return deepFreeze({
      outcome: "time_unparseable" as const,
      detail: {
        candidates: ordenados,
        candidate_count: ordenados.length,
        incompatible_mime_present: incompativel,
        offending: semTempo.map((c) => ({ file_id: c.file_id, modified_time: c.modified_time })),
      },
    })
  }

  if (elegiveis.length === 0) {
    return deepFreeze({
      outcome: "none" as const,
      detail: {
        candidates: ordenados,
        candidate_count: ordenados.length,
        incompatible_mime_present: incompativel,
      },
    })
  }

  // Já ordenados: o primeiro é o de maior `modified_time`, com `file_id` menor em
  // caso de empate exato. `elegiveis[0]` existe pelo guard acima; o narrowing
  // mantém a promessa sem asserção.
  const escolhido = elegiveis[0]
  if (escolhido === undefined) {
    return deepFreeze({
      outcome: "none" as const,
      detail: {
        candidates: ordenados,
        candidate_count: ordenados.length,
        incompatible_mime_present: incompativel,
      },
    })
  }

  // Garantido pelo guard `semTempo` acima: todo elegível tem instante.
  const instante = escolhido.modified_instant
  if (instante === null) {
    return deepFreeze({
      outcome: "time_unparseable" as const,
      detail: {
        candidates: ordenados,
        candidate_count: ordenados.length,
        incompatible_mime_present: incompativel,
        offending: [{ file_id: escolhido.file_id, modified_time: escolhido.modified_time }],
      },
    })
  }

  return deepFreeze({
    outcome: "selected" as const,
    selection: {
      selected_file_id: escolhido.file_id,
      selected_file_name: escolhido.name,
      selected_modified_time: escolhido.modified_time,
      selected_modified_instant: instante,
      selection_rule: SELECTION_RULE,
      candidates: ordenados,
      candidate_count: ordenados.length,
      eligible_count: elegiveis.length,
      duplicate: elegiveis.length > 1,
      incompatible_mime_present: incompativel,
    },
  })
}
