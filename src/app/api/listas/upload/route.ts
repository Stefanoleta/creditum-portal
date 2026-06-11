import { NextRequest, NextResponse } from "next/server"
import { parseLista, type LeadInput } from "@/lib/lista-parser"
import { supabase } from "@/lib/supabase-server"

// ─── Classificação de leads ────────────────────────────────────────────────────
//
//  Caso 1 — Telefone já existe no banco                  → NÃO importar (duplicata_ignorada)
//  Caso 2 — Lead novo (telefone não existe no banco)     → Importar normalmente
//  Caso 3 — Nome na fila de Higienização + telefone novo → Importar; sugerir substituição no lead antigo
//  Caso 4 — Telefone problemático (fixo, sem DDD, etc.)  → Importar com precisa_higienizacao=true
//
//  A duplicata_lista (por nome_arquivo+unidade+data) foi removida — o que importa é o telefone.

type HygieneLeadRow = {
  id: string
  nome: string
  telefone_principal: string | null
  listas: Array<{ nome_arquivo: string }> | { nome_arquivo: string } | null
}

type ClassifiedLead =
  | { caso: 1 }
  | { caso: 2; lead: LeadInput }
  | { caso: 3; lead: LeadInput; hygieneId: string; telefoneAntigo: string | null; listaOrigem: string }
  | { caso: 4; lead: LeadInput }

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const arquivo = form.get("arquivo")

    if (!arquivo || typeof arquivo === "string") {
      return NextResponse.json({ error: "Campo 'arquivo' obrigatório" }, { status: 400 })
    }

    const bytes = await arquivo.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = arquivo.name

    const { meta, leads } = parseLista(buffer, filename)

    // Resolve meta: override do form > detectado no nome > null
    const unidade    = (form.get("unidade")    as string | null)?.trim() || meta.unidade    || null
    const tipo_lista = (form.get("tipo_lista") as string | null)?.trim() || meta.tipo_lista || null
    const data_lista = (form.get("data_lista") as string | null)?.trim() || meta.data_lista || null
    const confirmar  = form.get("confirmar") === "true"

    // Sem Supabase: preview sem salvar
    if (!supabase) {
      return NextResponse.json({
        total_arquivo:           meta.total,
        novos_leads:             meta.total,
        duplicatas_mesma_lista:  0,
        duplicatas_ignoradas:    0,
        possiveis_higienizacoes: [],
        leads_higienizacao:      0,
        meta:                    { ...meta, unidade, tipo_lista, data_lista },
        preview:                 leads.slice(0, 5),
        warning:                 "Supabase não configurado — dados não foram salvos",
      })
    }

    // Meta obrigatória
    if (!unidade || !tipo_lista || !data_lista) {
      return NextResponse.json({
        error:                   "Não foi possível detectar unidade, tipo_lista ou data_lista.",
        meta,
        preview:                 leads.slice(0, 10),
        total_arquivo:           meta.total,
        novos_leads:             0,
        duplicatas_mesma_lista:  0,
        duplicatas_ignoradas:    0,
        possiveis_higienizacoes: [],
        leads_higienizacao:      leads.filter(l => l.precisa_higienizacao).length,
      }, { status: 422 })
    }

    // ── Dedup dentro do arquivo (mesmo telefone repetido) ─────────────────────

    const seenPhones = new Set<string>()
    let duplicatasMesmaLista = 0
    const dedupedLeads: LeadInput[] = []

    for (const lead of leads) {
      const phone = lead.telefone_principal
      if (phone) {
        if (seenPhones.has(phone)) { duplicatasMesmaLista++; continue }
        seenPhones.add(phone)
      }
      dedupedLeads.push(lead)
    }

    // ── Consultas ao banco em batch ───────────────────────────────────────────

    // Telefones válidos (não problemáticos) para verificar no banco
    const validPhones = dedupedLeads
      .filter(l => !l.precisa_higienizacao && l.telefone_principal)
      .map(l => l.telefone_principal as string)

    // Nomes dos leads com telefone válido (candidatos a Caso 3)
    const candidateNames = dedupedLeads
      .filter(l => !l.precisa_higienizacao && l.nome !== "(sem nome)")
      .map(l => l.nome)

    // Consulta 1: telefones já existentes no banco
    const existingPhoneSet = new Set<string>()
    if (validPhones.length > 0) {
      const { data: phonesInDB } = await supabase
        .from("leads")
        .select("telefone_principal")
        .in("telefone_principal", validPhones)

      for (const row of phonesInDB ?? []) {
        if (row.telefone_principal) existingPhoneSet.add(row.telefone_principal)
      }
    }

    // Consulta 2: leads na fila de Higienização com nome igual (Caso 3)
    const hygieneLeadByName = new Map<string, { id: string; telefoneAntigo: string | null; listaOrigem: string }>()
    if (candidateNames.length > 0) {
      const { data: hygieneRows } = await supabase
        .from("leads")
        .select("id, nome, telefone_principal, listas(nome_arquivo)")
        .in("nome", candidateNames)
        .eq("precisa_higienizacao", true)
        .is("higienizado_em", null)

      for (const row of (hygieneRows ?? []) as HygieneLeadRow[]) {
        if (!hygieneLeadByName.has(row.nome)) {
          const listaData = row.listas
          const listaOrigem = Array.isArray(listaData)
            ? (listaData[0]?.nome_arquivo ?? "lista anterior")
            : (listaData?.nome_arquivo ?? "lista anterior")
          hygieneLeadByName.set(row.nome, {
            id:           row.id,
            telefoneAntigo: row.telefone_principal,
            listaOrigem,
          })
        }
      }
    }

    // ── Classificação ─────────────────────────────────────────────────────────

    const classified: ClassifiedLead[] = []

    for (const lead of dedupedLeads) {
      const phone = lead.telefone_principal

      // Caso 4: telefone problemático
      if (lead.precisa_higienizacao) {
        classified.push({ caso: 4, lead })
        continue
      }
      // Caso 1: telefone já existe no banco
      if (phone && existingPhoneSet.has(phone)) {
        classified.push({ caso: 1 })
        continue
      }
      // Caso 3: nome na fila de Higienização + telefone novo
      if (lead.nome !== "(sem nome)" && hygieneLeadByName.has(lead.nome)) {
        const hy = hygieneLeadByName.get(lead.nome)!
        classified.push({ caso: 3, lead, hygieneId: hy.id, telefoneAntigo: hy.telefoneAntigo, listaOrigem: hy.listaOrigem })
        continue
      }
      // Caso 2: lead novo
      classified.push({ caso: 2, lead })
    }

    // Contagens para o resumo
    const caso2 = classified.filter(c => c.caso === 2) as Extract<ClassifiedLead, { caso: 2 }>[]
    const caso3 = classified.filter(c => c.caso === 3) as Extract<ClassifiedLead, { caso: 3 }>[]
    const caso4 = classified.filter(c => c.caso === 4) as Extract<ClassifiedLead, { caso: 4 }>[]

    const novosLeads      = caso2.length
    const duplicatasIgn   = classified.filter(c => c.caso === 1).length
    const leadsHigienizacao = caso4.length
    const totalArquivo    = novosLeads + duplicatasMesmaLista + duplicatasIgn + caso3.length + leadsHigienizacao

    const possiveisHigienizacoes = caso3.map(c => ({
      nome:           c.lead.nome,
      telefone_novo:  c.lead.telefone_principal ?? "",
      telefone_antigo: c.telefoneAntigo ?? "",
      lista_origem:   c.listaOrigem,
    }))

    const resolvedMeta = { ...meta, unidade, tipo_lista, data_lista }
    const allToInsert  = [...caso2.map(c => c.lead), ...caso3.map(c => c.lead), ...caso4.map(c => c.lead)]
    const preview      = allToInsert.slice(0, 5)

    // DEBUG: conta quantos leads têm precisa_higienizacao=true antes de salvar
    console.log(`[upload] ${allToInsert.length} leads a inserir | higienizacao: ${leadsHigienizacao} | novos: ${novosLeads} | sugestao: ${caso3.length} | duplicatas: ${duplicatasIgn}`)
    if (leadsHigienizacao > 0) {
      const motivos = caso4.map(c => `${c.lead.nome} → ${c.lead.motivo_higienizacao} (${c.lead.telefone_principal ?? "sem tel"})`)
      console.log("[upload] Leads higienizacao:", motivos.slice(0, 10))
    }

    // ── Fase de preview — nunca salva ─────────────────────────────────────────

    if (!confirmar) {
      return NextResponse.json({
        meta:                    resolvedMeta,
        preview,
        total_arquivo:           totalArquivo,
        total_leads:             novosLeads + caso3.length,
        leads_higienizacao:      leadsHigienizacao,
        novos_leads:             novosLeads,
        duplicatas_mesma_lista:  duplicatasMesmaLista,
        duplicatas_ignoradas:    duplicatasIgn,
        possiveis_higienizacoes: possiveisHigienizacoes,
      })
    }

    // ── Fase de confirmação — salva ───────────────────────────────────────────

    // Insere lista (total_leads conta apenas válidos, excluindo Caso 4)
    const { data: listaRow, error: listaErr } = await supabase
      .from("listas")
      .insert({
        nome_arquivo: filename,
        unidade,
        tipo_lista,
        data_lista,
        total_leads:  novosLeads + caso3.length,
        formato:      meta.formato,
      })
      .select("id")
      .single()

    if (listaErr || !listaRow) {
      console.error("[upload] insert lista:", listaErr?.message)
      return NextResponse.json({ error: "Erro ao salvar lista", detail: listaErr?.message }, { status: 500 })
    }

    const lista_id = listaRow.id

    // Insere leads em lotes de 200 (Caso 2 + Caso 3 + Caso 4)
    const BATCH = 200
    for (let i = 0; i < allToInsert.length; i += BATCH) {
      const batch = allToInsert.slice(i, i + BATCH).map(l => ({ ...l, lista_id }))
      const { error: leadsErr } = await supabase.from("leads").insert(batch)
      if (leadsErr) {
        console.error("[upload] insert leads batch:", leadsErr.message)
        return NextResponse.json({ error: "Erro ao salvar leads", detail: leadsErr.message }, { status: 500 })
      }
    }

    // Atualiza leads antigos da Higienização com sugestão de substituição (Caso 3)
    for (const c of caso3) {
      const { error: sugErr } = await supabase
        .from("leads")
        .update({
          sugestao_substituicao:    true,
          telefone_sugerido:        c.lead.telefone_principal,
          sugestao_origem_lista_id: lista_id,
        })
        .eq("id", c.hygieneId)

      if (sugErr) console.error("[upload] sugestao update:", sugErr.message)
    }

    return NextResponse.json({
      lista_id,
      total_leads:             novosLeads + caso3.length,
      leads_higienizacao:      leadsHigienizacao,
      novos_leads:             novosLeads,
      duplicatas_mesma_lista:  duplicatasMesmaLista,
      duplicatas_ignoradas:    duplicatasIgn,
      possiveis_higienizacoes: possiveisHigienizacoes,
      total_arquivo:           totalArquivo,
      preview,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[listas/upload]", msg)
    return NextResponse.json({ error: "Erro interno", detail: msg }, { status: 500 })
  }
}
