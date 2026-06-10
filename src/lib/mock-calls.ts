import type { CallRecording, CallAnalysis, DailyPatterns } from "@/types/calls"

const TODAY = new Date().toISOString().split("T")[0]

export function generateMockRecordings(): CallRecording[] {
  return [
    {
      id: "rec-001",
      arquivo: "mock-001.mp3",
      sdr_name: "Ana Beatriz",
      sdr_id: "1",
      phone: "(11) 9****-4521",
      school_name: "Colégio São Paulo",
      started_at: new Date(`${TODAY}T09:15:00`).toISOString(),
      duration_seconds: 312,
    },
    {
      id: "rec-002",
      arquivo: "mock-002.mp3",
      sdr_name: "Carlos Mendes",
      sdr_id: "2",
      phone: "(11) 9****-7832",
      school_name: "Instituto Educação SP",
      started_at: new Date(`${TODAY}T09:42:00`).toISOString(),
      duration_seconds: 187,
    },
    {
      id: "rec-003",
      arquivo: "mock-003.mp3",
      sdr_name: "Ana Beatriz",
      sdr_id: "1",
      phone: "(11) 9****-1190",
      school_name: "Faculdade Unimetro",
      started_at: new Date(`${TODAY}T10:08:00`).toISOString(),
      duration_seconds: 445,
    },
    {
      id: "rec-004",
      arquivo: "mock-004.mp3",
      sdr_name: "Rafael Costa",
      sdr_id: "4",
      phone: "(11) 9****-3344",
      school_name: "Escola Técnica Progresso",
      started_at: new Date(`${TODAY}T10:35:00`).toISOString(),
      duration_seconds: 89,
    },
    {
      id: "rec-005",
      arquivo: "mock-005.mp3",
      sdr_name: "Fernanda Lima",
      sdr_id: "3",
      phone: "(11) 9****-6612",
      school_name: "Centro Universitário Paulistano",
      started_at: new Date(`${TODAY}T11:02:00`).toISOString(),
      duration_seconds: 538,
    },
    {
      id: "rec-006",
      arquivo: "mock-006.mp3",
      sdr_name: "Marcos Pinto",
      sdr_id: "6",
      phone: "(11) 9****-9981",
      school_name: "Colégio São Paulo",
      started_at: new Date(`${TODAY}T11:28:00`).toISOString(),
      duration_seconds: 154,
    },
    {
      id: "rec-007",
      arquivo: "mock-007.mp3",
      sdr_name: "Julia Souza",
      sdr_id: "5",
      phone: "(11) 9****-2230",
      school_name: "Instituto Educação SP",
      started_at: new Date(`${TODAY}T13:15:00`).toISOString(),
      duration_seconds: 621,
    },
    {
      id: "rec-008",
      arquivo: "mock-008.mp3",
      sdr_name: "Carlos Mendes",
      sdr_id: "2",
      phone: "(11) 9****-5587",
      school_name: "Faculdade Unimetro",
      started_at: new Date(`${TODAY}T14:00:00`).toISOString(),
      duration_seconds: 203,
    },
  ]
}

