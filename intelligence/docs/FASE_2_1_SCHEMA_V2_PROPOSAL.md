# Proposta de contratos v2 — remoção de nome livre de unidade

**Data:** 2026-08-16
**Estado:** proposta, **não implementada**
**Depende de:** bloqueio B1 (`docs/D13_CATALOG_VALIDATION.md`)

> Nenhuma mudança desta proposta foi aplicada. `UnitId` continua sendo `string`
> validada por forma, e não união literal, porque a lista canônica ainda não foi
> aprovada. Ativar o enum agora seria inventar o catálogo.

---

## 1. O problema que a v2 resolve

Três superfícies carregam hoje **texto livre originado da fonte** até o modelo:

| Superfície | Contrato | Hoje |
|---|---|---|
| `coverage.missing_units[]` | `snapshot` | string com padrão de letras |
| `payload.unit_breakdown` (chaves) | `snapshot` | chaves dinâmicas de texto livre |
| `contributing_cases[].unit` | `event` | string com padrão de letras |

O padrão de letras recusa injeção com pontuação, mas **não distingue
`Grau Sumaré` de `Maria Silva`** — e nenhuma heurística de nome de pessoa é
aceitável (decisão mantida). É o resíduo R1.

`unit_breakdown` já está fora do caminho `to_model` desde a Fase 1.1, via
`MODEL_EGRESS_DENYLIST` não configurável. As outras duas continuam atravessando.

---

## 2. Mudanças propostas

### 2.1 `snapshot.schema.json`

```diff
  "coverage": {
-   "missing_units": { "type": "array", "items": { "$ref": "#/$defs/unit_name" } }
+   "missing_unit_ids": { "type": "array", "items": { "$ref": "#/$defs/unit_id" } }
  }
```

```diff
  "unit_breakdown": {
-   "propertyNames": { "$ref": "#/$defs/unit_name" },
+   "propertyNames": { "$ref": "#/$defs/unit_id" },
    "additionalProperties": { "$ref": "#/$defs/count" }
  }
```

Novo `$def`, e remoção de `unit_name`:

```jsonc
"unit_id": {
  "description": "Identificador canônico do catálogo governado. Nunca texto de fonte.",
  "type": "string",
  "pattern": "^[a-z][a-z0-9_]{1,63}$"
  // Vira "enum": [...] quando o catálogo for aprovado (B1).
}
```

**Novo campo — falha de identidade, separada de cobertura:**

```jsonc
"unresolved_source_units": {
  "description": "Valores de origem que NÃO puderam ser resolvidos a uma unidade canônica. É qualidade de ingestão, não cobertura.",
  "type": "object",
  "additionalProperties": false,
  "required": ["unknown_fingerprints", "ambiguous"],
  "properties": {
    "unknown_fingerprints": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-f0-9]{16}$" }
    },
    "ambiguous": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["raw_fingerprint", "candidates"],
        "properties": {
          "raw_fingerprint": { "type": "string", "pattern": "^[a-f0-9]{16}$" },
          "candidates": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/unit_id" } }
        }
      }
    }
  }
}
```

### 2.2 `event.schema.json`

```diff
  "contributing_case": {
-   "unit": { "type": "string", "pattern": "^[A-ZÀ-Ý][A-Za-zÀ-ÿ ]{1,63}$" }
+   "unit_id": { "$ref": "#/$defs/unit_id" },
+   "unit_display_name": {
+     "description": "Do CATÁLOGO, nunca da fonte. Opcional: o modelo não precisa dele para raciocinar, só para redigir.",
+     "type": "string", "maxLength": 128
+   }
  }
```

### 2.3 `aros-briefing.schema.json`

Sem mudança estrutural. Ganha um check de sanitização:

```diff
  "checks_passed": {
-   "minItems": 5, "maxItems": 5,
-   "items": { "enum": ["no_cpf","no_phone","no_email","no_person_name","no_raw_source_text"] }
+   "minItems": 6, "maxItems": 6,
+   "items": { "enum": ["no_cpf","no_phone","no_email","no_person_name","no_raw_source_text","no_free_unit_name"] }
  }
```

---

## 3. Por que `missing_unit_ids` e `unresolved_source_units` são campos diferentes

São perguntas distintas, e somá-las produz um número que mente nas duas direções.

| | `missing_unit_ids` | `unresolved_source_units` |
|---|---|---|
| Pergunta | Quem era esperado e não reportou? | O que chegou e não foi entendido? |
| Natureza | **Cobertura** | **Qualidade de ingestão** |
| Conteúdo | `UnitId` canônico | fingerprint + candidatos |
| Efeito | reduz `ratio_bp` | contamina `quality_status` |
| Ação | cobrar reporte da unidade | corrigir alias ou catálogo |

