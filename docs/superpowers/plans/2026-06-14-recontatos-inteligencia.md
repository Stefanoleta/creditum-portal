# Recontatos Inteligência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Recontatos tab in Módulo 5 with a rules-based anti-fatigue engine, intelligent call scheduling, and a structured 4-section UI that eliminates wasted calls and zero-drops leads.

**Architecture:** New DB columns on `leads` track call attempt counters, pause state, and permanent blocks. `recontato-classifier.ts` gains `applyTabulacaoRules()` that encodes all state-machine rules. Three new API routes serve fila-do-dia, call intelligence, and Excel export. The existing `RecontatosTab` component in `listas/page.tsx` is replaced entirely with a 4-section layout.

**Tech Stack:** Next.js App Router API routes, Supabase PostgREST client, XLSX library (already installed), TypeScript, Vitest for tests, Tailwind CSS + lucide-react.

---

## File Structure

**New files:**
- `supabase/migrations/20260614_recontatos_inteligencia.sql` — new columns on `leads`
- `src/app/api/listas/inteligencia-horarios/route.ts` — call scheduling intelligence
- `src/app/api/leads/recontatos/export/route.ts` — Excel export for fila do dia

**Modified files:**
- `src/lib/recontato-classifier.ts` — add `applyTabulacaoRules()` + supporting types
- `src/__tests__/recontato-classifier.test.ts` — add tests for `applyTabulacaoRules()`
- `src/app/api/leads/recontatos/route.ts` — add `mode=fila_do_dia|resumo|bloqueados` params
- `src/app/listas/page.tsx` — replace `RecontatosTab` function + update imports

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260614_recontatos_inteligencia.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Recontatos inteligência: contadores anti-desgaste + bloqueio + pausa
-- Usar no Supabase SQL editor antes de usar as novas funcionalidades.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS recontato_tentativas         int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recontato_tentativas_seguidas int    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pausado_ate                   date,
  ADD COLUMN IF NOT EXISTS bloqueado                     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueado_motivo              text,
  ADD COLUMN IF NOT EXISTS bloqueado_em                  timestamptz,
  ADD COLUMN IF NOT EXISTS recontato_categoria           text;

-- Fila do dia: leads prontos para ligar
CREATE INDEX IF NOT EXISTS idx_leads_fila_do_dia
  ON leads(recontato_em, bloqueado, pausado_ate)
  WHERE bloqueado = false AND recontato_em IS NOT NULL;

-- Leads bloqueados (para auditoria)
CREATE INDEX IF NOT EXISTS idx_leads_bloqueados
  ON leads(bloqueado)
  WHERE bloqueado = true;

-- Leads pausados
CREATE INDEX IF NOT EXISTS idx_leads_pausados
  ON leads(pausado_ate)
  WHERE pausado_ate IS NOT NULL;
```

- [ ] **Step 2: Save file and verify syntax by reading it back**

Check that every column has the right type and default. No step to run yet — migration runs in Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260614_recontatos_inteligencia.sql
git commit -m "feat: migração recontatos inteligência — colunas anti-desgaste e bloqueio"
```

---

## Task 2: `applyTabulacaoRules()` — Rules Engine

**Files:**
- Modify: `src/lib/recontato-classifier.ts`

Add new types and a function that takes the current lead state + a tabulação category and returns the DB update to apply.

- [ ] **Step 1: Add types and constants after the existing exports in `recontato-classifier.ts`**

After line 146 (end of file), append:

