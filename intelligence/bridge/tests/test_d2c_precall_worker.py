"""
D2C — provas do worker PRECALL, no nível do processo.

Complementa a evidência TypeScript: aqui o worker roda de verdade (com o `python3`
local, não o da Hostinger) e prova o protocolo fechado ponta a ponta.
"""
import json
import os
import subprocess
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEDIDO_OK = {
    "protocol_version": "creditum_precall_request/1.0.0",
    "execution_id": "d2c-worker-0001",
    "execution_fingerprint": "f" * 64,
    "request_nonce": "n" * 16,
    "committed_at_utc": "2026-09-01T12:00:00Z",
}


def roda(entrada: str) -> tuple[int, str, str]:
    """
    Produção usa `-I` (isolado) porque lá o pacote está instalado em /opt/venv.
    `-I` descarta PYTHONPATH, e este repositório não é instalado; então aqui
    rodamos sem `-I`, com o repositório como cwd. A diferença é de LOCALIZAÇÃO
    do módulo, não de comportamento do worker — o que este arquivo prova é o
    protocolo, e ele é o mesmo nos dois casos.
    """
    p = subprocess.run(
        [sys.executable, "-B", "-m", "creditum_hermes_precall.worker"],
        input=entrada, capture_output=True, text=True, cwd=RAIZ, timeout=60,
        env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1",
             "LC_ALL": "C.UTF-8"},
    )
    return p.returncode, p.stdout, p.stderr


class WorkerPrecall(unittest.TestCase):
    def _doc(self, entrada: str) -> dict:
        rc, out, _ = roda(entrada)
        self.assertEqual(rc, 0, "o worker deve sempre sair com protocolo, não com erro")
        linhas = [l for l in out.split("\n") if l.strip()]
        self.assertEqual(len(linhas), 1, "stdout deve conter UM documento")
        return json.loads(linhas[0])

    def test_pedido_valido_produz_resultado_fechado(self):
        d = self._doc(json.dumps(PEDIDO_OK))
        self.assertEqual(d["protocol_version"], "creditum_precall_result/1.0.0")
        self.assertEqual(d["execution_id"], PEDIDO_OK["execution_id"])
        self.assertEqual(d["request_nonce"], PEDIDO_OK["request_nonce"])
        # Nesta máquina o vínculo Hermes não existe: a recusa governada é o desfecho
        # honesto. O que importa é que o protocolo fecha e nada vaza.
        self.assertIn(d["outcome"], ("PRECALL_SUCCEEDED", "PRECALL_FAILED"))

    def test_versao_desconhecida_recusa(self):
        d = self._doc(json.dumps({**PEDIDO_OK, "protocol_version": "outro/9"}))
        self.assertEqual(d["outcome"], "PROTOCOL_REJECTED")
        self.assertEqual(d["defect"], "REQUEST_VERSION_UNSUPPORTED")

    def test_campo_desconhecido_recusa(self):
        d = self._doc(json.dumps({**PEDIDO_OK, "extra": "x"}))
        self.assertEqual(d["defect"], "REQUEST_FIELDS_INVALID")

    def test_campo_ausente_recusa(self):
        p = dict(PEDIDO_OK)
        del p["request_nonce"]
        d = self._doc(json.dumps(p))
        self.assertEqual(d["defect"], "REQUEST_FIELDS_INVALID")

    def test_json_malformado_recusa(self):
        d = self._doc("{ isto não é json")
        self.assertEqual(d["defect"], "REQUEST_NOT_JSON")

    def test_pedido_grande_demais_recusa(self):
        grande = json.dumps({**PEDIDO_OK, "execution_id": "x" * (70 * 1024)})
        d = self._doc(grande)
        self.assertEqual(d["defect"], "REQUEST_TOO_LARGE")

    def test_nenhum_material_de_autoridade_no_resultado(self):
        rc, out, err = roda(json.dumps(PEDIDO_OK))
        junto = out + err
        for proibido in ("STEFANO", "APPROVED", "approval_id", "decision_id",
                         "sk-", "Traceback"):
            self.assertNotIn(proibido, junto, f"vazou: {proibido}")

    def test_worker_nao_chama_caminho_vivo(self):
        """AST do próprio worker: nomes CHAMADOS, nunca menção em docstring."""
        import ast
        caminho = os.path.join(RAIZ, "creditum_hermes_precall", "worker.py")
        with open(caminho, encoding="utf-8") as fh:
            arvore = ast.parse(fh.read())
        chamados = set()
        for n in ast.walk(arvore):
            if isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    chamados.add(f.id)
                elif isinstance(f, ast.Attribute):
                    chamados.add(f.attr)
        for proibido in ("execute_live", "create", "post", "request", "urlopen"):
            self.assertNotIn(proibido, chamados)
        self.assertIn("precall_probe", chamados)


if __name__ == "__main__":
    unittest.main()