export function generateMockAnalyses(): CallAnalysis[] {
  const now = new Date().toISOString()
  return [
    {
      call_id: "rec-001",
      sdr_name: "Ana Beatriz",
      sdr_id: "1",
      phone: "(11) 9****-4521",
      school_name: "Colégio São Paulo",
      started_at: new Date(`${TODAY}T09:15:00`).toISOString(),
      duration_seconds: 312,
      transcript:
        "SDR: Bom dia, posso falar com o responsável financeiro? ... Cliente: Sou eu mesmo. SDR: Perfeito! Me chamo Ana da Creditum. O Colégio São Paulo está trabalhando com crédito educacional? ... [conversa sobre taxas e condições] ... Cliente: Ficou interessante, vou ver com minha esposa. SDR: Claro, posso agendar uma reunião rápida para amanhã?",
      score: 8.2,
      tom: "positivo",
      resultado: "agendamento",
      tempo_resposta_inicial_segundos: 22,
      palavras_conversao: [
        "taxa competitiva",
        "sem burocracia",
        "parcelamento flexível",
        "agendar reunião",
        "amanhã",
      ],
      palavras_perda: ["vou pensar", "deixa eu ver com minha esposa"],
      objecoes: ["Precisa consultar a esposa antes de decidir"],
      como_tratou_objecoes:
        "Propôs agendamento de reunião com ambos para apresentação conjunta — boa estratégia para incluir o decisor.",
      pontos_positivos: [
        "Apresentação clara e objetiva nos primeiros 30 segundos",
        "Identificou rapidamente o decisor",
        "Propôs próximo passo concreto (reunião agendada)",
        "Tom amigável e profissional durante toda a ligação",
      ],
      pontos_negativos: [
        "Poderia ter explorado mais as dores específicas da escola antes de apresentar o produto",
        "Não perguntou sobre o volume de alunos inadimplentes",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-002",
      sdr_name: "Carlos Mendes",
      sdr_id: "2",
      phone: "(11) 9****-7832",
      school_name: "Instituto Educação SP",
      started_at: new Date(`${TODAY}T09:42:00`).toISOString(),
      duration_seconds: 187,
      transcript:
        "SDR: Bom dia, Instituto Educação SP? ... Cliente: Sim. SDR: Carlos da Creditum, tudo bem? ... [apresentação rápida] ... Cliente: Já temos parceiro de crédito, obrigado. SDR: Entendo, posso perguntar qual parceiro? ... Cliente: Não quero informar. SDR: Tudo bem, só queria saber se posso mandar informações por email. Cliente: Pode mandar. SDR: Ótimo, confirma seu email?",
      score: 5.8,
      tom: "neutro",
      resultado: "callback",
      tempo_resposta_inicial_segundos: 18,
      palavras_conversao: ["posso mandar por email", "confirma seu email"],
      palavras_perda: ["já temos parceiro", "não quero informar"],
      objecoes: ["Já possui parceiro de crédito educacional"],
      como_tratou_objecoes:
        "Não aprofundou a investigação sobre o parceiro atual. Poderia ter explorado diferenciadores da Creditum versus o concorrente.",
      pontos_positivos: [
        "Manteve a ligação ativa mesmo com objeção inicial forte",
        "Conseguiu abertura para envio de material por email",
        "Tom respeitoso e sem pressão",
      ],
      pontos_negativos: [
        "Não explorou os pontos fracos do parceiro atual",
        "Não apresentou nenhum diferencial da Creditum",
        "Encerrou a ligação cedo demais sem tentar qualificar melhor",
        "Deveria ter tentado agendar uma revisão da proposta em 30 dias",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-003",
      sdr_name: "Ana Beatriz",
      sdr_id: "1",
      phone: "(11) 9****-1190",
      school_name: "Faculdade Unimetro",
      started_at: new Date(`${TODAY}T10:08:00`).toISOString(),
      duration_seconds: 445,
      transcript:
        "SDR: Bom dia! Ana da Creditum. Com quem posso falar sobre crédito estudantil? ... [transferência de chamada] ... Cliente: Aqui é o diretor financeiro. SDR: Diretor, perfeito! Temos uma solução que reduziu inadimplência em 34% em escolas parceiras... [longa apresentação de proposta] ... Cliente: Manda uma proposta formal, tenho interesse. SDR: Vou preparar e enviar hoje ainda. Posso confirmar que terão decisão até sexta?",
      score: 9.1,
      tom: "positivo",
      resultado: "conversao",
      tempo_resposta_inicial_segundos: 35,
      palavras_conversao: [
        "reduziu inadimplência em 34%",
        "escolas parceiras",
        "proposta formal",
        "interesse",
        "decisão até sexta",
      ],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes:
        "Nenhuma objeção levantada. SDR conduziu a ligação com autoridade e dados concretos.",
      pontos_positivos: [
        "Uso excelente de dados (34% de redução de inadimplência) para gerar credibilidade",
        "Conseguiu chegar ao decisor certo (diretor financeiro)",
        "Estabeleceu deadline de decisão (sexta-feira)",
        "Ligação longa e produtiva — 7m25s de engajamento",
        "Prometeu proposta no mesmo dia — senso de urgência",
      ],
      pontos_negativos: [
        "Apresentação inicial poderia ser mais personalizada para faculdades",
        "Não perguntou sobre o ticket médio dos alunos",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-004",
      sdr_name: "Rafael Costa",
      sdr_id: "4",
      phone: "(11) 9****-3344",
      school_name: "Escola Técnica Progresso",
      started_at: new Date(`${TODAY}T10:35:00`).toISOString(),
      duration_seconds: 89,
      transcript:
        "SDR: Escola Técnica Progresso? ... Cliente: Sim. SDR: Rafael da Creditum. Gostaria de falar sobre crédito educacional. Cliente: Não temos interesse. SDR: Mas você já conhece nosso... Cliente: Não tenho interesse, obrigado. [desligou]",
      score: 3.4,
      tom: "negativo",
      resultado: "sem_interesse",
      tempo_resposta_inicial_segundos: 8,
      palavras_conversao: [],
      palavras_perda: ["gostaria de falar sobre", "mas você já conhece"],
      objecoes: ["Sem interesse imediato — não quis ouvir apresentação"],
      como_tratou_objecoes:
        "Tentou continuar com 'mas você já conhece...' após objeção, mas foi genérico e sem argumentação. O cliente desligou.",
      pontos_positivos: [
        "Identificou rapidamente que o cliente não tinha interesse",
      ],
      pontos_negativos: [
        "Abertura muito genérica — 'crédito educacional' sem contexto específico",
        "Não usou gatilho de curiosidade para manter o cliente na linha",
        "Não tentou agendar retorno futuro",
        "Precisaria de script de reabertura mais eficaz para objeções imediatas",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-005",
      sdr_name: "Fernanda Lima",
      sdr_id: "3",
      phone: "(11) 9****-6612",
      school_name: "Centro Universitário Paulistano",
      started_at: new Date(`${TODAY}T11:02:00`).toISOString(),
      duration_seconds: 538,
      transcript:
        "SDR: Bom dia! Fernanda da Creditum. Posso falar com o diretor financeiro? ... [espera] ... Cliente: Oi Fernanda, sou a coordenadora pedagógica. SDR: Ótimo! Trabalho com o setor financeiro das universidades para reduzir evasão por questões financeiras. Vocês têm muito aluno que tranca matrícula por não conseguir pagar? Cliente: Nossa, bastante. Principalmente no 2º semestre... [longa conversa qualificada] ... Cliente: Isso me interessa muito. Quando vocês podem vir aqui?",
      score: 9.5,
      tom: "positivo",
      resultado: "agendamento",
      tempo_resposta_inicial_segundos: 45,
      palavras_conversao: [
        "reduzir evasão",
        "aluno que tranca matrícula",
        "não conseguir pagar",
        "quando podem vir aqui",
        "interesse muito",
      ],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes:
        "Não houve objeções. SDR identificou a dor certa (evasão por questões financeiras) e o cliente se engajou naturalmente.",
      pontos_positivos: [
        "Pergunta de qualificação perfeita: 'alunos que trancam por não conseguir pagar'",
        "Adaptou o discurso para o interlocutor (coordenadora pedagógica, não financeiro)",
        "Ligação mais longa do dia — altíssimo engajamento (8m58s)",
        "Conseguiu visita presencial agendada — melhor possível resultado",
        "Linguagem empática e focada na dor do cliente",
      ],
      pontos_negativos: [
        "Poderia ter confirmado a data da visita antes de encerrar",
        "Não confirmou email para envio de proposta prévia",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-006",
      sdr_name: "Marcos Pinto",
      sdr_id: "6",
      phone: "(11) 9****-9981",
      school_name: "Colégio São Paulo",
      started_at: new Date(`${TODAY}T11:28:00`).toISOString(),
      duration_seconds: 154,
      transcript:
        "SDR: Colégio São Paulo, bom dia. Marcos da Creditum. Tem o responsável financeiro? ... Cliente: Tá em reunião. SDR: Posso deixar recado? ... Cliente: Pode. SDR: Marcos da Creditum, número 11-99999-0000. Cliente: Ok. SDR: Tem previsão de quando ele termina? Cliente: Não sei, talvez umas 14h. SDR: Perfeito, ligo de volta às 14h30. Obrigado.",
      score: 6.1,
      tom: "neutro",
      resultado: "callback",
      tempo_resposta_inicial_segundos: 12,
      palavras_conversao: ["ligo de volta às 14h30", "previsão de quando termina"],
      palavras_perda: ["tá em reunião", "não sei"],
      objecoes: ["Decisor indisponível"],
      como_tratou_objecoes:
        "Gerenciou bem a situação — deixou contato e confirmou horário para retorno às 14h30.",
      pontos_positivos: [
        "Confirmou horário específico para retorno da ligação",
        "Não insistiu desnecessariamente",
        "Deixou contato direto",
      ],
      pontos_negativos: [
        "Poderia ter perguntado o nome do decisor para personalizar o retorno",
        "Não deixou nenhuma informação de interesse para o recado",
        "Perdeu oportunidade de qualificar brevemente a secretária",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-007",
      sdr_name: "Julia Souza",
      sdr_id: "5",
      phone: "(11) 9****-2230",
      school_name: "Instituto Educação SP",
      started_at: new Date(`${TODAY}T13:15:00`).toISOString(),
      duration_seconds: 621,
      transcript:
        "SDR: Boa tarde! Julia da Creditum. Gostaria de entender como vocês lidam com alunos com dificuldade financeira... [qualificação profunda] ... Cliente: A gente perde uns 40 alunos por semestre por isso. SDR: Exatamente esse problema que a gente resolve. Posso mostrar um case de uma escola similar... [apresentação de case] ... Cliente: Muito interessante. A taxa de juros é competitiva? SDR: Nossas taxas partem de 1,49% ao mês, bem abaixo do mercado. [fechamento] ... Cliente: Vamos agendar sim.",
      score: 8.8,
      tom: "positivo",
      resultado: "agendamento",
      tempo_resposta_inicial_segundos: 28,
      palavras_conversao: [
        "1,49% ao mês",
        "abaixo do mercado",
        "case similar",
        "40 alunos por semestre",
        "vamos agendar",
      ],
      palavras_perda: ["taxa de juros"],
      objecoes: ["Questionamento sobre taxa de juros"],
      como_tratou_objecoes:
        "Respondeu com dados concretos (1,49% a.m.) e comparação com mercado. Eficaz.",
      pontos_positivos: [
        "Abertura consultiva — perguntou sobre o problema antes de apresentar solução",
        "Uso de case de escola similar gerou credibilidade",
        "Respondeu objeção de taxa com dado preciso e comparativo",
        "Ligação mais longa do dia — 10m21s de alto engajamento",
        "Fechamento natural e sem pressão",
      ],
      pontos_negativos: [
        "Poderia ter perguntado o ticket médio dos alunos para personalizar proposta",
        "Não confirmou a quantidade de vagas de interesse",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
    {
      call_id: "rec-008",
      sdr_name: "Carlos Mendes",
      sdr_id: "2",
      phone: "(11) 9****-5587",
      school_name: "Faculdade Unimetro",
      started_at: new Date(`${TODAY}T14:00:00`).toISOString(),
      duration_seconds: 203,
      transcript:
        "SDR: Boa tarde, Faculdade Unimetro? ... Cliente: Sim. SDR: Carlos da Creditum. Posso falar com o financeiro? ... Cliente: Pode falar comigo. SDR: Ótimo! Trabalho com soluções de crédito educacional. A Unimetro já tem parceria com alguma fintech? Cliente: Não ainda. SDR: Perfeito! Posso enviar nossa apresentação e agendar uma call de 15 minutos esta semana? Cliente: Pode ser quinta às 10h. SDR: Confirmado! Quinta às 10h, mando o convite agora.",
      score: 7.6,
      tom: "positivo",
      resultado: "agendamento",
      tempo_resposta_inicial_segundos: 20,
      palavras_conversao: [
        "não ainda",
        "call de 15 minutos",
        "esta semana",
        "quinta às 10h",
        "mando o convite agora",
      ],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes: "Sem objeções. Qualificação rápida revelou janela aberta.",
      pontos_positivos: [
        "Qualificação rápida e eficaz ('já tem parceria?')",
        "Proposição direta de próximo passo com tempo definido (15 min)",
        "Confirmou data e horário específicos",
        "Comprometeu-se a enviar convite imediatamente",
      ],
      pontos_negativos: [
        "Não explorou a dor antes de propor reunião — poderia ter qualificado melhor",
        "Ligação poderia ter sido mais consultiva para gerar mais valor antes da reunião",
      ],
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
  ]
}

export function computeMockPatterns(analyses: CallAnalysis[]): DailyPatterns {
  const total = analyses.length
  const scoreSum = analyses.reduce((s, a) => s + a.score, 0)
  const conversoes = analyses.filter((a) => a.resultado === "conversao" || a.resultado === "agendamento").length

  const wordFreqConversao: Record<string, number> = {}
  const wordFreqPerda: Record<string, number> = {}

  for (const a of analyses) {
    for (const w of a.palavras_conversao) {
      wordFreqConversao[w] = (wordFreqConversao[w] ?? 0) + 1
    }
    for (const w of a.palavras_perda) {
      wordFreqPerda[w] = (wordFreqPerda[w] ?? 0) + 1
    }
  }

  const topConversao = Object.entries(wordFreqConversao)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)

  const topPerda = Object.entries(wordFreqPerda)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)

  const objecaoFreq: Record<string, number> = {}
  for (const a of analyses) {
    for (const o of a.objecoes) {
      objecaoFreq[o] = (objecaoFreq[o] ?? 0) + 1
    }
  }
  const principalObjecao =
    Object.entries(objecaoFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Nenhuma objeção identificada"

  const sdrMap: Record<string, { score: number; count: number; conversoes: number }> = {}
  for (const a of analyses) {
    if (!sdrMap[a.sdr_name]) sdrMap[a.sdr_name] = { score: 0, count: 0, conversoes: 0 }
    sdrMap[a.sdr_name].score += a.score
    sdrMap[a.sdr_name].count += 1
    if (a.resultado === "conversao" || a.resultado === "agendamento") sdrMap[a.sdr_name].conversoes += 1
  }

  const rankingSdrs = Object.entries(sdrMap)
    .map(([name, v]) => ({
      sdr_name: name,
      score_medio: Math.round((v.score / v.count) * 10) / 10,
      total_analisadas: v.count,
      conversoes: v.conversoes,
    }))
    .sort((a, b) => b.score_medio - a.score_medio)

  const dist = analyses.reduce(
    (acc, a) => {
      acc[a.resultado] = (acc[a.resultado] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return {
    data: new Date().toISOString().split("T")[0],
    total_analisadas: total,
    score_medio: total > 0 ? Math.round((scoreSum / total) * 10) / 10 : 0,
    taxa_conversao: total > 0 ? Math.round((conversoes / total) * 100) : 0,
    top_palavras_conversao: topConversao,
    top_palavras_perda: topPerda,
    principal_objecao: principalObjecao,
    ranking_sdrs: rankingSdrs,
    distribuicao_resultados: dist as Record<string, number> as Record<import("@/types/calls").CallResultado, number>,
  }
}
