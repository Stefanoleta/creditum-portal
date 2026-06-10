# CLAUDE.md — Creditum Portal

Este arquivo fornece contexto permanente ao Claude Code para trabalhar neste repositório.

---

## Negócio

**Creditum** é uma fintech brasileira de crédito educacional estruturada como corban (correspondente bancário), operando via FIDC (Fundo de Investimento em Direitos Creditórios). Atua como intermediária de originação e gestão de portfólio entre um parceiro financeiro e uma rede de escolas parceiras.

**Segmentos ativos:**
- Escolas de ensino regular (segmento principal)
- Cursinhos preparatórios para residência médica (segmento em expansão)
- EdTech (fase seguinte planejada)

**Modelo de receita:** spread sobre crédito originado + gestão do FIDC

**Métricas relevantes:**
- Carteira ativa: centenas de clientes
- Taxa de inadimplência: ~11% (dentro do benchmark para portfólio misto)
- Valuation referência: R$5M–8M (cenário comprador estratégico)

---

## Arquitetura e Integrações

**CRM:** Bitrix24
- Funil SDR com 11 estágios de pipeline
- 12 tabulações de chamada com lógica de automação
- Campos customizados: [descrever quando definidos]
- API REST disponível para integração

**Discador:** Argus
- 2 agentes ativos: Rafaella Gomes, Marcela Sampaio
- Coordenador: Leonardo
- Integração com Bitrix24 em avaliação (verificar suporte API nativo vs CSV)

**Motor de Crédito (em desenvolvimento):**
- Algoritmo: Gradient Boosting / XGBoost / LightGBM
- Outputs: PD (Probability of Default) e LGD (Loss Given Default)
- Fontes de dados: Serasa, Quod, SPC (bureaus)
- Conformidade: LGPD obrigatória

**Infraestrutura:**
- Repositório: GitHub (Stefanoleta/creditum-portal)
- Deploy: Vercel
- Ambientes: Mac local + GitHub Codespaces

---

## Stack Técnico

- **Linguagem principal:** [definir — Python / TypeScript / outro]
- **Framework:** [definir]
- **Banco de dados:** [definir]
- **Testes:** [definir]

---

## Regras de Segurança — OBRIGATÓRIAS

- NUNCA logar ou expor CPF, dados pessoais de clientes ou tomadores
- NUNCA commitar tokens de API (Bitrix24, Argus, Vercel, Anthropic) — usar variáveis de ambiente
- NUNCA salvar dados de bureau (Serasa/Quod/SPC) em arquivo local ou log
- Tokens e credenciais SEMPRE via `.env` — nunca hardcoded
- Dados sensíveis de crédito NUNCA fora do ambiente de produção autorizado
- LGPD: qualquer dado pessoal requer justificativa de uso e consentimento

---

## Convenções de Desenvolvimento

- Commits em português, descritivos: `feat: adiciona score de crédito`, `fix: corrige cálculo de LGD`
- Branches: `feature/nome`, `fix/nome`, `chore/nome`
- PRs obrigatórios antes de merge na main — nunca commitar direto
- Testes obrigatórios para qualquer lógica do motor de crédito
- Documentar decisões importantes em `docs/decisions/AAAA-MM-DD.md`

---

## Foco Atual

1. Estruturar o portal Creditum (este repositório)
2. Desenvolver motor de crédito com PD/LGD
3. Integrar Argus ↔ Bitrix24 via API
4. Construir dashboards de conversão e performance SDR
5. Evoluir gatilhos de aumento de conversão por setor

---

## O que NÃO fazer

- Não commitar direto na main
- Não expor dados de clientes em nenhum output
- Não instalar dependências sem avaliar licença e segurança
- Não hardcodar URLs de ambiente (usar variáveis)
- Não ignorar erros de tipagem do Pyright

---

*Atualizar este arquivo sempre que houver mudanças relevantes de arquitetura, stack ou regras de negócio.*
