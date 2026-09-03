"""
Fase 3.1d-D2E-A4-R1 — adaptador Telegram governado da Creditum.

Existe por um motivo estreito: o adaptador nativo do Hermes 0.20.4 junta mensagens
próximas numa janela de lote, e o `MessageEvent` resultante não preserva quantas
mensagens entraram nele. Uma política de "uma execução viva, uma mensagem" que não
consegue contar mensagens não é política — é esperança.

O que este pacote NÃO faz: não faz polling próprio, não lê token, não reimplementa a
allowlist, não modifica nada sob `/opt/hermes-agent`. Ele registra uma subclasse pela
interface suportada e intercepta o ponto mínimo — antes de o lote destruir a
cardinalidade.
"""
