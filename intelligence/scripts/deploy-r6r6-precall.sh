#!/usr/bin/env bash
#
# R6-R6 — DEPLOY GOVERNADO + PRECALL, na Hostinger.
#
# ─── Por que esta versão existe ───────────────────────────────────────────────
#
# A primeira tentativa parou em produção com `unzip: command not found`. Parou certo:
# sem fallback, sem improviso, nada implantado. Mas a lição não é "achar outro unzip":
# é que a extração dependia de uma ferramenta externa E era CEGA — `unzip -q` escreve
# o que o arquivo mandar, inclusive `../` e symlink.
#
# Esta versão extrai com a biblioteca padrão do Python de produção, membro por membro,
# depois de validar cada nome. A dependência externa saiu e a extração deixou de ser
# um ato de fé.
#
# ─── O que ele faz ────────────────────────────────────────────────────────────
#
#   confere o SHA-256 do artefato ANTES de abrir
#   confere 12 entradas, os 11 hashes do manifesto e a higiene, EM MEMÓRIA
#   valida TODO nome de entrada: sem absoluto, sem `..`, sem escape, sem symlink,
#     sem device/especial, e o conjunto tem de ser EXATAMENTE o governado
#   extrai membro por membro para STAGING sob /data
#   reconfere os 11 hashes JÁ NO DISCO, no staging
#   só então PROMOVE o staging para o diretório versionado final
#   roda `--precall-probe` com o Python de produção
#
# ─── O que ele NÃO faz ────────────────────────────────────────────────────────
#
#   não usa unzip nem ferramenta externa   não instala nada, não usa apt
#   não chama modelo                       não chama responses.create
#   não constrói cliente OpenAI            não invoca provedor
#   não escreve configuração               não reinicia Hermes/gateway
#   não toca /opt/hermes-agent             não lê .env
#   não imprime api_key nem base_url       não executa LIVE
#   não apaga versão anterior              não sobrescreve destino existente
#   não apaga diretório parcial de produção que não seja o staging DESTA execução
#
# ─── Sem fallback ─────────────────────────────────────────────────────────────
#
# Qualquer conferência que falhe encerra != 0. Não há recuperação por variável de
# ambiente, não há caminho alternativo. E nada é promovido: uma extração incompleta
# nunca deixa um diretório final com aparência de válido.
#
# ─── Uso ──────────────────────────────────────────────────────────────────────
#
#   bash deploy-r6r6-precall.sh /caminho/para/HERMES_..._R6_R6_..._RUNTIME.bin
#
# A extensão não importa: a etapa 1 confere o hash e a 2 lê pelo conteúdo.
#
set -u

ESPERADO_SHA="b8a1ca4e9717a3ca6c2927985fc57f9c1e83c34b7ef08e36ee4207189e1a53df"
ESPERADO_ENTRADAS=12
RAIZ_DEPLOY="/data/creditum_hermes_runtime"
VERSAO="r6_r6"
DESTINO="${RAIZ_DEPLOY}/${VERSAO}"
#: Staging com PID: esta execução só remove o SEU próprio staging. Um staging de
#: execução anterior é conflito a relatar, não lixo a apagar.
STAGING="${RAIZ_DEPLOY}/.staging_${VERSAO}_$$"

falha() { printf '\n✖ PARADA: %s\n' "$*" >&2; limpar_staging; exit 1; }
etapa() { printf '\n── %s\n' "$*"; }
limpar_staging() {
  # Só o staging desta execução, e só se não houve promoção.
  if [ "${PROMOVIDO:-0}" = "0" ] && [ -n "${STAGING:-}" ] && [ -d "$STAGING" ]; then
    rm -rf "$STAGING" && printf '   staging desta execução removido: %s\n' "$STAGING" >&2
  fi
}
PROMOVIDO=0

ZIP="${1:-}"
[ -n "$ZIP" ] || { printf '\n✖ PARADA: informe o caminho do artefato. Uso: bash %s <arquivo>\n' "$0" >&2; exit 1; }
[ -f "$ZIP" ] || { printf '\n✖ PARADA: ARTIFACT_NOT_FOUND — %s\n' "$ZIP" >&2; exit 1; }

# ─── 0. Python de produção — FAIL CLOSED ─────────────────────────────────────
etapa "0/8  interpretador de produção"
PY_PROD=""
for cand in /opt/venv/bin/python /opt/venv/bin/python3; do
  [ -x "$cand" ] && { PY_PROD="$cand"; break; }
