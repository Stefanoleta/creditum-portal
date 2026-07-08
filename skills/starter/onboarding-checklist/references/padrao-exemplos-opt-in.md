# Padrão de Design — Exemplos Opt-In

> Como wizards do starter-kit oferecem templates de referência sem forçar.

---

## A regra em uma frase

**Toda pergunta que pede input criativo (não factual) inclui linha "manda 'exemplo' se quiser ver template".**

Aluno escolhe. Aluno que sabe responde direto. Aluno que trava pede exemplo.

---

## Por quê

3 razões:

1. **Opt-in não força** — aluno que sabe responde direto, sem fricção. Aluno que trava pede exemplo. Carga cognitiva zero pra quem não precisa.

2. **Destrava aluno leigo** — "que tom quer no agente?" pode paralisar PME que nunca pensou nisso. Mostrar Amora pronta = "ah, então é assim". Aluno parte de algo concreto, não do branco.

3. **Carrega autoridade** — "exemplo do Bruno" reforça que existe coisa funcionando, não é exercício hipotético. Confiança.

---

## Quando aplicar

**SIM, oferecer exemplo:**

- Pergunta pede input **criativo**: "que tom?", "que regras?", "que estrutura?"
- Aluno sem referência clara provavelmente trava
- Existe template no `starter-kit/exemplos/`

**NÃO oferecer exemplo:**

- Pergunta pede input **factual**: "qual seu nome?", "qual seu negócio?"
- Pergunta tem resposta única: "deseja seguir? (sim/não)"
- Não existe exemplo relevante

---

## Padrão de pergunta

```
"{Pergunta}.

Manda direto se já tem ideia.
Se quiser ver um exemplo (template do Bruno/Amora), manda 'exemplo'."
```

**Exemplos de aplicação:**

### `wizard-agente`

```
"Que nome você quer me dar?

Manda direto se já tem ideia.
Se quiser ver um exemplo (template da Amora), manda 'exemplo'."
```

### `wizard-aluno`

```
"Conta um pouco sobre você — quem é, o que faz, área, dor principal.

Manda como falaria pra um amigo novo.
Se quiser ver um exemplo (USER do Bruno), manda 'exemplo'."
```

### `wizard-workspace`

```
"Vou organizar seu workspace. Tá tudo bem assim ou tem alguma estrutura
particular que você quer (ex: pasta 'clientes' separada, 'receitas' separada)?

Manda direto se sim.
Se quiser ver um exemplo (workspace da Amora), manda 'exemplo'."
```

---

## Comportamento ao receber "exemplo"

1. **Identificar contexto** — qual wizard ativo, qual pergunta ativa
2. **Carregar exemplo correspondente** de `starter-kit/exemplos/`
3. **Apresentar com header de contexto:**

   > "Esse é o {arquivo} da Amora — {breve descrição do contexto}.
   > Não copia, adapta pro teu jeito.
   >
   > [conteúdo do template inline ou em mensagem separada se for grande]"

4. **Voltar pra pergunta original:**

   > "Agora que viu o exemplo, me conta o seu jeito."

---

## Mapa de contextos → exemplos

| Wizard / Pergunta | Carrega arquivo |
|---|---|
| `wizard-aluno` perguntando sobre identidade pessoal | `exemplos/USER-amora.md` |
| `wizard-agente` perguntando nome/tom/iniciativa | `exemplos/IDENTITY-amora.md` |
| `wizard-agente` perguntando personalidade/anti-patterns | `exemplos/SOUL-amora.md` |
| `wizard-agente` perguntando regras/limites | `exemplos/AGENTS-amora.md` |
| `wizard-workspace` perguntando estrutura | `exemplos/MAPA-amora.md` |
| Outros wizards (futuro) | conforme novos exemplos forem adicionados |

---

## Quando aluno NÃO pediu exemplo

Não mostrar. Não insistir. Não perguntar "quer ver exemplo?". A linha "manda 'exemplo' se quiser" basta.

Aluno que ignora o opt-in tá dizendo "não preciso". Respeita.

---

## Quando aluno pediu exemplo MAS quer outro

Aluno: "exemplo"
Agente: [mostra IDENTITY-amora.md]
Aluno: "quero outro"

Comportamento: agente lista todos os exemplos disponíveis e pede pra aluno escolher:

> "Tem esses templates disponíveis:
> - USER-amora.md (sobre o Bruno)
> - IDENTITY-amora.md (que você acabou de ver)
> - SOUL-amora.md (personalidade da Amora)
> - AGENTS-amora.md (regras entre Bruno e Amora)
> - MAPA-amora.md (workspace da Amora)
>
> Qual quer ver?"

---

## Princípios relacionados

- **Princípio 7 (em dúvida, perguntar):** se aluno mandou "exemplo" sem contexto claro, perguntar qual quer
- **Princípio 11 (detectar antes de pedir):** se aluno já viu o exemplo na sessão atual, não mostrar de novo automaticamente — perguntar se quer rever
- **UX premium:** exemplos não interrompem fluxo, retornam pra pergunta original

---

## Por que é padrão de design, não princípio

Princípios defensivos (1-12) protegem **integridade técnica** (backup, confirmação, single source of truth, etc).

Padrão "exemplos opt-in" é sobre **UX de aprendizagem** — destrava aluno leigo sem forçar quem não precisa. É decisão de produto, não regra de segurança.

Por isso vive em `padrao-exemplos-opt-in.md` separado, não como Princípio 13 em `principios-defensivos.md`.

---

*Última revisão: 02/05/2026*
