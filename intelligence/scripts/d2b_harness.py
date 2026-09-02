"""
EXECUTOR GOVERNADO DE MUTAÇÃO — 3.1d-D2B-R8.

O instrumento de medição virou objeto de governança, porque errou seis vezes:

  r1-5      mutação morreu → mas pelo invariante?
  LAUNDER1  mutação morreu → mas modela o defeito?
  SYM1      mutação morreu → mas pelo teste certo?
  B1/B3     teste nomeado falhou → mas exercita o caminho?
  B5/B7     teste nomeado falhou → mas OBSERVOU o estado inseguro?
  r7        oráculo observado → mas a execução estava SÃ? e o total vem de onde?

Arquitetura desta versão:

  MANIFESTO versionado (ENTRADA)
    → validação de schema
    → aplicação da mutação com cardinalidade exigida
    → baseline do teste esperado NA MESMA CÓPIA
    → execução focada do mutante
    → SAÚDE do processo  ← precede o oráculo
    → oráculo de estado inseguro
    → prova estrutural, quando for o caso
    → manifesto de RESULTADO, ligado ao hash da entrada
    → totais derivados da LEITURA DE VOLTA do resultado

Nenhuma lista paralela em Python governa execução ou contagem.
"""
import hashlib, io, json, os, pathlib, re, shutil, subprocess, tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MANIFESTO_ENTRADA = RAIZ / "scripts" / "d2b-mutation-manifest.json"
MANIFESTO_RESULTADO = RAIZ / "scripts" / "d2b-mutation-results.json"
MARCA = "CREDITUM_UNSAFE_ORACLE::"

SUITES = [
    "gateway/tests/execution-supervisor.test.ts",
    "gateway/tests/execution-ledger-durability.test.ts",
    "gateway/tests/execution-ledger-no-rollback.test.ts",
]
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")

CLASSES = {
    "KILLED_CAUSALLY", "SURVIVED", "INVALID_MUTATION", "ENVIRONMENT_FAILURE",
    "HARNESS_DEFECT", "STRUCTURALLY_UNREACHABLE", "STRUCTURAL_PROOF_FAILED",
    "REACHABLE_GUARD",
}


class ManifestoInvalido(Exception):
    pass


# ═════════════════════════════════════════════════════════════════════════════
# Manifesto de ENTRADA — schema fechado, falha fechada
# ═════════════════════════════════════════════════════════════════════════════

def carrega_manifesto(caminho=MANIFESTO_ENTRADA):
    bruto = pathlib.Path(caminho).read_bytes()
    sha = hashlib.sha256(bruto).hexdigest()
    man = json.loads(bruto)
    valida_manifesto(man)
    return man, sha


VERSOES_MANIFESTO = {"d2b-mutations/1.0.0"}
VERSAO_RESULTADO = "d2b-mutation-results/1.0.0"
CAMPOS_TOPO = {"manifest_version", "generated_for", "note", "historical_excluded", "mutations"}
TIMEOUT_TESTE_S = 900


def _inteiro_real(v):
    """`bool` é subclasse de `int` em Python: `True` NÃO é cardinalidade."""
    return isinstance(v, int) and not isinstance(v, bool) and v >= 1


