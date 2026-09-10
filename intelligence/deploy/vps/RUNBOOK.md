# D2E-A8 — runbook da migração governada para VPS

**Este runbook NÃO é executável ainda.** A a8-d1 e a a8-r1 fecharam três dos quatro
portões; **G3 segue aberto**, e é o único bloqueio externo que resta. Executar a
cutover com ele aberto seria adivinhar.

`FIRST LIVE` não autorizado. Nenhuma ação de produção nesta fase.

---

## Por que migrar

A a7-r1 inspecionou o container Managed e provou que o portão da a6 não pode ser
imposto lá:

```
PID 1   tini -- /app/u4s-hermes-agent
PID 7   /app/u4s-hermes-agent          ← ELF UPX, componente Hostinger, NÃO modificar
PID 12  /opt/venv/bin/python server.py
PID 13  /opt/venv/bin/python3 /opt/venv/bin/hermes gateway run   ← filho direto do 7
```

`server.py` não é pai do gateway. O PID 7 lança o PID 13 direto, e não há systemd,
supervisord, s6, variável de lançamento, chave de comando em `config.yaml`, gancho em
`/data/hooks` (existe, vazio, não referenciado) nem perfil de shell que governe aquele
spawn. O próprio Hermes reporta o gateway como *"Running manually, not as a system
service"*.

A propriedade da a6 — **portão recusa → gateway NUNCA sobe** — não tem mecanismo local
persistente e suportado naquele runtime. Num container nosso, o `ENTRYPOINT` é o portão.

---

## PORTÃO 1 — origem do Hermes 0.20.4 · **FECHADO pela a8-d1**

A a8-d1 mediu a origem: `hermes-agent 0.20.4`, instalado por `uv` em modo editável de
`file:///opt/hermes-agent`, do commit oficial
`e624e9fde561e1add9388384012b295fde669ade`, com evidência em
`/opt/hermes-agent/.hermes_build_sha` e o `uv.lock` daquela revisão.

O `Dockerfile` reconstrói exatamente isso, em duas etapas, e recusa por forma antes de
qualquer rede: commit tem de ser 40 hex, e `latest`, `main`, `master` e `HEAD` são
rejeitados por nome. Depois do `fetch`, o `git rev-parse HEAD` é comparado com o commit
pedido, e o `sha256sum uv.lock` com o esperado. O `uv sync --frozen` instala do lock,
sem resolução nova.

**Resolvido pela a4-r6:** o SHA-256 do `uv.lock` foi **provado** contra a árvore de
staging genuína, no commit fixado e com o git limpo —
`8fd868b9da8b6bc2f4aa94a845e210eccdd5e31be7a0b404f0a8527ced0fddec`. Está populado no
`runtime-manifest.json`, e não veio do Managed nem da rede.

**Pendência que segue aberta, e falha fechada:** o `runtime_inventory_sha256`. O valor
`01ba45ae…67aee1` foi FORNECIDO pela reconstrução do staging, e não recomputado: o
algoritmo de inventário governado que permitiria conferi-lo **não existe neste
repositório**. Selar o que não se pode recomputar transformaria um número recebido em
autoridade, então ele fica `null` e o `seal-runtime-manifest.py --check` recusa,
nomeando exatamente essa causa. Definir o algoritmo é pré-requisito do build.

---

## PORTÃO 2 — `state.db` e o livro-razão · **FECHADO pela a8-d1**

A a8-d1 decidiu: o Hermes sobe sem o `state.db`, mas a continuidade perderia sessões,
mensagens, roteamento do gateway, uso de modelo e estado de prompt de sistema. Logo
**`state.db` é obrigatório para continuidade**, e a exportação usa a **API de backup do
SQLite** — nunca `cp` sobre banco vivo.

`export-state-db.py` abre a origem por URI `mode=ro` (o SQLite recusa escrita, em vez de
eu prometer não escrever), copia pelo `backup()`, roda `PRAGMA quick_check` no destino,
compara a lista de tabelas, e reconfere o SHA-256 da origem para provar que ela não
mudou. Nenhum `SELECT` em tabela de aplicação: mensagem e sessão não têm por onde vazar.

