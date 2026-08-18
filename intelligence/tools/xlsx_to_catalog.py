#!/usr/bin/env python3
"""
Converte UNIDADES.xlsx no artefato governado de catálogo.

É BUILD STEP, não runtime. O D13 em produção consome o JSON gerado; nada em
`detectors/src` abre planilha, e nenhuma dependência de Excel entra no runtime.

─── Por que stdlib ───────────────────────────────────────────────────────────

`openpyxl` não está instalado e adicioná-lo criaria dependência para converter um
arquivo de 10 KB uma vez por mudança de catálogo. Um `.xlsx` é um zip com XML, e
`zipfile` + `xml.etree` da stdlib bastam.

─── Colunas REAIS do arquivo ─────────────────────────────────────────────────

    Unidade   nome canônico
    Apelido   forma alternativa que a fonte escreve
    Ativo     "Sim" | "Não"

Nenhuma outra coluna existe. Nada foi inferido.

─── A regra que a própria planilha codifica ──────────────────────────────────

Um `Apelido` que aparece em UMA unidade é alias dela.
Um `Apelido` que aparece em DUAS OU MAIS unidades é AGRUPAMENTO comercial.

Isto não é interpretação minha: `Carpina e Limoeiro` está no Apelido de `Carpina`
e de `Limoeiro`; `Limeira, Sumaré & JD Ângela` está no de `Jd Angela`, `Limeira` e
`Sumaré`. O CEO confirmou que os dois são agrupamentos. A planilha e a decisão
humana dizem a mesma coisa, e a regra derivada é exatamente essa.

Tratá-los como alias faria um texto apontar para duas unidades — que é justamente
o que o importador recusa.

─── Fail-closed ATÔMICO ──────────────────────────────────────────────────────

Qualquer linha de dados que não converta inequivocamente torna a conversão INTEIRA
inválida: saída não-zero, nenhum artefato escrito, artefato anterior intacto.

Motivo: uma linha descartada aqui vira `unknown` em runtime todo mês, e o validador
de runtime não recupera o que o build step jogou fora. 48 unidades de 49 não é um
catálogo parcialmente bom — é um catálogo errado.

`AVISO` existe só para condição NÃO LOSSY: hoje, apenas `Apelido` idêntico ao nome
canônico, cujo descarte não perde forma alguma.

─── Duas fontes governadas ───────────────────────────────────────────────────

    UNIDADES.xlsx              catálogo operacional, autoridade de display
    d13.alias-overrides.json   decisões humanas de canonicalização aprovadas

As decisões humanas viviam em TypeScript e eram aplicadas DEPOIS do load, então a
planilha sozinha não reproduzia o catálogo efetivo em runtime. Agora as duas
fontes entram aqui, e o artefato gerado contém todos os aliases efetivos. O
runtime só carrega e valida — não enriquece.

Uso:
    python3 tools/xlsx_to_catalog.py <caminho.xlsx> <overrides.json> catalog/unidades.catalog.json

Saída: 0 em sucesso, 1 em recusa.
"""

import hashlib
import json
import os
import stat
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CATALOG_VERSION = "1.0.0"
IMPORTER_VERSION = "2.0.0"
SCHEMAS_DE_OVERRIDE_SUPORTADOS = frozenset({"1.0.0"})


def sha256(caminho):
    """Identidade da fonte. `hashlib` da stdlib — nada de criptografia caseira."""
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def ler_planilha(caminho):
    """Linhas como dicionário coluna→valor. Célula vazia é ausente, não string vazia."""
    z = zipfile.ZipFile(caminho)

    compartilhadas = []
    try:
        ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in ss.iter(NS + "si"):
            compartilhadas.append("".join(t.text or "" for t in si.iter(NS + "t")))
    except KeyError:
        pass

    folha = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    linhas = []
    for row in folha.iter(NS + "row"):
        celulas = {}
        for c in row.iter(NS + "c"):
            ref = c.attrib.get("r", "")
            coluna = "".join(x for x in ref if x.isalpha())
            tipo = c.attrib.get("t")
            v = c.find(NS + "v")
            inline = c.find(NS + "is")
            if tipo == "s" and v is not None:
                valor = compartilhadas[int(v.text)]
            elif tipo == "inlineStr" and inline is not None:
                valor = "".join(x.text or "" for x in inline.iter(NS + "t"))
            elif v is not None:
                valor = v.text
            else:
                valor = None
            if valor is not None and str(valor).strip() != "":
                celulas[coluna] = str(valor).strip()
        if celulas:
            linhas.append(celulas)
    return linhas


