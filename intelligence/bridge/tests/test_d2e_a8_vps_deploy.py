"""
D2E-A8 §23 — verificação local dos artefatos de implantação.

Sem Docker nesta máquina, sem acesso à Hostinger, sem segredo, sem rede. O que se
verifica aqui é o CONTRATO dos arquivos: que o portão da a6 é o `ENTRYPOINT`, que não
há seletor de comando, que `HERMES_HOME` e `WORKDIR` são declarados, que nada publica
porta e que a base do Hermes falha fechada.
"""
from __future__ import annotations

import pathlib
import re
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
VPS = RAIZ / "deploy" / "vps"
DOCKERFILE = VPS / "Dockerfile"
COMPOSE = VPS / "compose.yaml"
RUNBOOK = VPS / "RUNBOOK.md"
CLASSIFICADOR = VPS / "classify-data-inventory.py"


def diretivas(texto: str) -> list[tuple[str, str]]:
    """
    As diretivas do Dockerfile, sem comentário, com continuação juntada — e com o
    CORPO DOS HEREDOCS anexado à diretiva que os abre.

    A a8-r4e passou o portão de conferência para um heredoc (`RUN ... <<'X'`), que
    o `# syntax=docker/dockerfile:1` no topo habilita. O parser anterior lia só a
    linha do `RUN`, então o corpo desaparecia — e dois testes que exigem ver o que
    o portão chama falharam sem que nada estivesse errado no Dockerfile. Um parser
    que não entende a sintaxe que o arquivo usa mede outra coisa.
    """
    linhas: list[str] = []
    acumulado = ""
    heredoc: str | None = None
    for bruta in texto.splitlines():
        if heredoc is not None:
            # Dentro de heredoc: tudo é corpo, inclusive linha que começa com `#`.
            if bruta.strip() == heredoc:
                heredoc = None
                linhas.append(acumulado)
                acumulado = ""
            else:
                acumulado += " " + bruta
            continue
        if bruta.lstrip().startswith("#"):
            continue
        if not bruta.strip():
            continue
        acumulado += bruta.rstrip("\\")
        if bruta.rstrip().endswith("\\"):
            continue
        marca = re.search(r"<<-?'([A-Za-z_][A-Za-z0-9_]*)'|<<-?\"?([A-Za-z_][A-Za-z0-9_]*)\"?\s*$",
                          bruta)
        if marca:
            heredoc = marca.group(1) or marca.group(2)
            continue
        linhas.append(acumulado)
        acumulado = ""
    saida = []
    for l in linhas:
        m = re.match(r"^([A-Z]+)\s+(.*)$", l.strip())
        if m:
            saida.append((m.group(1), m.group(2)))
    return saida


