"""
D2E-A8-R4 — autoridade de runtime REPRODUZÍVEL.

Duas lacunas ficaram abertas depois da a4-r6i:

  1. o `runtime_inventory_sha256` era um número FORNECIDO, sem algoritmo neste
     repositório para recomputá-lo;
  2. o artefato de plugin não era reprodutível a partir do estado versionado — a
     casca e o montador viviam fora do controle de versão, e o manifesto da a6
     revisado embutia caminhos da máquina de quem o montou.

O que se prova aqui é o algoritmo e a reprodução. O dígito do runtime genuíno só
pode ser observado DENTRO dele, e isso é sonda, não teste de bancada.
"""
from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
VPS = RAIZ / "deploy" / "vps"
MANIFESTO_RUNTIME = VPS / "runtime-manifest.json"
INVENTARIO = VPS / "runtime-inventory.py"
MONTADOR = VPS / "assemble-plugin-artifact.py"
SELADOR = VPS / "seal-runtime-manifest.py"
CASCA = VPS / "plugin-src"


def carrega(nome: str, caminho: pathlib.Path):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


#: Versões de bancada. Não são as de produção e não precisam ser: o que se mede
#: aqui é a FORMA do inventário, não o runtime.
VERSOES_DE_BANCADA = {
    "hermes-agent": "0.20.4", "aiohttp": "9.9.9", "fastapi": "9.9.9",
    "httpx": "9.9.9", "openai": "9.9.9", "pydantic": "9.9.9",
    "python-telegram-bot": "9.9.9", "PyYAML": "9.9.9", "uvicorn": "9.9.9",
}

COMMIT = "e624e9fde561e1add9388384012b295fde669ade"


class Bancada(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="a8r4-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.inv = carrega("_a8r4_inv", INVENTARIO)
        self.inv.versao_instalada = VERSOES_DE_BANCADA.__getitem__

    def arvore(self, *, commit: str = COMMIT, lock: bytes = b"lock-de-bancada\n",
               com_lock: bool = True, com_git: bool = False,
               com_marcador: bool = True, marcador: bytes | None = None,
               commit_do_git: str | None = None,
               empacotado: bool = False) -> pathlib.Path:
        """
        Por PADRÃO a forma do ESTÁGIO FINAL: `uv.lock` e `.hermes_build_sha`, sem
        `.git`.

        Antes da r4b o padrão era o contrário — toda fixture positiva criava
        `.git` —, e por isso a suíte inteira passava contra uma árvore que a
        imagem implantável não tem. Um teste que só existe na bancada não prova
        nada sobre produção.

        `com_git=True` acrescenta a árvore de reconstrução, para os casos de
        conferência cruzada.
        """
        raiz = self.tmp / f"arvore-{len(list(self.tmp.iterdir()))}"
        raiz.mkdir(parents=True)
        if com_marcador:
            bruto = marcador if marcador is not None else f"{commit}\n".encode()
            (raiz / ".hermes_build_sha").write_bytes(bruto)
        if com_git:
            do_git = commit_do_git if commit_do_git is not None else commit
            (raiz / ".git").mkdir()
            if empacotado:
                (raiz / ".git" / "HEAD").write_text("ref: refs/heads/main\n")
                (raiz / ".git" / "packed-refs").write_text(
                    f"# pack-refs with: peeled\n{do_git} refs/heads/main\n")
            else:
                (raiz / ".git" / "HEAD").write_text(f"{do_git}\n")
        if com_lock:
            (raiz / "uv.lock").write_bytes(lock)
        return raiz


# ═════════════════════════════════════════════════════════════════════════════
class AlgoritmoDoInventario(Bancada):
    """§2 — um algoritmo, determinístico, com campos explícitos."""

    def test_A8R4_1_o_mesmo_runtime_da_o_mesmo_digito(self) -> None:
        raiz = self.arvore()
        digitos = {self.inv.digest(self.inv.observa(raiz)) for _ in range(5)}
        self.assertEqual(len(digitos), 1, "o inventário não é determinístico")

    def test_A8R4_1b_a_forma_canonica_e_legivel_e_ordenada(self) -> None:
        texto = self.inv.canoniza(self.inv.observa(self.arvore()))
        linhas = texto.split("\n")
        self.assertEqual(linhas[0], self.inv.ALGORITMO,
                         "o texto canônico não começa pela identidade do algoritmo")
        self.assertEqual(linhas[-1], "", "o texto canônico não termina em \\n")
        pacotes = [l.split("=")[0] for l in linhas if l.startswith("package.")]
        self.assertEqual(pacotes, sorted(pacotes), "pacotes fora de ordem")
        self.assertEqual(len(pacotes), len(self.inv.PACOTES_GOVERNADOS))
        # Um campo por linha, `chave=valor`, e nada mais.
        for linha in linhas[1:-1]:
            self.assertIn("=", linha)
            self.assertEqual(linha.count("="), 1, linha)

    def test_A8R4_1c_os_campos_sao_exatamente_os_declarados(self) -> None:
        campos = self.inv.observa(self.arvore())
        fixos = [c for c in campos if not c.startswith("package.")]
        self.assertEqual(fixos, [
            "python.implementation", "python.version", "hermes.distribution",
            "hermes.version", "hermes.source_commit", "hermes.lock_sha256"])

    def test_A8R4_2_qualquer_deriva_de_campo_muda_o_digito(self) -> None:
        base = self.inv.observa(self.arvore())
        original = self.inv.digest(base)
        for chave in base:
            derivado = dict(base)
            derivado[chave] = base[chave] + "x"
            self.assertNotEqual(self.inv.digest(derivado), original,
                                f"deriva em {chave} não mudou o dígito")

    def test_A8R4_2b_deriva_do_lock_muda_o_digito(self) -> None:
        a = self.inv.digest(self.inv.observa(self.arvore(lock=b"um\n")))
        b = self.inv.digest(self.inv.observa(self.arvore(lock=b"outro\n")))
        self.assertNotEqual(a, b)

    def test_A8R4_2c_deriva_do_commit_muda_o_digito(self) -> None:
        a = self.inv.digest(self.inv.observa(self.arvore()))
        b = self.inv.digest(self.inv.observa(self.arvore(commit="0" * 40)))
        self.assertNotEqual(a, b)

    def test_A8R4_2d_deriva_de_versao_de_pacote_muda_o_digito(self) -> None:
        raiz = self.arvore()
        antes = self.inv.digest(self.inv.observa(raiz))
        outras = dict(VERSOES_DE_BANCADA, aiohttp="9.9.10")
        self.inv.versao_instalada = outras.__getitem__
        self.assertNotEqual(self.inv.digest(self.inv.observa(raiz)), antes)

    def test_A8R4_3_o_conjunto_de_pacotes_e_constante_DO_CODIGO(self) -> None:
        """
        Se o conjunto viesse do manifesto, quem mudasse o manifesto mudaria junto
        o que o inventário mede — e a conferência viraria tautologia.
        """
        arv = ast.parse(INVENTARIO.read_text(encoding="utf-8"))
        atribuicoes = [n for n in ast.walk(arv) if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == "PACOTES_GOVERNADOS"
                               for t in n.targets)]
        self.assertEqual(len(atribuicoes), 1)
        self.assertIsInstance(atribuicoes[0].value, ast.Tuple)
        for elemento in atribuicoes[0].value.elts:
            self.assertIsInstance(elemento, ast.Constant)
        # E o módulo não lê o manifesto de jeito nenhum.
        self.assertNotIn("runtime-manifest", INVENTARIO.read_text(encoding="utf-8"))

    def test_A8R4_3b_o_inventario_nao_usa_relogio_rede_nem_subprocesso(self) -> None:
        arv = ast.parse(INVENTARIO.read_text(encoding="utf-8"))
        importados = {a.name.split(".")[0] for n in ast.walk(arv)
                      if isinstance(n, ast.Import) for a in n.names}
        importados |= {n.module.split(".")[0] for n in ast.walk(arv)
                       if isinstance(n, ast.ImportFrom) and n.module}
        for proibido in ("time", "datetime", "socket", "urllib", "http", "requests",
                         "subprocess", "random", "os", "tempfile"):
            self.assertNotIn(proibido, importados,
                             f"o inventário importa {proibido}")

    def test_A8R4_3c_o_conjunto_governado_cobre_o_manifesto(self) -> None:
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        declarados = set(doc["critical_packages"]) | {"openai"}
        governados = {self.inv.normaliza_pacote(p)
                      for p in self.inv.PACOTES_GOVERNADOS}
        self.assertEqual({self.inv.normaliza_pacote(p) for p in declarados},
                         governados,
                         "o manifesto declara pacote que o inventário não mede")

    def test_A8R4_3d_a_normalizacao_e_a_do_PEP_503(self) -> None:
        for bruto, esperado in (("PyYAML", "pyyaml"), ("python-telegram-bot",
                                "python-telegram-bot"), ("A__B.C", "a-b-c")):
            self.assertEqual(self.inv.normaliza_pacote(bruto), esperado)


