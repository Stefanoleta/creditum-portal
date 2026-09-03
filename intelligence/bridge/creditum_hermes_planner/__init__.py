"""
Fase 3.1d-D2E-A2 — entrypoint DEDICADO do planejamento canônico.

Pacote próprio, e não um modo novo do worker PRECALL, por decisão explícita: a d1
fechou o defeito de a string `"LIVE"` bastar para mudar comportamento, e acrescentar
`mode=` ao worker reabriria a mesma porta por outro nome. Dois entrypoints fixos, cada
um com um comportamento, não têm seletor para adulterar.

Este pacote NÃO executa: não constrói cliente, não chama provedor, não abre rede, não
toca o livro-razão e não conhece capacidade viva.
"""
