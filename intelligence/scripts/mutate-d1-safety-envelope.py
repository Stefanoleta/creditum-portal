"""
BANCADA 3.1d-D1: reverte cada decisão do envelope e exige que a suíte CAIA.

Rodar de `intelligence/`. Não é etapa de pipeline.

Cobre os dois lados: a autoridade em TypeScript e os controles em Python. Se qualquer
mutação sobrevive, a regressão correspondente não observa o que diz observar.

Guardas: alvo tem de EXISTIR e a fonte tem de MUDAR. Falhar qualquer uma é falha da
bancada, nunca "morta".
"""
import os, pathlib, shutil, subprocess, sys, tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
TS = "gateway/src/live-execution.ts"
# Mesmo arquivo. O sufixo marca GUARDA INALCANÇÁVEL pelo caminho governado: o
# construtor exige o SELO, que não é exportado, então nenhum teste externo pode
# construir a forma que a guarda barra. Reverter uma delas NÃO muda comportamento
# observável — esperar que morra seria exigir uma costura de produção só para a
# bancada. Espera-se VIVA; se alguma MORRER, ela era alcançável e isso é notícia.
TS_GUARDA = TS + "\0guarda"
#
# Razão estrutural, POR CASO — agrupar por "sobreviveu" foi o erro que o regate cobrou:
#
#   R1-2  `PROPRIAS.has(spec)` sobre o ARGUMENTO do construtor. Só um chamador que já
#         possua o SELO pode entregar argumento não-próprio, e o SELO não é exportado.
#         O emissor exportado sempre entrega o instantâneo próprio.
#   R1-3  a re-derivação `liveExecutionFingerprint(spec) !== fingerprint`. Só divergem
#         se quem constrói passar par incoerente — de novo, exige o SELO.
#
# R1-5 NÃO está aqui: ela muta `this.spec = spec`, que executa em toda emissão
# bem-sucedida pelo emissor exportado. É ALCANÇÁVEL e é kill-required.
PY_CODEX = "bridge/creditum_hermes_reasoning/codex.py"
PY_RT = "bridge/creditum_hermes_reasoning/runtime.py"
PY_EX = "bridge/creditum_hermes_reasoning/executor.py"

MUTACOES = [
 # ── D1-R1: identidade spec selada / fingerprint aprovado ───────────────────
 ("R1-1 fingerprint da spec do CHAMADOR, cópia independente armazenada", TS,
  "  const fingerprint = liveExecutionFingerprint(ownedSpec)",
  "  const fingerprint = liveExecutionFingerprint(spec as LiveExecutionSpecV1)"),
 ("R1-2 referência do chamador armazenada em vez do instantâneo próprio", TS_GUARDA,
  "    if (!PROPRIAS.has(spec)) {",
  "    if (false) {"),
 ("R1-3 fingerprint selado pode divergir da spec armazenada", TS_GUARDA,
  "    if (liveExecutionFingerprint(spec) !== fingerprint) {",
  "    if (false) {"),
 ("R1-4 hash aprovado conferido contra fingerprint alheio à spec própria", TS,
  "  if (request.subject_content_hash !== fingerprint) {",
  "  if (request.subject_content_hash !== liveExecutionFingerprint(spec as LiveExecutionSpecV1)) {"),
 ("R1-5 construtor volta a clonar em vez de guardar o próprio", TS,
  "    this.spec = spec\n", "    this.spec = Object.freeze({ ...spec })\n"),

 # ── AUTORIDADE (TypeScript) ────────────────────────────────────────────────
 ("A1 avaliador canônico trocado por checagem local simplificada", TS,
  "  const efetiva = resolveEffectiveDecision(request.approval_id, decisionsRaw)",
  "  const efetiva = { status: \"effective\" as const, decision: { decision_id: request.decision_ref, decision: \"APPROVED\" } } as any"),
 ("A2 decisor não-Stefano aceito", TS,
  "  if (!decisionAuthorizes(efetiva.decision.decision)) {",
  "  if (false) {"),
 ("A3 hash de conteúdo ignorado", TS,
  "  if (request.subject_content_hash !== fingerprint) {",
  "  if (false) {"),
 ("A4 SAME-X fora do fingerprint", TS,
  "    read_model_fingerprint: spec.read_model_fingerprint,",
  ""),
 ("A5 autorização forjada aceita", TS,
  "  if (!(auth instanceof LiveExecutionAuthorization) || !EMITIDAS.has(auth)) {",
  "  if (false) {"),
 ("A6 consumo duplo permitido", TS,
  "    if (this.consumida) return false",
  "    if (false) return false"),
 ("A7 TTL ignorado", TS,
  "  if (!Number.isFinite(idade) || idade >= auth.spec.authorization_ttl_seconds) {",
  "  if (false) {"),
 ("A8 política de controle da spec não conferida", TS,
  "  if (!politicaDeControleExata(ownedSpec)) {",
  "  if (false) {"),
 ("A9 pedido retirado aceito", TS,
  '  if (request.status === "WITHDRAWN") {',
  "  if (false) {"),
 ("A10 autorização serializável", TS,
  '    throw new Error("LIVE_AUTHORIZATION_NOT_SERIALIZABLE")',
  "    return undefined as never"),
 ("A11 prazo total removido da derivação", TS,
  "  if (restante > LIVE_ATTEMPT_DEADLINE_SECONDS) {",
  "  if (false) {"),
 ("A12 relógio de parede no lugar do monotônico", TS,
  "  return Number(process.hrtime.bigint() / 1_000_000n) / 1000",
  "  return Date.now() / 1000"),
 # ── CLIENTE (Python) ───────────────────────────────────────────────────────
 ("B1 max_retries omitido do cliente", PY_RT,
  '            "max_retries": GOVERNED_MAX_RETRIES,\n', ""),
 ("B2 max_retries = 2 (default do SDK)", PY_RT,
  "GOVERNED_MAX_RETRIES = 0", "GOVERNED_MAX_RETRIES = 2"),
 ("B3 max_retries = 1", PY_RT,
  "GOVERNED_MAX_RETRIES = 0", "GOVERNED_MAX_RETRIES = 1"),
 ("B4 retry vira material do vínculo (chamador escolhe)", PY_RT,
  '            "max_retries": GOVERNED_MAX_RETRIES,',
  '            "max_retries": self._execution_material.get("max_retries", 2),'),
 # ── CREATE (Python) ────────────────────────────────────────────────────────
 ("C1 background omitido da união", PY_CODEX,
  'CREATE_EXECUTION_CONTROL_FIELDS = ("background", "timeout")',
  'CREATE_EXECUTION_CONTROL_FIELDS = ("timeout",)'),
 ("C2 background=True aceito", PY_CODEX,
  "    if type(fundo) is not bool or fundo is not GOVERNED_BACKGROUND:",
  "    if False:"),
 ("C3 timeout omitido aceito", PY_CODEX,
  "    if chaves != set(CREATE_EXECUTION_CONTROL_FIELDS):",
  "    if False:"),
 ("C4 timeout None aceito", PY_CODEX,
  "    if type(prazo) is bool or type(prazo) not in (int, float):",
  "    if False:"),
 ("C5 timeout acima do teto aceito", PY_CODEX,
  "    if prazo > LIVE_ATTEMPT_DEADLINE_SECONDS:",
  "    if False:"),
 ("C6 timeout não-positivo aceito", PY_CODEX,
  "    if prazo <= 0:", "    if False:"),
 ("C7 timeout não-finito aceito", PY_CODEX,
  '    if prazo != prazo or prazo in (float("inf"), float("-inf")):  # NaN e infinitos',
  "    if False:"),
 ("C8 chave inesperada na invocação final", PY_CODEX,
  "    if chaves != set(FINAL_CREATE_FIELDS):", "    if False:"),
 ("C9 superfície verificada volta a cobrir só 5", PY_CODEX,
  "REQUIRED_CREATE_PARAMS = FINAL_CREATE_FIELDS",
  "REQUIRED_CREATE_PARAMS = REQUEST_FIELDS"),
 ("C10 controles não conferidos antes da chamada", PY_EX,
  "        controles = enforce_execution_controls(run.execution_controls)",
  "        controles = dict(run.execution_controls or {})"),
 ("C11 união final não conferida", PY_EX,
  "        enforce_final_create_kwargs(enviado)", "        pass"),
]

