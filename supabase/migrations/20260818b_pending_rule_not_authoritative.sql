-- Invariante: regra `pending` não produz número oficial.
--
-- ─── O que isto contém ──────────────────────────────────────────────────────
--
-- `ceo.business_rules` tinha duas linhas com `active = true` E `pending = true`:
--
--   sale_policy       {"requires":"any","minConfidence":0.5}
--                     nota: "a planilha atual não é a fonte oficial.
--                            Pipeline diz 8 vendas, financeiro diz 14."
--   lead_eligibility  {"excludeLossCategories":["CREDIT_POLICY"]}
--                     nota: "PROVISORIO"
--
-- Sob o princípio source-first, `pending` significa: a regra NÃO está governada
-- para produzir número oficial. Uma regra provisória ativa é pior que regra
-- ausente — ela produz um número que parece oficial e não é.
--
-- No caso de `sale_policy` isso é mais que estilo: com `minConfidence: 0.5` o
-- Centro de Inteligência decidiria o que conta como venda quando o pipeline diz 8
-- e o financeiro diz 14. O resultado seria um TERCEIRO número, que não existe em
-- nenhuma das duas fontes e que ninguém consegue auditar contra elas.
--
-- ─── Por que CHECK e não código ─────────────────────────────────────────────
--
-- A verificação genérica, não um tratamento especial para `sale_policy`. Auditoria
-- confirmou que as três regras existentes são `pending`, e que `churn` já usa
-- `active = false` para dizer "sem regra" — então o invariante não quebra
-- semântica legítima nenhuma; ele generaliza a que já existia.
--
-- No banco porque é onde as regras moram. Um guard em TypeScript protegeria só
-- quem passasse por aquele caminho; a constraint protege qualquer consumidor
-- futuro, inclusive n8n e SQL direto.
--
-- ─── Consumidores ───────────────────────────────────────────────────────────
--
-- Zero, verificado em 18/08/2026: nenhum arquivo `.ts` de produção, nenhum teste,
-- e nenhuma das duas funções de `ceo` (`is_member`, `source_records_append_only`)
-- leem `business_rules`. A contenção é preventiva, não corretiva — e é por isso
-- que ela pode ser aplicada sem plano de transição.
--
-- ROLLBACK:
--   alter table ceo.business_rules drop constraint pending_rule_not_active;
--   update ceo.business_rules set active = true
--    where rule_key in ('sale_policy','lead_eligibility');

-- 1. As duas regras provisórias saem de ativas. Mesmo estado de `churn`, que a
--    auditoria já classificou como comportamento correto.
update ceo.business_rules
   set active = false,
       note = coalesce(note, '') ||
              ' [2026-08-18] Desativada pelo invariante source-first: regra pending ' ||
              'nao produz numero oficial. Metricas dependentes devem retornar ' ||
              'BUSINESS_RULE_PENDING ate a fonte oficial do Lucas definir a regra.'
 where rule_key in ('sale_policy', 'lead_eligibility')
   and active = true
   and pending = true;

-- 2. O invariante, genérico: nenhuma regra pode ser simultaneamente provisória e
--    ativa. Impede a reincidência sem precisar de revisão humana.
alter table ceo.business_rules
  drop constraint if exists pending_rule_not_active;

alter table ceo.business_rules
  add constraint pending_rule_not_active
  check (not (active and pending));

comment on column ceo.business_rules.pending is
  'true = regra NAO governada para produzir numero oficial. Constraint '
  'pending_rule_not_active impede active+pending ao mesmo tempo: metricas '
  'dependentes retornam BUSINESS_RULE_PENDING em vez de aplicar regra provisoria. '
  'Ver intelligence/docs/PRINCIPIO_SOURCE_FIRST.md';