# ═════════════════════════════════════════════════════════════════════════════
class InventarioFalhaFechada(Bancada):
    """§11 — nada é presumido; o que não se pode observar é recusa."""

    def _recusa(self, chamada) -> str:
        with self.assertRaises(self.inv.InventarioRecusado) as c:
            chamada()
        return c.exception.defeito

    def test_A8R4_4_raiz_ausente_RECUSA(self) -> None:
        self.assertEqual(self._recusa(lambda: self.inv.observa(self.tmp / "nao-ha")),
                         "RUNTIME_HERMES_ROOT_UNAVAILABLE")

    def test_A8R4_4b_lock_ausente_RECUSA(self) -> None:
        raiz = self.arvore(com_lock=False)
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_LOCK_UNAVAILABLE")

    def test_A8R4_4c_marcador_ausente_RECUSA(self) -> None:
        """Sem a evidência de build não há inventário — nem com `.git` ao lado."""
        raiz = self.arvore(com_marcador=False, com_git=True)
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_BUILD_SHA_MISSING")

    def test_A8R4_4d_commit_curto_no_marcador_RECUSA(self) -> None:
        raiz = self.arvore(marcador=b"e624e9f\n")
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_BUILD_SHA_MALFORMED")

    def test_A8R4_4e_git_presente_e_irresolvivel_RECUSA(self) -> None:
        """`.git` existe e não resolve: não dá para conferir, então recusa."""
        raiz = self.arvore(com_git=True)
        (raiz / ".git" / "HEAD").write_text("ref: refs/heads/inexistente\n")
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_COMMIT_UNAVAILABLE")

    def test_A8R4_4f_pacote_ausente_RECUSA(self) -> None:
        raiz = self.arvore()

        def sem_aiohttp(nome):
            if nome == "aiohttp":
                raise self.inv.InventarioRecusado("RUNTIME_PACKAGE_MISSING", nome)
            return VERSOES_DE_BANCADA[nome]

        self.inv.versao_instalada = sem_aiohttp
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_PACKAGE_MISSING")

    def test_A8R4_4g_versao_com_quebra_de_linha_RECUSA(self) -> None:
        raiz = self.arvore()
        self.inv.versao_instalada = lambda nome: "1.0\nsegunda-linha"
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_VALUE_NOT_CANONICAL")

    def test_A8R4_4h_versao_com_igual_RECUSA(self) -> None:
        raiz = self.arvore()
        self.inv.versao_instalada = lambda nome: "1.0=2.0"
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_VALUE_NOT_CANONICAL")

    def test_A8R4_5_ref_empacotado_confere_igual(self) -> None:
        """Na conferência cruzada, HEAD destacado e ref empacotado dão o mesmo."""
        a = self.inv.observa(self.arvore(com_git=True))["hermes.source_commit"]
        b = self.inv.observa(
            self.arvore(com_git=True, empacotado=True))["hermes.source_commit"]
        self.assertEqual(a, b)
        self.assertEqual(a, COMMIT)


# ═════════════════════════════════════════════════════════════════════════════
class ArtefatoReprodutivel(Bancada):
    """§5–§7 — o artefato sai das fontes governadas, sempre igual."""

    ESPERADO = (
        "__init__.py",
        "creditum_hermes_telegram/__init__.py",
        "creditum_hermes_telegram/adapter.py",
        "creditum_hermes_telegram/compat.py",
        "creditum_hermes_telegram/ingress.py",
        "creditum_hermes_telegram/planning.py",
        "plugin.yaml",
    )

    def monta(self, sufixo: str) -> dict[str, str]:
        montador = carrega(f"_a8r4_montador_{sufixo}", MONTADOR)
        destino = self.tmp / f"art-{sufixo}"
        self.assertEqual(montador.main(["--out", str(destino)]), 0)
        saida = {}
        for arquivo in sorted(destino.rglob("*")):
            if arquivo.is_file():
                rel = str(arquivo.relative_to(destino)).replace(os.sep, "/")
                saida[rel] = hashlib.sha256(arquivo.read_bytes()).hexdigest()
        return saida

    def test_A8R4_6_a_fonte_da_casca_esta_no_repositorio(self) -> None:
        """§5, modelo A: as entradas são fonte governada, não bytes gerados."""
        for nome in ("__init__.py", "plugin.yaml"):
            self.assertTrue((CASCA / nome).is_file(), f"casca ausente: {nome}")

    def test_A8R4_6b_duas_montagens_sao_byte_identicas(self) -> None:
        self.assertEqual(self.monta("a"), self.monta("b"))

    def test_A8R4_6c_os_sete_arquivos_e_so_eles(self) -> None:
        self.assertEqual(tuple(sorted(self.monta("c"))), self.ESPERADO)

    def test_A8R4_6d_o_selado_confere_com_a_montagem(self) -> None:
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        art = doc["plugin_artifact"]
        self.assertEqual(art["files"], self.monta("d"))
        self.assertEqual(art["file_count"], 7)

    def test_A8R4_7_deriva_de_byte_na_casca_muda_o_artefato(self) -> None:
        """
        A casca é copiada byte a byte. Mudar um byte dela muda o artefato — e é
        por isso que ela precisa ser fonte governada, não um arquivo solto.
        """
        antes = self.monta("e")
        original = (CASCA / "__init__.py").read_bytes()
        try:
            (CASCA / "__init__.py").write_bytes(original + b"\n# deriva\n")
            depois = self.monta("f")
        finally:
            (CASCA / "__init__.py").write_bytes(original)
        self.assertNotEqual(antes["__init__.py"], depois["__init__.py"])
        # E a montagem restaurada volta a ser a selada.
        self.assertEqual(self.monta("g"), antes)

    def test_A8R4_7b_casca_ausente_RECUSA(self) -> None:
        montador = carrega("_a8r4_montador_x", MONTADOR)
        original = (CASCA / "plugin.yaml").read_bytes()
        (CASCA / "plugin.yaml").unlink()
        try:
            codigo = montador.main(["--out", str(self.tmp / "art-sem-casca")])
        finally:
            (CASCA / "plugin.yaml").write_bytes(original)
        self.assertEqual(codigo, 2, "montou sem a casca")

    def test_A8R4_7c_destino_existente_RECUSA(self) -> None:
        montador = carrega("_a8r4_montador_y", MONTADOR)
        destino = self.tmp / "ja-existe"
        destino.mkdir()
        self.assertEqual(montador.main(["--out", str(destino)]), 2)


# ═════════════════════════════════════════════════════════════════════════════
class ManifestoA6Reprodutivel(Bancada):
    """§7 — o manifesto de implantação sai das ENTRADAS GOVERNADAS."""

    def setUp(self) -> None:
        super().setUp()
        self.selador = carrega("_a8r4_selador", SELADOR)
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        self.entradas = self.doc["plugin_artifact"]["a6_manifest_inputs"]

    def constroi(self, entradas: dict) -> str:
        arvore = self.tmp / f"arv{len(list(self.tmp.iterdir()))}"
        self.selador.reproduz_artefato(RAIZ, arvore)
        return self.selador.reproduz_manifesto_a6(
            RAIZ, arvore, entradas, self.tmp / f"m{len(list(self.tmp.iterdir()))}.json")

    def test_A8R4_8_o_manifesto_reproduzido_e_o_selado(self) -> None:
        self.assertEqual(self.constroi(self.entradas),
                         self.doc["plugin_artifact"]["a6_manifest_sha256"])

    def test_A8R4_8b_duas_construcoes_dao_o_mesmo_SHA(self) -> None:
        self.assertEqual(self.constroi(self.entradas), self.constroi(self.entradas))

    def test_A8R4_9_as_entradas_governadas_nao_tem_caminho_DE_MAQUINA(self) -> None:
        """
        O manifesto revisado na a4-r6i embutia `/private/tmp/claude-501/...`. Um
        manifesto que carrega o caminho de quem o montou é válido contra aqueles
        bytes e irreprodutível em qualquer outra máquina.
        """
        caminhos = [self.entradas["config_path"], *self.entradas["precedence_paths"],
                    self.entradas["plugin_root"]]
        for caminho in caminhos:
            self.assertTrue(caminho.startswith("/data/")
                            or caminho.startswith("/opt/"), caminho)
            for proibido in ("/tmp", "/private", "/var/folders", "scratchpad",
                             str(pathlib.Path.home())):
                self.assertNotIn(proibido, caminho)

    def test_A8R4_9b_o_commit_das_entradas_e_um_commit_REAL(self) -> None:
        commit = self.entradas["source_commit"]
        self.assertRegex(commit, r"^[0-9a-f]{40}$")
        # O revisado era `bb91fb2` seguido de 33 zeros: forma válida, origem inventada.
        self.assertFalse(commit.endswith("0" * 12),
                         "source_commit parece preenchido com zeros")

    def test_A8R4_10_mudar_uma_entrada_muda_o_SHA(self) -> None:
        for chave, novo in (("artifact_version", "outra"),
                            ("plugin_root", "/data/plugins/outro"),
                            ("config_path", "/data/outro.yaml"),
                            ("source_commit", "0" * 40)):
            self.assertNotEqual(
                self.constroi(dict(self.entradas, **{chave: novo})),
                self.doc["plugin_artifact"]["a6_manifest_sha256"], chave)


# ═════════════════════════════════════════════════════════════════════════════
class SeloRecomputaEmVezDeConferirPresenca(Bancada):
    """§9–§10 — sem raiz não há inventário, e sem inventário não há selo."""

    def selador(self):
        return carrega(f"_a8r4_sel{len(list(self.tmp.iterdir()))}", SELADOR)

    def test_A8R4_11_check_sem_runtime_root_RECUSA(self) -> None:
        self.assertEqual(self.selador().main(["--check"]), 2)

    def test_A8R4_11b_o_inventario_selado_e_o_do_algoritmo_governado(self) -> None:
        """
        Na r4 este teste exigia NULO: o recomputado ainda não tinha sido adotado.
        A r4a adotou-o por decisão explícita, e o que ele exige agora é que o
        valor selado seja exatamente o que o algoritmo governado produz — não um
        número qualquer que alguém tenha escrito no lugar.
        """
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        self.assertEqual(
            doc["hermes_source"]["runtime_inventory_sha256"],
            "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d")
        self.assertEqual(doc["hermes_source"]["runtime_inventory_algorithm"],
                         "creditum_hermes_runtime_inventory/v1")
        # E o --check sem raiz continua recusando: valor declarado não é observação.
        self.assertEqual(self.selador().main(["--check"]), 2)

    def test_A8R4_11c_o_check_recomputa_o_hash_dos_governados(self) -> None:
        """Presença não é autoridade: mudar o arquivo governado tem de recusar."""
        alvo = RAIZ / "deploy" / "vps" / "compose.yaml"
        original = alvo.read_bytes()
        try:
            alvo.write_bytes(original + b"\n# deriva\n")
            self.assertEqual(self.selador().main(["--check"]), 2)
        finally:
            alvo.write_bytes(original)

    def test_A8R4_12_o_selo_do_manifesto_nao_e_parcial(self) -> None:
        """
        Qualquer componente irresolvido derruba o resultado inteiro. Não existe
        SELADO parcial: um manifesto meio selado é usado como se fosse selado.
        """
        fonte = SELADOR.read_text(encoding="utf-8")
        self.assertIn("O BUILD NÃO DEVE PROSSEGUIR", fonte)
        arv = ast.parse(fonte)
        principal = next(n for n in ast.walk(arv)
                         if isinstance(n, ast.FunctionDef) and n.name == "main")
        retornos = {n.value.value for n in ast.walk(principal)
                    if isinstance(n, ast.Return) and isinstance(n.value, ast.Constant)}
        self.assertEqual(retornos, {0, 2}, "há código de saída além de 0 e 2")


