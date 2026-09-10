"""
D2E-A4-R6 §13/§14 — auditoria estática + prova do registro no Hermes GENUÍNO.

    PYTHONDONTWRITEBYTECODE=1 HERMES_HOME=<perfil isolado> \
    python3 -B deploy/vps/probe-plugin-winner.py \
        --artifact /staging/creditum-telegram-governed

Duas etapas, nesta ordem:

  §8  AUDITORIA ESTÁTICA, por AST. Antes de executar qualquer linha do artefato,
      prova que a via `import` → `register(ctx)` não constrói adaptador, não conecta,
      não faz polling, não chama provedor, não abre rede — e toca EXATAMENTE
      `register_platform` no contexto do plugin.

  §9  SONDA, executando `register(ctx)` contra um `PluginContext` GENUÍNO num
      `HERMES_HOME` isolado, e lendo a entrada em vigor no `PlatformRegistry` real.

─── O que esta sonda deliberadamente NÃO chama ─────────────────────────────────

`PlatformRegistry.create_adapter`, `TelegramAdapter(...)`, `adapter.connect()`,
`start_polling()`, `hermes gateway run`. Também não chama `all_entries()` nem
`plugin_entries()`: os dois resolvem os loaders diferidos e importariam os ~20
plugins de plataforma embarcados — efeito colateral fabricado pela medição.
Nenhum token do Telegram, nenhum segredo de produção, nenhuma rede.

─── A chave do registro: MEDIDA, ou recusa ─────────────────────────────────────

A a8-r1 reportava PASS e dizia, à parte, que a chave `telegram` era INFERIDA da
herança. Inferência num relatório de prova é o defeito: quem lê "PASS" não lê o
rodapé.

A a8-r2 tirou o PASS, mas ainda media varrendo o grafo de atributos de um contexto
dublado — porque a API real não havia sido observada. A a8-r3 observou: o Hermes NÃO
deriva a chave de nada. `entries[entry.name] = entry`, verbatim. A chave é ESCOLHIDA
por quem registra.

Então varrer grafo deixou de ser a melhor evidência disponível e passou a ser a pior.
Esta versão registra pela via genuína e LÊ o valor armazenado por
`registered_names()` e `snapshot_registration(nome, scope=)` — as APIs públicas que
não materializam nada.

E o veredito exige Hermes REAL instalado, perguntado ANTES de registrar. Sem a
distribuição genuína não há registro a medir, e a sonda sai com 3 e
`KEY_NOT_MEASURABLE_HERE` — o que é a verdade fora do staging.
"""
from __future__ import annotations

import argparse
import ast
import pathlib
import sys

#: Chamadas que provariam efeito colateral na via de registro. Nomes de FUNÇÃO,
#: conferidos por AST — não por substring em texto, que já produziu quatorze falsos
#: positivos nesta fase.
PROIBIDAS_NA_VIA = (
    "create_adapter", "connect", "start_polling", "stop_polling", "get_updates",
    "send_message", "create", "post", "get", "request", "urlopen", "socket",
    "run_polling", "initialize", "start", "build",
    # A r6 fez o `adapter.py` importar `asyncio` legitimamente: o despacho governado
    # cria uma task, que é como o nativo despacha seu próprio flush. Então `asyncio`
    # saiu da lista de imports proibidos, e no lugar entraram as chamadas dele que
    # abririam rede, processo ou loop. Trocar um proxy grosseiro pelos alvos reais é
    # aperto, não afrouxamento — e a via de registro não pode criar task nenhuma.
    "open_connection", "create_connection", "create_server", "create_task",
    "create_subprocess_exec", "create_subprocess_shell", "run_until_complete",
    "add_signal_handler", "sock_connect",
)

#: Os ÚNICOS atributos que a via de registro pode tocar no contexto do plugin.
#: Enumerar o permitido, não o proibido — a a6 custou quatro rodadas para aprender.
ATRIBUTOS_PERMITIDOS_NO_CONTEXTO = frozenset({"register_platform"})

#: Módulos que a via de registro não pode importar.
#: A chave que o registro tem de conter. Conferida contra o valor ARMAZENADO.
RUNTIME_PLATFORM_ESPERADA = "telegram"