done
[ -n "$PY_PROD" ] || falha "PRODUCTION_PYTHON_NOT_FOUND — /opt/venv/bin/python(3) ausente. Não instalar nada; não usar outro interpretador."
printf '   %s — %s\n' "$PY_PROD" "$("$PY_PROD" -V 2>&1)"

# ─── 1. hash ANTES de abrir o arquivo ────────────────────────────────────────
etapa "1/8  SHA-256 do artefato"
OBSERVADO="$("$PY_PROD" - "$ZIP" <<'PY'
import hashlib, sys
h = hashlib.sha256()
with open(sys.argv[1], "rb") as f:
    for bloco in iter(lambda: f.read(1 << 20), b""):
        h.update(bloco)
print(h.hexdigest())
PY
)"
[ -n "${OBSERVADO:-}" ] || falha "HASH_COMPUTATION_FAILED"
printf '   observado  %s\n   esperado   %s\n' "$OBSERVADO" "$ESPERADO_SHA"
[ "$OBSERVADO" = "$ESPERADO_SHA" ] || falha "ARTIFACT_HASH_MISMATCH — não abrir, não extrair, não executar"
printf '   HASH MATCH: YES\n'

# ─── 2. auditoria EM MEMÓRIA: entradas, nomes, manifesto, higiene ────────────
etapa "2/8  auditoria em memória (nada escrito no disco ainda)"
"$PY_PROD" - "$ZIP" "$ESPERADO_ENTRADAS" <<'PY' || falha "ARTIFACT_AUDIT_FAILED"
import hashlib, json, posixpath, re, stat, sys, zipfile

caminho, esperado_entradas = sys.argv[1], int(sys.argv[2])
z = zipfile.ZipFile(caminho)
infos = z.infolist()

# A validação de NOME e TIPO vem primeiro, e de propósito: um nome hostil é recusa
# independentemente de quantas entradas o arquivo tenha. Conferir a contagem antes
# faria a contagem mascarar a checagem que importa — e um teste de travessia que
# morre em "contagem errada" passa sem nunca ter exercitado a travessia.
for i in infos:
    n = i.filename
    if i.is_dir():
        raise SystemExit(f"   DIRECTORY_ENTRY_REJECTED {n}")
    if n.startswith("/") or (len(n) > 1 and n[1] == ":"):
        raise SystemExit(f"   ABSOLUTE_PATH_REJECTED {n}")
    if "\\" in n:
        raise SystemExit(f"   BACKSLASH_REJECTED {n}")
    partes = n.split("/")
    if ".." in partes or "" in partes[:-1] or "." in partes:
        raise SystemExit(f"   TRAVERSAL_REJECTED {n}")
    if posixpath.normpath(n) != n or posixpath.isabs(posixpath.normpath(n)):
        raise SystemExit(f"   NON_CANONICAL_PATH_REJECTED {n}")
    if any(ord(c) < 32 for c in n):
        raise SystemExit(f"   CONTROL_CHAR_IN_NAME_REJECTED {n!r}")
    # Bits de TIPO do modo Unix. O artefato governado grava 0o644 SEM bits de tipo
    # (S_IFMT == 0), o que é comum em zip: ausência de tipo é aceita como regular.
    # Tipo PRESENTE e diferente de regular — symlink, device, fifo, socket — é recusa.
    tipo = (i.external_attr >> 16) & 0o170000
    if tipo not in (0, stat.S_IFREG):
        raise SystemExit(f"   NON_REGULAR_ENTRY_REJECTED {n} tipo={oct(tipo)}")

if len(infos) != esperado_entradas:
    raise SystemExit(f"   ENTRY_COUNT_MISMATCH entradas={len(infos)} esperado={esperado_entradas}")

m = json.loads(z.read("MANIFEST.json"))

# O conjunto de nomes é GOVERNADO pelo manifesto — e o manifesto é o aprovado porque
# o SHA-256 do arquivo inteiro já foi fixado na etapa 1. Nome fora do conjunto é
# recusa: allowlist, não denylist. Procurar o ruim exige conhecer todo o ruim.
esperados = {"MANIFEST.json"} | {f"creditum_hermes_reasoning/{f['path']}" for f in m["files"]}
presentes = {i.filename for i in infos}
if presentes != esperados:
    raise SystemExit(
        f"   MEMBER_SET_MISMATCH inesperados={sorted(presentes - esperados)} "
        f"ausentes={sorted(esperados - presentes)}"
    )

