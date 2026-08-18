# D13 — Validação do catálogo de unidades

**Data:** 2026-08-16
**Estado:** aguardando decisão do CEO
**Propósito:** reunir todos os nomes de unidade que existem em fontes versionadas
do repositório, apontar inconsistências e ausências, e pedir confirmação.

> **Eu não escolhi nenhum nome canônico neste documento.** Onde há evidência, ela
> está citada; onde não há, o status é `unknown`. D13 registra que assumir o nome
> completo sem confirmar já custou duas correções, e não vou repetir isso em
> escala de 27 unidades.

---

## 1. Fontes consultadas

| Fonte | O que contém | Estado |
|---|---|---|
| `supabase/migrations/20260611_unidades.sql` | 27 unidades ativas do Grau Técnico | **aplicada** |
| `supabase/migrations/20260813_ceo_schema.sql` | tabelas `ceo.schools` e `ceo.school_aliases` | aplicada, **sem nenhum INSERT** |
| `docs/decisions/2026-08-13.md` (D13) | 2 aliases confirmados pelo CEO | decisão registrada |
| `src/lib/ceo/normalize.ts` | 8 abreviações regulares | código testado |
| `docs/BRIEFING.md` §3.5 | formas observadas na planilha real | auditoria da fonte |
| `intelligence/fixtures/` | nomes usados nos cenários sintéticos | escritos por mim na Fase 1 |

---

## 2. As 27 unidades de `public.unidades`

Ordem da migration, sem alteração:

```
São João de Meriti · Carpina · Parnamirim · Divinópolis · Joinville
São José do Rio Preto · Alecrim · Duque de Caxias · São Gonçalo · Sumaré
Santos · Rio Centro · Limoeiro · Maracanau · Zona Norte · BelfordRoxo
Bezerra · Fortaleza · Guarulhos · Jardim Angela · João Pessoa · Limeira
Madureira · Mogi das Cruzes · Presidente P. · Santa Cruz · Santo Amaro
```

**Esta tabela é da aplicação do portal (`public`), não do schema `ceo`.** D13
designa `ceo.school_aliases` como fonte canônica, e ela está vazia. Portanto
`public.unidades` é **candidata**, não catálogo aprovado.

---

## 3. Aliases já confirmados pelo CEO

| Planilha escreve | Nome canônico | Evidência |
|---|---|---|
| `Rio Preto` | São José do Rio Preto | D13, corrigido pelo CEO |
| `Mogi` / `Grau Mogi` | Mogi das Cruzes | D13, corrigido pelo CEO |

**São os dois únicos.** Ambos são contração de nome composto — não deriváveis por
regra, e é exatamente por isso que precisaram de confirmação humana.

## 4. Abreviações que são REGRA, não alias

Já implementadas e testadas em `src/lib/ceo/normalize.ts`. Não precisam de
decisão; aplicam-se sozinhas.

```
sta → santa     sto → santo      jd  → jardim    zn → zona
pres → presidente   gov → governador   vl → vila   pq → parque
```

Prefixo institucional removido: `Grau`.

---

## 5. Itens que exigem decisão

### 5.1 Grafia — provavelmente a mesma unidade, escrita de forma não canônica

| # | Valor na fonte | Canônico possível | Evidência | Status |
|---|---|---|---|---|
| 1 | `BelfordRoxo` | Belford Roxo | Município do RJ; o nome oficial tem espaço. Nenhuma outra unidade do catálogo colide. | `ambiguous` |
| 2 | `Maracanau` | Maracanaú | Município do CE; o nome oficial é acentuado. `toComparableKey` já remove acento, então as duas formas casam entre si — a dúvida é qual gravar como `display_name`. | `ambiguous` |
| 3 | `Jardim Angela` | Jardim Ângela | Distrito de São Paulo; o nome oficial é acentuado. Mesma observação do item 2. | `ambiguous` |

Estes três são de **exibição**, não de identidade: a normalização já os une. A
decisão é só qual grafia vira `display_name` no catálogo.

### 5.2 Abreviação não expansível por regra

| # | Valor na fonte | Canônico possível | Evidência | Status |
|---|---|---|---|---|
| 4 | `Presidente P.` | Presidente Prudente **(?)** | `BRIEFING.md` §3.5 menciona *"Um aluno de Prudente aparece 2× no mesmo dia"*. A abreviação `pres→presidente` é regra, mas `P.` **não** é expansível: poderia ser Prudente, Penha, Piedade… | `ambiguous` |

Este é exatamente o padrão dos dois casos que o CEO já corrigiu: contração que
nenhum algoritmo resolve. **Precisa de confirmação, não de inferência.**

### 5.3 Não identificados