def unit_id(nome):
    """Mesma derivação de `unitIdFromCanonicalName` em `unit-catalog.ts`."""
    sem_acento = "".join(
        ch for ch in unicodedata.normalize("NFD", nome) if unicodedata.category(ch) != "Mn"
    )
    saida = []
    for ch in sem_acento.lower():
        saida.append(ch if ch.isascii() and (ch.isalnum()) else "_")
    juntado = "".join(saida)
    while "__" in juntado:
        juntado = juntado.replace("__", "_")
    return juntado.strip("_")[:64]


class ErroDeConversao(Exception):
    """Conversão inválida. Nenhum artefato é escrito."""

    def __init__(self, problemas):
        self.problemas = problemas
        super().__init__(f"{len(problemas)} problema(s) na conversão")


VOCABULARIO_ATIVO = {"Sim": "active", "Não": "inactive"}


def ler_overrides(caminho):
    """
    Decisões humanas de canonicalização que a planilha operacional não registra.

    Existem porque `public.unidades` e as planilhas de venda escrevem formas que o
    catálogo de unidades não repete — `Presidente P.`, `BelfordRoxo`, `Rio Preto`.
    Antes viviam em TypeScript, o que fazia o runtime enriquecer o catálogo DEPOIS
    de carregá-lo: a planilha sozinha não reproduzia o comportamento efetivo.

    Aqui são dado governado, versionado e hasheado como qualquer outra fonte.
    """
    with open(caminho, encoding="utf-8") as f:
        try:
            doc = json.load(f)
        except json.JSONDecodeError as e:
            raise ErroDeConversao([f"overrides: JSON inválido — {e}"]) from None

    if not isinstance(doc, dict):
        raise ErroDeConversao(["overrides: a raiz precisa ser um objeto"])

    versao = doc.get("schema_version")
    if versao not in SCHEMAS_DE_OVERRIDE_SUPORTADOS:
        raise ErroDeConversao(
            [
                f"overrides: schema_version {versao!r} não suportada; "
                f"suportadas: {sorted(SCHEMAS_DE_OVERRIDE_SUPORTADOS)}"
            ]
        )

    entradas = doc.get("aliases")
    if not isinstance(entradas, list):
        raise ErroDeConversao(["overrides: campo `aliases` precisa ser lista"])

    problemas = []
    vistos = {}
    saida = []

    for n, e in enumerate(entradas, start=1):
        if not isinstance(e, dict):
            problemas.append(f"overrides[{n}]: cada entrada precisa ser um objeto")
            continue

        alias = e.get("alias")
        alvo = e.get("target_unit_id")

        if not isinstance(alias, str) or alias.strip() == "":
            problemas.append(f"overrides[{n}]: `alias` ausente, vazio ou não textual")
            continue
        if not isinstance(alvo, str) or alvo.strip() == "":
            problemas.append(
                f"overrides[{n}] ({alias!r}): `target_unit_id` ausente, vazio ou não textual"
            )
            continue

        alias, alvo = alias.strip(), alvo.strip()
        chave = alias.lower()

        # Alias repetido é ambiguidade mesmo quando os alvos coincidem: um arquivo
        # governado não declara a mesma decisão duas vezes por acidente.
        if chave in vistos:
            anterior, alvo_anterior = vistos[chave]
            detalhe = (
                f"alvos {alvo_anterior!r} e {alvo!r}" if alvo_anterior != alvo else "duplicata"
            )
            problemas.append(
                f"overrides: alias {alias!r} declarado em [{anterior}] e [{n}] — {detalhe}"
            )
            continue
        vistos[chave] = (n, alvo)
        saida.append({"alias": alias, "target_unit_id": alvo, "ordem": n})

    if problemas:
        raise ErroDeConversao(problemas)
    return saida


