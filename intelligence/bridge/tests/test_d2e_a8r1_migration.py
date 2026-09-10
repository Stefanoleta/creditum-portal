"""
D2E-A8-R1 §16 — os artefatos de migração, testados localmente.

Sem Docker, sem Hostinger, sem segredo, sem rede. SQLite e livro-razão sintéticos.
"""
from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
VPS = RAIZ / "deploy" / "vps"
DOCKERFILE = VPS / "Dockerfile"
MANIFESTO_RUNTIME = VPS / "runtime-manifest.json"
COMMIT_ESPERADO = "e624e9fde561e1add9388384012b295fde669ade"


def carrega(nome: str, caminho: pathlib.Path):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


class Bancada(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="a8r1-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)


# ═════════════════════════════════════════════════════════════════════════════
class CadeiaDeSuprimento(unittest.TestCase):
    def setUp(self) -> None:
        self.texto = DOCKERFILE.read_text(encoding="utf-8")
        self.doc = json.loads(MANIFESTO_RUNTIME.read_text(encoding="utf-8"))

    def test_A8R1_1_o_commit_e_fixado_e_conferido(self) -> None:
        self.assertEqual(self.doc["hermes_source"]["commit"], COMMIT_ESPERADO)
        # 40 hex, e nada de ref móvel.
        self.assertRegex(COMMIT_ESPERADO, r"^[0-9a-f]{40}$")
        # O build recusa por FORMA antes de qualquer rede.
        self.assertIn("HERMES_COMMIT_NOT_FULL_SHA", self.texto)
        self.assertIn("HERMES_COMMIT_MUTABLE", self.texto)
        # E confere o HEAD real contra o pedido.
        self.assertIn("HERMES_COMMIT_MISMATCH", self.texto)
        self.assertIn("git rev-parse HEAD", self.texto)

    def test_A8R1_1b_nenhuma_autoridade_movel_em_diretiva(self) -> None:
        """
        `latest` só pode aparecer em prosa e em mensagem de erro — nunca numa
        diretiva. A primeira versão deste Dockerfile trazia
        `ghcr.io/astral-sh/uv:latest`, autoridade móvel no arquivo que existe para
        proibi-la.
        """
        for bruta in self.texto.splitlines():
            l = bruta.strip()
            if not l or l.startswith("#"):
                continue
            if l.split(" ")[0] in ("FROM", "COPY", "RUN", "ARG", "ADD"):
                for movel in (":latest", ":main", ":master"):
                    # `:?` de mensagem de erro não conta: é o texto da recusa.
                    sem_mensagem = l.split(":?")[0]
                    self.assertNotIn(movel, sem_mensagem, l[:90])

    def test_A8R1_1c_o_lock_e_autoridade_e_e_conferido(self) -> None:
        self.assertIn("HERMES_LOCK_SHA256_REQUIRED", self.texto)
        self.assertIn("HERMES_LOCK_SHA256_MISMATCH", self.texto)
        self.assertIn("sha256sum uv.lock", self.texto)
        self.assertIn("--frozen", self.texto, "uv sync sem --frozen resolve de novo")

    def test_A8R1_2_o_selo_recusa_manifesto_incompleto(self) -> None:
        selador = carrega("_selo", VPS / "seal-runtime-manifest.py")
        # A r6 provou o lock contra o staging genuíno e a r4a adotou o inventário
        # governado, então os dois saíram do nulo. O que faz o `--check` recusar
        # aqui é outra coisa, e mais forte: sem `--runtime-root` o inventário não
        # é OBSERVADO, e campo declarado não é autoridade.
        self.assertIsNotNone(self.doc["hermes_source"]["lock_sha256"])
        self.assertIsNotNone(self.doc["hermes_source"]["runtime_inventory_sha256"])
        self.assertEqual(selador.main(["--check"]), 2)

    def test_A8R1_2b_os_paths_governados_estao_no_manifesto(self) -> None:
        g = self.doc["governed_paths"]
        self.assertEqual(g["hermes_home"], "/data")
        self.assertEqual(g["workdir"], "/opt/hermes-agent")
        self.assertEqual(g["project_plugin_root"], "/opt/hermes-agent/.hermes/plugins")
        self.assertEqual(g["execution_ledger_root"],
                         "/data/creditum_hermes_runtime/execution-ledger/v1")
        self.assertEqual(g["archive_only"], ["/data/creditum_hermes_runtime/r6_r6"])
        self.assertEqual(self.doc["entrypoint_groups_checked"],
                         ["hermes_agent.plugins", "hermes_agent.plugin_capabilities"])
        self.assertIs(self.doc["contains_secrets"], False)


# ═════════════════════════════════════════════════════════════════════════════
class ExportacaoDoStateDb(Bancada):
    def setUp(self) -> None:
        super().setUp()
        self.mod = carrega("_export", VPS / "export-state-db.py")
        self.origem = self.tmp / "state.db"
        c = sqlite3.connect(self.origem)
        c.execute("PRAGMA journal_mode=delete")
        c.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY, blob TEXT)")
        c.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, texto TEXT)")
        c.executemany("INSERT INTO messages (texto) VALUES (?)",
                      [(f"conteudo sensivel {i}",) for i in range(40)])
        c.commit()
        c.close()

    def test_A8R1_3_backup_consistente_e_origem_intocada(self) -> None:
        antes = self.origem.read_bytes()
        r = self.mod.exporta(self.origem, self.tmp / "backup.db")
        self.assertEqual(r["quick_check"], "ok")
        self.assertEqual(r["table_count"], 2)
        self.assertEqual(r["tables"], ["messages", "sessions"])
        self.assertEqual(self.origem.read_bytes(), antes, "a origem mudou")

    def test_A8R1_3b_nenhum_conteudo_de_aplicacao_e_lido(self) -> None:
        """
        ESTRUTURAL: o único SQL do script é metadado de esquema. Sem `SELECT` em
        tabela de aplicação, mensagem e sessão não têm por onde vazar.
        """
        import ast
        arv = ast.parse((VPS / "export-state-db.py").read_text(encoding="utf-8"))
        # ARGUMENTO de `execute()`, não literal solto no arquivo. A primeira versão
        # varria toda constante string e acusou o DOCSTRING do módulo, que menciona
        # `SELECT` em prosa ao explicar que não faz `SELECT`. Prosa não executa.
        executados: list[str] = []
        for n in ast.walk(arv):
            if (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                    and n.func.attr == "execute" and n.args):
                arg = n.args[0]
                if isinstance(arg, ast.Constant) and type(arg.value) is str:
                    executados.append(arg.value)
                elif isinstance(arg, ast.Name):
                    # Constante de módulo: resolve o literal dela.
                    for atrib in ast.walk(arv):
                        if (isinstance(atrib, ast.Assign)
                                and any(isinstance(x, ast.Name) and x.id == arg.id
                                        for x in atrib.targets)
                                and isinstance(atrib.value, ast.Constant)):
                            executados.append(atrib.value.value)
                else:
                    self.fail(f"SQL não literal em execute(): {ast.dump(arg)[:60]}")
        self.assertTrue(executados, "nenhum SQL encontrado")
        for sql in executados:
            alto = sql.upper()
            if "SELECT" in alto:
                self.assertIn("SQLITE_MASTER", alto, f"SQL de aplicação: {sql}")
            else:
                self.assertIn("QUICK_CHECK", alto, f"PRAGMA inesperado: {sql}")

    def test_A8R1_3c_origem_corrompida_RECUSA_e_nao_deixa_destino(self) -> None:
        ruim = self.tmp / "ruim.db"
        ruim.write_bytes(os.urandom(512))
        destino = self.tmp / "b.db"
        with self.assertRaises(self.mod.ExportacaoRecusada) as c:
            self.mod.exporta(ruim, destino)
        self.assertEqual(c.exception.defeito, "BACKUP_FAILED")
        self.assertFalse(destino.exists(), "deixou destino de backup falho")

    def test_A8R1_3d_destino_existente_RECUSA(self) -> None:
        destino = self.tmp / "ja.db"
        destino.write_bytes(b"nao sobrescrever")
        with self.assertRaises(self.mod.ExportacaoRecusada) as c:
            self.mod.exporta(self.origem, destino)
        self.assertEqual(c.exception.defeito, "DEST_EXISTS")
        self.assertEqual(destino.read_bytes(), b"nao sobrescrever")

    def test_A8R1_3e_origem_symlink_RECUSA(self) -> None:
        link = self.tmp / "link.db"
        os.symlink(str(self.origem), str(link))
        with self.assertRaises(self.mod.ExportacaoRecusada) as c:
            self.mod.exporta(link, self.tmp / "b2.db")
        self.assertEqual(c.exception.defeito, "SOURCE_IS_SYMLINK")

    def test_A8R1_3f_a_conexao_de_origem_e_somente_leitura(self) -> None:
        con = self.mod.abre_somente_leitura(self.origem)
        try:
            with self.assertRaises(sqlite3.OperationalError):
                con.execute("CREATE TABLE intruso (x INT)")
        finally:
            con.close()


