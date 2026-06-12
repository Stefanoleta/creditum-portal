import { NextResponse } from "next/server"
import { adaptSDRs, extractArray, getVendasAllowlist } from "@/lib/argus-adapter"
import type { ArgusDesempenhoItem, ArgusTabulacaoItem } from "@/types/argus"

const BASE_URL    = process.env.ARGUS_BASE_URL!
const TOKEN       = process.env.ARGUS_TOKEN!
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")
const VENDAS_LIST = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

async function argusPost<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Argus ${endpoint} → HTTP ${res.status}`)
  const json = await res.json() as Record<string, unknown>
  if (typeof json?.codStatus === "number" && json.codStatus < 0)
    throw new Error(`Argus ${endpoint} → ${json.descStatus}`)
  return json as T
}

// GET /api/debug/sdr-quality
// Expõe os dados brutos de match entre tabulacoesdetalhadas e desempenhoresumido.
// Usar para diagnosticar por que pct_nao_tabulou / pct_cliente_desligou ficam zerados.

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: "ARGUS_BASE_URL ou ARGUS_TOKEN não configurados" }, { status: 500 })
  }

  try {
    const [rawDesempenho, rawTabulacoes] = await Promise.all([
      argusPost("report/desempenhoresumido",   { ultimosMinutos: 480 }),
      argusPost("report/tabulacoesdetalhadas", { ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
    ])

    const desempenhoItems = extractArray<ArgusDesempenhoItem>(rawDesempenho, [
      "desempenhosResumidos", "itens", "data", "relatorio", "agentes", "operadores",
    ])
    const tabulacaoItems = extractArray<ArgusTabulacaoItem>(rawTabulacoes, [
      "itens", "data", "tabulacoes", "resultados", "tabulacoesDetalhadas",
    ])

    const sdrs = adaptSDRs(desempenhoItems, VENDAS_LIST)

    // Valores únicos de diagnóstico
    const usuarioOperadores = [...new Set(
      tabulacaoItems.map(t => (t.usuarioOperador ?? "").trim()).filter(Boolean)
    )].sort()

    const origemTabulacaoValores = [...new Set(
      tabulacaoItems.map(t => t.origemTabulacao ?? "(undefined)")
    )].sort()

    const sdrsNomes = sdrs.map(s => s.name)

    // Replicar buildSdrQuality inline para mostrar o mapa resultante
    type Entry = { tabulou: number; cliente_desligou: number }
    const qualityMap = new Map<string, Entry>()
    for (const item of tabulacaoItems) {
      if ((item.origemTabulacao ?? "").toUpperCase().includes("DISCADOR")) continue
      const op = (item.usuarioOperador ?? "").toUpperCase().trim()
      if (!op || op === "DISCADOR") continue
      if (!qualityMap.has(op)) qualityMap.set(op, { tabulou: 0, cliente_desligou: 0 })
      const e = qualityMap.get(op)!
      e.tabulou++
      if ((item.tabulado ?? "").toUpperCase().includes("CLIENTE DESLIGOU")) e.cliente_desligou++
    }

    // Enriquecer com nao_tabulou usando ligacoes_atendidas do desempenho
    function lookupQuality(name: string) {
      const upper = name.toUpperCase().trim()
      if (qualityMap.has(upper)) return qualityMap.get(upper)!
      const firstName = upper.split(" ")[0]
      if (firstName.length > 2) {
        for (const [key, val] of qualityMap) {
          if (key.includes(firstName)) return val
        }
      }
      return { tabulou: 0, cliente_desligou: 0 }
    }

    const sdrQualityMap: Record<string, { tabulou: number; nao_tabulou: number; cliente_desligou: number; ligacoes_atendidas: number; match_key: string }> = {}
    for (const sdr of sdrs) {
      const q = lookupQuality(sdr.name)
      const nao_tabulou = Math.max(0, sdr.ligacoes_atendidas - q.tabulou)
      // Mostra qual chave foi efetivamente usada no mapa
      const upperName = sdr.name.toUpperCase().trim()
      const matchedKey = qualityMap.has(upperName)
        ? upperName
        : (() => {
            const fn = upperName.split(" ")[0]
            for (const k of qualityMap.keys()) { if (k.includes(fn)) return k }
            return "(sem match)"
          })()
      sdrQualityMap[sdr.name] = {
        ligacoes_atendidas: sdr.ligacoes_atendidas,
        tabulou:            q.tabulou,
        nao_tabulou,
        cliente_desligou:   q.cliente_desligou,
        match_key:          matchedKey,
      }
    }

    const tabulacoesOperador = tabulacaoItems.filter(t =>
      !(t.origemTabulacao ?? "").toUpperCase().includes("DISCADOR")
    ).length
    const tabulacoesDiscador = tabulacaoItems.filter(t =>
      (t.origemTabulacao ?? "").toUpperCase().includes("DISCADOR")
    ).length

    // Amostra de até 10 tabulações do operador (exclui registros automáticos do discador)
    const sample = tabulacaoItems
      .filter(t => !(t.origemTabulacao ?? "").toUpperCase().includes("DISCADOR"))
      .slice(0, 10)
      .map(t => ({
        usuarioOperador: t.usuarioOperador,
        origemTabulacao: t.origemTabulacao,
        tabulado:        t.tabulado,
      }))

    return NextResponse.json({
      usuarioOperadores,
      origemTabulacaoValores,
      sdrsNomes,
      sdrQualityMap,
      qualityMapKeys: [...qualityMap.keys()],
      tabulacaoItemsTotal: tabulacaoItems.length,
      tabulacoesOperador,
      tabulacoesDiscador,
      sample,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