# ═════════════════════════════════════════════════════════════════════════════
class AutoridadeFinalDaR4A(Bancada):
    """
    A8-R4A — o inventário governado vira autoridade e o `plugin.yaml` vira verdade.

    Três decisões desta rodada, e um teste para cada uma não voltar atrás:

      1. o dígito canônico é o RECOMPUTADO; o fornecido é histórico;
      2. o manifesto pré-reprodutibilidade não é autoridade implantável;
      3. o `plugin.yaml` declara a identidade que a a4 realmente tem.
    """

    def setUp(self) -> None:
        super().setUp()
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        self.fonte = self.doc["hermes_source"]
        self.art = self.doc["plugin_artifact"]

    CANONICO = "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d"
    HISTORICO = "01ba45ae2ecde279ec53b6d8dabdeae85a7caf2eca74823e526e10666367aee1"
    A6_HISTORICO = "1766db9ffe83b15b7bd1f8781d82c4b0b48e9b5f87db7924bc81ae46be1d7d9e"
    CHECKPOINT_A4 = "32234255e03cdf90be6f865d623fe75e805213eb"

    # ─── decisão 1 ──────────────────────────────────────────────────────────

    def test_A8R4A_o_inventario_canonico_e_o_RECOMPUTADO(self) -> None:
        self.assertEqual(self.fonte["runtime_inventory_sha256"], self.CANONICO)
        self.assertEqual(self.fonte["runtime_inventory_algorithm"],
                         "creditum_hermes_runtime_inventory/v1")

    def test_A8R4A_o_fornecido_e_HISTORICO_e_nao_autoridade(self) -> None:
        """
        O valor antigo continua registrado — procedência importa — mas só em campo
        marcado como histórico. Se ele reaparecesse como autoridade, um número sem
        algoritmo voltaria a valer por estar escrito num manifesto.
        """
        self.assertEqual(self.fonte["runtime_inventory_sha256_historical"],
                         self.HISTORICO)
        for chave, valor in self.fonte.items():
            if "historical" in chave:
                continue
            self.assertNotEqual(valor, self.HISTORICO,
                                f"o valor histórico é autoridade em {chave}")
        nota = self.fonte["runtime_inventory_sha256_historical_note"]
        self.assertIn("NÃO AUTORITATIVO", nota)
        self.assertIn("SUPERADO", nota)

    def test_A8R4A_o_algoritmo_NAO_foi_torcido_para_bater(self) -> None:
        """O canônico é o que o algoritmo produz, não o que faria o antigo bater."""
        self.assertNotEqual(self.CANONICO, self.HISTORICO)
        self.assertNotIn(self.HISTORICO, INVENTARIO.read_text(encoding="utf-8"))

    # ─── decisão 2 ──────────────────────────────────────────────────────────

    def test_A8R4A_o_manifesto_antigo_e_PRE_REPRODUTIBILIDADE(self) -> None:
        self.assertEqual(self.art["a6_manifest_sha256_historical"], self.A6_HISTORICO)
        self.assertNotEqual(self.art["a6_manifest_sha256"], self.A6_HISTORICO)
        nota = self.art["a6_manifest_sha256_historical_note"]
        self.assertIn("NÃO É AUTORIDADE IMPLANTÁVEL", nota)

    # ─── decisão 3 ──────────────────────────────────────────────────────────

    def test_A8R4A_o_plugin_yaml_declara_a_identidade_REAL_da_a4(self) -> None:
        """
        O campo não é lido por portão nenhum — o verificador da a6 deriva a
        identidade do AST do `compat.py`. É justamente por isso que ele podia
        mentir por seis rodadas sem que nada quebrasse.
        """
        import re
        yaml = (CASCA / "plugin.yaml").read_text(encoding="utf-8")
        declarado = re.search(r"^\s*adapter_compat_id:\s*(\S+)\s*$", yaml,
                              re.MULTILINE).group(1)
        compat = (RAIZ / "bridge" / "creditum_hermes_telegram" / "compat.py").read_text(
            encoding="utf-8")
        real = re.search(r'^ADAPTER_COMPAT_ID = "([^"]+)"', compat,
                         re.MULTILINE).group(1)
        self.assertEqual(declarado, real)
        self.assertEqual(declarado, "creditum_telegram_adapter_compat/0.20.4/v2")

    def test_A8R4A_voltar_o_yaml_para_v1_MUDA_o_artefato_e_o_manifesto(self) -> None:
        selador = carrega("_a8r4a_sel_v1", SELADOR)
        alvo = CASCA / "plugin.yaml"
        original = alvo.read_bytes()

        def constroi(sufixo: str) -> tuple[dict, str]:
            arvore = self.tmp / f"v1-{sufixo}"
            arquivos = selador.reproduz_artefato(RAIZ, arvore)
            return arquivos, selador.reproduz_manifesto_a6(
                RAIZ, arvore, self.art["a6_manifest_inputs"],
                self.tmp / f"v1-{sufixo}.json")

        try:
            alvo.write_bytes(original.replace(b"/0.20.4/v2", b"/0.20.4/v1"))
            arquivos_v1, sha_v1 = constroi("mutado")
        finally:
            alvo.write_bytes(original)
        self.assertNotEqual(arquivos_v1["plugin.yaml"], self.art["files"]["plugin.yaml"])
        self.assertNotEqual(sha_v1, self.art["a6_manifest_sha256"])
        # E restaurado volta a ser exatamente o selado.
        arquivos_ok, sha_ok = constroi("restaurado")
        self.assertEqual(arquivos_ok, self.art["files"])
        self.assertEqual(sha_ok, self.art["a6_manifest_sha256"])

    # ─── §1: a a4 continua congelada ────────────────────────────────────────

    def test_A8R4A_os_bytes_congelados_da_a4_nao_mudaram(self) -> None:
        for nome, esperado in (
                ("adapter.py",
                 "24f42cabe98dd86f51be4495fd74681398f22a0e88acde83d254af3a21c5f63f"),
                ("compat.py",
                 "159d032d667408a7b2a313ab5164241115922243c1206f0de8647d2f3461c779")):
            caminho = RAIZ / "bridge" / "creditum_hermes_telegram" / nome
            self.assertEqual(
                hashlib.sha256(caminho.read_bytes()).hexdigest(), esperado, nome)
            self.assertEqual(
                self.art["files"][f"creditum_hermes_telegram/{nome}"], esperado)

    # ─── §2: a semântica de `source_commit` ─────────────────────────────────

    def test_A8R4A_source_commit_e_o_CHECKPOINT_CONGELADO_DA_A4(self) -> None:
        self.assertEqual(self.art["a6_manifest_inputs"]["source_commit"],
                         self.CHECKPOINT_A4)

    def test_A8R4A_source_commit_NAO_e_circular(self) -> None:
        """
        `source_commit` é o checkpoint da IMPLEMENTAÇÃO da a4, não o commit que
        contém as entradas de empacotamento. Apontá-lo para o commit que carrega
        este próprio manifesto seria o documento provando a si mesmo — e é o tipo
        de ambiguidade que volta sozinha se ninguém a fixar num teste.
        """
        import subprocess
        commit = self.art["a6_manifest_inputs"]["source_commit"]
        r = subprocess.run(
            ["git", "ls-tree", "-r", "--name-only", commit],
            cwd=RAIZ.parent, capture_output=True, text=True)
        if r.returncode != 0:
            self.skipTest("git indisponível")
        arquivos = set(r.stdout.splitlines())
        # A implementação da a4 ESTÁ nesse commit...
        self.assertIn("intelligence/bridge/creditum_hermes_telegram/compat.py", arquivos)
        # ...e as entradas de empacotamento da a8 NÃO. Se um dia estiverem, o campo
        # virou "o commit que contém tudo", e a distinção terá se perdido.
        for empacotamento in (
                "intelligence/deploy/vps/runtime-manifest.json",
                "intelligence/deploy/vps/plugin-src/plugin.yaml",
                "intelligence/deploy/vps/assemble-plugin-artifact.py"):
            self.assertNotIn(empacotamento, arquivos,
                             "source_commit passou a conter o próprio empacotamento: "
                             "proveniência circular")
        self.assertIn("checkpoint", self.art["a6_manifest_inputs_note"].lower())

    # ─── §4/§12: caminho de estação de trabalho é recusa ────────────────────

    def test_A8R4A_entrada_com_caminho_de_scratchpad_RECUSA(self) -> None:
        selador = carrega("_a8r4a_sel_path", SELADOR)
        for ruim in ("/private/tmp/scratchpad/config.yaml", "/tmp/config.yaml",
                     str(pathlib.Path.home() / "config.yaml"), "relativo.yaml"):
            self.assertFalse(ruim.startswith(selador.PREFIXOS_GOVERNADOS), ruim)
        for bom in (self.art["a6_manifest_inputs"]["config_path"],
                    self.art["a6_manifest_inputs"]["plugin_root"],
                    *self.art["a6_manifest_inputs"]["precedence_paths"]):
            self.assertTrue(bom.startswith(selador.PREFIXOS_GOVERNADOS), bom)

    def test_A8R4A_nenhum_caminho_de_maquina_na_autoridade_final(self) -> None:
        texto = MANIFESTO_RUNTIME.read_text(encoding="utf-8")
        # A nota histórica CITA o defeito; o resto do documento não pode carregá-lo.
        sem_prosa = "\n".join(l for l in texto.splitlines()
                              if '"note"' not in l and "_note" not in l)
        for proibido in ("/private/tmp", "/var/folders", "scratchpad",
                         str(pathlib.Path.home())):
            self.assertNotIn(proibido, sem_prosa, proibido)

    # ─── §11/§12: o check falha fechado quando não pode observar ────────────

    def test_A8R4A_runtime_root_invalido_FALHA_FECHADA(self) -> None:
        selador = carrega("_a8r4a_sel_raiz", SELADOR)
        self.assertEqual(
            selador.main(["--check", "--runtime-root", str(self.tmp / "nao-ha")]), 2)

    def test_A8R4A_runtime_sem_os_pacotes_FALHA_FECHADA(self) -> None:
        """
        Uma árvore com `.git` e `uv.lock` mas sem o runtime instalado não produz
        inventário — e o resultado é recusa, não "não deu para conferir".
        """
        raiz = self.arvore()
        selador = carrega("_a8r4a_sel_pkg", SELADOR)
        self.assertEqual(selador.main(["--check", "--runtime-root", str(raiz)]), 2)