# ═════════════════════════════════════════════════════════════════════════════
class MigracaoDoLivroRazao(Bancada):
    def setUp(self) -> None:
        super().setUp()
        self.mod = carrega("_ledger", VPS / "migrate-execution-ledger.py")
        self.origem = self.tmp / "v1"
        (self.origem / "attempts" / "tg-aaa").mkdir(parents=True)
        (self.origem / "attempts" / "tg-bbb").mkdir(parents=True)
        (self.origem / "attempts" / "tg-aaa" / "reservation.json").write_text(
            '{"record_type":"creditum_live_execution_reservation/v1"}', encoding="utf-8")
        (self.origem / "attempts" / "tg-aaa" / "commit.json").write_text(
            '{"record_type":"creditum_live_execution_commit/v1"}', encoding="utf-8")
        # Reserva EM VOO: `mkdir` já aconteceu, `reservation.json` ainda não.
        (self.origem / "attempts" / "tg-ccc").mkdir()

    def test_A8R1_4_S1_igual_S2_igual_D(self) -> None:
        r = self.mod.migra(self.origem, self.tmp / "destino")
        self.assertEqual(r["attempt_dirs"], 3)
        # DOIS arquivos: `tg-aaa` tem reserva e commit, `tg-bbb` e `tg-ccc` são
        # diretórios sem arquivo. A primeira versão dizia 3 — a bancada é que estava
        # descrita errada na asserção, não o código.
        self.assertEqual(r["files"], 2)
        s1 = self.mod.manifesto(self.origem)
        d = self.mod.manifesto(self.tmp / "destino")
        self.assertEqual(s1, d)

    def test_A8R1_4b_reserva_EM_VOO_e_capturada(self) -> None:
        """
        `attempts/<chave>/` vazio já É uma reserva: o `mkdir` é a reserva, e o
        `reservation.json` vem depois. Instantâneo que só listasse arquivos perderia
        exatamente as reservas em voo — e perder reserva é permitir repetição.
        """
        m = self.mod.manifesto(self.origem)
        self.assertEqual(m[os.path.join("attempts", "tg-ccc")][0], "dir")
        self.mod.migra(self.origem, self.tmp / "destino")
        self.assertTrue((self.tmp / "destino" / "attempts" / "tg-ccc").is_dir())

    def test_A8R1_4c_deriva_da_ORIGEM_durante_a_copia_RECUSA(self) -> None:
        """S1 != S2. Simulado interceptando a cópia para mexer na origem no meio."""
        original = self.mod.copia
        origem, mod = self.origem, self.mod

        def copia_e_mexe(o, d, m):  # noqa: ANN001, ANN202
            original(o, d, m)
            # Nova reserva aparece: é isto que a comparação tem de pegar.
            (origem / "attempts" / "tg-novo").mkdir()

        mod.copia = copia_e_mexe
        self.addCleanup(lambda: setattr(mod, "copia", original))
        with self.assertRaises(mod.ArtefatoRecusado if hasattr(mod, "ArtefatoRecusado")
                               else mod.MigracaoRecusada) as c:
            mod.migra(self.origem, self.tmp / "destino")
        self.assertTrue(any("ORIGEM mudou" in m for m in c.exception.motivos),
                        c.exception.motivos)
        # E o destino parcial foi DESCARTADO: árvore com aparência de válida é pior
        # que árvore nenhuma.
        self.assertFalse((self.tmp / "destino").exists(), "deixou destino parcial")

    def test_A8R1_4d_livro_razao_ausente_RECUSA(self) -> None:
        with self.assertRaises(self.mod.MigracaoRecusada) as c:
            self.mod.migra(self.tmp / "nao-existe", self.tmp / "d")
        self.assertTrue(any("ausente" in m for m in c.exception.motivos))

    def test_A8R1_4e_attempts_ausente_RECUSA(self) -> None:
        vazio = self.tmp / "vazio"
        vazio.mkdir()
        with self.assertRaises(self.mod.MigracaoRecusada) as c:
            self.mod.migra(vazio, self.tmp / "d2")
        self.assertTrue(any("attempts" in m for m in c.exception.motivos))

    def test_A8R1_4f_symlink_na_origem_RECUSA(self) -> None:
        """A d2b valida com `lstat` no-follow: link em `attempts` invalida tudo."""
        fora = self.tmp / "fora"
        fora.mkdir()
        os.symlink(str(fora), str(self.origem / "attempts" / "tg-link"))
        with self.assertRaises(self.mod.MigracaoRecusada) as c:
            self.mod.migra(self.origem, self.tmp / "d3")
        self.assertTrue(any("symlink" in m for m in c.exception.motivos))

    def test_A8R1_4g_destino_existente_RECUSA(self) -> None:
        destino = self.tmp / "ja"
        destino.mkdir()
        with self.assertRaises(self.mod.MigracaoRecusada) as c:
            self.mod.migra(self.origem, destino)
        self.assertTrue(any("já existe" in m for m in c.exception.motivos))

    def test_A8R1_4h_o_destino_tem_diretorios_REAIS(self) -> None:
        self.mod.migra(self.origem, self.tmp / "destino")
        d = self.tmp / "destino"
        for p in (d, d / "attempts", d / "attempts" / "tg-aaa"):
            self.assertTrue(p.is_dir())
            self.assertFalse(p.is_symlink(), f"{p} é symlink")
        # E a contenção canônica que a d2b exige: `attempts` é filho DIRETO da raiz.
        self.assertEqual(
            os.path.relpath(os.path.realpath(d / "attempts"), os.path.realpath(d)),
            "attempts")