**O livro-razão é estado de SEGURANÇA, não backup de conveniência.**
`/data/creditum_hermes_runtime/execution-ledger/v1` guarda os `execution_id` consumidos,
e é o `mkdir` atômico dele que faz a reserva ser de uso único. Subir a VPS sem ele
**permitiria reservar de novo uma execução já consumida** — ou seja, reexecutar uma
mensagem que já executou.

`migrate-execution-ledger.py` compara `S1 == S2 == D` e recusa se a origem mudou durante
a cópia, descartando o destino parcial. Diretórios entram no instantâneo porque
`attempts/<chave>/` vazio **já é uma reserva** — o `mkdir` é a reserva, e o
`reservation.json` vem depois; um instantâneo só de arquivos perderia as reservas em voo.

`r6_r6` é **ARQUIVO SOMENTE**: não é ativado, não é modificado, não é copiado para
caminho executável.

---

## PORTÃO 3 — parada do consumidor Telegram do Managed · **ABERTO**

**Estado: NÃO RESOLVIDO. É o único bloqueio externo que resta.**

A UI da Hostinger mostra `Telegram · Conectado · Redefinir`, mas a semântica exata de
parar, reiniciar e reverter não foi provada.

A cutover exige **exatamente um consumidor** do bot. Nunca os dois pollers ao mesmo
tempo. Para isso é preciso um mecanismo **suportado** de parar o poller do Managed, e
nenhum foi observado.

Candidatos, nenhum verificado:

- desabilitar a plataforma Telegram em `/data/config.yaml` — depende de existir a chave,
  e o `config.yaml` atual **não tem seção `plugins`**;
- remover a credencial do bot do `/data/.env` do Managed — impede autenticar, mas o
  comportamento do gateway sem credencial não foi observado (recusa limpa? laço de
  reinício?);
- parar o container Managed pelo painel da Hostinger — o mais simples e o mais
  provável, e precisa ser confirmado como suportado e reversível.

A pergunta a responder é uma só: **qual mecanismo suportado para o poller do Managed, de
forma comprovável e reversível?**

---

## PORTÃO 4 — provar o plugin sem tocar no bot · **FECHADO pela a4-r6, no Hermes GENUÍNO**

`probe-plugin-winner.py` prova, contra o artefato de produção exato, em duas etapas.

**§8 — auditoria estática por AST**, antes de executar uma linha: a via `import` →
`register(ctx)` não constrói adaptador, não conecta, não faz polling, não chama
provedor, não abre rede — e toca no contexto do plugin **exatamente**
`register_platform`, enumerado como permitido em vez de proibido.

**§9 — registro GENUÍNO.** `PluginManifest` → `PluginManager` → `PluginContext` reais,
num `HERMES_HOME` isolado, e a entrada em vigor lida do `PlatformRegistry` real.

### A chave é LIDA, não inferida nem derivada

Três rodadas até aqui, e o percurso importa:

- **a8-r1** reportava PASS com a chave `telegram` **inferida** da herança, e a ressalva
  num rodapé. Quem lê "PASS" não lê rodapé.
- **a8-r2** tirou o PASS, mas media varrendo o grafo de atributos de um contexto
  **dublado** — porque a API real ainda não havia sido observada.
- **a8-r3** observou o Hermes genuíno: `entries[entry.name] = entry`, verbatim. **Não
  existe derivação.** A chave é o argumento `name` que o plugin passa. Quem escolhe
  `name` escolhe quem vence.

Então varrer grafo deixou de ser a melhor evidência disponível e passou a ser a pior.
Medido agora, contra o Hermes 0.20.4 genuíno:

```
chaves no escopo         ['telegram']
chave_armazenada         telegram          ← PlatformRegistry real
rótulo                   Telegram
source                   plugin
plugin_name              creditum-telegram-governed
adapter_factory          register.<locals>.fabrica_governada
adapter_factory_module   creditum_hermes_telegram.adapter
fabrica_e_a_governada    True
loader_diferido_restante False             ← nenhum concorrente em vigor
compat id                creditum_telegram_adapter_compat/0.20.4/v2
chamadores nativos       ['_handle_command', '_handle_text_message']
limiar nativo medido     4000
```