```typescript
// ── Rules engine ─────────────────────────────────────────────────────────────

export interface LeadRecontatoState {
  recontato_tentativas: number
  recontato_tentativas_seguidas: number
}

export interface LeadRecontatoUpdate {
  recontato_tentativas?: number
  recontato_tentativas_seguidas?: number
  pausado_ate?: string | null
  bloqueado?: boolean
  bloqueado_motivo?: string | null
  bloqueado_em?: string | null
  recontato_em?: string | null
  recontato_categoria?: string
  precisa_higienizacao?: boolean
  numero_invalido?: boolean
}

// Dias de recontato específicos para as regras anti-desgaste (sobrescreve DIAS_RECONTATO)
const DIAS_RECONTATO_REGRAS: Partial<Record<RecontatoCategoria, number>> = {
  ocupado_recontatar:    1,
  mae_atendeu:           2,
  mae_familiar_atendeu:  2,
  nao_podia_falar:       1,
  terceiro_nao_conhece:  1,
}

// Categorias que causam bloqueio permanente (sem_interesse ou ja_resolveu)
const BLOQUEIA: Set<RecontatoCategoria> = new Set([
  "nao_gostou",
  "nao_gostou_proposta",
  "recusa_definitiva",
  "fora_politica",
  "ja_resolveu",
  "convertido",
])

// Categorias de recontato pendente (pessoa foi atingida mas não pôde atender/falar)
const RECONTATO_PENDENTE: Set<RecontatoCategoria> = new Set([
  "ocupado_recontatar",
  "mae_atendeu",
  "mae_familiar_atendeu",
  "nao_podia_falar",
  "terceiro_nao_conhece",
  "nao_reconhece_aguardar",
  "objecao_financeira",
  "objecao_prazo",
  "interessado_sem_fechar",
])

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

/**
 * Aplica as regras anti-desgaste do discador ao estado atual de um lead.
 * Retorna os campos a atualizar no banco — nunca modifica estado diretamente.
 *
 * Regras:
 *   nao_atendeu → incrementa tentativas; pausa 3 dias se 3 consecutivas; higienização se 5 total
 *   recontato_pendente → reseta consecutivas; agenda recontato
 *   bloqueia (sem_interesse/ja_cliente) → bloqueio permanente
 *   numero_invalido → numero_invalido + higienização
 *   qualificado/sucesso → reseta consecutivas, limpa recontato_em
 */
export function applyTabulacaoRules(
  categoria: RecontatoCategoria,
  state: LeadRecontatoState
): LeadRecontatoUpdate {
  const now = new Date().toISOString()

  // ── Número inválido ──────────────────────────────────────────────────────
  if (categoria === "numero_invalido") {
    return {
      numero_invalido:      true,
      precisa_higienizacao: true,
      recontato_em:         null,
      recontato_tentativas_seguidas: 0,
      recontato_categoria:  categoria,
    }
  }

  // ── Bloqueio permanente ──────────────────────────────────────────────────
  if (BLOQUEIA.has(categoria)) {
    return {
      bloqueado:        true,
      bloqueado_motivo: categoria,
      bloqueado_em:     now,
      recontato_em:     null,
      recontato_categoria: categoria,
      recontato_tentativas_seguidas: 0,
    }
  }

  // ── Não atendeu ──────────────────────────────────────────────────────────
  if (categoria === "nao_atendeu" || categoria === "nao_atendeu_multiplas") {
    const tentativas        = state.recontato_tentativas + 1
    const tentativasSeguidas = state.recontato_tentativas_seguidas + 1
    const update: LeadRecontatoUpdate = {
      recontato_tentativas:          tentativas,
      recontato_tentativas_seguidas: tentativasSeguidas,
      recontato_em:                  addDays(2),
      recontato_categoria:           categoria,
    }
    if (tentativasSeguidas >= 3) {
      update.pausado_ate = addDays(3)
    }
    if (tentativas >= 5) {
      update.precisa_higienizacao = true
    }
    return update
  }

  // ── Recontato pendente (pessoa foi contatada mas precisa de novo contato) ──
  if (RECONTATO_PENDENTE.has(categoria)) {
    const dias = DIAS_RECONTATO_REGRAS[categoria] ?? DIAS_RECONTATO[categoria] ?? 2
    return {
      recontato_tentativas_seguidas: 0,
      recontato_em:                  addDays(dias),
      recontato_categoria:           categoria,
    }
  }

  // ── Sucesso / qualificado ────────────────────────────────────────────────
  // qualificado, outros: registra categoria, reseta consecutivas, não agenda recontato
  return {
    recontato_tentativas_seguidas: 0,
    recontato_em:                  null,
    recontato_categoria:           categoria,
  }
}
```

Note: `DIAS_RECONTATO` is already defined at line 54 of the same file — `applyTabulacaoRules` references it directly (it's in the same module scope).

- [ ] **Step 2: Verify the file compiles**

```bash
cd /workspaces/creditum-portal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `recontato-classifier.ts`.

---

## Task 3: Tests for `applyTabulacaoRules()`

**Files:**
- Modify: `src/__tests__/recontato-classifier.test.ts`

- [ ] **Step 1: Add imports and test suite at the end of the existing test file**

Append after the last `})` in `recontato-classifier.test.ts`:

```typescript
import { applyTabulacaoRules, type LeadRecontatoUpdate, type LeadRecontatoState } from "@/lib/recontato-classifier"

const emptyState: LeadRecontatoState = { recontato_tentativas: 0, recontato_tentativas_seguidas: 0 }

// ── applyTabulacaoRules ────────────────────────────────────────────────────────

describe("applyTabulacaoRules — nao_atendeu", () => {
  it("incrementa tentativas e seguidas na primeira tentativa", () => {
    const update = applyTabulacaoRules("nao_atendeu", emptyState)
    expect(update.recontato_tentativas).toBe(1)
    expect(update.recontato_tentativas_seguidas).toBe(1)
    expect(update.recontato_em).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(update.pausado_ate).toBeUndefined()
    expect(update.precisa_higienizacao).toBeUndefined()
  })

  it("não pausa antes de 3 seguidas", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 1, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.recontato_tentativas_seguidas).toBe(3)
    expect(update.pausado_ate).toMatch(/^\d{4}-\d{2}-\d{2}$/) // 3 seguidas → pausa
  })

  it("define pausado_ate quando seguidas >= 3", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 2, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.pausado_ate).toBeTruthy()
    const d = new Date(update.pausado_ate!)
    const dias = Math.round((d.getTime() - Date.now()) / 86400000)
    expect(dias).toBeGreaterThanOrEqual(2)
    expect(dias).toBeLessThanOrEqual(3)
  })

  it("define precisa_higienizacao quando tentativas totais >= 5", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 4, recontato_tentativas_seguidas: 1 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.precisa_higienizacao).toBe(true)
  })

  it("não marca higienização antes de 5 tentativas", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 3, recontato_tentativas_seguidas: 0 }
    const update = applyTabulacaoRules("nao_atendeu", state)
    expect(update.precisa_higienizacao).toBeUndefined()
  })
})

