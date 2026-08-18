-- Endurecimento de `public.catalogo_dados` — NÃO APLICADA. Aguarda autorização.
--
-- ─── Por que só esta tabela ───────────────────────────────────────────────────
--
-- A auditoria da Fase 2.9 encontrou o schema `public` inteiro com
-- `GRANT DELETE,INSERT,SELECT,TRIGGER,TRUNCATE,UPDATE` para `anon` e
-- `authenticated`, e cinco tabelas com policy `FOR ALL TO public USING (true)`.
-- `public` em Postgres é TODO role, inclusive `anon` — então o nome
-- "service role full access" descreve a intenção, não o efeito.
--
-- Corrigir aquelas cinco AGORA quebraria o portal: `src/lib/supabase-server.ts`
-- usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`, então todo o backend opera como `anon`.
-- As policies permissivas são load-bearing enquanto isso for verdade.
--
-- `catalogo_dados` é diferente e por isso está sozinha aqui: a busca por
-- consumidores no repositório retornou ZERO referências em código — só uma
-- menção em `docs/BRIEFING.md`. Ela é catálogo mantido à mão, e nada no produto
-- a lê. É o único objeto em que least privilege não tem custo de disponibilidade.
--
-- ─── O que este arquivo faz ───────────────────────────────────────────────────
--
-- Grants definem o que o role pode TENTAR; RLS define quais linhas a tentativa
-- alcança. Os dois precisam ser coerentes, então mexemos nos dois:
--
--   1. revoga acesso de client-role (`anon`, `authenticated`);
--   2. habilita RLS;
--   3. NÃO cria policy — ausência de policy com RLS ligado é negar por padrão.
--
-- `service_role` ignora RLS por construção e continua com acesso. Ele é
-- credencial de servidor: nunca vai para o browser nem para o Hermes.
--
-- Idempotente: `revoke` e `enable row level security` são seguros em repetição.

revoke all on table public.catalogo_dados from anon;
revoke all on table public.catalogo_dados from authenticated;

alter table public.catalogo_dados enable row level security;

comment on table public.catalogo_dados is
  'Catálogo/etiquetas das tabelas e views dos dois projetos Supabase da Creditum, '
  'por categoria de dado. Mantido manualmente. '
  'ACESSO: server-side apenas (service_role). RLS habilitado sem policy = '
  'negar por padrão para anon/authenticated. Zero consumidores em código '
  'verificado na Fase 2.9 — se algum caminho de produto passar a precisar de '
  'leitura, adicionar grant SELECT + policy explícita, nunca USING (true) para escrita.';