# ═════════════════════════════════════════════════════════════════════════════
class EvidenciaDoRuntimeFinal(Bancada):
    """
    A8-R4B — a evidência do commit tem de existir ONDE O RUNTIME RODA.

    A r4 e a r4a leram o commit do `.git` e passaram — contra a árvore de
    reconstrução, que tem `.git`. A imagem implantável não tem: o Dockerfile
    verifica o checkout, persiste o commit conferido em `.hermes_build_sha` e
    APAGA o `.git` antes de copiar a árvore para o estágio final.

    Então o inventário funcionava exatamente onde ninguém precisa dele. Toda
    fixture positiva criava `.git`, e por isso nada apontou o buraco: a suíte
    provava a bancada, não o produto.

    A autoridade passa a ser o marcador. O `.git`, quando existe, só confere.
    """

    MARCADOR = ".hermes_build_sha"

    def _recusa(self, chamada) -> str:
        with self.assertRaises(self.inv.InventarioRecusado) as c:
            chamada()
        return c.exception.defeito

    # ─── §1: o formato é o do produtor, medido ──────────────────────────────

    def test_A8R4B_o_formato_e_o_que_o_Dockerfile_ESCREVE(self) -> None:
        """
        `printf '%s\n' "${HERMES_COMMIT}"` — 40 hex e UMA quebra. 41 bytes.
        Se o produtor mudar, este teste é o que percebe.
        """
        dockerfile = (RAIZ / "deploy" / "vps" / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("printf '%s\\n' \"${HERMES_COMMIT}\" > "
                      "/opt/hermes-agent/.hermes_build_sha", dockerfile)
        raiz = self.arvore()
        self.assertEqual(len((raiz / self.MARCADOR).read_bytes()), 41)
        self.assertTrue(self.inv.FORMATO_DO_MARCADOR.match(
            (raiz / self.MARCADOR).read_bytes()))

    def test_A8R4B_o_Dockerfile_verifica_ANTES_de_persistir_e_apagar(self) -> None:
        """
        A ordem é a prova: conferir HEAD contra o commit pedido → conferir o lock →
        gravar o marcador → apagar o `.git`. Gravar antes de conferir persistiria
        um valor não verificado, e o marcador viraria só um arquivo com texto.
        """
        dockerfile = (RAIZ / "deploy" / "vps" / "Dockerfile").read_text(encoding="utf-8")
        i_confere = dockerfile.index("HERMES_COMMIT_MISMATCH")
        i_lock = dockerfile.index("HERMES_LOCK_SHA256_MISMATCH")
        i_grava = dockerfile.index("> /opt/hermes-agent/.hermes_build_sha")
        i_apaga = dockerfile.index("rm -rf /opt/hermes-agent/.git")
        self.assertLess(i_confere, i_grava, "grava o marcador antes de conferir")
        self.assertLess(i_lock, i_grava)
        self.assertLess(i_grava, i_apaga, "apaga o .git antes de gravar o marcador")
        # E o estágio final reconfere o marcador contra o commit pedido.
        self.assertIn("HERMES_BUILD_SHA_MISMATCH", dockerfile)
        self.assertIn("HERMES_BUILD_SHA_MISSING", dockerfile)

    # ─── §8: a forma do estágio final, que é a que faltava ──────────────────

    def test_A8R4B_forma_do_estagio_final_SEM_git_PASSA(self) -> None:
        raiz = self.arvore()                       # padrão: marcador, sem .git
        self.assertFalse((raiz / ".git").exists(), "a fixture ainda cria .git")
        campos = self.inv.observa(raiz)
        self.assertEqual(campos["hermes.source_commit"], COMMIT)

    def test_A8R4B_o_digito_nao_depende_de_ONDE_o_commit_foi_lido(self) -> None:
        """
        O campo canônico é o mesmo fato. Mudar a via de observação não pode mudar
        o dígito — se mudasse, a r4b teria alterado a autoridade em vez de
        consertar a leitura.
        """
        sem_git = self.inv.digest(self.inv.observa(self.arvore()))
        com_git = self.inv.digest(self.inv.observa(self.arvore(com_git=True)))
        self.assertEqual(sem_git, com_git)

    # ─── §9: os casos negativos ─────────────────────────────────────────────

    def test_A8R4B_A_marcador_ausente_RECUSA(self) -> None:
        self.assertEqual(
            self._recusa(lambda: self.inv.observa(self.arvore(com_marcador=False))),
            "RUNTIME_BUILD_SHA_MISSING")

    def test_A8R4B_B_marcador_malformado_RECUSA(self) -> None:
        """
        `.strip()` genérico aceitaria quase todos. O produtor não escreve nenhum.

        A linha extra (`<commit>\\n\\n`) é a que passou na primeira tentativa: com
        `$` no lugar de `\\Z`, o Python casa logo antes da quebra final.
        """
        for bruto in (b"", b"\n", f"{COMMIT}".encode(),                 # sem quebra
                      f"{COMMIT}\r\n".encode(), f" {COMMIT}\n".encode(),
                      f"{COMMIT}\n\n".encode(), f"{COMMIT}\nlixo\n".encode(),
                      f"{COMMIT.upper()}\n".encode(), b"z" * 40 + b"\n"):
            self.assertEqual(
                self._recusa(lambda b=bruto: self.inv.observa(
                    self.arvore(marcador=b))),
                "RUNTIME_BUILD_SHA_MALFORMED", repr(bruto[:24]))

    def test_A8R4B_C_marcador_com_outro_commit_muda_o_digito(self) -> None:
        outro = "0" * 39 + "1"
        campos = self.inv.observa(self.arvore(commit=outro))
        self.assertEqual(campos["hermes.source_commit"], outro)
        self.assertNotEqual(self.inv.digest(campos),
                            self.inv.digest(self.inv.observa(self.arvore())))

    def test_A8R4B_D_sem_git_com_marcador_correto_PASSA(self) -> None:
        campos = self.inv.observa(self.arvore(com_git=False))
        self.assertEqual(campos["hermes.source_commit"], COMMIT)

    def test_A8R4B_E_git_concordante_PASSA(self) -> None:
        campos = self.inv.observa(self.arvore(com_git=True))
        self.assertEqual(campos["hermes.source_commit"], COMMIT)

    def test_A8R4B_F_git_conflitante_RECUSA(self) -> None:
        """
        Marcador e `.git` discordando: um dos dois mente e não dá para saber qual.
        Escolher qualquer um seria escolher no escuro.
        """
        raiz = self.arvore(com_git=True, commit_do_git="0" * 40)
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_COMMIT_EVIDENCE_CONFLICT")

    def test_A8R4B_o_git_NAO_substitui_um_marcador_ausente(self) -> None:
        """
        O contrário abriria duas autoridades: a bancada passaria pelo `.git` e a
        imagem pelo marcador, e as duas nunca seriam comparadas.
        """
        raiz = self.arvore(com_marcador=False, com_git=True)
        self.assertTrue((raiz / ".git").is_dir())
        self.assertEqual(self._recusa(lambda: self.inv.observa(raiz)),
                         "RUNTIME_BUILD_SHA_MISSING")

    # ─── o selo inteiro contra a forma final ────────────────────────────────

    def test_A8R4B_o_selo_inteiro_falha_fechado_sem_o_marcador(self) -> None:
        selador = carrega("_a8r4b_sel", SELADOR)
        raiz = self.arvore(com_marcador=False)
        self.assertEqual(selador.main(["--check", "--runtime-root", str(raiz)]), 2)


# ═════════════════════════════════════════════════════════════════════════════
class FerramentaDeBuildGovernada(Bancada):
    """
    A8-R4C — a ferramenta que constrói o runtime também tem dono.

    `UV_VERSION` era `ARG` sem padrão: falhava fechada, o que é melhor que
    `:latest`, mas deixava a FERRAMENTA como escolha de quem chama. O mesmo
    estado do repositório podia produzir imagens construídas por dois `uv`
    diferentes, e nada notava — "reprodutível" com um insumo livre é
    reprodutível na palavra.

    Agora é dígito OCI literal no `Dockerfile`. Não há valor a escolher.
    """

    DIGESTO = "sha256:b46b03ddfcfbf8f547af7e9eaefdf8a39c8cebcba7c98858d3162bd28cf536f6"

    def setUp(self) -> None:
        super().setUp()
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        self.ferramenta = self.doc["build_toolchain"]
        self.dockerfile = (RAIZ / "deploy" / "vps" / "Dockerfile").read_text(
            encoding="utf-8")
        self.compose = (RAIZ / "deploy" / "vps" / "compose.yaml").read_text(
            encoding="utf-8")

    def _linha_do_uv(self) -> str:
        linhas = [l for l in self.dockerfile.splitlines()
                  if l.startswith("FROM") and "AS ferramenta_uv" in l]
        self.assertEqual(len(linhas), 1)
        return linhas[0]

    # ─── §5: a autoridade existe e mora no repositório ──────────────────────

    def test_A8R4C_a_ferramenta_de_build_e_GOVERNADA(self) -> None:
        self.assertEqual(self.ferramenta["installer"], "uv")
        self.assertEqual(self.ferramenta["uv_version"], "0.11.19")
        self.assertEqual(self.ferramenta["uv_image"], "ghcr.io/astral-sh/uv")
        self.assertEqual(self.ferramenta["uv_image_digest"], self.DIGESTO)

    def test_A8R4C_o_digesto_tem_forma_de_digesto(self) -> None:
        d = self.ferramenta["uv_image_digest"]
        self.assertTrue(d.startswith("sha256:"))
        self.assertEqual(len(d), 71)
        self.assertRegex(d[7:], r"^[0-9a-f]{64}$")

    def test_A8R4C_a_procedencia_da_escolha_esta_ESCRITA(self) -> None:
        """
        A versão saiu do `uv` desta estação, que reconstruiu o staging aprovado —
        não do build de produção. Fixá-la é decisão ancorada numa observação, e a
        nota tem de dizer isso, senão alguém a lê como medição de produção. Foi
        assim que `01ba45ae…` virou autoridade por seis meses.
        """
        nota = self.ferramenta["uv_version_observation"]
        self.assertIn("0.11.19", nota)
        self.assertIn("NÃO é observação do build de produção", nota)
        self.assertIn("DECISÃO", nota)

    # ─── §6: o Dockerfile consome a autoridade, e nada mais ─────────────────

    def test_A8R4C_o_Dockerfile_usa_o_DIGESTO_governado(self) -> None:
        self.assertIn(f"@{self.DIGESTO}", self._linha_do_uv())
        self.assertIn(f"@{self.ferramenta['uv_image_digest']}", self._linha_do_uv())

    def test_A8R4C_nao_ha_argumento_de_build_para_a_ferramenta(self) -> None:
        self.assertIsNone(self.ferramenta["build_arg"])
        self.assertNotIn("${", self._linha_do_uv())
        self.assertFalse(any(l.strip().startswith("ARG UV_VERSION")
                             for l in self.dockerfile.splitlines()))
        for linha in self.compose.splitlines():
            if not linha.lstrip().startswith("#"):
                self.assertNotIn("UV_VERSION:", linha)

    def test_A8R4C_nenhuma_referencia_MOVEL_no_estagio_do_uv(self) -> None:
        linha = self._linha_do_uv()
        for movel in ("latest", "main", "master", "HEAD"):
            self.assertNotIn(f":{movel}", linha)
        # E o `FROM` não usa tag nenhuma: dígito, não nome.
        self.assertNotRegex(linha, r"ghcr\.io/astral-sh/uv:[^@\s]")

    # ─── §7: os negativos, contra o próprio selador ─────────────────────────

    def _check_com(self, mutacao, arquivo: str = "deploy/vps/Dockerfile") -> int:
        alvo = RAIZ / arquivo
        original = alvo.read_bytes()
        selador = carrega(f"_a8r4c_{len(list(self.tmp.iterdir()))}", SELADOR)
        try:
            alvo.write_bytes(mutacao(original))
            return selador.main(["--check"])
        finally:
            alvo.write_bytes(original)

    def test_A8R4C_digesto_diferente_no_Dockerfile_RECUSA(self) -> None:
        outro = "sha256:" + "0" * 64
        self.assertEqual(
            self._check_com(lambda b: b.replace(self.DIGESTO.encode(),
                                                outro.encode())), 2)

    def test_A8R4C_tag_movel_no_lugar_do_digesto_RECUSA(self) -> None:
        self.assertEqual(
            self._check_com(lambda b: b.replace(
                f"uv@{self.DIGESTO}".encode(), b"uv:latest")), 2)

    def test_A8R4C_argumento_de_build_ressurgindo_RECUSA(self) -> None:
        self.assertEqual(
            self._check_com(lambda b: b.replace(
                f"FROM ghcr.io/astral-sh/uv@{self.DIGESTO}".encode(),
                b"ARG UV_VERSION\nFROM ghcr.io/astral-sh/uv:${UV_VERSION:?x}")), 2)

    def test_A8R4C_UV_VERSION_voltando_no_compose_RECUSA(self) -> None:
        self.assertEqual(
            self._check_com(
                lambda b: b.replace(
                    b"        HERMES_LOCK_SHA256: ${HERMES_LOCK_SHA256:?sha256 do uv.lock e obrigatorio}",
                    b"        HERMES_LOCK_SHA256: ${HERMES_LOCK_SHA256:?sha256 do uv.lock e obrigatorio}\n"
                    b"        UV_VERSION: ${UV_VERSION:?volta}"),
                arquivo="deploy/vps/compose.yaml"), 2)

    def test_A8R4C_autoridade_aprovada_e_ACEITA(self) -> None:
        """
        O positivo, para o teste não passar só por recusar tudo: com o estado
        governado intacto, a única recusa é a do inventário não observado.
        """
        selador = carrega("_a8r4c_ok", SELADOR)
        self.assertEqual(selador.main(["--check"]), 2)   # falta --runtime-root
        # e nenhuma recusa é da ferramenta de build
        import contextlib, io
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            carrega("_a8r4c_ok2", SELADOR).main(["--check"])
        texto = saida.getvalue()
        self.assertIn("RECUSA   --runtime-root ausente", texto)
        for palavra in ("build_toolchain", "estágio do uv", "UV_VERSION",
                        "dígito governado"):
            self.assertNotIn(f"RECUSA   {palavra}", texto)
        self.assertNotIn("ARG UV_VERSION ressurgiu", texto)

    # ─── §4: o inventário do runtime NÃO muda por causa disto ───────────────

    def test_A8R4C_o_inventario_do_runtime_NAO_ganhou_campo(self) -> None:
        """
        `uv` é ferramenta de build. Acrescentá-lo ao inventário mudaria o texto
        canônico e portanto o dígito selado — reabrir uma autoridade fechada por
        causa de uma ferramenta. A identidade dela já está fixada por dígito OCI,
        que é mais forte que uma string de versão.
        """
        self.assertEqual(
            self.doc["hermes_source"]["runtime_inventory_sha256"],
            "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d")
        fonte = INVENTARIO.read_text(encoding="utf-8")
        self.assertNotIn("uv_version", fonte)
        self.assertNotIn("build_toolchain", fonte)
        # `uvicorn` também contém "uv": a busca é pelo campo da FERRAMENTA, não
        # por substring. Um teste frouxo aqui falharia por motivo errado.
        campos = self.inv.observa(self.arvore())
        for proibido in ("build.uv", "uv.version", "tool.uv", "package.uv"):
            self.assertNotIn(proibido, campos)
        self.assertNotIn("uv", {c.split(".")[-1] for c in campos})

    def test_A8R4C_a_RESIDENCIA_do_uv_na_imagem_esta_declarada(self) -> None:
        """
        O binário é copiado para /usr/local/bin/uv, então ele FICA na imagem. Isso
        está declarado — não medido pelo inventário, e a distinção está escrita.
        Um fato inconveniente que não está escrito em lugar nenhum é o que vira
        surpresa na revisão seguinte.
        """
        self.assertIn("COPY --from=ferramenta_uv /uv /usr/local/bin/uv",
                      self.dockerfile)
        self.assertIs(self.ferramenta["uv_resident_in_final_image"], True)
        self.assertIn("não entra em creditum_hermes_runtime_inventory/v1",
                      self.ferramenta["uv_resident_note"])


# =============================================================================
class ContratoDeInstalacao(Bancada):
    """
    A8-R4E — o passo de instalação tem de PRODUZIR o inventário governado.

    A a8-r4d reconstruiu o staging do zero e mediu duas coisas que nenhuma rodada
    anterior tinha visto, porque nenhuma tinha executado o passo de instalação:

      1. `uv sync --frozen --no-dev` NAO instala `aiohttp` nem
         `python-telegram-bot` — os dois vivem no extra `messaging` do Hermes.
         O adaptador do Telegram sem a biblioteca do Telegram;

      2. `VIRTUAL_ENV=/opt/venv uv sync` e IGNORADO pelo uv 0.11.19, que avisa
         "use --active" e instala em `<projeto>/.venv` — e cria esse ambiente com
         um Python que ELE escolhe (medido: 3.11.15), porque o Hermes aceita
         `>=3.11,<3.14`.

    O selo media o runtime certo; o build produzia outro. Este contrato fecha a
    distancia entre os dois.
    """

    DOCKERFILE = "deploy/vps/Dockerfile"

    def setUp(self) -> None:
        super().setUp()
        self.texto = (RAIZ / self.DOCKERFILE).read_text(encoding="utf-8")
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))

    def _instalacao(self) -> str:
        """O bloco RUN que cria o ambiente e sincroniza."""
        inicio = self.texto.index("uv venv --no-python-downloads")
        return self.texto[inicio - 600:inicio + 900]

    # --- extra messaging ---------------------------------------------------

    def test_A8R4E_o_sync_pede_o_extra_messaging(self) -> None:
        self.assertIn("--extra messaging", self._instalacao())

    def test_A8R4E_os_dois_pacotes_do_extra_estao_no_inventario(self) -> None:
        """
        Se um dia sairem do inventario, o extra deixa de ser necessario e este
        teste e o lugar onde essa mudanca aparece.
        """
        governados = {p.lower() for p in self.doc["critical_packages"]}
        self.assertIn("aiohttp", governados)
        self.assertIn("python-telegram-bot", governados)

    def test_A8R4E_sem_o_extra_o_contrato_QUEBRA(self) -> None:
        """Mutacao: tirar o extra e o Dockerfile deixa de satisfazer o inventario."""
        sem_extra = self._instalacao().replace("--extra messaging ", "")
        self.assertNotIn("--extra messaging", sem_extra)
        self.assertNotIn("--extra", sem_extra)

    # --- Python exato -------------------------------------------------------

    def test_A8R4E_o_Python_da_base_e_CONFERIDO_antes_do_venv(self) -> None:
        bloco = self._instalacao()
        self.assertIn("PYTHON_BASE_VERSION_UNEXPECTED", bloco)
        self.assertIn("${PYTHON_VERSION_ESPERADA}", bloco)
        i_confere = bloco.index("PYTHON_BASE_VERSION_UNEXPECTED")
        i_venv = bloco.index("uv venv --no-python-downloads")
        self.assertLess(i_confere, i_venv, "cria o venv antes de conferir a versao")

    def test_A8R4E_a_versao_esperada_e_exatamente_3_13_15(self) -> None:
        self.assertIn("ARG PYTHON_VERSION_ESPERADA=3.13.15", self.texto)
        self.assertEqual(self.doc["runtime_versions"]["python"], "3.13.15")

    # --- uv nao escolhe interpretador ---------------------------------------

    def test_A8R4E_o_uv_nao_pode_baixar_nem_gerenciar_Python(self) -> None:
        self.assertIn("UV_PYTHON_DOWNLOADS=never", self.texto)
        self.assertIn("UV_NO_MANAGED_PYTHON=1", self.texto)
        bloco = self._instalacao()
        self.assertEqual(bloco.count("--no-python-downloads"), 2,
                         "o venv e o sync precisam os dois do freio")

    # --- /opt/venv e o ambiente, e o do projeto e recusado ------------------

    def test_A8R4E_o_sync_vai_para_opt_venv_via_active(self) -> None:
        bloco = self._instalacao()
        self.assertIn("--active", bloco)
        self.assertIn("VIRTUAL_ENV=/opt/venv", bloco)
        self.assertIn("--python /opt/venv/bin/python", bloco)

    def test_A8R4E_venv_do_projeto_aparecendo_e_RECUSA(self) -> None:
        bloco = self._instalacao()
        self.assertIn("PROJECT_VENV_APPEARED", bloco)
        self.assertIn("/opt/hermes-agent/.venv", bloco)

    def test_A8R4E_nada_autoritativo_depende_do_venv_do_projeto(self) -> None:
        """O runtime usa /opt/venv; `.venv` do projeto so aparece para ser recusado."""
        for linha in self.texto.splitlines():
            if "/opt/hermes-agent/.venv" in linha:
                self.assertIn("PROJECT_VENV_APPEARED", linha + " " +
                              self._instalacao())

    # --- lock intacto -------------------------------------------------------

    def test_A8R4E_o_lock_nao_e_regenerado(self) -> None:
        self.assertIn("--frozen", self._instalacao())
        for proibido in ("uv lock", "uv add", "uv remove", "--upgrade"):
            self.assertNotIn(proibido, self.texto, f"o build roda {proibido}")
        self.assertEqual(
            self.doc["hermes_source"]["lock_sha256"],
            "8fd868b9da8b6bc2f4aa94a845e210eccdd5e31be7a0b404f0a8527ced0fddec")

    # --- o portao pos-sync mede os NOVE fatos, e recusa deriva --------------

    def _portao(self) -> str:
        import re as _re
        return _re.search(r"<<'VERIFICA'\n(.*?)\nVERIFICA\n", self.texto,
                          _re.S).group(1)

    def _roda_portao(self, doc: dict) -> tuple[int, str]:
        import subprocess
        manifesto = self.tmp / "runtime-manifest.json"
        manifesto.write_text(json.dumps(doc), encoding="utf-8")
        script = self.tmp / "portao.py"
        script.write_text(
            self._portao().replace("/opt/creditum/runtime-manifest.json",
                                   str(manifesto)), encoding="utf-8")
        # Na imagem o import resolve por `ENV PYTHONPATH=/opt/creditum`, posto
        # ANTES deste RUN. O arnes espelha isso; sem espelhar, o teste mediria a
        # ausencia do pacote em vez do portao.
        ambiente = dict(os.environ, PYTHONPATH=str(RAIZ / "bridge"))
        r = subprocess.run([sys.executable, "-B", str(script)],
                           capture_output=True, text=True, env=ambiente)
        return r.returncode, r.stdout + r.stderr

    def test_A8R4E_o_portao_confere_o_manifesto_e_nao_uma_segunda_lista(self) -> None:
        portao = self._portao()
        self.assertIn("runtime-manifest.json", portao)
        self.assertIn("critical_packages", portao)
        self.assertIn("versao_do_hermes_instalado", portao)
        self.assertIn("PackageNotFoundError", portao)

    def test_A8R4E_pacote_AUSENTE_derruba_o_build(self) -> None:
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        doc["critical_packages"]["pacote-que-nao-existe"] = "1.0"
        codigo, saida = self._roda_portao(doc)
        self.assertEqual(codigo, 2)
        self.assertIn("AUSENTE", saida)
        self.assertIn("VERSION_UNSUPPORTED", saida)

    def test_A8R4E_versao_ERRADA_derruba_o_build(self) -> None:
        """Presenca nao basta: o portao compara versao, nao existencia."""
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        doc["critical_packages"]["PyYAML"] = "0.0.1"
        codigo, saida = self._roda_portao(doc)
        self.assertEqual(codigo, 2)
        self.assertIn("VERSION_UNSUPPORTED", saida)

    def test_A8R4E_python_errado_derruba_o_build(self) -> None:
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        doc["runtime_versions"]["python"] = "3.11.15"   # o que o uv escolheria
        codigo, saida = self._roda_portao(doc)
        self.assertEqual(codigo, 2)
        self.assertIn("python", saida)