# ═════════════════════════════════════════════════════════════════════════════
class ArtefatoDePluginEProva(Bancada):
    def setUp(self) -> None:
        super().setUp()
        from tests.test_d2e_telegram_adapter import desinstala_hermes, instala_hermes
        instala_hermes()
        self.addCleanup(desinstala_hermes)
        self.montador = carrega("_montador", VPS / "assemble-plugin-artifact.py")
        self.artefato = self.tmp / "creditum-telegram-governed"
        self.assertEqual(self.montador.main(["--out", str(self.artefato)]), 0)

    ESPERADO = [
        "__init__.py",
        "creditum_hermes_telegram/__init__.py",
        "creditum_hermes_telegram/adapter.py",
        "creditum_hermes_telegram/compat.py",
        "creditum_hermes_telegram/ingress.py",
        "creditum_hermes_telegram/planning.py",
        "plugin.yaml",
    ]

    def test_A8R1_6_a_estrutura_e_exatamente_a_do_formato_de_diretorio(self) -> None:
        reais = sorted(
            str(p.relative_to(self.artefato)).replace(os.sep, "/")
            for p in self.artefato.rglob("*") if p.is_file())
        self.assertEqual(reais, self.ESPERADO)

    def test_A8R1_6b_a_casca_NAO_reimplementa_a_a4(self) -> None:
        """
        §6: nada de segunda implementação. A casca delega, e é só isso que ela faz.
        """
        import ast
        arv = ast.parse((self.artefato / "__init__.py").read_text(encoding="utf-8"))
        fn = next(n for n in ast.walk(arv)
                  if isinstance(n, ast.FunctionDef) and n.name == "register")
        chamadas = {n.func.id for n in ast.walk(fn)
                    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
        self.assertIn("register_governado", chamadas)
        # E o pacote governado é byte-idêntico ao embarcado.
        for rel in self.ESPERADO:
            if not rel.startswith("creditum_hermes_telegram/"):
                continue
            no_artefato = (self.artefato / rel).read_bytes()
            embarcado = (RAIZ / "bridge" / rel).read_bytes()
            self.assertEqual(no_artefato, embarcado, rel)

    def test_A8R1_6c_o_sumidouro_NAO_planeja_nem_executa(self) -> None:
        """
        Planejar dentro do sumidouro faria uma mensagem do Telegram disparar
        derivação canônica automática — e automática é meio caminho para execução
        automática.
        """
        import ast
        arv = ast.parse((self.artefato / "__init__.py").read_text(encoding="utf-8"))
        nomes = {n.attr for n in ast.walk(arv) if isinstance(n, ast.Attribute)}
        nomes |= {n.id for n in ast.walk(arv) if isinstance(n, ast.Name)}
        for proibido in ("build_production_candidate", "plan_from_admitted_ingress",
                         "render_production_telegram_authorization",
                         "confere_plano_contra_material"):
            self.assertNotIn(proibido, nomes, f"a casca chama {proibido}")

    def test_A8R1_7_o_manifesto_da_a6_e_gerado_contra_ESTE_artefato(self) -> None:
        import subprocess
        cfg = self.tmp / "config.yaml"
        cfg.write_text(json.dumps({"plugins": {"enabled": ["telegram-platform"]}}),
                       encoding="utf-8")
        proj = self.tmp / "project-plugins"
        proj.mkdir()
        saida = self.tmp / "MANIFEST.json"
        r = subprocess.run(
            [sys.executable, "-B", str(RAIZ / "scripts" /
                                       "build-telegram-plugin-manifest.py"),
             "--plugin-tree", str(self.artefato),
             "--source-commit", "b" * 40,
             "--plugin-root", "/data/plugins/creditum-telegram-governed",
             "--plugin-version", "1.0.0", "--artifact-version", "1.0.0",
             "--config-path", str(cfg), "--precedence-path", str(proj),
             "--out", str(saida)],
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[:600])
        doc = json.loads(saida.read_text(encoding="utf-8"))
        self.assertEqual(doc["plugin_key"], "telegram-platform")
        self.assertEqual(doc["plugin_kind"], "platform")
        self.assertEqual(doc["runtime_platform"], "telegram")
        # §11/§18: v1 certificava o contrato de UM chamador nativo, que o Hermes
        # genuíno refutou. O manifesto deriva o id dos bytes aprovados, então
        # regenerar contra o artefato corrigido já traz v2 — sem tocar a a6.
        self.assertEqual(doc["adapter_compat_id"],
                         "creditum_telegram_adapter_compat/0.20.4/v2")
        self.assertEqual(doc["file_count"], len(self.ESPERADO))
        self.assertEqual(
            sorted(e["relative_path"].replace(os.sep, "/")
                   for e in doc["plugin_files"]), self.ESPERADO)

    def test_A8R1_8_a_auditoria_estatica_aprova_a_via_de_registro(self) -> None:
        sonda = carrega("_sonda_a", VPS / "probe-plugin-winner.py")
        self.assertEqual(sonda.audita_via_de_registro(self.artefato), [])

    def test_A8R1_9_sem_hermes_GENUINO_a_sonda_recusa_o_veredito(self) -> None:
        """
        A r1 esperava 0. A r2 mudou para 3, porque a chave não é mensurável sem o
        Hermes genuíno. A r6 mantém o 3 e move o portão para ANTES do registro:
        registrar contra um dublê e só então perguntar se o Hermes era real convida
        a reportar o que se mediu no dublê.
        """
        sonda = carrega("_sonda_b", VPS / "probe-plugin-winner.py")
        self.assertIsNone(sonda.hermes_real_instalado())
        self.assertEqual(sonda.main(["--artifact", str(self.artefato)]), 3)

    def test_A8R1_9b_a_sonda_nao_fabrica_um_contexto_sem_hermes(self) -> None:
        """
        Não há mais `ContextoContado`. A via de registro só existe contra o
        `PluginContext` genuíno, e sem o Hermes instalado a construção FALHA — o que
        é o desfecho certo: um contexto inventado mediria a invenção.
        """
        sonda = carrega("_sonda_b2", VPS / "probe-plugin-winner.py")
        self.assertFalse(hasattr(sonda, "ContextoContado"))
        self.assertFalse(hasattr(sonda, "medir_chave"))
        with self.assertRaises(ImportError):
            sonda.contexto_genuino()

    def test_A8R1_10_zero_adaptador_zero_polling_zero_provedor(self) -> None:
        """
        §10 — provado ESTRUTURALMENTE, que é mais forte do que um contador que só vê
        a execução observada. A auditoria estática enumera o que a via de registro
        pode tocar no contexto do plugin, e recusa qualquer outra coisa.
        """
        sonda = carrega("_sonda_c", VPS / "probe-plugin-winner.py")
        self.assertEqual(sonda.audita_via_de_registro(self.artefato), [])
        self.assertEqual(sonda.ATRIBUTOS_PERMITIDOS_NO_CONTEXTO,
                         frozenset({"register_platform"}))
        for proibida in ("create_adapter", "connect", "start_polling",
                         "get_updates", "send_message", "create_task"):
            self.assertIn(proibida, sonda.PROIBIDAS_NA_VIA)

    def test_A8R1_10b_registrar_sem_hermes_RECUSA_e_nao_produz_ingresso(self) -> None:
        """
        A via é fechada por compatibilidade, não por ausência de chamador.

        A ausência é GARANTIDA aqui, não presumida: outra suíte do mesmo processo
        instala o dublê do Hermes, e depender da ordem dos testes faria este teste
        medir o dublê e passar pelo motivo errado.
        """
        from tests.test_d2e_telegram_adapter import desinstala_hermes
        desinstala_hermes()
        sys.path.insert(0, str(self.artefato))
        self.addCleanup(lambda: sys.path.remove(str(self.artefato)))
        spec = importlib.util.spec_from_file_location(
            "_plug_teste", self.artefato / "__init__.py")
        plugin = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        sys.modules["_plug_teste"] = plugin
        self.addCleanup(lambda: sys.modules.pop("_plug_teste", None))
        spec.loader.exec_module(plugin)  # type: ignore[union-attr]

        from creditum_hermes_telegram.compat import CompatRefusal
        with self.assertRaises(CompatRefusal) as c:
            plugin.register(object())
        self.assertEqual(c.exception.defect, "HERMES_NOT_IMPORTABLE")
        self.assertEqual(plugin.drain_admitted_ingress(), [])


# ═════════════════════════════════════════════════════════════════════════════
class G3ContinuaBloqueando(unittest.TestCase):
    RUNBOOK = VPS / "RUNBOOK.md"

    def test_A8R1_14_o_runbook_proibe_ativar_o_poller_sem_G3(self) -> None:
        texto = self.RUNBOOK.read_text(encoding="utf-8")
        self.assertIn("G3_NOT_PROVEN", texto)
        self.assertIn("NÃO é executável ainda", texto)
        self.assertIn("exatamente um consumidor", texto)
        self.assertIn("Nunca os dois", texto)

    def test_A8R1_14b_nenhum_artefato_local_ativa_poller(self) -> None:
        """
        Nenhum script sob `deploy/vps/` contata Telegram nem sobe o gateway.

        ─── Conferido por CHAMADA, não por menção ───────────────────────────────

        Três versões deste teste falharam por falso positivo de texto: a docstring da
        sonda documenta `gateway run` ao explicar que não o chama, e a lista de
        guarda dela NOMEIA `start_polling` para proibi-lo. Nomear a chamada proibida
        num guarda é o oposto de chamá-la.

        O invariante real, e o que se mede aqui: nenhum destes scripts IMPORTA rede
        ou processo, e nenhum CHAMA função de efeito. Não há como chamar o que não se
        importa, e a lista de guarda vira dado, não código executado.
        """
        import ast
        for alvo in sorted(VPS.glob("*.py")):
            arv = ast.parse(alvo.read_text(encoding="utf-8"))

            importados = {n.module.split(".")[0] for n in ast.walk(arv)
                          if isinstance(n, ast.ImportFrom) and n.module}
            importados |= {a.name.split(".")[0] for n in ast.walk(arv)
                           if isinstance(n, ast.Import) for a in n.names}
            for proibido in ("telegram", "openai", "requests", "httpx", "aiohttp",
                             "urllib", "socket", "http", "subprocess"):
                self.assertNotIn(proibido, importados,
                                 f"{alvo.name} importa {proibido}")

            chamados = set()
            for n in ast.walk(arv):
                if isinstance(n, ast.Call):
                    f = n.func
                    nome = (f.id if isinstance(f, ast.Name)
                            else f.attr if isinstance(f, ast.Attribute) else None)
                    if nome:
                        chamados.add(nome)
            for proibido in ("start_polling", "run_polling", "get_updates",
                             "send_message", "create_adapter", "urlopen", "Popen",
                             "check_output", "system"):
                self.assertNotIn(proibido, chamados,
                                 f"{alvo.name} CHAMA {proibido}()")

if __name__ == "__main__":
    unittest.main()


class ChaveDoRegistro(Bancada):
    """
    A4-R6 §13/§14 — a chave é LIDA do `PlatformRegistry`, ou o veredito recusa.

    Três rodadas para chegar aqui, e vale registrar o caminho:

      a8-r1 reportava PASS com a chave INFERIDA da herança, e punha a ressalva num
      rodapé. Quem lê "PASS" não lê rodapé.

      a8-r2 tirou o PASS, mas media varrendo o grafo de atributos de um contexto
      dublado — porque a API real ainda não havia sido observada.

      a8-r3 observou: o Hermes NÃO deriva a chave de nada. `entries[entry.name]`,
      verbatim. A chave é ESCOLHIDA por quem registra. Aí varrer grafo deixou de ser
      a melhor evidência disponível e passou a ser a pior.

    Estes testes exercitam a leitura contra um DUBLÊ FIEL da API que a a8-r3 mediu.
    O caminho felizardo é provado no staging genuíno, onde a chave lida é `telegram`;
    aqui se prova o que o staging não consegue provar deterministicamente — cada modo
    de RECUSA.
    """

    ESCOPO = "/perfil/isolado/de/teste"

    def setUp(self) -> None:
        super().setUp()
        self.sonda = carrega("_sonda_r6", VPS / "probe-plugin-winner.py")

    # ── o dublê FIEL: a superfície que a a8-r3 mediu no Hermes 0.20.4 ────────
    def instala_registro(self, *, chaves, entrada, diferido=None):
        """
        Instala `gateway.platform_registry` com a forma REAL da 0.20.4.

        Substituir o ambiente, não parametrizar a produção — a mesma disciplina do
        dublê do Hermes na a4. E `all_entries`/`plugin_entries` LEVANTAM: os dois
        resolvem loaders diferidos no Hermes real, e a medição não pode importar
        vinte plugins de plataforma como efeito colateral de medir.
        """
        import types
        mod = types.ModuleType("gateway.platform_registry")
        prova = self

        class _Registro:
            def registered_names(self):
                return set(chaves)

            def snapshot_registration(self, nome, *, scope=None):
                prova.assertEqual(scope, prova.ESCOPO, "leu o escopo errado")
                return (entrada if nome == "telegram" else None, diferido)

            def all_entries(self):
                raise AssertionError("all_entries resolve loaders diferidos")

            def plugin_entries(self):
                raise AssertionError("plugin_entries resolve loaders diferidos")

        mod.platform_registry = _Registro()
        sys.modules.setdefault("gateway", types.ModuleType("gateway"))
        sys.modules["gateway.platform_registry"] = mod
        self.addCleanup(lambda: sys.modules.pop("gateway.platform_registry", None))

    def entrada(self, **over):
        """
        O `PlatformEntry` genuíno é um dataclass: os campos são de INSTÂNCIA.

        Montar o dublê com `type("PlatformEntry", (), campos)()` parecia equivalente e
        não é — uma função posta num dict de classe vira MÉTODO LIGADO ao ser lida
        pela instância, e a comparação de identidade da fábrica falhava por isso, não
        por defeito de produção. Um dublê infiel produz um defeito imaginário.
        """
        import types
        campos = {"name": "telegram", "label": "Telegram", "source": "plugin",
                  "plugin_name": self.sonda.NOME_DO_PLUGIN_GOVERNADO,
                  "adapter_factory": self.fabrica, "check_fn": lambda: True}
        campos.update(over)
        return types.SimpleNamespace(**campos)

    def governada(self, fabrica=None):
        return type("Gov", (), {"_creditum_adapter_factory": staticmethod(
            fabrica if fabrica is not None else self.fabrica)})

    @staticmethod
    def fabrica(config):  # noqa: ANN001, ANN205
        raise AssertionError("a medição NÃO constrói adaptador")

    def mede(self, **kw):
        self.instala_registro(**kw)
        return self.sonda.mede_o_registro(self.ESCOPO, self.governada())

    # ── o caminho bom ───────────────────────────────────────────────────────
    def test_R6_13_a_chave_e_LIDA_do_registro(self) -> None:
        medido, recusas = self.mede(chaves={"telegram"}, entrada=self.entrada())
        self.assertEqual(recusas, [])
        self.assertEqual(medido["chave_armazenada"], "telegram")
        self.assertEqual(medido["chaves_no_escopo"], ["telegram"])
        self.assertTrue(medido["fabrica_e_a_governada"])
        self.assertFalse(medido["loader_diferido_restante"])

    def test_R6_13b_a_medicao_nao_constroi_adaptador(self) -> None:
        """§14: identidade da fábrica basta. Construir teria efeito colateral —
        e a fábrica deste teste levanta se alguém a chamar."""
        _, recusas = self.mede(chaves={"telegram"}, entrada=self.entrada())
        self.assertEqual(recusas, [])

    # ── cada modo de RECUSA, que o staging não reproduz deterministicamente ──
    def test_R6_14_chave_AUSENTE_do_escopo_recusa(self) -> None:
        _, recusas = self.mede(chaves={"whatsapp"}, entrada=None)
        self.assertTrue(any("REGISTRY_KEY_ABSENT" in r for r in recusas), recusas)

    def test_R6_14b_entrada_NAO_armazenada_recusa(self) -> None:
        _, recusas = self.mede(chaves={"telegram"}, entrada=None)
        self.assertTrue(any("REGISTRY_ENTRY_NOT_STORED" in r for r in recusas), recusas)

    def test_R6_14c_chave_armazenada_DIFERENTE_recusa(self) -> None:
        _, recusas = self.mede(chaves={"telegram"},
                               entrada=self.entrada(name="whatsapp"))
        self.assertTrue(any("REGISTRY_KEY_UNEXPECTED" in r for r in recusas), recusas)

    def test_R6_14d_source_que_nao_e_plugin_recusa(self) -> None:
        _, recusas = self.mede(chaves={"telegram"},
                               entrada=self.entrada(source="builtin"))
        self.assertTrue(any("REGISTRY_SOURCE_UNEXPECTED" in r for r in recusas), recusas)

    def test_R6_14e_plugin_name_de_OUTRO_dono_recusa(self) -> None:
        _, recusas = self.mede(chaves={"telegram"},
                               entrada=self.entrada(plugin_name="telegram-platform"))
        self.assertTrue(any("REGISTRY_PLUGIN_NAME_UNEXPECTED" in r for r in recusas),
                        recusas)

    def test_R6_14f_fabrica_que_nao_e_a_governada_recusa(self) -> None:
        """O vencedor tem de ser a NOSSA entrada, não uma com a chave certa."""
        outra = staticmethod(lambda config: None)
        _, recusas = self.mede(chaves={"telegram"},
                               entrada=self.entrada(adapter_factory=outra))
        self.assertTrue(any("REGISTRY_FACTORY_NOT_GOVERNED" in r for r in recusas),
                        recusas)

    def test_R6_14g_loader_diferido_CONCORRENTE_recusa(self) -> None:
        """§14: nenhum concorrente em vigor. Diferido sobrevivente é concorrente."""
        _, recusas = self.mede(chaves={"telegram"}, entrada=self.entrada(),
                               diferido=lambda: None)
        self.assertTrue(any("COMPETING_DEFERRED_LOADER" in r for r in recusas), recusas)

    def test_R6_14h_a_medicao_le_o_ESCOPO_que_recebeu(self) -> None:
        """§10: registro escopado por HERMES_HOME. Ler o escopo errado daria
        'nenhuma chave' com o registro intacto — falso negativo que pareceria
        falha de produção. O dublê afirma o escopo recebido."""
        self.instala_registro(chaves={"telegram"}, entrada=self.entrada())
        with self.assertRaises(AssertionError):
            self.sonda.mede_o_registro("/outro/escopo", self.governada())

    # ── §19: a cadeia de suprimento, no estado que a r6 deixou ──────────────
    def test_R6_19_lock_sha256_PROVADO_e_selado(self) -> None:
        doc = json.loads((VPS / "runtime-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(
            doc["hermes_source"]["lock_sha256"],
            "8fd868b9da8b6bc2f4aa94a845e210eccdd5e31be7a0b404f0a8527ced0fddec")
        self.assertEqual(doc["hermes_source"]["commit"], COMMIT_ESPERADO)

    def test_R6_19b_inventario_governado_e_o_check_exige_OBSERVAR(self) -> None:
        """
        O §19 manda recomputar o inventário com o algoritmo governado antes de selar.

        A a8-r4 implementou esse algoritmo (`creditum_hermes_runtime_inventory/v1`) e
        o recomputou no runtime genuíno; a a8-r4a adotou o recomputado como
        autoridade e classificou o valor fornecido como histórico.

        O que este teste guarda é o que não mudou: um valor declarado no manifesto
        não é autoridade sozinho. Sem `--runtime-root` não há observação, e sem
        observação o `--check` recusa.
        """
        doc = json.loads((VPS / "runtime-manifest.json").read_text(encoding="utf-8"))
        fonte = doc["hermes_source"]
        self.assertEqual(
            fonte["runtime_inventory_sha256"],
            "8674149d18b5f1e804561af33bf85ebbe646550c0aeb8755dab0f2c928a18f1d")
        self.assertEqual(fonte["runtime_inventory_algorithm"],
                         "creditum_hermes_runtime_inventory/v1")
        # O fornecido continua rastreável, e só em campo marcado como histórico.
        self.assertIn("01ba45ae2ecde279ec53b6d8dabdeae85a7caf2eca74823e526e10666367aee1",
                      fonte["runtime_inventory_sha256_historical"])
        selador = carrega("_selo_r6", VPS / "seal-runtime-manifest.py")
        self.assertEqual(selador.main(["--check"]), 2)

    def test_R6_19c_os_hashes_governados_ESTAO_selados(self) -> None:
        doc = json.loads((VPS / "runtime-manifest.json").read_text(encoding="utf-8"))
        for nome, valor in doc["governed_artifact_hashes"].items():
            if nome == "note":
                continue
            self.assertIsNotNone(valor, nome)
            self.assertRegex(valor, r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
