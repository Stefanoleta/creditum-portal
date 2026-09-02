"""
BANCADA 3.1d-c6: reverte cada decisão da política e exige que a suíte CAIA.

Rodar de `intelligence/bridge`. Não é etapa de pipeline.

Uma política correta é uma afirmação; uma política cuja reversão MATA testes é uma
medida. Se qualquer mutação sobrevive, a regressão correspondente não observa o que diz.

Duas guardas: o alvo tem de EXISTIR e a fonte tem de MUDAR. Falhar qualquer uma é
falha da bancada, nunca "morta".
"""
import os, pathlib, shutil, subprocess, sys, tempfile

MODULOS = ["tests.test_c6_response_policy", "tests.test_r3_codex_executor", "tests.test_r6_producao"]
CODEX = "creditum_hermes_reasoning/codex.py"

MUTACOES = [
 ("V1  comparação de versão removida", CODEX,
  "    return type(observada) is str and observada == EXPECTED_SDK_VERSION",
  "    return True"),
 ("V2  versão declarada, não observada", CODEX,
  'if not sdk_version_is_approved(getattr(openai_mod, "__version__", None)):',
  'if not sdk_version_is_approved("2.24.0"):'),
 ("V3  comparação permissiva (startswith)", CODEX,
  "    return type(observada) is str and observada == EXPECTED_SDK_VERSION",
  '    return type(observada) is str and observada.startswith("2.24")'),
 ("V4  isinstance no tipo da versão", CODEX,
  "    return type(observada) is str and observada == EXPECTED_SDK_VERSION",
  "    return isinstance(observada, str) and observada == EXPECTED_SDK_VERSION"),
 ("V5  prova de versão DEPOIS de resolver as classes", CODEX,
  '    if not sdk_version_is_approved(getattr(openai_mod, "__version__", None)):\n        raise CodexRefusal(CodexDefect.SDK_VERSION_NOT_APPROVED)\n',
  ''),
 ("V6  origem da classe não é conferida", CODEX,
  '        if getattr(classe, "__module__", None) != modulo:',
  "        if False:"),
 ("V7  classes por import_module em vez de travessia", CODEX,
  '        alvo: Any = openai_mod\n        for parte in modulo.split(".")[1:]:',
  '        alvo: Any = importlib.import_module(modulo)\n        for parte in []:'),
 ("C1  compaction contribui texto", CODEX,
  "        elif classe is types.compaction_item:\n            compaction += 1",
  "        elif classe is types.compaction_item:\n            compaction += 1\n            mensagens.append(item)"),
 ("C2  reasoning contribui texto", CODEX,
  "        if classe is types.reasoning_item:\n            reasoning += 1",
  "        if classe is types.reasoning_item:\n            reasoning += 1\n            mensagens.append(item)"),
 ("C3  reasoning é LIDO (summary)", CODEX,
  "            reasoning += 1",
  "            reasoning += 1\n            _ = item.summary"),
 ("C4  compaction é LIDO (content)", CODEX,
  "            compaction += 1",
  "            compaction += 1\n            _ = item.content"),
 ("C5  extração via response.output_text", CODEX,
  "    texto = _texto_governado_de_bloco(bloco, types)",
  "    texto = response.output_text"),
 ("C6  sem checagem do status da MENSAGEM", CODEX,
  '    mstatus = _atributo(mensagem, "status")\n    if mstatus != COMPLETED_STATUS:',
  '    mstatus = _atributo(mensagem, "status")\n    if False:'),
 ("C7  sem checagem de incomplete_details", CODEX,
  '    incompleto = _atributo(response, "incomplete_details")\n    if incompleto is not None:',
  '    incompleto = _atributo(response, "incomplete_details")\n    if False:'),
 ("C8  recusa volta a RESULT_AMBIGUOUS", CODEX,
  "        raise CodexRefusal(CodexDefect.MODEL_REFUSED)",
  "        raise CodexRefusal(CodexDefect.RESULT_AMBIGUOUS)"),
 ("C9  admite UM tipo de ferramenta", CODEX,
  "        else:\n            raise CodexRefusal(\n                CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED, safe_type_name(item)\n            )",
  '        elif type(item).__name__ == "ResponseFunctionToolCall":\n            pass\n        else:\n            raise CodexRefusal(\n                CodexDefect.RESPONSE_OUTPUT_ITEM_NOT_APPROVED, safe_type_name(item)\n            )'),
 ("C10 coerção str(content.text)", CODEX,
  "    if type(texto) is not str:\n        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID, safe_type_name(texto))",
  "    texto = str(texto)\n    if False:\n        raise CodexRefusal(CodexDefect.RESPONSE_OUTPUT_TEXT_INVALID, safe_type_name(texto))"),
 ("C11 isinstance no tipo da resposta", CODEX,
  "    if type(response) is not types.response:",
  "    if not isinstance(response, types.response):"),
 ("C12 isinstance no item da mensagem", CODEX,
  "        elif classe is types.output_message:",
  "        elif isinstance(item, types.output_message):"),
 ("C13 aceita texto vazio", CODEX,
  "    if not texto.strip():",
  "    if False:"),
 ("C14 texto é normalizado com strip", CODEX,
  "    return texto\n",
  "    return texto.strip()\n"),
 ("C15 tipos selados deixam de ser exigidos", CODEX,
  "    if type(types) is not GovernedResponseTypes:",
  "    if False:"),
 ("C16 contagem de blocos deixa de vir antes da recusa", CODEX,
  "    if type(blocos) is not list or len(blocos) != 1:",
  "    if type(blocos) is not list:"),
]

env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
mortos = vivos = defeitos = 0
for rotulo, rel, alvo, veneno in MUTACOES:
    base = pathlib.Path(tempfile.mkdtemp()); trab = base / "bridge"
    shutil.copytree(".", trab, ignore=shutil.ignore_patterns("__pycache__"))
    p = trab / rel
    antes = p.read_text(encoding="utf-8")
    if alvo not in antes:
        print(f"  ⚠  BANCADA: alvo ausente — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    depois = antes.replace(alvo, veneno, 1)
    if depois == antes:
        print(f"  ⚠  BANCADA: mutação no-op — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    p.write_text(depois, encoding="utf-8")
    r = subprocess.run([sys.executable, "-B", "-m", "unittest", *MODULOS],
                       cwd=trab, capture_output=True, text=True, env=env)
    morto = r.returncode != 0
    mortos += morto; vivos += (not morto)
    falhas = [l for l in r.stderr.splitlines() if l.startswith(("FAIL:", "ERROR:"))]
    print(f"  {'MORTO ' if morto else 'VIVO  '} {rotulo:46s} {len(falhas)} falha(s)")
    if not morto:
        print("         ↑ nenhuma regressão observou esta reversão")
    shutil.rmtree(base)
print(f"\n  {len(MUTACOES)} mutações c6 · {mortos} mortas · {vivos} vivas · {defeitos} defeitos de bancada")
sys.exit(1 if (vivos or defeitos) else 0)
