"""
AUTOTESTE DO EXECUTOR 3.1d-D2B-R8.

O regate cobrou que os 5/5 anteriores chamavam o classificador direto e por isso NÃO
testavam a aplicação da mutação — alvo ausente, cardinalidade e no-op nunca eram
exercitados. Agora todo cenário passa pelo MESMO ponto de entrada do runner:
`d2b_harness.executa_entrada` / `aplica_mutacao`.
"""
import copy, json, pathlib, sys, tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import d2b_harness as H

LED = "gateway/src/execution-ledger.ts"
SUP = "gateway/src/execution-supervisor.ts"

EEXIST_ALVO = '''    if (codigo === "EEXIST") {
      // Existe. Queimado — não importa o que haja dentro.
      return { status: "refused", defect: "EXECUTION_ALREADY_RESERVED" }
    }'''
EEXIST_FIEL = '''    if (codigo === "EEXIST") {
      const rr = new DurableReservationReceipt(SELO_RECIBO, executionId, chave, executionFingerprint)
      RECIBOS.add(rr)
      return { status: "reserved", execution_key: chave, attempt_directory: dirTentativa, receipt: rr }
    }'''


def ativa(mid, arquivo, find, replace, teste, oraculo, card=1):
    return {"id": mid, "status": "ACTIVE", "rotulo": mid, "source_file": arquivo,
            "property": "cenário de autoteste", "expected_test": teste,
            "unsafe_oracle": oraculo,
            "transformation": {"kind": "literal_replace", "find": find,
                               "replace": replace, "expected_cardinality": card}}


DUPLA = "duas autorizações legítimas para o mesmo id"
ORAC_CAP = "UNSAFE_SECOND_RESERVED_CAPACITY"

CENARIOS = [
 ("kill causal: mutante fiel produz o estado inseguro",
  ativa("SELF_KILL", LED, EEXIST_ALVO, EEXIST_FIEL, DUPLA, ORAC_CAP), "KILLED_CAUSALLY"),

 ("sobrevivente: mutante inócuo, oráculo ausente, teste passa",
  ativa("SELF_SURV", LED,
        'export const EXECUTION_COMMIT_RECORD_TYPE = "creditum_live_execution_commit/v1"',
        'export const EXECUTION_COMMIT_RECORD_TYPE = "creditum_live_execution_commit/v1" // inócuo',
        DUPLA, ORAC_CAP), "SURVIVED"),

 ("exceção antes do oráculo não é kill",
  ativa("SELF_THROW", SUP, "  const reserva = await reserveExecutionAttempt(",
        "  ;(null as any).boom\n  const reserva = await reserveExecutionAttempt(",
        DUPLA, ORAC_CAP), "INVALID_MUTATION"),

 ("falha de ambiente não é kill",
  ativa("SELF_ENV", "gateway/tests/oracle.ts", "export function oraculo(",
        'import "./inexistente-proposital"\nexport function oraculo(',
        DUPLA, ORAC_CAP), "ENVIRONMENT_FAILURE"),

 ("ALVO AUSENTE → inválida, nunca kill",
  ativa("SELF_NOTARGET", LED, "ESTE_TEXTO_NAO_EXISTE_NO_FONTE", "x", DUPLA, ORAC_CAP),
  "INVALID_MUTATION"),

 ("CARDINALIDADE divergente → inválida",
  ativa("SELF_CARD", LED, "return", "return", DUPLA, ORAC_CAP, card=1), "INVALID_MUTATION"),

 ("NO-OP (find == replace) → inválida",
  ativa("SELF_NOOP", LED, EEXIST_ALVO, EEXIST_ALVO, DUPLA, ORAC_CAP), "INVALID_MUTATION"),
]


# ═════════════════════════════════════════════════════════════════════════════
# Runner INJETÁVEL — os cenários de saúde passam por `executa_entrada`, não por
# `saude` direto. Era esse o desvio que o regate encontrou.
# ═════════════════════════════════════════════════════════════════════════════

