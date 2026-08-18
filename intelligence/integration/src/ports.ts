/**
 * Portas de ingestão — interfaces, sem nenhuma implementação externa.
 *
 * Nada aqui abre socket, lê disco ou toca credencial. São os contratos que a
 * futura camada de ingestão terá de satisfazer, escritos agora para que os
 * detectores já aprovados não precisem mudar quando as fontes reais entrarem.
 *
 * ─── Por que portas, e não código de integração ────────────────────────────────
 *
 * Duas decisões de integração estão ABERTAS neste momento:
 *
 *   Leonardo   qual tabela/view do Supabase será a origem
 *   Lucas      onde fica a pasta mensal e em que formato
 *
 * Escrever o adaptador agora exigiria inventar nomes de tabela e caminhos de
 * pasta. Inventar aqui é pior que não escrever: um nome plausível num arquivo
 * vira verdade no dia em que alguém o encontra e assume que foi confirmado — foi
 * o que aconteceu com os thresholds da Fase 2.1. Então: a forma do contrato é
 * definida, o conteúdo fica em aberto.
 *
 * ─── Ownership: quem produz o quê ─────────────────────────────────────────────
 *
 * A regra que estas portas existem para tornar estrutural:
 *
 *   observação crua       → `Evidence` (row/cell)
 *   cálculo determinístico → `Evidence` (computed) + `ComputedEvidenceProvenance`
 *   detector              → VERIFICA provenance; nunca a cria
 *
 * O detector é o único plano que não escreve nada. Se ele pudesse produzir a
 * própria prova, a prova não provaria nada.
 */

import type { Evidence, Snapshot } from "../../gateway/src/types"
import type { ComputedEvidenceProvenance } from "../../detectors/src/counterfactual-provenance"
import type { UnitCatalog } from "../../detectors/src/canonical-units"

/** Identidade LÓGICA do conjunto de dados. Estável entre reingestões. */
export interface DatasetIdentity {
  readonly source_system: string
  /** Estável: `vendas_mensal`, não `vendas_2026_08_v3`. */
  readonly dataset_id: string
}

/**
 * Uma linha crua, ainda não normalizada e ainda não canonicalizada.
 *
 * `readonly Record<string, unknown>` é deliberado: neste ponto o dado ainda não
 * tem tipo, e fingir que tem seria a mentira de sempre.
 */
export interface RawRow {
  /** Chave estável da linha na origem, para o localizador da evidência. */
  readonly row_key: string
  readonly values: Readonly<Record<string, unknown>>
}

/**
 * Lote cru de uma origem, com a procedência temporal separada.
 *
 * Três tempos DIFERENTES, e confundi-los é como uma análise fica velha sem
 * ninguém perceber:
 *
 *   observed_at   quando o dado foi observado NA ORIGEM
 *   collected_at  quando a ingestão o leu
 *   as_of         a que período de negócio ele se refere
 *
 * `detected_at` é um quarto tempo e NÃO mora aqui: é do detector, e vem sempre
 * explícito na entrada dele.
 */
export interface RawBatch {
  readonly dataset: DatasetIdentity
  readonly rows: readonly RawRow[]
  readonly observed_at: string
  readonly collected_at: string
  readonly period_start: string
  readonly period_end: string
  /** Hash do conteúdo, para identidade de conteúdo e idempotência. */
  readonly content_hash: string
  /** Linhas que a origem tinha e a ingestão não conseguiu ler. Nunca escondidas. */
  readonly rows_skipped: number
}

/**
 * Lê de uma origem governada.
 *
 * ERROS: precisa falhar fechado. Origem indisponível, schema divergente e tabela
 * vazia são três situações diferentes e o chamador precisa distingui-las — devolver
 * lote vazio para as três esconderia indisponibilidade atrás de "não houve venda".
 */
export interface SourceAdapter {
  readonly dataset: DatasetIdentity
  read(period_start: string, period_end: string): Promise<RawBatch>
}

/** Constrói o Snapshot governado. Único produtor de `snapshot_id`. */
export interface DatasetSnapshotBuilder {
  build(batch: RawBatch, catalog: UnitCatalog): Snapshot
}

/** Constrói evidência de OBSERVAÇÃO. Único produtor de `evidence_id` de linha. */
export interface EvidenceBuilder {
  forRow(snapshot: Snapshot, row: RawRow): Evidence
}

/**
 * Constrói evidência de CÁLCULO e a âncora que a liga à computação.
 *
 * Os dois juntos de propósito: uma evidência `computed` sem âncora é um número
 * sem dono, e foi exatamente o furo que os gates das Fases 2.4 e 2.5 encontraram.
 * Quem calcula grava a identidade da computação; quem consome apenas confere.
 */
export interface ComputedProvenanceBuilder {
  forComputation(
    snapshot: Snapshot,
    formula: string,
    computation_id: string,
  ): { readonly evidence: Evidence; readonly provenance: ComputedEvidenceProvenance }
}

/**
 * Fornece o catálogo governado de unidades.
 *
 * NÃO é a lista observada nos arquivos. A lista observada alimenta CANDIDATOS; a
 * promoção de um nome observado para canônico é decisão humana. Ver §5 do
 * documento de closure e `docs/D13_CATALOG_VALIDATION.md`.
 */
export interface UnitCatalogProvider {
  current(as_of: string): Promise<UnitCatalog>
}

/**
 * `expected_units` — REEXPORTADO do contrato canônico, não redefinido aqui.
 *
 * ─── O que existia antes, e por que era um defeito ────────────────────────────
 *
 * Este arquivo declarava a própria interface:
 *
 *   forPeriod(period_start: string, period_end: string): Promise<number | null>
 *
 * Quatro divergências em relação ao contrato governado da Fase 2.8, cada uma
 * capaz de produzir um denominador inauditável:
 *
 *   consulta por FAIXA DE DATAS      `expected_units` é governado por `period`
 *                                    estrito `AAAA-MM`; o domínio não muda para
 *                                    acomodar o formato de um storage
 *   sem `dataset_id`                 permitia membership GLOBAL do período, e
 *                                    Leonardo e Lucas podem esperar unidades
 *                                    diferentes no mesmo mês
 *   devolvia `number`                um contador não tem `unit_id` nem
 *                                    procedência: ninguém consegue auditar QUAIS
 *                                    unidades eram esperadas, nem segundo quem
 *   `null` para indisponível         volta a confundir "não tenho o dado" com
 *                                    "o valor é ausente", que foi exatamente o
 *                                    que a Fase 2.8a fechou
 *
 * A interface não tinha implementação nem consumidor, então nenhum teste a
 * exercitava — e era isso que a tornava perigosa. Um adaptador futuro poderia
 * satisfazê-la inteira e entregar um denominador que a cobertura governada não
 * aceitaria.
 *
 * ─── Uma definição, não duas parecidas ────────────────────────────────────────
 *
 * O contrato vive em `detectors/src/expected-units.ts` e é reexportado aqui. Não
 * há adaptação, não há wrapper, não há conversão: é o MESMO tipo. Um teste de
 * identidade de tipo prova isso nos dois sentidos.
 *
 * Se um source externo futuro trabalhar por faixa de datas, a conversão para
 * `period` pertence ao ADAPTADOR daquele source, é explícita, e é validada lá.
 */
export type {
  ExpectedUnitsLookup,
  ExpectedUnitsProvider,
  ExpectedUnitsQuery,
  GovernedExpectedUnits,
  ExpectedUnitsProvenance,
} from "../../detectors/src/expected-units"
