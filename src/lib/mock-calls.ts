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
      score: 82,
      tom: "positivo",
      resultado: "recontato",
      tempo_resposta_inicial_segundos: 22,
      palavras_conversao: ["taxa competitiva", "sem burocracia", "parcelamento flexível", "agendar reunião", "amanhã"],
      palavras_perda: ["vou pensar", "deixa eu ver com minha esposa"],
      objecoes: ["Precisa consultar a esposa antes de decidir"],
      como_tratou_objecoes: "Propôs agendamento de reunião com ambos para apresentação conjunta — boa estratégia para incluir o decisor.",
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
      // Coaching fields
      score_breakdown: { abertura: 21, engajamento_lead: 20, tratamento_objecao: 20, proposta_beneficio: 21 },
      resumo: "Ana fez uma abertura sólida e chegou ao decisor rapidamente. O lead demonstrou interesse genuíno mas precisou consultar a esposa antes de decidir.",
      momento_critico: {
        tempo: "2:15",
        descricao: "Quando o cliente disse 'vou ver com minha esposa', Ana aceitou sem aprofundar",
        alternativa: "Poderia ter perguntado: 'Entendo! Posso fazer uma ligação rápida com vocês dois amanhã? Levo 10 minutos e apresento as condições juntos — assim ela tira as dúvidas na hora'",
      },
      analise_abertura: {
        avaliacao: "forte",
        descricao: "Ana se identificou, mencionou a escola pelo nome e foi direto ao ponto sobre crédito educacional nos primeiros 20 segundos.",
        sugestao: "Para tornar ainda mais impactante: 'Bom dia! Vi que o Colégio São Paulo tem alguns alunos com parcelas em atraso — tenho uma solução que já ajudou outras escolas a recuperar até 80% desses alunos sem perder a matrícula. Posso te mostrar como?'",
      },
      objecoes_identificadas: [
        {
          objecao: "Precisa consultar a esposa antes de decidir",
          como_foi_tratada: "SDR aceitou e propôs reunião para o dia seguinte",
          sugestao_de_resposta: "Claro, ótima ideia! Posso agendar uma call rápida de 10 minutos com os dois amanhã? Assim ela também tira as dúvidas e vocês decidem juntos com segurança.",
        },
      ],
      pontos_fortes: [
        "Abertura direta e personalizada com o nome da escola",
        "Chegou ao decisor correto rapidamente",
        "Propôs próximo passo concreto em vez de deixar em aberto",
      ],
      pontos_melhoria: [
        "Aceitar 'preciso consultar' sem criar uma estrutura de recontato com o casal",
        "Explorar mais a dor específica antes de apresentar condições",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Lead demonstrou interesse real, objeção é sobre processo decisório familiar, não sobre o produto",
        melhor_horario: "Manhã (8h30-10h) — cliente atendeu às 9h15 e estava disponível",
        abertura_sugerida: "Oi, bom dia! Ana da Creditum. Você mencionou que ia conversar com sua esposa — conseguiu conversar? Tenho 10 minutinhos para explicar direitinho para vocês dois hoje?",
      },
      insight_gestor: "Ana demonstra boa abertura consultiva mas perde no momento de contornar objeções de processo decisório. Treinar o script de 'reunião com o casal' pode aumentar significativamente a taxa de conversão nesse perfil de cliente.",
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
      score: 58,
      tom: "neutro",
      resultado: "recontato",
      tempo_resposta_inicial_segundos: 18,
      palavras_conversao: ["posso mandar por email", "confirma seu email"],
      palavras_perda: ["já temos parceiro", "não quero informar"],
      objecoes: ["Já possui parceiro de crédito educacional"],
      como_tratou_objecoes: "Não aprofundou a investigação sobre o parceiro atual. Poderia ter explorado diferenciadores.",
      pontos_positivos: [
        "Manteve a ligação ativa mesmo com objeção inicial forte",
        "Conseguiu abertura para envio de material por email",
      ],
      pontos_negativos: [
        "Não explorou os pontos fracos do parceiro atual",
        "Não apresentou nenhum diferencial da Creditum",
        "Encerrou a ligação cedo demais",
      ],
      score_breakdown: { abertura: 13, engajamento_lead: 14, tratamento_objecao: 16, proposta_beneficio: 15 },
      resumo: "Carlos encontrou objeção de parceiro existente logo no início. Conseguiu manter o canal aberto via email, mas perdeu a oportunidade de explorar diferenciadores.",
      momento_critico: {
        tempo: "0:38",
        descricao: "Quando o cliente disse 'já temos parceiro', Carlos perguntou o nome mas não usou a resposta para criar diferenciação",
        alternativa: "Poderia dizer: 'Que ótimo que já conhecem o mercado! A maioria das escolas que trabalham com a gente já tinham parceiro antes — a diferença que mais ouvimos é a nossa taxa de aprovação. Posso te mostrar uma comparação rápida?'",
      },
      analise_abertura: {
        avaliacao: "fraca",
        descricao: "Carlos se apresentou com 'Carlos da Creditum, tudo bem?' — genérico, sem gatilho de curiosidade.",
        sugestao: "Tente: 'Bom dia! Vi que o Instituto tem alunos com parcelas atrasadas este semestre — tenho um dado que pode surpreender você: 78% dos alunos inadimplentes conseguem regularizar em até 30 dias com o programa certo. Posso te contar como?'",
      },
      objecoes_identificadas: [
        {
          objecao: "Já temos parceiro de crédito",
          como_foi_tratada: "Perguntou o nome do parceiro, cliente recusou informar, Carlos aceitou e mudou para email",
          sugestao_de_resposta: "Entendo! A maioria das escolas que atendo hoje também tinham outro parceiro antes. O que mais me falam é que a Creditum tem aprovação mais rápida e parcelas menores. Tenho 3 minutinhos para te mostrar uma comparação?",
        },
      ],
      pontos_fortes: [
        "Manteve o tom respeitoso mesmo sob objeção forte",
        "Conseguiu abertura de canal (email) que é uma vitória parcial",
      ],
      pontos_melhoria: [
        "Abertura genérica sem gatilho de curiosidade ou dado impactante",
        "Não usou a presença de parceiro como oportunidade para diferenciar a Creditum",
        "Rendeu-se à objeção sem explorar insatisfações com o parceiro atual",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Cliente não fechou a porta — aceitou receber email. É uma janela de reengajamento.",
        melhor_horario: "Tarde (14h-16h) — cliente atendeu às 9h42, mais receptivo depois do almoço",
        abertura_sugerida: "Oi, enviei o material ontem. Vi que você ainda não abriu — quer que eu resuma em 2 minutinhos por telefone?",
      },
      insight_gestor: "Carlos precisa de treino específico em contorno de objeção 'já temos parceiro'. É a objeção mais comum nesse segmento e o time não tem um script diferenciado para ela. Sugiro criar 2-3 perguntas de qualificação sobre o parceiro atual.",
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
        "SDR: Bom dia! Ana da Creditum. Com quem posso falar sobre crédito estudantil? ... [transferência de chamada] ... Cliente: Aqui é o diretor financeiro. SDR: Diretor, perfeito! Temos uma solução que reduziu inadimplência em 34% em escolas parceiras... [longa apresentação] ... Cliente: Manda uma proposta formal, tenho interesse. SDR: Vou preparar e enviar hoje ainda. Posso confirmar que terão decisão até sexta?",
      score: 91,
      tom: "positivo",
      resultado: "converteu",
      tempo_resposta_inicial_segundos: 35,
      palavras_conversao: ["reduziu inadimplência em 34%", "proposta formal", "interesse", "decisão até sexta"],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes: "Nenhuma objeção levantada. SDR conduziu com autoridade e dados concretos.",
      pontos_positivos: [
        "Uso excelente de dados (34% de redução) para gerar credibilidade",
        "Chegou ao decisor certo",
        "Estabeleceu deadline de decisão",
        "Prometeu proposta no mesmo dia",
      ],
      pontos_negativos: [
        "Apresentação inicial poderia ser mais personalizada para faculdades",
        "Não perguntou sobre ticket médio dos alunos",
      ],
      score_breakdown: { abertura: 23, engajamento_lead: 23, tratamento_objecao: 22, proposta_beneficio: 23 },
      resumo: "Ligação exemplar. Ana chegou ao diretor financeiro, usou dados de impacto e conduziu naturalmente para solicitação de proposta formal com deadline estabelecido.",
      momento_critico: {
        tempo: "1:20",
        descricao: "Quando o diretor pediu proposta formal, Ana confirmou o envio no mesmo dia e estabeleceu a expectativa de decisão até sexta",
        alternativa: "Já foi bem executado — poderia também ter proposto uma apresentação ao vivo antes do envio para aumentar as chances de fechamento.",
      },
      analise_abertura: {
        avaliacao: "forte",
        descricao: "Ana usou dado concreto de impacto (34% de redução de inadimplência) logo na apresentação ao diretor, gerando credibilidade imediata.",
        sugestao: "Abertura já era forte. Para ir além: personalizar o dado para o segmento de faculdades com benchmark específico do setor.",
      },
      objecoes_identificadas: [],
      pontos_fortes: [
        "Uso de dados concretos para gerar credibilidade logo na abertura",
        "Chegou ao decisor correto (diretor financeiro) através da recepcionista",
        "Estabeleceu próximo passo com deadline claro (sexta-feira)",
        "Comprometeu-se com envio de proposta no mesmo dia — senso de urgência profissional",
      ],
      pontos_melhoria: [
        "Não personalizou dados para o segmento específico de faculdades",
        "Poderia ter qualificado o volume de inadimplência atual da Unimetro para personalizar a proposta",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Lead pediu proposta formal — follow-up de confirmação de recebimento e confirmação da reunião de fechamento são essenciais",
        melhor_horario: "Quinta à tarde — para lembrar da decisão de sexta antes do prazo",
        abertura_sugerida: "Oi diretor! Ana da Creditum. Enviei a proposta ontem — conseguiu dar uma olhada? Queria entender se tem alguma dúvida antes de vocês decidirem amanhã.",
      },
      insight_gestor: "Esta ligação é um exemplo a ser usado em treinamento. O uso de dados de impacto no início cria credibilidade imediata. Compartilhar a gravação (com permissão) com o time pode acelerar a curva de aprendizado dos SDRs mais novos.",
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
      score: 34,
      tom: "negativo",
      resultado: "sem_interesse",
      tempo_resposta_inicial_segundos: 8,
      palavras_conversao: [],
      palavras_perda: ["gostaria de falar sobre", "mas você já conhece"],
      objecoes: ["Sem interesse imediato — não quis ouvir apresentação"],
      como_tratou_objecoes: "Tentou continuar sem argumentação. Cliente desligou.",
      pontos_positivos: ["Identificou rapidamente que o cliente não tinha interesse"],
      pontos_negativos: [
        "Abertura muito genérica",
        "Não usou gatilho de curiosidade",
        "Não tentou agendar retorno",
        "Sem script de reabertura eficaz",
      ],
      score_breakdown: { abertura: 6, engajamento_lead: 8, tratamento_objecao: 9, proposta_beneficio: 11 },
      resumo: "Ligação muito curta — cliente recusou ouvir a apresentação logo nos primeiros 30 segundos. A abertura genérica não criou nenhum gatilho de curiosidade.",
      momento_critico: {
        tempo: "0:18",
        descricao: "Cliente disse 'não temos interesse' e Rafael tentou continuar com 'mas você já conhece nosso...' sem criar urgência ou curiosidade",
        alternativa: "'Entendo! Só 30 segundos — tenho um dado sobre escolas técnicas que costuma surpreender. Se depois não fizer sentido, eu respeito.' Isso cria uma janela sem pressão.",
      },
      analise_abertura: {
        avaliacao: "fraca",
        descricao: "Rafael abriu com 'gostaria de falar sobre crédito educacional' — sem personalização, sem dado de impacto, sem gatilho de curiosidade.",
        sugestao: "'Bom dia! A Escola Técnica Progresso tem alunos com parcelas atrasadas este semestre? Pergunto porque temos um programa que já ajudou 40 escolas técnicas a recuperar matrículas sem cobrar juros abusivos — posso te explicar em 1 minutinho?'",
      },
      objecoes_identificadas: [
        {
          objecao: "Não temos interesse",
          como_foi_tratada: "Rafael tentou continuar falando sem criar curiosidade ou oferecer valor imediato",
          sugestao_de_resposta: "Entendo! Só 30 segundinhos — temos um dado sobre escolas técnicas que costuma surpreender os diretores. Se não fizer sentido, eu respeito e não ligo mais. Posso?",
        },
      ],
      pontos_fortes: [
        "Tom respeitoso — não foi insistente de forma irritante",
      ],
      pontos_melhoria: [
        "Abertura completamente genérica sem personalização para escolas técnicas",
        "Não criou gatilho de curiosidade ao ser rejeitado na primeira tentativa",
        "Não tentou agendar um retorno para outro momento",
        "Script de contorno da objeção 'sem interesse' precisa ser desenvolvido",
      ],
      sugestao_recontato: {
        vale_recontato: false,
        motivo: "Cliente fechou a ligação abruptamente — recontato imediato pode irritar. Melhor aguardar 15-30 dias e tentar com abertura completamente diferente.",
        melhor_horario: "Evitar por 30 dias. Depois tentar às 14h-15h com script diferenciado.",
        abertura_sugerida: "Bom dia! Eu falei com vocês há um mês sobre crédito estudantil e entendo que não era o momento. Desde então, três escolas técnicas na região começaram a trabalhar com a gente. Posso te contar o que mudou?",
      },
      insight_gestor: "Rafael precisa urgentemente de treinamento em abertura com gatilho de curiosidade. Esta é a objeção mais difícil e mais comum — o script atual de 'mas você já conhece' não cria nenhum valor. Sugiro role-play com foco nos primeiros 30 segundos desta semana.",
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
      score: 95,
      tom: "positivo",
      resultado: "converteu",
      tempo_resposta_inicial_segundos: 45,
      palavras_conversao: ["reduzir evasão", "aluno que tranca matrícula", "não conseguir pagar", "quando podem vir aqui"],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes: "Não houve objeções. SDR identificou a dor certa e o cliente se engajou naturalmente.",
      pontos_positivos: [
        "Pergunta de qualificação perfeita",
        "Adaptou o discurso para coordenadora pedagógica",
        "Altíssimo engajamento (8m58s)",
        "Conseguiu visita presencial agendada",
      ],
      pontos_negativos: [
        "Poderia ter confirmado a data da visita antes de encerrar",
        "Não confirmou email para envio de proposta prévia",
      ],
      score_breakdown: { abertura: 24, engajamento_lead: 25, tratamento_objecao: 23, proposta_beneficio: 23 },
      resumo: "Ligação excepcional. Fernanda adaptou o discurso para a coordenadora pedagógica, identificou a dor de evasão e conseguiu agendamento de visita presencial — o melhor resultado possível.",
      momento_critico: {
        tempo: "1:05",
        descricao: "Quando atendeu a coordenadora pedagógica (não o financeiro), Fernanda adaptou o discurso imediatamente para falar de evasão, que é a dor pedagógica",
        alternativa: "Já foi executado com excelência — reaplicar esse modelo de adaptação ao interlocutor no script do time inteiro.",
      },
      analise_abertura: {
        avaliacao: "forte",
        descricao: "Fernanda perguntou sobre evasão por questões financeiras logo na abertura com a coordenadora — tocou direto na dor mais relevante para aquele perfil.",
        sugestao: "Abertura foi excelente. Única sugestão: ter os dados de evasão do setor de universidades prontos para citar no momento da qualificação.",
      },
      objecoes_identificadas: [],
      pontos_fortes: [
        "Adaptação imediata ao perfil do interlocutor (coordenadora pedagógica)",
        "Pergunta de qualificação que toca na dor principal: evasão por questões financeiras",
        "Engajamento sustentado por quase 9 minutos sem pressão",
        "Resultado máximo: visita presencial solicitada pelo próprio cliente",
      ],
      pontos_melhoria: [
        "Confirmar data e horário da visita antes de encerrar a ligação",
        "Enviar proposta ou case study por email antes da visita para 'aquecer' o cliente",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Cliente pediu visita presencial — follow-up de confirmação e envio de material prévio são essenciais para transformar visita em venda",
        melhor_horario: "Confirmação nas próximas 2 horas por email/WhatsApp + ligação de confirmação no dia anterior à visita",
        abertura_sugerida: "Oi! Fernanda da Creditum. Ótima conversa hoje! Estou te enviando agora um case de uma universidade parecida com a de vocês. Posso confirmar a visita para quarta às 10h?",
      },
      insight_gestor: "Fernanda demonstrou a habilidade mais rara no time: adaptação de discurso ao interlocutor em tempo real. O script de 'evasão por questões financeiras' para coordenadores pedagógicos deveria ser adotado por todo o time — é um ângulo de entrada muito mais eficaz com perfis não-financeiros.",
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
      score: 61,
      tom: "neutro",
      resultado: "recontato",
      tempo_resposta_inicial_segundos: 12,
      palavras_conversao: ["ligo de volta às 14h30", "previsão de quando termina"],
      palavras_perda: ["tá em reunião", "não sei"],
      objecoes: ["Decisor indisponível"],
      como_tratou_objecoes: "Gerenciou bem — deixou contato e confirmou horário para retorno.",
      pontos_positivos: [
        "Confirmou horário específico para retorno",
        "Não insistiu desnecessariamente",
        "Deixou contato direto",
      ],
      pontos_negativos: [
        "Não perguntou o nome do decisor",
        "Não deixou informação de interesse no recado",
        "Perdeu oportunidade de qualificar a secretária",
      ],
      score_breakdown: { abertura: 14, engajamento_lead: 15, tratamento_objecao: 16, proposta_beneficio: 16 },
      resumo: "Decisor estava em reunião. Marcos gerenciou bem a situação: deixou contato e confirmou horário para retorno às 14h30. Oportunidades perdidas com a secretária.",
      momento_critico: {
        tempo: "0:45",
        descricao: "Quando soube que o responsável estaria livre às 14h, Marcos apenas confirmou o retorno às 14h30",
        alternativa: "Poderia ter qualificado a secretária: 'Você sabe se eles já trabalham com alguma solução de crédito para os alunos? Pergunto porque quero personalizar o que vou apresentar para o responsável.'",
      },
      analise_abertura: {
        avaliacao: "media",
        descricao: "Marcos se identificou e pediu o responsável diretamente, sem criar curiosidade ou relevância antes de pedir o contato.",
        sugestao: "'Bom dia! Tenho uma informação sobre redução de inadimplência que pode interessar ao responsável financeiro — ele está disponível?'",
      },
      objecoes_identificadas: [
        {
          objecao: "Responsável em reunião / indisponível",
          como_foi_tratada: "Deixou recado com nome e telefone, confirmou horário de retorno às 14h30",
          sugestao_de_resposta: "Além de deixar contato, qualificar a secretária: 'Enquanto aguardo, você sabe se a escola já trabalha com alguma empresa de crédito educacional para os alunos?'",
        },
      ],
      pontos_fortes: [
        "Geriu a indisponibilidade com profissionalismo",
        "Confirmou horário específico para retorno — não deixou aberto",
      ],
      pontos_melhoria: [
        "Não perguntou o nome do responsável financeiro para personalizar o retorno",
        "Perdeu a oportunidade de qualificar brevemente a secretária como fonte de informação",
        "Não criou curiosidade ou valor antes de pedir o decisor",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Marcos se comprometeu com retorno às 14h30 — não retornar quebra a credibilidade. Follow-up confirmado é essencial.",
        melhor_horario: "Hoje às 14h30 — comprometimento firmado com a secretária",
        abertura_sugerida: "Boa tarde! Marcos da Creditum. Falei com a secretária hoje de manhã e me comprometeu a ligar às 14h30 para o responsável financeiro — é você mesmo? Ótimo, tenho uma proposta de 2 minutinhos.",
      },
      insight_gestor: "Marcos precisa aprender a usar gatekeepers (secretárias/recepcionistas) como aliados, não obstáculos. Qualificar brevemente o gatekeeper antes de deixar recado pode multiplicar a qualidade dos dados disponíveis para o retorno.",
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
      score: 88,
      tom: "positivo",
      resultado: "converteu",
      tempo_resposta_inicial_segundos: 28,
      palavras_conversao: ["1,49% ao mês", "abaixo do mercado", "case similar", "40 alunos por semestre", "vamos agendar"],
      palavras_perda: ["taxa de juros"],
      objecoes: ["Questionamento sobre taxa de juros"],
      como_tratou_objecoes: "Respondeu com dados concretos (1,49% a.m.) e comparação com mercado. Eficaz.",
      pontos_positivos: [
        "Abertura consultiva — perguntou sobre o problema antes de apresentar solução",
        "Uso de case de escola similar para credibilidade",
        "Respondeu objeção com dado preciso e comparativo",
        "Fechamento natural sem pressão",
      ],
      pontos_negativos: [
        "Poderia ter perguntado o ticket médio dos alunos",
        "Não confirmou quantidade de vagas de interesse",
      ],
      score_breakdown: { abertura: 22, engajamento_lead: 23, tratamento_objecao: 22, proposta_beneficio: 21 },
      resumo: "Julia conduziu uma ligação consultiva exemplar: abriu perguntando sobre a dor, qualificou profundamente, usou case relevante e tratou a objeção de taxa com dado preciso.",
      momento_critico: {
        tempo: "4:20",
        descricao: "Quando o cliente perguntou sobre taxa de juros, Julia respondeu com '1,49% ao mês, abaixo do mercado' — direto e eficaz",
        alternativa: "Já foi bem executado. Poderia complementar com 'Isso significa que um aluno com R$3.000 em atraso pagaria menos de R$45 de juros por mês — muito menos que perder a matrícula, né?'",
      },
      analise_abertura: {
        avaliacao: "forte",
        descricao: "Julia abriu perguntando sobre como a escola lida com alunos em dificuldade financeira — abordagem consultiva que naturalmente cria engajamento.",
        sugestao: "Abertura já era forte. Para personalizar mais: mencionar o nome da escola e um dado do segmento logo na abertura.",
      },
      objecoes_identificadas: [
        {
          objecao: "A taxa de juros é competitiva?",
          como_foi_tratada: "Respondeu com taxa precisa (1,49% a.m.) e comparação com mercado",
          sugestao_de_resposta: "Nossas taxas partem de 1,49% ao mês — uma das menores do mercado de crédito educacional. Para você ter ideia, um aluno com R$3.000 atrasados pagaria menos de R$45 de juros por mês, que é bem menos do que perder a matrícula, né?",
        },
      ],
      pontos_fortes: [
        "Abertura com pergunta de qualificação, não com apresentação — postura consultiva",
        "Uso de dado do próprio cliente (40 alunos/semestre) para criar urgência real",
        "Case de escola similar aumentou credibilidade e identificação",
        "Resposta à objeção de taxa com dado preciso + comparativo de mercado",
      ],
      pontos_melhoria: [
        "Não qualificou o volume financeiro (ticket médio dos alunos inadimplentes)",
        "Não estabeleceu um deadline claro para a decisão no fechamento",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Cliente disse 'vamos agendar' — próximo passo é confirmar data e enviar proposta formal antes da reunião",
        melhor_horario: "Ainda hoje ou amanhã de manhã — o interesse está quente",
        abertura_sugerida: "Oi! Julia da Creditum. Que ótima conversa hoje! Estou preparando a proposta com base nos 40 alunos que vocês perdem por semestre. Posso confirmar a reunião para quarta às 10h?",
      },
      insight_gestor: "Julia demonstra a abordagem consultiva mais madura do time. A técnica de abrir com 'como vocês lidam com X' antes de apresentar o produto é 30-40% mais eficaz segundo benchmarks de vendas consultivas. Ela pode liderar role-plays sobre essa técnica com o restante do time.",
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
      score: 76,
      tom: "positivo",
      resultado: "recontato",
      tempo_resposta_inicial_segundos: 20,
      palavras_conversao: ["não ainda", "call de 15 minutos", "quinta às 10h", "mando o convite agora"],
      palavras_perda: [],
      objecoes: [],
      como_tratou_objecoes: "Sem objeções. Qualificação rápida revelou janela aberta.",
      pontos_positivos: [
        "Qualificação rápida e eficaz ('já tem parceria?')",
        "Proposição direta de próximo passo com tempo definido",
        "Confirmou data e horário específicos",
      ],
      pontos_negativos: [
        "Não explorou a dor antes de propor reunião",
        "Poderia ter sido mais consultivo para gerar valor antes da reunião",
      ],
      score_breakdown: { abertura: 19, engajamento_lead: 19, tratamento_objecao: 19, proposta_beneficio: 19 },
      resumo: "Carlos encontrou uma janela aberta (sem parceiro atual) e fechou reunião rapidamente. Faltou explorar a dor do cliente antes de propor a reunião.",
      momento_critico: {
        tempo: "0:52",
        descricao: "Quando o cliente disse 'não ainda' sobre parceria, Carlos foi direto para proposta de reunião sem qualificar o nível de interesse",
        alternativa: "Poderia qualificar: 'Que ótimo! Me conta rapidinho — vocês têm muitos alunos com parcelas atrasadas? Pergunto porque o que ofereço é muito mais interessante quando há esse contexto.'",
      },
      analise_abertura: {
        avaliacao: "media",
        descricao: "Carlos se identificou e fez a pergunta de qualificação certa ('já tem parceria?'), mas poderia ter criado mais curiosidade antes.",
        sugestao: "'Boa tarde! Tenho dados sobre o que está funcionando melhor em faculdades como a Unimetro para reduzir evasão — o financeiro está disponível para um papo rápido de 2 minutos?'",
      },
      objecoes_identificadas: [],
      pontos_fortes: [
        "Pergunta de qualificação eficiente ('já tem parceria com alguma fintech?')",
        "Proposta de próximo passo com tempo definido e concreto",
        "Comprometeu-se a enviar convite imediatamente — profissionalismo",
      ],
      pontos_melhoria: [
        "Não explorou a dor atual antes de propor reunião — reunião pode acontecer sem urgência",
        "Poderia ter mencionado um dado de impacto antes de propor a call",
      ],
      sugestao_recontato: {
        vale_recontato: true,
        motivo: "Reunião agendada para quinta às 10h — follow-up de confirmação na véspera é essencial para não desperdiçar o slot",
        melhor_horario: "Quarta à tarde — para confirmar e enviar material de contexto antes da reunião",
        abertura_sugerida: "Oi! Carlos da Creditum. A nossa reunião de quinta às 10h está confirmada. Estou te enviando agora um case rápido de uma faculdade parecida com a Unimetro — leva 2 minutos para ler e vai deixar nossa conversa muito mais produtiva.",
      },
      insight_gestor: "Carlos melhorou em comparação à ligação com o Instituto Educação SP — desta vez chegou a um prospect qualificado e fechou reunião. O padrão de 'fechar rápido sem qualificar a dor' é um risco: pode resultar em reuniões sem urgência que não convertem. Trabalhar a sequência 'qualificar dor → propor reunião' no próximo treinamento.",
      analisado_em: now,
      source: "mock",
      data_source: "mock",
    },
  ]
}

export function computeMockPatterns(analyses: CallAnalysis[]): DailyPatterns {
  const total = analyses.length
  const scoreSum = analyses.reduce((s, a) => s + a.score, 0)
  const conversoes = analyses.filter(
    (a) => a.resultado === "conversao" || a.resultado === "agendamento" || a.resultado === "converteu"
  ).length

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
    if (a.resultado === "conversao" || a.resultado === "agendamento" || a.resultado === "converteu") {
      sdrMap[a.sdr_name].conversoes += 1
    }
  }

  const rankingSdrs = Object.entries(sdrMap)
    .map(([name, v]) => ({
      sdr_name: name,
      score_medio: Math.round(v.score / v.count),
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
    score_medio: total > 0 ? Math.round(scoreSum / total) : 0,
    taxa_conversao: total > 0 ? Math.round((conversoes / total) * 100) : 0,
    top_palavras_conversao: topConversao,
    top_palavras_perda: topPerda,
    principal_objecao: principalObjecao,
    ranking_sdrs: rankingSdrs,
    distribuicao_resultados: dist as Record<import("@/types/calls").CallResultado, number>,
  }
}
