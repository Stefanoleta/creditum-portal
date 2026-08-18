-- ═══════════════════════════════════════════════════════════════════════════
--  CANDIDATA — NÃO APLICAR AINDA.  NÃO É UMA MIGRATION.
--
--  Este arquivo está FORA de `supabase/migrations/` de propósito: lá ele seria
--  aplicado por qualquer `supabase db push` ou passo de CI, e aplicá-lo hoje
--  DERRUBA O PORTAL. As 18 rotas de /api usam a chave `anon`; revogar o acesso
--  de `anon` interrompe todas elas.
--
--  As quatro condições do §M ainda NÃO estão satisfeitas:
--    1. rotas consumidoras identificadas ......... SIM (matriz no relatório)
--    2. auth guard ativo ......................... NÃO  ← bloqueia
--    3. cliente server correto funcionando ....... NÃO  ← bloqueia
--    4. rollback documentado + testes pré/pós .... rollback abaixo; testes NÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. As cinco policies enganosas ────────────────────────────────────────
--
-- Todas se chamam "service role full access" / "service_role_*", e nenhuma se
-- aplica a `service_role`: o alvo é `public`, que em Postgres é TODO role.
-- `service_role` já ignora RLS por construção e não precisa de policy nenhuma.
--
-- Efeito medido hoje, com a chave anônima:
--   leads                  → 18.400 linhas legíveis
--   resultados_discador    → 158.241 linhas legíveis
--   listas                 → 77
--   unidades               → 27
--   qualificacoes          → 0 (tabela vazia, policy igualmente permissiva)

drop policy if exists "service role full access" on public.leads;
drop policy if exists "service role full access" on public.resultados_discador;
drop policy if exists "service role full access" on public.listas;
drop policy if exists "service role full access" on public.unidades;
drop policy if exists "service role full access" on public.qualificacoes;

-- ─── 2. Grants mínimos ──────────────────────────────────────────────────────
--
-- `anon` não precisa de nada: depois do guard de autenticação, nenhum caminho
-- de produto lê o banco sem sessão.

revoke all on table public.leads               from anon, authenticated;
revoke all on table public.resultados_discador from anon, authenticated;
revoke all on table public.listas              from anon, authenticated;
revoke all on table public.unidades            from anon, authenticated;
revoke all on table public.qualificacoes       from anon, authenticated;
revoke all on table public.vw_discador_unificado from anon, authenticated;

-- ─── 3. RLS permanece ligado, agora sem policy permissiva ──────────────────
--
-- RLS ligado + zero policies = negar por padrão. `service_role` atravessa.

alter table public.leads               enable row level security;
alter table public.resultados_discador enable row level security;
alter table public.listas              enable row level security;
alter table public.unidades            enable row level security;
alter table public.qualificacoes       enable row level security;

-- ─── 4. A view para de contornar o RLS das bases ───────────────────────────
--
-- `vw_discador_unificado` não tem `reloptions`, então `security_invoker` é
-- `false` — ela roda com os privilégios do OWNER (`postgres`) e ignora o RLS de
-- `leads`, `listas` e `unidades`. Medido: 158.241 linhas legíveis por `anon`.
--
-- Com `security_invoker=true` a view passa a rodar como quem consulta, e o RLS
-- das tabelas base volta a valer. É a correção mínima: não muda a definição da
-- view, só de quem ela herda privilégio.

alter view public.vw_discador_unificado set (security_invoker = true);

-- ─── 5. Default privileges: a RAIZ do problema ─────────────────────────────
--
-- `pg_default_acl` concede `arwdDxtm` a `anon` e `authenticated` para toda
-- tabela nova criada por `postgres` em `public` — INSERT, SELECT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
--
-- Sem mexer aqui, corrigir tabela por tabela é enxugar gelo: a próxima nasce
-- aberta. Este bloco é o que impede a reincidência.
--
-- ATENÇÃO: alterar default ACL não afeta tabelas existentes, só as futuras.
-- Verificar antes se algum workflow (n8n, migrations do CEO) depende de a
-- tabela nova já vir legível para `anon`.

alter default privileges for role postgres       in schema public revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  ROLLBACK
--
--  Restaura exatamente o estado medido em 18/08/2026. Guardado porque um
--  rollback que "aproxima" o estado anterior não é rollback.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- grant all on table public.leads, public.resultados_discador, public.listas,
--              public.unidades, public.qualificacoes, public.vw_discador_unificado
--          to anon, authenticated;
--
-- create policy "service role full access" on public.leads
--   for all to public using (true);
-- create policy "service role full access" on public.resultados_discador
--   for all to public using (true);
-- create policy "service role full access" on public.listas
--   for all to public using (true);
-- create policy "service role full access" on public.unidades
--   for all to public using (true);
-- create policy "service role full access" on public.qualificacoes
--   for all to public using (true);
--
-- alter view public.vw_discador_unificado set (security_invoker = false);
--
-- alter default privileges for role postgres       in schema public grant all on tables to anon, authenticated;
-- alter default privileges for role supabase_admin in schema public grant all on tables to anon, authenticated;
