# Exemplos do Bruno — referência pra adaptar

> Templates reais dos arquivos raiz da **Amora 4.0** — Chief of Staff do Bruno Okamoto.
> Sanitizados (sem dados pessoais sensíveis), mantidos em detalhe pra servir de inspiração.

## Pra que servem

Quando você tá criando seu agente e trava em "que tom escolher?", "que regras definir?", "como organizar workspace?" — esses arquivos mostram um exemplo concreto de como ficou a **Amora**, agente que o Bruno usa todo dia há meses.

**Importante:** Esses são **templates de referência**, não cópia obrigatória. Pegue o que faz sentido pro seu contexto, ignore o resto. Aluno PME de padaria, médico, advogado, agência — cada um terá agente diferente. A Amora é referência de profundidade, não de conteúdo específico.

## Como o agente usa esses exemplos

Durante os wizards do starter-kit, o agente oferece exemplo opt-in. Aluno trava em "que nome quer pro agente?" e pode mandar `"exemplo"` — agente carrega `IDENTITY-amora.md` e mostra como ficou.

Padrão: ver [`references/padrao-exemplos-opt-in.md`](../skills/starter/onboarding-checklist/references/padrao-exemplos-opt-in.md).

## Arquivos disponíveis

| Arquivo | Mostra | Usado em qual wizard |
|---|---|---|
| [`USER-amora.md`](USER-amora.md) | Como o Bruno se descreveu pra Amora | `wizard-aluno` |
| [`IDENTITY-amora.md`](IDENTITY-amora.md) | Como a Amora foi nomeada/configurada | `wizard-agente` |
| [`SOUL-amora.md`](SOUL-amora.md) | Personalidade profunda da Amora (anti-patterns, tom, jeitos) | `wizard-agente` (Aula 5 do curso aprofunda) |
| [`AGENTS-amora.md`](AGENTS-amora.md) | Regras de operação entre Bruno e Amora | `wizard-agente` |
| [`MAPA-amora.md`](MAPA-amora.md) | Como a Amora navega o workspace do Bruno | `wizard-workspace` |

## O que foi sanitizado vs mantido

**Removido (privacidade):**
- Nomes específicos de família (esposa/filhos do Bruno)
- Condições médicas pessoais
- Valores financeiros específicos (salário, MRR exato)
- Nomes de pessoas internas (parceiros, equipe)
- Negociações em andamento
- Paths de credenciais

**Mantido (educacional):**
- Estrutura completa dos arquivos
- Profundidade real das definições
- Tom e estilo autêntico
- Anti-patterns e regras de operação
- Padrões de organização e navegação
- Filosofia operacional ("bias to action", "GSD mode", etc)

## Aviso ético

Esses exemplos são propriedade intelectual da Pixel Educação (Bruno Okamoto). Uso permitido: **referência educacional dentro do contexto do curso**. Não republicar fora do curso, não comercializar, não usar em outros agentes sem adaptar pro seu contexto.

---

*Última revisão: 02/05/2026*
