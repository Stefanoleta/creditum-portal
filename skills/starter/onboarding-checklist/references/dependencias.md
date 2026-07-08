# Dependências entre Passos

> Mapa de quais passos dependem tecnicamente de quais.
> A `onboarding-checklist` consulta isso ao processar comando "pulo" pra avisar antes de avançar.

---

## Tabela de dependências diretas

| Passo | Depende de | Dependência é... | O que acontece se pular |
|---|---|---|---|
| 0 (Whisper) | — | Nenhuma | Aluno digita tudo, sem áudio |
| 1 (Personalidade agente) | — | Nenhuma | Agente fica genérico, sem nome |
| 2 (Personalidade aluno) | — | Nenhuma | Agente não te conhece, fala genérico |
| 3 (Autonomia) | — | Nenhuma | Agente pede aprovação a CADA ação nos passos seguintes |
| 4 (Workspace) | **3** | Hard (técnica) | Agente vai pedir aprovação pra criar pasta/arquivo a cada passo |
| 5 (Conectar) | **3** | Hard (técnica) | Agente vai pedir aprovação a cada chave inserida |
| 6 (Vitória) | **3 + 4 + 5** | Hard (técnica) | Vitória vira monólogo pq agente fica perguntando aprovação a cada passo + sem chaves não tem pesquisa real |

---

## Tabela de dependências de qualidade (não técnicas)

Passos que **funcionam** sem o anterior, mas a experiência fica degradada:

| Passo | Pulou | Qualidade da experiência |
|---|---|---|
| 2 | Pulou 1 | Agente sem nome próprio. Aluno responde entrevista sobre si pra um agente "genérico". UX fria. |
| 5 | Pulou 0 | Aluno tem que digitar todas as 3-5 chaves manualmente sem poder mandar foto/áudio do dashboard. |
| 6 | Pulou 0 | Vitória sem áudio. Aluno não vive a "magia" de mandar áudio + agente entender. |

---

## Mensagens padrão por dependência

### Quando aluno pula passo 3 (Autonomia)

```
Antes de seguir, aviso: o passo {próximo} depende do passo 3 (Autonomia).

Sem ele, eu vou pedir sua aprovação a CADA coisa que faço — criar pasta,
salvar arquivo, executar comando. Quebra o fluxo "🤖 eu monto pra você"
dos passos automatizados.

Quer:
*a)* Voltar e fazer o passo 3 agora (~6min)
*b)* Seguir mesmo assim e aprovar tudo manualmente
```

### Quando aluno pula passo 4 (Workspace)

```
Antes de seguir, aviso: o passo {próximo} pode dar problema sem o passo 4.

O passo 5 (Conectar) e 6 (Vitória) precisam saber ONDE salvar arquivos
— sem o workspace organizado, vou ter que assumir defaults que talvez
não combinem com o que você prefere depois.

Quer:
*a)* Voltar e fazer o passo 4 agora (~4min)
*b)* Seguir mesmo assim com defaults que você pode ajustar depois
```

### Quando aluno pula passo 5 (Conectar)

```
Antes de seguir pra primeira vitória, aviso: sem o passo 5, eu não tenho:

- Chave Brave Search → não consigo pesquisar na internet
- OpenAI API → não consigo transcrever áudio
- Backup GitHub → seu trabalho não fica salvo automaticamente

A primeira vitória vai funcionar, mas sem pesquisa real e sem backup.
Vai ser tipo "demonstração", não trabalho de verdade.

Quer:
*a)* Voltar e fazer o passo 5 agora (~12min)
*b)* Seguir e fazer vitória "demo" (sem pesquisa real)
```

---

## Tipo de dependência

**Hard (técnica)** = sem o passo anterior, próximo passo NÃO funciona ou funciona MUITO mal.

**Soft (qualidade)** = próximo passo funciona, mas experiência degrada.

Ao pular, sempre mostrar o tipo de dependência pra aluno entender o trade-off real.

---

## Casos especiais

### Pulou 0 (Whisper opcional)

Sem aviso. Passo 0 é opcional por design — pular é caminho normal.

### Pulou 1 (Personalidade agente) E não vai voltar

Passo 2 (Personalidade aluno) pergunta "Como você quer ser chamado?" — mas agente não tem nome. Dilema:

- Opção A: Passo 2 pergunta nome do agente também (engole responsabilidade do passo 1)
- Opção B: Aluno termina jornada com agente sem nome — pode pedir depois com "muda meu agente"

Decidi por **B**: respeitar pulo do aluno. Agente sem nome é legítimo.

### Pulou TODOS exceto 6

Aluno chegou no passo 6 sem fazer 1, 2, 3, 4 nem 5. Cenário extremo. Tratamento:

```
Você quer fazer a vitória sem nenhum dos outros passos?

Pra ser honesto, vai ser frustrante:
- Eu não tenho identidade nem te conheço (não vou personalizar nada)
- Não tenho autonomia (vou pedir aprovação a cada ação)
- Não tenho workspace organizado (não vou saber onde salvar)
- Não tenho pesquisa nem APIs (vou usar só meu conhecimento interno)

Recomendação forte: faz pelo menos 1 e 3 antes. Isso destrava a vitória
de verdade. Manda "volta no 1" pra começar do começo.

Se quiser MESMO assim seguir só pro 6, manda "vai mesmo".
```

---

## Inverso: o que cada passo HABILITA

| Passo concluído | Habilita |
|---|---|
| 0 | Áudio em todos os passos seguintes |
| 1 | Agente personalizado em todas as próximas mensagens |
| 2 | Agente te conhece e adapta tom/sugestões |
| 3 | Passos 4-6 fluem sem pedir aprovação a cada ação |
| 4 | Agente sabe onde salvar tudo que cria |
| 5 | Pesquisa real, transcrição áudio, backup automático |
| 6 | Aluno tem prova viva de que agente trabalha |