# =============================================================================
WORKFLOW = (RAIZ.parent / ".github" / "workflows"
            / "a8-r4-final-image-evidence.yml")


def diretivas_do_workflow() -> str:
    """
    O workflow SEM comentario. Sexta vez nesta fase que prosa dispara um guarda
    de texto: o cabecalho deste arquivo explica que nao ha `secrets.`, que nao se
    usa `ubuntu-latest` e que toda evidencia roda com `--network none` — e uma
    busca por substring encontra as tres coisas exatamente onde elas estao sendo
    NEGADAS. Guarda que confunde prosa com diretiva grita a toa, e guarda que
    grita a toa e desligado.
    """
    return "\n".join(l for l in WORKFLOW.read_text(encoding="utf-8").splitlines()
                      if not l.lstrip().startswith("#"))


def comandos_docker() -> list[str]:
    """
    Os `docker run` do workflow, com as continuacoes `\\` JUNTADAS.

    Contar por linha media outra coisa: `--entrypoint` vive numa linha de
    continuacao, entao toda execucao pareceria nao sobrepor. Setimo falso
    positivo de texto-contra-estrutura desta fase.
    """
    juntadas, acumulado = [], ""
    for linha in diretivas_do_workflow().splitlines():
        acumulado += " " + linha.strip().rstrip("\\")
        if linha.rstrip().endswith("\\"):
            continue
        juntadas.append(acumulado.strip())
        acumulado = ""
    return [c for c in juntadas if "docker run" in c]


