# HEARTBEAT.md

> Configuração do mecanismo de proatividade do agente. Define COMO ele vigia
> seu dia. O que ele vigia mora em `memory/hot.md` (auto-mantido).
>
> Edite este arquivo quando quiser mudar comportamento (frequência, checks,
> regras de silêncio). O agente recarrega no próximo poll.

## Frequência

- **Poll a cada:** [30 minutos]
- **Janela ativa:** [08:00 às 22:00]
- **Quiet hours:** [22:00 às 08:00] — só interrompe em urgência real

## Checks rotacionáveis

> O agente sorteia 2-4 destas por heartbeat (não checa todas juntas — vira ruído).
> Comente com `#` as que não quer ativar agora.

- [ ] **Inbox triage** — emails das últimas 4h, classifica em [urgente/pode esperar/lixo], avisa só urgentes
- [ ] **Calendário próximo** — próximas 24-48h, lembra de evento amanhã 1 dia antes às 18h
- [ ] **Mention sweep** — LinkedIn/Twitter/menções, só relevantes pro negócio
- [ ] **Pendências paradas** — itens em `pendencias.md` com nome de terceiro parado 3+ dias
- [ ] **Memory maintenance** — a cada 3 dias, extrai aprendizados de `memory/YYYY-MM-DD.md` pra `MEMORY.md`
- [ ] **Weather guard** — se evento externo hoje, checa previsão e avisa só se chuva real
- [ ] **News watch** — 2-3 fontes que importam (newsletters, RSS), só se algo realmente novo

## Regras de silêncio (anti-spam)

- Já checou nos últimos 30min? → `HEARTBEAT_OK` (silencioso)
- Nada novo desde a última checagem? → silêncio (não mandar "tudo certo!" gratuito)
- Você em modo focado (call, trabalho profundo)? → segura mensagem não-urgente pro próximo break
- Quiet hours ativas? → só interrompe se for urgência real (deadline em 2h, alerta crítico)

## Regras de reach out (quando vale interromper)

- Email importante chegou (cliente ativo, prazo, financeiro)
- Evento começa em <2h e você ainda não confirmou
- Achou algo genuinamente interessante (oportunidade, ameaça, sinal forte)
- Faz mais de 8h sem dizer nada e tem coisa relevante acumulada

## Como o heartbeat consulta contexto

O heartbeat NÃO duplica memória. Ele lê `memory/hot.md` (auto-mantido pela
pipeline + skill /salve) pra saber:

- Top prioridades da semana
- Negociações ativas e próximos passos pendentes
- Decisões recentes
- Métricas-chave
- Prazos críticos por data

Se algum prazo de `hot.md` chega perto e ainda tá pendente, heartbeat te avisa.

---

> **Histórico de ajustes:**
> - YYYY-MM-DD: criado pelo onboarding do Starter Kit