ruins = [f["path"] for f in m["files"]
         if hashlib.sha256(z.read(f"creditum_hermes_reasoning/{f['path']}")).hexdigest() != f["sha256"]]
if ruins:
    raise SystemExit(f"   MANIFEST_MISMATCH {ruins}")

PROIBIDOS = (
    ("tests/",             lambda n, d: n.startswith("tests/") or "/tests/" in n),
    ("issuer de teste",    lambda n, d: b"_for_tests" in d),
    (".env",               lambda n, d: n.endswith(".env")),
    ("state.db",           lambda n, d: "state.db" in n),
    (".pyc/cache",         lambda n, d: n.endswith(".pyc") or "__pycache__" in n),
    ("logs",               lambda n, d: "/logs/" in n or n.startswith("logs/")),
    ("marcador de ataque", lambda n, d: b"test-secret-never-log" in d or b"token=hidden" in d),
    ("host de fixture",    lambda n, d: b"codex.fixture.invalid" in d or b"codex.invalid" in d),
    ("chave literal",      lambda n, d: re.search(rb"sk-[A-Za-z0-9]{10,}", d) is not None),
    ("ANSI/controle",      lambda n, d: b"\x1b[" in d),
    ("ferramenta de build",lambda n, d: "verify-output-hygiene" in n or "mutate-" in n),
)
sujo = [f"{r} em {i.filename}" for i in infos for r, t in PROIBIDOS if t(i.filename, z.read(i.filename))]
if sujo:
    raise SystemExit("   ARTIFACT_HYGIENE_FAILED " + str(sujo))

print(f"   entradas {len(infos)} · nomes validados {len(infos)}/{len(infos)} · manifesto {len(m['files'])}/{len(m['files'])} MATCH · higiene LIMPA")
print(f"   fase {m['phase']} · live {m['live']['response_policy']}")
PY

# ─── 3. estado atual sob /data (só leitura) ──────────────────────────────────
etapa "3/8  estado atual sob ${RAIZ_DEPLOY}"
if [ -d "$RAIZ_DEPLOY" ]; then
  ls -1A "$RAIZ_DEPLOY" 2>/dev/null | sed 's/^/   existente: /' || true
else
  printf '   %s ainda não existe — será criado\n' "$RAIZ_DEPLOY"
fi
# Conflito é para RELATAR, não para resolver por conta própria.
if [ -e "$DESTINO" ]; then
  falha "DEPLOY_PATH_EXISTS — ${DESTINO} já existe. NÃO sobrescrevo e NÃO apago. Inspecione: pode ser um deploy válido anterior ou um parcial da tentativa que falhou em unzip."
fi
PARCIAIS="$(ls -1d "${RAIZ_DEPLOY}/.staging_"* 2>/dev/null || true)"
if [ -n "$PARCIAIS" ]; then
  printf '   ⚠ staging de execução ANTERIOR encontrado (não será usado nem apagado):\n'
  printf '%s\n' "$PARCIAIS" | sed 's/^/     /'
fi
[ -e "$STAGING" ] && falha "STAGING_COLLISION — ${STAGING} já existe"

# ─── 4. extração explícita para STAGING ──────────────────────────────────────
etapa "4/8  extração membro-a-membro para staging"
mkdir -p "$STAGING" || falha "não foi possível criar staging ${STAGING}"
printf '   staging: %s\n' "$STAGING"
"$PY_PROD" - "$ZIP" "$STAGING" <<'PY' || falha "EXTRACTION_FAILED — staging descartado, nada promovido"
import json, os, pathlib, posixpath, stat, sys, zipfile

origem, destino = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
z = zipfile.ZipFile(origem)
m = json.loads(z.read("MANIFEST.json"))
esperados = ["MANIFEST.json"] + [f"creditum_hermes_reasoning/{f['path']}" for f in m["files"]]