PROIBIDOS_IMPORT = (
    "urllib", "socket", "http", "requests", "httpx", "aiohttp", "telegram",
    "openai",
)


class SondaRecusada(Exception):
    def __init__(self, motivos: list[str]) -> None:
        super().__init__(f"{len(motivos)} recusa(s)")
        self.motivos = motivos


def _funcao(arv: ast.AST, nome: str) -> ast.FunctionDef | None:
    for n in ast.walk(arv):
        if isinstance(n, ast.FunctionDef) and n.name == nome:
            return n
    return None


def _constantes_de_string(caminhos: tuple[pathlib.Path, ...]) -> dict[str, str]:
    """
    As constantes de string de nível de módulo dos arquivos dados.

    A via de registro faz `getattr(ctx, NATIVE_REGISTER_PLATFORM, None)`, e essa
    constante vive no `compat.py`. Desistir num nome importado faria a auditoria
    reportar um toque desconhecido no contexto quando o valor É literal e conhecido.
    Então resolvo pelos arquivos do próprio artefato, que são os que vão executar.
    """
    tabela: dict[str, str] = {}
    for caminho in caminhos:
        if not caminho.is_file():
            continue
        for n in ast.parse(caminho.read_text(encoding="utf-8")).body:
            if isinstance(n, ast.Assign) and isinstance(n.value, ast.Constant) \
                    and isinstance(n.value.value, str):
                for alvo in n.targets:
                    if isinstance(alvo, ast.Name):
                        tabela[alvo.id] = n.value.value
    return tabela


def audita_via_de_registro(artefato: pathlib.Path) -> list[str]:
    """
    §8 — a via `import` → `register(ctx)` não tem efeito colateral.

    Estrutural: percorre o `register` da casca e o `register` da a4, e olha as
    CHAMADAS e os IMPORTS de cada um. Não é varredura de palavra no arquivo inteiro —
    o `adapter.py` menciona polling em prosa, e prosa não executa.
    """
    achados: list[str] = []
    casca = artefato / "__init__.py"
    a4 = artefato / "creditum_hermes_telegram" / "adapter.py"
    for alvo in (casca, a4):
        if not alvo.is_file():
            return [f"{alvo.name}: ausente no artefato"]

    for alvo in (casca, a4):
        arv = ast.parse(alvo.read_text(encoding="utf-8"))
        fn = _funcao(arv, "register")
        if fn is None:
            achados.append(f"{alvo.name}: sem `register`")
            continue
        for n in ast.walk(fn):
            if isinstance(n, ast.Call):
                f = n.func
                nome = (f.id if isinstance(f, ast.Name)
                        else f.attr if isinstance(f, ast.Attribute) else None)
                if nome in PROIBIDAS_NA_VIA:
                    achados.append(f"{alvo.name}:register chama {nome}()")
            if isinstance(n, ast.ImportFrom) and n.module:
                base = n.module.split(".")[0]
                if base in PROIBIDOS_IMPORT:
                    achados.append(f"{alvo.name}:register importa {base}")
            if isinstance(n, ast.Import):
                for al in n.names:
                    if al.name.split(".")[0] in PROIBIDOS_IMPORT:
                        achados.append(f"{alvo.name}:register importa {al.name}")

    # O contexto do plugin é uma fachada com muita autoridade. A via de registro
    # toca EXATAMENTE `register_platform` nele — provado estruturalmente, e não por
    # um contador de runtime que só vê o que aconteceu na execução observada.
    constantes = _constantes_de_string(
        (casca, a4, artefato / "creditum_hermes_telegram" / "compat.py"))
    for alvo in (casca, a4):
        arv = ast.parse(alvo.read_text(encoding="utf-8"))
        fn = _funcao(arv, "register")
        if fn is None:
            continue
        parametro = fn.args.args[0].arg if fn.args.args else None
        if parametro is None:
            achados.append(f"{alvo.name}:register sem parâmetro de contexto")
            continue
        tocados: set[str] = set()
        for n in ast.walk(fn):
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) \
                    and n.value.id == parametro:
                tocados.add(n.attr)
            # `getattr(ctx, "nome")` conta como toque, e o nome tem de ser literal.
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) \
                    and n.func.id == "getattr" and n.args \
                    and isinstance(n.args[0], ast.Name) and n.args[0].id == parametro:
                segundo = n.args[1] if len(n.args) > 1 else None
                if isinstance(segundo, ast.Constant) and isinstance(segundo.value, str):
                    tocados.add(segundo.value)
                elif isinstance(segundo, ast.Name):
                    # Constante resolvida contra os arquivos do artefato.
                    tocados.add(constantes.get(segundo.id) or f"?{segundo.id}")
                else:
                    achados.append(f"{alvo.name}:register faz getattr dinâmico no ctx")
        extras = tocados - ATRIBUTOS_PERMITIDOS_NO_CONTEXTO
        if extras:
            achados.append(f"{alvo.name}:register toca ctx.{sorted(extras)}")

    # Import de MÓDULO: o que roda ao carregar o artefato, antes de qualquer chamada.
    for alvo in (casca, a4):
        arv = ast.parse(alvo.read_text(encoding="utf-8"))
        for n in arv.body:
            if isinstance(n, (ast.Import, ast.ImportFrom)):
                nomes = ([al.name for al in n.names] if isinstance(n, ast.Import)
                         else [n.module or ""])
                for nome in nomes:
                    if nome.split(".")[0] in PROIBIDOS_IMPORT:
                        achados.append(f"{alvo.name}: import de topo de {nome}")
            elif isinstance(n, ast.Call):
                achados.append(f"{alvo.name}: chamada no nível de módulo")
    return achados


