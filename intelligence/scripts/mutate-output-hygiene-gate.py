"""
BANCADA r6-r5: reintroduz as regras vulneráveis e exige que a suíte CAIA.

Rodar de `intelligence/`. Não é etapa de pipeline.

Um portão corrigido é uma afirmação; um portão cuja correção MORRE quando revertida é
uma medida. Se qualquer mutação sobreviver, a regressão correspondente não observa o
que diz observar.

Duas guardas, ambas por causa da mesma família recorrente (o alvo que não existe passa
parecendo prova):
  - o alvo tem de EXISTIR no arquivo;
  - a fonte tem de MUDAR (antes != depois).
Falhar qualquer uma é falha da bancada, nunca "morta".
"""
import os, pathlib, shutil, subprocess, sys, tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MODULO = "tests.test_r6_r4_higiene"

MUTACOES = [
 ("G1 portão: volta a isenção por grafia (resolve/uuid4)",
  "scripts/verify-output-hygiene.py",
  'if nome in ("str", "repr") and isinstance(f, ast.Name) and not self._em_conversor():',
  'if nome in ("str", "repr") and isinstance(f, ast.Name) and not self._em_conversor():\n'
  '            a = node.args[0] if node.args else None\n'
  '            if isinstance(a, ast.Call) and getattr(a.func, "attr", getattr(a.func, "id", "")) in ("uuid4", "resolve"):\n'
  '                self.generic_visit(node)\n'
  '                return'),
 ("G2 portão: volta a confiança em ast.Dict",
  "scripts/verify-output-hygiene.py",
  'if nome == "dumps" and not self._em_serializador():',
  'if nome == "dumps" and not self._em_serializador() and not (node.args and isinstance(node.args[0], ast.Dict)):'),
 ("G3 portão: json.dumps livre em qualquer função",
  "scripts/verify-output-hygiene.py",
  'if nome == "dumps" and not self._em_serializador():\n            self._flag(node, "OH007")',
  'if False:\n            self._flag(node, "OH007")'),
 ("G4 portão: autoridade por prefixo do nome",
  "scripts/verify-output-hygiene.py",
  "return (self.modulo, self._onde()) in allowlist",
  'return self._onde().startswith("serialize_") or self._onde().startswith("safe_")'),
 ("I1 identidade: volta Path.stem",
  "scripts/verify-output-hygiene.py",
  "v = Visitante(module_identity(pacote, caminho))",
  "v = Visitante(caminho.stem)"),
 ("I2 identidade: só o basename final",
  "scripts/verify-output-hygiene.py",
  'return ".".join([raiz.name, *partes])',
  "return partes[-1] if partes else raiz.name"),
 ("I3 identidade: autoridade só pelo nome da função",
  "scripts/verify-output-hygiene.py",
  "return (self.modulo, self._onde()) in allowlist",
  "return any(self._onde() == f for _, f in allowlist)"),
 ("I4 lexical: pilha colapsada no último escopo",
  "scripts/verify-output-hygiene.py",
  'return ".".join(self.pilha) if self.pilha else "<módulo>"',
  'return self.pilha[-1] if self.pilha else "<módulo>"'),
 ("I5 lexical: classe fora da pilha",
  "scripts/verify-output-hygiene.py",
  "    def visit_ClassDef(self, node: ast.ClassDef) -> None:",
  "    def visit_ClassDef_desativado(self, node: ast.ClassDef) -> None:"),
 ("I6 identidade: fora do pacote recebe identidade governada",
  "scripts/verify-output-hygiene.py",
  "        return IDENTIDADE_INDETERMINADA",
  '        return "creditum_hermes_reasoning.probe"'),
 ("G5 fronteira: não confere o valor dos campos",
  "bridge/creditum_hermes_reasoning/probe.py",
  "if type(valor) not in SAFE_PUBLIC_VALUE_TYPES:",
  "if False:"),
 ("G6 fronteira: não confere o tipo do relatório",
  "bridge/creditum_hermes_reasoning/probe.py",
  "if type(relatorio) not in GOVERNED_PUBLIC_REPORTS:",
  "if False:"),
 ("G7 fronteira: isinstance no lugar de type(...) is",
  "bridge/creditum_hermes_reasoning/probe.py",
  "if type(valor) not in SAFE_PUBLIC_VALUE_TYPES:",
  "if not isinstance(valor, SAFE_PUBLIC_VALUE_TYPES):"),
 ("G8 uuid: procedência trocada por confiança cega",
  "bridge/creditum_hermes_reasoning/session.py",
  "if type(valor) is not uuid.UUID:",
  "if False:"),
 ("G9 uuid: isinstance no lugar de type(...) is",
  "bridge/creditum_hermes_reasoning/session.py",
  "if type(valor) is not uuid.UUID:",
  "if not isinstance(valor, uuid.UUID):"),
]

env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
mortos = vivos = defeitos = 0
for rotulo, rel, alvo, veneno in MUTACOES:
    base = pathlib.Path(tempfile.mkdtemp()); trab = base / "intelligence"
    shutil.copytree(RAIZ, trab, ignore=shutil.ignore_patterns(
        "__pycache__", "node_modules", ".git", "*.pyc"))
    p = trab / rel
    antes = p.read_text(encoding="utf-8")
    if alvo not in antes:
        print(f"  ⚠  BANCADA: alvo ausente em {rel} — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    depois = antes.replace(alvo, veneno, 1)
    if depois == antes:
        print(f"  ⚠  BANCADA: mutação no-op — {rotulo}"); defeitos += 1; shutil.rmtree(base); continue
    p.write_text(depois, encoding="utf-8")
    r = subprocess.run([sys.executable, "-B", "-m", "unittest", MODULO],
                       cwd=trab / "bridge", capture_output=True, text=True, env=env)
    morto = r.returncode != 0
    mortos += morto; vivos += (not morto)
    falhas = [l for l in r.stderr.splitlines() if l.startswith(("FAIL:", "ERROR:"))]
    print(f"  {'MORTO ' if morto else 'VIVO  '} {rotulo:52s} {len(falhas)} falha(s)")
    if not morto:
        print("         ↑ nenhuma regressão observou esta reversão")
    shutil.rmtree(base)
print(f"\n  {len(MUTACOES)} mutações do portão · {mortos} mortas · {vivos} vivas · {defeitos} defeitos de bancada")
sys.exit(1 if (vivos or defeitos) else 0)
