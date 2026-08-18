#!/usr/bin/env python3
"""
Gera um `.xlsx` mínimo para os testes do importador. NÃO é código de produção.

Existe para que os testes do build step não dependam de um arquivo real numa pasta
temporária do WhatsApp — que o app apaga. As linhas vêm como JSON em argv.

Uso:
    python3 tools/make_test_xlsx.py saida.xlsx '[["Unidade","Apelido","Ativo"],["Santos","","Sim"]]'

Célula `null` ou `""` é OMITIDA do XML — é assim que uma célula vazia de verdade
aparece numa planilha, e é isso que o importador precisa enxergar.
"""
import json
import sys
import zipfile
from xml.sax.saxutils import escape

def coluna(i):
    letras = ""
    while True:
        letras = chr(ord("A") + i % 26) + letras
        i = i // 26 - 1
        if i < 0:
            return letras

def sheet_xml(linhas):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for r, linha in enumerate(linhas, start=1):
        celulas = []
        for c, valor in enumerate(linha):
            if valor is None or valor == "":
                continue
            ref = f"{coluna(c)}{r}"
            celulas.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(valor))}</t></is></c>')
        out.append(f'<row r="{r}">{"".join(celulas)}</row>')
    out.append("</sheetData></worksheet>")
    return "".join(out)

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

WORKBOOK = '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>'''

WB_RELS = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>'''

if __name__ == "__main__":
    destino, linhas_json = sys.argv[1], sys.argv[2]
    linhas = json.loads(linhas_json)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("xl/workbook.xml", WORKBOOK)
        z.writestr("xl/_rels/workbook.xml.rels", WB_RELS)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml(linhas))
    print(destino)
