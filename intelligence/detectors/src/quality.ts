/**
 * Lattice de qualidade — a saída nunca é melhor que a pior dependência.
 *
 * Extraído do Detector A depois do gate da Fase 2.5, que encontrou o custo de
 * cada detector escrever a sua própria versão: a do Detector C esquecia de ler
 * `snapshot.quality_status`, então um snapshot `conflicted` produzia um evento
 * `ok`. Duas políticas concorrentes divergem exatamente assim — não por
 * discordância, por omissão.
 *
 * O princípio é o mesmo do `Metric<T>` do motor: um total que depende de uma
 * entrada degradada é degradado. Vale para exclusão de registro, identidade não
 * resolvida, cobertura baixa, conflito de fonte e lacuna de dimensão declarada.
 *
 * A ordem NÃO é alfabética nem a ordem do enum do contrato — é severidade:
 *
 *   ok < degraded < insufficient < conflicted
 *
 * `conflicted` é o pior porque significa que duas fontes governadas afirmam
 * coisas diferentes: o número não está apenas incompleto, está em disputa, e
 * nenhuma agregação resolve isso sem decisão humana.
 */

export type Quality = "ok" | "degraded" | "conflicted" | "insufficient"

const ORDEM: Readonly<Record<Quality, number>> = {
  ok: 0,
  degraded: 1,
  insufficient: 2,
  conflicted: 3,
}

/** A pior de todas. Lista vazia é `ok` — nada a degradar. */
export function piorQualidade(candidatas: readonly Quality[]): Quality {
  let pior: Quality = "ok"
  for (const q of candidatas) {
    if (ORDEM[q] > ORDEM[pior]) pior = q
  }
  return pior
}

/** Para testes e asserções: a severidade relativa é observável. */
export function severidadeDaQualidade(q: Quality): number {
  return ORDEM[q]
}