def valida_manifesto(man):
    # Versão por DESPACHO EXATO. Prefixo aceitava `d2b-mutations/not-semver` e o
    # executor interpretava com semântica 1.0.0 — falha aberta.
    if man.get("manifest_version") not in VERSOES_MANIFESTO:
        raise ManifestoInvalido(f"versão não suportada: {man.get('manifest_version')!r}")
    desconhecidos = set(man) - CAMPOS_TOPO
    if desconhecidos:
        raise ManifestoInvalido(f"campos de topo desconhecidos: {sorted(desconhecidos)}")
    for col in ("mutations", "historical_excluded"):
        if not isinstance(man.get(col), list):
            raise ManifestoInvalido(f"coleção obrigatória ausente ou de tipo errado: {col}")
    vistos = set()
    for e in man.get("mutations", []):
        mid = e.get("id")
        if not mid:
            raise ManifestoInvalido("entrada sem id")
        if mid in vistos:
            raise ManifestoInvalido(f"id duplicado: {mid}")
        vistos.add(mid)
        if e.get("status") not in ("ACTIVE", "STRUCTURAL"):
            raise ManifestoInvalido(f"{mid}: status desconhecido")
        if not e.get("property"):
            raise ManifestoInvalido(f"{mid}: sem property")
        t = e.get("transformation") or {}
        if t.get("kind") != "literal_replace" or not t.get("find"):
            raise ManifestoInvalido(f"{mid}: transformação inválida")
        if not _inteiro_real(t.get("expected_cardinality")):
            raise ManifestoInvalido(f"{mid}: cardinalidade inválida (bool não é inteiro)")
        if not (RAIZ / e.get("source_file", "")).exists():
            raise ManifestoInvalido(f"{mid}: source_file inexistente")
        if e["status"] == "ACTIVE":
            if not e.get("expected_test"):
                raise ManifestoInvalido(f"{mid}: ACTIVE sem expected_test")
            if not e.get("unsafe_oracle"):
                raise ManifestoInvalido(f"{mid}: ACTIVE sem unsafe_oracle")
        else:
            pr = e.get("structural_proof") or {}
            for campo in ("structural_proof_id", "claim", "required_assumptions",
                          "reason_no_reachable_state", "validator"):
                if not pr.get(campo):
                    raise ManifestoInvalido(f"{mid}: prova estrutural sem {campo}")
    for h in man["historical_excluded"]:
        if h.get("id") in vistos:
            raise ManifestoInvalido(f"id histórico colide com ativo/estrutural: {h.get('id')}")
        if h.get("id") in (hid := set()) :
            raise ManifestoInvalido("id histórico duplicado")
        vistos.add(h.get("id"))
        if not h.get("reason"):
            raise ManifestoInvalido(f"histórica {h.get('id')}: sem reason")
        if not (h.get("covered_by") or h.get("merged_into") or h.get("superseded_by")):
            raise ManifestoInvalido(f"histórica {h.get('id')}: sem covered_by/merged_into")
    return True


# ═════════════════════════════════════════════════════════════════════════════
# Aplicação da mutação — cardinalidade exigida, no-op é INVÁLIDA
# ═════════════════════════════════════════════════════════════════════════════

def aplica_mutacao(arquivo: pathlib.Path, transformacao: dict):
    """Devolve (ok, detalhe, texto_mutado). Alvo ausente, cardinalidade errada ou
    no-op NUNCA podem virar kill — são INVALID_MUTATION."""
    antes = arquivo.read_text(encoding="utf-8")
    achado = transformacao["find"]
    n = antes.count(achado)
    esperado = transformacao["expected_cardinality"]
    if n == 0:
        return False, "alvo ausente", None
    if n != esperado:
        return False, f"cardinalidade {n} ≠ {esperado} exigida", None
    depois = antes.replace(achado, transformacao.get("replace", ""), 1)
    if depois == antes:
        return False, "no-op: a fonte não mudou", None
    return True, "aplicada", depois


# ═════════════════════════════════════════════════════════════════════════════
# Execução focada — saúde estruturada ANTES do oráculo
# ═════════════════════════════════════════════════════════════════════════════

FALHAS_DE_AMBIENTE = (
    "ENOSPC", "EPERM", "EACCES", "EROFS", "EMFILE", "ENFILE",
    "vite-temp", "Failed to load", "Cannot find module",
    "Error: ENOENT: no such file or directory, mkdtemp",
)


