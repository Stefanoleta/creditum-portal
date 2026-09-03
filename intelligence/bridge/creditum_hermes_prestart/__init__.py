"""
Fase 3.1d-D2E-A6 — o portão de INTEGRIDADE PRÉ-PARTIDA do plugin Telegram.

─── O bloqueio que a a5 descobriu ──────────────────────────────────────────────

O Hermes 0.20.4 não tem mecanismo de plugin OBRIGATÓRIO. Se o plugin governado da
Creditum estiver ausente, malformado, não descoberto ou não habilitado, o plugin
Telegram nativo — o que faz lote de mensagens e não emite ingresso — assume. E assume
em silêncio: nada no arranque diz que a via governada não subiu.

Isso torna as conferências locais do plugin insuficientes por construção. A `compat`
da a4 prova compatibilidade no momento de registrar, mas ela só roda se o plugin
governado for carregado. Um plugin que não carrega não recusa nada.

─── A propriedade exigida ──────────────────────────────────────────────────────

    plugin ausente / inválido / não aprovado  →  O GATEWAY NÃO SOBE

Nunca: plugin inválido → Telegram nativo sobe no lugar.

─── Por que fora do plugin ─────────────────────────────────────────────────────

Um verificador que vive dentro do artefato que ele verifica não é autoridade sobre
esse artefato. A autoridade vem de um MANIFESTO DE IMPLANTAÇÃO gerado a partir do
checkpoint aprovado do Git, fora do plugin — e o `plugin.yaml` não declara os próprios
hashes de confiança. O objeto verificado não é sua própria autoridade.

─── O que este pacote NÃO faz ──────────────────────────────────────────────────

Não escreve, não conserta, não instala, não baixa, não renomeia, não move plugin
ruim, não muda configuração, não abre rede, não lê `.env`, não imprime token nem
credencial, e não sobe o gateway. Ele responde uma pergunta e sai com código.
"""