#: O nome do manifesto do plugin governado, como o Hermes o veria. Vira
#: `PlatformEntry.plugin_name`, que é o campo pelo qual se prova a propriedade.
NOME_DO_PLUGIN_GOVERNADO = "creditum-telegram-governed"


def hermes_real_instalado() -> str | None:
    """
    A distribuição GENUÍNA está instalada? Devolve a versão, ou `None`.

    Medir a chave contra um dublê seria medir o dublê. O veredito da sonda depende
    desta resposta, e não de qualquer módulo que alguém tenha posto em `sys.modules`.
    """
    from importlib import metadata  # noqa: PLC0415

    for nome in ("hermes-agent", "hermes_agent", "hermes", "hermes-cli"):
        try:
            return metadata.version(nome)
        except Exception:  # noqa: BLE001, S112
            continue
    return None


def contexto_genuino() -> tuple[object, str]:
    """
    A via GENUÍNA de registro: `PluginManifest` → `PluginManager` → `PluginContext`.

    Sem dublê. A a8-r2 media a chave varrendo o grafo de atributos de um contexto
    falso, porque a API real não havia sido observada. Agora ela foi, e varrer grafo
    deixou de ser a melhor evidência disponível: passou a ser a pior.

    O escopo vem do `HERMES_HOME` resolvido, que é COMO o Hermes escopa registros de
    plugin. Registrar num escopo e ler noutro daria "nenhuma chave" com o registro
    intacto — um falso negativo que pareceria falha de produção.
    """
    from hermes_cli.plugins import (  # noqa: PLC0415
        PluginContext, PluginManager, PluginManifest,
    )

    manifesto = PluginManifest(name=NOME_DO_PLUGIN_GOVERNADO)
    gerente = PluginManager()
    return PluginContext(manifesto, gerente), gerente.scope_key