Efeito colateral, contado com bloqueio no limite do SO: **0** adaptadores construídos,
**0** `create_adapter`, **0** connect, **0** polling, **0** sockets, **0** DNS, **0**
provedor.

### Duas escolhas que a leitura obrigou

Registros de plugin são **escopados por `HERMES_HOME`**. Ler o escopo errado daria
"nenhuma chave" com o registro intacto — falso negativo que pareceria falha de
produção. A sonda usa `registered_names()` e `snapshot_registration(nome, scope=)`.

E **evita** `all_entries()`/`plugin_entries()`: os dois chamam `_resolve_all()`, que
importaria os ~20 plugins de plataforma embarcados. Efeito colateral fabricado pela
própria medição continua sendo efeito colateral.

### Fora do staging, a sonda recusa

O portão do Hermes genuíno vem **antes** de registrar. Sem a distribuição instalada não
há registro a medir, e a sonda sai `3` com `KEY_NOT_MEASURABLE_HERE`. Registrar contra
um dublê e só então perguntar se o Hermes era real convida a reportar o que se mediu no
dublê.

O que o portão da a6 já provava antes, sem Telegram nenhum:

- manifesto externo como autoridade; árvore fechada; hashes; ausência de bytecode;
- Hermes exatamente 0.20.4; identidade de compatibilidade da a4;
- ativação em `config.yaml`; precedência de projeto (`/opt/hermes-agent/.hermes/plugins`);
- colisão de entry point nos grupos `hermes_agent.plugins` e
  `hermes_agent.plugin_capabilities`.

O que **não** é provável sem subir o gateway: que `register_platform` foi de fato
chamado e que a classe governada **venceu** o registro.

O caminho de menor risco é um container de STAGING **sem a credencial do bot**: o plugin
carrega, tenta registrar, e não há como fazer polling sem token. Mas o comportamento do
gateway sem credencial não foi observado, e não vou inventar um modo LIVE falso.

**Pergunta a responder:** o Hermes 0.20.4 sobe o gateway e carrega plugins de plataforma
com a credencial do Telegram ausente, registrando sem fazer polling — ou aborta?

---

## Cadeia de arranque governada

```
docker compose up
  → ENTRYPOINT /opt/creditum/prestart-gate.sh     (fixo, sem CMD, sem $@, sem eval)
      → verificador da a6, somente leitura, rede zero
          RECUSA  → sai != 0 → container morre → gateway NUNCA sobe
          APROVA  → exec /opt/venv/bin/python3 /opt/venv/bin/hermes gateway run
```

`HERMES_HOME=/data` e `WORKDIR=/opt/hermes-agent` são declarados na imagem, nunca
herdados de padrão. O `WORKDIR` não é cosmético: o caminho de plugin de **projeto** é
`WORKDIR/.hermes/plugins`, e é ele que pode sobrepor o plugin de usuário.

`restart: unless-stopped`, e **não** `on-failure`: recusa do portão é decisão, não falha
transitória. `on-failure` transformaria "o plugin está errado" em laço que esconde a
recusa.

### Limite de confiança, dito sem eufemismo

`docker run --entrypoint ...` por um operador com acesso ao daemon contorna o portão.
Docker não impede root hostil, e eu não afirmo que impede. O que a imagem garante é o
invariante da **implantação normal**: subir pelo compose governado passa pelo portão,
sempre. Governança contra o próprio administrador da máquina é outro problema, e não é
este.

---

## Sequência, com os portões no lugar

Cada etapa só começa com a anterior **provada**. Nada aqui é executável enquanto os
quatro bloqueios estiverem abertos.

### Fase 0 — provisionar (§20)

VPS Hostinger com Docker e Compose; filesystem persistente; firewall **sem porta de
entrada** (o Telegram é saída); acesso SSH do operador; `/etc/creditum/hermes.env` com
0600 e dono do operador; política de reinício; backup do volume.