class ArtefatosExistem(unittest.TestCase):
    def test_A8_os_quatro_artefatos_existem(self) -> None:
        for alvo in (DOCKERFILE, COMPOSE, RUNBOOK, CLASSIFICADOR):
            self.assertTrue(alvo.is_file(), str(alvo))

    def test_A8_o_classificador_e_python_valido_e_somente_leitura(self) -> None:
        import ast
        arv = ast.parse(CLASSIFICADOR.read_text(encoding="utf-8"))
        importados = {n.module.split(".")[0] for n in ast.walk(arv)
                      if isinstance(n, ast.ImportFrom) and n.module}
        importados |= {a.name.split(".")[0] for n in ast.walk(arv)
                       if isinstance(n, ast.Import) for a in n.names}
        for proibido in ("shutil", "subprocess", "urllib", "socket", "http",
                         "requests", "tempfile", "sqlite3"):
            self.assertNotIn(proibido, importados,
                             f"o classificador importa {proibido}")
        # Nenhuma escrita, e nenhuma ABERTURA: `.env` e `state.db` não são lidos.
        metodos = {n.func.attr for n in ast.walk(arv)
                   if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
        for proibido in ("write_text", "write_bytes", "unlink", "mkdir", "rmtree",
                         "copy", "copy2", "read_text", "read_bytes", "open"):
            self.assertNotIn(proibido, metodos, f"o classificador chama .{proibido}()")
        nomes = {n.func.id for n in ast.walk(arv)
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
        self.assertNotIn("open", nomes, "o classificador abre arquivo")


class ContratoDoDockerfile(unittest.TestCase):
    def setUp(self) -> None:
        self.texto = DOCKERFILE.read_text(encoding="utf-8")
        self.dirs = diretivas(self.texto)

    def test_A8_3_o_ENTRYPOINT_e_o_portao_da_a6(self) -> None:
        entrypoints = [v for k, v in self.dirs if k == "ENTRYPOINT"]
        self.assertEqual(len(entrypoints), 1, "há mais de um ENTRYPOINT")
        self.assertEqual(entrypoints[0].strip(),
                         '["/opt/creditum/prestart-gate.sh"]')

    def test_A8_3b_nao_existe_CMD(self) -> None:
        """`CMD` seria argumento, e argumento é seletor de comando."""
        self.assertEqual([v for k, v in self.dirs if k == "CMD"], [])

    def test_A8_3c_nenhum_atalho_para_o_gateway_fora_do_portao(self) -> None:
        corpo = "\n".join(f"{k} {v}" for k, v in self.dirs)
        # `hermes gateway run` só pode aparecer dentro do envelope, nunca na imagem.
        self.assertNotIn("gateway run", corpo,
                         "a imagem tem caminho de gateway fora do portão")
        for proibido in ("$@", "$*", "eval "):
            self.assertNotIn(proibido, corpo, f"a imagem contém {proibido}")

    def test_A8_1_as_autoridades_do_build_falham_FECHADAS(self) -> None:
        """
        A r1 trocou "imagem base do Hermes" por "construir do commit exato" (§1 da
        a8-r1). O que falha fechado agora são três autoridades, não uma.
        """
        args = [v for k, v in self.dirs if k == "ARG"]
        # Sem valor padrão: o build não constrói sem que sejam fornecidas.
        for exigida in ("HERMES_COMMIT", "HERMES_LOCK_SHA256"):
            self.assertIn(exigida, args, f"{exigida} não é ARG sem padrão")
        # O `uv` era a terceira, por `ARG UV_VERSION` sem padrão. A a8-r4c o tirou
        # de argumento: falhar fechado ainda deixava a FERRAMENTA como escolha de
        # quem chama, e dois builds do mesmo repositório podiam usar dois uv. Agora
        # é dígito OCI literal — não há valor a escolher.
        self.assertNotIn("UV_VERSION", args, "UV_VERSION voltou a ser argumento")
        froms = [v for k, v in self.dirs if k == "FROM"]
        do_uv = [f for f in froms if "AS ferramenta_uv" in f]
        self.assertEqual(len(do_uv), 1)
        self.assertIn("@sha256:", do_uv[0], "o uv não é fixado por dígito")
        self.assertNotIn("${", do_uv[0], "o estágio do uv aceita argumento")
        # A base do Python era uma TAG num argumento de build: fixava a versão e
        # não os bytes. A a8-r4f a fixou por dígito OCI e tirou o argumento —
        # `3.13.15-slim-bookworm` é reconstruída a cada correção do Debian, então
        # duas builds da mesma tag não são a mesma imagem.
        self.assertFalse(any(a.startswith("PYTHON_BASE=") for a in args),
                         "PYTHON_BASE voltou a ser argumento de build")
        de_python = [f for f in froms if f.startswith("python")]
        self.assertEqual(len(de_python), 2, "esperados 2 estágios de base")
        for f in de_python:
            self.assertIn("@sha256:", f, "a base do Python não é fixada por dígito")
            self.assertNotIn("${", f)
        # E a medição da versão continua: o dígito prova QUE imagem é, a medição
        # prova QUE Python ela traz. As duas, não uma.
        self.assertIn("PYTHON_VERSION_ESPERADA", " ".join(args))
        self.assertIn("PYTHON_BASE_VERSION_UNEXPECTED",
                      " ".join(v for k, v in self.dirs if k == "RUN"))

    def test_A8_4_HERMES_HOME_e_WORKDIR_sao_governados(self) -> None:
        envs = " ".join(v for k, v in self.dirs if k == "ENV")
        self.assertIn("HERMES_HOME=/data", envs)
        self.assertIn("PYTHONDONTWRITEBYTECODE=1", envs)
        workdirs = [v.strip() for k, v in self.dirs if k == "WORKDIR"]
        self.assertEqual(workdirs, ["/opt/hermes-agent"])

    def test_A8_1b_as_versoes_sao_travadas_e_conferidas_no_build(self) -> None:
        args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else None)
                for k, a in self.dirs if k == "ARG"}
        self.assertEqual(args.get("HERMES_VERSION_ESPERADA"), "0.20.4")
        self.assertEqual(args.get("PYTHON_VERSION_ESPERADA"), "3.13.15")
        self.assertEqual(args.get("OPENAI_SDK_VERSION_ESPERADA"), "2.24.0")

    def test_A8_1c_a_leitura_da_versao_NAO_e_reimplementada(self) -> None:
        """
        A primeira versão deste Dockerfile lia a versão do Hermes com um `python -c`
        próprio — uma SEGUNDA implementação da mesma leitura, que é o defeito que a
        a6 passou quatro rodadas fechando. Agora reusa a função já testada.
        """
        runs = " ".join(v for k, v in self.dirs if k == "RUN")
        self.assertIn("versao_do_hermes_instalado", runs)
        self.assertIn("DISTRIBUICOES_DO_HERMES", runs)
        # E não enumera nomes de distribuição PARA CONSULTAR METADADO por conta
        # própria.
        #
        # A conferência era por literal entre quotes, e a a8-r4e mostrou que isso
        # mede a coisa errada: o portão passou a ler o esperado do
        # `runtime-manifest.json`, cuja CHAVE é `runtime_versions.hermes_agent`.
        # Uma chave de dicionário não é uma enumeração de distribuição, e o teste
        # acusou — décimo quarto falso positivo de texto-contra-estrutura desta
        # fase, e meu de novo.
        #
        # O defeito real é `metadata.version('hermes-agent')`: consultar a
        # distribuição por nome escolhido aqui, em vez de reusar a função já
        # testada. É isso que se proíbe agora.
        for nome in ("hermes-agent", "hermes_agent", "hermes", "hermes-cli"):
            for quote in ("'", '"'):
                for chamada in ("metadata.version(", "version(", "distribution("):
                    self.assertNotIn(f"{chamada}{quote}{nome}{quote}", runs,
                                     f"o Dockerfile consulta {nome} por nome próprio")
        self.assertNotIn("importlib.metadata.version", runs)

    def test_A8_o_portao_e_copiado_antes_de_ser_usado(self) -> None:
        ordem = [k for k, _ in self.dirs]
        copias = [i for i, (k, v) in enumerate(self.dirs)
                  if k == "COPY" and "prestart" in v]
        primeiro_run_de_versao = next(
            i for i, (k, v) in enumerate(self.dirs)
            if k == "RUN" and "versao_do_hermes_instalado" in v)
        self.assertTrue(copias, "o portão não é copiado")
        self.assertLess(max(copias), primeiro_run_de_versao,
                        "a conferência roda antes de o pacote existir")
        self.assertEqual(ordem[-1], "ENTRYPOINT")