def mede_o_registro(escopo: str, governada: type) -> tuple[dict[str, object], list[str]]:
    """
    Lê o registro GENUÍNO, pelas APIs públicas que NÃO materializam nada.

    `registered_names()` devolve as chaves do escopo corrente sem resolver loaders
    diferidos. `snapshot_registration(nome, scope=)` devolve a entrada concreta e o
    loader diferido, também sem resolver.

    `all_entries()` e `plugin_entries()` são deliberadamente EVITADOS: os dois chamam
    `_resolve_all()`, que importaria os ~20 plugins de plataforma embarcados. Isso
    seria efeito colateral fabricado pela própria medição — e o §17 pede zero.

    O componente diferido do snapshot é a prova de vencedor que o §14 pede: uma
    entrada concreta SUPERA o loader diferido do embutido, e o Hermes limpa o loader
    ao registrar. Diferido `None` com entrada nossa significa que não sobrou
    concorrente em vigor.
    """
    from gateway.platform_registry import platform_registry  # noqa: PLC0415

    recusas: list[str] = []
    chaves = sorted(platform_registry.registered_names())
    entrada, diferido = platform_registry.snapshot_registration(
        RUNTIME_PLATFORM_ESPERADA, scope=escopo)

    medido: dict[str, object] = {
        "chaves_no_escopo": chaves,
        "escopo": escopo,
        "entrada_presente": entrada is not None,
        "loader_diferido_restante": diferido is not None,
    }

    if RUNTIME_PLATFORM_ESPERADA not in chaves:
        recusas.append(f"REGISTRY_KEY_ABSENT: {RUNTIME_PLATFORM_ESPERADA!r} não está "
                       f"em {chaves}")
    if entrada is None:
        recusas.append("REGISTRY_ENTRY_NOT_STORED: snapshot_registration não devolveu "
                       "entrada concreta")
        return medido, recusas

    fabrica_governada = getattr(governada, "_creditum_adapter_factory", None)
    medido.update({
        "chave_armazenada": entrada.name,
        "rotulo": entrada.label,
        "source": entrada.source,
        "plugin_name": getattr(entrada, "plugin_name", "NÃO EXPOSTO"),
        "adapter_factory": getattr(entrada.adapter_factory, "__qualname__", "?"),
        "adapter_factory_module": getattr(entrada.adapter_factory, "__module__", "?"),
        "fabrica_e_a_governada": entrada.adapter_factory is fabrica_governada,
        "check_fn_module": getattr(entrada.check_fn, "__module__", "?"),
    })

    if entrada.name != RUNTIME_PLATFORM_ESPERADA:
        recusas.append(f"REGISTRY_KEY_UNEXPECTED: {entrada.name!r} != "
                       f"{RUNTIME_PLATFORM_ESPERADA!r}")
    if entrada.source != "plugin":
        recusas.append(f"REGISTRY_SOURCE_UNEXPECTED: {entrada.source!r}")
    if getattr(entrada, "plugin_name", None) != NOME_DO_PLUGIN_GOVERNADO:
        recusas.append("REGISTRY_PLUGIN_NAME_UNEXPECTED: "
                       f"{getattr(entrada, 'plugin_name', None)!r}")
    if fabrica_governada is None:
        recusas.append("GOVERNED_FACTORY_ABSENT: a classe não expõe a fábrica fixa")
    elif entrada.adapter_factory is not fabrica_governada:
        # §14: identidade de objeto. Não construo adaptador para provar classe —
        # a identidade da fábrica é suficiente, e construir teria efeito colateral.
        recusas.append("REGISTRY_FACTORY_NOT_GOVERNED: a entrada em vigor aponta para "
                       "outra fábrica")
    if diferido is not None:
        recusas.append("COMPETING_DEFERRED_LOADER: um loader diferido continua em "
                       "vigor ao lado da entrada governada")
    return medido, recusas


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--artifact", required=True)
    a = p.parse_args(argv)
    artefato = pathlib.Path(a.artifact)

    print("=== §8 auditoria estática da via de registro ===")
    achados = audita_via_de_registro(artefato)
    if achados:
        for m in achados:
            print(f"  RECUSA   {m}", file=sys.stderr)
        return 2
    print("  a via import → register não constrói adaptador, não conecta,")
    print("  não faz polling, não chama provedor e não importa rede.")
    print(f"  no contexto do plugin ela toca EXATAMENTE "
          f"{sorted(ATRIBUTOS_PERMITIDOS_NO_CONTEXTO)}")

    # ─── o portão do Hermes GENUÍNO vem ANTES de registrar ───────────────────
    #
    # A a8-r2 registrava contra um dublê e só depois perguntava se o Hermes era
    # real. Perguntar depois convida a reportar o que se mediu no dublê. Aqui, sem
    # a distribuição genuína não há registro nenhum a medir, e a sonda diz isso.
    versao_real = hermes_real_instalado()
    print(f"\n  hermes REAL instalado    {versao_real or 'NÃO'}")
    if versao_real is None:
        print()
        print("  RECUSA   KEY_NOT_MEASURABLE_HERE: a distribuição genuína do Hermes",
              file=sys.stderr)
        print("           não está instalada. A chave do registro só é mensurável onde",
              file=sys.stderr)
        print("           o registro existe — staging genuíno, fase 3 do runbook.",
              file=sys.stderr)
        print("           O que ESTÁ provado aqui: a auditoria estática da via.",
              file=sys.stderr)
        return 3

    print("\n=== §9/§13 sonda: o registro GENUÍNO ===")
    # O artefato entra em `sys.path` como o Hermes o carregaria: o pacote
    # `creditum_hermes_telegram` tem de resolver de DENTRO dele, não do repositório.
    sys.path.insert(0, str(artefato))
    import importlib.util  # noqa: PLC0415

    spec = importlib.util.spec_from_file_location(
        "_plugin_governado", artefato / "__init__.py")
    if spec is None or spec.loader is None:
        print("  RECUSA   ARTIFACT_NOT_LOADABLE", file=sys.stderr)
        return 2
    plugin = importlib.util.module_from_spec(spec)
    sys.modules["_plugin_governado"] = plugin
    spec.loader.exec_module(plugin)

    ctx, escopo = contexto_genuino()
    governada = plugin.register(ctx)

    from creditum_hermes_telegram.compat import (  # noqa: PLC0415
        ADAPTER_COMPAT_ID, NATIVE_ADAPTER_CLASS, NATIVE_ADAPTER_MODULE,
    )

    classe_nativa = getattr(sys.modules[NATIVE_ADAPTER_MODULE], NATIVE_ADAPTER_CLASS)
    prova = getattr(governada, "_creditum_proof", None)

    recusas: list[str] = []
    if not issubclass(governada, classe_nativa):
        recusas.append("a classe governada não é subclasse da nativa")
    if governada.__name__ != "CreditumGovernedTelegramAdapter":
        recusas.append(f"nome inesperado: {governada.__name__}")
    if governada.__module__ != "creditum_hermes_telegram.adapter":
        recusas.append(f"módulo inesperado: {governada.__module__}")
    if prova is None or prova.adapter_compat_id != ADAPTER_COMPAT_ID:
        recusas.append("a prova de compatibilidade não é a governada")

    medido, recusas_do_registro = mede_o_registro(escopo, governada)
    recusas.extend(recusas_do_registro)

    print(f"  classe registrada        {governada.__name__}")
    print(f"  módulo da classe         {governada.__module__}")
    print(f"  subclasse da nativa      {issubclass(governada, classe_nativa)}")
    print(f"  compat id                {getattr(prova, 'adapter_compat_id', None)}")
    print(f"  chamadores nativos       "
          f"{list(getattr(prova, 'native_enqueue_callers', ()))}")
    print(f"  limiar nativo medido     "
          f"{getattr(prova, 'native_split_threshold', None)}")
    print(f"  escopo do registro       {medido['escopo']}")
    print(f"  chaves no escopo         {medido['chaves_no_escopo']}")
    for campo in ("chave_armazenada", "rotulo", "source", "plugin_name",
                  "adapter_factory", "adapter_factory_module",
                  "fabrica_e_a_governada", "check_fn_module",
                  "loader_diferido_restante"):
        if campo in medido:
            print(f"  {campo:24s} {medido[campo]}")

    if recusas:
        print()
        for m in recusas:
            print(f"  RECUSA   {m}", file=sys.stderr)
        return 2

    print(f"\n  DESCOBERTA → REGISTRO GENUÍNO → chave MEDIDA "
          f"{medido['chave_armazenada']!r} no PlatformRegistry real →")
    print("  VENCEDOR CREDITUM, sem contato com o Telegram. Nenhuma inferência.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