# `extractall()` está fora de questão: ele escreve o que o arquivo mandar. Aqui cada
# membro é escrito por nome já validado, e o caminho final é reconferido como filho
# do staging DEPOIS de resolver — porque validar a string e escrever outra coisa é
# exatamente o defeito que se quer impedir.
escritos = 0
for nome in esperados:
    alvo = (destino / nome).resolve()
    if destino not in alvo.parents:
        raise SystemExit(f"   ESCAPE_REJECTED {nome} -> {alvo}")
    alvo.parent.mkdir(parents=True, exist_ok=True)
    if alvo.exists() or alvo.is_symlink():
        raise SystemExit(f"   TARGET_ALREADY_EXISTS {nome}")
    dados = z.read(nome)
    # O_EXCL: recusa se já existir. O_NOFOLLOW: não segue symlink no alvo — os dois
    # fecham a janela entre validar o nome e escrever o byte. `fdopen` adota o fd, e
    # por isso não há close manual: fechar duas vezes é um defeito, não uma precaução.
    fd = os.open(alvo, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, "wb") as f:
        f.write(dados)
    escritos += 1
print(f"   escritos {escritos}/{len(esperados)} membros")
PY

# ─── 5. reconferência do que está NO DISCO, no staging ───────────────────────
etapa "5/8  hashes dos arquivos extraídos (no staging)"
"$PY_PROD" - "$STAGING" <<'PY' || falha "STAGED_MANIFEST_MISMATCH — nada promovido"
import hashlib, json, pathlib, stat, sys
base = pathlib.Path(sys.argv[1])
m = json.loads((base / "MANIFEST.json").read_text())
pkg = base / "creditum_hermes_reasoning"
ruins, estranhos = [], []
for f in m["files"]:
    p = pkg / f["path"]
    if p.is_symlink() or not p.is_file():
        estranhos.append(f["path"]); continue
    if hashlib.sha256(p.read_bytes()).hexdigest() != f["sha256"]:
        ruins.append(f["path"])
if estranhos:
    raise SystemExit(f"   NON_REGULAR_ON_DISK {estranhos}")
if ruins:
    raise SystemExit(f"   divergentes: {ruins}")
# Nada além do governado pode ter aparecido no staging.
governados = {"MANIFEST.json"} | {f"creditum_hermes_reasoning/{f['path']}" for f in m["files"]}
no_disco = {str(p.relative_to(base)) for p in base.rglob("*") if p.is_file()}
if no_disco != governados:
    raise SystemExit(f"   STAGED_SET_MISMATCH extras={sorted(no_disco - governados)} faltando={sorted(governados - no_disco)}")
print(f"   STAGED_FILES: {len(m['files'])}/{len(m['files'])} MATCH · nenhum arquivo extra")
PY

# ─── 6. PROMOÇÃO — só agora existe um diretório final ────────────────────────
etapa "6/8  promoção do staging para ${DESTINO}"
[ -e "$DESTINO" ] && falha "DEPLOY_PATH_APPEARED — ${DESTINO} surgiu durante a execução; abortando sem sobrescrever"
mv "$STAGING" "$DESTINO" || falha "PROMOTION_FAILED — staging preservado em ${STAGING} para inspeção"
PROMOVIDO=1
printf '   promovido: %s\n' "$DESTINO"

# ─── 7. pré-condições do PRECALL ─────────────────────────────────────────────
etapa "7/8  pré-condições"
printf '   HERMES_HOME=%s\n' "${HERMES_HOME:-<ausente>}"
[ "${HERMES_HOME:-}" = "/data" ] || falha "HERMES_HOME_NOT_APPROVED — esperado /data, observado '${HERMES_HOME:-<ausente>}'"

# ─── 8. PRECALL ──────────────────────────────────────────────────────────────
etapa "8/8  PRECALL (zero cliente, zero create, zero provedor, zero modelo)"
cd "$DESTINO" || falha "cd falhou"
set +e
PYTHONDONTWRITEBYTECODE=1 "$PY_PROD" -B -m creditum_hermes_reasoning --precall-probe
CODIGO=$?
set -e
printf '\n── exit code do PRECALL: %s\n' "$CODIGO"
printf '   0 = PRECALL_PROBE_COMPLETE · 1 = recusa governada · 2 = uso inválido\n'
printf '\nDEPLOYED PATH: %s\n' "$DESTINO"
printf 'EXTRACTION ENGINE: Python stdlib zipfile (sem unzip)\n'
printf 'CONFIG CHANGED: NO · HERMES RESTARTED: NO · PACKAGES INSTALLED: NO\n'
exit "$CODIGO"
