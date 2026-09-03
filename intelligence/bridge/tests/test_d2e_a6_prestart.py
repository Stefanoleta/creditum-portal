"""
D2E-A6 — o portão de integridade pré-partida, testado na matriz do §13.

─── O dublê de YAML, e por que ele é legítimo ───────────────────────────────────

Esta máquina não tem PyYAML nem pip — medido. A Hostinger tem, porque o Hermes lê
`config.yaml`. Os fixtures aqui são escritos como JSON, que é subconjunto de YAML, e
o dublê de `safe_load` é `json.load`.

Isso dobra o AMBIENTE, não a autoridade — a mesma disciplina de `instala_hermes()` na
a4. `_le_yaml` só lê e recusa: nenhuma entrada a faz conceder algo. O que NÃO existe
aqui é porta que troque verificador de procedência; a d2e-a4-r5 custou uma rodada
inteira por causa de uma.

E há teste para o caso sem parser: ausência de YAML é RECUSA, nunca passagem.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import types
import unittest

from creditum_hermes_prestart import verify
from creditum_hermes_prestart.verify import (
    PrestartRefusal, confere_config, confere_identidade_do_manifesto, confere_plugin_yaml,
    confere_precedencia, confere_versao_do_hermes,
)

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CONSTRUTOR = RAIZ.parent / "scripts" / "build-telegram-plugin-manifest.py"
CHAVE = "telegram-platform"
PLATAFORMA = "telegram"
COMPAT_ID = "creditum_telegram_adapter_compat/0.20.4/v1"


def instala_yaml() -> None:
    """Dublê de PyYAML: `safe_load` é `json.load`. JSON é subconjunto de YAML."""
    if "yaml" in sys.modules:
        return
    mod = types.ModuleType("yaml")

    def safe_load(fh):  # noqa: ANN001, ANN202
        dados = fh.read()
        if isinstance(dados, bytes):
            dados = dados.decode("utf-8")
        return json.loads(dados)

    mod.safe_load = safe_load  # type: ignore[attr-defined]
    sys.modules["yaml"] = mod


def desinstala_yaml() -> None:
    sys.modules.pop("yaml", None)


def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


class Bancada(unittest.TestCase):
    """Uma árvore de plugin real em disco, mais o manifesto gerado a partir dela."""

    def setUp(self) -> None:
        instala_yaml()
        # `.resolve()` porque no macOS `mkdtemp` devolve `/var/...`, que é symlink
        # de `/private/var/...`. O verificador recusa caminho não canônico, e está
        # certo: a bancada é que precisava ser canônica, não a regra.
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="d2e-a6-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.addCleanup(desinstala_yaml)

        self.plugin = self.tmp / "plugins" / "creditum-telegram-governed"
        (self.plugin / "creditum_hermes_telegram").mkdir(parents=True)
        self.projeto = self.tmp / "project-plugins"
        self.projeto.mkdir()

        self._escreve("plugin.yaml", json.dumps({
            "name": CHAVE, "kind": "platform", "version": "1.0.0",
            "creditum": {"runtime_platform": PLATAFORMA},
        }))
        self._escreve("__init__.py", "def register(ctx):\n    pass\n")
        self._escreve("creditum_hermes_telegram/compat.py",
                      f'ADAPTER_COMPAT_ID = "{COMPAT_ID}"\n')

        self.config = self.tmp / "config.yaml"
        self.config.write_text(json.dumps({"plugins": {"enabled": [CHAVE]}}),
                               encoding="utf-8")
        self.manifesto = self.tmp / "MANIFEST.json"
        self._gera_manifesto()

    def _escreve(self, rel: str, conteudo: str) -> None:
        alvo = self.plugin / rel
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_text(conteudo, encoding="utf-8")

    def _gera_manifesto(self) -> None:
        import subprocess
        r = subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin),
             "--source-commit", "55bea0e19d4cb71d44179fe99667c1a6ffca40a7",
             "--plugin-root", str(self.plugin),
             "--plugin-version", "1.0.0", "--artifact-version", "1.0.0",
             "--config-path", str(self.config),
             "--precedence-path", str(self.projeto),
             "--out", str(self.manifesto)],
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[:500])

    def _remenda_manifesto(self, **campos: object) -> None:
        d = json.loads(self.manifesto.read_text(encoding="utf-8"))
        d.update(campos)
        self.manifesto.write_text(json.dumps(d, indent=2), encoding="utf-8")

    def defeitos(self, **kw: object) -> set[str]:
        r = verify.verifica(str(self.manifesto), **kw)  # type: ignore[arg-type]
        return {d for d, _ in r.defeitos}

    # A versão do Hermes nunca está instalada nesta máquina; é o único defeito
    # esperado no caminho feliz local, e ele é conferido à parte.
    AMBIENTE = {"HERMES_VERSION_UNKNOWN"}


class MatrizDoPortao(Bancada):
    # ─── A: aprovado exato → só o defeito de AMBIENTE ────────────────────────
    def test_A_plugin_aprovado_exato_passa_tudo_menos_o_ambiente(self) -> None:
        self.assertEqual(self.defeitos(), self.AMBIENTE)

    def test_A2_com_a_versao_do_hermes_certa_o_portao_APROVA(self) -> None:
        """
        O caminho feliz COMPLETO, com a leitura de versão dublada no nível do módulo.

        `verifica` não aceita a versão por parâmetro — de propósito. O que se dobra
        aqui é a consulta a `importlib.metadata`, que é ambiente.
        """
        original = verify.versao_do_hermes_instalado
        verify.versao_do_hermes_instalado = lambda _: "0.20.4"  # type: ignore[assignment]
        self.addCleanup(lambda: setattr(verify, "versao_do_hermes_instalado", original))
        r = verify.verifica(str(self.manifesto))
        self.assertTrue(r.aprovado, r.defeitos)
        self.assertEqual(r.observado["plugin_key"], CHAVE)
        self.assertEqual(r.observado["runtime_platform"], PLATAFORMA)
        self.assertEqual(r.observado["adapter_compat_id"], COMPAT_ID)
        self.assertTrue(r.observado["closed_package"])

    # ─── B: diretório ausente ────────────────────────────────────────────────
    def test_B_diretorio_do_plugin_ausente_RECUSA(self) -> None:
        shutil.rmtree(self.plugin)
        self.assertEqual(self.defeitos(), {"PLUGIN_ROOT_MISSING"})

    # ─── C: plugin.yaml ausente ──────────────────────────────────────────────
    def test_C_plugin_yaml_ausente_RECUSA(self) -> None:
        (self.plugin / "plugin.yaml").unlink()
        d = self.defeitos()
        self.assertIn("PLUGIN_FILE_MISSING", d)

    def test_C2_init_ausente_RECUSA(self) -> None:
        (self.plugin / "__init__.py").unlink()
        self.assertIn("PLUGIN_FILE_MISSING", self.defeitos())

    # ─── D: plugin.yaml malformado ───────────────────────────────────────────
    def test_D_plugin_yaml_malformado_RECUSA(self) -> None:
        # Hash muda junto: os dois defeitos aparecem, e nenhum deles passa.
        (self.plugin / "plugin.yaml").write_text("{isto: nao é [json", encoding="utf-8")
        d = self.defeitos()
        self.assertIn("PLUGIN_FILE_HASH_MISMATCH", d)
        self.assertIn("PLUGIN_YAML_UNPARSEABLE", d)

    def test_D2_yaml_que_nao_e_mapa_RECUSA(self) -> None:
        with self.assertRaises(PrestartRefusal) as c:
            confere_plugin_yaml({}, chave=CHAVE, tipo="platform", versao="1.0.0",
                                plataforma=PLATAFORMA)
        self.assertEqual(c.exception.defect, "PLUGIN_KEY_UNEXPECTED")

    # ─── E: chave errada ─────────────────────────────────────────────────────
    def test_E_chave_errada_RECUSA(self) -> None:
        for errada in ("telegram", "telegram-platform-v2", "", "creditum-telegram"):
            with self.assertRaises(PrestartRefusal, msg=errada) as c:
                confere_plugin_yaml({"name": errada, "kind": "platform",
                                     "version": "1.0.0",
                                     "creditum": {"runtime_platform": PLATAFORMA}},
                                    chave=CHAVE, tipo="platform", versao="1.0.0",
                                    plataforma=PLATAFORMA)
            self.assertEqual(c.exception.defect, "PLUGIN_KEY_UNEXPECTED", errada)

    # ─── F: kind errado ──────────────────────────────────────────────────────
    def test_F_kind_errado_RECUSA(self) -> None:
        for errado in ("tool", "skill", "", "Platform"):
            with self.assertRaises(PrestartRefusal, msg=errado) as c:
                confere_plugin_yaml({"name": CHAVE, "kind": errado, "version": "1.0.0",
                                     "creditum": {"runtime_platform": PLATAFORMA}},
                                    chave=CHAVE, tipo="platform", versao="1.0.0",
                                    plataforma=PLATAFORMA)
            self.assertEqual(c.exception.defect, "PLUGIN_KIND_UNEXPECTED", errado)

    def test_F2_plataforma_de_runtime_errada_RECUSA(self) -> None:
        for errada in ("telegram-governed", "whatsapp", None):
            with self.assertRaises(PrestartRefusal, msg=str(errada)) as c:
                confere_plugin_yaml({"name": CHAVE, "kind": "platform",
                                     "version": "1.0.0",
                                     "creditum": {"runtime_platform": errada}},
                                    chave=CHAVE, tipo="platform", versao="1.0.0",
                                    plataforma=PLATAFORMA)
            self.assertEqual(c.exception.defect, "RUNTIME_PLATFORM_UNEXPECTED")

    def test_F3_versao_do_plugin_divergente_RECUSA(self) -> None:
        with self.assertRaises(PrestartRefusal) as c:
            confere_plugin_yaml({"name": CHAVE, "kind": "platform", "version": "1.0.1",
                                 "creditum": {"runtime_platform": PLATAFORMA}},
                                chave=CHAVE, tipo="platform", versao="1.0.0",
                                plataforma=PLATAFORMA)
        self.assertEqual(c.exception.defect, "PLUGIN_VERSION_UNEXPECTED")

    # ─── G: versão do Hermes errada ──────────────────────────────────────────
    def test_G_versao_do_hermes_errada_RECUSA(self) -> None:
        for lida in ("0.20.3", "0.20.5", "0.21.0", "1.0.0"):
            with self.assertRaises(PrestartRefusal, msg=lida) as c:
                confere_versao_do_hermes(lida, exigida="0.20.4")
            self.assertEqual(c.exception.defect, "HERMES_VERSION_UNSUPPORTED", lida)
        # Não conseguir ler é RECUSA, não "assume que está certa".
        with self.assertRaises(PrestartRefusal) as c:
            confere_versao_do_hermes(None, exigida="0.20.4")
        self.assertEqual(c.exception.defect, "HERMES_VERSION_UNKNOWN")
        confere_versao_do_hermes("0.20.4", exigida="0.20.4")  # não levanta

    # ─── H: hash de arquivo alterado ─────────────────────────────────────────
    def test_H_qualquer_arquivo_alterado_RECUSA(self) -> None:
        d = json.loads(self.manifesto.read_text(encoding="utf-8"))
        for entrada in d["plugin_files"]:
            rel = entrada["relative_path"]
            alvo = self.plugin / rel
            original = alvo.read_bytes()
            try:
                alvo.write_bytes(original + b"\n# byte a mais\n")
                self.assertIn("PLUGIN_FILE_HASH_MISMATCH", self.defeitos(), rel)
            finally:
                alvo.write_bytes(original)
        self.assertEqual(self.defeitos(), self.AMBIENTE, "restaurar devolve o aprovado")

    def test_H2_compat_id_trocado_RECUSA(self) -> None:
        alvo = self.plugin / "creditum_hermes_telegram" / "compat.py"
        alvo.write_text('ADAPTER_COMPAT_ID = "outra/identidade/v9"\n', encoding="utf-8")
        d = self.defeitos()
        self.assertIn("ADAPTER_COMPAT_ID_UNEXPECTED", d)
        self.assertIn("PLUGIN_FILE_HASH_MISMATCH", d)

    def test_H3_compat_id_nao_literal_RECUSA(self) -> None:
        alvo = self.plugin / "creditum_hermes_telegram" / "compat.py"
        alvo.write_text("import os\nADAPTER_COMPAT_ID = os.environ['X']\n",
                        encoding="utf-8")
        self.assertIn("COMPAT_MODULE_UNREADABLE", self.defeitos())

    # ─── I: arquivo inesperado, pacote fechado ───────────────────────────────
    def test_I_arquivo_extra_RECUSA_em_pacote_fechado(self) -> None:
        (self.plugin / "extra.py").write_text("# código que a revisão nunca viu\n",
                                              encoding="utf-8")
        self.assertIn("PLUGIN_UNEXPECTED_FILE", self.defeitos())

    def test_I2_arquivo_extra_em_subdiretorio_tambem_RECUSA(self) -> None:
        (self.plugin / "creditum_hermes_telegram" / "sorrateiro.py").write_text(
            "# aninhado\n", encoding="utf-8")
        self.assertIn("PLUGIN_UNEXPECTED_FILE", self.defeitos())

    # ─── R1 §4-§7: bytecode NÃO declarado é entrada não declarada ────────────
    #
    # Este bloco substitui `test_I3_pycache_e_pyc_nao_contam_como_inesperados`, que
    # afirmava o contrário e por isso era o defeito, não o teste dele. `-B` e
    # `PYTHONDONTWRITEBYTECODE=1` impedem ESCREVER bytecode; não impedem LER.
    def test_R1_4_pyc_na_raiz_RECUSA(self) -> None:
        (self.plugin / "inesperado.pyc").write_bytes(b"\x00\x0c\x0d\x0a")
        self.assertIn("PLUGIN_UNEXPECTED_FILE", self.defeitos())

    def test_R1_5_pycache_com_bytecode_RECUSA(self) -> None:
        (self.plugin / "__pycache__").mkdir()
        (self.plugin / "__pycache__" / "__init__.cpython-313.pyc").write_bytes(b"\x00")
        d = self.defeitos()
        self.assertIn("PLUGIN_UNEXPECTED_FILE", d)
        # O diretório E o conteúdo, os dois nomeados.
        r = verify.verifica(str(self.manifesto))
        detalhes = {det for dt, det in r.defeitos if dt == "PLUGIN_UNEXPECTED_FILE"}
        self.assertIn("__pycache__", detalhes)
        self.assertIn(os.path.join("__pycache__", "__init__.cpython-313.pyc"), detalhes)

    def test_R1_6_pycache_ANINHADO_RECUSA(self) -> None:
        cache = self.plugin / "creditum_hermes_telegram" / "__pycache__"
        cache.mkdir()
        (cache / "compat.cpython-313.pyc").write_bytes(b"\x00")
        self.assertIn("PLUGIN_UNEXPECTED_FILE", self.defeitos())

    def test_R1_7_pycache_VAZIO_tambem_RECUSA(self) -> None:
        """
        O invariante é sobre ENTRADAS do sistema de arquivos, não sobre conteúdo
        executável. Enumerar só arquivos deixaria o diretório vazio passar — e foi
        essa a segunda exclusão que a a6 tinha, além do `.pyc`.
        """
        (self.plugin / "__pycache__").mkdir()
        r = verify.verifica(str(self.manifesto))
        detalhes = {det for dt, det in r.defeitos if dt == "PLUGIN_UNEXPECTED_FILE"}
        self.assertEqual(detalhes, {"__pycache__"})

    def test_R1_7b_diretorio_extra_qualquer_RECUSA(self) -> None:
        (self.plugin / "dados").mkdir()
        self.assertIn("PLUGIN_UNEXPECTED_FILE", self.defeitos())

    def test_R1_7c_diretorios_DECLARADOS_nao_sao_inesperados(self) -> None:
        """`creditum_hermes_telegram/` é implicado por um arquivo declarado."""
        r = verify.verifica(str(self.manifesto))
        self.assertEqual([d for d, _ in r.defeitos if d == "PLUGIN_UNEXPECTED_FILE"], [])
        self.assertEqual(self.defeitos(), self.AMBIENTE)

    # ─── R1 §8: o construtor recusa aprovar bytecode ─────────────────────────
    def test_R1_8_construtor_recusa_arvore_com_bytecode(self) -> None:
        import subprocess
        casos = {
            "A_raiz_pyc": [("raiz.pyc", b"\x00")],
            "B_pycache_pyc": [("__pycache__/x.cpython-313.pyc", b"\x00")],
            "C_pycache_aninhado": [
                ("creditum_hermes_telegram/__pycache__/c.cpython-313.pyc", b"\x00")],
            "D_pyo": [("velho.pyo", b"\x00")],
        }
        for nome, entradas in casos.items():
            criados = []
            for rel, dados in entradas:
                alvo = self.plugin / rel
                alvo.parent.mkdir(parents=True, exist_ok=True)
                alvo.write_bytes(dados)
                criados.append(alvo)
            saida = self.tmp / f"man_{nome}.json"
            r = subprocess.run(
                [sys.executable, "-B", str(CONSTRUTOR),
                 "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
                 "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
                 "--artifact-version", "1.0.0", "--config-path", str(self.config),
                 "--precedence-path", str(self.projeto), "--out", str(saida)],
                capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0, nome)
            self.assertIn("NÃO aprova", r.stderr, nome)
            self.assertFalse(saida.exists(), f"{nome}: gerou manifesto com bytecode")
            # E NÃO limpou a árvore por conta própria.
            for alvo in criados:
                self.assertTrue(alvo.exists(), f"{nome}: o construtor apagou {alvo}")
                alvo.unlink()
            for alvo in criados:
                cache = alvo.parent
                if cache.name == "__pycache__" and not any(cache.iterdir()):
                    cache.rmdir()

    def test_R1_8b_construtor_recusa_pycache_VAZIO(self) -> None:
        import subprocess
        (self.plugin / "__pycache__").mkdir()
        saida = self.tmp / "man_vazio.json"
        r = subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
             "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
             "--artifact-version", "1.0.0", "--config-path", str(self.config),
             "--precedence-path", str(self.projeto), "--out", str(saida)],
            capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("NÃO aprova", r.stderr)
        self.assertFalse(saida.exists())
        self.assertTrue((self.plugin / "__pycache__").is_dir(), "apagou o diretório")

    def test_R1_11b_subdiretorio_symlinkado_RECUSA(self) -> None:
        """
        §11 — a fuga que a revisão da enumeração encontrou.

        A raiz era conferida e cada arquivo declarado também. Mas um DIRETÓRIO
        intermediário symlinkado escapava: `creditum_hermes_telegram/compat.py` não é
        symlink quando o symlink é a pasta que o contém. O hash seguia sendo conferido
        através do link — o conteúdo estava preso, o LUGAR dele não.
        """
        real = self.tmp / "pacote-fora-da-arvore"
        real.mkdir()
        original = self.plugin / "creditum_hermes_telegram"
        shutil.move(str(original / "compat.py"), str(real / "compat.py"))
        original.rmdir()
        os.symlink(str(real), str(original))
        # O arquivo em si confere por hash — e ainda assim o portão recusa.
        self.assertEqual(sha(original / "compat.py"), sha(real / "compat.py"))
        d = self.defeitos()
        self.assertIn("PLUGIN_FILE_IS_SYMLINK", d)

    def test_R1_11_nenhuma_exclusao_sobrou_na_enumeracao(self) -> None:
        """
        §11 — ESTRUTURAL: a enumeração não filtra nada por nome.

        A a6 tinha duas exclusões, `__pycache__` e `.pyc`, e as duas casavam com as do
        construtor — foi isso que fez a árvore fechada "conferir" com bytecode dentro.
        Este teste falha se qualquer exclusão por nome voltar.
        """
        import ast
        fonte = (RAIZ / "creditum_hermes_prestart" / "verify.py").read_text(
            encoding="utf-8")
        alvo = next(n for n in ast.walk(ast.parse(fonte))
                    if isinstance(n, ast.FunctionDef) and n.name == "entradas_reais")
        texto = ast.unparse(alvo) if hasattr(ast, "unparse") else fonte
        for excluido in ("__pycache__", ".pyc", ".pyo", "startswith", "endswith"):
            self.assertNotIn(excluido, texto.split('"""')[-1],
                             f"a enumeração filtra {excluido}")
        # E toda entrada real aparece: arquivos e diretórios.
        entradas = set(verify.entradas_reais(self.plugin))
        self.assertIn("creditum_hermes_telegram", entradas)
        self.assertIn(os.path.join("creditum_hermes_telegram", "compat.py"), entradas)
        self.assertIn("plugin.yaml", entradas)

    # ─── J: symlink ──────────────────────────────────────────────────────────
    def test_J_raiz_do_plugin_como_symlink_RECUSA(self) -> None:
        real = self.tmp / "real-plugin"
        shutil.move(str(self.plugin), str(real))
        os.symlink(str(real), str(self.plugin))
        self.assertEqual(self.defeitos(), {"PLUGIN_ROOT_IS_SYMLINK"})

    def test_J2_arquivo_do_plugin_como_symlink_RECUSA(self) -> None:
        fora = self.tmp / "fora.py"
        fora.write_text("def register(ctx):\n    pass\n", encoding="utf-8")
        alvo = self.plugin / "__init__.py"
        alvo.unlink()
        os.symlink(str(fora), str(alvo))
        self.assertIn("PLUGIN_FILE_IS_SYMLINK", self.defeitos())

    def test_J3_ancestral_symlink_RECUSA_por_caminho_nao_canonico(self) -> None:
        verdadeiro = self.tmp / "plugins"
        atalho = self.tmp / "atalho"
        os.symlink(str(verdadeiro), str(atalho))
        self._remenda_manifesto(plugin_root=str(atalho / self.plugin.name))
        self.assertEqual(self.defeitos(), {"PLUGIN_ROOT_NOT_CANONICAL"})

    # ─── K: não habilitado na config ─────────────────────────────────────────
    def test_K_plugin_ausente_de_plugins_enabled_RECUSA(self) -> None:
        self.config.write_text(json.dumps({"plugins": {"enabled": ["outro-plugin"]}}),
                               encoding="utf-8")
        self.assertIn("PLUGIN_NOT_ENABLED", self.defeitos())

    def test_K2_lista_enabled_ausente_RECUSA(self) -> None:
        for cfg in ({}, {"plugins": {}}, {"plugins": {"enabled": "telegram-platform"}}):
            self.config.write_text(json.dumps(cfg), encoding="utf-8")
            self.assertIn("CONFIG_ENABLED_LIST_ABSENT", self.defeitos(), str(cfg))

    def test_K3_config_ausente_RECUSA(self) -> None:
        self.config.unlink()
        self.assertIn("CONFIG_MISSING", self.defeitos())

    def test_K4_lista_vazia_RECUSA(self) -> None:
        with self.assertRaises(PrestartRefusal) as c:
            confere_config({"plugins": {"enabled": []}}, chave=CHAVE,
                           caminho_lista="plugins.enabled")
        self.assertEqual(c.exception.defect, "PLUGIN_NOT_ENABLED")

    # ─── L: entry point de mesma chave ───────────────────────────────────────
    def test_L_entrypoint_com_a_mesma_chave_RECUSA(self) -> None:
        with self.assertRaises(PrestartRefusal) as c:
            confere_precedencia(chave=CHAVE, nomes_de_entrypoint=["outro", CHAVE],
                                plugins_de_projeto=[], fontes_declaradas=["/x"])
        self.assertEqual(c.exception.defect, "ENTRYPOINT_OVERRIDE_PRESENT")

    def test_L2_fontes_de_precedencia_nao_declaradas_RECUSA(self) -> None:
        """
        Não declarar as fontes é RECUSA, não "nenhuma encontrada".

        Se o caminho de plugin de projeto da 0.20.4 não foi descoberto, o portão não
        pode afirmar que não há concorrente de precedência maior — só pode dizer que
        não olhou. Dizer que não olhou e subir seria o defeito desta fase inteira.
        """
        for vazio in ([], None, "", {}):
            with self.assertRaises(PrestartRefusal, msg=repr(vazio)) as c:
                confere_precedencia(chave=CHAVE, nomes_de_entrypoint=[],
                                    plugins_de_projeto=[], fontes_declaradas=vazio)
            self.assertEqual(c.exception.defect, "PRECEDENCE_SOURCES_UNDECLARED")

    def test_L3_o_construtor_recusa_gerar_manifesto_sem_fontes(self) -> None:
        import subprocess
        r = subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
             "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
             "--artifact-version", "1.0.0", "--out", str(self.tmp / "x.json")],
            capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("precedence-path", r.stderr)
        self.assertFalse((self.tmp / "x.json").exists(), "gerou manifesto inválido")

    # ─── M: plugin de projeto sobrepondo ─────────────────────────────────────
    def test_M_plugin_de_projeto_com_a_mesma_chave_RECUSA(self) -> None:
        rival = self.projeto / "rival"
        rival.mkdir()
        (rival / "plugin.yaml").write_text(
            json.dumps({"name": CHAVE, "kind": "platform"}), encoding="utf-8")
        self.assertIn("PRECEDENCE_OVERRIDE_PRESENT", self.defeitos())

    def test_M2_plugin_de_projeto_ilegivel_conta_como_concorrente(self) -> None:
        rival = self.projeto / "ilegivel"
        rival.mkdir()
        (rival / "plugin.yaml").write_text("{quebrado: [", encoding="utf-8")
        self.assertIn("PRECEDENCE_OVERRIDE_PRESENT", self.defeitos())

    def test_M3_plugin_de_projeto_com_OUTRA_chave_nao_e_concorrente(self) -> None:
        outro = self.projeto / "inofensivo"
        outro.mkdir()
        (outro / "plugin.yaml").write_text(
            json.dumps({"name": "outra-coisa", "kind": "platform"}), encoding="utf-8")
        self.assertEqual(self.defeitos(), self.AMBIENTE)

    def test_M4_duplicata_sob_a_MESMA_raiz_de_usuario_RECUSA(self) -> None:
        gemeo = self.plugin.parent / "creditum-telegram-antigo"
        gemeo.mkdir()
        (gemeo / "plugin.yaml").write_text(
            json.dumps({"name": CHAVE, "kind": "platform"}), encoding="utf-8")
        self.assertIn("DUPLICATE_PLUGIN_LOCATION", self.defeitos())

    # ─── N: manifesto divergente ─────────────────────────────────────────────
    def test_N_manifesto_com_hash_divergente_RECUSA(self) -> None:
        self.assertEqual(
            self.defeitos(sha_esperado_do_manifesto="0" * 64),
            {"MANIFEST_HASH_MISMATCH"})
        # E com o hash certo volta ao esperado.
        self.assertEqual(self.defeitos(sha_esperado_do_manifesto=sha(self.manifesto)),
                         self.AMBIENTE)

    def test_N2_manifesto_ausente_ou_ilegivel_RECUSA(self) -> None:
        self.assertEqual(verify.verifica(str(self.tmp / "nao-existe.json")).defeitos[0][0],
                         "MANIFEST_MISSING")
        self.manifesto.write_text("{nao é json", encoding="utf-8")
        self.assertEqual(self.defeitos(), {"MANIFEST_UNPARSEABLE"})

    def test_N3_identidade_e_campos_do_manifesto_sao_fechados(self) -> None:
        base = json.loads(self.manifesto.read_text(encoding="utf-8"))
        with self.assertRaises(PrestartRefusal) as c:
            confere_identidade_do_manifesto({**base, "manifest_id": "outro/v1"})
        self.assertEqual(c.exception.defect, "MANIFEST_ID_UNSUPPORTED")
        for campo in verify.CAMPOS_MANIFESTO:
            faltando = {k: v for k, v in base.items() if k != campo}
            with self.assertRaises(PrestartRefusal, msg=campo) as c:
                confere_identidade_do_manifesto(faltando)
            self.assertIn(c.exception.defect,
                          ("MANIFEST_FIELD_MISSING", "MANIFEST_ID_UNSUPPORTED"), campo)

    def test_N4_manifesto_sem_o_contrato_do_plugin_RECUSA(self) -> None:
        base = json.loads(self.manifesto.read_text(encoding="utf-8"))
        for exigido, defeito in (("plugin.yaml", "PLUGIN_YAML_NOT_DECLARED"),
                                 ("__init__.py", "PLUGIN_INIT_NOT_DECLARED")):
            sem = [a for a in base["plugin_files"] if a["relative_path"] != exigido]
            with self.assertRaises(PrestartRefusal, msg=exigido) as c:
                confere_identidade_do_manifesto({**base, "plugin_files": sem})
            self.assertEqual(c.exception.defect, defeito)

    def test_N5_raiz_relativa_no_manifesto_RECUSA(self) -> None:
        base = json.loads(self.manifesto.read_text(encoding="utf-8"))
        for ruim in ("plugins/x", "", "./x", None):
            with self.assertRaises(PrestartRefusal, msg=repr(ruim)) as c:
                confere_identidade_do_manifesto({**base, "plugin_root": ruim})
            self.assertEqual(c.exception.defect, "PLUGIN_ROOT_NOT_ABSOLUTE")

    # ─── O: idempotência, zero escritas ──────────────────────────────────────
    def test_O_rodar_duas_vezes_da_o_MESMO_resultado_e_zero_escritas(self) -> None:
        antes = self._instantaneo()
        a = self.defeitos()
        b = self.defeitos()
        self.assertEqual(a, b)
        self.assertEqual(antes, self._instantaneo(), "o verificador escreveu algo")

    def test_O2_nenhum_pyc_e_criado_pelo_verificador(self) -> None:
        self.defeitos()
        caches = [p for p in self.tmp.rglob("*") if p.name == "__pycache__"
                  or p.suffix == ".pyc"]
        self.assertEqual(caches, [])

    def _instantaneo(self) -> dict[str, tuple[int, str]]:
        return {str(p.relative_to(self.tmp)): (p.stat().st_size, sha(p))
                for p in sorted(self.tmp.rglob("*")) if p.is_file()}


