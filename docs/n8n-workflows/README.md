# Creditum Sales OS v2 — n8n Workflows

## Ordem de importação no n8n Cloud (creditum.app.n8n.cloud)

| # | Arquivo | Status | Notas |
|---|---|---|---|
| 1 | `WF5_Compliance_Gate.json` | ✅ Ativar imediatamente | Sub-workflow — copiar ID após import em `COMPLIANCE_WF_ID` |
| 2 | `WF1_Sequencing_Hygiene.json` | ✅ Ativar | Preencher `COMPLIANCE_WF_ID` antes de ativar |
| 3 | `WF2_Conversation_Warmer.json` | ✅ Ativar | Webhook: `/wa-incoming` |
| 4 | `WF3_Argus_Bitrix_Sync.json` | ✅ Ativar | — |
| 5 | `WF4_Forecasting.json` | ✅ Ativar | Adicionar `STEFANO_PHONE` nas env vars |
| 6 | `WF6_SDR_IA_Maria.json` | ⚠️ INATIVO | Ativar só após testes. Webhook: `/wa-sdr` |

## Variáveis de ambiente — configurar em n8n Cloud antes de importar

```
WA_TOKEN          Bearer token WhatsApp Cloud API (Meta)
PHONE_NUMBER_ID   ID do número WA Business
BITRIX_DOMAIN     creditum.bitrix24.com.br
BITRIX_WEBHOOK    token webhook REST Bitrix24
BOT_PHONE         número do bot (evitar eco)
DAILY_LIMIT       150 (fase warm-up)
COMPLIANCE_WF_ID  preencher com ID do WF5 após import
ARGUS_TOKEN       token Argus (já existe no Vercel — replicar aqui)
ANTHROPIC_API_KEY chave Claude API
SUPABASE_URL      URL do projeto Supabase (NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY anon key do Supabase
STEFANO_PHONE     número pessoal do Stefano (WA) para receber forecast
```

## Campos customizados a criar no Bitrix24 (crm.lead)

```
UF_SEQ_DAY         Integer    Dia da sequência WA (0/5/10/15/20)
UF_LAST_CONTACT    DateTime   Último envio pela sequência
UF_SEQ_PAUSED      Boolean    Pausar sequência manualmente
UF_HYGIENE_STATUS  String     invalid/cold/stealth/duplicate/optout
UF_WARMER_COUNT    Integer    Holdings enviadas (máx 3)
UF_LAST_LEAD_MSG   DateTime   Última mensagem recebida do lead
UF_INTENT          String     Output do Intent Classifier (Subagente 1)
```

## Tabelas Supabase

Executar migration `20260624_sales_os_v2.sql` antes de ativar WF6:
- `sdr_ia_conversations` — log de todas as interações com a Maria
- `sdr_ia_handoffs` — handoffs gerados para closers

## Closers (placeholders)

Substituir `CLOSER_1`, `CLOSER_2`, `CLOSER_3` pelos IDs reais de usuário
do Bitrix24 quando disponíveis. Localizar em:
- WF6: nó "Subagente 4 — Handoff Trigger" (linha `closers = [...]`)