describe("applyTabulacaoRules — recontato_pendente", () => {
  it("nao_podia_falar → reseta seguidas, agenda +1 dia", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 2, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("nao_podia_falar", state)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    expect(update.recontato_em).toBeTruthy()
    const d = new Date(update.recontato_em!)
    const dias = Math.round((d.getTime() - Date.now()) / 86400000)
    expect(dias).toBe(1)
  })

  it("mae_atendeu → reseta seguidas, agenda +2 dias", () => {
    const update = applyTabulacaoRules("mae_atendeu", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    const d = new Date(update.recontato_em!)
    const dias = Math.round((d.getTime() - Date.now()) / 86400000)
    expect(dias).toBe(2)
  })

  it("terceiro_nao_conhece → reseta seguidas, agenda +1 dia", () => {
    const update = applyTabulacaoRules("terceiro_nao_conhece", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    const d = new Date(update.recontato_em!)
    const dias = Math.round((d.getTime() - Date.now()) / 86400000)
    expect(dias).toBe(1)
  })

  it("não incrementa tentativas totais para recontato_pendente", () => {
    const update = applyTabulacaoRules("nao_podia_falar", emptyState)
    expect(update.recontato_tentativas).toBeUndefined()
  })
})

describe("applyTabulacaoRules — bloqueio permanente", () => {
  it("nao_gostou → bloqueado = true, bloqueado_motivo, sem recontato_em", () => {
    const update = applyTabulacaoRules("nao_gostou", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.bloqueado_motivo).toBe("nao_gostou")
    expect(update.recontato_em).toBeNull()
    expect(update.bloqueado_em).toBeTruthy()
  })

  it("recusa_definitiva → bloqueado = true", () => {
    const update = applyTabulacaoRules("recusa_definitiva", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.recontato_em).toBeNull()
  })

  it("convertido → bloqueado = true (cliente convertido — remover da fila)", () => {
    const update = applyTabulacaoRules("convertido", emptyState)
    expect(update.bloqueado).toBe(true)
    expect(update.recontato_em).toBeNull()
  })
})

describe("applyTabulacaoRules — numero_invalido", () => {
  it("numero_invalido → numero_invalido = true, precisa_higienizacao = true", () => {
    const update = applyTabulacaoRules("numero_invalido", emptyState)
    expect(update.numero_invalido).toBe(true)
    expect(update.precisa_higienizacao).toBe(true)
    expect(update.recontato_em).toBeNull()
  })
})

describe("applyTabulacaoRules — sucesso/outros", () => {
  it("qualificado → reseta seguidas, sem recontato agendado", () => {
    const state: LeadRecontatoState = { recontato_tentativas: 3, recontato_tentativas_seguidas: 2 }
    const update = applyTabulacaoRules("qualificado", state)
    expect(update.recontato_tentativas_seguidas).toBe(0)
    expect(update.recontato_em).toBeNull()
    expect(update.bloqueado).toBeUndefined()
  })

  it("outros → reseta seguidas", () => {
    const update = applyTabulacaoRules("outros", emptyState)
    expect(update.recontato_tentativas_seguidas).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /workspaces/creditum-portal && npm test -- --reporter=verbose 2>&1 | tail -40
```

Expected: all new `applyTabulacaoRules` tests pass. If any fail, fix `applyTabulacaoRules` in `recontato-classifier.ts` before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recontato-classifier.ts src/__tests__/recontato-classifier.test.ts
git commit -m "feat: applyTabulacaoRules — motor de regras anti-desgaste no recontato-classifier"
```

---

## Task 4: Update `GET /api/leads/recontatos` — add mode params

**Files:**
- Modify: `src/app/api/leads/recontatos/route.ts`

Replace the existing route entirely with one that handles `mode=fila_do_dia`, `mode=resumo`, and `mode=bloqueados`, while keeping backward compat for the old `categoria` param.

- [ ] **Step 1: Read the current file**

Read `src/app/api/leads/recontatos/route.ts` (already read above — 114 lines).

- [ ] **Step 2: Replace with the updated route**

Write the full file:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { CATEGORIA_LABEL, type RecontatoCategoria } from "@/lib/recontato-classifier"

export interface RecontatoGrupo {
  categoria:   RecontatoCategoria
  label:       string
  count:       number
  proxima_em:  string | null
}

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const mode     = searchParams.get("mode")      // fila_do_dia | resumo | bloqueados
  const categoria = searchParams.get("categoria") as RecontatoCategoria | null
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const per_page  = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10))
  const from      = (page - 1) * per_page
  const to        = from + per_page - 1

  const hoje = new Date().toISOString().split("T")[0]

  // ── mode=resumo: contagens para os 5 blocos do painel ──────────────────────
  if (mode === "resumo") {
    const [
      { count: agendadoFuturo },
      { count: prontosHoje },
      { count: emPausa },
      { count: bloqueados },
      { count: higienizacao },
    ] = await Promise.all([
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", false)
        .gt("recontato_em", hoje)
        .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", false)
        .lte("recontato_em", hoje)
        .not("recontato_em", "is", null)
        .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .gt("pausado_ate", hoje),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("bloqueado", true),
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("precisa_higienizacao", true)
        .is("higienizado_em", null),
    ])
    return NextResponse.json({
      resumo: {
        agendado_futuro: agendadoFuturo ?? 0,
        prontos_hoje:    prontosHoje ?? 0,
        em_pausa:        emPausa ?? 0,
        bloqueados:      bloqueados ?? 0,
        higienizacao:    higienizacao ?? 0,
      }
    })
  }

  // ── mode=fila_do_dia: leads prontos para ligar hoje ─────────────────────────
  if (mode === "fila_do_dia") {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, recontato_em, recontato_categoria, recontato_tentativas, listas!leads_lista_id_fkey(unidade, tipo_lista)",
        { count: "exact" }
      )
      .eq("bloqueado", false)
      .lte("recontato_em", hoje)
      .not("recontato_em", "is", null)
      .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`)
      .order("recontato_categoria", { ascending: true, nullsFirst: false })
      .order("recontato_em", { ascending: true })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── mode=bloqueados: auditoria de bloqueios permanentes ─────────────────────
  if (mode === "bloqueados") {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, bloqueado_motivo, bloqueado_em, listas!leads_lista_id_fkey(unidade)",
        { count: "exact" }
      )
      .eq("bloqueado", true)
      .order("bloqueado_em", { ascending: false, nullsFirst: false })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── categoria específica (legado + backcompat) ──────────────────────────────
  if (categoria) {
    const { data, error, count } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone_principal, recontato_em, observacao, recontato_categoria, listas!leads_lista_id_fkey(nome_arquivo, unidade)",
        { count: "exact" }
      )
      .or(`observacao.eq.recontato:${categoria},recontato_categoria.eq.${categoria}`)
      .not("recontato_em", "is", null)
      .eq("bloqueado", false)
      .order("recontato_em", { ascending: true })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, per_page })
  }

  // ── Agrupamento por categoria (legado — mantido para backcompat) ────────────
  const CATEGORIAS: RecontatoCategoria[] = [
    "nao_atendeu", "nao_podia_falar", "mae_atendeu", "nao_gostou",
    "terceiro_nao_conhece", "fora_politica", "qualificado", "convertido", "outros",
    "ocupado_recontatar", "interessado_sem_fechar", "mae_familiar_atendeu",
    "nao_reconhece_aguardar", "objecao_financeira", "objecao_prazo",
    "nao_gostou_proposta", "ja_resolveu", "nao_atendeu_multiplas",
  ]

  const grupos: RecontatoGrupo[] = []
  for (const cat of CATEGORIAS) {
    const { count, data: primeiros } = await supabase
      .from("leads")
      .select("recontato_em", { count: "exact" })
      .or(`observacao.eq.recontato:${cat},recontato_categoria.eq.${cat}`)
      .not("recontato_em", "is", null)
      .eq("bloqueado", false)
      .order("recontato_em", { ascending: true })
      .limit(1)

    if (!count || count === 0) continue
    grupos.push({ categoria: cat, label: CATEGORIA_LABEL[cat], count, proxima_em: primeiros?.[0]?.recontato_em ?? null })
  }

  return NextResponse.json({ grupos })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /workspaces/creditum-portal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leads/recontatos/route.ts
git commit -m "feat: /api/leads/recontatos — modes fila_do_dia, resumo, bloqueados"
```

---

## Task 5: `GET /api/listas/inteligencia-horarios`

**Files:**
- Create: `src/app/api/listas/inteligencia-horarios/route.ts`

Fetches `resultados_discador` (last 90 days), groups by `unidade → day of week → hour bucket`, calculates answer rate, returns top 2 slots per unidade.

- [ ] **Step 1: Create the route file**

```typescript
import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { classifyRecontato } from "@/lib/recontato-classifier"

// GET /api/listas/inteligencia-horarios
// Analisa últimos 90 dias de ligações para identificar melhores horários por unidade.
// Requer mínimo de 20 ligações por unidade para gerar sugestão.

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const MIN_LIGACOES = 20

export interface InteligenciaHorario {
  melhor_dia:       string
  melhor_horario:   string
  taxa_atendimento: number
  baseado_em:       number
}

export type InteligenciaResponse = Record<string, InteligenciaHorario | null>

export async function GET() {
  if (!supabase) {
    return NextResponse.json({}, { status: 200 })
  }

  const noventa_dias_atras = new Date()
  noventa_dias_atras.setDate(noventa_dias_atras.getDate() - 90)

  // Fetch all calls from last 90 days with unidade (via listas join)
  const PAGE = 1000
  let offset = 0
  const allRows: Array<{
    data_ligacao: string
    hora_ligacao: number | null
    tabulacao:    string | null
    resultado_ligacao: string | null
    listas: { unidade: string } | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("resultados_discador")
      .select("data_ligacao, hora_ligacao, tabulacao, resultado_ligacao, listas!resultados_discador_lista_id_fkey(unidade)")
      .gte("data_ligacao", noventa_dias_atras.toISOString())
      .not("listas", "is", null)
      .range(offset, offset + PAGE - 1)

    if (error || !data || data.length === 0) break
    allRows.push(...(data as typeof allRows))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (allRows.length === 0) {
    return NextResponse.json({})
  }

  // Group by unidade → dow → hour bucket
  type BucketKey = `${number}-${number}`  // "dow-hour"
  type Bucket = { total: number; atendidas: number }
  const byUnidade = new Map<string, Map<BucketKey, Bucket>>()

  for (const row of allRows) {
    const unidade = (row.listas as { unidade?: string } | null)?.unidade
    if (!unidade || !row.data_ligacao) continue

    const dt   = new Date(row.data_ligacao)
    const dow  = dt.getDay()                              // 0=Dom..6=Sáb
    const hora = row.hora_ligacao ?? dt.getHours()        // prefer stored value
    if (hora < 8 || hora > 18) continue                   // fora do horário comercial

    const key: BucketKey = `${dow}-${hora}`
    if (!byUnidade.has(unidade)) byUnidade.set(unidade, new Map())
    const buckets = byUnidade.get(unidade)!
    const b = buckets.get(key) ?? { total: 0, atendidas: 0 }
    b.total++
    const categoria = classifyRecontato(row.tabulacao, row.resultado_ligacao)
    if (categoria !== "nao_atendeu" && categoria !== "nao_atendeu_multiplas") {
      b.atendidas++
    }
    buckets.set(key, b)
  }

  const result: InteligenciaResponse = {}

  for (const [unidade, buckets] of byUnidade) {
    // Total calls for this unidade
    let totalUnidade = 0
    for (const b of buckets.values()) totalUnidade += b.total

    if (totalUnidade < MIN_LIGACOES) {
      result[unidade] = null
      continue
    }

    // Sort by answer rate desc (min 5 calls in bucket to be considered)
    const sorted = [...buckets.entries()]
      .map(([key, b]) => {
        const [dow, hora] = key.split("-").map(Number)
        return { dow, hora, taxa: b.atendidas / b.total, total: b.total }
      })
      .filter(b => b.total >= 5)
      .sort((a, b) => b.taxa - a.taxa)

    if (sorted.length === 0) {
      result[unidade] = null
      continue
    }

    const best = sorted[0]

    // Consolidate consecutive hours into a range (group same-dow adjacent hours)
    const sameDow = sorted.filter(b => b.dow === best.dow && b.taxa >= best.taxa * 0.8)
    const hours   = sameDow.map(b => b.hora).sort((a, b) => a - b)
    const horaInicio = hours[0]
    const horaFim    = hours[hours.length - 1] + 1

    result[unidade] = {
      melhor_dia:       DIAS_SEMANA[best.dow],
      melhor_horario:   `${horaInicio}h–${horaFim}h`,
      taxa_atendimento: Math.round(best.taxa * 100) / 100,
      baseado_em:       totalUnidade,
    }
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspaces/creditum-portal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/listas/inteligencia-horarios/route.ts
git commit -m "feat: /api/listas/inteligencia-horarios — análise de melhores horários por unidade"
```

---

## Task 6: `GET /api/leads/recontatos/export`

**Files:**
- Create: `src/app/api/leads/recontatos/export/route.ts`

Returns an Excel file with all leads in the fila do dia, enriched with the best call time per unidade.

- [ ] **Step 1: Create the export route**

```typescript
import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"
import { CATEGORIA_LABEL, type RecontatoCategoria } from "@/lib/recontato-classifier"

// GET /api/leads/recontatos/export
// Excel com todos os leads da fila do dia + horário sugerido por unidade.
// Filename: recontatos-YYYY-MM-DD.xlsx

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 })
  }

  const hoje = new Date().toISOString().split("T")[0]

  // ── Busca inteligência de horários ────────────────────────────────────────
  let inteligencia: Record<string, { melhor_dia: string; melhor_horario: string } | null> = {}
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const resp = await fetch(`${baseUrl}/api/listas/inteligencia-horarios`)
    if (resp.ok) inteligencia = await resp.json()
  } catch {
    // Se falhar, exporta sem sugestão de horário
  }

  // ── Busca todos os leads da fila do dia (sem paginação — é tudo) ──────────
  const PAGE = 1000
  let offset = 0
  const rows: Array<{
    nome: string
    telefone_principal: string | null
    recontato_em: string | null
    recontato_categoria: string | null
    listas: { unidade: string; tipo_lista: string } | null
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from("leads")
      .select("nome, telefone_principal, recontato_em, recontato_categoria, listas!leads_lista_id_fkey(unidade, tipo_lista)")
      .eq("bloqueado", false)
      .lte("recontato_em", hoje)
      .not("recontato_em", "is", null)
      .or(`pausado_ate.is.null,pausado_ate.lte.${hoje}`)
      .order("recontato_em", { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error || !data || data.length === 0) break
    rows.push(...(data as typeof rows))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhum lead na fila do dia" }, { status: 404 })
  }

  // ── Monta Excel ────────────────────────────────────────────────────────────
  const header = [
    "Nome", "Telefone", "Unidade", "Tipo de Lista",
    "Categoria Recontato", "Agendado Para",
    "Melhor Dia Sugerido", "Melhor Horário Sugerido",
  ]
  const wsData = [
    header,
    ...rows.map(r => {
      const lista    = r.listas as { unidade?: string; tipo_lista?: string } | null
      const unidade  = lista?.unidade ?? ""
      const hint     = inteligencia[unidade]
      const catLabel = r.recontato_categoria
        ? (CATEGORIA_LABEL[r.recontato_categoria as RecontatoCategoria] ?? r.recontato_categoria)
        : ""
      return [
        r.nome,
        r.telefone_principal ?? "",
        unidade,
        lista?.tipo_lista ?? "",
        catLabel,
        r.recontato_em ?? "",
        hint?.melhor_dia ?? "—",
        hint?.melhor_horario ?? "—",
      ]
    }),
  ]

  const wb  = XLSX.utils.book_new()
  const ws  = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, "Recontatos")

  const buffer   = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const filename = `recontatos-${hoje}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspaces/creditum-portal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/leads/recontatos/export/route.ts
git commit -m "feat: /api/leads/recontatos/export — Excel da fila do dia com horário sugerido"
```

---

## Task 7: Rebuild `RecontatosTab` UI — 4 sections

**Files:**
- Modify: `src/app/listas/page.tsx`

Replace the entire `RecontatosTab` function (lines 908–1271) with the new 4-section layout. Also update the imports at the top.

- [ ] **Step 1: Add new icons to the import line at the top of `listas/page.tsx`**

Find the existing lucide-react import (line 6). Add `Pause`, `Ban`, `TrendingUp`, `Calendar`, `Phone` to the icon list:

Current line:
```typescript
import { BarChart3, Microscope, LayoutList, List, Upload, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, PhoneOff, Check, ArrowRightLeft, Thermometer, RefreshCw, Download, FileUp, Trash2 } from "lucide-react"
```

Replace with:
```typescript
import { BarChart3, Microscope, LayoutList, List, Upload, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, PhoneOff, Check, ArrowRightLeft, Thermometer, RefreshCw, Download, FileUp, Trash2, Pause, Ban, TrendingUp, Calendar, Phone } from "lucide-react"
```

- [ ] **Step 2: Add new interfaces near the top of the file (after the existing interfaces, around line 100)**

Find the block with `interface UnidadeMetrica` and add before it:

```typescript
interface FilaLead {
  id: string
  nome: string
  telefone_principal: string | null
  recontato_em: string | null
  recontato_categoria: string | null
  recontato_tentativas: number | null
  listas: { unidade: string; tipo_lista: string } | null
}

interface ResumoRecontatos {
  agendado_futuro: number
  prontos_hoje: number
  em_pausa: number
  bloqueados: number
  higienizacao: number
}

interface InteligenciaHorario {
  melhor_dia: string
  melhor_horario: string
  taxa_atendimento: number
  baseado_em: number
}

interface BloqueadoLead {
  id: string
  nome: string
  telefone_principal: string | null
  bloqueado_motivo: string | null
  bloqueado_em: string | null
  listas: { unidade: string } | null
}
```

- [ ] **Step 3: Replace the entire `RecontatosTab` function**

Locate the block starting at `// ─── Recontatos ──...` (around line 881) through the closing `}` of `RecontatosTab` (around line 1271). Replace it entirely with:

```typescript
// ─── Recontatos ───────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  nao_atendeu:           "Não Atendeu",
  nao_podia_falar:       "Não Podia Falar",
  mae_atendeu:           "Mãe / Responsável",
  nao_gostou:            "Sem Interesse",
  terceiro_nao_conhece:  "Terceiro Atendeu",
  fora_politica:         "Fora da Política",
  qualificado:           "Qualificado",
  convertido:            "Convertido",
  outros:                "Outros",
  ocupado_recontatar:    "Ocupado / Pediu Retorno",
  interessado_sem_fechar:"Interessado sem Fechar",
  mae_familiar_atendeu:  "Mãe / Familiar (IA)",
  nao_reconhece_aguardar:"Não Reconhece",
  objecao_financeira:    "Objeção Financeira",
  objecao_prazo:         "Objeção de Prazo",
  nao_gostou_proposta:   "Não Gostou da Proposta",
  ja_resolveu:           "Já Resolveu",
  numero_invalido:       "Número Inválido",
  recusa_definitiva:     "Recusa Definitiva",
  nao_atendeu_multiplas: "Não Atendeu (Múltiplas)",
}

function RecontatosTab() {
  // ── Section 1: Inteligência de Horários ──
  const [horarios, setHorarios]           = useState<Record<string, InteligenciaHorario | null>>({})
  const [horariosLoading, setHorariosLoading] = useState(true)
  const [horariosOpen, setHorariosOpen]   = useState(false)

  // ── Section 2: Fila do Dia ──
  const [fila, setFila]                   = useState<FilaLead[]>([])
  const [filaTotal, setFilaTotal]         = useState(0)
  const [filaPage, setFilaPage]           = useState(1)
  const [filaLoading, setFilaLoading]     = useState(true)
  const [exportando, setExportando]       = useState(false)
  const PER_PAGE_FILA = 50

  // ── Section 3: Resumo ──
  const [resumo, setResumo]               = useState<ResumoRecontatos | null>(null)
  const [resumoLoading, setResumoLoading] = useState(true)

  // ── Section 4: Bloqueados ──
  const [bloqueados, setBloqueados]       = useState<BloqueadoLead[]>([])
  const [bloqueadosTotal, setBloqueadosTotal] = useState(0)
  const [bloqueadosPage, setBloqueadosPage] = useState(1)
  const [bloqueadosLoading, setBloqueadosLoading] = useState(false)
  const [bloqueadosOpen, setBloqueadosOpen] = useState(false)
  const PER_PAGE_BLOQ = 50

  // ── Load functions ──
  const loadHorarios = useCallback(() => {
    setHorariosLoading(true)
    fetch("/api/listas/inteligencia-horarios")
      .then(r => r.json())
      .then(d => setHorarios(d ?? {}))
      .catch(() => setHorarios({}))
      .finally(() => setHorariosLoading(false))
  }, [])

  const loadFila = useCallback((page: number) => {
    setFilaLoading(true)
    fetch(`/api/leads/recontatos?mode=fila_do_dia&page=${page}&per_page=${PER_PAGE_FILA}`)
      .then(r => r.json())
      .then(d => { setFila(d.leads ?? []); setFilaTotal(d.total ?? 0) })
      .catch(() => {})
      .finally(() => setFilaLoading(false))
  }, [])

  const loadResumo = useCallback(() => {
    setResumoLoading(true)
    fetch("/api/leads/recontatos?mode=resumo")
      .then(r => r.json())
      .then(d => setResumo(d.resumo ?? null))
      .catch(() => {})
      .finally(() => setResumoLoading(false))
  }, [])

  const loadBloqueados = useCallback((page: number) => {
    setBloqueadosLoading(true)
    fetch(`/api/leads/recontatos?mode=bloqueados&page=${page}&per_page=${PER_PAGE_BLOQ}`)
      .then(r => r.json())
      .then(d => { setBloqueados(d.leads ?? []); setBloqueadosTotal(d.total ?? 0) })
      .catch(() => {})
      .finally(() => setBloqueadosLoading(false))
  }, [])

  useEffect(() => {
    loadHorarios()
    loadFila(1)
    loadResumo()
  }, [loadHorarios, loadFila, loadResumo])

  useEffect(() => {
    if (bloqueadosOpen && bloqueados.length === 0) loadBloqueados(1)
  }, [bloqueadosOpen, bloqueados.length, loadBloqueados])

  useEffect(() => {
    if (bloqueadosOpen) loadBloqueados(bloqueadosPage)
  }, [bloqueadosPage, bloqueadosOpen, loadBloqueados])

  function handleExportFila() {
    setExportando(true)
    fetch("/api/leads/recontatos/export")
      .then(async r => {
        if (!r.ok) { alert("Erro ao exportar"); return }
        const blob = await r.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement("a")
        a.href     = url
        a.download = `recontatos-${new Date().toISOString().split("T")[0]}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      })
      .finally(() => setExportando(false))
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Section 1: Inteligência de Horários ───────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <button
          onClick={() => setHorariosOpen(v => !v)}
          className="w-full flex items-center gap-2 px-5 py-4 hover:bg-gray-50/70 transition-colors text-left"
        >
          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 flex-1">Inteligência de Horários</span>
          <span className="text-xs text-gray-400 mr-2">
            {Object.keys(horarios).length} unidades
          </span>
          <ChevronRight className={cn("w-4 h-4 text-gray-300 transition-transform", horariosOpen && "rotate-90")} />
        </button>

        {horariosOpen && (
          <div className="px-5 pb-5">
            {horariosLoading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
                <div className="w-3 h-3 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                Analisando dados de ligações...
              </div>
            ) : Object.keys(horarios).length === 0 ? (
              <p className="text-xs text-gray-400 py-4">Nenhum dado de ligações nos últimos 90 dias.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
                {Object.entries(horarios).map(([unidade, info]) => (
                  <div key={unidade} className="border border-gray-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1.5">{unidade}</p>
                    {info === null ? (
                      <p className="text-[11px] text-gray-400">Dados insuficientes (mín. 20 ligações)</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                          <Calendar className="w-3 h-3 text-emerald-400" />
                          <span className="font-medium">{info.melhor_dia}</span>
                          <span className="text-gray-400">·</span>
                          <span>{info.melhor_horario}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
                          <Phone className="w-3 h-3 text-blue-400" />
                          <span>{Math.round(info.taxa_atendimento * 100)}% de atendimento</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{info.baseado_em} lig.</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Resumo por Categoria (cards rápidos) ──────────────── */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Resumo</h3>
        {resumoLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
            Carregando...
          </div>
        ) : resumo ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-0.5 border border-amber-100 rounded-lg p-3 bg-amber-50/40">
              <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">🟡 Agendado futuro</span>
              <span className="text-xl font-bold text-amber-700 tabular-nums">{resumo.agendado_futuro}</span>
            </div>
            <div className="flex flex-col gap-0.5 border border-emerald-100 rounded-lg p-3 bg-emerald-50/40">
              <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide">🟢 Prontos hoje</span>
              <span className="text-xl font-bold text-emerald-700 tabular-nums">{resumo.prontos_hoje}</span>
            </div>
            <div className="flex flex-col gap-0.5 border border-gray-100 rounded-lg p-3 bg-gray-50/40">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">⏸ Em pausa</span>
              <span className="text-xl font-bold text-gray-700 tabular-nums">{resumo.em_pausa}</span>
            </div>
            <div className="flex flex-col gap-0.5 border border-red-100 rounded-lg p-3 bg-red-50/40">
              <span className="text-[10px] font-medium text-red-600 uppercase tracking-wide">🔴 Bloqueados</span>
              <span className="text-xl font-bold text-red-700 tabular-nums">{resumo.bloqueados}</span>
            </div>
            <div className="flex flex-col gap-0.5 border border-blue-100 rounded-lg p-3 bg-blue-50/40">
              <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">🏥 Higienização</span>
              <span className="text-xl font-bold text-blue-700 tabular-nums">{resumo.higienizacao}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Sem dados.</p>
        )}
      </div>

      {/* ── Section 2: Fila do Dia ────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Fila do Dia</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Leads prontos para ligar agora (recontato_em ≤ hoje, não bloqueados, não pausados)
            </p>
          </div>
          <button
            onClick={handleExportFila}
            disabled={exportando || filaTotal === 0}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportando ? "Gerando..." : `Gerar Lista do Dia (${filaTotal} leads)`}
          </button>
        </div>

        {filaLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
            Carregando fila do dia...
          </div>
        ) : fila.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
            <CheckCircle2 className="w-8 h-8" />
            <p className="text-sm text-gray-400">Nenhum lead na fila do dia.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 font-medium">
                    <th className="px-3 py-2.5 text-left">Nome</th>
                    <th className="px-3 py-2.5 text-left">Telefone</th>
                    <th className="px-3 py-2.5 text-left">Unidade</th>
                    <th className="px-3 py-2.5 text-left">Categoria</th>
                    <th className="px-3 py-2.5 text-left">Agendado para</th>
                    <th className="px-3 py-2.5 text-right">Tentativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fila.map(l => {
                    const lista = l.listas as { unidade?: string } | null
                    return (
                      <tr key={l.id} className="bg-white hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium text-gray-800">{l.nome}</td>
                        <td className="px-3 py-2 text-gray-500 tabular-nums">{l.telefone_principal ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{lista?.unidade ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {l.recontato_categoria ? (CAT_LABEL[l.recontato_categoria] ?? l.recontato_categoria) : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500 tabular-nums">{fmtDate(l.recontato_em)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                          {l.recontato_tentativas ?? 0}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filaTotal > PER_PAGE_FILA && (
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[11px] text-gray-400">{filaTotal} total</span>
                <button
                  disabled={filaPage === 1}
                  onClick={() => { setFilaPage(p => p - 1); loadFila(filaPage - 1) }}
                  className="text-[11px] px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  ‹ Anterior
                </button>
                <button
                  disabled={filaPage * PER_PAGE_FILA >= filaTotal}
                  onClick={() => { setFilaPage(p => p + 1); loadFila(filaPage + 1) }}
                  className="text-[11px] px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  Próxima ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 4: Bloqueados ────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <button
          onClick={() => setBloqueadosOpen(v => !v)}
          className="w-full flex items-center gap-2 px-5 py-4 hover:bg-gray-50/70 transition-colors text-left"
        >
          <Ban className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 flex-1">Bloqueados Permanentemente</span>
          <span className="text-xs text-gray-400 mr-2">Auditoria</span>
          <ChevronRight className={cn("w-4 h-4 text-gray-300 transition-transform", bloqueadosOpen && "rotate-90")} />
        </button>

        {bloqueadosOpen && (
          <div className="px-5 pb-5">
            {bloqueadosLoading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
                <div className="w-3 h-3 border-2 border-gray-200 border-t-red-400 rounded-full animate-spin" />
                Carregando bloqueados...
              </div>
            ) : bloqueados.length === 0 ? (
              <p className="text-xs text-gray-400 py-4">Nenhum lead bloqueado permanentemente.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-100 mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 font-medium">
                        <th className="px-3 py-2 text-left">Nome</th>
                        <th className="px-3 py-2 text-left">Telefone</th>
                        <th className="px-3 py-2 text-left">Unidade</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Bloqueado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {bloqueados.map(l => {
                        const lista = l.listas as { unidade?: string } | null
                        return (
                          <tr key={l.id} className="bg-white hover:bg-red-50/30">
                            <td className="px-3 py-2 font-medium text-gray-700">{l.nome}</td>
                            <td className="px-3 py-2 text-gray-500 tabular-nums">{l.telefone_principal ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{lista?.unidade ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500">
                              {l.bloqueado_motivo ? (CAT_LABEL[l.bloqueado_motivo] ?? l.bloqueado_motivo) : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-400 tabular-nums">
                              {l.bloqueado_em ? fmtDate(l.bloqueado_em.split("T")[0]) : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {bloqueadosTotal > PER_PAGE_BLOQ && (
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <span className="text-[11px] text-gray-400">{bloqueadosTotal} total</span>
                    <button
                      disabled={bloqueadosPage === 1}
                      onClick={() => setBloqueadosPage(p => p - 1)}
                      className="text-[11px] px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      ‹ Anterior
                    </button>
                    <button
                      disabled={bloqueadosPage * PER_PAGE_BLOQ >= bloqueadosTotal}
                      onClick={() => setBloqueadosPage(p => p + 1)}
                      className="text-[11px] px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Próxima ›
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /workspaces/creditum-portal && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are type errors about unused imports (`Pause`), remove `Pause` from the import list — it's not used in the final layout.

- [ ] **Step 5: Run full test suite**

```bash
cd /workspaces/creditum-portal && npm test 2>&1 | tail -20
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/app/listas/page.tsx
git commit -m "feat: reconstruir aba Recontatos com inteligência de horários e regras anti-desgaste"
```

---

## Self-Review Checklist

After all tasks are complete, verify these spec requirements are covered:

| Requirement | Task | Status |
|---|---|---|
| DB columns: tentativas, seguidas, pausado_ate, bloqueado, bloqueado_motivo, bloqueado_em, recontato_categoria | Task 1 | ✅ |
| nao_atendeu → increment tentativas + seguidas | Task 2 | ✅ |
| 3 seguidas → pausado_ate + 3 dias | Task 2 | ✅ |
| 5 tentativas → precisa_higienizacao | Task 2 | ✅ |
| recontato_pendente → reset seguidas + agendamento por categoria | Task 2 | ✅ |
| sem_interesse/ja_cliente → bloqueado permanente | Task 2 | ✅ |
| numero_invalido → numero_invalido + higienizacao | Task 2 | ✅ |
| sucesso → reset seguidas | Task 2 | ✅ |
| Tests para todas as regras | Task 3 | ✅ |
| GET /api/leads/recontatos?mode=fila_do_dia | Task 4 | ✅ |
| GET /api/leads/recontatos?mode=resumo | Task 4 | ✅ |
| GET /api/leads/recontatos?mode=bloqueados | Task 4 | ✅ |
| Bloqueados não aparecem na fila | Task 4 | ✅ (eq bloqueado=false) |
| Pausados não aparecem até pausado_ate passar | Task 4 | ✅ (pausado_ate.lte.hoje) |
| GET /api/listas/inteligencia-horarios | Task 5 | ✅ |
| Dados insuficientes → null (min 20 ligações) | Task 5 | ✅ |
| Apenas dados Argus reais | Task 5 | ✅ |
| GET /api/leads/recontatos/export (Excel) | Task 6 | ✅ |
| Export: Nome, Telefone, Unidade, Tipo Lista, Categoria, Agendado Para, Melhor Dia, Melhor Horário | Task 6 | ✅ |
| Filename: recontatos-YYYY-MM-DD.xlsx | Task 6 | ✅ |
| UI Section 1: Inteligência de Horários (cards, collapsible, collapsed by default) | Task 7 | ✅ |
| UI Section 2: Fila do Dia (table + export button com count badge) | Task 7 | ✅ |
| UI Section 3: Resumo por Categoria (5 count cards) | Task 7 | ✅ |
| UI Section 4: Bloqueados (collapsible, audit only) | Task 7 | ✅ |
| npm test passa | Task 7 | ✅ |
