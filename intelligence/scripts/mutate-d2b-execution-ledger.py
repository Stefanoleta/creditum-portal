"""
BANCADA 3.1d-D2B — runner. Toda a lógica vive em `d2b_harness.py`, que é o MESMO
ponto de entrada usado pelos autotestes.

Este arquivo não contém definição de mutação alguma: o manifesto de ENTRADA governa.
Os totais saem da LEITURA DE VOLTA do manifesto de resultado, nunca de contador local.

Rodar de `intelligence/`.
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import d2b_harness as H

man, sha = H.carrega_manifesto()
print(f"  manifesto: {H.MANIFESTO_ENTRADA.name} · {man['manifest_version']} · sha256 {sha[:16]}")
print(f"  {len(man['mutations'])} mutações · {len(man['historical_excluded'])} históricas excluídas\n")

entradas = []
for e in man["mutations"]:
    cat, det, prova = H.executa_entrada(e)
    marca = {"KILLED_CAUSALLY": "MORTO/causal", "STRUCTURALLY_UNREACHABLE": "estrutural",
             "SURVIVED": "VIVO", "INVALID_MUTATION": "INVÁLIDA",
             "ENVIRONMENT_FAILURE": "AMBIENTE", "HARNESS_DEFECT": "BANCADA",
             "STRUCTURAL_PROOF_FAILED": "PROVA FALHOU"}.get(cat, cat)
    print(f"  {marca:14} {e['id']:9} {e['rotulo'][:64]}\n                 [{det[:96]}]")
    entradas.append({"id": e["id"], "status": e["status"], "property": e["property"],
                     "classification": cat, "detail": det, **prova})

# ─── serializar → reler → validar evidência → totalizar ─────────────────────
# O MESMO finalizador que os autotestes exercitam.
t, cont = H.finaliza(entradas, man, sha, H.MANIFESTO_RESULTADO)

print(f"\n  resultado: {H.MANIFESTO_RESULTADO.name} (lido de volta e validado por EVIDÊNCIA)")
print(f"  ATIVAS: {cont['ACTIVE']} · ESTRUTURAIS: {cont['STRUCTURAL']}"
      f" · HISTÓRICAS EXCLUÍDAS: {cont['HISTORICAL']}   (contagem vinda do MANIFESTO)")
for c in ("KILLED_CAUSALLY", "SURVIVED", "INVALID_MUTATION", "STRUCTURALLY_UNREACHABLE",
          "STRUCTURAL_PROOF_FAILED", "HARNESS_DEFECT", "ENVIRONMENT_FAILURE"):
    print(f"  {c}: {t[c]}")
print("  (ATIVAS/ESTRUTURAIS do manifesto de entrada; desfechos do resultado validado)")

ruim = (t["SURVIVED"] + t["INVALID_MUTATION"] + t["HARNESS_DEFECT"]
        + t["ENVIRONMENT_FAILURE"] + t["STRUCTURAL_PROOF_FAILED"] + t["REACHABLE_GUARD"])
sys.exit(1 if ruim else 0)