def saude(saida: str, rc: int, timeout: bool = False) -> tuple[str, str]:
    """
    ─── PRECEDÊNCIA ────────────────────────────────────────────────────────────
    A r7 aceitava o oráculo antes de olhar a saúde da execução. Um mutante que
    emitisse a marca e então visse o Vitest morrer por EPERM virava KILLED_CAUSALLY.
    Falha de ambiente passa NA FRENTE do kill.
    """
    if timeout:
        return "ENVIRONMENT_FAILURE", "timeout do subprocesso"
    # `rc` NUNCA pode ser ignorado. A r8 o recebia e não o usava: rc=137 (SIGKILL) com
    # oráculo no stdout virava KILLED_CAUSALLY. Saída normal do Vitest é 0 (tudo passou)
    # ou 1 (teste falhou). Qualquer outra é término anormal.
    if rc not in (0, 1):
        return "ENVIRONMENT_FAILURE", f"término anormal: rc={rc}"
    for marca in FALHAS_DE_AMBIENTE:
        if marca in saida:
            return "ENVIRONMENT_FAILURE", f"ambiente: {marca}"
    if "Test Files" not in saida and "No test files found" not in saida:
        return "ENVIRONMENT_FAILURE", "execução não produziu sumário de testes"
    if re.search(r"Error: Vitest failed to (start|access)", saida):
        return "ENVIRONMENT_FAILURE", "falha de inicialização do runner"
    return "ok", ""


def _runner_real(trab: pathlib.Path, padrao: str):
    """Execução real, com TIMEOUT finito. Sem ele um Vitest travado pendura a bancada."""
    try:
        r = subprocess.run(["npx", "vitest", "run", *SUITES, "-t", padrao],
                           cwd=trab, capture_output=True, text=True, env=env,
                           timeout=TIMEOUT_TESTE_S)
        return r.returncode, r.stdout + r.stderr, False
    except subprocess.TimeoutExpired:
        return -1, "", True


RUNNER = _runner_real  # injetável: os autotestes trocam por um determinístico


def roda_focado(trab: pathlib.Path, padrao: str):
    rc, s, expirou = RUNNER(trab, padrao)
    m = re.search(r"Tests\s+(?:(\d+) failed \| )?(\d+) passed", s)
    mf = re.search(r"Tests\s+(\d+) failed", s)
    return {
        "rc": rc,
        "timeout": expirou,
        "passou": int(m.group(2)) if m else 0,
        "falhou": int(mf.group(1)) if mf else 0,
        "oraculos": set(re.findall(re.escape(MARCA) + r"([A-Z_]+)", s)),
        "saida": s,
    }


def classifica_ativa(trab: pathlib.Path, arquivo: pathlib.Path, entrada: dict):
    """Classificação de uma mutação ACTIVE. Ordem: aplicação → saúde → oráculo."""
    padrao, oraculo = entrada["expected_test"], entrada["unsafe_oracle"]

    # (1) aplicação
    ok, det, mutado = aplica_mutacao(arquivo, entrada["transformation"])
    if not ok:
        return "INVALID_MUTATION", det, {}

    # (2) baseline NA MESMA CÓPIA
    b = roda_focado(trab, padrao)
    hb, db = saude(b["saida"], b["rc"], b["timeout"])
    if hb != "ok":
        return "ENVIRONMENT_FAILURE", f"baseline: {db}", {}
    if b["rc"] != 0 or b["passou"] == 0:
        return "HARNESS_DEFECT", f"baseline do teste esperado não passou (n={b['passou']})", {}
    if oraculo in b["oraculos"]:
        return "HARNESS_DEFECT", "oráculo observado no BASELINE", {}

    # (3) mutante
    arquivo.write_text(mutado, encoding="utf-8")
    m = roda_focado(trab, padrao)
    hm, dm = saude(m["saida"], m["rc"], m["timeout"])
    prova = {
        "baseline_health": "HEALTHY",
        "baseline_expected_test_result": f"{b['passou']} passed",
        "mutation_application": "APPLIED",
        "mutant_health": "HEALTHY" if hm == "ok" else hm,
        "process_rc": m["rc"],
        "timeout": m["timeout"],
        "expected_test_result": f"{m['passou']} passed / {m['falhou']} failed",
        "unsafe_oracle_observed": oraculo in m["oraculos"],
    }
    # (4) SAÚDE ANTES DO ORÁCULO
    if hm != "ok":
        return "ENVIRONMENT_FAILURE", f"mutante: {dm}", prova
    if oraculo in m["oraculos"]:
        return "KILLED_CAUSALLY", f"oráculo {oraculo} observado", prova
    if m["falhou"] > 0:
        return "INVALID_MUTATION", "teste falhou sem observar o oráculo", prova
    if m["passou"] > 0:
        return "SURVIVED", "teste esperado passou, oráculo ausente", prova
    return "ENVIRONMENT_FAILURE", "nem passou nem falhou", prova