def runner_fixo(rc, saida, timeout=False):
    def r(_trab, _padrao):
        return rc, saida, timeout
    return r


SAIDA_SA_PASSA = "Test Files  1 passed (1)\n Tests  1 passed (1)\n"
SAIDA_COM_ORACULO = ("Test Files  1 failed (1)\n Tests  1 failed | 0 passed\n"
                     f"{H.MARCA}{ORAC_CAP}\n")


def _com_runner(seq):
    """Sequência de respostas: [baseline, mutante]."""
    it = iter(seq)
    def r(_trab, _padrao):
        return next(it)
    return r


def cenario_via_executor(nome, respostas, exigido):
    entrada = ativa("SELF_H", LED, EEXIST_ALVO, EEXIST_FIEL, DUPLA, ORAC_CAP)
    original = H.RUNNER
    H.RUNNER = _com_runner(respostas)
    try:
        cat, det, _ = H.executa_entrada(entrada)
    finally:
        H.RUNNER = original
    return cat == exigido, f"obtido={cat} [{det[:60]}]"


def c_rc137():
    return cenario_via_executor("rc137", [
        (0, SAIDA_SA_PASSA, False),          # baseline sã
        (137, SAIDA_COM_ORACULO, False),     # oráculo presente, mas SIGKILL
    ], "ENVIRONMENT_FAILURE")


def c_oraculo_mais_ambiente():
    return cenario_via_executor("orac+env", [
        (0, SAIDA_SA_PASSA, False),
        (1, SAIDA_COM_ORACULO + "Error: ENOSPC: no space left, vite-temp\n", False),
    ], "ENVIRONMENT_FAILURE")


def c_timeout():
    return cenario_via_executor("timeout", [
        (0, SAIDA_SA_PASSA, False),
        (-1, "", True),
    ], "ENVIRONMENT_FAILURE")


def c_sumario_malformado():
    return cenario_via_executor("sumário incompleto", [
        (0, SAIDA_SA_PASSA, False),
        (1, f"{H.MARCA}{ORAC_CAP}\n(sem sumário de testes)\n", False),
    ], "ENVIRONMENT_FAILURE")


def c_kill_sadio():
    return cenario_via_executor("kill sadio", [
        (0, SAIDA_SA_PASSA, False),
        (1, SAIDA_COM_ORACULO, False),
    ], "KILLED_CAUSALLY")


# ═════════════════════════════════════════════════════════════════════════════
# Contabilidade pelo finalizador REAL: serializar → reler → validar → totalizar
# ═════════════════════════════════════════════════════════════════════════════

def _entradas_validas(man):
    ent = []
    for e in man["mutations"]:
        if e["status"] == "ACTIVE":
            ent.append({"id": e["id"], "status": "ACTIVE", "property": e["property"],
                        "classification": "KILLED_CAUSALLY", "detail": "",
                        "baseline_health": "HEALTHY",
                        "baseline_expected_test_result": "1 passed",
                        "mutation_application": "APPLIED", "mutant_health": "HEALTHY",
                        "process_rc": 1, "timeout": False, "unsafe_oracle_observed": True})
        else:
            ent.append({"id": e["id"], "status": "STRUCTURAL", "property": e["property"],
                        "classification": "STRUCTURALLY_UNREACHABLE", "detail": "",
                        "structural_proof_id": e["structural_proof"]["structural_proof_id"],
                        "structural_proof_result": "PASS", "verified": ["x"]})
    return ent


def _finaliza_tmp(ent, man, sha):
    d = pathlib.Path(tempfile.mkdtemp())
    try:
        return H.finaliza(ent, man, sha, d / "res.json")
    finally:
        __import__("shutil").rmtree(d, ignore_errors=True)


def adulteracao(nome, muta):
    def fn():
        man, sha = H.carrega_manifesto()
        ent = _entradas_validas(man)
        muta(ent, man, sha)
        try:
            _finaliza_tmp(ent, man, sha)
            return False, "ADULTERAÇÃO ACEITA"
        except H.ManifestoInvalido as ex:
            return True, str(ex)[:70]
    fn.__name__ = nome
    return fn