| # | Valor na fonte | Canônico possível | Evidência | Status |
|---|---|---|---|---|
| 5 | `Rio Centro` | — | Não consegui identificar. Pode ser referência ao Riocentro (Jacarepaguá/RJ), ou nome próprio da unidade. Nenhuma evidência no repositório. | `unknown` |
| 6 | `Bezerra` | — | Não consegui identificar. Nenhuma evidência no repositório. | `unknown` |
| 7 | `Santa Cruz` | — | Existe Santa Cruz no RJ e em outros estados. O catálogo tem outras unidades do RJ (Madureira, Duque de Caxias, São Gonçalo, Zona Norte), o que **sugere** RJ — mas sugestão não é evidência. | `unknown` |

### 5.4 Ausência no catálogo

| # | Valor na fonte | Canônico possível | Evidência | Status |
|---|---|---|---|---|
| 8 | `Grau Marabá` / `Grau Maraba` | Marabá **(?)** | Aparece em `BRIEFING.md` §3.5 como caso real de normalização da planilha. **Não está nas 27 unidades.** | `unknown` — ausência |

**É o achado mais importante deste documento.** Uma unidade que a fonte reporta e
o catálogo não conhece: hoje viraria `unknown` a cada ingestão, degradando
qualidade todo mês. Ou a lista de 27 está desatualizada, ou Marabá foi
desativada, ou pertence a outro parceiro.

### 5.5 Confirmados — não mexer

| Valor | Observação | Status |
|---|---|---|
| `Santos` **e** `Santo Amaro` | Duas unidades distintas. O veto estrutural de D12 impede a fusão, e há teste. | `confirmed` |
| `Limeira` **e** `Limoeiro` | Duas unidades distintas. Similaridade 0,75, abaixo do limiar de 0,80 — calibrado justamente por este par. | `confirmed` |
| `Alecrim` | Bairro de Natal/RN. Grafia consistente. A fonte real também escreve `Grau alecrim` (caixa), que a normalização resolve. | `confirmed` |
| `Sumaré` | Grafia consistente. Fonte escreve `Grau Sumaré`/`Grau Sumare`. | `confirmed` |
| `São José do Rio Preto` | Já tem alias confirmado. | `confirmed` |
| `Mogi das Cruzes` | Já tem alias confirmado. | `confirmed` |

---

## 6. Possíveis duplicidades

Não encontrei duplicidade confirmada. Registro duas suspeitas **sem evidência**,
para que quem conhece a operação descarte ou confirme:

- `Rio Centro`, `Zona Norte` e `Madureira` são todas designações de região do RJ.
  Se alguma delas for a mesma unidade sob nomes diferentes, o catálogo teria
  duplicata — mas **não há nada no repositório que indique isso**.
- `Santa Cruz` (item 7) pode colidir com alguma unidade já listada, se for a
  mesma sob outro nome.

---

## 7. Nomes usados hoje nas fixtures da POC

Para conferência — **fui eu que escolhi na Fase 1**, e eles não constituem
evidência de nada:

| Onde | Valores |
|---|---|
| `unit_breakdown` | `Mogi das Cruzes`, `São José do Rio Preto`, `Grau Sumaré`, `Grau Santos` |
| `coverage.missing_units` | `Grau Santo Amaro` |
| `contributing_cases[].unit` | `Mogi das Cruzes`, `São José do Rio Preto`, `Grau Sumaré` |

Note que as fixtures misturam formas **com** e **sem** o prefixo `Grau`, o que é
fiel à fonte real (a aba financeira não usa o prefixo) mas confirma que o
`display_name` precisa ser decidido.

---

## 8. O que preciso do CEO

1. **Itens 1–3** (grafia): qual forma vira `display_name`?
2. **Item 4** (`Presidente P.`): qual é a unidade?
3. **Itens 5–7** (`Rio Centro`, `Bezerra`, `Santa Cruz`): que unidades são?
4. **Item 8** (`Marabá`): está ativa? Deve entrar no catálogo?
5. **Seção 6**: alguma das suspeitas de duplicidade procede?
6. **Aliases adicionais:** a planilha escreve alguma outra unidade de forma curta,
   como faz com `Mogi` e `Rio Preto`?

Com isso, o catálogo vira uma migration de seed em
`ceo.schools` + `ceo.school_aliases`, e o `UnitId` passa a ser união literal em
vez de `string` validada — fechando o bloqueio B1 e o gate D13.

---

## SUPERSEDED — §8 (`UnitId` como união literal) e itens 1–8 resolvidos

**§8:** a recomendação de transformar `UnitId` em união literal foi **substituída**
pela Fase 2.6b — o catálogo é DADO governado, `UnitId` segue `string` validada.

**Itens 1–8 da §5:** todos DECIDIDOS pelo CEO na Fase 2.6b. Ver
`FASE_2_6B_GOVERNED_CATALOG_AND_POLICY.md` §3 e §4, com testes.

Achado novo daquela fase: dois textos da fonte (`Carpina e Limoeiro`,
`Limeira, Sumaré & JD Ângela`) são AGRUPAMENTOS comerciais — não unidades, não
aliases. Este documento não os previa.

O levantamento de fontes e o histórico das decisões seguem válidos.
