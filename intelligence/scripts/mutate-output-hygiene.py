"""
Bateria DINÂMICA: muta a fonte real e roda os testes de segurança de comportamento.

Isto mede coisa diferente do portão. O portão é sintático — ele vê o padrão. Os
testes dinâmicos executam a fronteira e olham o que sai. Uma mutação que o portão
pega mas os testes não pegariam significaria que a prova semântica se apoiou no
portão; o contrário significaria que o portão é decorativo. Preciso dos dois números.
"""
import pathlib, shutil, subprocess, sys, tempfile, os

REAL = pathlib.Path("creditum_hermes_reasoning")

#: BANCADA, não etapa do pipeline: roda a suíte de segurança uma vez por mutação.
#: Rodar de `intelligence/bridge`. O portão sintático (`verify-output-hygiene.py`)
#: é o que entra no `npm run verify`; este mede a outra dimensão.
MODULOS = ["tests.test_r6_producao", "tests.test_r3_codex_executor", "tests.test_reasoning_runtime"]

MUTACOES = [
 ("D1 resolver: mensagem de terceiro", "runtime.py",
  "tipo = safe_exception_type(causa)", "tipo = str(causa)"),
 ("D2 CLI: nome de tipo cru", "__main__.py",
  "safe_exception_type(causa)", "type(causa).__name__"),
 ("D3 sanitizador: ancora final removida", "runtime.py",
  r'{0,63}\Z"', r'{0,63}"'),
 ("D4 sanitizador: isidentifier em vez de allowlist", "runtime.py",
  "_NOME_DE_TIPO_SEGURO.match(nome) is None", "not nome.isidentifier()"),
 ("D5 sanitizador: sem limite de tamanho", "runtime.py",
  r"{0,63}\Z", r"*\Z"),
 ("D6 import do SDK: repr do terceiro", "executor.py",
  'f"openai:{tipo}"', 'f"openai:{causa!r}"'),
 ("D7 relatorio: campo coagido", "__main__.py",
  "sdk_version=PRODUCTION_SDK_VERSION", "sdk_version=str(provedor.version)"),
 ("D8 chamada ao provedor: args da excecao", "executor.py",
  "raise ExecutorRefusal(ExecutorDefect.PROVIDER_CALL_FAILED, tipo) from None",
  "raise ExecutorRefusal(ExecutorDefect.PROVIDER_CALL_FAILED, causa.args[0]) from None"),
 ("D9 safe_label: aceita qualquer str", "runtime.py",
  "if type(valor) is str and valor in permitidos:", "if type(valor) is str:"),
 ("D10 texto governado: coage o objeto", "runtime.py",
  "def _texto_governado(", "def _texto_governado_desativado("),
]

env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
mortos = vivos = 0
for rotulo, arquivo, alvo, veneno in MUTACOES:
    base = pathlib.Path(tempfile.mkdtemp()); trab = base / "bridge"
    shutil.copytree(".", trab, ignore=shutil.ignore_patterns("__pycache__"))
    p = trab / REAL / arquivo; src = p.read_text(encoding="utf-8")
    if alvo not in src:
        print(f"  ⚠  MAL APONTADA em {arquivo}: {rotulo}"); vivos += 1; shutil.rmtree(base); continue
    p.write_text(src.replace(alvo, veneno, 1), encoding="utf-8")
    r = subprocess.run([sys.executable, "-B", "-m", "unittest", *MODULOS],
                       cwd=trab, capture_output=True, text=True, env=env)
    morto = r.returncode != 0
    mortos += morto; vivos += (not morto)
    falhas = [l for l in r.stderr.splitlines() if l.startswith(("FAIL:", "ERROR:"))]
    print(f"  {'MORTO ' if morto else 'VIVO  '} {rotulo:44s} {len(falhas)} falha(s)")
    if not morto: print("         ↑ nenhum teste dinâmico observou esta mutação")
    shutil.rmtree(base)
print(f"\n  {len(MUTACOES)} mutações dinâmicas · {mortos} mortas · {vivos} vivas")