def _primeira_ativa(ent):
    return next(r for r in ent if r["status"] == "ACTIVE")


def c_finalizador_valido():
    man, sha = H.carrega_manifesto()
    t, cont = _finaliza_tmp(_entradas_validas(man), man, sha)
    ok = t["KILLED_CAUSALLY"] == cont["ACTIVE"] and cont["ACTIVE"] > 0
    return ok, f"kills={t['KILLED_CAUSALLY']} ativas(manifesto)={cont['ACTIVE']}"


ADULTERACOES = [
 ("kill com baseline quebrada", lambda e, m, s: _primeira_ativa(e).update(baseline_health="broken")),
 ("kill sem mutação aplicada", lambda e, m, s: _primeira_ativa(e).update(mutation_application="not-applied")),
 ("kill sem oráculo", lambda e, m, s: _primeira_ativa(e).update(unsafe_oracle_observed=False)),
 ("kill com mutante insalubre", lambda e, m, s: _primeira_ativa(e).update(mutant_health="broken")),
 ("kill com timeout", lambda e, m, s: _primeira_ativa(e).update(timeout=True)),
 ("kill com rc anormal", lambda e, m, s: _primeira_ativa(e).update(process_rc=137)),
 ("estrutural sem prova", lambda e, m, s: next(r for r in e if r["status"] == "STRUCTURAL").pop("structural_proof_result")),
 ("status ACTIVE trocado para STRUCTURAL", lambda e, m, s: _primeira_ativa(e).update(status="STRUCTURAL")),
 ("id desconhecido", lambda e, m, s: e.append({**_primeira_ativa(e), "id": "NAO_EXISTE"})),
 ("id duplicado", lambda e, m, s: e.append(dict(_primeira_ativa(e)))),
 ("resultado incompleto", lambda e, m, s: e.pop()),
]

MANIFESTOS_RUINS = [
 ("versão não suportada", lambda m: m.update(manifest_version="d2b-mutations/not-semver")),
 ("coleção mutations ausente", lambda m: m.pop("mutations")),
 ("cardinalidade booleana", lambda m: m["mutations"][0]["transformation"].update(expected_cardinality=True)),
 ("id histórico colidindo com ativo", lambda m: m["historical_excluded"].append(
     {"id": m["mutations"][0]["id"], "reason": "x", "covered_by": "y"})),
 ("campo de topo desconhecido", lambda m: m.update(campo_intruso=1)),
]


def manifesto_ruim(nome, muta):
    def fn():
        import copy as _c
        man, _ = H.carrega_manifesto()
        m2 = _c.deepcopy(man)
        muta(m2)
        try:
            H.valida_manifesto(m2)
            return False, "MANIFESTO RUIM ACEITO"
        except H.ManifestoInvalido as ex:
            return True, str(ex)[:70]
    fn.__name__ = nome
    return fn


def c_prova_forge_exportado():
    """Fonte sintética com helper EXPORTADO que constrói a capacidade → prova FALHA."""
    import subprocess as sp, shutil as sh
    d = pathlib.Path(tempfile.mkdtemp())
    try:
        sup = (H.RAIZ / "gateway/src/execution-supervisor.ts").read_text()
        sup += '\nexport function forjaCapacidade(spec: any, prazo: number): unknown {\n' \
               '  return new ReservedExecutionAttempt(SELO_TENTATIVA, {} as any, spec, prazo)\n}\n'
        (d / "sup.ts").write_text(sup)
        sh.copy(H.RAIZ / "gateway/src/execution-ledger.ts", d / "led.ts")
        r = sp.run(["npx", "tsx", str(H.RAIZ / "scripts/d2b-structural-prover.mjs"),
                    "receipt-seal-unreachable", str(d / "sup.ts"), str(d / "led.ts")],
                   cwd=H.RAIZ, capture_output=True, text=True, timeout=300)
        out = json.loads(r.stdout.strip().splitlines()[-1])
        return (not out["ok"]), ("REJEITADO: " + "; ".join(out["failures"])[:60]) if not out["ok"] else "ACEITO (!)"
    finally:
        sh.rmtree(d, ignore_errors=True)