# ═════════════════════════════════════════════════════════════════════════════
# Prova ESTRUTURAL — nunca inferida de suíte verde
# ═════════════════════════════════════════════════════════════════════════════

def _fonte(rel: str) -> str:
    return (RAIZ / rel).read_text(encoding="utf-8")


def prova_exports_sem_selo_e_recibo_so_no_ledger(entrada):
    """B6b: o ramo exige recibo NÃO autêntico E o selo privado; nenhum export dá isso."""
    sup, led = _fonte("gateway/src/execution-supervisor.ts"), _fonte("gateway/src/execution-ledger.ts")
    falhas = []
    if re.search(r"export\s+(const|let|var|\{[^}]*)\s*SELO_TENTATIVA", sup):
        falhas.append("SELO_TENTATIVA aparece exportado")
    if "SELO_TENTATIVA" not in sup:
        falhas.append("SELO_TENTATIVA ausente — a guarda mudou de forma")
    if "if (selo !== SELO_TENTATIVA)" not in sup:
        falhas.append("o construtor não exige o selo")
    if re.search(r"export\s+(const|let|var)\s+SELO_RECIBO", led):
        falhas.append("SELO_RECIBO aparece exportado")
    if "RECIBOS.add(" not in led:
        falhas.append("nenhum ponto de cunhagem de recibo no livro-razão")
    if led.count("new DurableReservationReceipt(") != 1:
        falhas.append("recibo cunhado em mais de um ponto")
    if "isDurableReservationReceipt(receipt)" not in sup:
        falhas.append("o construtor não exige recibo autêntico")
    return (not falhas), ("; ".join(falhas) or "selo privado + cunhagem única confirmados")


def prova_attempts_e_filho_literal_e_lstat_no_follow(entrada):
    """CONTAIN1: attempts é filho LITERAL da raiz e ambos são validados no-follow."""
    led = _fonte("gateway/src/execution-ledger.ts")
    falhas = []
    if 'join(ledgerRoot, "attempts")' not in led:
        falhas.append("`attempts` não é derivado literalmente de join(raiz, \"attempts\")")
    if "await lstat(caminho)" not in led:
        falhas.append("validação não usa lstat")
    if "st.isSymbolicLink()" not in led:
        falhas.append("symlink não é recusado")
    if "diretorioRealNaoLink(raiz)" not in led:
        falhas.append("a raiz não passa pela validação no-follow")
    if "attemptsRealNaoLink(paiTentativas)" not in led:
        falhas.append("`attempts` não passa pela validação no-follow")
    return (not falhas), ("; ".join(falhas) or "filho literal + no-follow em raiz e attempts confirmados")


VALIDADORES = {
    "exports_sem_selo_e_recibo_so_no_ledger": prova_exports_sem_selo_e_recibo_so_no_ledger,
    "attempts_e_filho_literal_e_lstat_no_follow": prova_attempts_e_filho_literal_e_lstat_no_follow,
}


def prova_ast(proof_id: str, arquivos: list) -> tuple[bool, dict]:
    """Chama o provador em AST. Substring não prova inalcançabilidade governada."""
    r = subprocess.run(["npx", "tsx", str(RAIZ / "scripts" / "d2b-structural-prover.mjs"),
                        proof_id, *arquivos],
                       cwd=RAIZ, capture_output=True, text=True, env=env,
                       timeout=TIMEOUT_TESTE_S)
    try:
        d = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return False, {"failures": [f"provador não produziu JSON (rc={r.returncode})"]}
    return bool(d.get("ok")), d


ARQUIVOS_PROVA = {
    "receipt-seal-unreachable": ["gateway/src/execution-supervisor.ts",
                                 "gateway/src/execution-ledger.ts"],
    "canonical-containment-by-construction": ["gateway/src/execution-ledger.ts"],
}


