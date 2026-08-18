# `expected_units` — dados governados de membership

Este diretório é a fonte de produção do **denominador** da cobertura.

Ele está **vazio de dados**, e isso é o estado correto: as memberships reais não
existem ainda. Enquanto estiver vazio, `PRODUCTION_EXPECTED_UNITS_PROVIDER`
responde `DATA_NOT_AVAILABLE` para todo período e dataset, e a cobertura de
produção falha fechado.

Não preencher com aproximação. Um denominador fabricado produz um número
executivo falso que ninguém tem como questionar.

## Formato

Um arquivo por `period` + `dataset_id`:

```
{period}__{dataset_id}.json
```

Por exemplo: `2026-08__ds_vendas_mensal.json`.

```json
{
  "schema_version": "1.0.0",
  "period": "2026-08",
  "dataset_id": "ds_vendas_mensal",
  "expected_units": [
    { "unit_id": "mogi" },
    { "unit_id": "santos" }
  ],
  "provenance": {
    "source_system": "nome_governado_da_fonte",
    "source_version": "1.0.0",
    "content_hash": "<sha256 do próprio arquivo, hex minúsculo>"
  }
}
```

## Regras que o validador aplica

| condição | resultado |
| --- | --- |
| `period` fora de `AAAA-MM` | recusa |
| `dataset_id` ausente ou fora da forma de identificador | recusa |
| `unit_id` fora do catálogo governado D13 | recusa |
| `unit_id` duplicado no mesmo `period + dataset_id` | recusa — nunca deduplicado |
| `expected_units` vazio | recusa — ausência é `DATA_NOT_AVAILABLE`, não lista vazia |
| `content_hash` divergente do conteúdo | recusa |
| `period`/`dataset_id` do arquivo divergentes da consulta | recusa |
| arquivo ausente | `DATA_NOT_AVAILABLE` |
| JSON corrompido | recusa — corrupção é defeito, não ausência |

Unidade com `status: inactive` no catálogo **pode** constar aqui. Status de
catálogo e expectativa do período são dimensões separadas: se o dado governado
declara que a unidade era esperada, ela entra no denominador — e se não reportou,
conta como ausente.

## Como calcular o `content_hash`

```bash
python3 - <<'PY'
import hashlib, json, pathlib, sys
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "arquivo.json")
d = json.loads(p.read_text())
d["provenance"]["content_hash"] = "0" * 64
# Grave, então recalcule sobre os bytes finais e substitua.
PY
```

O hash é do arquivo inteiro como ele fica em disco, incluindo o campo
`content_hash` já preenchido — grave o arquivo, calcule `shasum -a 256`, e escreva
o valor. O validador recalcula e compara.

**Nota:** o hash serve à procedência. `unit_id` é governado pelo D13 e nunca
derivado de hash.

## Trocar de membership é mudança governada

Membership diferente exige `source_version` nova. O `membership_id` — identidade
estrutural sobre `period`, `dataset_id` e a lista ordenada — muda junto, e é o que
torna uma substituição silenciosa detectável.
