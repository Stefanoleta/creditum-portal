import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"

// POST /api/leads/higienizacao/import
// Recebe Excel com resultado da higienizadora (ex: Lemitti).
// Detecta automaticamente qual coluna contém o telefone e qual contém o status.
// Leads com status indicando número inválido recebem numero_invalido = true
// e são removidos da fila de higienização (precisa_higienizacao = false).
//
// Body: multipart/form-data com campo "arquivo" (xlsx/xls)
// Resposta: { total, invalidos, validos, nao_encontrados }

const INVALID_MARKERS = [
  "inválido", "invalido", "invalid", "inexistente",
  "cancelado", "erro", "error", "nao existe", "não existe",
  "desconhecido", "n", "false", "0", "no",
]

const PHONE_COL_HINTS   = ["telefone", "phone", "numero", "número", "tel", "celular", "fone"]
const STATUS_COL_HINTS  = ["status", "resultado", "situação", "situacao", "valido", "válido", "result"]

function detectPhone(headers: string[]): number {
  const norm = headers.map(h => h.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").trim())
  for (const hint of PHONE_COL_HINTS) {
    const idx = norm.findIndex(h => h.includes(hint))
    if (idx >= 0) return idx
  }
  return 0
}

function detectStatus(headers: string[]): number {
  const norm = headers.map(h => h.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").trim())
  for (const hint of STATUS_COL_HINTS) {
    const idx = norm.findIndex(h => h.includes(hint))
    if (idx >= 0) return idx
  }
  return 1
}

function isInvalid(val: unknown): boolean {
  const s = String(val ?? "").toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").trim()
  return INVALID_MARKERS.some(m => s === m || s.startsWith(m))
}

function normalizeDigits(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "").replace(/^55/, "").replace(/^0/, "")
}

export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Formato de body inválido — envie multipart/form-data" }, { status: 400 })
  }

  const arquivo = formData.get("arquivo") as File | null
  if (!arquivo) {
    return NextResponse.json({ error: "Campo 'arquivo' ausente" }, { status: 400 })
  }

  const buf = Buffer.from(await arquivo.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "buffer" })
  } catch {
    return NextResponse.json({ error: "Arquivo inválido — não foi possível ler o Excel" }, { status: 400 })
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]

  if (!raw || raw.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem dados" }, { status: 400 })
  }

  const headers = (raw[0] as unknown[]).map(String)
  const phoneCol  = detectPhone(headers)
  const statusCol = detectStatus(headers)

  // Separa inválidos de válidos
  const invalidPhones = new Set<string>()
  const validPhones   = new Set<string>()

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const phone  = normalizeDigits(row[phoneCol])
    const status = row[statusCol]
    if (!phone) continue
    if (isInvalid(status)) {
      invalidPhones.add(phone)
    } else {
      validPhones.add(phone)
    }
  }

  const total   = invalidPhones.size + validPhones.size
  let invalidos = 0
  let nao_encontrados = 0

  // Processa inválidos em lotes
  const invalidsArray = [...invalidPhones]
  const BATCH = 200

  for (let i = 0; i < invalidsArray.length; i += BATCH) {
    const batch = invalidsArray.slice(i, i + BATCH)

    // Busca leads que correspondem ao telefone (principal ou secundário)
    const [{ data: byPrimary }, { data: bySecondary }] = await Promise.all([
      supabase!.from("leads").select("id").in("telefone_principal", batch),
      supabase!.from("leads").select("id").in("telefone_secundario", batch),
    ])

    const ids = new Set<string>()
    for (const l of [...(byPrimary ?? []), ...(bySecondary ?? [])]) ids.add(l.id)

    if (ids.size === 0) {
      nao_encontrados += batch.length
      continue
    }

    nao_encontrados += batch.length - ids.size

    const idsArray = [...ids]
    const { error } = await supabase!
      .from("leads")
      .update({
        numero_invalido:      true,
        precisa_higienizacao: false,
        higienizado_em:       new Date().toISOString(),
      })
      .in("id", idsArray)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    invalidos += ids.size
  }

  return NextResponse.json({
    ok:              true,
    total,
    invalidos,
    validos:         validPhones.size,
    nao_encontrados,
    coluna_telefone: headers[phoneCol] ?? `Coluna ${phoneCol + 1}`,
    coluna_status:   headers[statusCol] ?? `Coluna ${statusCol + 1}`,
  })
}