def converter(caminho_xlsx, caminho_overrides):
    """
    Constrói o catálogo em memória. Levanta `ErroDeConversao` em qualquer problema.

    ─── Por que TODA linha inválida é fatal ──────────────────────────────────────

    A versão anterior descartava linha inválida, emitia aviso e escrevia o JSON com
    sucesso. Uma célula `Ativo` em branco, um typo, um schema drift — e uma unidade
    governada desaparecia do catálogo de runtime, onde virava `unknown` a cada
    ingestão. O validador de runtime não recupera linha que o build step jogou fora.

    Então: nada é descartado. Ou o catálogo representa a planilha inteira, ou não
    existe catálogo novo.
    """
    overrides = ler_overrides(caminho_overrides)
    linhas = ler_planilha(caminho_xlsx)
    problemas = []

    if not linhas:
        raise ErroDeConversao(["planilha vazia"])

    # ── Cabeçalho: colunas governadas, sem adivinhação de nome alternativo ──
    cabecalho = linhas[0]
    esperado = {"A": "Unidade", "B": "Apelido", "C": "Ativo"}
    if cabecalho != esperado:
        faltando = [v for k, v in esperado.items() if cabecalho.get(k) != v]
        extras = [v for k, v in cabecalho.items() if esperado.get(k) != v]
        raise ErroDeConversao(
            [
                f"cabeçalho: colunas governadas ausentes ou fora de posição: {faltando}"
                + (f"; encontrado: {extras}" if extras else "")
            ]
        )

    dados = linhas[1:]

    # Quantas unidades cada Apelido cobre. É isto que separa alias de agrupamento.
    cobertura = defaultdict(list)
    for r in dados:
        apelido = r.get("B")
        nome = r.get("A")
        if apelido and nome:
            cobertura[apelido].append(unit_id(nome))

    unidades = []
    grupos = {}
    avisos = []
    por_id = {}
    canonicos = {}
    dono_do_alias = {}

    for i, r in enumerate(dados, start=2):
        nome = r.get("A")
        ativo = r.get("C")
        apelido = r.get("B")

        # Linha COMPLETAMENTE vazia no fim da planilha não é dado. Parcialmente
        # preenchida é: alguém escreveu algo e a conversão não sabe o quê.
        if nome is None and ativo is None and apelido is None:
            continue

        if nome is None:
            problemas.append(f"linha {i}: `Unidade` vazia (Apelido={apelido!r}, Ativo={ativo!r})")
            continue

        if ativo is None:
            problemas.append(f"linha {i} ({nome}): `Ativo` vazia — status não é presumido")
            continue

        if ativo not in VOCABULARIO_ATIVO:
            problemas.append(
                f"linha {i} ({nome}): `Ativo` = {ativo!r} fora do vocabulário "
                f"{sorted(VOCABULARIO_ATIVO)}"
            )
            continue

        status = VOCABULARIO_ATIVO[ativo]
        uid = unit_id(nome)

        if not uid or len(uid) < 2:
            problemas.append(f"linha {i} ({nome}): nome curto demais para gerar unit_id válido")
            continue

        if uid in por_id:
            anterior = por_id[uid]
            problemas.append(
                f"linha {i} ({nome}): unit_id {uid!r} duplicado — já usado na linha "
                f"{anterior['linha']} ({anterior['nome']})"
            )
            continue

        chave_canonica = nome.strip().lower()
        if chave_canonica in canonicos:
            problemas.append(
                f"linha {i} ({nome}): identidade canônica duplicada da linha "
                f"{canonicos[chave_canonica]}"
            )
            continue

        aliases = []
        if apelido:
            membros = sorted(set(cobertura[apelido]))
            if len(membros) >= 2:
                # AGRUPAMENTO. Não é alias de nenhum dos membros.
                grupos[apelido] = membros
            elif apelido == nome:
                # Redundância inofensiva e NÃO LOSSY: o alias é igual ao canônico,
                # então descartá-lo não perde forma nenhuma. Único aviso permitido.
                avisos.append(f"linha {i} ({nome}): Apelido igual ao canônico — redundante")
            else:
                aliases.append(apelido)

        por_id[uid] = {"linha": i, "nome": nome}
        canonicos[chave_canonica] = i
        unidades.append(
            {
                "unit_id": uid,
                "canonical_name": nome,
                "aliases": aliases,
                "status": status,
            }
        )

    # ── Overrides governados: decisões humanas que a planilha não registra ──
    #
    # Entram ANTES da integridade global de propósito: alias→duas unidades e
    # alias colidindo com canônico já são checados abaixo, e um alias humano
    # precisa passar exatamente pelas mesmas guardas que um alias da planilha.
    por_unit_id = {u["unit_id"]: u for u in unidades}
    id_dos_rotulos = {unit_id(r): r for r in grupos}

    for ov in overrides:
        alias, alvo = ov["alias"], ov["target_unit_id"]

        rotulo = id_dos_rotulos.get(unit_id(alias))
        if rotulo is not None:
            problemas.append(
                f"override[{ov['ordem']}]: alias {alias!r} é o rótulo de agrupamento "
                f"{rotulo!r} — decisão humana não transforma agrupamento em unidade"
            )
            continue

        rotulo_alvo = id_dos_rotulos.get(unit_id(alvo))
        if rotulo_alvo is not None:
            problemas.append(
                f"override[{ov['ordem']}] ({alias!r}): target_unit_id {alvo!r} é o "
                f"rótulo de agrupamento {rotulo_alvo!r}, não uma unidade"
            )
            continue

        if alvo not in por_unit_id:
            problemas.append(
                f"override[{ov['ordem']}] ({alias!r}): target_unit_id {alvo!r} não "
                f"existe no catálogo da planilha"
            )
            continue

        por_unit_id[alvo]["aliases"].append(alias)

    # ── Integridade global, antes de qualquer escrita ──
    for u in unidades:
        for a in u["aliases"]:
            chave = a.lower()
            dono = dono_do_alias.get(chave)
            if dono is not None and dono != u["unit_id"]:
                problemas.append(
                    f"alias {a!r} aponta para {dono!r} e para {u['unit_id']!r}"
                )
                continue
            dono_do_alias[chave] = u["unit_id"]

    for u in unidades:
        for a in u["aliases"]:
            colide = canonicos.get(a.strip().lower())
            if colide is not None and unit_id(a) != u["unit_id"]:
                problemas.append(
                    f"alias {a!r} de {u['unit_id']!r} colide com o canônico da linha {colide}"
                )

    ids = {u["unit_id"] for u in unidades}
    for rotulo, membros in sorted(grupos.items()):
        ausentes = [m for m in membros if m not in ids]
        if ausentes:
            problemas.append(f"agrupamento {rotulo!r}: membros inexistentes: {ausentes}")
        if len(membros) < 2:
            problemas.append(f"agrupamento {rotulo!r}: precisa de ao menos duas unidades")

    if problemas:
        raise ErroDeConversao(problemas)

    return {
        "catalog_version": CATALOG_VERSION,
        "importer_version": IMPORTER_VERSION,
        "columns": ["Unidade", "Apelido", "Ativo"],
        # Identidade das fontes que produziram ESTE artefato. Reproduzir o catálogo
        # exige as duas; nenhum alias efetivo nasce fora daqui.
        "sources": [
            {
                "role": "workbook",
                "file": os.path.basename(caminho_xlsx),
                "sha256": sha256(caminho_xlsx),
            },
            {
                "role": "alias_overrides",
                "file": os.path.basename(caminho_overrides),
                "sha256": sha256(caminho_overrides),
                "alias_count": len(overrides),
            },
        ],
        "units": unidades,
        "groups": [{"label": k, "members": v} for k, v in sorted(grupos.items())],
        "warnings": avisos,
    }