class ContratoDoCompose(unittest.TestCase):
    def setUp(self) -> None:
        self.linhas = [l for l in COMPOSE.read_text(encoding="utf-8").splitlines()
                       if l.strip() and not l.lstrip().startswith("#")]
        self.corpo = "\n".join(self.linhas)

    def test_A8_18_nenhuma_porta_publicada(self) -> None:
        """
        O Telegram é long polling — saída. E nenhuma porta de entrada foi observada
        pela a7-r1, então publicar por precaução abriria superfície não medida.
        """
        for chave in ("ports:", "expose:"):
            self.assertNotIn(chave, self.corpo, f"o compose declara {chave}")

    def test_A8_3d_nenhum_command_no_compose(self) -> None:
        self.assertFalse(any(l.strip().startswith(("command:", "entrypoint:"))
                             for l in self.linhas),
                         "o compose sobrescreve o ENTRYPOINT")

    def test_A8_a_base_tambem_falha_fechada_no_compose(self) -> None:
        for exigida in ("HERMES_COMMIT", "HERMES_LOCK_SHA256"):
            self.assertIn(f"{exigida}: ${{{exigida}:?", self.corpo,
                          f"{exigida} não falha fechada no compose")
        # `UV_VERSION` saiu na a8-r4c: passar argumento de build para a ferramenta
        # é o que permitia dois uv para o mesmo estado do repositório.
        for linha in self.linhas:
            if linha.lstrip().startswith("#"):
                continue
            self.assertNotIn("UV_VERSION:", linha,
                             "UV_VERSION voltou como argumento de build")

    def test_A8_o_estado_e_volume_e_o_install_NAO_e(self) -> None:
        self.assertIn("creditum-hermes-data:/data", self.corpo)
        # `/opt/hermes-agent` tem evidência de reconstrução no arranque: montar sobre
        # ele seria montar sobre algo que o runtime reescreve.
        self.assertNotIn(":/opt/hermes-agent", self.corpo)
        self.assertNotIn(":/app", self.corpo)

    def test_A8_reinicio_nao_esconde_recusa(self) -> None:
        """
        `on-failure` transformaria recusa do portão em laço de reinício. Recusa é
        decisão, não falha transitória.
        """
        self.assertIn("restart: unless-stopped", self.corpo)
        self.assertNotIn("on-failure", self.corpo)
        self.assertNotIn("restart: always", self.corpo)

    def test_A8_8_nenhum_valor_de_segredo_no_compose(self) -> None:
        self.assertIn("env_file:", self.corpo)
        # Referencia o CAMINHO; nenhum par chave=valor de credencial.
        for suspeito in ("TELEGRAM_BOT_TOKEN=", "OPENAI_API_KEY=", "api_key",
                         "sk-", "bot"):
            self.assertNotIn(suspeito, self.corpo, f"o compose contém {suspeito}")


