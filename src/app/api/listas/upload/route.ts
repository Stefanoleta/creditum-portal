import { NextRequest, NextResponse } from "next/server"
import { parseLista, type LeadInput } from "@/lib/lista-parser"
import { supabase } from "@/lib/supabase-server"

// Supabase retorna o lado "um" de FK como array no PostgREST
type PhoneRow = {
  telefone_principal: string | null
  listas: Array<{ nome_arquivo: string }> | { nome_arquivo: string } | null
}

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

    // Fases: sem confirmar → preview (nunca salva); confirmar=true → salva
    const confirmar  = form.get("confirmar")  === "true"
    const substituir = form.get("substituir") === "true"

    const totalHigienizacao = leads.filter(l => l.precisa_higienizacao).length

    // Sem Supabase: retorna apenas preview, nunca salva
    if (!supabase) {
      return NextResponse.json({
        total_leads:              meta.total,
        total_higienizacao:       totalHigienizacao,
        duplicata_lista:          null,
        duplicatas_mesma_lista:   0,
        duplicatas_outras_listas: [],
        novos_leads:              meta.total,
        meta:                     { ...meta, unidade, tipo_lista, data_lista },
        preview:                  leads.slice(0, 5),
        warning:                  "Supabase não configurado — dados não foram salvos",
      })
    }

    // Meta obrigatória para qualquer operação real
    if (!unidade || !tipo_lista || !data_lista) {
      return NextResponse.json({
        error:                    "Não foi possível detectar unidade, tipo_lista ou data_lista. Envie esses campos no form.",
        meta,
        preview:                  leads.slice(0, 10),
        total_higienizacao:       totalHigienizacao,
        duplicata_lista:          null,
        duplicatas_mesma_lista:   0,
        duplicatas_outras_listas: [],
        novos_leads:              meta.total,
      }, { status: 422 })
    }

    // ── Camada 1: verifica lista duplicada ─────────────────────────────────────

    const { data: existingLista, error: listCheckErr } = await supabase
      .from("listas")
      .select("id, uploaded_at")
      .eq("nome_arquivo", filename)
      .eq("unidade", unidade)
      .eq("data_lista", data_lista)
      .maybeSingle()

    if (listCheckErr) console.error("[upload] lista check:", listCheckErr.message)

    // ── Camada 2a: dedup dentro do próprio arquivo ─────────────────────────────

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

    // ── Camada 2b: verifica telefones contra leads já no banco ─────────────────

    const phones = [...seenPhones]
    const existingPhoneMap = new Map<string, string>()  // telefone → nome_arquivo da lista origem

    if (phones.length > 0) {
      // Ao substituir lista existente, excluí-la da verificação cross-lista
      let query = supabase
        .from("leads")
        .select("telefone_principal, listas(nome_arquivo)")
        .in("telefone_principal", phones)

      if (existingLista && substituir) {
        query = query.neq("lista_id", existingLista.id)
      }

      const { data: rawPhones, error: phoneErr } = await query

      if (phoneErr) {
        console.error("[upload] phone check:", phoneErr.message)
      } else {
        for (const row of (rawPhones ?? []) as PhoneRow[]) {
          const p = row.telefone_principal
          const listaData = row.listas
          const nome = Array.isArray(listaData)
            ? (listaData[0]?.nome_arquivo ?? "lista anterior")
            : (listaData?.nome_arquivo ?? "lista anterior")
          if (p && !existingPhoneMap.has(p)) existingPhoneMap.set(p, nome)
        }
      }
    }

    // Anota leads com info de duplicata cross-lista
    const duplicatasOutrasListas: Array<{ nome: string; telefone: string; lista_origem: string }> = []
    const annotatedLeads: LeadInput[] = dedupedLeads.map(lead => {
      const phone = lead.telefone_principal
      if (phone && existingPhoneMap.has(phone)) {
        const listaOrigem = existingPhoneMap.get(phone)!
        duplicatasOutrasListas.push({ nome: lead.nome, telefone: phone, lista_origem: listaOrigem })
        return { ...lead, observacao: `Lead já presente em ${listaOrigem}` }
      }
      return lead
    })

    const novosLeads       = annotatedLeads.length - duplicatasOutrasListas.length
    const resolvedMeta     = { ...meta, unidade, tipo_lista, data_lista }
    const duplicataListaInfo = existingLista
      ? { lista_id: existingLista.id, uploaded_at: existingLista.uploaded_at as string }
      : null

    // ── Fase de preview (sem confirmar) — nunca salva ──────────────────────────

    if (!confirmar) {
      return NextResponse.json({
        meta:                     resolvedMeta,
        preview:                  annotatedLeads.slice(0, 5),
        total_leads:              annotatedLeads.length,
        total_higienizacao:       totalHigienizacao,
        duplicata_lista:          duplicataListaInfo,
        duplicatas_mesma_lista:   duplicatasMesmaLista,
        duplicatas_outras_listas: duplicatasOutrasListas,
        novos_leads:              novosLeads,
      })
    }

    // ── Fase de confirmação (salva) ────────────────────────────────────────────

    if (existingLista) {
      if (substituir) {
        const { error: deleteErr } = await supabase
          .from("listas")
          .delete()
          .eq("id", existingLista.id)

        if (deleteErr) {
          console.error("[upload] delete lista:", deleteErr.message)
          return NextResponse.json({ error: "Erro ao substituir lista", detail: deleteErr.message }, { status: 500 })
        }
      } else {
        // Lista duplicada sem substituição — retorna 409
        return NextResponse.json({
          error:              "duplicata_lista",
          mensagem:           `Esta lista já foi importada em ${new Date(existingLista.uploaded_at as string).toLocaleDateString("pt-BR")}`,
          lista_id_existente: existingLista.id,
        }, { status: 409 })
      }
    }

    // Insere lista
    const { data: listaRow, error: listaErr } = await supabase
      .from("listas")
      .insert({
        nome_arquivo: filename,
        unidade,
        tipo_lista,
        data_lista,
        total_leads:  annotatedLeads.length,
        formato:      meta.formato,
      })
      .select("id")
      .single()

    if (listaErr || !listaRow) {
      console.error("[upload] insert lista:", listaErr?.message)
      return NextResponse.json({ error: "Erro ao salvar lista", detail: listaErr?.message }, { status: 500 })
    }

    const lista_id = listaRow.id

    // Insere leads em lotes de 200 para evitar timeout
    const BATCH = 200
    for (let i = 0; i < annotatedLeads.length; i += BATCH) {
      const batch = annotatedLeads.slice(i, i + BATCH).map(l => ({ ...l, lista_id }))
      const { error: leadsErr } = await supabase.from("leads").insert(batch)
      if (leadsErr) {
        console.error("[upload] insert leads batch:", leadsErr.message)
        return NextResponse.json({ error: "Erro ao salvar leads", detail: leadsErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      lista_id,
      total_leads:              annotatedLeads.length,
      total_higienizacao:       totalHigienizacao,
      duplicatas_mesma_lista:   duplicatasMesmaLista,
      duplicatas_outras_listas: duplicatasOutrasListas,
      novos_leads:              novosLeads,
      preview:                  annotatedLeads.slice(0, 5),
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[listas/upload]", msg)
    return NextResponse.json({ error: "Erro interno", detail: msg }, { status: 500 })
  }
}