Recursos: **DESCOBERTA** — o consumo do Managed (CPU, RAM, disco) não foi medido pela
a7-r1, e dimensionar por palpite é o tipo de erro que só aparece em produção.

### Fase 1 — backup, antes de qualquer coisa (§19)

Snapshot somente leitura do `/data` do Managed com SHA-256 por arquivo governado, **sem
imprimir valor de segredo**. Guardado fora da VPS e fora do container. O restauro é
"colocar o Managed de volta como estava", e ele tem de ser provado ANTES da cutover, não
depois.

### Fase 2 — exportação somente leitura (§11)

Inventário primeiro (`classify-data-inventory.py`), cópia depois, e só do que é
`OBRIGATORIO`. Origem segue rodando e **não é modificada nem apagada**. Hash conferido
na origem e no destino. Segredo por env_file provisionado à mão, nunca por cópia de
arquivo em log.

### Fase 3 — staging, sem tocar no bot (§13)

Container sobe, portão da a6 aprova, plugin descoberto e registrado, **sem consumidor
Telegram de produção**. Bloqueado pelo portão 4.

### Fase 4 — injeção de falha (§15)

Nove recusas, cada uma com **contagem de processo do gateway = 0** como evidência:

| Condição | Defeito esperado |
|---|---|
| manifesto ausente | `MANIFEST_MISSING` |
| SHA do manifesto errado | `MANIFEST_HASH_MISMATCH` |
| plugin ausente | `PLUGIN_ROOT_MISSING` |
| plugin modificado | `PLUGIN_FILE_HASH_MISMATCH` |
| arquivo inesperado no plugin | `PLUGIN_UNEXPECTED_FILE` |
| plugin não habilitado na config | `PLUGIN_NOT_ENABLED` |
| sobreposição por plugin de projeto | `PRECEDENCE_OVERRIDE_PRESENT` |
| colisão de entry point | `ENTRYPOINT_OVERRIDE_PRESENT` |
| Hermes != 0.20.4 | `HERMES_VERSION_UNSUPPORTED` |

### Fase 5 — cutover (§12)

> **`G3_NOT_PROVEN` → NENHUM POLLER DE PRODUÇÃO DA VPS SOBE.**
>
> Este é o portão de ativação, e nenhum artefato local pode permitir pulá-lo. Enquanto
> o mecanismo suportado de parar o poller do Managed não estiver provado e reversível,
> a etapa 2 abaixo não tem como ser executada — e sem a 2 provada, a 4 é proibida.

1. VPS pronta, consumidor Telegram da VPS **inativo**;
2. parar o consumidor do Managed pelo mecanismo suportado — bloqueado pelo portão 3;
3. **provar** que o poller antigo parou;
4. só então ativar o consumidor da VPS;
5. **provar** exatamente um consumidor.

Nenhuma mensagem de teste nesta fase.

### Fase 6 — rollback, desenhado antes de ser preciso (§14)

**Antes da cutover:** falha na VPS → parar a VPS. O Managed segue intacto e ativo. Custo
zero, porque nada foi tirado dele.

**Depois da cutover:** parar o gateway/Telegram da VPS → **provar** que o poller da VPS
parou → reativar o Managed → **provar** que ele é o único consumidor. Nunca os dois. E
nada na origem foi destruído, o que é o que torna este rollback possível.

---

## Fronteira de rede e provedor (§17)

Quatro coisas separadas, e juntá-las é como se chama modelo por acidente:

| Teste | Rede | Provedor |
|---|---|---|
| integridade de arranque (a6) | **zero** | zero |
| ativação de plugin | Telegram apenas | zero |
| cutover do Telegram | Telegram apenas | zero |
| FIRST LIVE | Telegram + provedor | **sim, e só com aprovação explícita** |

O portão da a6 é offline por construção: não importa `urllib`, `socket`, `http`,
`requests`, `subprocess`, `shutil` nem `tempfile`, e há teste estrutural que falha se
importar.