env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
mortos = vivos = defeitos = 0; guardas = 0
for rotulo, rel, alvo, veneno in MUTACOES:
    base = pathlib.Path(tempfile.mkdtemp()); trab = base / "intelligence"
    shutil.copytree(RAIZ, trab, ignore=shutil.ignore_patterns(
        "__pycache__", "node_modules", ".git", "*.pyc"))
    guarda = rel.endswith("\0guarda")
    rel = rel.split("\0")[0]
    p = trab / rel
    antes = p.read_text(encoding="utf-8")
    if alvo not in antes:
        print(f"  ⚠  BANCADA: alvo ausente em {rel} — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    depois = antes.replace(alvo, veneno, 1)
    if depois == antes:
        print(f"  ⚠  BANCADA: mutação no-op — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    p.write_text(depois, encoding="utf-8")

    if rel == TS:
        (trab / "node_modules").symlink_to(RAIZ / "node_modules")
        r = subprocess.run(["npx", "vitest", "run", "gateway/tests/live-execution.test.ts"],
                           cwd=trab, capture_output=True, text=True, env=env)
    else:
        r = subprocess.run([sys.executable, "-B", "-m", "unittest",
                            "tests.test_d1_execution_controls", "tests.test_r3_codex_executor",
                            "tests.test_r6_producao"],
                           cwd=trab / "bridge", capture_output=True, text=True, env=env)
    morto = r.returncode != 0
    if guarda:
        # Esperado VIVO. Morrer significaria que a guarda É alcançável de fora.
        if morto:
            print(f"  ALCANÇÁVEL  {rotulo}"); defeitos += 1
        else:
            print(f"  guarda  {rotulo} (inalcançável pelo caminho governado, esperado)")
            guardas += 1
    else:
        mortos += morto; vivos += (not morto)
        print(f"  {'MORTO ' if morto else 'VIVO  '} {rotulo}")
        if not morto:
            print("         ↑ nenhuma regressão observou esta reversão")
    shutil.rmtree(base)
print(f"\n  {len(MUTACOES)} mutações D1 · {mortos} mortas · {vivos} vivas · "
      f"{guardas} guardas inalcançáveis · {defeitos} defeitos de bancada")
sys.exit(1 if (vivos or defeitos) else 0)