def escrever_atomico(caminho, catalogo):
    """
    Escreve num temporário do MESMO filesystem e substitui atomicamente.

    `os.replace` é atômico dentro do mesmo filesystem: ou o artefato antigo continua
    inteiro, ou o novo está inteiro. Nunca um JSON truncado no meio — que seria pior
    que a versão anterior do bug, porque o runtime falharia ao carregar.
    """
    destino = os.path.abspath(caminho)
    pasta = os.path.dirname(destino)
    os.makedirs(pasta, exist_ok=True)

    fd, temp = tempfile.mkstemp(dir=pasta, prefix=".catalog-", suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(catalogo, f, ensure_ascii=False, indent=2, sort_keys=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())

        # `mkstemp` cria com 0600 e `os.replace` carrega o modo do temporário para o
        # destino. Sem isto, regenerar o catálogo o tornaria ilegível por outro
        # usuário — um artefato versionado que some do build de outra pessoa.
        # Preserva o modo do destino quando ele já existe; senão, o padrão do umask.
        try:
            os.chmod(temp, stat.S_IMODE(os.stat(destino).st_mode))
        except FileNotFoundError:
            umask = os.umask(0)
            os.umask(umask)
            os.chmod(temp, 0o666 & ~umask)

        os.replace(temp, destino)
    except BaseException:
        if os.path.exists(temp):
            os.unlink(temp)
        raise


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)

    for rotulo, caminho in (("planilha", sys.argv[1]), ("overrides", sys.argv[2])):
        if not os.path.isfile(caminho):
            print(
                f"CONVERSÃO RECUSADA — {rotulo} não encontrada: {caminho}", file=sys.stderr
            )
            raise SystemExit(1)

    try:
        catalogo = converter(sys.argv[1], sys.argv[2])
    except (ErroDeConversao, zipfile.BadZipFile) as e:
        print("CONVERSÃO RECUSADA — nenhum artefato foi escrito:", file=sys.stderr)
        for p in getattr(e, "problemas", [str(e)]):
            print(f"  - {p}", file=sys.stderr)
        # O artefato governado anterior permanece intacto.
        raise SystemExit(1) from None

    escrever_atomico(sys.argv[3], catalogo)

    ativas = sum(1 for u in catalogo["units"] if u["status"] == "active")
    inativas = sum(1 for u in catalogo["units"] if u["status"] == "inactive")
    print(f"unidades: {len(catalogo['units'])} (ativas {ativas}, inativas {inativas})")
    print(f"aliases:  {sum(len(u['aliases']) for u in catalogo['units'])}")
    print(f"grupos:   {len(catalogo['groups'])}")
    for g in catalogo["groups"]:
        print(f"  {g['label']!r} → {g['members']}")
    for f in catalogo["sources"]:
        print(f"fonte {f['role']}: {f['file']} sha256={f['sha256']}")
    for a in catalogo["warnings"]:
        print(f"AVISO (não lossy): {a}")
