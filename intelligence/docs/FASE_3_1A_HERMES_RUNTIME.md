# Fase 3.1a — descoberta do runtime Hermes

```
STATUS         HERMES_NOT_INSTALLED
PARADO EM      §4 — instalação é ação humana explícita
DADO DE NEGÓCIO ENVIADO   nenhum
CHAMADA DE MODELO         nenhuma
PERFIL CRIADO             nenhum
```

> **Tudo neste documento vem da documentação oficial, não de um runtime instalado.**
> O §2 diz que o CLI local vence a doc quando divergem. Não há CLI local, então nada
> aqui está verificado contra comportamento real. Cada afirmação abaixo é uma hipótese
> a conferir depois da instalação.

## 1. O que a máquina tem

```
plataforma     Darwin 23.6.0 · x86_64 · macOS 14.8.7 (23J520)
hermes no PATH        ausente
locais comuns         nenhum  (/usr/local/bin, /opt/homebrew/bin, ~/.local/bin, ~/bin)
perfil ~/.hermes      ausente
perfil ~/.hermes-creditum   ausente
pipx                  não instalado
uv tools              "No tools installed"
pip (sistema)         nenhum pacote hermes
brew                  ausente
checkout de fonte     nenhum (busca por hermes-agent / hermes_agent até 4 níveis)
app desktop           nenhum
```

Sete caminhos independentes de detecção, todos negativos. Não é "não achei no PATH": é
ausência.

## 2. Por que paramos aqui

O §4 é explícito: instalação é ação humana separada, e o motivo está escrito no próprio
prompt — *"queremos que Stefano saiba exatamente quando software de runtime de terceiros
entra na máquina."*

Comando oficial para macOS, verbatim da doc:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

A doc também oferece o instalador do Hermes Desktop. **Não executei nenhum dos dois.**

Upstream: `https://github.com/NousResearch/hermes-agent`

## 3. Por que NÃO criei o perfil isolado

O §19 manda usar a estrutura de config REAL do Hermes e não inventar chaves. Sem o
binário eu não tenho a estrutura real — teria que adivinhar. E o §43 proíbe exatamente
isso: *"não adicione mocks falsos do Hermes só para a 3.1a parecer implementada."*

Um `~/.hermes-creditum/config.yaml` escrito por palpite seria pior que nenhum: pareceria
governança, e a primeira execução real o sobrescreveria ou o rejeitaria.

## 4. O achado que importa mais que a instalação

O §38 exige provar **zero ferramentas chamáveis pelo modelo** antes de seguir. A doc
oficial, na referência de toolsets:

> A documentação **não descreve** como rodar com zero ferramentas. Não há menção de valor
> vazio de toolset, opção "none", semântica de safe-mode, nem mecanismo para desabilitar
> todas as ferramentas.

E o default do CLI não é modesto. `hermes-cli` é descrito como *"Full toolset — the
default for interactive CLI sessions"*, abrangendo:

```
file · terminal · web · browser · memory · skills · vision · image generation
todo · text-to-speech · delegation · code execution · cronjob · session search
clarification · computer use · Home Assistant · kanban
```

Toolsets core documentados (23), incluindo os de risco alto que o §13 pede para
inventariar: `terminal`, `file`, `browser`, `web`, `search`, `code_execution`,
`cronjob` (com entrega de mensagem para fora), `delegation`, `memory`, `skills`,
`computer_use`, `desktop_ui`, `homeassistant`.

Toolsets de plataforma (21+), incluindo `hermes-telegram`, `hermes-discord`,
`hermes-slack`, `hermes-whatsapp`, `hermes-signal`, `hermes-email`, `hermes-sms`,
`hermes-api-server`, `hermes-gateway`, `hermes-webhook`.

**Consequência arquitetural:** a postura de zero ferramentas que o §14 exige não é uma
opção documentada do runtime. Ou ela existe no código e a doc não conta, ou ela precisa
ser construída. Qualquer uma das duas se descobre lendo `toolsets.py` e o resolvedor de
definições de ferramenta na versão instalada — não na doc.

## 5. Superfícies de integração descobertas

Para a 3.1b. Nada implementado.

| superfície | evidência | observação |
| --- | --- | --- |
| **subprocesso CLI** | `hermes chat -q "…"` (*"One-shot, non-interactive prompt"*) e `-Q/--quiet` (*"Programmatic mode: suppress banner/spinner/tool previews"*) | é a única superfície não-interativa que a doc descreve explicitamente |
| toolset por sessão | `-t/--toolsets <csv>`, e *"session-level --toolsets overrides"* a config | override por sessão é o lugar natural de impor a postura restritiva |
| `hermes-api-server` | toolset de plataforma existe | há um servidor de API; a doc consultada não descreve o protocolo |
| `hermes-acp` | toolset de plataforma existe | ACP é superfície de agente; um bug conhecido mostra que ela recompõe a lista de ferramentas por conta própria |
| import Python | não investigado | exige a fonte instalada |