def c_prova_codigo_morto():
    """Tokens de contenção só em função MORTA → prova FALHA."""
    import subprocess as sp, shutil as sh
    d = pathlib.Path(tempfile.mkdtemp())
    try:
        led = H.RAIZ.joinpath("gateway/src/execution-ledger.ts").read_text()
        # esvazia o corpo do entrypoint e joga os tokens numa função nunca chamada
        # Remove TODAS as chamadas do caminho vivo — a versão anterior deixava a
        # segunda (ramo EEXIST) intacta, então a função seguia alcançável e o
        # cenário testava menos do que dizia.
        led = led.replace("  const estadoPai = await attemptsRealNaoLink(paiTentativas)",
                          "  const estadoPai = 'ok' as const")
        led = led.replace('      if ((await attemptsRealNaoLink(paiTentativas)) !== "ok") {',
                          "      if (false) {")
        led = led.replace("  if (!(await contidoNaRaiz(ledgerRoot, paiTentativas))) {",
                          "  if (false) {")
        led += '\nasync function nuncaChamada(r: string) {\n' \
               '  await attemptsRealNaoLink(join(r, "attempts"))\n' \
               '  await contidoNaRaiz(r, join(r, "attempts"))\n}\n'
        (d / "led.ts").write_text(led)
        r = sp.run(["npx", "tsx", str(H.RAIZ / "scripts/d2b-structural-prover.mjs"),
                    "canonical-containment-by-construction", str(d / "led.ts")],
                   cwd=H.RAIZ, capture_output=True, text=True, timeout=300)
        out = json.loads(r.stdout.strip().splitlines()[-1])
        return (not out["ok"]), ("REJEITADO: " + "; ".join(out["failures"])[:60]) if not out["ok"] else "ACEITO (!)"
    finally:
        sh.rmtree(d, ignore_errors=True)


ESPECIAIS = (
 [("rc=137 + oráculo → não é kill", c_rc137),
  ("oráculo + falha de ambiente → ENVIRONMENT_FAILURE", c_oraculo_mais_ambiente),
  ("timeout → não é kill", c_timeout),
  ("sumário malformado + oráculo → não é kill", c_sumario_malformado),
  ("execução sadia + oráculo → KILLED_CAUSALLY", c_kill_sadio),
  ("finalizador real: serializar→reler→validar→totalizar", c_finalizador_valido),
  ("prova B6b: helper EXPORTADO que forja → rejeitado", c_prova_forge_exportado),
  ("prova CONTAIN1: tokens em código morto → rejeitado", c_prova_codigo_morto)]
 + [(f"adulteração rejeitada: {n}", adulteracao(n, f)) for n, f in ADULTERACOES]
 + [(f"manifesto rejeitado: {n}", manifesto_ruim(n, f)) for n, f in MANIFESTOS_RUINS]
)


print(f"  autoteste do executor — {len(CENARIOS) + len(ESPECIAIS)} cenários\n")
falhas = 0
for nome, entrada, exigido in CENARIOS:
    cat, det, _ = H.executa_entrada(entrada)
    ok = cat == exigido
    print(f"  {'OK  ' if ok else 'FALHA'} {nome}\n       exigido={exigido}  obtido={cat}  [{det[:70]}]")
    falhas += (not ok)
for nome, fn in ESPECIAIS:
    ok, det = fn()
    print(f"  {'OK  ' if ok else 'FALHA'} {nome}\n       [{det}]")
    falhas += (not ok)

n = len(CENARIOS) + len(ESPECIAIS)
print(f"\n  {n} cenários · {n - falhas} corretos · {falhas} falhas")
sys.exit(1 if falhas else 0)