def classifica_estrutural(entrada: dict):
    """
    Sobrevivência de teste NÃO é prova. A r7 promovia qualquer guarda verde a
    STRUCTURALLY_UNREACHABLE — o mesmo erro que a r2 já havia cobrado em outro nível.
    Aqui a classificação vem do VALIDADOR declarado no manifesto.
    """
    pr = entrada["structural_proof"]
    pid = pr.get("structural_proof_id")
    arquivos = ARQUIVOS_PROVA.get(pid)
    if arquivos is None:
        return "STRUCTURAL_PROOF_FAILED", f"proof_id desconhecido: {pid}", {
            "structural_proof_id": pid, "structural_proof_result": "PROOF_ID_UNKNOWN"}
    ok, d = prova_ast(pid, arquivos)
    prova = {
        "structural_proof_id": pid,
        "structural_proof_result": "PASS" if ok else "FAIL",
        "verified": d.get("verified", []),
        "failures": d.get("failures", []),
        "declarative_assumptions": d.get("declarative_assumptions", []),
    }
    if not ok:
        return "STRUCTURAL_PROOF_FAILED", "; ".join(d.get("failures", []))[:120], prova
    return "STRUCTURALLY_UNREACHABLE", f"{len(d.get('verified', []))} fatos verificados em AST", prova


# ═════════════════════════════════════════════════════════════════════════════
# Cópia isolada
# ═════════════════════════════════════════════════════════════════════════════

def prepara_copia():
    base = pathlib.Path(tempfile.mkdtemp())
    trab = base / "intelligence"
    shutil.copytree(RAIZ, trab, ignore=shutil.ignore_patterns(
        "__pycache__", "node_modules", ".git", "*.pyc"))
    (trab / "node_modules").symlink_to(RAIZ / "node_modules")
    return base, trab


def executa_entrada(entrada: dict):
    """Ponto de entrada ÚNICO — o runner de produção e os autotestes usam este."""
    if entrada["status"] == "STRUCTURAL":
        return classifica_estrutural(entrada)
    base, trab = prepara_copia()
    try:
        return classifica_ativa(trab, trab / entrada["source_file"], entrada)
    finally:
        shutil.rmtree(base, ignore_errors=True)


# ═════════════════════════════════════════════════════════════════════════════
# Resultado — ligado ao hash da entrada, com totais derivados da leitura de volta
# ═════════════════════════════════════════════════════════════════════════════

def _exige(cond, msg, falhas):
    if not cond:
        falhas.append(msg)


def evidencia_valida(r: dict, status_manifesto: str) -> list:
    """
    RE-DERIVA se a classificação é compatível com a evidência anexa.

    A r8 conferia hash, ids e compatibilidade grosseira. O regate adulterou
    `baseline_health`, `mutation_application`, `unsafe_oracle_observed` e removeu a
    prova estrutural — e a validação devolveu True com 20 kills. `classification` era
    uma string que ninguém confrontava com os fatos que a acompanham.
    """
    f = []
    c = r.get("classification")
    _exige(r.get("status") == status_manifesto,
           f"{r.get('id')}: status do resultado ≠ status do manifesto", f)

    if c == "KILLED_CAUSALLY":
        _exige(status_manifesto == "ACTIVE", "kill exige status ACTIVE", f)
        _exige(r.get("baseline_health") == "HEALTHY", "kill sem baseline sã", f)
        _exige(r.get("baseline_expected_test_result", "").endswith("passed"),
               "kill sem teste esperado passando no baseline", f)
        _exige(r.get("mutation_application") == "APPLIED", "kill sem mutação aplicada", f)
        _exige(r.get("mutant_health") == "HEALTHY", "kill com mutante insalubre", f)
        _exige(r.get("unsafe_oracle_observed") is True, "kill sem oráculo observado", f)
        _exige(r.get("timeout") is False, "kill com timeout", f)
        _exige(r.get("process_rc") in (0, 1), f"kill com rc anormal: {r.get('process_rc')}", f)
    elif c == "SURVIVED":
        _exige(status_manifesto == "ACTIVE", "survived exige status ACTIVE", f)
        _exige(r.get("mutation_application") == "APPLIED", "survived sem mutação aplicada", f)
        _exige(r.get("unsafe_oracle_observed") is False, "survived com oráculo observado", f)
    elif c == "INVALID_MUTATION":
        _exige(status_manifesto == "ACTIVE", "inválida exige status ACTIVE", f)
    elif c == "STRUCTURALLY_UNREACHABLE":
        _exige(status_manifesto == "STRUCTURAL", "estrutural exige status STRUCTURAL", f)
        _exige(r.get("structural_proof_result") == "PASS", "estrutural sem prova PASS", f)
        _exige(bool(r.get("structural_proof_id")), "estrutural sem proof_id", f)
        _exige(bool(r.get("verified")), "estrutural sem fatos verificados", f)
    elif c == "STRUCTURAL_PROOF_FAILED":
        _exige(status_manifesto == "STRUCTURAL", "falha de prova exige status STRUCTURAL", f)
    elif c in ("ENVIRONMENT_FAILURE", "HARNESS_DEFECT"):
        pass
    else:
        f.append(f"{r.get('id')}: classificação desconhecida {c!r}")
    return f


