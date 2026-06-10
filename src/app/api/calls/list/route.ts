import { NextResponse } from "next/server"
import { generateMockRecordings } from "@/lib/mock-calls"
import { getVendasAllowlist } from "@/lib/argus-adapter"
import type { CallRecording } from "@/types/calls"

const BASE_URL    = process.env.ARGUS_BASE_URL
const TOKEN       = process.env.ARGUS_TOKEN
const CAMPAIGN_ID = Number(process.env.ARGUS_CAMPAIGN_ID ?? "1")
const VENDAS_LIST = getVendasAllowlist(process.env.ARGUS_SDR_ALLOWLIST)

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}****-${digits.slice(-4)}`
  }
  return phone.replace(/\d(?=\d{4})/g, "*")
}

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ recordings: generateMockRecordings(), source: "mock" })
  }

  try {
    const res = await fetch(`${BASE_URL}/report/ligacoesdetalhadas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-Signature": TOKEN },
      body: JSON.stringify({ ultimosMinutos: 480, idCampanha: CAMPAIGN_ID }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Argus ligacoesdetalhadas → HTTP ${res.status}: ${body.slice(0, 400)}`)
    }

    const json = await res.json() as Record<string, unknown>
    if (typeof json?.codStatus === "number" && json.codStatus < 0) {
      throw new Error(String(json.descStatus ?? "erro Argus"))
    }

    const items = (json.ligacoesDetalhadas ?? []) as Record<string, unknown>[]

    // Keep only answered calls from Vendas SDRs — partial first-name match, same as cockpit
    const recordings: CallRecording[] = items
      .filter((item) => {
        const operador  = String(item.usuarioOperador ?? "").toUpperCase().trim()
        const resultado = String(item.resultadoLigacao ?? "")
        if (resultado !== "ATENDIMENTO") return false
        if (!operador || operador === "DISCADOR") return false
        return VENDAS_LIST.some((allowed) => {
          const firstName = allowed.split(" ")[0]
          return firstName.length > 2 && operador.includes(firstName)
        })
      })
      .sort((a, b) =>
        String(b.dataHoraLigacao ?? "").localeCompare(String(a.dataHoraLigacao ?? ""))
      )
      .slice(0, 60)
      .map((item) => ({
        id:               String(item.idLigacao ?? ""),
        arquivo:          String(item.idLigacao ?? ""),  // used by downloadgravacao
        sdr_name:         String(item.usuarioOperador ?? "SDR"),
        sdr_id:           String(item.idUsuario ?? ""),
        phone:            maskPhone(String(item.telefone ?? "")),
        school_name:      String(item.nomeCliente ?? item.lote ?? "—"),
        started_at:       String(item.dataHoraLigacao ?? new Date().toISOString()),
        duration_seconds: Number(item.tempoSegundos ?? 0),
      }))

    return NextResponse.json({ recordings, source: "argus" })
  } catch (err) {
    console.error("[calls/list] Argus error, using mock:", err)
    return NextResponse.json({ recordings: generateMockRecordings(), source: "mock" })
  }
}
