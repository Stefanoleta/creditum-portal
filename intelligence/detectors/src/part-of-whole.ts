/**
 * Quando uma razão é uma PARTICIPAÇÃO, e quando é só uma divisão.
 *
 * Extraído do Detector A depois do gate da Fase 2.3, para que o Detector D não
 * repita a mesma descoberta por conta própria. A regra é curta e o motivo é
 * longo, então mora aqui uma vez.
 *
 * ─── O problema ───────────────────────────────────────────────────────────────
 *
 * Dinheiro tem sinal. Estorno é dado legítimo, e assim que ele entra no conjunto
 * a divisão continua existindo enquanto o significado desaparece:
 *
 *   parte 150, todo líquido 100   → 15000 bp, "150% do total"
 *   parte -50, todo 100           → -5000 bp, "participação negativa"
 *   parte 10,  todo -100          → -1000 bp, sinal invertido sem aviso
 *
 * Nenhuma dessas três é participação. As duas primeiras nem cabem no domínio
 * `basis_points` do contrato (0..10000), e a terceira cabe pelo motivo errado.
 *
 * ─── Por que não clampar ──────────────────────────────────────────────────────
 *
 * Clampar 15000 para 10000 produz "este caso é 100% do total" — um número que o
 * consumidor não tem como distinguir de uma participação real de 100%. O
 * consumidor aqui é um executivo, e depois disso um agente. Preferimos a lacuna:
 * o valor absoluto continua exato e publicado, e quem lê sabe que a
 * participação não existe em vez de acreditar num número inventado.
 */

/**
 * A parte é parte do todo?
 *
 * Três condições, todas necessárias: o todo é positivo, a parte não é negativa,
 * e a parte cabe dentro do todo. Satisfeitas, `parte / todo` está em
 * `[0, 10000]` bp por construção — e cabe no contrato sem clamp.
 *
 * Zero no todo NÃO é tratado aqui como caso especial: é denominador vazio, e o
 * chamador costuma querer distinguir `EMPTY_DENOMINATOR` de "sinal misto" na
 * lacuna que publica. Esta função só responde `false`.
 */
export function isPartOfWhole(part: number, whole: number): boolean {
  return whole > 0 && part >= 0 && part <= whole
}