Uma unidade que reportou com o nome escrito de forma irreconhecível **não é uma
unidade ausente**: o dado chegou. Contá-la como ausente esconde uma falha de
identidade e inventa uma ausência que não existe — e a cobertura, que é insumo de
todos os detectores, passa a estar errada nas duas pontas.

`summarizeUnitResolution` em `detectors/src/canonical-units.ts` já implementa
essa separação, e há teste garantindo que um `unknown` nunca entra em
`missing_unit_ids`.

---

## 4. Compatibilidade

**Incompatível.** Renomear `missing_units` → `missing_unit_ids` e `unit` →
`unit_id` quebra qualquer produtor de v1, e é intencional: um snapshot v1 carrega
texto livre, que é exatamente o que a v2 existe para impedir. Aceitar os dois
formatos manteria o resíduo aberto por compatibilidade.

`schema_version`: **`1.0.0` → `2.0.0`** em `snapshot` e `event`.
`decision`, `evidence`, `recommendation` e `aros-briefing` não têm campo de
unidade e ficariam em `1.x` — mas ver a decisão pedida na §7.

## 5. Estratégia de migração e rejeição de v1

1. **Rejeição explícita.** O validador passa a recusar `schema_version` começando
   em `1.` para `snapshot` e `event`, com mensagem que nomeia o campo removido —
   não um "propriedade desconhecida" genérico, que mandaria o operador procurar
   no lugar errado.
2. **Teste de rejeição.** Fixture v1 preservada como caso negativo: prova que o
   formato antigo é recusado, e não silenciosamente aceito com o campo ignorado.
3. **Fixtures migradas** com os `UnitId` do catálogo aprovado.
4. **Sem período de convivência.** Não há produtor em operação: a ingestão é
   Fase 2.9 e o Hermes não existe. Migrar agora custa reescrever fixtures;
   migrar depois custaria um caminho de compatibilidade permanente.

---

## 6. O que depende do bloqueio B1

| Mudança | Depende de B1? |
|---|---|
| `unresolved_source_units` (campo novo) | **Não** — pode ir agora |
| Separar cobertura de falha de identidade | **Não** — já implementado no motor |
| `unit_id` como `string` com padrão | **Não** |
| `unit_id` como **enum literal** do catálogo | **Sim** |
| Migrar fixtures para `UnitId` reais | **Sim** |
| Retirar `unit_breakdown` da `MODEL_EGRESS_DENYLIST` | **Sim** |
| Fechar o gate D13 | **Sim** |

Ou seja: **a v2 pode ser implementada em duas etapas.** A primeira não depende do
CEO e já elimina o texto livre dos contratos. A segunda fecha o enum e o gate.

Não recomendo fazer a primeira sozinha, por um motivo: enquanto `unit_id` for
`string` com padrão, `maria_silva` continua sendo um `unit_id` sintaticamente
válido. O que impede isso é o catálogo — sem ele, a v2 troca o formato do resíduo
sem fechá-lo. **A recomendação é esperar B1 e fazer as duas juntas.**

---

## 7. Decisões que ainda preciso

1. **Versionamento por contrato ou global?** `snapshot` e `event` vão para 2.0.0;
   os outros quatro ficariam em 1.x. Duas famílias de versão convivendo é mais
   preciso e mais confuso. Alternativa: subir os seis juntos.
2. **`unit_display_name` atravessa para o modelo?** Vem do catálogo, então é
   seguro. Mas é redundante com `unit_id` para raciocinar, e só serve para o
   agente redigir texto mais legível. Incluir amplia a superfície sem necessidade
   analítica.
3. **Força do fingerprint.** `unitFingerprint` é sha256 com separador de domínio,
   truncado em 16 hex. É **handle de correlação, não anonimização**: um valor
   curto e adivinhável continua adivinhável por dicionário. Se o requisito for
   resistência real a reversão, precisa de HMAC com segredo mantido fora do plano
   do modelo — o que é infraestrutura, não schema.

---

## SUPERSEDED — §6 (`unit_id` como união literal)

A proposta de transformar `unit_id` em união literal compilada foi **substituída**
pela Fase 2.6b: `UnitId` permanece `string` validada e o catálogo é DADO governado.

Motivo: com ~40 unidades e crescendo, a união literal faria a abertura de uma escola
virar deploy de TypeScript. Ver `FASE_2_6B_GOVERNED_CATALOG_AND_POLICY.md` §2.

O resto deste documento segue válido.