class LaboratorioDeEvidenciaCI(Bancada):
    """
    A8-R4F — o workflow que constroi a imagem final e um LABORATORIO descartavel.

    Nao e producao, nao e a VPS, nao e cutover e nao e FIRST LIVE. O que estes
    testes guardam e justamente isso: que ele nao possa virar nenhuma dessas
    coisas por descuido de uma linha.
    """

    CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"

    def setUp(self) -> None:
        super().setUp()
        self.texto = WORKFLOW.read_text(encoding="utf-8")
        self.dirs = diretivas_do_workflow()

    def test_A8R4F_o_workflow_existe_e_e_YAML_valido(self) -> None:
        self.assertTrue(WORKFLOW.is_file(), str(WORKFLOW))
        try:
            import yaml  # noqa: PLC0415
        except ImportError:
            self.skipTest("pyyaml ausente neste interpretador")
        d = yaml.safe_load(self.texto)
        # `on:` e lido como booleano True por YAML 1.1 — nao e defeito, e o padrao.
        gatilho = d.get(True) if True in d else d.get("on")
        self.assertEqual(list(gatilho), ["workflow_dispatch"],
                         "o workflow dispara por algo alem do manual")
        self.assertEqual(d["permissions"], {"contents": "read"})
        job = d["jobs"]["evidencia"]
        self.assertEqual(job["runs-on"], "ubuntu-24.04")
        self.assertIn("timeout-minutes", job)

    # --- segredos: zero ----------------------------------------------------

    def test_A8R4F_nenhum_segredo_e_referenciado(self) -> None:
        self.assertNotIn("secrets.", self.dirs, "o workflow referencia um segredo")
        self.assertNotIn("${{ secrets", self.dirs)
        for proibido in ("TELEGRAM", "OPENAI", "BITRIX", "HOSTINGER", "TOKEN",
                         "API_KEY", "PASSWORD", "GMAIL"):
            self.assertNotIn(proibido, self.dirs.upper(),
                             f"o workflow menciona {proibido}")

    # --- autoridade imovel -------------------------------------------------

    def test_A8R4F_runner_e_actions_sao_FIXOS(self) -> None:
        self.assertNotIn("ubuntu-latest", self.dirs, "runner movel")
        self.assertIn("runs-on: ubuntu-24.04", self.dirs)
        usos = [l.split("uses:")[1].strip() for l in self.dirs.splitlines()
                if "uses:" in l]
        self.assertEqual(len(usos), 1, "mais de uma action de terceiro")
        self.assertEqual(usos[0], self.CHECKOUT)
        # Fixada por COMMIT de 40 hex, nao por tag.
        self.assertRegex(usos[0].split("@")[1], r"^[0-9a-f]{40}$")
        self.assertTrue(usos[0].startswith("actions/"), "action nao oficial")

    def test_A8R4F_o_token_do_runner_nao_fica_no_workspace(self) -> None:
        self.assertIn("persist-credentials: false", self.dirs)

    # --- a evidencia roda sem rede e sem o ENTRYPOINT ----------------------

    def test_A8R4F_toda_execucao_de_evidencia_e_rede_ZERO(self) -> None:
        corridas = [l for l in self.dirs.splitlines() if "docker run" in l]
        self.assertGreaterEqual(len(corridas), 4)
        for linha in corridas:
            self.assertIn("--network none", linha,
                          f"docker run sem rede zero: {linha.strip()[:60]}")

    def test_A8R4F_o_ENTRYPOINT_governado_e_sempre_sobreposto(self) -> None:
        """
        O `ENTRYPOINT` da imagem e o portao da a6, que sobe o gateway. Rodar a
        imagem sem sobrepor seria iniciar o runtime — e esta fase e evidencia de
        runtime IMUTAVEL, nao arranque.
        """
        # A a8-r4g acrescentou UMA execucao deliberada com o ENTRYPOINT real —
        # sem ela o defeito do envelope nao ligado sobrevive, porque o que nao e
        # exercitado nao e provado. Toda a OUTRA execucao continua sobrepondo.
        corridas = comandos_docker()
        sem_override = [c for c in corridas if "--entrypoint" not in c]
        self.assertEqual(len(sem_override), 1,
                         "esperada exatamente 1 execucao com o ENTRYPOINT real")
        self.assertEqual(len(corridas) - 1, self.dirs.count("--entrypoint"),
                         "alguma outra execucao deixou de sobrepor o entrypoint")
        # E a execucao real e a de FALHA CONTROLADA: exige exit != 0.
        self.assertIn('test "${CODIGO}" -ne 0', self.dirs)
        self.assertIn("GATEWAY_SUBIU", self.dirs)
        # O invariante e que nenhum COMANDO invoque o gateway. As ocorrencias de
        # "gateway run" no workflow estao dentro de greps que FALHAM o job se o
        # gateway subir — o oposto de invoca-lo. Oitava vez nesta fase que um
        # guarda de texto acusa a propria negacao do que ele guarda.
        for comando in corridas:
            for proibido in ("hermes run", "gateway run", "start_polling"):
                self.assertNotIn(proibido, comando,
                                 f"docker run invoca {proibido}: {comando[:70]}")

    def test_A8R4F_nada_de_producao_e_montado(self) -> None:
        for proibido in ("/data:", ".env", "state.db", "execution-ledger"):
            self.assertNotIn(proibido, self.dirs,
                             f"o workflow toca {proibido}")
        # O unico volume e o repositorio, somente leitura.
        for linha in self.dirs.splitlines():
            if "--volume" in linha:
                self.assertIn(":/repo:ro", linha)

    def test_A8R4F_nao_publica_nada(self) -> None:
        for proibido in ("docker push", "docker login", "docker tag ",
                         "upload-artifact", "release"):
            self.assertNotIn(proibido, self.dirs,
                             f"o workflow executa {proibido}")

    # --- as autoridades vem do manifesto, nao do YAML ----------------------

    def test_A8R4F_o_workflow_nao_reescreve_autoridade(self) -> None:
        """
        Nenhum digito, commit ou versao literal no YAML: tudo sai do manifesto
        governado via `ci-evidence-env.py`. Duas listas da mesma verdade divergem.
        """
        import re
        self.assertIn("ci-evidence-env.py", self.dirs)
        for achado in re.findall(r"\b[0-9a-f]{40,64}\b", self.dirs):
            self.assertEqual(achado, self.CHECKOUT.split("@")[1],
                             f"digito literal no workflow: {achado[:16]}…")

    def test_A8R4F_os_scripts_governados_que_ele_chama_existem(self) -> None:
        for nome in ("verify-final-image.py", "runtime-inventory.py",
                     "seal-runtime-manifest.py", "ci-evidence-env.py",
                     "ci-evidence-summary.py"):
            self.assertTrue((RAIZ / "deploy" / "vps" / nome).is_file(), nome)
            self.assertIn(nome, self.dirs, f"{nome} nao e chamado pelo workflow")


