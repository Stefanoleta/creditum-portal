# DATA_FLOW — como o dado atravessa a POC

**Versão:** 0.1 (Fase 1) · o que está construído está marcado ✅, o resto é projeto.

---

## Visão geral

```
Fontes e pipelines existentes  (Leo, Lucas/PP, Bitrix24, Omie, Sheets)
        │  preservados — a POC não os substitui nem os raspa
        ▼
┌─ PLANO DE INGESTÃO ────────────────────────────────────────┐
│  grava snapshots versionados · credencial de ESCRITA       │  ⬜ Fase 2
│  o Hermes não alcança este plano, em nenhuma hipótese      │
└────────────────────────────────────────────────────────────┘
        │  snapshots imutáveis, content_hash, rows_skipped contado
        ▼
┌─ PLANO DE CONSULTA ────────────────────────────────────────┐
│  ReadOnlyGateway                                            │  ✅ Fase 1
│    · allowlist de capacidade, fonte e campo                 │
│    · scanner de PII em toda saída                           │
│    · meta obrigatória: as_of, qualidade, cobertura, idade   │
│    · nenhuma rota de escrita existe                         │
└────────────────────────────────────────────────────────────┘
        │  snapshots · eventos · evidências · casos materiais
        ▼
┌─ DETECTORES ───────────────────────────────────────────────┐
│  soma, média, %, ranking, conversão, ticket — em CÓDIGO     │  ⬜ Fase 2
│  nenhum cálculo executivo é delegado ao LLM                 │
└────────────────────────────────────────────────────────────┘
        │  eventos determinísticos versionados
        ▼
┌─ HERMES OBSERVER ──────────────────────────────────────────┐
│  investiga · explica · 3 cenários · registra confiança      │  ⬜ Fase 3
│  sem terminal · sem arquivo · sem rede fora do gateway      │
└────────────────────────────────────────────────────────────┘
        │  recomendação validada contra schema (falha = não apresenta)
        ▼
┌─ PLANO DE CAPTURA ─────────────────────────────────────────┐
│  externo ao agente · grava run, custo, modelo, saída        │  ⬜ Fase 3
└────────────────────────────────────────────────────────────┘
        │
        ▼
   DECISÃO HUMANA  →  LEDGER append-only  →  resultado observado
                        (correção cria registro novo, nunca sobrescreve)
```

---

## Separação de planos (§6.1)

| Plano | Escreve? | Alcançável pelo Hermes? | Credencial |
|---|---|---|---|
| Ingestão | sim | **não** | escrita, isolada |
| Consulta | não | sim — é a única superfície | leitura, allowlist |
| Controle | sim (config) | **não** | administrativa |
| Auditoria | sim (append) | **não** | do capturador |

O Hermes só enxerga a coluna "consulta". As outras três não têm rota a partir de
onde ele roda.

---

## O que trafega em cada etapa

### Snapshot → gateway ✅

Já governado na origem: dinheiro em centavos inteiros, percentual em basis
points, `rows_skipped` contado, cobertura declarada, conflitos listados **sem
resolução**, e nenhuma PII.

O `payload` é **fechado**: cada campo tem forma explícita e nenhum aceita texto
livre. Texto de fonte existe em exatamente dois lugares, os dois rotulados —
`payload.source_notes[]` e `evidence.untrusted_excerpt`, ambos com
`untrusted: true`.

A entrada passa por `factory.ts` antes de existir como tipo: contrato, depois
invariantes semânticas, depois integridade referencial do conjunto. Nada entra
no store por cast.

O gateway ainda projeta o payload pela allowlist de campos: um snapshot pode
carregar mais do que o agente precisa ver, e o excedente é descartado na saída.

### Gateway → detectores ⬜

Detectores consomem snapshots e produzem eventos. **Todo número que aparece num
evento nasce aqui**, em código testado. O Hermes recebe o número pronto; ele
nunca soma, nunca tira média, nunca calcula percentual.

### Eventos → Hermes ⬜

Via MCP, somente leitura. O agente pode pedir evidência, pedir os casos que movem
o consolidado, e perguntar por período — mas cada resposta chega carimbada com
frescor e qualidade, então não existe caminho para tratar dado velho ou
conflitado como se fosse limpo.

### Hermes → captura ⬜

A saída é validada contra `recommendation.schema.json` **antes** de ser
apresentada. Falha de schema não vira "recomendação parcial": vira registro de
falha no ledger. O `provenance` (provedor, modelo, versão de prompt, hash de
config) é preenchido pelo capturador a partir do que foi de fato invocado — não
pelo que o agente afirma ter usado.

### Handoff do Aros ⬜

Gera Markdown + JSON sanitizados, revisados por humano e enviados **manualmente**.
Não há integração automática: não existe evidência de API, webhook ou analytics
acessível do Aros, e presumir integração seria inventar (§4).

---

## Invariantes que atravessam tudo

1. **Ausência nunca vira zero.** `data_class: "gap"` proíbe `value` por schema.
2. **Conflito é declarado, nunca resolvido pelo sistema.** `resolved` é `const false`.
3. **A classe de um agregado é a mais fraca das entradas.** Total que depende de
   previsão **é** previsão.
4. **Toda afirmação numérica tem evidência e timestamp.** Sem isso não sai.
5. **Dinheiro é inteiro em centavos; percentual é basis points.** Nunca float.
6. **Descarte é contado.** `rows_skipped` é obrigatório.
7. **Texto de fonte é dado, nunca instrução.**