class RunbookDeclaraOsBloqueios(unittest.TestCase):
    def setUp(self) -> None:
        self.texto = RUNBOOK.read_text(encoding="utf-8")

    def test_A8_22_os_quatro_bloqueios_estao_nomeados(self) -> None:
        """
        §22: parar e relatar em vez de adivinhar. O runbook tem de DIZER que não é
        executável, e nomear cada requisito aberto — não escondê-los em prosa.
        """
        portoes = re.findall(r"^## PORTÃO (\d+) — (.+)$", self.texto, re.M)
        self.assertEqual([n for n, _ in portoes], ["1", "2", "3", "4"])
        assuntos = " ".join(t for _, t in portoes)
        for exigido in ("Hermes 0.20.4", "state.db", "Telegram", "plugin"):
            self.assertIn(exigido, assuntos)
        self.assertIn("NÃO é executável ainda", self.texto)

        # A r1 fechou três dos quatro. G3 é o único ABERTO, e o runbook tem de dizer
        # exatamente isso — declarar fechado o que está aberto seria pior que nada.
        estados = dict((n, t) for n, t in portoes)
        for fechado in ("1", "2", "4"):
            self.assertIn("FECHADO", estados[fechado], f"portão {fechado}")
        self.assertIn("ABERTO", estados["3"])
        self.assertIn("único bloqueio externo", self.texto)

    def test_A8_3e_o_limite_de_confianca_do_docker_e_declarado(self) -> None:
        """§3: não afirmar que Docker impede root hostil."""
        self.assertIn("--entrypoint", self.texto)
        self.assertIn("não impede root hostil", self.texto)
        self.assertIn("implantação normal", self.texto.lower())

    def test_A8_17_as_quatro_fronteiras_de_rede_ficam_separadas(self) -> None:
        for exigido in ("integridade de arranque", "ativação de plugin",
                        "cutover do Telegram", "FIRST LIVE"):
            self.assertIn(exigido, self.texto)

    def test_A8_12_a_cutover_exige_UM_consumidor(self) -> None:
        self.assertIn("exatamente um consumidor", self.texto)
        self.assertIn("Nunca os dois", self.texto)

    def test_A8_15_as_nove_injecoes_de_falha_estao_listadas(self) -> None:
        for defeito in ("MANIFEST_MISSING", "MANIFEST_HASH_MISMATCH",
                        "PLUGIN_ROOT_MISSING", "PLUGIN_FILE_HASH_MISMATCH",
                        "PLUGIN_UNEXPECTED_FILE", "PLUGIN_NOT_ENABLED",
                        "PRECEDENCE_OVERRIDE_PRESENT", "ENTRYPOINT_OVERRIDE_PRESENT",
                        "HERMES_VERSION_UNSUPPORTED"):
            self.assertIn(defeito, self.texto, defeito)
        self.assertIn("contagem de processo do gateway = 0", self.texto)

    def test_A8_todo_defeito_citado_existe_no_verificador(self) -> None:
        """Runbook que cita defeito inexistente é runbook que ninguém pode seguir."""
        from creditum_hermes_prestart.verify import DEFEITOS

        # Escopo: a TABELA de injeção de falha, que é onde defeito é nomeado. Varrer
        # o documento inteiro por prefixo acusou `HERMES_HOME` e `HERMES_BASE_IMAGE`,
        # que são variáveis de ambiente — e a fase 4 é a seção que importa aqui.
        inicio = self.texto.index("### Fase 4")
        tabela = self.texto[inicio:self.texto.index("### Fase 5", inicio)]
        citados = set(re.findall(r"`([A-Z][A-Z_]{6,})`", tabela))
        self.assertTrue(citados, "a tabela de injeção não cita defeito nenhum")
        self.assertEqual(citados - set(DEFEITOS), set(),
                         f"defeitos inexistentes: {citados - set(DEFEITOS)}")
        self.assertEqual(len(citados), 9, "a tabela não tem as nove condições")


if __name__ == "__main__":
    unittest.main()
