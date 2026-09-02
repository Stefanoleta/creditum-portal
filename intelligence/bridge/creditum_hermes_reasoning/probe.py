"""
Fase 3.1d-b-r3 — o relatório da sonda: metadado seguro, e só.

─── O que ele NÃO carrega ───────────────────────────────────────────────────

Chave de API, `base_url`, token, header de autenticação, configuração bruta, o system
prompt inteiro, o payload de usuário inteiro, cadeia de raciocínio, dado de negócio.

Ele carrega HASHES e CONTAGENS. Um hash prova identidade sem transportar conteúdo, e é
o que permite auditar sem republicar.

O `base_url` entra como impressão digital e scheme — nunca como host. Hostname em
relatório é topologia interna de graça para quem lê o relatório.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from dataclasses import asdict, dataclass
from typing import Any

FIXTURE_DIR = pathlib.Path(__file__).parent / "fixtures"
FIXTURE_HASH_DOMAIN = "hermes_synthetic_fixture_content/v1"


def load_fixture(nome: str = "synthetic_direct_fact.v1.json") -> tuple[dict[str, Any], str]:
    """O fixture e seu hash de conteúdo. Bytes exatos, sem reformatação."""
    bruto = (FIXTURE_DIR / nome).read_bytes()
    dados = json.loads(bruto.decode("utf-8"))
    h = hashlib.sha256(f"{FIXTURE_HASH_DOMAIN}:".encode("utf-8") + bruto).hexdigest()
    return dados, h


@dataclass(frozen=True)
class PrecallProbeReport:
    """Estrutura FECHADA. Campo novo é decisão, não conveniência."""

    runtime_id: str
    runtime_version: str
    mode: str
    executor: str
    constitution_id: str
    constitution_version: str
    constitution_hash: str
    system_contract_id: str
    system_contract_version: str
    system_contract_hash: str
    fixture_id: str
    fixture_hash: str
    provider: str
    model: str
    api_mode: str
    #: Estrutura conferida — https, com host, sem userinfo/query/fragment.
    base_url_structurally_valid: bool
    base_url_scheme: str
    base_url_fingerprint: str
    #: Identidade do SDK observada pela 3.1d-c4. Nomes, nunca objetos.
    sdk_version: str
    sdk_client_class: str
    sdk_responses_class: str
    sdk_create_descriptor: str
    sdk_constructor_surface_verified: bool
    sdk_create_surface_verified: bool
    #: `Response.output_text` AGREGA blocos de vários itens `message`. A superfície
    #: está observada; a regra de qual é a resposta final NÃO está aprovada.
    live_response_policy: str
    #: Existe credencial resolvida? Booleano e TIPO. NUNCA o valor.
    secret_material_present: bool
    secret_material_type: str
    secret_material_nonempty: bool
    secret_material_exposed: bool
    system_contract_exact: bool
    user_payload_exact: bool
    user_payload_hash: str
    request_hash: str
    tool_count: int
    #: O AIAgent saiu do caminho. Estes provam a ausência, e ausência provada não é
    #: ausência presumida.
    aiagent_used: bool
    plugin_discovery_used: bool
    hermes_relay_used: bool
    client_constructions: int
    sdk_call_attempted: bool
    provider_call_count: int
    model_call_completed: bool
    verdict: str

    def to_public_dict(self) -> dict[str, Any]:
        return dict(asdict(self))


# ─────────────────────────────────────────────────────────────────────────────
# A FRONTEIRA DE SERIALIZAÇÃO PÚBLICA
#
# `{...}` é um CONTAINER, não uma garantia. `json.dumps({"detail": binding})` é um
# dicionário literal perfeitamente bem formado que publica o vínculo inteiro — e foi
# exatamente isso que a r6-r4 aceitou por confiar na forma sintática do argumento.
#
# A garantia não pode morar na sintaxe de quem chama. Ela mora aqui: um tipo FECHADO,
# conferido por identidade, com valores conferidos um a um.
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PrecallRefusalReport:
    """A recusa também é saída pública, e por isso também é estrutura fechada."""

    runtime_id: str
    runtime_version: str
    mode: str
    executor: str
    verdict: str
    aiagent_used: bool
    sdk_call_attempted: bool
    provider_call_count: int

    def to_public_dict(self) -> dict[str, Any]:
        return dict(asdict(self))


#: Os ÚNICOS tipos que podem virar saída pública. Tupla fechada, conferida por
#: identidade de tipo.
GOVERNED_PUBLIC_REPORTS = (PrecallProbeReport, PrecallRefusalReport)

#: Os ÚNICOS tipos de valor que podem atravessar. `dict` e `list` NÃO estão aqui:
#: aninhar é como o material bruto entraria sem ninguém olhar.
SAFE_PUBLIC_VALUE_TYPES = (str, bool, int)


class PublicReportRefusal(Exception):
    def __init__(self, defect: str) -> None:
        super().__init__(defect)
        self.defect = defect


def serialize_safe_public_report(relatorio: object) -> str:
    """
    O ÚNICO caminho de `json.dumps` para saída observável em produção.

    Recusa antes de serializar. Serializar e depois olhar não seria conferência: o
    `json.dumps` já teria executado o `__str__`/`default` do que recebeu.
    """
    if type(relatorio) not in GOVERNED_PUBLIC_REPORTS:
        raise PublicReportRefusal("PUBLIC_REPORT_TYPE_NOT_GOVERNED")
    campos = relatorio.to_public_dict()
    if type(campos) is not dict:
        raise PublicReportRefusal("PUBLIC_REPORT_SHAPE_NOT_GOVERNED")
    for chave, valor in campos.items():
        if type(chave) is not str:
            raise PublicReportRefusal("PUBLIC_REPORT_KEY_NOT_GOVERNED")
        # `type(...) in` e não `isinstance`: uma subclasse de `str` com `__str__`
        # próprio herdaria a permissão sem herdar a intenção.
        if type(valor) not in SAFE_PUBLIC_VALUE_TYPES:
            raise PublicReportRefusal("PUBLIC_REPORT_VALUE_NOT_GOVERNED")
    return json.dumps(campos, ensure_ascii=False, indent=2)
