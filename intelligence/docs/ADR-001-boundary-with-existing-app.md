# ADR-001 — Fronteira entre o app CEO Intelligence e a POC do Centro de Inteligência

**Data:** 2026-08-16
**Estado:** aceita
**Decidido por:** Stefano Leta (CEO), sobre inventário da Fase 0
**Branch:** `feature/intelligence-poc`, a partir de `feature/ceo-intelligence`

---

## Contexto

O repositório `creditum-portal` já contém o app CEO Intelligence: Next.js 16,
schema `ceo` no Supabase, deploy na Vercel, 182 testes. Dentro dele, `src/lib/ceo/`
guarda 2.720 linhas de motor determinístico — parsing de moeda/percentual/data/CPF,
álgebra de `Metric<T>`, normalização de identidade de unidade e vendedor.

A POC do Bloco 1 precisa de coisa diferente: rodar isolada, sem framework, sem
serviço externo, empacotável em contêiner endurecido, e sem herdar nenhuma
credencial do app. O briefing do Bloco 1 é explícito em não reconstruir o app e
em não adicionar Vercel, Supabase ou n8n como dependência nova.

Três fatos medidos na Fase 0 delimitam as opções:

1. **`src/lib/ceo/` é 100% puro.** Zero import de `next/`, zero alias `@/`.
   Só imports relativos e `node:crypto`. Reuso por importação é possível sem
   tocar em nada do app.
2. **`tsconfig.json` do app tem `include: ["**/*.ts"]` e `exclude: ["node_modules"]`.**
   Qualquer diretório novo na raiz entra no `npm run typecheck` do portal.
3. **`vitest.config.mts` do app tem `include: ["src/**/*.test.ts"]`.** Testes
   fora de `src/` não rodam — falhariam em silêncio, que é pior do que falhar.

## Decisão

A POC vive em **`intelligence/`, na raiz de `creditum-portal`, como subprojeto
com toolchain própria**.

- `intelligence/package.json` — projeto npm separado, dependências próprias
- `intelligence/tsconfig.json` — ES2022, `strict` + `noUncheckedIndexedAccess`
  + `exactOptionalPropertyTypes`
- `intelligence/vitest.config.mts` — roda apenas os testes da POC

Duas linhas mudam no app, e só para impedir colisão de toolchain:

| Arquivo | Mudança |
|---|---|
| `tsconfig.json` | `"exclude": ["node_modules", "intelligence"]` |
| `eslint.config.mjs` | `globalIgnores([..., "intelligence/**"])` |

Nada mais do app é tocado. `src/`, `supabase/`, `docs/BRIEFING.md` e o
`package.json` do portal ficam como estavam.

## Alternativas consideradas

**Repositório separado (`creditum-intelligence`).** Isolamento total e contexto
Docker limpo. Recusada porque o motor determinístico teria de ser copiado: duas
cópias de `parse.ts` e `data-class.ts` divergindo com o tempo, e as correções das
três rodadas adversariais (inversão de sinal em `R$ -100,00`, guarda de
`sumCents`, gramática monetária) valendo só de um lado. O custo de manutenção é
permanente; o benefício do isolamento é replicável com configuração.

**`intelligence/` herdando a toolchain do app.** Mais simples de montar.
Recusada por dois motivos concretos: a POC ficaria presa ao target ES2017 — que o
briefing anterior já recusou mudar, e por boa razão — e um erro de tipo na POC
quebraria `npm run verify` do portal, acoplando o release do app ao andamento de
uma prova de conceito.

**Extrair `src/lib/ceo/` para pacote compartilhado.** É provavelmente o destino
certo se a POC for aprovada. Recusada agora porque o briefing proíbe mover,
renomear ou reestruturar o código existente na primeira entrega, e porque
reestruturar antes de saber se o Hermes será adotado é trabalho que pode ser
jogado fora.

## Consequências

**Ganhamos.** Um repo só, tudo revisável no mesmo diff. Toolchains independentes:
`npm run verify` do portal e o da POC não se enxergam. O motor determinístico
permanece com fonte única — a POC vai importá-lo por caminho relativo na Fase 2,
sem cópia.

**Aceitamos.** Dois `node_modules` no repositório. O contexto de build do Docker
na Fase 5 precisará apontar para `intelligence/` explicitamente, senão arrasta o
app inteiro para a imagem. E a fronteira é convenção mais configuração, não
barreira física: nada impede tecnicamente alguém de importar `next/` dentro de
`intelligence/`. A defesa é a revisão de PR, não o compilador.

**Verificado.** Depois das duas linhas, `npm run verify` do portal segue passando
com os mesmos 182 testes, e `intelligence/` roda seus 257 testes sem tocar no app.

## Reabrir esta decisão quando

- A POC for aprovada e o motor determinístico precisar virar pacote versionado
- O empacotamento Docker da Fase 5 mostrar que o contexto de build compartilhado
  custa mais do que um repositório separado custaria
- A POC for retirada — aí `intelligence/` some inteiro e as duas linhas voltam