def valida_resultado(res: dict, man: dict, sha: str):
    if res.get("result_version") != VERSAO_RESULTADO:
        raise ManifestoInvalido(f"versão de resultado não suportada: {res.get('result_version')!r}")
    if res.get("input_manifest_version") != man["manifest_version"]:
        raise ManifestoInvalido("versão do manifesto de entrada divergente")
    if res.get("input_manifest_sha256") != sha:
        raise ManifestoInvalido("resultado não corresponde ao manifesto de entrada")
    if not isinstance(res.get("entries"), list):
        raise ManifestoInvalido("entries ausente ou de tipo errado")

    ids_man = {e["id"]: e["status"] for e in man["mutations"]}
    vistos, falhas = set(), []
    for r in res["entries"]:
        rid = r.get("id")
        if rid not in ids_man:
            raise ManifestoInvalido(f"resultado com id desconhecido: {rid}")
        if rid in vistos:
            raise ManifestoInvalido(f"resultado duplicado: {rid}")
        vistos.add(rid)
        falhas += evidencia_valida(r, ids_man[rid])
    faltando = set(ids_man) - vistos
    if faltando:
        raise ManifestoInvalido(f"resultado incompleto: falta {sorted(faltando)}")
    if falhas:
        raise ManifestoInvalido("evidência incompatível: " + "; ".join(falhas[:6]))
    return True


def contagem_por_status(man: dict) -> dict:
    """ATIVAS/ESTRUTURAIS vêm do MANIFESTO DE ENTRADA — nunca do resultado, que pode
    ter sido adulterado. Foi assim que o regate mudou 20 para 19."""
    t = {"ACTIVE": 0, "STRUCTURAL": 0}
    for e in man["mutations"]:
        t[e["status"]] += 1
    t["HISTORICAL"] = len(man["historical_excluded"])
    return t


def totais(res: dict) -> dict:
    """Contagem derivada EXCLUSIVAMENTE das entradas do resultado lido de volta."""
    t = {c: 0 for c in CLASSES}
    for r in res["entries"]:
        t[r["classification"]] += 1
    return t


def finaliza(entradas: list, man: dict, sha: str, caminho: pathlib.Path):
    """
    Serializa → relê → valida schema+evidência → totaliza.

    Ponto ÚNICO. O runner e os autotestes de contabilidade passam por aqui; a r8
    tinha um teste que chamava `totais` sobre objeto de memória e nunca escrevia,
    relia nem validava — exatamente onde o bloqueio morava.
    """
    res = {
        "result_version": VERSAO_RESULTADO,
        "input_manifest_version": man["manifest_version"],
        "input_manifest_sha256": sha,
        "entries": entradas,
    }
    caminho.write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    relido = json.loads(caminho.read_text(encoding="utf-8"))
    valida_resultado(relido, man, sha)          # levanta ManifestoInvalido se algo não bate
    return totais(relido), contagem_por_status(man)
