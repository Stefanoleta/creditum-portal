/**
 * Identidade determinística a partir de estrutura.
 *
 * Extraído de `conflict-id.ts` depois do gate da Fase 2.2, para que os
 * detectores seguintes não repitam o erro que aquele gate encontrou: **nenhuma
 * gramática manual de delimitador**.
 *
 * Qualquer separador escolhido à mão permite que duas estruturas diferentes
 * produzam a mesma string, desde que o conteúdo possa conter o separador. Trocar
 * o caractere só muda qual deles é o problema. A estrutura chega inteira ao
 * codificador, e o codificador é `JSON.stringify` — serialização padrão que
 * escapa caractere de controle, aspas e barra invertida, e delimita string,
 * array e objeto.
 *
 * `stableContent` do motor NÃO serve aqui: ele foi escrito para conteúdo plano
 * de linha de planilha e aplica `String(v)` em cada valor, o que colapsa array
 * de objetos em `"[object Object]"`. Ver `tests/conflict-id.test.ts`.
 */

import { createHash } from "node:crypto"

/**
 * Comparação por unidade de código, não por locale.
 *
 * `localeCompare` depende do locale do runtime — o mesmo fato receberia ids
 * diferentes em máquinas diferentes, e o ledger perderia a correlação.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Serializa a estrutura de forma inequívoca.
 *
 * A ordem das chaves é a do objeto que o chamador monta — literal fixo no
 * código, nunca derivado de entrada.
 */
export function structuralMaterial(payload: unknown): string {
  return JSON.stringify(payload)
}

/**
 * `<prefixo>_<16 hex>` — casa com o padrão de identificador dos contratos.
 *
 * O `domain` separa espaços de identidade: dois fatos diferentes com o mesmo
 * payload não colidem por acaso.
 */
export function structuralId(domain: string, payload: unknown, prefix: string): string {
  const hash = createHash("sha256")
    .update(`${domain}:${structuralMaterial(payload)}`, "utf8")
    .digest("hex")
    .slice(0, 16)
  return `${prefix}_${hash}`
}