class SemParserDeYAML(Bancada):
    """Sem PyYAML o portão RECUSA. Nunca passa por não conseguir conferir."""

    def setUp(self) -> None:
        super().setUp()
        desinstala_yaml()

    def test_ausencia_de_parser_e_RECUSA(self) -> None:
        d = self.defeitos()
        self.assertIn("YAML_PARSER_UNAVAILABLE", d)
        self.assertFalse(verify.verifica(str(self.manifesto)).aprovado)


class SuperficieDoPortao(Bancada):
    def test_verifica_nao_aceita_dependencia_de_autoridade(self) -> None:
        """
        A lição da d2e-a4-r5, aplicada antes de custar uma rodada.

        Nenhum parâmetro de `verifica` deixa o chamador escolher onde a versão do
        Hermes é procurada, qual verificador roda ou qual raiz é aprovada. O único
        parâmetro externo é o CAMINHO do manifesto, e o envelope o fixa junto com o
        SHA-256 dele.
        """
        import inspect
        params = list(inspect.signature(verify.verifica).parameters)
        self.assertEqual(params, ["caminho_do_manifesto", "sha_esperado_do_manifesto"])
        suspeitos = ("verif", "valida", "provenance", "issuer", "trusted", "callback",
                     "distribuicoes", "authoriz", "plugin_root", "chave")
        for nome in params:
            for s in suspeitos:
                self.assertNotIn(s, nome.lower(), f"verifica({nome})")

    def test_o_verificador_nao_abre_rede_nem_escreve(self) -> None:
        """
        ESTRUTURAL, por IMPORT e não por nome nu de chamada.

        A primeira versão deste teste baniu `get`, `post` e `run` por nome — e acusou
        `dados.get("plugin_key")`, que é acesso a dicionário. Décimo segundo falso
        positivo de texto-contra-estrutura nesta fase, e o primeiro que eu plantei num
        teste de segurança meu.

        O invariante REAL é mais simples de dizer e mais difícil de burlar: o módulo
        não importa nada que abra rede ou lance processo. Sem `urllib`, sem `socket`,
        sem `subprocess`, sem `http`. Não há como chamar o que não se importa.
        """
        import ast
        fonte = (RAIZ / "creditum_hermes_prestart" / "verify.py").read_text(
            encoding="utf-8")
        arv = ast.parse(fonte)
        importados: set[str] = set()
        for n in ast.walk(arv):
            if isinstance(n, ast.ImportFrom) and n.module:
                importados.add(n.module.split(".")[0])
            elif isinstance(n, ast.Import):
                for al in n.names:
                    importados.add(al.name.split(".")[0])
        for proibido in ("urllib", "socket", "http", "requests", "subprocess",
                         "ftplib", "smtplib", "telnetlib", "asyncio", "ssl",
                         "shutil", "tempfile", "pip"):
            self.assertNotIn(proibido, importados,
                             f"o verificador importa {proibido}")

        # `open` só em modo leitura, conferido no ARGUMENTO — não pelo nome.
        aberturas = [n for n in ast.walk(arv)
                     if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                     and n.func.id == "open"]
        self.assertTrue(aberturas, "o verificador precisa ler arquivos")
        for n in aberturas:
            modos = [a.value for a in n.args[1:] if isinstance(a, ast.Constant)]
            modos += [k.value.value for k in n.keywords
                      if k.arg == "mode" and isinstance(k.value, ast.Constant)]
            for m in modos:
                self.assertIn(m, ("rb", "r"), f"open em modo {m}")

        # E nenhuma escrita por método de caminho.
        metodos = {n.func.attr for n in ast.walk(arv)
                   if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
        for proibido in ("write_text", "write_bytes", "mkdir", "makedirs", "unlink",
                         "rmtree", "rename", "chmod", "touch", "urlopen", "Popen"):
            self.assertNotIn(proibido, metodos, f"o verificador chama .{proibido}()")

    def test_todo_defeito_emitido_esta_declarado(self) -> None:
        """Defeito não declarado é defeito que nenhum runbook conhece."""
        import ast
        fonte = (RAIZ / "creditum_hermes_prestart" / "verify.py").read_text(
            encoding="utf-8")
        emitidos = set()
        for n in ast.walk(ast.parse(fonte)):
            if isinstance(n, ast.Call):
                f = n.func
                nome = f.id if isinstance(f, ast.Name) else (
                    f.attr if isinstance(f, ast.Attribute) else None)
                if nome in ("PrestartRefusal", "recusa") and n.args:
                    if isinstance(n.args[0], ast.Constant) and type(
                            n.args[0].value) is str:
                        emitidos.add(n.args[0].value)
        naos = emitidos - set(verify.DEFEITOS)
        self.assertEqual(naos, set(), f"defeitos não declarados: {naos}")


class EnvelopeDePartida(unittest.TestCase):
    """§14 — o envelope roda o gateway SÓ com saída 0, e não aceita seleção."""

    CAMINHO = RAIZ.parent / "scripts" / "prestart-gate.sh"

    def test_o_envelope_existe_e_e_shell_valido(self) -> None:
        import subprocess
        self.assertTrue(self.CAMINHO.is_file())
        self.assertEqual(subprocess.run(["sh", "-n", str(self.CAMINHO)]).returncode, 0)

    def test_o_envelope_nao_sobe_o_gateway_sem_selo(self) -> None:
        """Sem o SHA do manifesto preenchido pelo artefato, ele recusa antes de tudo."""
        import subprocess
        r = subprocess.run(["sh", str(self.CAMINHO)], capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("PRESTART_MANIFEST_SHA_NOT_PINNED", r.stderr)
        self.assertNotIn("gateway run", r.stdout)

    def test_o_envelope_nao_tem_seletor_de_comando(self) -> None:
        texto = self.CAMINHO.read_text(encoding="utf-8")
        linhas = [l for l in texto.splitlines() if not l.strip().startswith("#")]
        corpo = "\n".join(linhas)
        for proibido in ("$@", "$*", "eval", "$1", "${1", "curl", "wget", "pip",
                         "npm", "git ", "apt"):
            self.assertNotIn(proibido, corpo, f"o envelope contém {proibido}")
        # O `exec` do gateway vem DEPOIS da conferência, e é literal.
        self.assertLess(corpo.index("creditum_hermes_prestart.verify"),
                        corpo.index("gateway run"))
        self.assertIn('exec "${PYTHON}" "${HERMES}" gateway run', corpo)


if __name__ == "__main__":
    unittest.main()


class AllowlistDoArtefato(Bancada):
    """
    R2 §10 — a matriz negativa da lista de PERMISSÃO.

    Duas rodadas de bloqueio pela mesma raiz: a a6 enumerava o excluído, a r1 enumerou
    o negado, e as duas passavam o que não estava na lista. A forma correta é enumerar
    o PERMITIDO — aí formato novo é bloqueio, não passagem.

    Cada caso abaixo é prova de que a allowlist funciona, não item de uma denylist.
    """

    def _constroi(self, saida: pathlib.Path) -> object:
        import subprocess
        return subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
             "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
             "--artifact-version", "1.0.0", "--config-path", str(self.config),
             "--precedence-path", str(self.projeto), "--out", str(saida)],
            capture_output=True, text=True)

    def _recusa_arquivo(self, rel: str, dados: bytes = b"\x7fELF") -> None:
        alvo = self.plugin / rel
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_bytes(dados)
        saida = self.tmp / f"man_{rel.replace('/', '_')}.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0, rel)
        self.assertIn("NÃO aprova", r.stderr, rel)
        self.assertFalse(saida.exists(), f"{rel}: gerou manifesto")
        # §12: recusa, não limpeza.
        self.assertTrue(alvo.exists(), f"{rel}: o construtor apagou o arquivo")
        alvo.unlink()

    def test_R2_10_toda_forma_compilada_ou_arquivada_e_RECUSADA(self) -> None:
        for rel in ("payload.so",
                    "payload.cpython-313-x86_64-linux-gnu.so",
                    "payload.pyd", "payload.pyz", "payload.pyc", "payload.pyo",
                    "payload.whl", "payload.zip", "payload.tar", "payload.gz",
                    "payload.tgz", "payload.dylib", "payload.dll", "payload.exe"):
            self._recusa_arquivo(rel)

    def test_R2_10b_dentro_do_pacote_governado_tambem_RECUSA(self) -> None:
        for rel in ("creditum_hermes_telegram/payload.so",
                    "creditum_hermes_telegram/payload.cpython-313-darwin.so",
                    "creditum_hermes_telegram/payload.pyd"):
            self._recusa_arquivo(rel)

    def test_R2_4_extensionless_e_RECUSADO(self) -> None:
        self._recusa_arquivo("payload")
        self._recusa_arquivo("creditum_hermes_telegram/payload")

    def test_R2_10c_extensao_desconhecida_e_RECUSADA(self) -> None:
        for rel in ("payload.xyz", "payload.sh", "payload.json", "payload.txt",
                    "payload.toml", "payload.cfg", "payload.ini", "payload.md"):
            self._recusa_arquivo(rel, b"# inofensivo, e ainda assim nao aprovado\n")

    def test_R2_5_nome_com_multiplos_sufixos_nao_engana_por_sufixo(self) -> None:
        """
        `payload.so.py` termina em `.py` e passaria por sufixo puro. O teste da forma:
        o radical tem de ser identificador Python, e `payload.so` não é. Um `.py` que
        não pode ser importado não tem o que fazer dentro de um pacote.
        """
        self._recusa_arquivo("payload.so.py", b"# fonte\n")
        self._recusa_arquivo("payload.tar.gz.py", b"# fonte\n")
        self._recusa_arquivo("meu-modulo.py", b"# hifen nao e identificador\n")

    def test_R2_6_yaml_fora_da_raiz_ou_com_outro_nome_e_RECUSADO(self) -> None:
        """`plugin.yaml` é o manifesto do contrato do Hermes. Só ele, e só na raiz."""
        self._recusa_arquivo("outro.yaml", b"a: 1\n")
        self._recusa_arquivo("config.yml", b"a: 1\n")
        self._recusa_arquivo("creditum_hermes_telegram/plugin.yaml", b"a: 1\n")

    def test_R2_7_py_em_diretorio_nao_aprovado_e_RECUSADO(self) -> None:
        self._recusa_arquivo("utilitarios/ajuda.py", b"# fora da estrutura\n")
        # E o diretório em si também é recusado, por si.
        (self.plugin / "vazio").mkdir()
        saida = self.tmp / "man_dir.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("vazio", r.stderr)
        self.assertTrue((self.plugin / "vazio").is_dir(), "apagou o diretório")
        (self.plugin / "vazio").rmdir()

    def test_R2_7b_aninhamento_alem_do_primeiro_nivel_e_RECUSADO(self) -> None:
        fundo = self.plugin / "creditum_hermes_telegram" / "interno"
        fundo.mkdir()
        (fundo / "modulo.py").write_text("# fundo\n", encoding="utf-8")
        saida = self.tmp / "man_fundo.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(saida.exists())

    def test_R2_13_symlink_e_RECUSADO_pelo_construtor(self) -> None:
        fora = self.tmp / "fora.py"
        fora.write_text("# fora\n", encoding="utf-8")
        link = self.plugin / "atalho.py"
        os.symlink(str(fora), str(link))
        saida = self.tmp / "man_link.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("symlink", r.stderr)
        self.assertTrue(link.is_symlink(), "apagou o symlink")

    # ─── §11: a matriz POSITIVA ──────────────────────────────────────────────
    def test_R2_11_arvore_limpa_gera_manifesto_DETERMINISTICO(self) -> None:
        a = self.tmp / "man_a.json"
        b = self.tmp / "man_b.json"
        self.assertEqual(self._constroi(a).returncode, 0)  # type: ignore[union-attr]
        self.assertEqual(self._constroi(b).returncode, 0)  # type: ignore[union-attr]
        da = json.loads(a.read_text(encoding="utf-8"))
        db = json.loads(b.read_text(encoding="utf-8"))
        self.assertEqual(da, db, "duas gerações da mesma árvore divergiram")
        self.assertEqual(sha(a), sha(b))
        # E o conjunto aprovado é exatamente o pacote governado.
        self.assertEqual(
            sorted(e["relative_path"] for e in da["plugin_files"]),
            ["__init__.py", "creditum_hermes_telegram/compat.py", "plugin.yaml"])

    def test_R2_11b_o_verificador_aceita_a_arvore_limpa(self) -> None:
        original = verify.versao_do_hermes_instalado
        verify.versao_do_hermes_instalado = lambda _: "0.20.4"  # type: ignore[assignment]
        self.addCleanup(lambda: setattr(verify, "versao_do_hermes_instalado", original))
        self.assertTrue(verify.verifica(str(self.manifesto)).aprovado)

    def test_R2_14_a_politica_tem_forma_POSITIVA(self) -> None:
        """
        ESTRUTURAL: `arquivo_aprovado` não pode ser denylist disfarçada.

        A forma proibida é `if sufixo not in RUINS: return True`. Este teste falha se
        a função voltar a decidir por negação — o erro que custou a a6 e a r1.
        """
        import ast
        fonte = CONSTRUTOR.read_text(encoding="utf-8")
        arv = ast.parse(fonte)
        fn = next(n for n in ast.walk(arv)
                  if isinstance(n, ast.FunctionDef) and n.name == "arquivo_aprovado")
        # Nenhum `not in` decide aprovação.
        for n in ast.walk(fn):
            self.assertNotIsInstance(
                getattr(n, "ops", [None])[0], ast.NotIn,
                "a política decide por negação")
        # Todo `return True` é consequência de um casamento positivo.
        retornos_verdadeiros = [n for n in ast.walk(fn)
                                if isinstance(n, ast.Return)
                                and isinstance(n.value, ast.Constant)
                                and n.value.value is True]
        self.assertEqual(retornos_verdadeiros, [], "aprovação constante sem condição")
        # E o último retorno da função é a recusa.
        ultimo = fn.body[-1]
        self.assertIsInstance(ultimo, ast.Return)
        self.assertIs(ultimo.value.value, False)  # type: ignore[union-attr]