**Saída estruturada:** a doc de comandos **não** expõe flag de JSON nem de resposta
estruturada. `-Q/--quiet` suprime ruído de terminal, o que não é o mesmo que saída
parseável. Isto é o principal ponto aberto para a 3.1b — sem contrato de saída, o
resultado do Hermes não tem como ser validado contra schema.

Por isso o §30 estava certo em avisar para **não** escolher subprocesso de CLI só por ser
visível: é a única superfície documentada, e ainda assim a que menos garante forma de
saída.

## 6. Isolamento de perfil — a boa notícia

`HERMES_HOME` é o mecanismo documentado, e a semântica é exatamente a que o §7/§8 pedem:

> Um perfil é um diretório home separado do Hermes. Cada perfil tem seu próprio
> `config.yaml`, `.env`, `SOUL.md`, memórias, sessões, skills, cron jobs e banco de
> estado.

> Em instalações no host, subprocessos de ferramenta mantêm o HOME real do usuário por
> padrão. **Dado de perfil é isolado por `HERMES_HOME`, não por trocar `HOME`.**

A segunda citação confirma o §8: não se mexe no `HOME` do sistema.

E um aviso da própria doc que vale registrar como regra de operação:

> Nunca aponte dois processos de agente para o mesmo perfil. Ambos escrevem memória
> automaticamente, e cada um carrega as escritas do outro no system prompt no início da
> sessão.

## 7. Comandos que existem (doc)

```
hermes chat      -q/--query · -m/--model · -t/--toolsets · -s/--skills · -Q/--quiet
                 --provider · --image · --resume · --worktree · --checkpoints
                 --yolo · --ignore-user-config · --safe-mode
hermes config    show · edit · get · set · unset · path · env-path · check · migrate
hermes setup     seções: model · tts · terminal · gateway · tools · agent
                 flags: --quick · --non-interactive · --reset · --portal
hermes doctor    --fix
hermes tools     --summary  (UI curses de toggle por plataforma)
hermes skills    browse · search · install · list · check · update · uninstall
hermes update    --check · --backup
```

Não existe `--list-toolsets` nem `--list-tools` na doc de comandos. O inventário de
ferramentas terá de sair de `hermes tools --summary`, de `hermes config show` ou da
fonte.

## 8. Riscos upstream relevantes para a Creditum

Colhidos do rastreador de issues. Nenhum verificado; todos merecem conferência na versão
que for instalada.

**A família de falha observada é ferramenta DESAPARECER, não vazar** — o que é o lado
menos perigoso para nós, mas mostra que a resolução de toolset é frágil:

- ferramentas nativas ausentes de todas as sessões numa versão, só MCP carregando;
- migração de config corrompendo `platform_toolsets` — `hermes-cli` reescrito para um
  nome inexistente, **silenciosamente**: sem erro, sem aviso, sem log;
- sessões ACP recompondo a lista de ferramentas e descartando ferramentas MCP.

**O que isso implica para o §35 (política de atualização):** `hermes update` faz migração
de config, e há relato de migração que quebra a resolução de ferramentas sem avisar. Uma
atualização não verificada pode mudar a superfície de capacidade da Creditum em silêncio —
nas duas direções. Atualização exige verificação de capacidade **depois**, não só antes.

Há também issues sobre `HOME` resolvendo para o diretório do perfil dentro do runtime, e
sobre a instalação de gateway por systemd não honrar `HERMES_HOME` fora do padrão. O
segundo não nos afeta enquanto não houver gateway; o primeiro é para conferir se algum dia
uma ferramenta de arquivo for habilitada.

## 9. Condições de falha fechada, uma por uma

```
§38  zero ferramentas chamáveis provado    NÃO — sem runtime, e sem modo documentado
§39  isolamento de HERMES_HOME provado     NÃO — sem runtime para provar
§40  executável é o Hermes da NousResearch NÃO VERIFICÁVEL — não existe executável
```

Nenhuma das três pode ser satisfeita antes da instalação. Não configurei provider,
modelo, prompt, skill, memória, cron nem gateway — e não teria configurado mesmo com o
runtime presente, porque o §10 e o §22 mandam esperar.

## 10. O que a 3.1a deixou pronto para a 3.1b

A pergunta que a 3.1b tem de responder primeiro, e que a doc **não** responde:

```
QUANTAS DEFINIÇÕES DE FERRAMENTA SÃO PASSADAS AO MODELO?
```

O caminho para responder, sem gastar token e sem enviar dado:

1. ler `toolsets.py` e o resolvedor de definições na versão instalada;
2. descobrir se seleção vazia explícita preserva semântica de zero, ou se cai no default;
3. provar por sonda local determinística — nunca pelo banner do CLI, que o §15 já
   desqualifica como autoridade.

Se a resposta for "não existe modo de zero ferramentas", a decisão volta para você: ou a
Creditum passa a exigir uma superfície de integração que não seja o agente completo, ou a
postura de capacidade tem de ser construída antes de qualquer dado atravessar.
