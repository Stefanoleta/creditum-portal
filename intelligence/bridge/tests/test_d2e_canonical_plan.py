"""
D2E-A2 — provas do plano canônico.

O ponto central: os hashes que Stefano aprova passam a existir ANTES da execução, e
vêm da MESMA construção que a execução usa. Zero rede, zero modelo, zero livro-razão.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest

from creditum_hermes_reasoning.codex import (
    READ_MODEL_FINGERPRINT_DOMAIN,
    RUNTIME_BINDING_FINGERPRINT_DOMAIN,
    RUNTIME_BINDING_IDENTITY_FIELDS,
    read_model_fingerprint,
    request_fingerprint,
    runtime_binding_fingerprint,
    user_payload_hash,
)
from creditum_hermes_reasoning.contract import build_system_contract
from creditum_hermes_reasoning.executor import construir_material_governado
from creditum_hermes_reasoning.plan import (
    OPERATION_REASONING_RESPONSE_ONLY,
    build_canonical_plan_material,
)
from creditum_hermes_reasoning.probe import load_fixture

from .support import approved_binding_for_tests

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID = "d2e-plan-teste-0001"
HEX = 64

#: Dois endpoints sintéticos, ambos estruturalmente válidos. É essa validade
#: que torna a substituição perigosa: nada no formato a denuncia.
ENDPOINT_A = "https://a.exemplo.invalido/v1"
ENDPOINT_B = "https://b.exemplo.invalido/v1"


def _plano(execution_id: str = ID, **over):
    fixture, _ = load_fixture()
    return build_canonical_plan_material(
        execution_id=execution_id,
        contract=over.get("contract", build_system_contract()),
        binding=over.get("binding", approved_binding_for_tests()),
        read_model=over.get("read_model", fixture["read_model"]),
    )


class PlanoCanonico(unittest.TestCase):
    def test_a_todos_os_valores_sao_concretos(self) -> None:
        p = _plano()
        for campo in ("read_model_fingerprint", "request_fingerprint",
                      "runtime_binding_fingerprint", "request_hash", "user_payload_hash"):
            v = getattr(p, campo)
            self.assertEqual(len(v), HEX, campo)
            self.assertTrue(all(c in "0123456789abcdef" for c in v), campo)
            # Nenhum placeholder: `"x"*64` era o que a d1 recebia antes desta fase.
            self.assertNotEqual(v, v[0] * HEX, f"{campo} parece placeholder")

    def test_b_determinismo_exato(self) -> None:
        a, b = _plano(), _plano()
        self.assertEqual(a, b, "mesma entrada deve dar o mesmo plano")

    def test_c_execution_id_diferente_nao_muda_os_hashes(self) -> None:
        # O id identifica a EXECUÇÃO, não o conteúdo. Se ele entrasse nos hashes de
        # conteúdo, dois pedidos idênticos teriam compromissos diferentes.
        a, b = _plano(), _plano("d2e-plan-teste-0002")
        self.assertNotEqual(a.execution_id, b.execution_id)
        self.assertEqual(a.request_hash, b.request_hash)
        self.assertEqual(a.user_payload_hash, b.user_payload_hash)

    def test_d_read_model_diferente_muda_os_hashes_certos(self) -> None:
        fixture, _ = load_fixture()
        outro = dict(fixture["read_model"])
        outro["__marca_d2e__"] = "conteudo-diferente"
        a, b = _plano(), _plano(read_model=outro)
        self.assertNotEqual(a.read_model_fingerprint, b.read_model_fingerprint)
        self.assertNotEqual(a.user_payload_hash, b.user_payload_hash)
        self.assertNotEqual(a.request_hash, b.request_hash)
        # E o que NÃO depende do read model não se mexe.
        self.assertEqual(a.runtime_binding_fingerprint, b.runtime_binding_fingerprint)

    def test_e_identidade_do_runtime_diferente_muda_o_fingerprint(self) -> None:
        # `model` não serve de variável aqui: o `__post_init__` do vínculo recusa
        # qualquer valor != APPROVED_MODEL — e isso é a d1 fazendo o trabalho dela.
        # Uso `hermes_version`, que é identidade governada e livre.
        a = _plano()
        b = _plano(binding=approved_binding_for_tests(hermes_version="0.20.5"))
        self.assertNotEqual(a.runtime_binding_fingerprint, b.runtime_binding_fingerprint)
        # O PEDIDO não muda: a versão do Hermes não entra no material enviado. Isso é
        # correto, e é por isso que os dois fingerprints existem separados.
        self.assertEqual(a.request_hash, b.request_hash)
        self.assertEqual(a.read_model_fingerprint, b.read_model_fingerprint)

    def test_f1_credencial_rodada_NAO_muda_o_fingerprint(self) -> None:
        # Rotação de chave não é mudança semântica de execução. Se mudasse o hash,
        # Stefano teria de reaprovar a cada rotação — e a rotação vazaria para dentro
        # de um valor que aparece em texto de autorização.
        a = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_A, "api_key": "AAAAAAAAAAAAAAAA"})
        b = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_A, "api_key": "BBBBBBBBBBBBBBBB"})
        self.assertEqual(runtime_binding_fingerprint(a), runtime_binding_fingerprint(b))

    def test_f2_endpoint_diferente_MUDA_o_fingerprint(self) -> None:
        # O defeito que o regate encontrou: eu havia agrupado endpoint e credencial
        # como se fossem a mesma categoria. Não são. Um é PARA ONDE a execução vai.
        a = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_A, "api_key": "AAAAAAAAAAAAAAAA"})
        b = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_B, "api_key": "AAAAAAAAAAAAAAAA"})
        self.assertNotEqual(runtime_binding_fingerprint(a), runtime_binding_fingerprint(b))
        # E é a identidade do endpoint que entra, não a URL.
        self.assertNotEqual(a.base_url_fingerprint(), b.base_url_fingerprint())

    def test_f3_o_endpoint_committed_e_o_EFETIVO(self) -> None:
        # `base_url_fingerprint()` hasheia o mesmo valor que `to_client_kwargs()`
        # entrega ao cliente. Se hasheasse outra coisa, o compromisso seria com um
        # endpoint que não é o usado.
        import hashlib
        b = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_B, "api_key": "AAAAAAAAAAAAAAAA"})
        efetivo = b.to_client_kwargs()["base_url"]
        esperado = hashlib.sha256(
            ("hermes_codex_base_url/v1:" + efetivo).encode("utf-8")).hexdigest()
        self.assertEqual(b.base_url_fingerprint(), esperado)

    def test_f4_a_URL_crua_nao_entra_no_fingerprint(self) -> None:
        # O hash prova que o destino é AQUELE sem transportar host, porta ou caminho.
        b = approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_B, "api_key": "AAAAAAAAAAAAAAAA"})
        fp = runtime_binding_fingerprint(b)
        self.assertNotIn("exemplo", fp)
        self.assertRegex(fp, r"^[0-9a-f]{64}$")

    def test_f5_endpoint_diferente_muda_o_plano_inteiro(self) -> None:
        a = _plano(binding=approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_A, "api_key": "AAAAAAAAAAAAAAAA"}))
        b = _plano(binding=approved_binding_for_tests(
            execution_material={"base_url": ENDPOINT_B, "api_key": "AAAAAAAAAAAAAAAA"}))
        self.assertNotEqual(a.runtime_binding_fingerprint, b.runtime_binding_fingerprint)
        # O CORPO do pedido não muda — e não deve. `request_hash` compromete-se com o
        # material governado, não com o destino. Distorcê-lo para "mudar tudo" seria
        # mentir sobre o que ele significa.
        self.assertEqual(a.request_hash, b.request_hash)
        self.assertEqual(a.user_payload_hash, b.user_payload_hash)

    def test_g_dominios_separados_por_valor(self) -> None:
        # Dois hashes do mesmo conteúdo em papéis diferentes não podem colidir.
        self.assertNotEqual(READ_MODEL_FINGERPRINT_DOMAIN, RUNTIME_BINDING_FINGERPRINT_DOMAIN)
        fixture, _ = load_fixture()
        rm = fixture["read_model"]
        self.assertNotEqual(read_model_fingerprint(rm), user_payload_hash(json.dumps(
            rm, ensure_ascii=False, sort_keys=True, separators=(",", ":"))))

    def test_h_UMA_construcao_do_pedido(self) -> None:
        # A prova de fonte única: o plano hasheia o pedido que a MESMA função monta.
        fixture, _ = load_fixture()
        binding = approved_binding_for_tests()
        contrato = build_system_contract()
        request, payload = construir_material_governado(
            contract=contrato, binding=binding, read_model=fixture["read_model"])
        p = _plano(binding=binding, contract=contrato)
        self.assertEqual(p.request_hash, request_fingerprint(request))
        self.assertEqual(p.user_payload_hash, user_payload_hash(payload))
        self.assertEqual(p.request_fingerprint, p.request_hash)

    def test_i_o_executor_delega_para_a_funcao_de_modulo(self) -> None:
        """ESTRUTURAL: `_construir` não pode ter uma segunda cópia da construção."""
        import ast
        fonte = open(os.path.join(RAIZ, "creditum_hermes_reasoning/executor.py"),
                     encoding="utf-8").read()
        arv = ast.parse(fonte)
        corpo = None
        for n in ast.walk(arv):
            if isinstance(n, ast.FunctionDef) and n.name == "_construir":
                corpo = n
        self.assertIsNotNone(corpo)
        chamadas = {c.func.id for c in ast.walk(corpo) if isinstance(c, ast.Call)
                    and isinstance(c.func, ast.Name)}
        self.assertIn("construir_material_governado", chamadas)
        for proibida in ("build_governed_request", "governed_user_payload",
                         "enforce_final_request"):
            self.assertNotIn(proibida, chamadas, f"_construir reconstrói: {proibida}")

    def test_j_escopo_fechado(self) -> None:
        p = _plano()
        self.assertEqual(p.operation, OPERATION_REASONING_RESPONSE_ONLY)
        self.assertEqual(p.tool_count, 0)
        self.assertFalse(p.stream)

    def test_k_o_plano_e_congelado(self) -> None:
        p = _plano()
        with self.assertRaises(Exception):
            p.request_hash = "0" * HEX  # type: ignore[misc]

    def test_l_planejar_nao_toca_modelo_provedor_nem_rede(self) -> None:
        """ESTRUTURAL, por AST: nomes CHAMADOS no plano, nunca prosa."""
        import ast
        arv = ast.parse(open(os.path.join(RAIZ, "creditum_hermes_reasoning/plan.py"),
                             encoding="utf-8").read())
        chamados = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    chamados.add(f.id)
                elif isinstance(f, ast.Attribute):
                    chamados.add(f.attr)
        for proibido in ("create", "post", "request", "urlopen", "execute_live",
                         "precall_probe", "OpenAI", "Client"):
            self.assertNotIn(proibido, chamados, f"o plano chama {proibido}")
        texto = open(os.path.join(RAIZ, "creditum_hermes_reasoning/plan.py"),
                     encoding="utf-8").read()
        self.assertNotIn("live_authorization", texto.split('"""')[2] if texto.count('"""') > 2 else "")


class WorkerDoPlanejador(unittest.TestCase):
    """O entrypoint dedicado, no nível do processo."""

    def _roda(self, entrada: str) -> dict:
        # `-I` descarta PYTHONPATH e este repositório não é instalado; produção roda
        # com `-I` porque lá os pacotes vivem no site-packages do /opt/venv. Aqui o
        # que se prova é o PROTOCOLO, e ele não depende do modo isolado.
        p = subprocess.run(
            [sys.executable, "-B", "-m", "creditum_hermes_planner.worker"],
            input=entrada, capture_output=True, text=True, timeout=60, cwd=RAIZ,
            env={"PATH": "/usr/bin:/bin", "PYTHONPATH": RAIZ,
                 "PYTHONDONTWRITEBYTECODE": "1", "LC_ALL": "C.UTF-8"})
        self.assertEqual(p.returncode, 0, "o worker deve sair com protocolo")
        linhas = [l for l in p.stdout.split("\n") if l.strip()]
        self.assertEqual(len(linhas), 1, "stdout deve ter UM documento")
        return json.loads(linhas[0])

    def test_m_versao_errada_recusa(self) -> None:
        d = self._roda(json.dumps({"protocol_version": "outro/9", "execution_id": "x"}))
        self.assertEqual(d["defect"], "REQUEST_VERSION_UNSUPPORTED")

    def test_n_hash_vindo_do_chamador_e_recusado(self) -> None:
        # O planejador CALCULA. Aceitar `request_hash=...` faria atestar o que não conferiu.
        d = self._roda(json.dumps({
            "protocol_version": "creditum_plan_request/1.0.0",
            "execution_id": ID, "request_hash": "f" * HEX}))
        self.assertEqual(d["defect"], "REQUEST_FIELDS_INVALID")

    def test_o_campo_de_modo_e_recusado(self) -> None:
        for extra in ({"mode": "live"}, {"live": True}, {"model": "outro"},
                      {"provider": "outro"}):
            d = self._roda(json.dumps({
                "protocol_version": "creditum_plan_request/1.0.0",
                "execution_id": ID, **extra}))
            self.assertEqual(d["defect"], "REQUEST_FIELDS_INVALID", str(extra))

    def test_p_sem_hermes_o_desfecho_e_recusa_governada(self) -> None:
        d = self._roda(json.dumps({
            "protocol_version": "creditum_plan_request/1.0.0", "execution_id": ID}))
        self.assertEqual(d["execution_id"], ID)
        self.assertIn(d["outcome"], ("PLAN_DERIVED", "PLAN_FAILED"))
        junto = json.dumps(d)
        for proibido in ("api_key", "base_url", "Traceback", "sk-", "STEFANO"):
            self.assertNotIn(proibido, junto)

    def test_q_o_worker_nao_chama_caminho_vivo(self) -> None:
        import ast
        arv = ast.parse(open(os.path.join(RAIZ, "creditum_hermes_planner/worker.py"),
                             encoding="utf-8").read())
        chamados = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    chamados.add(f.id)
                elif isinstance(f, ast.Attribute):
                    chamados.add(f.attr)
        for proibido in ("execute_live", "create", "precall_probe", "urlopen",
                         "reserveExecutionAttempt"):
            self.assertNotIn(proibido, chamados)
        self.assertIn("build_canonical_plan_material", chamados)


if __name__ == "__main__":
    unittest.main()