def carrega_construtor():
    """Importa o construtor por caminho — ele é script, não pacote."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("_construtor_a6", CONSTRUTOR)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # Registrar ANTES de executar: no 3.9 o `@dataclass` resolve `cls.__module__`
    # por `sys.modules`, e um módulo fora de lá quebra a criação da classe.
    sys.modules["_construtor_a6"] = mod
    spec.loader.exec_module(mod)
    return mod


class TravessiaUnica(Bancada):
    """
    R3 §13 — validar e hashear são a MESMA leitura, e a árvore não muda debaixo.

    A r2 validava numa passada de `os.walk` e hasheava em outra. Um arquivo que
    aparecesse entre as duas entrava no manifesto com hash de aprovado sem
    `arquivo_aprovado` nunca ter sido chamado sobre ele.

    É a família que a d1-r1 estabeleceu e que está escrita no `ingress.py`: ler duas
    vezes o que precisa ser lido uma vez. Lá era campo de evento; aqui é a árvore.
    """

    def setUp(self) -> None:
        super().setUp()
        self.mod = carrega_construtor()

    def _aprovados(self) -> list:
        return self.mod.percorre_e_aprova(self.plugin)

    def _deriva(self) -> list[str]:
        """Captura a árvore limpa, deixa o teste mexer, e confere a deriva."""
        aprovados = self._aprovados()
        return aprovados  # o chamador muta e depois chama _confere

    def _confere(self, aprovados: list) -> list[str]:
        with self.assertRaises(self.mod.ArtefatoRecusado) as c:
            self.mod.confere_deriva(self.plugin, aprovados)
        return c.exception.motivos

    # ─── A/B: caminho limpo e determinismo ───────────────────────────────────
    def test_R3_A_arvore_limpa_passa(self) -> None:
        aprovados = self._aprovados()
        self.assertEqual(sorted(a.relative_path for a in aprovados),
                         ["__init__.py", "creditum_hermes_telegram/compat.py",
                          "plugin.yaml"])
        self.mod.confere_deriva(self.plugin, aprovados)  # não levanta

    def test_R3_B_duas_construcoes_dao_o_mesmo_hash(self) -> None:
        a = {x.relative_path: x.sha256 for x in self._aprovados()}
        b = {x.relative_path: x.sha256 for x in self._aprovados()}
        self.assertEqual(a, b)

    # ─── C: o caso EXATO do Codex ────────────────────────────────────────────
    def test_R3_C_package_json_aparecendo_durante_a_construcao_RECUSA(self) -> None:
        aprovados = self._aprovados()
        (self.plugin / "package.json").write_text('{"name":"x"}', encoding="utf-8")
        motivos = self._confere(aprovados)
        self.assertTrue(any("package.json" in m and "apareceu" in m for m in motivos),
                        motivos)
        # E o arquivo NÃO entrou na lista aprovada.
        self.assertNotIn("package.json", [a.relative_path for a in aprovados])

    # ─── D: .so aparecendo durante a construção ──────────────────────────────
    def test_R3_D_so_aparecendo_durante_a_construcao_RECUSA(self) -> None:
        aprovados = self._aprovados()
        (self.plugin / "payload.cpython-313-x86_64-linux-gnu.so").write_bytes(b"\x7fELF")
        motivos = self._confere(aprovados)
        self.assertTrue(any("payload" in m for m in motivos), motivos)

    # ─── E: diretório aparecendo durante a construção ────────────────────────
    def test_R3_E_diretorio_aparecendo_durante_a_construcao_RECUSA(self) -> None:
        aprovados = self._aprovados()
        (self.plugin / "__pycache__").mkdir()
        motivos = self._confere(aprovados)
        self.assertTrue(any("__pycache__" in m for m in motivos), motivos)

    # ─── F: conteúdo de arquivo aprovado mudando ─────────────────────────────
    def test_R3_F_conteudo_mudando_durante_a_construcao_RECUSA(self) -> None:
        aprovados = self._aprovados()
        alvo = self.plugin / "creditum_hermes_telegram" / "compat.py"
        alvo.write_text('ADAPTER_COMPAT_ID = "trocado/depois/da/aprovacao"\n',
                        encoding="utf-8")
        motivos = self._confere(aprovados)
        self.assertTrue(any("conteúdo mudou" in m for m in motivos), motivos)

    def test_R3_F2_conteudo_do_MESMO_tamanho_tambem_RECUSA(self) -> None:
        """Hash, não metadado: mesmo tamanho e mesmo mtime não salvam o conteúdo."""
        aprovados = self._aprovados()
        alvo = self.plugin / "__init__.py"
        antes = alvo.stat()
        original = alvo.read_bytes()
        trocado = b"#" + original[1:]
        self.assertEqual(len(trocado), len(original))
        alvo.write_bytes(trocado)
        os.utime(alvo, ns=(antes.st_atime_ns, antes.st_mtime_ns))
        self.assertEqual(alvo.stat().st_size, antes.st_size)
        self.assertEqual(alvo.stat().st_mtime_ns, antes.st_mtime_ns)
        motivos = self._confere(aprovados)
        self.assertTrue(any("conteúdo mudou" in m for m in motivos), motivos)

    # ─── G: arquivo trocado por symlink ──────────────────────────────────────
    def test_R3_G_arquivo_trocado_por_symlink_RECUSA(self) -> None:
        aprovados = self._aprovados()
        fora = self.tmp / "fora.py"
        alvo = self.plugin / "__init__.py"
        fora.write_bytes(alvo.read_bytes())  # MESMO conteúdo, logo mesmo hash
        alvo.unlink()
        os.symlink(str(fora), str(alvo))
        motivos = self._confere(aprovados)
        self.assertTrue(any("__init__.py" in m for m in motivos), motivos)

    def test_R3_G2_symlink_nao_e_aberto_nem_para_hashear(self) -> None:
        """`O_NOFOLLOW` recusa no próprio `open`, antes de qualquer byte."""
        fora = self.tmp / "fora.py"
        fora.write_text("# alvo\n", encoding="utf-8")
        link = self.plugin / "atalho.py"
        os.symlink(str(fora), str(link))
        with self.assertRaises(OSError):
            self.mod.le_e_hasheia(link, "atalho.py")

    def test_R3_H_arquivo_desaparecendo_durante_a_construcao_RECUSA(self) -> None:
        aprovados = self._aprovados()
        (self.plugin / "__init__.py").unlink()
        motivos = self._confere(aprovados)
        self.assertTrue(any("desapareceu" in m for m in motivos), motivos)

    # ─── §12: recusa não conserta ────────────────────────────────────────────
    def test_R3_12_recusa_de_deriva_nao_escreve_manifesto_nem_limpa(self) -> None:
        import subprocess
        intruso = self.plugin / "package.json"
        intruso.write_text('{"name":"x"}', encoding="utf-8")
        saida = self.tmp / "man_deriva.json"
        r = subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
             "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
             "--artifact-version", "1.0.0", "--config-path", str(self.config),
             "--precedence-path", str(self.projeto), "--out", str(saida)],
            capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(saida.exists(), "escreveu manifesto")
        self.assertTrue(intruso.exists(), "apagou o intruso")


class FormaDoConstrutor(Bancada):
    """§14 — ESTRUTURAL. A forma do código, não o nome dos testes."""

    def setUp(self) -> None:
        super().setUp()
        import ast
        self.arv = ast.parse(CONSTRUTOR.read_text(encoding="utf-8"))
        self.ast = ast

    def _funcao(self, nome: str):
        return next(n for n in self.ast.walk(self.arv)
                    if isinstance(n, self.ast.FunctionDef) and n.name == nome)

    def test_R3_14_so_UMA_travessia_alimenta_a_lista_aprovada(self) -> None:
        # Onde há `os.walk`.
        com_walk = {fn.name for fn in self.ast.walk(self.arv)
                    if isinstance(fn, self.ast.FunctionDef)
                    for n in self.ast.walk(fn)
                    if isinstance(n, self.ast.Call)
                    and isinstance(n.func, self.ast.Attribute) and n.func.attr == "walk"}
        self.assertEqual(com_walk, {"percorre_e_aprova", "entradas_atuais"})

        # `entradas_atuais` não hasheia e não devolve nada que vire arquivo aprovado.
        atuais = self._funcao("entradas_atuais")
        chamados = {n.func.attr for n in self.ast.walk(atuais)
                    if isinstance(n, self.ast.Call)
                    and isinstance(n.func, self.ast.Attribute)}
        chamados |= {n.func.id for n in self.ast.walk(atuais)
                     if isinstance(n, self.ast.Call)
                     and isinstance(n.func, self.ast.Name)}
        for proibido in ("le_e_hasheia", "sha256", "ArquivoAprovado", "hexdigest"):
            self.assertNotIn(proibido, chamados,
                             f"a conferência de deriva chama {proibido}")

    def test_R3_14b_a_inclusao_e_DOMINADA_pela_aprovacao(self) -> None:
        """
        Todo `aprovados.append` está dentro do ramo em que `arquivo_aprovado` disse
        sim — provado pela AST, não por leitura.
        """
        fn = self._funcao("percorre_e_aprova")
        # A única chamada que produz item aprovado.
        appends = [n for n in self.ast.walk(fn)
                   if isinstance(n, self.ast.Call)
                   and isinstance(n.func, self.ast.Attribute)
                   and n.func.attr == "append"
                   and isinstance(n.func.value, self.ast.Name)
                   and n.func.value.id == "aprovados"]
        self.assertEqual(len(appends), 1, "há mais de um ponto de inclusão")
        alvo = appends[0]

        # O guarda que o domina: `if not arquivo_aprovado(...): continue`.
        guardas = [n for n in self.ast.walk(fn)
                   if isinstance(n, self.ast.If)
                   and isinstance(n.test, self.ast.UnaryOp)
                   and isinstance(n.test.op, self.ast.Not)
                   and isinstance(n.test.operand, self.ast.Call)
                   and isinstance(n.test.operand.func, self.ast.Name)
                   and n.test.operand.func.id == "arquivo_aprovado"]
        self.assertEqual(len(guardas), 1, "a aprovação não é decidida uma única vez")
        guarda = guardas[0]
        # O ramo reprovado registra o motivo e ABANDONA a iteração. A primeira
        # versão exigia que TODO o corpo fosse `continue` e falhou no `append` do
        # motivo — a asserção estava errada, não o código.
        self.assertIsInstance(guarda.body[-1], self.ast.Continue,
                              "o ramo reprovado não abandona a iteração")
        self.assertFalse(
            any(isinstance(n, self.ast.Call) and isinstance(n.func, self.ast.Name)
                and n.func.id == "le_e_hasheia" for x in guarda.body
                for n in self.ast.walk(x)),
            "o ramo reprovado lê o arquivo")
        self.assertLess(guarda.lineno, alvo.lineno,
                        "a inclusão acontece antes da aprovação")

    def test_R3_14c_a_conferencia_de_deriva_nao_alimenta_o_manifesto(self) -> None:
        principal = self._funcao("main")
        # `arquivos` é montado a partir de `aprovados`, e de mais nada.
        atribuicoes = [n for n in self.ast.walk(principal)
                       if isinstance(n, self.ast.Assign)
                       and any(isinstance(t, self.ast.Name) and t.id == "arquivos"
                               for t in n.targets)]
        self.assertEqual(len(atribuicoes), 1)
        origem = {n.id for n in self.ast.walk(atribuicoes[0])
                  if isinstance(n, self.ast.Name)}
        self.assertIn("aprovados", origem)
        for proibido in ("entradas_atuais", "confere_deriva", "os"):
            self.assertNotIn(proibido, origem)

    def test_R3_14d_a_deriva_e_conferida_ANTES_de_escrever(self) -> None:
        principal = self._funcao("main")
        chamada = next(n.lineno for n in self.ast.walk(principal)
                       if isinstance(n, self.ast.Call)
                       and isinstance(n.func, self.ast.Name)
                       and n.func.id == "confere_deriva")
        escrita = next(n.lineno for n in self.ast.walk(principal)
                       if isinstance(n, self.ast.Call)
                       and isinstance(n.func, self.ast.Name) and n.func.id == "open"
                       and any(isinstance(a, self.ast.Constant) and a.value == "w"
                               for a in n.args))
        self.assertLess(chamada, escrita, "escreve o manifesto antes de conferir")


class UmaLeituraSo(Bancada):
    """
    R4 — os MESMOS bytes aprovados produzem hash e `adapter_compat_id`.

    A r3 fechou a releitura por caminho em `percorre_e_aprova` e deixou intacta a de
    `compat.py`, no `main`. Trocar o arquivo entre o hash e aquela leitura, e restaurar
    antes da conferência de deriva, produzia `plugin_files` descrevendo A com
    `adapter_compat_id` derivado de B — e a deriva comparava com o estado restaurado,
    então não via nada.
    """

    OUTRO_ID = "identidade/transitoria/que/nunca/foi/aprovada"

    def setUp(self) -> None:
        super().setUp()
        self.mod = carrega_construtor()
        self.compat_id_por_ast = verify.compat_id_por_ast
        self.compat = self.plugin / "creditum_hermes_telegram" / "compat.py"

    # ─── §10: a prova central ────────────────────────────────────────────────
    def test_R4_10_hash_e_compat_id_saem_dos_MESMOS_bytes(self) -> None:
        aprovados = self.mod.percorre_e_aprova(self.plugin)
        registro = next(a for a in aprovados
                        if a.relative_path == "creditum_hermes_telegram/compat.py")
        self.assertIsNotNone(registro.conteudo, "os bytes aprovados não foram retidos")

        # O hash do manifesto é o hash desses bytes.
        self.assertEqual(hashlib.sha256(registro.conteudo).hexdigest(), registro.sha256)
        # E o compat id sai dos MESMOS bytes.
        self.assertEqual(
            self.compat_id_por_ast(registro.conteudo.decode("utf-8")), COMPAT_ID)

        # Agora ponta a ponta, contra o manifesto realmente escrito.
        saida = self.tmp / "man_r4.json"
        self.assertEqual(self._constroi(saida).returncode, 0)  # type: ignore[union-attr]
        doc = json.loads(saida.read_text(encoding="utf-8"))
        entrada = next(e for e in doc["plugin_files"]
                       if e["relative_path"] == "creditum_hermes_telegram/compat.py")
        self.assertEqual(entrada["sha256"], hashlib.sha256(registro.conteudo).hexdigest())
        self.assertEqual(doc["adapter_compat_id"],
                         self.compat_id_por_ast(registro.conteudo.decode("utf-8")))

    # ─── §6: a reprodução EXATA do achado ────────────────────────────────────
    def test_R4_6_mutacao_transitoria_A_B_A_nao_contamina_o_compat_id(self) -> None:
        """
        A é aprovado e hasheado; B existe no caminho durante a janela em que a r3
        liaa `compat.py` de novo; A volta antes da conferência de deriva.

        Antes da r4: `plugin_files` com hash de A, `adapter_compat_id` de B, saída 0.
        """
        conteudo_a = self.compat.read_bytes()
        aprovados = self.mod.percorre_e_aprova(self.plugin)
        registro = next(a for a in aprovados
                        if a.relative_path == "creditum_hermes_telegram/compat.py")

        # ─── a janela: B no caminho ──────────────────────────────────────────
        self.compat.write_text(f'ADAPTER_COMPAT_ID = "{self.OUTRO_ID}"\n',
                               encoding="utf-8")
        self.assertNotEqual(self.compat.read_bytes(), conteudo_a, "B está no disco")

        # O que o construtor deriva AGORA vem dos bytes aprovados, não do disco.
        derivado = self.compat_id_por_ast(registro.conteudo.decode("utf-8"))
        self.assertEqual(derivado, COMPAT_ID)
        self.assertNotEqual(derivado, self.OUTRO_ID, "leu B")

        # ─── A restaurado antes da deriva ────────────────────────────────────
        self.compat.write_bytes(conteudo_a)
        self.mod.confere_deriva(self.plugin, aprovados)  # não levanta: a árvore é A
        # E o par continua coerente: hash de A com id de A.
        self.assertEqual(hashlib.sha256(conteudo_a).hexdigest(), registro.sha256)

    # ─── §7: mutação que NÃO é restaurada continua recusada (r3) ─────────────
    def test_R4_7_mutacao_permanente_ainda_RECUSA(self) -> None:
        aprovados = self.mod.percorre_e_aprova(self.plugin)
        self.compat.write_text(f'ADAPTER_COMPAT_ID = "{self.OUTRO_ID}"\n',
                               encoding="utf-8")
        with self.assertRaises(self.mod.ArtefatoRecusado) as c:
            self.mod.confere_deriva(self.plugin, aprovados)
        self.assertTrue(any("conteúdo mudou" in m for m in c.exception.motivos))

    # ─── §8: symlink continua recusado ───────────────────────────────────────
    def test_R4_8_compat_como_symlink_RECUSA(self) -> None:
        fora = self.tmp / "compat_fora.py"
        fora.write_bytes(self.compat.read_bytes())
        self.compat.unlink()
        os.symlink(str(fora), str(self.compat))
        saida = self.tmp / "man_link.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)  # type: ignore[union-attr]
        self.assertIn("symlink", r.stderr)  # type: ignore[union-attr]
        self.assertFalse(saida.exists())

    # ─── §4: codificação explícita ───────────────────────────────────────────
    def test_R4_4_compat_que_nao_e_UTF8_RECUSA(self) -> None:
        self.compat.write_bytes(b'ADAPTER_COMPAT_ID = "\xff\xfe nao e utf8"\n')
        saida = self.tmp / "man_enc.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)  # type: ignore[union-attr]
        self.assertIn("UTF-8", r.stderr)  # type: ignore[union-attr]
        self.assertFalse(saida.exists())

    def test_R4_4b_compat_sem_literal_RECUSA(self) -> None:
        self.compat.write_text("import os\nADAPTER_COMPAT_ID = os.environ['X']\n",
                               encoding="utf-8")
        saida = self.tmp / "man_lit.json"
        r = self._constroi(saida)
        self.assertNotEqual(r.returncode, 0)  # type: ignore[union-attr]
        self.assertFalse(saida.exists())

    def _constroi(self, saida: pathlib.Path) -> object:
        import subprocess
        return subprocess.run(
            [sys.executable, "-B", str(CONSTRUTOR),
             "--plugin-tree", str(self.plugin), "--source-commit", "0" * 40,
             "--plugin-root", str(self.plugin), "--plugin-version", "1.0.0",
             "--artifact-version", "1.0.0", "--config-path", str(self.config),
             "--precedence-path", str(self.projeto), "--out", str(saida)],
            capture_output=True, text=True)


class FormaDaLeituraUnica(Bancada):
    """§9 e §12 — ESTRUTURAL, por AST. Nenhuma segunda leitura de arquivo governado."""

    def setUp(self) -> None:
        super().setUp()
        import ast
        self.ast = ast
        self.arv = ast.parse(CONSTRUTOR.read_text(encoding="utf-8"))

    def _main(self):
        return next(n for n in self.ast.walk(self.arv)
                    if isinstance(n, self.ast.FunctionDef) and n.name == "main")

    def test_R4_9_main_nao_le_conteudo_de_arquivo_da_arvore(self) -> None:
        """
        `main` só pode abrir para ESCREVER o manifesto de saída, e ler o que ele mesmo
        acabou de escrever para imprimir o hash. Nenhuma leitura da árvore governada.
        """
        principal = self._main()
        aberturas = [n for n in self.ast.walk(principal)
                     if isinstance(n, self.ast.Call)
                     and isinstance(n.func, self.ast.Name) and n.func.id == "open"]
        self.assertEqual(len(aberturas), 1, "há mais de um `open` no main")
        modos = [x.value for x in aberturas[0].args[1:]
                 if isinstance(x, self.ast.Constant)]
        self.assertEqual(modos, ["w"], "o único `open` do main não é de escrita")

        # Nem por método de caminho.
        metodos = {n.func.attr for n in self.ast.walk(principal)
                   if isinstance(n, self.ast.Call)
                   and isinstance(n.func, self.ast.Attribute)}
        for proibido in ("read_text", "read_bytes", "read", "open"):
            self.assertNotIn(proibido, metodos, f"o main chama .{proibido}()")

    def test_R4_9b_a_unica_leitura_de_arquivo_governado_e_a_autoritativa(self) -> None:
        def le(n) -> bool:  # noqa: ANN001
            """LEITURA, não escrita. `open(..., "w")` do manifesto de saída não conta."""
            if isinstance(n.func, self.ast.Attribute):
                return n.func.attr in ("read", "read_text", "read_bytes")
            if isinstance(n.func, self.ast.Name) and n.func.id == "open":
                modos = [x.value for x in n.args[1:]
                         if isinstance(x, self.ast.Constant)]
                return modos != ["w"]
            return False

        com_leitura = {fn.name for fn in self.ast.walk(self.arv)
                       if isinstance(fn, self.ast.FunctionDef)
                       for n in self.ast.walk(fn)
                       if isinstance(n, self.ast.Call) and le(n)}
        # `le_e_hasheia` lê a árvore. `sha256` só é usada no manifesto de SAÍDA, e
        # `main` a chama sobre `a.out` — não sobre arquivo do plugin.
        self.assertEqual(com_leitura, {"le_e_hasheia", "sha256"})
        chamadas_sha = [n for n in self.ast.walk(self._main())
                        if isinstance(n, self.ast.Call)
                        and isinstance(n.func, self.ast.Name) and n.func.id == "sha256"]
        for c in chamadas_sha:
            nomes = {x.attr for x in self.ast.walk(c)
                     if isinstance(x, self.ast.Attribute)}
            self.assertIn("out", nomes, "sha256 do main não é sobre o arquivo de saída")

    def test_R4_12_o_compat_id_vem_do_registro_APROVADO(self) -> None:
        principal = self._main()
        chamadas = [n for n in self.ast.walk(principal)
                    if isinstance(n, self.ast.Call)
                    and isinstance(n.func, self.ast.Name)
                    and n.func.id == "compat_id_por_ast"]
        self.assertEqual(len(chamadas), 1)
        origem = {n.id for n in self.ast.walk(chamadas[0])
                  if isinstance(n, self.ast.Name)}
        self.assertIn("fonte_aprovada", origem)

        # E `fonte_aprovada` sai de `aprovado_compat.conteudo`, não de caminho.
        atrib = next(n for n in self.ast.walk(principal)
                     if isinstance(n, self.ast.Assign)
                     and any(isinstance(t, self.ast.Name) and t.id == "fonte_aprovada"
                             for t in n.targets))
        atributos = {n.attr for n in self.ast.walk(atrib)
                     if isinstance(n, self.ast.Attribute)}
        self.assertIn("conteudo", atributos)
        self.assertIn("decode", atributos)

    def test_R4_12b_nenhum_OUTRO_campo_deriva_de_arquivo_do_plugin(self) -> None:
        """
        §12 — auditoria dos campos. Só `adapter_compat_id` deriva de arquivo governado,
        e `plugin_files` dos registros aprovados. Todo o resto é constante ou argumento.
        """
        principal = self._main()
        literal = next(n for n in self.ast.walk(principal)
                       if isinstance(n, self.ast.Dict) and any(
                           isinstance(k, self.ast.Constant) and k.value == "manifest_id"
                           for k in n.keys))
        derivados = {"adapter_compat_id", "plugin_files", "file_count"}
        for chave, valor in zip(literal.keys, literal.values):
            if not isinstance(chave, self.ast.Constant):
                continue
            if chave.value in derivados:
                continue
            nomes = {n.id for n in self.ast.walk(valor) if isinstance(n, self.ast.Name)}
            for proibido in ("aprovados", "arquivos", "arvore", "aprovado_compat"):
                self.assertNotIn(proibido, nomes,
                                 f"{chave.value} deriva da árvore do plugin")