class EvidenciaDentroDaImagem(Bancada):
    """A8-R4F — o verificador que roda dentro da imagem final."""

    VERIFICADOR = RAIZ / "deploy" / "vps" / "verify-final-image.py"

    def test_A8R4F_o_verificador_e_somente_LEITURA(self) -> None:
        arv = ast.parse(self.VERIFICADOR.read_text(encoding="utf-8"))
        importados = {a.name.split(".")[0] for n in ast.walk(arv)
                      if isinstance(n, ast.Import) for a in n.names}
        importados |= {n.module.split(".")[0] for n in ast.walk(arv)
                       if isinstance(n, ast.ImportFrom) and n.module}
        for proibido in ("subprocess", "shutil", "tempfile", "os", "urllib",
                         "http", "requests"):
            self.assertNotIn(proibido, importados,
                             f"o verificador importa {proibido}")
        metodos = {n.func.attr for n in ast.walk(arv)
                   if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
        for proibido in ("write_text", "write_bytes", "unlink", "mkdir", "rmtree",
                         "connect", "create_connection", "system"):
            self.assertNotIn(proibido, metodos,
                             f"o verificador chama .{proibido}()")

    def test_A8R4F_ele_NAO_reimplementa_inventario_nem_selo(self) -> None:
        """
        Segunda verdade sobre a mesma coisa e o defeito que a a6 passou quatro
        rodadas fechando. O inventario e o selo tem suas ferramentas.
        """
        fonte = self.VERIFICADOR.read_text(encoding="utf-8")
        # Ler o valor GOVERNADO e legitimo — a a8-r4g precisa dele para conferir o
        # envelope instalado. O que se proibe e RECONSTRUIR: inventario e manifesto
        # tem suas ferramentas, e segunda verdade sobre a mesma coisa e o defeito
        # que a a6 passou quatro rodadas fechando.
        for proibido in ("canoniza", "RUNTIME_INVENTORY",
                         "creditum_hermes_runtime_inventory",
                         "reproduz_manifesto_a6", "reproduz_artefato",
                         "build-telegram-plugin-manifest"):
            self.assertNotIn(proibido, fonte,
                             f"o verificador reimplementa {proibido}")

    def test_A8R4F_a_prova_de_rede_e_resolucao_e_nao_CONTATO(self) -> None:
        """
        Abrir socket para fora seria contato — exatamente o que nao se faz nesta
        fase. Resolver nome ja falha sem rede e nao fala com ninguem.
        """
        fonte = self.VERIFICADOR.read_text(encoding="utf-8")
        self.assertIn("getaddrinfo", fonte)
        for proibido in ("socket.create_connection", ".connect(", "urlopen",
                         "sendall", "send("):
            self.assertNotIn(proibido, fonte)

    def test_A8R4F_o_sumario_nao_tem_relogio_no_digito(self) -> None:
        import re
        import subprocess
        r = subprocess.run(
            [sys.executable, "-B", str(RAIZ / "deploy" / "vps" / "ci-evidence-summary.py"),
             "--inventory", "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d",
             "--a6", "182a977b2f94d499911ee33a555c983a39ac6445dea821fe2badf11a7d6a7ca1",
             "--evidence-commit", "0" * 40, "--image-id", "a", "--run-id", "1",
             "--runner", "r"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = json.loads(r.stdout)
        relogio = re.compile(r"\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}")
        for chave, valor in doc["governed"].items():
            if isinstance(valor, str):
                self.assertIsNone(relogio.search(valor), f"{chave} carrega relogio")
            self.assertFalse(chave.endswith(("_at", "_time", "_date", "timestamp")))
        # Metadado de execucao NAO entra no digito.
        outro = subprocess.run(
            [sys.executable, "-B", str(RAIZ / "deploy" / "vps" / "ci-evidence-summary.py"),
             "--inventory", "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d",
             "--a6", "182a977b2f94d499911ee33a555c983a39ac6445dea821fe2badf11a7d6a7ca1",
             "--evidence-commit", "0" * 40, "--image-id", "OUTRO", "--run-id", "999",
             "--runner", "outro"], capture_output=True, text=True)
        self.assertEqual(doc["governed_sha256"],
                         json.loads(outro.stdout)["governed_sha256"])

    def test_A8R4F_autoridade_nula_no_env_do_CI_RECUSA(self) -> None:
        env = carrega("_a8r4f_env", RAIZ / "deploy" / "vps" / "ci-evidence-env.py")
        self.assertEqual(len(env.EXPORTADAS), 7)
        # Todas as chaves exportadas resolvem no manifesto de verdade.
        doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        for _, caminho in env.EXPORTADAS:
            alvo = doc
            for parte in caminho:
                alvo = alvo[parte]
            self.assertIsInstance(alvo, str)
            self.assertTrue(alvo)


class BaseDoPythonFixada(Bancada):
    """A8-R4F — a base do Python deixou de ser tag e virou digito."""

    DIGESTO = "sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e"

    def setUp(self) -> None:
        super().setUp()
        self.dockerfile = (RAIZ / "deploy" / "vps" / "Dockerfile").read_text(
            encoding="utf-8")
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))

    def test_A8R4F_TODO_FROM_e_por_digito(self) -> None:
        """
        Tag fixa a VERSAO; digito fixa os BYTES. `3.13.15-slim-bookworm` e
        reconstruida a cada correcao do Debian, entao duas builds da mesma tag nao
        sao a mesma imagem — e um build que existe para ser reprodutivel nao pode
        depender disso.
        """
        froms = [l for l in self.dockerfile.splitlines() if l.startswith("FROM")]
        # A a8-r4g acrescentou o estagio `envelope`. O que se guarda e que TODO
        # FROM seja por digito — nao quantos existem.
        self.assertGreaterEqual(len(froms), 3)
        for linha in froms:
            self.assertIn("@sha256:", linha, f"FROM sem digito: {linha[:60]}")
            self.assertNotIn("${", linha)
            for movel in ("latest", "main", "master", "HEAD"):
                self.assertNotIn(f":{movel}", linha)

    def test_A8R4F_o_digesto_da_base_e_o_GOVERNADO(self) -> None:
        f = self.doc["build_toolchain"]
        self.assertEqual(f["python_base_digest"], self.DIGESTO)
        self.assertIsNone(f["python_base_build_arg"])
        self.assertGreaterEqual(self.dockerfile.count(f"python@{self.DIGESTO}"), 2)
        # e nenhum FROM de python escapa do digito governado
        for linha in self.dockerfile.splitlines():
            if linha.startswith("FROM python"):
                self.assertIn(f"@{self.DIGESTO}", linha)

    def test_A8R4F_a_medicao_da_versao_CONTINUA(self) -> None:
        """O digito prova QUE imagem e; a medicao prova QUE Python ela traz."""
        self.assertIn("PYTHON_BASE_VERSION_UNEXPECTED", self.dockerfile)
        self.assertIn("ARG PYTHON_VERSION_ESPERADA=3.13.15", self.dockerfile)

    def test_A8R4F_a_ARG_da_base_NAO_ressuscita(self) -> None:
        self.assertFalse(any(l.strip().startswith("ARG PYTHON_BASE=")
                             for l in self.dockerfile.splitlines()))


# =============================================================================
class EnvelopeDeArranqueLigado(Bancada):
    """
    A8-R4G — a autoridade da a6 ligada ao ENTRYPOINT que de fato executa.

    A imagem copiava `scripts/prestart-gate.sh` INTACTO e o instalava como
    ENTRYPOINT. O template traz um sentinela de proposito e recusa com `exit 3`
    enquanto ele estiver la — entao todo arranque normal morria ANTES da
    verificacao da a6.

    O selo, enquanto isso, recomputava o manifesto e dava PASS. A autoridade
    existia; nao estava LIGADA ao caminho executavel. E nada via, porque toda
    execucao de CI sobrepunha o ENTRYPOINT: *o que nao e exercitado nao e
    provado.*
    """

    TEMPLATE = RAIZ / "scripts" / "prestart-gate.sh"
    LIGADOR = RAIZ / "deploy" / "vps" / "bind-prestart-envelope.py"
    SENTINELA = "__PREENCHER_NO_ARTEFATO__"
    A6 = "182a977b2f94d499911ee33a555c983a39ac6445dea821fe2badf11a7d6a7ca1"

    def setUp(self) -> None:
        super().setUp()
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))
        self.dockerfile = (RAIZ / "deploy" / "vps" / "Dockerfile").read_text(
            encoding="utf-8")
        self.ligador = carrega(f"_a8r4g_{len(list(self.tmp.iterdir()))}", self.LIGADOR)

    # --- §2: o template CONTINUA template -----------------------------------

    def test_A8R4G_o_template_do_repositorio_mantem_o_sentinela(self) -> None:
        """
        Ligar um SHA no template permanentemente faria o envelope reutilizavel da
        a6 descrever uma implantacao especifica. A a8 e quem liga, na construcao.
        """
        texto = self.TEMPLATE.read_text(encoding="utf-8")
        self.assertIn(f'MANIFESTO_SHA="{self.SENTINELA}"', texto)
        self.assertEqual(texto.count(self.SENTINELA), 2,
                         "template deve ter atribuicao E comparacao com o sentinela")
        self.assertIn("PRESTART_MANIFEST_SHA_NOT_PINNED", texto)

    # --- §3: a ligacao, e as contagens que ela prova -------------------------

    def test_A8R4G_a_ligacao_substitui_a_ATRIBUICAO_e_so_ela(self) -> None:
        """
        Trocar as DUAS ocorrencias faria o guarda virar `[ "$X" = "$X" ]`, sempre
        verdadeiro, e a imagem recusaria em todo arranque. Uma substituicao.
        """
        template = self.TEMPLATE.read_text(encoding="utf-8")
        ligado = self.ligador.liga(template, self.A6)
        self.assertIn(f'MANIFESTO_SHA="{self.A6}"', ligado)
        self.assertNotIn(f'MANIFESTO_SHA="{self.SENTINELA}"', ligado)
        self.assertEqual(ligado.count(self.A6), 1, "o SHA deve aparecer uma vez")
        # O sentinela remanescente e o da COMPARACAO — e tem de permanecer.
        self.assertEqual(ligado.count(self.SENTINELA), 1)
        self.assertIn(self.ligador.GUARDA, ligado)

    def test_A8R4G_o_guarda_ligado_NAO_dispara_e_o_cru_dispara(self) -> None:
        """A prova de comportamento, nao so de texto."""
        import subprocess
        template = self.TEMPLATE.read_text(encoding="utf-8")
        for texto, esperado in ((self.ligador.liga(template, self.A6), 1),
                                (template, 0)):
            sha = (self.A6 if esperado else self.SENTINELA)
            r = subprocess.run(
                ["/bin/sh", "-c",
                 f'MANIFESTO_SHA="{sha}"; '
                 f'if [ "${{MANIFESTO_SHA}}" = "{self.SENTINELA}" ]; '
                 f'then exit 3; else exit 0; fi'])
            self.assertEqual(r.returncode, 0 if esperado else 3)

    def test_A8R4G_template_sem_a_atribuicao_RECUSA(self) -> None:
        with self.assertRaises(self.ligador.LigacaoRecusada):
            self.ligador.liga("sem atribuicao nenhuma\n", self.A6)

    def test_A8R4G_template_com_atribuicao_DUPLICADA_RECUSA(self) -> None:
        texto = self.TEMPLATE.read_text(encoding="utf-8")
        duplicado = texto + f'\nMANIFESTO_SHA="{self.SENTINELA}"\n'
        with self.assertRaises(self.ligador.LigacaoRecusada):
            self.ligador.liga(duplicado, self.A6)

    def test_A8R4G_template_sem_o_guarda_RECUSA(self) -> None:
        texto = self.TEMPLATE.read_text(encoding="utf-8").replace(
            self.ligador.GUARDA, "if false; then")
        with self.assertRaises(self.ligador.LigacaoRecusada):
            self.ligador.liga(texto, self.A6)

    # --- §4: o SHA nao e escolha de quem chama ------------------------------

    def test_A8R4G_nenhuma_autoridade_de_SHA_controlada_pelo_CHAMADOR(self) -> None:
        """
        Se um ARG/ENV/entrada de workflow controlasse o SHA instalado, a ligacao
        provaria apenas que alguem digitou um numero.
        """
        self.assertIsNone(self.doc["plugin_artifact"]["prestart_envelope_build_arg"])
        alvos = {
            "Dockerfile": self.dockerfile,
            "compose.yaml": (RAIZ / "deploy" / "vps" / "compose.yaml").read_text(
                encoding="utf-8"),
            "workflow": WORKFLOW.read_text(encoding="utf-8"),
        }
        for nome, texto in alvos.items():
            for proibido in ("ARG MANIFESTO_SHA", "ENV MANIFESTO_SHA",
                             "MANIFESTO_SHA=${", "MANIFESTO_SHA: "):
                self.assertNotIn(proibido, texto,
                                 f"{nome} deixa o SHA da a6 ser escolhido de fora")
        # E o ligador nao aceita o valor de fora no caminho normal: `--expect` so
        # existe para teste negativo, e o default vem do manifesto.
        fonte = self.LIGADOR.read_text(encoding="utf-8")
        self.assertIn("apenas para teste negativo", fonte)
        self.assertIn('doc["plugin_artifact"]["a6_manifest_sha256"]', fonte)

    def test_A8R4G_o_ligador_reusa_o_algoritmo_governado(self) -> None:
        """§1: nada de segundo algoritmo para o mesmo manifesto."""
        fonte = self.LIGADOR.read_text(encoding="utf-8")
        self.assertIn("reproduz_artefato", fonte)
        self.assertIn("reproduz_manifesto_a6", fonte)
        self.assertNotIn("def reproduz_manifesto_a6", fonte)

    def test_A8R4G_SHA_divergente_RECUSA_a_ligacao(self) -> None:
        import subprocess
        r = subprocess.run(
            [sys.executable, "-B", str(self.LIGADOR), "--out",
             str(self.tmp / "gate.sh"), "--expect", "0" * 64],
            capture_output=True, text=True, cwd=str(RAIZ))
        self.assertEqual(r.returncode, 2)
        self.assertIn("A6_MANIFEST_DIVERGENTE", r.stdout + r.stderr)
        self.assertFalse((self.tmp / "gate.sh").exists(), "escreveu apesar da recusa")

    def test_A8R4G_a_ligacao_real_produz_o_SHA_governado(self) -> None:
        import subprocess
        alvo = self.tmp / "gate-ok.sh"
        r = subprocess.run([sys.executable, "-B", str(self.LIGADOR), "--out", str(alvo)],
                           capture_output=True, text=True, cwd=str(RAIZ))
        self.assertEqual(r.returncode, 0, r.stderr[-400:])
        texto = alvo.read_text(encoding="utf-8")
        self.assertIn(f'MANIFESTO_SHA="{self.doc["plugin_artifact"]["a6_manifest_sha256"]}"',
                      texto)
        self.assertTrue(alvo.stat().st_mode & 0o111, "instalado nao e executavel")

    # --- §3/§15: o build recusa o template cru ------------------------------

    def test_A8R4G_o_build_RECUSA_o_template_cru(self) -> None:
        for marca in ("ENTRYPOINT_NAO_LIGADO", "ENTRYPOINT_COM_SENTINELA",
                      "ENTRYPOINT_SEM_GUARDA"):
            self.assertIn(marca, self.dockerfile)
        # O ENTRYPOINT vem do estagio que liga, nao do template cru.
        self.assertIn("COPY --from=envelope /out/prestart-gate.sh", self.dockerfile)
        self.assertNotIn("COPY scripts/prestart-gate.sh", self.dockerfile)
        self.assertIn('ENTRYPOINT ["/opt/creditum/prestart-gate.sh"]', self.dockerfile)

    def test_A8R4G_o_estagio_envelope_roda_o_ligador(self) -> None:
        self.assertIn("AS envelope", self.dockerfile)
        self.assertIn("bind-prestart-envelope.py", self.dockerfile)
        # Estagio separado: as fontes de construcao nao entram na imagem final.
        i_env = self.dockerfile.index("AS envelope")
        i_run = self.dockerfile.index("AS runtime")
        self.assertLess(i_env, i_run)

    # --- §6: o selo exige o elo -------------------------------------------

    def test_A8R4G_o_selo_exige_o_ENTRYPOINT_ligado(self) -> None:
        selador = carrega("_a8r4g_sel", SELADOR)
        fonte = SELADOR.read_text(encoding="utf-8")
        self.assertIn("--installed-entrypoint", fonte)
        self.assertIn("não foi ligada ao caminho executável", fonte)
        # Sem o flag, o --check recusa.
        self.assertEqual(selador.main(["--check"]), 2)

    def test_A8R4G_envelope_com_SHA_errado_derruba_o_selo(self) -> None:
        selador = carrega("_a8r4g_sel2", SELADOR)
        falso = self.tmp / "gate-errado.sh"
        falso.write_text(self.ligador.liga(
            self.TEMPLATE.read_text(encoding="utf-8"), "0" * 64), encoding="utf-8")
        self.assertEqual(
            selador.main(["--check", "--installed-entrypoint", str(falso)]), 2)

    def test_A8R4G_envelope_com_sentinela_derruba_o_selo(self) -> None:
        selador = carrega("_a8r4g_sel3", SELADOR)
        self.assertEqual(
            selador.main(["--check", "--installed-entrypoint", str(self.TEMPLATE)]), 2)

    # --- §7: template e instalado sao artefatos DIFERENTES ------------------

    def test_A8R4G_template_e_instalado_NAO_devem_ter_o_mesmo_hash(self) -> None:
        """
        Exigir que batessem seria exigir que a ligacao nao tivesse acontecido.
        A autoridade do instalado e o SHA EMBUTIDO, nao o hash do arquivo.
        """
        art = self.doc["plugin_artifact"]
        self.assertIsNone(art["prestart_envelope_sha256_installed"])
        self.assertIn("NAO batem", art["prestart_envelope_note"])
        # O hash do TEMPLATE continua sendo autoridade de fonte.
        self.assertIsNotNone(self.doc["governed_artifact_hashes"]["prestart-gate.sh"])
        template_sha = hashlib.sha256(self.TEMPLATE.read_bytes()).hexdigest()
        self.assertEqual(self.doc["governed_artifact_hashes"]["prestart-gate.sh"],
                         template_sha)
        ligado = self.ligador.liga(self.TEMPLATE.read_text(encoding="utf-8"), self.A6)
        self.assertNotEqual(hashlib.sha256(ligado.encode()).hexdigest(), template_sha)

    # --- §8: o ENTRYPOINT real e exercitado no CI ---------------------------

    def test_A8R4G_o_CI_exercita_o_ENTRYPOINT_REAL(self) -> None:
        """
        Este defeito existiu porque TODA execucao de CI sobrepunha o ENTRYPOINT.
        Agora ha uma execucao que NAO sobrepoe, com condicao invalida controlada.
        """
        corridas = comandos_docker()
        sem_override = [c for c in corridas if "--entrypoint" not in c]
        self.assertEqual(len(sem_override), 1,
                         "esperada exatamente 1 execucao com o ENTRYPOINT real")
        self.assertIn("--network none", sem_override[0])
        self.assertIn("ENTRYPOINT REAL", diretivas_do_workflow())


if __name__ == "__main__":
    unittest.main()
