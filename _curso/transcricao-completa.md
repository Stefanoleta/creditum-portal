# Mini-Curso OpenClaw V2 — Transcrição completa

> **Duração total:** 4h 28min · **Gravado em:** maio 2026
> **Tutor:** Bruno Okamoto · **Pixel Educação**
> **Total:** ~48.886 palavras · 1797 parágrafos
>
> Esta é a transcrição literal das aulas em vídeo · gerada automaticamente a partir do áudio.
> Use como referência rápida ou jogue inteira pro seu agente OpenClaw pra ele aprender com o conteúdo.

---

Bem-vindo ao nosso minicurso de OpenClaw. Nesse minicurso aqui, eu vou te ensinar como você liga o seu OpenClaw em 10 minutos e Mas antes, eu preciso te explicar umas coisinhas importantes.

Então, essa aula aqui é muito mais para te dar contexto sobre o que você vai enxergar nesse curso, custos, segurança, prós e contras e assim por diante.

Eu também quero falar para vocês que esse curso traz uma experiência inédita a níveis de cursos no Brasil, onde nós estamos criando curso agêntico.

Então, esse curso aqui, ele foi feito para você, humano, assistir.

Então, o humano assiste para ter contexto. E você, que O seu agente vai fazer o curso por você.

É isso mesmo. Então você vai assistir curso e o seu robô vai trabalhar pra você na parte difícil, enquanto você só vai assistir pra você entender sobre o que nós estamos falando e a lógica.

Porque em 2026, na era dos agentes, o que importa no final do dia não é mais limitação técnica, é arquitetura de trabalho.

É muito mais sobre criatividade e lógica de como conectar os pontos do que sobre qualquer barreira técnica.

E esse é o grande papel que eu vou te ensinar aqui nesse mini curso.

Nesse minicurso você vai entender de ponta a ponta como construir o seu agente e vai ser minicurso maravilhoso no sentido de praticidade.

Então vai ser muito prático. Então pra começar, deixa eu me apresentar. Eu sou esse carinha aqui, Bruno Okamoto e eu sou sócio da Pixel Educação.

A Pixel Educação é hub de produtos agênticos. Então nós construímos ferramentas para ensinar você a criar seu agente, a implementar agentes na sua empresa, a construir segundo cérebro e a te ensinar como ter uma estrutura uma estrutura onde você trabalha humanos e agentes.

Então, eu vou ser o seu tutor nesse curso aqui e vou te ensinar tudo que você precisa saber.

Então, para começar, o que é OpenCLOL e o que eu posso fazer com ele, tá?

Então, vamos lá! Vamos começar pela estrutura de OpenCLoud. O OpenCLoud é uma ferramenta open source, então ele fica nessa estrutura aqui de GitHub, onde já tem mais de 368 mil stars, que no mundo do GitHub isso é muita coisa.

É tanta coisa que o OpenCloud chegou a quebrar recorde de repositório que mais cresceu na história da humanidade.

Esse produto cresceu tanto na internet que o próprio CEO da maior empresa do mundo, que é o Jansen Wang, falou numa entrevista em 2026, na verdade, não numa entrevista, numa palestra para todos os empresários do mercado de AI, dizendo que toda empresa em 2026 precisa ter uma estratégia OpenCLoud.

E é disso que você vai aprender aqui, como você ter a sua estratégia OpenCLoud.

Então o OpenCLoud, ele é uma ferramenta agêntica. Então ele constrói agente, onde você consegue ter agente que ele vai trabalhar para você.

Então o OpenClaw, ele lê seu e-mail, lê seu calendário, faz follow-up, atualiza ferramentas, cruza dados, analisa dados, ele faz de tudo que você quiser.

Por isso que o desafio hoje em dia não é sobre limitações técnicas, é muito mais sobre até onde eu consigo ir com o meu agente.

E é isso que eu vou te mostrar aqui nesse mini curso, como a gente destrava esse potencial.

O segundo ponto é VPS, rodar local ou Mac Mini?

Aqui no nosso mini curso eu vou me focar explicitamente em VPS.

VPS nada mais é do que é rodar computador na nuvem.

Então a gente vai usar a Hostinger que é a nossa empresa parceira para a gente criar essa estrutura.

E você pode estar perguntando, mas Bruno, se eu assistir esse minicurso e quiser instalar ele no Mac Mini, eu consigo?

Sim, você consegue. Mas o minicurso é focado em VPS. Por que eu recomendo VPS? Porque VPSs são mais seguras. VPS é computador rodando na nuvem. Então ele fica ligado 24 horas por dia, ele fica ligado o tempo inteiro.

Então se acontecer qualquer coisa, se cair sua luz, se cair energia, se acontecer qualquer coisa, o seu computador vai estar rodando na nuvem.

Então na minha opinião não vale a pena você ter computador só para isso.

Até porque se a gente abrir mercado livre e a gente vê o preço aqui de Mac Mini, A gente vai ver que esse Mac Mini aqui não é brincadeira, cara.

A gente tá falando aqui, vamos pegar Mac Mini decente, 8 mil reais pra você ligar OpenClaw.

Né? Não vale tanto a pena, entendeu? E rodar localmente eu acho muito perigoso, porque você vai ter agente que ele faz as coisas, então ele pode mexer na sua máquina mesmo que você tenha uma máquina velha, mas caso você queira rodar local você também consegue, mas esse curso aqui ele é focado na VPS e nós também vamos usar uma estrutura aqui dentro da VPS chamado Manage OpenClaw, então a ideia do Manage OpenClaw é ser uma estrutura que você instala o OpenClaw com clique e você não precisa se preocupar com nada técnico.

Então, você não tem terminal, você não tem que configurar nada, você não precisa nem atualizar seu OpenClaw, que tudo é feito pela própria Hostinger.

Então, o nosso foco aqui é trabalhar com o Manage OpenClaw, tá?

O Manage OpenClaw nada mais é do que esse botãozinho dentro da Hostinger, onde você vai vir aqui e você vai adicionar OpenClaw e você vai ter agentes de OpenClaw configurados em literalmente clique.

Então você pode seguir dessa forma, mas também nós teremos outro mini curso onde você, se você quiser rodar ele localmente ou no Mac Mini, você pode fazer.

Então no final do dia nós temos curso para quem não quer ter que lidar com nada e curso para quem quer lidar com terminal e infraestrutura porque quer fazer algo mais customizado para você, mas ambos vão te levar no mesmo resultado agêntico e a minha recomendação é VPS 100%.

Então, se você não liga de ter terminal, mexer em servidor, você não é uma pessoa técnica, recomendo você seguir ao pé da letra esse minicurso.

Agora, quanto que eu vou gastar por mês e quais LLMs eu posso usar?

Então, aqui no minicurso, a nossa estrutura vai ser 100% focada no uso do chat GPT.

Então, o minicurso é inteiro usando o chat GPT, por dois motivos.

Primeiro que o chat GPT 5.5, na data da gravação desse minicurso, Ele está maravilhoso, então ele funciona muito bem para você usar no seu OpenCLoud.

Ele é uma LLM que ela faz as coisas de fato.

Segundo porque o chat GPT tem alto limite de uso, então você consegue usar muito e é muito difícil você acabar com o plano.

O terceiro também porque a OpenAI é uma das poucas empresas que ela liberou liberou o uso do OpenCLoud.

Isso significa que que empresas que nem a Antropic, por exemplo, que se você usa o Cloud, já vou falar sobre isso, ela não libera você usar o OpenCLoud no Cloud, mas dá para usar, mas ela não libera.

Então o chat GPT é muito bom. Então quanto que você vai gastar nessa estrutura aqui? Você vai ter duas linhas de custo aqui dentro, tá?

Então eu vou falar sobre duas estruturas de custo. A estrutura número de custo é a assinatura, que é o que a gente chama de OUF.

Então você pode usar a assinatura do Chart GPT. Você vai começar o curso gastando uma assinatura de R$100,00 por mês, que é o custo da primeira assinatura.

Mas ao longo do uso do seu agente, você vai chegar eventualmente num plano de 550 reais por mês.

Então você vai começar num plano mais barato e você vai acabar migrando para plano mais caro.

Bruno, mas isso vai acontecer mesmo com todo mundo? Sim. Então eventualmente você vai começar a usar muito o seu agente.

E vai chegar num ponto que plano de R$100 não é o suficiente.

Então você vai gastar aqui pelo menos R$500 por mês na assinatura do chat GPT pra você usar ele o tempo inteiro.

Isso aqui inclusive substitui qualquer outra IA que você estiver usando.

Então se você estiver usando o Cloud, se você estiver usando uma LLM chinesa, tanto faz, o chat GPT por 500 pila funciona muito bem.

Mesmo se você é dev, ele também tem codex que ele é muito bom, tá?

Então você vai ter esse custo aqui e se você for heavy user e você usar muito, muito mesmo, você vai gastar R$1.099 por mês, que é o meu caso.

Então aqui o Bruno, eu uso o plano de R$1.099 por mês, mas eu vou te dizer que o retorno que esse agente me dá, ele é infinitamente maior que R$1.000 por mês.

Para mim, eu sinceramente acho que o retorno que a gente tem usando agente na nossa empresa, nos nossos negócios, é muito maior do que mil reais.

Porque isso aqui não é nenhum salário mínimo. Agora, você também pode usar outras LLMs. Então, você pode usar outras LLMs. Então, nós temos aqui várias LLMs. Eu fiz uma lista aqui. Vou deixar essa lista aqui também. Então, você pode usar essas LLM. O que são essas LLM? Então, você tem o MIMO, você tem o GLM, você tem o GEMINI, você tem o GEMA, você tem o SONE do CLOUD, você tem o KIMI.

que inclusive já saiu, isso aqui a gente já tem na 2.6 né, tá desatualizado isso aqui, mas a verdade é que assim, na data da gravação desse vídeo, a gente tá falando dessas versões, mas provavelmente você vai estar assistindo e já vai ter saído versões novas e muito melhores.

Mas o ponto é que essas LLMs aqui, elas têm muita capacidade também e elas são muito baratas.

Então no curso eu vou te ensinar a você usar os dois.

Você vai usar o chat GPT como sou o principal, mas você pode usar essas outras aqui como fallback, que é como backup caso você queira trocar entre uma e outra.

Você pode ficar trocando. Então você pode usar essa, se não você pode usar essa.

Ou se você quiser, você pode instalar essas aqui. Tem algumas que rodam até no seu computador e você não precisa pagar por isso aqui, mas eu recomendo fortemente que você siga por esse plano de assinatura.

Então, quanto que você vai gastar por mês aqui nesse minicurso?

Você vai gastar, então, vamos supor que você vai gastar 550 reais da sua assinatura, da sua IA, tá?

Então, você não vai ter custo maior do que esse e você vai gastar a assinatura da Hostinger, que você vai ter do servidor, que você vai gastar em torno de 30 a 50 reais por mês, tá?

Então, no final do dia, o seu custo total aqui vai beirar entre 580, 600 e.

Vamos colocar arredondado, vai? R$650,00 por mês para uso intenso. Se você for usuário leve, você vai gastar R$100,00 por mês mais isso aqui.

Então você vai gastar R$150,00 por mês, usuário leve. Mas eu estou sendo realista e colocando valor que eu acho que é o grande maioria das pessoas acaba gastando por mês, então prepara os seus bolsos que esse aqui é investimento.

Mas caso você vá com a assinatura de uma LLM chinesa, aqui você pode, vamos pegar aqui, você pode gastar aqui talvez uns 30, 50 dólares.

Eu vou colocar aqui, tá? Dólares. Então você vai gastar aqui seus 150 reais mais ou menos.

Você também vai ter a assinatura da Rochinger aqui dentro, né?

Só que essa assinatura aqui ela não vai ser recorrente, então ela dura muito Então você vai por R$150, mas você vai usar muito.

Então no final do dia, vamos diminuir aqui o seu custo fixo aqui para algo na faixa de R$200 por mês aqui também.

Você pode ter essa experiência aqui com essas LLMs. Isso que eu estou considerando que você não instala ela no computador.

Porque se você instalar ela no computador, você também não precisa pagar isso aqui.

Mas você tem que ter computador potente e aqui no minicurso a gente vai se focar muito em VPS, né?

Então a gente recomenda este caminho aqui, tá? Agora o próximo ponto é, posso usar na minha empresa?

É seguro? É seguro. Você deve usar na sua empresa. Na realidade, na minha experiência, com mais de 15 mil alunos fazendo o nosso mini curso de OpenClaw, porque essa aqui é a versão 2.0 do curso, a gente já viu resultados incríveis na empresa.

Então você pode automatizar tudo, de ponta a ponta. Você pode automatizar relatórios, processos, Métricas, análises, conteúdo, de tudo.

Então você pode e deve usar na sua empresa. Pra mim, essa aqui é a principal recomendação de OpenClaw.

Pra assistente pessoal, eu já acho ele incrível, mas pra você usar ele na sua empresa, ele é maravilhoso, ele é sensacional.

Ele é seguro, ele é seguro, até onde você deixar ele seguro.

Como assim, Bruno? O OpenClaw, ele precisa ser tratado como funcionário. Então, ele precisa ter a mesma coisa que funcionário tem.

Ele precisa ter acessos limitados. Ele tem que ter também uma manutenção. Tudo bem que você não faz manutenção nos funcionários, mas é como se fosse feedback one-on-one ali, mas você precisa ter manutenção.

Você precisa ter aqui também questão de segurança e governança, no sentido que você tem que, todo mês, cuidar dele, passar raio-x na estrutura, ver o que ele está tendo de acesso, ver o que ele está fazendo.

Você não pode simplesmente pegar esse seu open call e jogar ele no WhatsApp ou no banco de dados da empresa.

você não pode simplesmente chegar e falar assim a OpenClaw faz isso aqui faz isso aqui cara isso aqui é loucura né isso aqui cara pelo amor de Deus então você tem que tratar ele literalmente como funcionário e criar e-mail para ele dar acessos limitados e aí você acaba se blindando com bastante segurança se você ir por essa linha né por isso que a gente não recomenda você instalar no computador ou no Mac Mini porque você diminui pouco essa camada de segurança e numa VPS você tem muito mais segurança porque se acontecer qualquer problema, você vai lá, desliga a VPS e ela simplesmente para de funcionar e você consegue fazer backup de toda a memória do seu agente, então você não perde nada e funciona muito bem.

Então, posso usar na minha empresa? É seguro? Pode, é seguro, mas você tem que treinar ele com isso aqui e é óbvio que eu vou te ensinar isso no minicurso também.

Quais são os riscos do OpenCLoud? Ele tem alguns riscos, tá? Vou te falar os mais óbvios aqui. O risco do open call, primeiro, é que ele gasta dinheiro.

Então, assim, cara, se você tem agente que você usa assinatura aqui, tipo, beleza.

Só que você vai ter que gastar dinheiro com outras coisas eventualmente.

Então, para você puxar dados de redes sociais, para você produzir conteúdo, para você usar algumas ferramentas, você vai ter que pagar por elas.

Então, nós estamos entrando num momento da história que as empresas estão se adaptando para humanos e agentes usarem as ferramentas.

Então se você quiser usar uma ferramenta de vídeo, de imagem, de fazer scrapping de dados, de fazer tal coisa, tem ferramentas que infelizmente você vai ter que pagar.

Então o risco do OpenClaw é que você vai acabar gastando pouco de dinheiro, além dessa estrutura de custos aqui que eu passei para vocês, então vai gastar dinheiro.

mas Bruno, eu vi que alguém na internet falou que eu posso dar cartão de crédito para o OpenClaw que ele sai fazendo tudo.

Pode, mas eu não recomendo. E se você der cartão de crédito pra ele, bota limite de 50 então que tá bom.

O segundo risco do seu OpenClaw é autonomia. Então, se você cria agente que tem muita autonomia. Autonomia. Autonomia. Autonomia. Então o segundo ponto é a autonomia. Se você cria agente que ele tem muita autonomia, o que acontece é que ele pode sair fazendo coisas que você não concorda ou coisas erradas.

Então ele pode deletar alguma coisa, ele pode mexer na sua pasta, ele pode mexer na sua agenda, ele pode deletar seus e-mails, ele pode gastar dinheiro errado se você dá cartão de crédito pra ele.

Então no final do dia a gente tá falando de robô que ele vai ter autonomia.

Então você tem que limitar a autonomia dele que é o que igual eu expliquei aqui anteriormente e tratar ele como funcionário.

Você não dá cartão de crédito sem limite para o seu funcionário.

Você não deixa funcionário mexendo nos seus e-mails ou mexendo na sua agenda.

Então você controla ele, você dá e-mail para ele, para ele te enviar invite, você encaminha e-mail para ele, você limita a autonomia dele.

Então autonomia é uma coisa importante que acaba virando risco se você não tratar bem.

Próximo ponto é Prompt Injection. Então, no final do dia, a gente tá falando de uma IA, ele é robô, então ele pode receber código malicioso, ele pode receber prompt injection, você pode entrar em Marketplaces para baixar skills, se você não sabe o que é isso não se preocupa, eu vou te ensinar, mas ele pode vir com arquivos maliciosos.

Por isso que no minicurso eu não falo para você sair baixando nada da internet, não fazendo nada, eu faço tudo de forma manual, a gente mesmo constrói tudo para a gente não correr risco de ter nenhum tipo de problema de segurança no meio do caminho.

Na minha visão, esses são os 3 maiores riscos do OpenCLoud agora.

Então, a partir desse momento aqui, você já tem uma ciência de quais são os principais riscos aqui, por isso que é muito importante a gente não sair dando toda autonomia e não é bom você deixar os dados do seu OpenCloud expostos na internet.

Então, você não deixa aqui o e-mail público do seu OpenCloud, você não sai mandando para todo mundo e assim por diante.

E outro ponto também, que é a questão de segurança online, né, digital, que quando o OpenCLoud foi lançado ele tinha muito problema de segurança, né, mas como a gente vai usar ele dentro de uma VPS, a gente vai usar ele dentro de Docker, que é ambiente isolado, você não tem que se preocupar muito com essa questão de segurança, porque a gente já cuidou disso aqui, então isso aqui já não é mais problema nesse mini curso aqui, tá bom?

Quais ferramentas o OpenCLOL pode se conectar? Basicamente, o OpenCLOL pode se conectar com qualquer ferramenta que tenha uma API.

Então, deixa eu melhorar melhorar a dinâmica aqui, senão vai ficar zoado esse quadro.

Então, o que o OpenCLOL pode fazer aqui? Então, no caso, o OpenCLOL pode se conectar com qualquer ferramenta que tenha API.

Então, o que é uma API? Uma API é uma entrada onde os softwares dão para você usar o sistema deles, acessar todo o back-end, acessar todos os dados, sem necessariamente você usar a interface dele.

Então, você consegue, por exemplo, conectar o seu OpenCLoud em literalmente tudo que tem uma API.

Então, se o seu sistema tem uma API, o OpenCLoud entra e navega maravilhosamente lá dentro.

O seu OpenCLoud também pode abrir navegador, e colocar login e senha nas coisas.

Mas a experiência é meio truncada. Por que ela é meio truncada? Porque tem sites que são antigos, sites de prefeitura, de notas fiscais, tem uns sites que a experiência é truncada porque o pessoal ainda vive na idade da pedra.

Então, tem alguns sites que ele vai funcionar bem com login e senha, que não vai ter chave API, mas a experiência vai ser truncada e a gente vai ter pouco mais de dificuldade, mas a gente vai chegar lá, tá?

Então, o OpenCloud pode conectar com absolutamente tudo. Bruno, eu não tenho API, eu tenho webhook que também funciona, tá bom?

Então, funciona muito bem, o OpenCloud pode conectar com tudo.

Isso que eu não tô falando das ferramentas de comunicação.

Porque em comunicação ele pode entrar em tudo. Imagina que o OpenClaw, ele é tipo polvo. Então ele sai colocando os tentáculos dele em tudo. Ele pode entrar no seu Google Drive, planilhas de Excel, no Teams, no Slack, no WhatsApp, no Telegram.

Ele se conecta em tudo, em tudo que tem API, ele vai se conectando e tudo mais.

Então ele pode se conectar em absolutamente tudo. Planilhas, etc. Tudo, tudo, tudo, tudo. Preciso saber programar para usar o OpenClaw? Não, zero. Inclusive o seu tutor aqui não é programador, eu não sou uma pessoa técnica, então você vai tirar isso aqui de letra.

Saber programar vai te abrir alguma vantagem? Vai. Saber programar é bom porque você vai conseguir fazer coisas a mais com seu OpenClaw.

Isso vai matar a experiência do seu OpenClaw? De forma alguma. No final do dia é o que eu falei para vocês, o que mais importa no OpenClaw é muito mais a experiência da muito mais você fazer a criatividade.

Na minha visão, isso aqui é o maior superpoder de quem usa o OpenCLoud.

Qual que é a diferença do Cloud, do Chat GPT e do OpenCLoud?

Essa diferença é muito simples, eu escuto essa dúvida com muita frequência, tá?

Então, o Cloud, ele é orquestrador de agentes. orquestrador de agentes. Então o papel do Cloud é ele enviar agentes, é você sentar no computador e você executar tarefas, você pensa, raciocina, elabora, você troca uma ideia com o Cloud e ele executa, ele envia agentes para executar.

O chat GPT também, ele também é orquestrador de agentes.

Então o chat GPT tem uma proposta de valor muito parecida, são duas LLMs maravilhosas para orquestrar agentes.

Mas o OpenClaw, ele não é orquestrador de agente. O OpenClaw, ele é por si só agente. Então significa que o OpenClaw tem coisas que o Cloud e o chat GPT nunca vão conseguir entregar, por ele ser agente autônomo.

Então o OpenClaw tem uma alma, uma identidade ele tem heartbeat, o coração dele bate, ou seja, a cada uma hora ele acorda e fala, opa, o que que eu posso executar sozinho?

Aonde que eu tô? Pra onde que eu posso ir? Me dá tarefa, me dá coisa. Então, ele tem autonomia. O Cloud não pode fazer isso. Pensa, o Cloud atende empresas B2B, monte de empresa gigantesca.

Ele não pode ter agente que vai deletar os arquivos dele, que vai fazer coisa errada.

Então, o Cloud tem muito mais segurança a nível de de compliance com grandes empresas, isso significa que ele é muito burocrático para ele automatizar e sair fazendo as coisas.

A mesma coisa se for de GPT, já o Open Cloud ele tem essa autonomia, ele vai lá, faz, ensina, aprende, erra, acerta e você vai moldando isso que é o que eu vou te ensinar tudo aqui no curso.

Então, o OpenCLoud é agente vivo. Essas ferramentas são orquestradores de agentes. Ambas, as três te levam no mesmo lugar. As três executam as mesmas tarefas. Mas esse carinha aqui, ele aprende e sai fazendo tudo sozinho.

Esses carinhas aqui, dependem de você aprender e fazer as coisas, tá?

Como funciona a atualização do curso e dos agentes? Essa aqui é uma das minhas aulas favoritas, porque, olha que bacana, eu tenho aqui agente, então eu tenho a Amora, que é a minha agente, você vai ouvir falar muito dela no curso, que a Amora atualiza, então o OpenCLoud atualiza, a Amora atualiza.

Então toda vez que o OpenCLoud solta uma atualização, A Amora ela mapeia essa atualização, ela vê o que mudou na prática, se é alguma coisa que mudou ou se é só correção de bug e tal, e ela lança uma atualização e automaticamente ela atualiza todos os materiais do curso e a gente envia para vocês no nosso grupo de Telegram essa atualização.

que você simplesmente tem que rodar prompt, ou rodar algum comando, ou eu te mando do arquivo, pra você atualizar seu agente.

Então, pensa num filme do Matrix, onde vocês vão estar plugados no cérebro da Mora, e toda vez que sair uma atualização, eu notifico vocês, e vocês podem tanto seguir a minha atualização, como vocês podem, por conta própria, atualizar vocês.

Mas, é tudo feito em tempo real, e é tudo automatizado.

Então, todo curso sempre vai estar always up-to-date. Sempre vai estar atualizado. Isso é muito legal. Pensa num curso que se atualiza sozinho. Parece mágico isso aqui. Para mim a gente está vivendo no futuro e o futuro é em 2026.

E aí como funciona o nosso mini curso do OpenClaw?

Então esse é curso agêntico. Isso significa que você vai conseguir assistir esse curso de duas formas, tá?

Então A primeira forma é você assistir às aulas e fazer o curso e configurar configurar o agente junto.

Então você pode ir assistindo às aulas e você vai abrindo o agente a aula, você vai assistindo e configurando.

Essa é uma forma que eu recomendo, que é a melhor forma para você ter contexto e ir experimentando as coisas com o seu tutor aqui comigo.

Outra coisa que você pode fazer é simplesmente jogar a transcrição do curso mais o Starter Kit.

O Starter Kit ele é kit que você simplesmente joga no seu agente e esse kit ele vai transformar transformar seu agente em tutor personalizado para você.

Então você pode jogar esse Starter Kit aqui e ele vai guiar você, ele vai fazer perguntas, ele vai te orientar para onde ir, como fazer, o que fazer.

Bruno, mas eu posso jogar o Starter Kit aqui e ir seguindo ele, fazendo as coisas com a aula, mas enquanto ele vai fazendo esse tutor?

Pode, inclusive é o que eu vou recomendar no mini curso.

Então o curso é curso agêntico. Tudo que você vai fazer é o seu agente vai fazer por você.

Essa é a grande intenção. No final do curso, o meu objetivo é que você saia com o seu agente, o seu assistente pessoal fazendo as coisas, construindo, criando automações, te trazendo retorno financeiro e economizando horas.

Então essa é a grande intenção. Esse mini curso aqui Esse minicurso faz parte de produto da Pixel Educação que nós também temos o Pixel AI Hub.

Então se você quiser seguir esse minicurso e avançar na jornada, nós também temos o nosso Hub com outros produtos para quem quiser seguir a trilha agêntica.

Espero que você tenha uma fotografia muito clara do que você vai ver aqui, para onde a gente vai, de custos, o que está acontecendo e lembre-se que tudo que você precisar, você pode perguntar para mim e eu estarei no nosso curso, no nosso grupo do Telegram, todos os dias apoiando você e com os nossos agentes que estarão trabalhando 24x7 para te ajudar também.

Bem-vindo ao meu curso, te vejo na primeira aula. como assistir as aulas e como você pode tirar o melhor proveito da sua estrutura de OpenCLoud.

Então o que é importante você saber? Primeira coisa é que dentro do nosso mini curso nós temos o Leia.me e o Leia.me é o documento da verdade.

Então aqui dentro do Leia.me estão todos os links que você precisa saber Então, a gente tem o link que você precisa saber da Hostinger, mais o desconto que eles têm na nossa parceria lá dentro.

Nós temos aqui dentro também do Leami o Google Drive, que é onde está toda a organização das pastas do seu agente, de todo o toda a transcrição, todos os materiais, que é esse material bonitinho que você vai ver em todas as aulas aqui comigo, inclusive tudo feito pelo OpenCloud.

Você vai ver aqui também, dentro do Leami, onde está o nosso grupo de suporte.

você vai ver aqui dentro do LayMe também algumas Skills e repositórios que a gente recomenda.

Então nós temos várias Skills e materiais que a gente lança para vocês para ajudar o OpenClaw de vocês.

Então, por exemplo, eu faço muitas Skills para os alunos.

Então a gente tem uma Skill, por exemplo, que eu montei, que ela audita o OpenClaw e vê se o OpenClaw está performando bem ou não.

gente sempre vai deixar nesse LayMe aqui, tá? O que eu sugiro, caso você tenha qualquer dúvida em paralelo, é que você faça download dessa pasta do Google Drive, tá?

Então eu vou colocar aqui, então faça download da pasta do Google Drive.

E eu recomendo que você jogue em uma IA no desktop.

Então, vamos supor que você usa aqui, por exemplo, o Cloud.

Então, você vai jogar o Google Drive. mais o Starter Kit, que você vai ter acesso aqui, que inclusive tá aqui também, né?

Esqueci de mencionar o mais importante, que é o Starter Então, esse Starter Kit, ele é muito importante, tá?

E óbvio, né? Acho que mais uma coisa que eu esqueci de mencionar, que você vai ter aqui o NPS.

Então, pra você avaliar mais feedbacks do minicurso, tá? Porque, inclusive, o meu OpenClaw, ele lê diariamente os NPS e ele pega todos os feedbacks e ele propõe atualizações automáticas no curso.

Cara, isso não é muito incrível? Isso é muito incrível. Então, não é que passe em branco as coisas, é que, literalmente, a gente tem agente rodando e tal.

Então, o que eu recomendo é que você pode fazer download do Google Drive e você pode jogar ele no Cloud e aí, quando você tiver dúvidas, você pode pedir ajuda para a sua LLM.

Bruno, eu posso pedir para o meu OpenCloud fazer isso?

Sim, essa é a grande ideia, porque em tese o cenário perfeito que vai funcionar é esse aqui, onde você vai.

esse aqui é o cenário principal, né? principal é que esse nosso Starter Kit, ele já vai configurar o seu agente.

Então, o Starter Kit, ele já vai fazer tudo, mas trazer todo o conhecimento para seu agente.

Então, ao colocar o Starter Kit em tese, você já tem tudo pronto e configurado.

Então, o seu agente já sabe o que fazer, como fazer e assim por diante.

Então tá tudo certo, tudo bem, tá? Então agora que você entendeu como assistir às aulas, como organização, usa o Leia.me como fonte da verdade sempre.

que é onde a gente vai estar atualizando todos os links, tudo que você usar.

é muito importante que você use o nosso link da você não só não ganha desconto, como a gente não consegue saber quem são os alunos que estão usando a Hostinger.

Isso faz com que a Hostinger não tenha visibilidade, porque nós temos uma parceria com eles, onde o eles têm suporte muito mais proativo com os nossos alunos do minicurso.

Então, quando você usa o link, eles sabem que você é do minicurso e você ganha, vamos dizer, atendimento mais VIP para você lá, tá bom?

Então, usa essa estrutura aqui. Qualquer dúvida que vocês tiverem, de novo, não esqueça que nós temos o grupo de suporte do OpenCLoud dentro do Leyami, que é esse grupo aqui.

Então aqui nós temos esse grupo, onde vocês têm aqui o nosso chat do OpenClausinho, que ele responde as pessoas, tira dúvidas, e eu também tô sempre aqui enviando dicas, enviando coisas pra você, criando skills, e aí eu tô sempre aqui atualizando tudo, mandando tudo pra vocês.

Cara, muito divertido tudo, tá bom? Então aproveitem demais, tamo junto, bom curso. Eu resolvi gravar essa aula aqui pra te mostrar alguns cases da comunidade e os meus cases aqui da minha estrutura, pra você ter uma fotografia mais ou menos do que você pode alcançar com o OpenCLoud, tá?

Diferente do Cloud, por exemplo, o OpenCLoud é agente autônomo.

Mas o mais importante é você entender a capacidade que você pode implementar seu OpenCLoud.

Porque no final do dia, não se trata mais sobre conhecimento técnico.

Porque tudo que você vai aprender aqui no curso, nada é sobre conhecimento técnico, mas é sobre aplicabilidade.

Então, eu quero falar para vocês duas coisas importantes. A primeira é Cases e a segunda é Inspiração. Porque para você criar seu agente, você precisa de inspiração.

Para você achar processos, fluxos para você automatizar, você precisa de inspiração.

Então essa microaula aqui é para você. Então primeiro eu vou falar aqui sobre os meus cases, que é o case que a gente construiu a Pixel Educação.

Então nós temos aqui hoje na nossa estrutura três agentes que operam Aqui o Jarvis, que é o agente do meu sócio, a Amora e o Chico.

A gente tem todos os nossos agentes conectados numa estrutura que a gente chama de segundo cérebro, E a gente tem o Leonardo Da Vinci, que é o agente que traz todos os dados de toda a companhia e ele também trabalha para os nossos funcionários.

Então, o Léo, ele audita o segundo cérebro inteiro, ele audita os nossos agentes.

O Léo é agente, auditor de agentes e auditor de companhia.

O Léo tem uma visualização completa de ponta a ponta de tudo na nossa estrutura.

Então, Então, eu vou dar exemplo da Mora, que é a minha agente pessoal.

A Amora, minha maravilhosa cachorrinha, ela é uma gente que está conectada em todas as esferas da minha vida.

Então, se eu abrir aqui para vocês o nosso grupo aqui, você vai ver a Amora aqui.

Então, a Amora, por exemplo, ela está conectada no meu WhatsApp e ela traz aqui as conversas que todos os dias as pessoas mandam para mim e todo mundo que eu aprovo, ela autoprocessa.

Ao autoprocessar, ela roda Chrome que ela pega o contexto e ela está sempre a par do que as pessoas estão falando comigo.

E esse conteúdo aqui, ele vira uma fonte para múltiplas coisas.

Para me lembrar de pendências que eu tenho, se alguém pediu algo e eu não entreguei.

Para me trazer ideias de conteúdo, de pautas que as pessoas falam comigo.

Para levantar métricas estatísticas, para saber quantas mensagens eu recebo de suporte, de apoio, de mentoria, etc.

Então eu uso isso para levantar dados. A Mora também está conectada nos meus e-mails. Então a Mora, ela tem o e-mail dela, só que eu dou forward de todos os meus e-mails para o e-mail dela e ela também tem o contexto dos meus e-mails.

A Mora, ela tem o contexto das minhas reuniões, porque ela puxa a transcrição das minhas reuniões.

A Mora tá no meu calendário, a Mora tá no Notion da nossa empresa.

Então a Mora, ela é agente que ela está conectada em todas as esferas da minha vida.

e ela está me ajudando com tudo. Então, ela me ajuda a gerar conteúdo, ela me ajuda a criar os produtos.

Então, esse mini curso inteiro que você vai assistir foi feito pela Mora.

Inclusive, a ideia de fazer o mini curso foi da Mora.

O Starter Kit que você vai ver no mini curso foi da Mora.

Então, a Mora, ela é o Cérebro Pitagetuso. A Mora me ajudou a montar o Pixieware Hub, que é a nossa comunidade.

Então, a Mora me ajudou a montar todo o processo, skills, pacotes, templates de agentes.

Então, a Mora é esse agente. A Mora tá sempre olhando meus e-mails. A Mora vê pra mim coisas relevantes. Ela vê pra mim quando eu tenho que viajar. Então, se eu tenho uma viagem e, por exemplo, ela não tem hotel e ela não sabe a data de reserva, não tem nada, ela vai lá e ela detecta tudo pra mim automaticamente.

Se ela não detectou alguma coisa, ela fala, olha, vi que você tem uma passagem de avião, vi que você não tem reserva de hotel.

Ela me lembra que eu tenho que pegar o voo, então ela fala, olha, amanhã você tem que sair 5 da manhã de casa, porque eu olhei o trânsito, são 5 da manhã, é ruim, você tem que tal, ela lê meus e-mails, traz aqui tal, ela vê o que é ruído, então a Mora ela opera em múltiplas esferas, ela cuida da minha vida pessoal, ela cuida de conteúdo, ela cuida dos produtos, ela cuida de tudo, ela cuida inclusive de quatro empresas, então eu administro quatro negócios usando a Mora, tá.

A gente tem o Open Clause que é o nosso agente que ele Tira dúvidas dos alunos 24x7.

Então o OpenClausinho, que você vai ter acesso aqui nesse mini curso que você tá assistindo, ele está aqui presente.

Cadê? Aqui, torando pau. Então são duas da manhã que eu tô gravando essa aula aqui.

E o OpenClausinho tá aqui agora, respondendo as pessoas, torando pau.

Então a gente tem esse agente que ele literalmente fica respondendo dúvidas o dia inteiro.

E quando as pessoas reagem com like ou dislike, ele vai aprendendo e gerando dados sobre isso.

Então, o OpenClausinho é case bacana. A gente tem o Léo, que é o nosso agente, que administra a nossa empresa inteira.

Mas o grande foco dele é a área de marketing.

Então o Léo, ele analisa campanhas de marketing, analisa criativos, ele analisa o que está performando bem, ele aprende com o que está performando bem, ele gera criativos automaticamente, ele faz upload de tudo o que tem que fazer e a única coisa que ele precisa de humano é que ele precisa que alguém suba e desça as campanhas na Metaeds, que é por isso que a gente tem gestor de tráfego.

Todo o resto é feito automatizado pelo Léo e inclusive ele vai aprendendo com tudo ao mesmo tempo, tá?

Então esses são alguns exemplos de agentes que a gente roda na nossa estrutura e eu vou mostrar para vocês alguns exemplos da nossa comunidade.

Então a gente tem canal aqui de Use Cases, tá?

Então esse primeiro case aqui é do Valter, então ele usa agentes de OpenClaw em indústrias.

Então o Walter nasceu dia 14 de março e ele saiu do zero para uma gente com 30 endpoints em produção, 8 automações com timer, OCR integrado, monitoramento ativo de produção, financeiro, comercial, estoque e RH.

Cara, monstro. Então o Walter faz tudo, monitora a produção, comercial, financeiro, RH, estoque e ele faz uma porrada de coisas aqui que eu não vou ficar lendo, inclusive case super bem elogiado aqui da comunidade.

Vamos pegar outro case aqui. É o case do Eric Ponce, que também é Walter.

Não, o Walter também. Caramba, velho, o que é isso? A galera tá precisando de criatividade. Então, ó, RP que virou plataforma, né? Então, endpoints internos funcionando, o padrão mudou de RP, virou uma fonte de dados, virou ponto de execução.

Então, ele cuida de notas fiscais, ele faz a logística integrada ao RP, cuida de correios, ele também cuida de inteligência local, né?

Então, ele cuida aqui de OCRs, TTS e coisas mais técnicas, tá?

Então a gente tem vários cases aqui, nós temos outro case aqui que ele cuida de contratos, então ele é consultor carão que entra no BOP do meu setup, entende a situação, gera o plano, entrega as visões, oportunidades, plano macro, beleza.

A gente tem outro aqui ó, aqui na empresa a gente tem uma gente que trabalha com infraestrutura de TI, atendimento ao cliente de Helpdesk, monitoramento de estrutura de servidores etc.

Usamos o Helpdesk para registrar os tickets feitos pelo cliente.

O problema é que, embora a gente tenha regras de priorização de chamados, os técnicos estão envolvidos com o problema.

Com a resolução, a priorização pode mudar a qualquer momento com a entrada de novas demandas.

Então, o que eu criei é a IA agora, que faz o papel de coordenadora de suporte, lê informações do Helpdesk, faz a avaliação de criticidade de acordo com o corpo de solicitação e coordena a equipe, direcionando-a para os atendimentos na ordem que devem ser feitas.

E a gente tem vários outros cases aqui. Hoje estamos usando o OpenCloud como uma camada operacional dentro da empresa e estruturamos a operação com múltiplos agentes especializados por área, como vendas, peças, atendimento, financeiro, jurídico e marketing, todos orquestrados por agente principal que mantém contexto, delega tarefas e conecta fluxos com os nossos sistemas internos.

Toda essa galera aqui são alunos e pupilos desse minicurso de OpenCLoud, que nós já temos mais de 15 mil alunos.

Então a gente tem vários cases, eu poderia ficar lendo cases aqui o dia inteiro.

Então tem muito case aqui dentro. Eu acho que a grande mensagem é para vocês no final do dia, que o que importa nessa jornada de OpenCLoud agora é muito mais criatividade, Porque a aplicação é muito fácil de fazer.

Não existe mais barreira técnica. Existe barreira de arquitetura e criatividade de aplicação de agentes.

E no final do dia, para você construir agente, você tem que saber três grandes pilares.

Contextos, rotinas e skills. Aqui no minicurso a gente vai pincelar pouco de cada mas no final do minicurso eu vou deixar dois vídeos de bônus que eu dou esse conceito sobre agentes para você entender melhor sobre essa questão de o que é agente, como funciona a estrutura, como você deve pensar sobre agente.

Mas isso aqui é para você ter uma fotografia do que você vai construir aqui nesse minicurso, tá bom?

Tamo junto, curta o curso e se você precisar de qualquer coisa, não esqueça que nós temos grupo no Telegram, que é o grupo aqui que você viu de exemplo do OpenClausinho e estamos aqui para te ajudar em qualquer momento da sua jornada.

Tamo junto! Bom, eu imagino que você esteja ansioso para ligar o seu agente, então chega de falação, bora pôr a mão na massa aí para a gente ligar o nosso agente.

Então, eu vou usar sempre essa Tella da esquerda para colocar o material correspondente da aula e na Tella da direita é onde nós vamos manuseando as coisas em questão, tá bom?

Então, vamos fechar isso aqui e eu vou simular com você toda a estrutura aqui.

Então, antes de vocês começarem aqui, a gente tem que saber que é o seguinte, você tem que ter agora pelo menos entre 30 e 45 minutos, sem interrupção, para a gente montar o seu agente.

Você tem que ter cartão de crédito, a gente vai precisar do cartão de crédito agora, e você tem que ter uma conta no Chat GPT, pelo menos no Plano Plus, tá?

eu preciso do Chat GPT para começar? Não, não precisa. Você pode usar outra LLM e tudo mais, mas eu recomendo que você use o chat GPT desde o primeiro momento.

Bruno, mas eu assino o cloud. Eu posso não assinar outra LLM? Eu posso usar só o cloud? O Cloud funciona no OpenCLoud com restrições. Então a minha recomendação é que você tenha uma assinatura dedicada para o chat GPT.

No meu caso eu uso o chat GPT e o Cloud, então dá para usar os dois, mas no OpenCLoud o Cloud tem limitações de uso por ele funcionar via CLI, que é termo mais técnico, mas ele ainda tem limitações.

Então eu recomendo você cair de cabeça no chat GPT que ele está funcionando muito bem, sem exceção.

cartão de crédito, chat gpt, navegador atualizado, celular com telegram, então você tem que ter o telegram instalando e o link da comunidade, então já entra no link da comunidade que isso aqui é muito importante tá.

Uma pegadinha que a Amora me falou aqui na criação do documento né, que é o seguinte que as pessoas Então, confundem às vezes a plataforma onde você gera a chave API, que é o que a gente vai colocar aqui, com a assinatura do Chat GPT.

Então, são sites diferentes. Então, se você cadastrou o seu cartão de crédito do Chat GPT, pensando que ele era API, e você abriu a assinatura do Chat GPT, não é API.

Não precisa cancelar né? Colocou cancela mas você vai precisar dos dois tá? mas Bruno por que que eu preciso assinar a OpenAI API e assinar o chat GPT?

Então eu te explico aqui de uma forma bem simples tá?

A assinatura do OpenAI via API, ela vai permitir você fazer três coisas.

Primeiro que ela vai fazer você criar sua conta na Hostinger.

A Hostinger você vai ver que ela não funciona sem ela ter a chave API.

A segunda coisa que você vai fazer aqui é que você vai vai ligar o Whisper.

Isso significa que você pode transcrever áudios. Então ele gasta dinheiro para transcrever áudios, mas fica tranquilo, muito pouco.

E o terceiro é que você vai ligar a memória semântica.

Bruno, o que é isso? Tudo bem, vou te explicar mais pra frente, mas o que você precisa saber agora é que esses três aqui consomem dinheiro da OpenAI.

Mas Bruno, quanto que eu vou gastar além da assinatura?

fica tranquilo meu jovem padawan que no final do dia você vai gastar tipo R$10 por mês no pior cenário assim tá mas normalmente é muito mais barato então o que eu recomendo aqui nesse início é que a gente comece colocando aqui em torno de 5 a 10 dólares que isso vai te dar aí três meses de longitividade aqui tranquilamente para você usar aqui dentro, tá bom?

Então, o que a gente vai fazer agora é que a gente vai criar o nosso Manage OpenCLoud, eu vou te mostrar para vocês como fazer e vocês não podem esquecer de ter a VPS com cupom, tá?

Se vocês estiverem instalando via terminal, querem instalar num servidor, querem uma aula mais técnica, a gente tem outra variação do minicurso que ele vai pelo root, instalar no root e aí é pouco mais técnico, então é outra jornada assista aquela jornada.

Essa aqui é pra você que só quer instalar seu OpenQL, não quer saber nada de técnico e quer só ligar o seu agente.

Então, é isso que a gente vai fazer exatamente agora.

Então, bora começar aqui. O que vocês têm que fazer é entrar no link do Leia.me.

Então, deixa eu pegar aqui pra vocês. Boa, então eu peguei o link aqui, esse é o link aqui que vocês vão pegar no Leyami para criar para vocês.

Então eu abri uma aba anônima aqui para a gente simular literalmente do zero a contratação.

Então vocês vão pegar esse link aqui, esse link ele é muito importante tá, porque por este link ele não vai passar no teste AB.

Então a Hostinger tem teste a B no site deles e se você simplesmente entrar no Google, digitar Hostinger e contratar eles diretamente, você pode cair na página que não é igual a essa, que não tem esses planos aqui, tem outros planos.

Então esse aqui é o OpenCloud gerenciado, que é o que a gente quer contratar agora, sem contar que ele já vem com desconto aplicado também, tá?

Então é muito importante vocês usarem esse link. Então, quando você entrar nessa página aqui, nós vamos descer aqui, vamos entrar aqui em OpenCloud Gerenciado.

Bruno, qual que é essa VPS? Então, caso você tenha curiosidade de saber qual que é a VPS, eu vou abrir aqui o outro, né, você vê que aqui ele vai até para outra página e a VPS que eles estão vendendo por R$30,00 é essa VPS de 8GB.

Então, uma VPS que ela tem 100GB de espaço, muito espaço para você usar muito seu OpenClaw e ela é mais barata, né?

Então a gente tem aqui por 43 e a gente tem aqui por 30, então acaba sendo melhor.

Bruno, sabe o testa B que eu te falei? É esse aqui, ó. Então às vezes ele cai nesse testa B aqui, que é esse OpenClaw de clique e ele muda o plano, ele muda a estrutura, tá?

No caso ele não mudou aqui, mas é pouco disso aqui.

Então você vai vir aqui, vai escolher o plano, tá?

Então a gente vai pegar esse plano, Eu recomendo que vocês peguem o plano de 12 meses, vale muito a pena por causa do desconto, dá desconto de 700 reais e cara, assim, você caiu aqui, você vai usar o OpenCLOL anyway.

Então assim, eu acho muito pouco provável você usar ele só mês.

Então eu recomendo você pegar já 12 meses, porque você vai usar ele bastante aqui, tá.

Eu recomendo você tirar esse crédito Nexus aqui, você já vai usar o crédito da OpenAI, então a gente vai usar aquilo lá, você não precisa disso aqui.

E a gente vai tirar esse pesquisa na internet, você não precisa desse crédito da OxyLabs e você pode também se você quiser deixar e-mail dedicado.

Então lembra que eu falei que o seu agente é funcionário, ele tem que ter o e-mail dele?

Então você pode ir lá você mesmo e criar e-mail, se você quiser no Gmail, que é o que eu fiz.

E se você tiver preguiça de criar e-mail, você só clica aqui, e-mail dedicado, paga R$9,00 a mais e você tem e-mail aqui configurado, tá bom?

E aí o que você tem que fazer aqui, além desse descontão que você ganhou aqui de 700 pila, é colocar o cupom BRUNOOKAMOTO.

Então, aplicar. Ao aplicar, você vai ganhar mais desconto e vai sair por R$37,00 por mês, no plano de 12 meses, tá bom?

Então, de novo, vamos só recapitular isso aqui. Vou pegar aqui esse aqui e vou colocar no nosso desenho uma fotografia da configuração, tá?

Então, para onde a gente tem que ir, vocês têm que sair dessa estrutura para essa estrutura aqui.

Então, de novo, 12 meses, eu acho que é o mais importante você colocar aqui e você aplicar o cupomzinho de desconto do Bruno Okamoto aqui, 10% de desconto, tá?

Isso é muito importante, meus caros companheiros. Vocês precisam deste desconto. Vocês precisam pegar o plano de dois meses, que vale muito a pena, tá bom?

Então, continuar. Vocês vão criar uma conta. Então, no meu caso, eu já tenho uma conta criada.

E aí, vocês vão cair, basicamente, aqui dentro. Deixa eu abrir pra vocês. Vocês vão cair aqui dentro da Hostinger, né? Então, caso você já tenha a conta na Hostinger, você vai cair nessa página aqui também.

Deixa eu aumentar aqui. Então, você vai cair nessa página. Caso você tenha acabado de fazer o passo a passo que eu falei, você vai cair nessa página do OpenCLoud.

No final do dia, se vocês olharem essa estrutura, é tudo a mesma coisa.

Então, se você tem VPS, eu tenho vários VPS, você vai ver aqui as VPS na página inicial.

Se você usa o Horizons, que é outra ferramenta deles, você vai cair aqui no Horizons.

Se você tem aqui o Docker, por exemplo, eu tenho aqui o Docker, você vai ver que ele tem uma outra visão aqui, mas no final do dia, tá aqui, onde a gente vai trabalhar, é nesse carinha aqui chamado OpenClaw, tá?

Então, aqui é onde está todo o OpenClaw. Então, quando você assinou aquele plano, você caiu exatamente aqui nesse menu, onde você vai cair nessa Tella.

Então, ao assinar aquele link, você cai literalmente nessa Tella agora.

Então, a partir de agora, é onde a gente começa a viver nosso agente, tá?

Então, vamos fazer esse trabalho aqui. Eu recomendo ir no OpenAI. Então, a gente vai entrar no OpenAI. openai.com tá então vamos colocar aqui openai.com vamos colocar entrar e você vai colocar aqui plataforma de API então de novo eu vou bater print screen aqui para ajudar vocês no futuro a entrar aqui então vamos colocar plataforma aí você vai logar com a sua conta, se você tiver uma conta, se você não tiver uma conta, você vai criar a sua conta, lembrando que isso aqui não é assinatura do chat GPT, isso aqui é a API da OpenAI que a gente vai colocar né, então no meu caso aqui né, eu já tenho aqui a minha estrutura, minhas chaves APIs, aqui estão todas as minhas chaves APIs tá, então deixa só eu voltar aqui, vou colocar aqui esse print aqui, então vocês vão, depois que você foi lá, você vai entrar no site da openai.com e você vai em plataforma de API, tá?

Então, uma vez que você entrar na plataforma de API, você vai em chaves API e você vai criar uma nova chave API, tá?

Então, de novo, print screen aqui, vocês vão aqui em chaves API e vocês vão em criar nova chave API.

vou deixar a imagem aqui para a gente não perder, criar nova chave API, então você vai colocar aqui meu novo OpenClaw, aí você vai colocar a chave API, de qual projeto e tal, você não mexe em nada, deixa All, Create Secret API, tá?

Então vocês vão copiar essa chave API aqui, vamos copiar ela aqui, e aí você vai voltar para aquela Tella de configuração.

Então, você voltou aqui, coloca a sua chave API, tá bom?

Então, a minha chave API tá aqui, não se preocupe, eu vou apagar ela, não tem nenhum problema.

Aí, você vai clicar em próximo e e ele vai, literalmente, configurar o seu OpenCLL em clique.

agora a gente vai literalmente conectar ele no telegram tá bom você não precisa necessariamente conectar ele no telegram agora mas a minha recomendação é que você use o telegram e não o whatsapp então vamos voltar de novo para o nosso desenho aqui Então você conectou ele aqui.

Aqui dentro a gente vai colocar para escolher as telas.

Eu vou colocar aqui as outras telas. E a minha recomendação é que você use o Telegram.

Por que o Telegram? Porque o Telegram, além da gente estar com a nossa comunidade aqui dentro, que você vai poder acessar ela mais facilmente, O Telegram funciona melhor para você ter tópicos, então ele é muito mais fácil de você organizar a estrutura da sua conversa com o seu agente.

Então você pode ter tópico, que nem eu tenho, sobre a Chief of Staff, que é tópico onde eu faço o brainstorm com várias das coisas, tópico de produção de conteúdo, tópico de curso, tópico do Pixel e Hub.

Você pode ter tópico de calendário, de e-mails, tópico de processos, de sistemas.

Então é muito mais fácil de organizar, porque no WhatsApp, o problema do WhatsApp é que você só tem chat.

Então quando você vai falando de diferentes temas, o seu agente vai se perdendo.

Mas eu não vou aprofundar isso aqui agora, mas eu recomendo e o curso inteiro vai ser feito em cima do Telegram e que você use o Telegram também.

Então no caso eu vou selecionar aqui o Telegram. Então o que a gente vai fazer é abrir esse Bot Fader e abrir novo bot.

Então vamos lá, tá? Então, Botfather, Botfather é este carinha aqui. Então, o que ele está falando aqui para a gente?

Abre o Botfather. Bruno, como você fez esse atalho? Eu não vi o que você fez. Cara, vai aqui em cima, todos os chats, pesquisa e digita aqui, Botfather.

E aí você vai achar o Botfather aqui. Então, de novo, vou fechar esse aqui, aí você tem aqui o Bot Father, então a gente vai vir aqui e vai colocar new de novo e ele vai falar assim, tudo bem como a gente vai chamar esse bot?

Então vamos chamar ele aqui de manageOpenClawBot tá, esse aqui é o nome dele, tudo bem a gente pode mudar depois.

Na verdade o nome dele é ManageOpenCloudBot, já tá sendo usado.

Vamos colocar aqui, MinicursoOpenCloudBrunoBot. Cara, se já tivesse usado isso, sério. Boa, boa, criamos aqui tá. Então, congratulation your new bot. E aí a gente tem aqui o MinicursoOpenCloudBrunoBot. que eu já deixei uma aqui embaixo pronta para gente.

aqui tá que que é esse a gente vai usar esse botezinho aqui da roxa então eu deixei ele com a logo dele aqui e aí tá pronto então quando você colocar o start não vai acontecer nada né você vai colocar o bote então siga as etapas dê nome para o seu bote escolha o nome do usuário copia o toque do bote fader tá uma longa sequência então eu pulei essa etapa né então vamos voltar para o bote fader Bruno, como que você abre esse atalho aqui?

Eu aperto CTRL K ou CMD K no Mac, então a gente vai abrir aqui o Bot Father e aí a gente vai clicar aqui, né, em Open, ele vai abrir esse menu, aí você vai aqui ó, Manage OpenQL por Bruno Camoto, que é o que a gente acabou de criar, e aí tá vendo esse token aqui brilhando?

Então a gente vai aqui copiar esse token e a gente vai colar esse token aqui ó.

Então, de novo, new bot, aí você vai criar novo bot, você depois vai copiar, então, criar e e copiar o o token.

Boa! Então vamos voltar para a nossa explicação, aí você vai criar o Token e você vai colocar o Token na Tella aqui, né?

Aí no seu Telegram ele tá dizendo assim, procure o nome do seu bot, abra o chat e digite start, que é o que eu queimei largada aqui e já fiz.

Boa! Então vamos aqui, clicar aqui e como eu já dei start antes, vou dar de novo porque eu queimei largada.

E aí ele falou assim olha your Telegram ID blá blá blá pairing code e aí você tem aqui copy tá vendo esse código aqui você copia esse código aqui você volta para cá e coloca o código de emparelhamento tá então você vai colocar aqui esse código é é verifique se o código corresponde ao que você vê no Telegram então beleza ele já copiou o código automático, cara que incrível, muito legal, nem tinha percebido isso.

Você pode pular essa etapa se quiser, mas eu recomendo vocês fazerem tudo via Telegram, porque a experiência usando Telegram ela é infinitamente melhor do que você usar o Gateway, que é o que você vai ver aqui na Tella daqui a pouco.

Telegram é muito melhor a experiência, tá? Então ele já conectou tudo prontinho e aí você pode clicar aqui em OpenClaw e abrir o OpenClaw e aí você vai cair na Tella do OpenClaw, tá bom?

Então agora que nós configuramos nosso OpenClaw vai aparecer essa Tella aqui e ele vai conectar automaticamente e aí estamos conectados.

Então você literalmente montou seu OpenClaw, fala olá E você manda olá aqui, ele vai usar o olá.

Se você mandar olá aqui, olá, ele vai também carregar.

Você vai ver aqui que ele vai começar a escrever e vai te responder aqui.

Vamos ver se ele está me respondendo. Caramba, já puxou monte de ferramenta só pra me responder olá aqui, né?

E aqui no Telegram, ele ainda tá respondendo. Mas aqui, você tá vendo, né? Então, acabei de chegar por aqui. Quem sou eu? Quem é você? Qual o meu nome? Blá, blá, é sucesso. Então você literalmente montou o seu OpenCLAL em clique e o seu OpenCLAL também já está funcionando aqui no Telegram.

Então o curso inteiro eu vou te guiar por essa interface do Telegram.

Então a gente não vai usar essa interface aqui. Então tudo isso aqui você pode fuçar depois, mas eu não vou aprofundar aqui, porque tudo que a gente fizer aqui que afeta diretamente essa estrutura que a gente tá vendo aqui, de nós, sonhos, configurações e tal, tudo isso a gente pode fazer conversando pelo Telegram.

Então não faz sentido você ficar usando dashboard e botões.

Agora você se foca no Telegram, que é o que mais importa, tá bom?

Então uma vez que a gente chegou até aqui, a gente vai começar a configurar o nosso OpenCloud.

Então vou baixar aqui a janelinha aqui, Agora que a gente já fez, né?

Então o setup, a gente já colocou a credencial, o agente já respondeu, a gente já conectou o Telegram para o Quick Win e agora a gente fazendo recap, né?

Então aqui tá o passo a passo do material, se você precisar, todos os passos rodando.

E o que a gente vai fazer agora é que a gente vai migrar para a assinatura do chat GPT.

E o que a gente vai fazer agora é que a gente vai migrar para a assinatura do chat GPT.

Como assim, Bruno? Lembra que a gente colocou a chave API? Então, aqui o que está acontecendo é que o seu bot está usando o dinheiro da sua chave API.

Então, se você colocou lá 10 dólares, 5 dólares, ele está usando esse dinheiro aqui agora.

Ele não está conectado na assinatura. Então, a gente vai entrar na parte mais difícil, entre muitas aspas aqui, do curso inteiro, que é onde você vai ligar a sua assinatura do chat GPT.

Tá bom? Então, agora que a gente passou por tudo isso, você colocou aqui os dólares, né?

Aí eu expliquei pra você, do ISP, do Embeddings, blá, blá, blá, né?

Caiu na landing page errada. Lembra que eu falei, né? No site da VPS, do OpenClaw, se você abrir o link errado, você pode cair na landing page errada.

Então você tem que ir especificamente para o Managed Open Claw.

Ai Bruno, eu não lembro o que é esse Managed Open Claw.

Não tem problema, dentro da Hostinger, se você estiver aqui dentro, lembra desse menu, tá aqui Open Claw no botãozinho aqui e aí você pode vir aqui nesse botãozinho e você pode contratar o Open Claw diretamente aqui por R$30,00 é a mesma coisa, mesma estrutura, só não esqueça de colocar o cupomzinho de desconto aqui, que você também ganha mais desconto, mas não vai funcionar porque a gente aplicou ele antes, tá bom?

Então é isso, funciona muito bem até aqui, tá bom?

Então temos o OpenQL conectado, temos o nosso Gateway ligado aqui e agora a gente vai fazer uma questão mais complexa.

Então, o que você tem que fazer é assinar o chat GPT.

Então, o que você vai fazer aqui é abrir de novo a OpenAI, que você já abriu.

Você vai colocar aqui, experimente o chat GPT ou entrar no chat GPT.

Então, você vai entrar no chat GPT, tá? No meu caso, eu já assino ele, né? Então, você pode vir aqui e assinar ele aqui, mas eu vou deslogar aqui dele e vou abrir uma janela anônima.

Então a gente vai vir aqui no chat GPT, aí você vai vir aqui em experimento chat GPT e aí você tá aqui dentro, tá bom?

Então o que você tem que fazer é se cadastrar gratuitamente ou entrar com a sua conta, né?

Você se cadastra e tal, e aí você assina o plano, tá?

Então planos chat GPT, vamos ver aqui. Então o chat GPT, ele não funciona se você pegar esses planos aqui, ó.

então esse plano aqui ele não funciona eu vou até colocar xizinho aqui em cima ele esse aqui funciona e esse aqui é o plano inicial lembrando que você vai começar gastando por esse plano mas o outro plano, o plano de 100 reais, ele eventualmente vai acabar muito rápido, tá?

Então, voltando aqui para o nosso desenho, o que a gente vai fazer é criar uma conta no chat GPT.

Então, vamos colocar aqui. criar conta no chat GPT, tá? Então você pode começar assinando o plano de R$99,00. Então você assina o planinho aqui, R$99,99 e cria sua conta, beleza?

Até aqui, tudo bem? Tudo maravilhoso. Vamos aqui no OpenCLoud. Então, veja, nós criamos aqui esse Yellow Green Lily Bird.

Então ele tá aqui rodando, você pode vir aqui a qualquer momento, você pode reiniciar ele, você pode fazer qualquer coisa aqui, tá?

Então aqui o que a gente vai fazer é que a gente vai abrir esse comando de CLI.

Então aqui é onde você abre se o seu OpenCloud deu qualquer tipo de problema, se o seu OpenCloud deu qualquer situação.

Não se preocupa que eu vou te ensinar, vou ter uma aula específica sobre problemas, você pode abrir a aula quando você quiser.

Aqui o que a gente vai fazer é colocar a assinatura do chat GPT.

Então, você vai rodar esse comando aqui chamado OpenClaw Models OAuthLoginProviderApiOpenAICodecSetDefault, tá?

Então, você vai vir aqui, vai colocar ele aqui, ó.

E aí, ele vai carregar aqui bonitinho, tá? Boa! Então, você vai ver que ele vai aparecer isso aqui, ó.

Open this URL in your local browser. Então, ele já apareceu link aqui, você vai copiar esse link inteiro.

Vamos copiar esse link. onde tá aqui, copy. E aí eu vou abrir ele num navegador. Então vamos colocar esse link aqui no navegador. Então ele tá perguntando assim, que bom que você voltou, vamos conectar aqui, vou pôr a minha conta do chat gpt e e aí ele vai carregar.

Ele vai abrir essa Tella, mas ele pode abrir outra Tella para você.

Então, se você criou uma conta nova no chat GPT, você tem que ativar uma coisa importante.

Então, se você criou uma conta nova no chat GPT, você tem que entrar aqui em configurações e você tem que entrar aqui embaixo em conta.

Aonde que tá? Deixa eu ver. Personalização. Então se você acabou de criar a conta no seu chat gpt e ele caiu nessa Tella aqui ele vai aparecer uma mensagem falando que ele não pode deixar você clicar em continuar enquanto você não atualizar essa opção aqui ó então você tem que abrir a sua conta do chat gpt entrar em configurações ir aqui em segurança e marcar a opção habilitar autorização por código de aparelho codex.

Isso aqui é muito importante tá. Então vou bater uma foto aqui segurança habilitar codex e a gente vai colocar colocar ele aqui na nossa aulinha aqui para a gente não perder o raciocínio.

Então vocês vão criar conta, mais habilitar codecs, tá? Então, vocês têm que habilitar esse codecs aqui dentro. Então, a gente criou a conta, vamos aprovar a conta.

Bruno, deu erro! Exatamente isso que você tem que pegar. Então, você vai voltar para a nossa telinha do terminal aqui e você vai colar esse link do erro, tá vendo?

E pronto, agora você conectou, olha só, ele ligou aqui ó, offprofile openAIbruna.microsas E aqui a gente tem Default Model OpenAI Codecs 5.4, tá bom?

Então, no caso, a Rochinger está usando o 5.4, mas a minha recomendação, na data da gravação desse minicurso, dessa aula, é que você use o 5.5, tá?

Então, ele deixa no 5.4 por padrão, mas o que você tem que fazer é mudar para o 5.5, tá?

Então, agora, o que você tem que fazer é mais nada.

Tá, você pode fechar essa Tella aqui, você pode fechar essa Tella aqui, fecha das APIs, né, e a gente vai voltar de novo para o nosso OpenClaw e a gente vai abrir o nosso bichinho de novo aqui, tá.

Então, só para ver se a gente logou na conta certinho aqui.

Boa! Então ele carregou aqui de volta o meu OpenCloud, ele demorou uns segundinhos para abrir e aí o que eu fiz foi perguntar para ele se ele está usando o meu login ou se está usando a chave API, tá?

Então você pode perguntar aqui, você pode abrir aqui no Telegram, né?

Você pode também digitar Models aqui, a gente vem aqui e digita Model.

E aí ele mostra aqui os Providers que você tem.

Então aqui, em tese, ele já conectou aqui com o meu OUF, tá vendo?

Então, em tese, ele já conectou o login e não está mais consumindo sua chave API, tá?

Então, aqui ele tá com uma API, blá, blá, blá, blá, blá, via APIKey.

Então, se você usar pelo Telegram aqui, você de novo consegue vir aqui, digitar model, né?

E aí vocês mudam aqui para Providers. aí Codecs e aí tem aqui já, então vou colocar aqui esse comandinho certinho para vocês não esquecerem, então você digita model e aí você verifica se ele está com a assinatura aqui né, então tem que aparecer esse OUF aqui em cima e você seleciona o chat GPT.

Bruno, por que que não tá aparecendo o 5.5? Porque eu acho que essa versão que a gente instala do da Rochinger ela não está com a versão 5.5 então uma forma de você fazer isso é você esperar pouco que provavelmente a Rochinger vai atualizar entre hoje amanhã não sei para ter a versão 5.5 Por que que não tá na versão mais atual?

Porque as versões quebram, dá muito bug. Então, se você olhar o nosso grupo aqui, você vai ver que a gente tem muitos alunos tentando usar o OpenClose para debugar, porque às vezes quebrou com uma atualização.

Então, eu não recomendo que vocês fiquem atualizando. Então, usa o 5.4 e quando sair o 5.5, você vem aqui e digita Models e você vai saber quando sair o 5.5.

Bruno, como que eu vou saber quando saiu o 5.5?

Vem aqui de vez em quando e digita model, vê aqui se já saiu novo.

saiu o 5.5. Não saiu, tá? E aí você vai conseguir fazer ele ficar no 5.5.

Bruno, tem muita diferença entre o 5.4 e o 5.5?

Tem. Muita. Então eu recomendo que você aguarde ansiosamente para você atualizar o seu OpenCLoud.

Bom, vamos concluir essa aula aqui, agora que você já ligou seu agente, você deve estar ansioso para fazer ele funcionar, né?

Então, a gente já ignorou aqui o terminal, eu vou voltar aqui e a gente vai usar só agora o nosso Telegram.

Então, não vamos mais usar aquele Gateway, tá? Então, para a gente validar tudo, você tem comando aqui que você pode digitar no CLI, tá?

para mostrar os providers configurados então de vez você usar o chat você pode colocar isso aqui lá mas enfim manda aqui no chat que o modo que é melhor tá bom Porque duas credenciais de novo, API Key, então API é para você logar na Hostinger e ela também vai funcionar para o Whisper, para o Embeddings, memória semântica e o ChatGPT é para você ter assinatura inclusa.

Então Bom, vamos concluir essa aula aqui, agora que você já ligou seu agente, você deve estar ansioso para fazer ele funcionar, né?

Então, a gente já ignorou aqui o terminal, eu vou voltar aqui e a gente vai usar só agora o nosso Telegram.

Então, não vamos mais usar aquele Gateway, tá? Então, para a gente validar tudo, você tem comando aqui que você pode digitar no CLI, tá?

para mostrar os providers configurados então de vez você usar o chat você pode colocar isso aqui lá mas enfim manda aqui no chat que o modo que é melhor tá bom Porque duas credenciais de novo, API Key, então API é para você logar na Hostinger e ela também vai funcionar para o Whisper, para o Embeddings, memória semântica e o ChatGPT é para você ter assinatura inclusa.

Então agora você vai começar a interagir com o ChatGPT, você tem todos esses documentos aqui e você consegue criar toda essa estrutura.

O que eu recomendo aqui é que você você passe a documentação da OpenClaw, a documentação oficial deles, que é esse link aqui, e que você crie autoconhecimento do seu agente.

Então, quando o seu agente lê a documentação dele mesmo, ele entende como ele funciona.

Então, a minha recomendação é que você pegue esse primeiro prompt aqui, você joga aqui dentro, E aí você vai fazer com que o seu OpenClaw se conheça melhor.

Então ele vai ler como ele funciona, o que ele pode fazer ou não, e ele vai salvar isso aqui dentro da memória dele como autoconhecimento do agente.

Então, sempre que o seu agente for fazer algo, ele vai saber aonde olhar na documentação oficial, em vez de ficar alucinando ou inventando coisas.

Esse é pequeno hackzinho, uma pequena dica que eu dou, que melhora bastante para vocês, porque ele mostra também certinho sobre tudo que funciona.

Então aqui de novo, Telegram para o Quick Win, né, a gente já conectou aqui no Telegram e aí agora a gente tem então o Hostinger funcionando, a gente tem a OpenAI configurada, a gente tem a assinatura do chat GPT, a gente já tem o agente respondendo mais o memory dele criado inicialmente, a gente já tem o Telegram funcionando e agora a gente vai construir as próximas etapas.

Aqui tem uma listinha de problemas que pode acontecer e se acontecer usa o nosso grupo de suporte ou veja essas perguntas aqui e agora a gente vai para a configuração do seu OpenCLOU, tá bom?

Valeu, curta muito seu agente, tamo junto! Boa, seguindo a aula aqui, vamos falar pouco sobre o que você precisa saber caso seu OpenCLoud dê problema.

Então isso aqui é uma aula introdutória, não vou me aprofundar muito, mas é para você saber aonde consultar o material caso você tenha qualquer problema, tá bom?

Então, na aula anterior, a gente pediu para o nosso OpenCLoud ler a documentação oficial, tá?

Então, esse aqui é só o resultado. ele mostrou como ele é, o que ele está usando isso aqui.

Aqui ele falou que a minha autenticação atual é como provedor de API Key, não da OpenAI, não por OUF.

Então, de novo, a gente mudou para OUF, ele não configurou de Então o que eu consigo fazer hoje?

Consigo usar Telegram, Whatsapp, Discord, Slack. Que ferramentas que eu tenho ativos? Arquivos e códigos, sistema, web. Então você vê que ele já vem com com Canvas, e mensagens de voz, automação, sessões e subagentes, memória e tudo mais.

Na prática, o que eu consigo? Ler, criar e editar arquivos, rodar comandos, buscar documentação, automatizar o navegador, mandar mensagem pelos canais, gerar voz, imagens e vídeos, criar lembretes, consultar status, usar skills e coordenar outras sessões e subagentes.

o que eu não consigo fazer ainda fazer com que ele ainda tenha todos os acessos a gente vai liberar os acessos dele e aí aqui tem os comandos principais então veja aqui comandos principais para me configurar esses são os comandos principais que eu posso usar por você é isso aqui que a gente vai passar aqui agora.

Então, você não precisa ler esse documento. Isso aqui é só uma aula de troubleshooting. Então, se você tiver qualquer problema com seu OpenCLol, volte para essa aula aqui e revisite ela, tá?

O que é você ter problema com seu OpenCLol? Então, você decidiu vir aqui e mudar aqui o OpenCLol.

ou você colocou alguma coisa aqui, ele mudou pra outra IA, ele quebrou, saiu uma atualização, deu algum problema, aconteceu alguma coisa.

E aí você responde, fala com seu bot, fala comigo.

E aí ele parou de te responder. Simplesmente assim. Então é aqui onde a gente entra aqui para a gente trabalhar com esse CLI de novo.

Então o CLI é você basicamente abrir esse terminal aqui, que é a parte mais técnica desse curso aqui, mas eu só vou te falar o que você precisa saber.

novo aonde que tá esse painel você tá aqui em OpenCLL nesse menuzinho aqui você tem que vir aqui em OpenCLL e clicar aqui nesse CLI aqui tá ao abrir o CLI vai abrir esse comando piscando aqui que assusta quem não tem experiência Mas don't worry, be happy e a gente vai trabalhar por isso aqui também, tá bom?

Então o que a gente vai fazer? Caso você tenha algum problema no seu OpenCLAL e você tá falando com ele assim, tipo, você não tá respondendo, tá acontecendo alguma coisa, você pode vir aqui nesse comandinho e digitar OpenCLAL status.

E aí ele vai te dizer se o seu agente tá bem, não tá bem, se ele está travado, o que aconteceu e assim por diante.

Então esse é comando que sim, você precisa saber, você vai usar ele ocasionalmente, tá bom?

Então ele tá falando, olha só, a gente tá usando aqui a versão 24 e a versão atual é a versão 12.

Então ele tá falando que existe uma atualização, que provavelmente é o que eu falei para vocês, que a Hostinger vai soltar.

Então provavelmente eles já colocaram esse pacote, Então eu pressuponho que ele já tem atualizado.

Então aqui você consegue ver tudo né, você vê se ele já tá rodando o Discord, o Slack, Telegram, WhatsApp, você consegue ver quais agentes estão on, quais são as línguas, então ó, ele tem aqui o 5.5 já liberado, então ele tem tudo aqui certinho né, então isso aqui é para você ver o status.

Se você tiver algum problema do seu OpenClaw parar de responder, então assim, ele listou, ele quebrou alguma coisa, deu algum problema e tudo mais, você roda esse comando aqui chamado OpenClaw Doctor.

Então você vem aqui, coloca OpenClaw Doctor e ele vai auditar o seu OpenClaw.

Então isso acontece caso quebre seu OpenClaw. Bruno, é comum quebrar o OpenClaw? Relativamente sim, porque o OpenCLAL é robô que precisa de manutenção, então se você passa dois meses sem dar manutenção nele, a tendência dele quebrar é relativamente alta.

Por que ele quebra? Às vezes sai uma atualização com defeito, mesmo assim a HostGear defendendo as atualizações, às vezes pode sair uma outra com defeito.

Às vezes você criou uma skill que quebrou alguma coisa, uma automação quebrou alguma coisa, às vezes você mandou ele fazer fluxo muito difícil e ele quebrou, às vezes ele buga.

É uma IA, como qualquer outra IA, às vezes ela buga, tá?

Então o Open Cloud Doctor ele roda aqui esse comandinho aí ele fala assim olha tá faltando aqui você instalar esses plugins então ele sugere você corrigir pequenos erros que ele diagnostica erros então é tudo que tá meio quebrado, tem tipo alguma pontinha solta, então ele vem aqui e arruma para você, não tem nenhum grande problema.

Agora esse aqui é o que autoconserta, A gente morreu.

Então, se o agente deu problema, não tá respondendo, tá travando, tá lento, tá enrolando.

Cara, a experiência tá truncada ou ela tá morta por completo.

Então, o OpenClaw DrFix faz com que ele aplique os fix seguros automaticamente.

backup e ele não tenta consertar coisas sensíveis sem aviso então por exemplo a você tem uma senha que vazou aconteceu alguma coisa ele ele não vai tentar consertar tudo isso para você ele só vai consertar o que é mais relacionado à infraestrutura normalmente esse comando é o comando que você usa quando deu algum problema e você precisa corrigir qualquer coisa.

Então ele vem aqui e faz para você openclaudoctorfix. E e esse aqui ele é muito importante esse aqui ele libera o seu agente para ele executar qualquer comando tá?

Então esse comando é muito importante. Então vocês vão colocar esse aqui, que isso aqui é o que separa agente com autonomia para executar as coisas, de agente que fica pedindo para você aprovar.

Então se você tá usando o seu OpenClaw e você tá aqui conversando com ele, E você fala assim, faça isso, automatiza isso, construa isso.

Ele fala, pra eu fazer isso, você precisa aprovar. Manda o comando approval, fala prove, fala não sei o que.

Essa burocracia que ele põe, você elimina ela usando essa configuração aqui.

Bruno, isso tem algum risco? Nenhum risco. Se você quer ter agente que ele tem autonomia pra fazer as coisas, você precisa desse comando.

senão tudo que você pedir para ele fazer ele vai ficar pedindo autorização e aprovação então você coloca esse comando aqui tá bom então você colocou esse comando aqui ele vai colocar aqui dentro e ele colocou aqui ó efective exec policy is the host approval file então tá então vamos perguntar aqui ó ele colocou o security full ask off né então ele não vai mais perguntar para você qualquer coisa tá bom então ele colocou ele aplicou esse exec tá então seu agente tem total comando aí Bruno quero entender o que foi feito cara bate uma foto ou só copia isso aqui ó O O Bruno me mandou colocar este comando no terminal.

O que acontece? Lembrando gente que o seu agente é ser super inteligente.

Então tudo que você tiver dúvida sobre o curso, sobre a jornada, sobre o que eu estou falando, Pergunta pra sua IA, troca uma ideia com ele, entendeu?

E eu vou além, eu acho que qualquer coisa que não esteja claro pra você, o conceito, conversa com a sua IA.

tá tudo bem tá e detalhe importante até aqui no curso a gente não começou a configurar ela então tudo que a gente tá fazendo aqui é só que uma olhinha ou outra para você entender o funcionamento e conceito a gente vai começar a configurar ele na próxima aula tá bom então aqui tem comandos que você precisa lembra desses comandos aqui openclaw status openclaw doctor openclaw doctor fix e aí você tem openclaw exec policy depois desse aqui tem alguns comandos que você pode usar se você precisar para alguma coisa tá e aí é porque que você não precisa se preocupar com update de novo não se preocupem rochinger ela tem filtro de updates então não fico se preocupando em tá na última versão ou não que esse é o trabalho da ro da rochinger e se alguma coisa travar de novo não esqueçam de usar o openclaw doctor fix tá então aqui de novo ele tá colocando aqui que ele mudou a configuração aplicou a política YOLO isso quer dizer que agora você consegue editar e fazer tudo mais mas ele diz aqui que a gente tá desatualizado né então ele tá falando que a gente tá usando a versão 1.12 de novo que a hosting vai ter que atualizar tá então se você quer segurança use no, não, rolo.

Se você quiser atravar tudo, você coloca esse comando de execpolicy deny all.

Mas você não quer que ele bloqueie tudo, né? Então, olha qual que é a diferença. YOLO, acesso total. CAUTIONS, ele fica perguntando se ele pode fazer as coisas ou não.

E o DENY é que o seu agente não faz nada.

Então, tudo que você pedir para ele executar, ele vai falar isso aqui eu não posso fazer, isso aqui você tem que se virar e fazer sozinho, que não faz nenhum sentido se você quer ter essa autonomia, tá bom?

Então, tamo junto, espero que essa aula tenha te gerado uma compreensão clara, se você precisar aqui você pode usar esse material aqui para qualquer coisa, tá?

E aí eu vou ensinar vocês agora a configurar o seu OpenCLON.

Bom, agora vamos para a aula que realmente a gente começa a criar o nosso agente.

Então, tudo que você viu até agora foi muito mais uma introdução.

Então, nessa primeira hora de mini curso, você entendeu como você criar o seu agente, como você criar sua conta no Telegram, como você colocar sua chave da OpenAI, como você colocar sua assinatura, você entendeu como você estruturar todo o passo a passo como você abrir o seu CLI que é como se fosse terminal para caso você tenha qualquer problema de novo que se você tiver qualquer problema você tem sempre os materiais aqui para verificar tudo tudo maravilhoso E agora a gente vai para a parte prática.

Essa de fato é a aula que você poderia começar a assistir para você configurar o seu OpenCLoud.

Então o que a gente fez? A gente nesse novo mini curso 2.0 a gente criou arquivo zip que em oito minutos você tem agente que ele assume tudo e faz tudo para você, tá bom?

Então o que a gente vai fazer é que a gente vai agora colocar esse arquivo, que ele vai ajudar a gente a guiar o agente, tá bom?

Então, o que você vai aprender aqui? Você vai aprender agora, primeiro, como que é a tese do produto.

Então, a aula do Starter Kit, ele tem duas formas, né?

Você pode tanto assistir a aula, né? Então, você pode, por exemplo, assistir esse curso inteiro, como você pode mandar o Starter Kit e tem a opção de você configurar o seu agente integralmente, sem assistir as aulas.

é a 2026, dos agentes. Então você pode fazer tudo isso sozinho. Então tá bom, por que que esse arquivo é seguro?

Então esse arquivo ele é só texto, o agente não ganha nenhuma permissão nova, não tem Prompt Injection, tudo em Docker, ou seja, tudo dentro do Managed Open Cloud da Rochinger.

Esse kit é seu, tá? Esse é o kit, é o mesmo kit que eu uso para os meus funcionários Então é kit que a gente montou na Pixel para nossa equipe, mas nós estamos disponibilizando para todos vocês no nosso mini curso, tá bom?

Então, como que funciona? Você joga esse arquivo aqui dentro do bot, ele está no Leia.me, tá?

Então não esqueça que está no Leia.me, tá? Você lê o leio, o seu agente ele vai pegar ou desempacotar o arquivo e ele também tem Leia.me, então é kit feito para agentes, tá?

Não é kit feito para humanos. Então, detalhe, se você jogar esse kit numa outra LLM, então você jogar ele no Cloud, jogar ele no chat GPT, provavelmente ele vai te dar informações sobre o que está dentro do kit.

Então, as outras LLMs, elas vão ler e falar assim, esse aqui é kit que ele faz isso, que ele faz aquilo e tal, ele não vai executar porque eles não são agentes.

Esse kit foi feito para OpenClaw. Eu não cheguei a testar em outras ferramentas, mas se você tá fazendo curso de OpenClaw, tá porque é kit de OpenClaw, tá bom?

Então vamos fazer este kit aqui. Então o que tem dentro do kit, só para você ter uma ideia, tem arquivo de como ele deve funcionar, ele tem uma checklist, então todas as etapas que o seu agente tem que passar com você, ele tem changelog para você sempre saber se ele está na última versão ou não, ele tem set skills que eu já trago para vocês de instalação, não se preocupe, eu vou te ensinar o que são skills na aula, ele já traz templates de identidade para o seu agente, alguns prompts, ele já traz também algumas questões de dúvidas, então as dúvidas mais comuns, por exemplo, a gente tem aqui né, Então, deu problema de login, né, que nem a gente viu aqui, ele não mudou praça natural do chat de GPT.

segurança, né, o que é esse YOLO que você ligou?

Então essas coisas aqui você pode perguntar para o seu agente, ele já tem esse FAQ aqui dentro e ele também vai te ajudar a organizar a estrutura das pastas.

Porque pensa que no seu agente, por trás é computador, então pensa no Windows Explorer, pensa no Finder, lá cheio de pastas.

Então aqui você precisa organizar essas pastas e esse kit faz isso aqui para você, tá bom?

Então esse kit é seguro de novo porque é só texto, não tem nenhuma permissão nova, tá tudo certo, tudo maravilhoso.

Então como funciona aqui o passo a passo, como funciona tudo e aí eu vou colocar para vocês, tá bom?

Então só mostrando para vocês aqui todo o documento que vocês precisarem, que vocês podem ler aqui dentro, tudo certinho.

Então vamos pegar o kit aqui dentro e e eu vou abrir aqui o meu kit que eu acabei de fazer download dele.

Vou jogar aqui dentro e a gente vai colocar aqui.

Leia o kit e siga as instruções. Então você pode colocar dentro do curso aqui, eu deixei prompt, você pode colocar qualquer prompt que você quiser, mas o mais importante é você instruir o agente a ler as instruções do kit.

Porque se você só jogar o kit, ele pode falar assim, você quer que eu analise o kit e ele vai ter o mesmo comportamento do que você jogar no Cloud ou no Chat GPT.

Então para isso não acontecer, você tem que falar para ele ler o kit e seguir as instruções.

Então você tem que dar esse comando aqui para ele, tá bom?

Então vamos colocar aqui ele junto e enquanto ele carrega a gente espera minutinho.

Boa! Então ele instalou o kit, deixa eu te mostrar. Então a gente colocou aqui, leia o kit e siga as instruções.

Vou abrir o arquivo zip de outro jeito porque esse ambiente não tem unzip.

Então ele instalou o kit maravilhosamente e ele começou a rodar aqui.

Olá, sou o seu agente, acabei de receber Starter Kit 2.53, experimento da Pixel Educação feito pelo Bruno Camoto.

Em fase experimental, ele é o primeiro experimento da Pixel onde o conteúdo do minicurso roda dentro do agente do aluno.

Cada skill foi escrita para ser lida e executada por outro agente, no caso ele, compreensível por ser humano que olha por cima, você.

A tese é que, em vez de você ler o manual e configurar tudo na mão, eu sou o seu tutor, eu te guio passo a passo, executo o que dá pra executar e te explico o porquê.

Esse é curso para dois tipos de alunos, humanos e agentes.

Você é o humano, eu sou o agente, a gente faz isso junto.

Sobre o kit, ele não mexe em nada. que você já tem. Ele só adiciona com a sua autorização passo a passo.

Quando a jornada terminar, eu arquivo automaticamente os manuais, exemplos e facts que vieram só para te guiar.

Então eles vão para uma pasta chamada Archive. Não somem de vez, você pode consultar depois. Então o que significa é que todo o o, vamos dizer, material que o agente usa para te guiar, ele é arquivado depois para não poluir a estrutura do seu agente e só remanece o que você implementou de fato.

Então se você no kit tiver qualquer feedback para me dar, que eu gostaria muito porque o kit está em fase experimental, mas a gente já testou com muita gente antes de gravar esse minicurso, é claro, você pode mandar e-mail para este meu e-mail, mas preferencialmente, você pode acessar nosso mini curso do OpenClaw e falar comigo diretamente aqui dentro.

Só me marcar, Bruno Okamoto, e me dar o seu feedback.

Falando, Bruno, aconteceu isso, teve uma experiência boa, uma experiência ruim, gostei muito, gostei pouco.

Me manda sua opinião, muito importante para mim, tá? Aqui, o que acontece? O kit, ele detecta se você já tem OpenCLoud configurado.

Então aqui no meu caso, ele já falou, olha, você já tem user.md, memory.md, porque lembra lá em cima que a gente falou para ele ler a documentação e criar uma memória?

Então o nosso kit falou assim, não, peraí, você já tem alguma coisa configurada, você não tá começando do zero.

E aí ele perguntou se ele quer criar PRD personalizado, então o que ele tá propondo?

Se você já tem OpenCLoud rodando, essa primeira opção é pra você.

Então assim, caso você tenha o OpenQL rodando, o que ele vai fazer?

Ele vai ler o kit, ele vai ler o seu workspace, que é a estrutura do seu agente, ele vai propor para você uma documentação de implementação.

Então ele vai fazer raio-x do kit, raio-x da sua estrutura, vai ver o que tem de novo no kit e vai te mostrar passo a passo, que é PRD, planejamento de desenvolvimento, onde ele vai te propor melhorias no seu workspace a partir do kit como base.

Então ele é bom se você quer o resultado sem passar pela jornada.

Tipo, Bruno, pô despreguiça, já manjo de OpenCLOL, não quero configurar, tanto faz, vai nessa opção.

Agora você tem o Wizard, que é a grande mágica desse kit, que é o que eu recomendo para todo mundo então vamos pelo wizard e o terceiro só referência então você deixa o kit como uma biblioteca então caso você já tenha múltiplos open class rodando você pode deixar essa biblioteca e ele usa como boas práticas então vamos para o kit tá então eu quero o wizard quero a opção 2 e e aí ele vai colocar então enquanto ele carrega aqui só para você entender a lógica você baixa o zip Você manda o zip para o seu bot do Telegram, o agente recebe, desempacota e lê.

Ele detecta automático e ele pergunta âncora, né? Então, só que tem ponto importante aqui, tá? O agente, ele tem duas formas de você seguir. Então, você pode seguir agora com o agente. Então, o agente, ele vai detectar o seu estado. Então, se você é aluno novo, ele já detecta. Ele fala assim, olha, você já tem. Então vou sugerir que ele já detectou que você já tem o kit ou já tem alguma coisa instalado.

Então ele vai ver se você está instalando o kit pela primeira vez, ele vai ver se você já tem agente instalado e precisa preservar o trabalho atual ou ele vai ver que você já tem outro kit, então você já pode ter aplicado kit anterior e ele vai ver o que tem de novo no novo kit para o agente mesmo aplicar as melhorias, tá bom?

tá tudo bem, tá tudo safe, esse kit não destrói nada, esse kit só constrói e essa é a maravilha dele, tá bom?

Então vou sugerir também que veio o novo no kit, que você ainda não tem, por exemplo, cinco passos, não vou reclamar do zero, não vou destruir nada, bora?

Bora! Vamos começar do absoluto zero. Então lembre-se gente, A experiência agêntica, ela não é uma experiência linear.

Então nem todo mundo vai ter o mesmo resultado usando o kit.

Então se em algum momento o kit não rodou, não executou, ele deu algum problema, fala para o seu agente, executa o kit, leia o wizard, começa do primeiro passo.

Então força ele a criar o passo a passo, porque ele vai fazer tudo para você, tá bom?

Então aqui no caso ele tá falando assim ó, dá para fazer, mas o zero absoluto nesse workspace atual não é seguro.

Você já tem arquivos e memória aqui, então eu não vou fingir que isso é Start Fresh.

Então temos dois caminhos, começar do zero de verdade, e eu te conduzo como aluno novo, ou zero didático.

Então eu rodo a jornada, mas tratando que já existe como material a revisar, não como uma instalação limpa.

Então o que a gente vai fazer, é criar do zero, de verdade.

Cara, esse kit é muito legal, sério. É muito legal a possibilidade de você transformar o seu agente no seu tutor pessoal.

Então você vai ter agente que ele vai te ajudar a se configurar inteiro e você simplesmente vai aprender conversando e fazendo as coisas com ele.

Então, o primeiro aha moment que você tem que ter nesse início da jornada são alguns.

Então, as suas primeiras vitórias, vamos chamar assim. A sua primeira vitória é você ter criado o OpenCloud com clique só.

Isso é maravilhoso. A sua segunda vitória é você entender que você consegue destravar qualquer problema do seu OpenCloud naquele CLI digitando OpenCloud DrFix.

Então, qualquer problema, DrFix. No seu terceiro vitória que você tem é que você ligou o Telegram.

E o Telegram tá funcionando e respondendo. Então você não tá usando aquela interface cheia de botões e cheia de coisas como se fosse chat quadrado.

Você tá usando o Telegram. Significa que você pode pegar e mandar áudio agora mesmo.

Então a gente vai fazer teste e mandar áudio. Mas, de qualquer forma, você já tem a sua experiência agêntica inteira configurada.

Daqui pra frente é só a construção e crescimento do seu agente tá bom bom gente então essa aula é isso eu não vou me prolongar muito aqui tá ele vai criar esse kit ele vai criar toda a jornada eu vou explicar para vocês e o kit vai fazer para você você ter suas escritórias automaticamente.

Então o kit vai te ensinar a configurar sua personalidade, vai te ensinar a configurar tudo.

E a gente vai passar nisso nas aulas, muito mais para fins de contexto, porque se você quiser, você não precisa assistir as outras aulas, você pode só seguir o kit.

Mas se você quiser entender profundamente como funciona agente, o OpenClaw, como criar skills, crons, como você automatizar, como você se transformar em agente autônomo, eu recomendo claramente que você assista às aulas.

Mas se você for meio preguiçoso, pode deixar que seu agente te guia pra você ter essa primeira experiência positiva de já ter agente inteiro configurado, tá bom?

Tamo junto, te vejo na próxima aula. Boa, então a gente tá aqui instalando o Starter Kit, já fizemos tudo aqui, eu mandei uma mensagem para o meu agente, falei assim, antes de continuar o Starter Kit, eu quero que você libere o grupo do Trank que eu acabei de marcar.

Por que isso? Porque enquanto a gente instala o Starter Kit individualmente nessa conversa, a gente já pode ir montando grupo pra gente conversando com a gente de outras coisas.

Então deixa o Starter Kit rolando num canal e vai criando outros canais aqui dentro.

E aí você pode ter o canal do Starter Kit, o canal do seu Brainstorm, o canal que você vai montar a personalidade dele.

Você pode ter vários canais aqui dentro que ele funciona super bem, tá bom?

Então o primeiro passo que você tem que fazer é você criar aqui esse bate-papo aqui dentro, onde você vai.

Aqui que ele tá puxando como tópico, né? Então você vem aqui, coloca aqui ó, em novo grupo, tá?

Você vai colocar o seu agente, no meu caso é esse Managed Open Cloud pro Bruno Kamoto, próximo, e você vai criar o grupo, então você pode chamar como assim, vamos chamar, nosso agente não tem nome, né?

Então vamos chamar ele de, pensar no nome, Thor. Então Thor HQ, que é o headquarter que a gente vai trabalhar, tá?

Então, você cria o TorHQ. no caso, eu não vou criar o TorHQ, porque eu já criei ele aqui.

a gente já tem o TorHQ, eu vou mudar até o nome aqui.

Vou colocar TorHQ Mini Curso OpenClaw com Bruno Okamoto. Então a gente já tem o Thor HQ aqui, foi criado tá.

Então eu mandei essa mensagem aqui no Thor, falei se consegue ler essa mensagem, você tá na área.

Então assim, se você criar o grupo e sair mandando mensagem para ele, ele não vai funcionar tá.

Agora se você chegar aqui para ele e falar para ele assim, olha antes de continuar a instalação do kit, quero que você libere o grupo do Theron que eu acabei de te marcar.

Então o que eu fiz foi que eu criei o grupo, eu marquei o meu agente aqui dentro, E aí eu falei pra ele, olha, te marquei.

E aí o que ele fez foi que ele falou, não, deixa eu identificar o grupo e eu vou liberar pra você.

E aí ele tá falando assim, ó, tempo, né. E aí eu falei, e aí, como que a gente tá?

Ele falou assim, olha, o grupo do Telegram foi liberado, deixei em modo seguro, respondendo só quando você me marcar e já foi aplicado.

Então vamos fazer teste aqui. E aí? Tudo bom? Vamos ver se ele já foi liberado já, tá? Ele deve demorar uns segundinhos para responder. Enquanto ele carrega aqui, a gente espera pouquinho. vamos deixar aqui. Te mandei mensagem, te marquei e nada. Pode verificar? enquanto ele está verificando aqui porque ele não rodou as mensagens, a gente espera segundinho, tá?

E aí, eu quero explicar para você uma coisa importante.

Então nesse material você tem tudo aqui de novo que você pode ler, tá?

Não vou ficar lendo tudo aqui, mas primeiro por que Telegram e não WhatsApp?

Então eu quero reforçar isso aqui que é muito importante, tá?

Nem tudo aqui é uma verdade absoluta nesse sentido de tipo risco operacional e tal, tudo a mesma coisa, mas é muito mais a nível de experiência.

Então o Telegram ele tem tópicos por temas, então você consegue vir aqui e criar tópicos por temas.

O WhatsApp não tem isso. Então o WhatsApp, se você criar uma comunidade por 20 grupos dentro, os grupos vão se perdendo nas suas conversas.

Então se você quer falar sobre uma coisa, você tem que ficar procurando o grupo no meio das conversas.

O Telegram, ele deixa tudo organizadinho aqui dentro, por tópico, no mesmo lugar.

Então é uma experiência muito mais fácil e simples. Outra coisa é que a API do Telegram, ela é muito melhor para agentes.

A API do WhatsApp é inexistente, ela não funciona, ela é uma porcaria.

Já outra coisa também é que o bot funciona muito bem aqui como admin aqui dentro e já dentro dos grupos do WhatsApp ele não funciona muito bem lá dentro como admin.

E aí também tem a questão de experiência né, que o WhatsApp não tem uma experiência muito boa.

sem contar que eu acho que esse aqui é dos maiores pontos, é porque a comunidade do OpenClaw, da nossa comunidade aqui dentro, ela está aqui dentro do nosso Telegram.

para você conversar comigo ou você usar aqui o nosso agente de suporte, que é o OpenClawzinho, você pode vir aqui e usar o Telegram.

se você travar em qualquer coisa, tá vendo aqui, você pode fazer aqui e tirar dúvidas com ele aqui dentro, tá bom?

olha só. O Thor respondeu, teste rápido, já estou liberado nesse grupo aqui, vamos lá, você está liberado mesmo?

E aí vamos ver se ele vai responder aqui, tá?

Aqui ele respondeu o seguinte, achei ponto suspeito, a regra do grupo entrou, mas estava mínima demais, vou deixar a atualização do seu usuário explícita dentro do grupo e já faço teste controlado, então beleza.

Enquanto ele faz o teste aqui, a gente aguarda, não está respondendo.

Enquanto a gente espera ele arrumar isso aqui, eu quero mostrar uma configuração importante.

Então você vai abrir o BotFabr, CTRL-K ou CMD-K no Mac, a gente vai abrir aqui o minicurso do OpenCLL, Você vai vir aqui em Open, você vai vir aqui dentro do Bot Fader, então você vai abrir o seu agente, você vai vir aqui em editar informações, Não é aqui não.

Você vai vir aqui em. onde que tá? aqui! Bot Settings em configurações. Isso aqui é muito importante, Você tem que desabilitar essa opção aqui chamado Group Privacy, porque isso aqui faz com que o seu bot só responda se ele for marcado e você quer conversar com ele como uma pessoa.

Então você precisa desabilitar isso aqui. Então a gente vai desabilitar o Group Privacy, tá? isso aqui é muito importante e eu vou reforçar isso aqui no material também que não estava incluso ali, de uma forma fácil de enxergar para vocês acharem mais facilmente.

Então uma vez que a gente liberou o Botfather, aqui fica mais fácil tá?

Então vamos fazer teste aqui, primeiro você está funcionando. Agora ele funcionou. Então o que ele fez de frente? Encontrei a causa mais provável, o bot está com o Privacy Mode exatamente que a gente desligou.

na verdade, faltou desligar o Privacy Mode e ele funciona, tá?

Então o problema não era a liberação, o problema era esse Privacy Mode do Telegram ligado.

Então, na prática, quer dizer que ele não lia o grupo, blá, blá, blá, e agora o grupo está ok, né?

Você consegue responder sem eu te marcar? eu acho que não. Porque, vamos para a próxima lição, não está o AllowMention.

Então você tem aqui a AllowList e a AllowMention. Então como que funciona? Para você colocar outras pessoas e para você conversar com ele aqui dentro.

Então a primeira coisa que a gente vai fazer é falar assim ó, quero que você inclua quero que você desligue o AllowMention para o agente me responder quando eu falar normalmente, sem precisar marcar ele.

Você pode mandar isso tanto para ele no privado, como você pode mandar aqui no grupo direto também.

E aí ele vai liberar para você esse comando, tá bom?

Então vamos esperar minutinho. E aí dessa forma você não precisa ficar marcando o seu agente, você consegue conversar com ele naturalmente.

Isso aqui se chama Allowmention, o comando que você libera essa menção.

Então tem dois comandos que a gente vai aprender agora, que é o Allowmention, para você mencionar e o bot conversar com você aqui dentro.

e o allow list, que é caso você ponha outras pessoas da sua equipe, seus sócios, seus filhos, seus irmãos, você pode por sua família para conversar com seu agente, mas para isso você tem que colocar eles na allow list.

Ambos os comandos podem ser feitos por aqui ó, então que tá acontecendo aqui ó ele falou que ele tentou fazer esse comando aqui o required mention ele tentou aplicar agora mas ele bateu no bloqueio desse pairing required então estamos no meio termo tá então eu quero fazer o seguinte ó consegue você mesmo executar este comando então às vezes acontece isso do agente falar olha batemos nesse bloqueio aconteceu isso e ele fala para você ir lá e fazer manualmente mas às vezes você pode pedir para o seu agente falar mano faz você executa aí e aí ele vai funcionar normalmente tá bom então vamos ver como ele vai funcionar aqui Então ele sugeriu né, da gente fazer esse ajuste de QueryMention, ele tentou aplicar e aí eu falei pra ele, mano executa você mesmo esse comando aí cara, não é meu papel ficar fazendo isso, é seu papel.

E aí dele demorou dois minutos, porque ele reiniciou o Gator, então deu esse erro aqui, ele reiniciou o Gator certinho e aí deu boa.

Então podemos conversar livremente agora. Agora vamos criar o grupo né, então o que você tem que fazer é você clicar aqui em cima, você clicar aqui em more, desculpa, em edit e aí você vai aqui em tópicos e você vai criar o tópicos.

Enable. E a gente vai criar os tópicos. Então agora nós temos tópicos aqui dentro, tá vendo? Então o que a gente vai fazer agora é criar tópicos.

Então vamos vir aqui, vou criar tópico. Então vou criar o tópico aqui do Starter Kit, que é onde a gente vai fazer o kit.

Não precisa explicar o que que é, né? Fazer o kit. Também eu vou criar aqui, de criar tópico, vai ser agente que eu quero Fazer brainstorm.

Quero entender o que faz esse agente, até onde ele vai, o que dá pra fazer, o que não dá.

Quero fazer brainstorm e eu quero também criar aqui secretário.

Pra ele já começar a ver meus e-mails, minha agenda e tudo mais.

Então o que você tem que fazer aqui é fazer teste pra ver se o seu agente já está funcionando nos grupos.

Então a gente pode fazer aqui, Starter Kit. Você está funcionando neste tópico? E aí, em tese, o seu agente já está funcionando em todos os tópicos.

Porque a gente já desabilitou aquele Privacy Mode do Bot Father.

Então, em tese, ele tem que estar funcionando em todos os tópicos.

E aqui, estamos aqui, tá vendo? E boa, montamos o nosso tópico do Telegram. Foi em relativamente baixo esforço, né? Então, vamos falar para ele o seguinte, ó. Quero continuar o Starter Kit aqui. Lembra do novo Workspace sugerido? Continue ele aqui, tá? Então se você quer aprender agora como ter mais agentes e ter agente em cada tópico e tal, fica tranquilo, a gente tem uma aula para isso mais na frente.

Agora não vou te ensinar isso. Agora o que você vai aprender é realmente esse básico aqui, tá?

E aí tá tudo certinho aqui dentro. Então a partir daqui a gente vai começar a trabalhar só dentro dos tópicos e a gente não precisa mais falar com este Open Cloud aqui, tá?

Se você precisar de qualquer coisa, você pode usar esse documento aqui da aula para tirar as dúvidas aqui, tá?

O documento tá bem organizadinho, bem bonitinho e qualquer dúvida que você tiver, use o nosso tópico da comunidade e eu estou lá para te ajudar.

boa então olha só a gente já tem aqui o nosso grupos do Telegram rodando né e aí que eu fiz eu criei esse tópico aqui chamado Starter Kit porque o meu agente não lembrou que eu joguei o Starter Kit para ele aqui no privado e também não tem problema e aí eu coloquei aqui o Starter Kit então eu falei quero continuar Starter Kit aqui lembra ele falou lembro parcialmente Pô mano, aí me quebra a perna, né?

Então eu joguei aqui para ele o Starter Kit, falei olha, leia-me, siga as instruções, e aí ele começou a instrução por aqui.

Então, de novo, o que você tem que ter feito até aqui agora, tá?

Então você tem que já ter com o Starter Kit aplicado, então você tem que estar o Starter Kit rodando, então você pode criar tópico para o Starter Kit, seu Telegram já está conectado, seu grupo já está liberado, você já tem a assinatura do SharedGPT rodando, então você não está mais queimando crédito dos tokens, da sua chave API, você já está trabalhando já aqui de aula, já foi mais de uma hora de aula, uma hora e meia de aula, mas foram muito conceitual então eu só dei uma fotografia mas você já pode estar seguindo sozinho aqui tudo mais tá então você vai ver aqui que no kit como eu comecei nesse tópico aqui ele meio que entendeu que é como se fosse uma coisa do zero a gente não tivesse feito nada então que ele perguntou ele falou assim olha Antes da gente decidir o ritmo, você tem minicurso OpenCloud v2 comprado com o login da Hotmart para acessar as aulas.

Ou você recebeu o skit avulso. E aí você pode falar assim, olha eu tenho o login da Hotmart e eu posso te oferecer o ritmo aula por aula com vídeos e o avulso.

Então basicamente o que acontece, se você falar que você tem o kit, ele vai te sugerir você instalando conforme as aulas.

Se você falar, não, eu recebi esse kit de amigo e eu imagino que esse kit vai vazar na internet, anyway, não me preocupa muito com isso, você tem a opção do agente pegar e te ensinar algumas coisas, mas não de forma profunda, que nem a gente ensina eu falando com você aqui na câmera, né?

Então quando você falar para ele assim, que você tem o login da Hotmart, porque você comprou o nosso minicurso, ele vai falar assim para você.

Você tem minicurso, então como você prefere configurar o agente?

Você prefere assistir as aulas em paralelo e aí você assiste a aula e configura, ou você fazer direto comigo sem aulas e eu te guio, tá?

Então não tem certo nem errado. Então você pode fazer aqui a instalação e a gente pode fazer toda a configuração juntos.

Então anyway eu vou fazer e eu vou te ensinar tudo isso aqui, mas também nada impede de você já ir fazendo as coisas aqui em paralelo.

Então eu vou pressupor que você queira ir fazendo as coisas e você vai assistindo aula no seu tempo.

Então a gente vai colocar aqui e falar assim, não, vamos no B.

Quero o que ir fazendo com você e o Bruno.

Bruno eu assisto quando eu tiver tempo. Então vamos supor que você tá aqui, tá? Então o que você vai aprender aqui nessa aula aqui hoje é que a gente vai criar a identidade do seu agente.

Então tanto faz se você seguiu pelo caminho direto, tanto faz se você colocou depois.

Então, o primeiro passo que ele está falando para você ativar a transcrição de áudio.

caso você queira conversar com seu agente por áudio, ele pode ativar agora.

Então, como você já colocou a sua chave API, você já não precisa fazer mais nada, ele já vai identificar que você tem a chave API.

Então, ele vai dar uma olhada aí, ó. Vai ver se você tem a chave API no seu computador.

No caso, o computador na nuvem, na VPS. Ele vai ver se já tem a chave API. Então, vamos ver se ele vai achar a minha chave API aqui.

E olha só, ele detectou que a chave API já veio, tá?

Ele já tá funcionando a memória semântica e o Whisper, eu vou te explicar o que é isso daqui a pouco.

E aí ele manda a gente fazer teste. vamos fazer teste e ver se já está funcionando a transcrição.

Cara, não parece mágico isso? Muito legal, velho, sério. Vamos ver aqui. E aí, Thor, você consegue me escutar? Se você não sabe quem é Thor, é você, irmãozinho, mas veja se esse áudio chegou aí pra você.

Vamos ver se ele vai escutar o nosso áudio e se deu certo o kit de instalação.

inclusive ele aparece só aqui vocês conseguem desabilitar isso aqui se você quiser tá então você pode falar para ele falar assim olha é para de aparecer as mensagens e tal que isso me incomoda é se eu não me engano isso aqui se chama reasoning de reasoning é isso aqui ó reasoning você pode desabilitar esse reasoning aqui se você não quiser ver ele pensando tá então olha só funcionou deu tudo certo né Então ele já seguiu aqui, instalou o Whisper.

Então vamos aqui, você pode desabilitar o Reasoning se você quiser ou não.

Então antes da gente continuar aqui tal, de falar personalidade, é vamos seguir o Wizard.

Já habilitei o áudio. Eu recomendo que vocês sempre sigam o Wizard, Então, se durante a conversa aqui você mandar áudio, você ir para algum lugar, configurar alguma coisa, é sempre bom você voltar aqui e falar para ele seguir o Wizard, porque o Wizard vai te guiar para uma experiência muito bacana.

se ele sair, é só voltar aqui e tá tudo bem, tá?

Mas, Bruno, eu posso ir em paralelo falando com outros grupos?

Posso falar com você aqui em paralelo? você pode ir falando com seu agente em paralelo, não tem nenhum problema Então a gente deixa aqui o Starter Kit, mas você pode ir falando com seu agente em paralelo aqui tá bom?

Então primeira coisa que a gente vai configurar a personalidade do seu agente, então aqui a gente vai fazer aqui Então esses arquivos eles ficam vivos, são três arquivos que a gente vai criar.

que é a identidade do seu agente, o SOU, que é como ele pensa e tudo mais, e o AGENTS, que é como as regras dele, tá bom?

Então esses arquivos são o que diferenciam, por exemplo, o CLOUD, o chat GPT, de agente que tem autonomia, Então esses arquivos, eles são arquivos vivos, que toda vez que o seu agente acordar, ele vai ler esses arquivos.

Então eles são arquivos fundamentais para a existência do seu agente, Então bora lá!

Como você quer chamar o seu agente? Então eu vou propor aqui, ele dá o exemplo do meu.

Então vamos falar assim ó, eu quero que meu agente se chame Thor, o deus.

a gente vai configurando o Thor juntos aqui. O Thor ele é homem. Enquanto a gente carrega ele aqui. Vamos deixar o material até onde vocês precisam saber, que você pode ler aqui se você quiser entender melhor pouco sobre o que é cada arquivo, né?

Vamos lá. O Thor fala de forma casual. O Thor, ele é direto. O Thor, ele é brasileiro, então ele tem que falar gírias e ser engraçado.

E o Thor é gente boa pra caramba. O Thor, ele é muito brother. Se você estiver pensando, pô, como que o Bruno fala e escreve aqui no chat, é porque eu estou usando uma ferramenta chamado WhisperFlow, que é essa aqui onde está meu mouse, ó, W-I-S-P-R Flow.

Então ele tem uma versão gratuita bem generosa, então eu uso muito ele para falar nos meus agentes e tudo, tá?

Então tá aqui o Thor aqui, muito bem, então podemos seguir.

Então o Thor falou aqui, já tá tudo certo. Thor é gente boa, brother. Então a gente tá criando aqui agora a identidade do Thor, né?

A gente tá falando pouquinho aqui. O que o Thor jamais deve fazer? Cara, o Thor jamais deve ser formal, jamais deve me enrolar, o Thor jamais deve dar desculpa ou me agradar o tempo inteiro.

Ele não precisa falar que ideia excelente, que gentil, que massa, eu só quero que o Thor não me bajule, que ele fale de forma direta, pragmática, que ele seja proativo, me traga respostas, que quando eu falar uma ideia ruim, que ele fale, pô, que ideia ruim, cara, que ele seja realmente o meu braço direito e não só agente.

Thor. E aí você pode definir como você quiser. E gente, isso aqui não é permanente, tá? Então quando você quiser mudar a personalidade do seu agente, mudar qualquer coisa, é só você conversar com ele.

Falar, eu quero mudar a minha personalidade, quero fazer tal coisa.

Ele faz pra você tudo certo, tá? Então o Soul que a gente tá configurando, ele é a personalidade do seu agente.

Então ele tem tom de voz específico, ele tem valores, ele tem jeito de responder.

Então, por exemplo, o Sou da Amora, ela tem, por exemplo, essa cultura anti-rustle, então ela é contra esse romantismo do empreendedorismo, ela é direta, ela é vulnerável, então ela fala quando ela erra, ela pede desculpas, ela entende o erro dela e ela pode xingar, cara.

Eu coloquei pra minha gente xingar, eu gosto que ela xinga e fale que saco, que droga e palavrões, outros palavrões que ela fala até demais ali.

Então é isso, né? Então antes de fechar daqui mês, blá blá blá, então deixar esse comentário no Wixpress também, rapidão, antes de fechar esse passo.

Se daqui mês você editar o identity direto e mudar o meu nome ou tom, eu pego automático ou preciso ser avisado?

Pode pegar automático. Vamos seguindo aqui. Agora a gente tá criando o identity, né, que é quem é ele.

Então, aqui no meu caso, a Mora é minha Chief of Staff.

Então, a gente vai passar por essa configuração aqui também, tá?

Então, ele tá criando esse identity aqui. Então, toda vez que eu vou responder, eu leio ele.

Se mudar lá, eu mudei aqui na hora seguinte, não precisa me avisar.

Então, se você quiser aprofundar a identidade do agente, tem uma aula que detalha isso, que é a identidade completa.

Então, você pode pular para essa aula aqui e a gente pode ir para o passo 2.

Vamos criar o passo 2. Para começar, como você quer ser descrito? vamos aqui. Meu nome é Bruno Okamoto. Eu sou o tutor dos alunos do minicurso do OpenClaw, mas você pode me chamar de Bruno.

O que me irrita é agente que demora e me enrola, entendeu?

Eu quero agente que seja meu chefe, meu executor, meu chief of staff, que nem a Amora é para o Bruno.

O que me irrita também é agente devagar, que some, não faz as coisas.

Eu gosto de gente proativa, de gente proativa. Pra mim, o que eu valorizo num agente é que ele sempre faça as coisas, execute e que ele volte pra mim falando, olha, tá resolvido e não fique me pedindo permissão pra fazer tudo.

Eu quero agente proativo, que ele execute, que ele põe a mão na massa e que ele só me traga soluções e não problemas.

É aí gente, eu tô viajando aqui na moranga aqui, mas você pode fazer o que você quiser.

Se você tiver dúvida de como você fazer esse Starter Kit, você pode abrir outro tópico e falar com ele.

E falar, pô, olha só, aqui no Starter Kit chegou essas perguntas aqui pra mim e eu não sei o que responder, o que você me sugere?

Ele pode fazer pra você. confirmo. e a gente vai criando. Então a gente já tá criando o sou dele aqui, a gente tá criando a identidade dele aqui e aí a gente tem o agents que é o próximo passo aqui que a gente vai chegar aqui.

Então a gente já criou o user que é esse aqui, então quem é você?

a gente já criou o sou dele e agora a gente vai criar esses outros que faltaram né.

Então aqui eu deixei exemplo que você pode falar, então no meu caso eu passei tudo isso aqui para eles né, eu falei quem sou eu, falei meus negócios, falei sobre minha família, falei sobre minha equipe, falei que eu tenho TDAH, falei que eu sou autista também, então fica aí uma informação a mais para você processar ela.

equipe, tom preferido, restrições, valores e etc. Então você pode fazer algo bem detalhado se você quiser.

Aqui eu tô fazendo mais fast food mesmo para gente avançar até porque são 11 horas da noite.

Não vou ficar me enrolando e te enrolando também. Então a gente criou aqui agora. Você pode abrir o user em qualquer momento e editar direto.

Eu uso a versão atual sempre, não tem caixa. Rapidão, antes de fechar esse passo. Você acabou de passar várias coisas sobre você. Onde ficou salvo? E se você lá editar direto eu pego? Sim, pode pegar tudo. Vamos seguir. Enquanto o Thor está carregando e executando as coisas, eu quero que você veja aqui no material que eu deixei alguns prompts caso você queira se aprofundar em alguma coisa.

Se você quiser se aprofundar no soul dele, se aprofundar na identidade, se aprofundar no usuário.

Você pode não só usar esse prompt, como você pode pedir pra ele te guiar.

Então fala assim, olha, me faça perguntas, me entreviste. Quero que você finge que você é entrevistador e que você quer saber tudo da minha vida e elabore perguntas.

E ele vai perguntar pra você de uma forma maravilhosa, tá?

Então assim, eu não vou ficar seguindo muito para não deixar essa aula muito longa, mas aqui tá tudo muito bem certinho, tudo muito bem configurado, tá E aí a gente vai seguir nos próximos blocos.

O que eu quero que você entenda, que você sempre tenha esse tipo de pensamento para a gente ficar alinhado na mesma página, é que você sempre tem que tratar o seu agente como funcionário, Então, tudo que você for fazer para o seu agente, você tem que já deixar ele com o login separado.

Então, se você for, em paralelo aqui, criar e-mail para ele, pedir para ele acessar suas contas, sua agenda e tal, cria uma conta para ele, faça as coisas, tá?

Eu vou aprofundar isso aqui nas próximas aulas, mas é muito importante você sempre tratar ele como funcionário e não como uma extensão da sua conta pessoal, tá então trate o seu agente na configuração dele como funcionário e não como clone seu.

A gente se vê na próxima aula. Boa, agora eu quero te ensinar uma coisa importante sobre lógica, tá?

Então assim, eu sei que você tá ansioso pra começar a automatizar tudo, pra já sair criando seu agente, pra já fazer tudo, mas é importante você entender essa fundação pra quando você escalar o seu agente, você escalar ele com menos retrabalho.

Então, por isso que esse curso é importante pra você ter essa base.

Então, o que a gente vai fazer agora é criar uma estrutura de workspace, tá?

Então, recapitulando, a gente colocou o Starter Kit, já criamos aqui os mapas, a gente já colocou a identidade, conectamos o Telegram, blá blá blá, tá bom?

Então, eu sei que por mais que as aulas pareçam longas, tudo isso aqui no seu agente você pode ter feito isso aqui rapidão.

Então, a primeira vez é pouco mais lento, mas as próximas vezes vai ser muito mais rápido, tá bom?

Então, o que que é organizar esse workspace? Então, o seu agente, por natureza, ele funciona que nem Windows Explorer ou Finder se você tem Mac.

Então ele pega aqui por exemplo e ele fica cuspindo arquivos e pastas em lugares aleatórios que nem tá aqui no meu computador.

Então pensa que ele só vai jogando as pastas aqui dentro e vai fazendo monte de coisa.

Então você precisa fazer com que ele se organize. com que ele tenha pastas. Então vou te mostrar o exemplo do meu agente. Isso aqui que a gente tá vendo é a pasta da minha agente, da Amora.

Então ela tem aqui o Workshops, o Wiki, tá aqui o User, o Tools, o Soul, ela tem as Skills.

Então todas as Skills tem pastas, tem mapa que explica como todas as Skills são categorizadas, A gente tem aqui índex que explica o que é cada skill, então é muito importante você criar uma estrutura agêntica para o seu OpenCLoud para ele crescer com qualidade e esse conceito de estrutura agêntica ele aplica a qualquer ferramenta.

Então, aqui dentro, a gente seguiu o passo, né? Então, se a gente olhar aqui, a gente criou o user, né?

Ele viu que ele tava com o exec liberado. Então, lembra que a gente entrou no terminal e executou aquele YOLO lá?

Então, ele viu aqui que ele já tá com a autonomia liberado.

Então, ele já pode executar tudo sem me interromper em qualquer coisa.

Então, quando a gente falou pra ele, você tem que ter proatividade, ele tem proatividade e ele pode sair executando as coisas agora.

Então ele vai para o próximo passo que é o Workspace.

Então vamos vamos nessa. Então o que a gente vai fazer agora? Esse agente aqui, esse Starter Kit, ele vai criar essa estrutura aqui dentro, tá bom?

Então eu vou pressupor algumas características. A primeira coisa é que eu vou pressupor que você curta conteúdo.

Então a gente criou uma pasta chamada Content. Então eu vou pressupor que você vai criar conteúdo para redes sociais, que você vai criar artigos, que você vai criar posts, que você vai às vezes criar, sei lá, conteúdos no geral, independente de ser rede social, coisas acadêmicas, tanto faz, você tem uma pasta de conteúdo aqui dentro, tá?

Dentro da pasta de conteúdo você tem mapa. Depois você tem a pasta de memória, que é onde o seu OpenClaw guarda as coisas.

Então, se você olhar aqui na nossa pasta de memória da Mora, do meu agente, você vai ver aqui que ele tem a pasta de memória.

Então, aqui em memória ele tem as notas dele. Então, você vai ver monte de arquivo solto. Notas aqui de coisas que ele vai fazer. Então, dentro da memória é o padrão do OpenClaw, ele vai cuspindo essas notas aqui, mas dentro de memória eu criei outras pastas como uma pasta de contextos de projetos Por que isso aqui é importante?

Porque quando você cria essas pastas aqui dentro, o seu agente, ele deixa mais organizado a estrutura dele.

Então por mais que ele fique jogando, cuspindo nota aqui dentro, o resto fica organizadinho.

Então, por exemplo, quem fez esse meu curso inteiro foi o meu próprio penclaw.

Então tudo que você está assistindo, o starter kit, o material que você está vendo, tudo foi a Mora que fez.

A ideia do curso foi da Mora. Esse curso inteiro foi feito pela Mora. desde a ideia até a execução. Meu único papel como humano aqui é gravar essa aula pra você.

Então, a Amora, ela organizou tudo isso aqui. Então, ela tem aqui a versão 1 do nosso minicurso e a versão 2.

Então, se você olhar aqui, dentro da pasta da memória dela, tem aqui toda a estrutura de pastas, mentorias, palestras, produtos, status, pesquisas, sessões.

Então, o que eu dou pra vocês aqui é uma base de como você pode organizar a sua pasta.

Eu acho que a maior lição que você tem que aprender aqui nessa estrutura é que toda pasta ela tem que ter mapa.

Então você sempre tem que pedir para o seu agente quando ele criar uma pasta nova para ele colocar mapa dentro dessa pasta para explicar o que tem dentro dessa pasta.

Então toda vez que a Amora acorda acorda e ela fala assim, tá, quem sou eu?

tá, eu sou a Amora. tá, eu sou assistente do Bruno. tá, o Bruno é essa pessoa. tá, esse aqui é o mapa das pastas. Então, dentro da Amora, a gente tem aqui uma configuração, dentro do agents.md, que aponta para esse mapa.

E aí quando ela mora, lê o mapa, ela lê e ela sabe que existe essa pasta chamado Memory, Content, Skills, Archive, Envy, e tal.

Então ela vai ler isso aqui e ela vai entender tudo que tá construído aqui dentro.

Então ela vai falar, agora eu sei que eu tenho uma pasta chamado Memory.

E aí se você precisar procurar alguma coisa dentro da pasta de Memory, projetos, pessoas, palestras, artigos, academia, qualquer coisa, você pode simplesmente colocar todas as pastas aqui no mapa, Bruno, como eu coloco as pastas no mapa?

Pede para o seu agente. Fala, Thor, cria uma pasta chamado faculdade e atualiza o mapa.

E o Thor vai fazer isso. E aí, uma vez que o seu agente acordar, ele vai saber que existem as pastas e se você quiser falar sobre a faculdade, ele vai abrir o memory e ele vai ler o mapa e ele vai falar, tá, tá aqui a pasta faculdade.

Isso aqui é muito importante você entender essa lógica, porque essa organização de Workspace, apesar de a gente te dar aqui tudo isso mastigado, tudo isso organizado, para você escalar o seu OpenCLoud, você tem que entender essa dinâmica aqui.

Então, isso aqui é muito importante, tá bom? Então, de novo, você tem todo o material aqui, isso aqui explica tudo para vocês.

Cresce sem controle, lock incognitivo, sem domínio. Então, quando você faz tudo isso desorganizado, você joga todas as coisas no seu agente.

Quando você cria mapas, você consegue colocar mapas e o seu agente já vai saber onde está tudo e também vai gastar muito menos token, tá bom?

então você tem mapa aqui tá a estrutura do mapa é essa então o que que mora aqui então esse mapa ele é feito para agentes e não para humanos então tudo que tá na pasta da mora não é feito para humanos eu nem abro essa pasta da mora eu só tô abrindo isso aqui agora para carregar os materiais que a gente montou aqui porque todo o resto é material para robôs tá bom então feito aqui Lembrando que o meu agente aqui, o Starter Kit, ele sempre vai fazer backup para vocês de tudo.

Então não se preocupe, nada vai ser apagado. Então se você está conversando aqui em outros tópicos e você voltou para o Starter Kit depois de três dias, você seguiu, ele não vai apagar nada seu, ele só vai mapear o que já tem, fazer backup e te trazer uma nova estrutura, tá bom?

Então aqui tem tudo o que você precisa saber aqui também sobre as coisas, tá?

E o que eu recomendo de conclusão aqui, dessa etapa aqui, tá bom?

É que você crie audit, Então, você pode pedir para o seu próprio OpenCloud auditar a estrutura dele.

Então, você pode chegar e falar assim, olha, eu quero que uma vez por mês, e aqui é sua primeira automação, de certa forma, quero que uma vez por mês você audite o meu workspace e veja se está tudo atualizado, tudo com mapa, tudo organizado.

E uma vez por mês ele vai olhar o workspace dele e falar, olha, encontrei arquivo solto, coloquei na pasta, atualizei o mapa.

Cara, funciona maravilhosamente muito bem, tá bom? Então, isso aqui é o que você precisa saber. Aqui tem alguns exemplos para eu mostrar para vocês sobre como funciona, mas não tem muito segredo, tá?

E aqui, rapidão, antes de fechar esse passo, para onde eu vou salvar post novo que você me pedir e para onde eu vou buscar uma decisão antiga que você me contou.

Então, você precisa seguir o mapa sempre. Então, no caso, ele faz uma pergunta. Se você não souber responder a pergunta, você fala, olha, não sei o que te responder.

Pode me guiar? Então é isso aí ó, aí ele vai terminar essa sessão aqui, você montou o seu workspace, qualquer coisa você consulta o material, tamo junto demais, te vejo na próxima aula.

Eis uma aula muito importante. Você precisa entender sobre como funciona a memória do seu agente.

E você tem que entender que o seu agente, às vezes, ele vai travar, não vai responder, vai ficar lento.

E aí que vem a higiene de contexto. Então, essa aula aqui, ela é muito importante. Presta atenção, porque você precisa entender como funciona a memória de agente, tá bom?

Então, o agente, pra ele. ter o supra-sumo da experiência agêntica, ele tem que lembrar de tudo.

Essa é a grande maravilha do agente. Então quando você pede pro agente estudar algo, pesquisar algo, quando você passa conteúdo pra ele, você manda review do Instagram, você manda post do X, você manda vídeo do YouTube, Você quer que ele lembre disso.

E quando você conversar com ele sobre uma pauta, você quer que ele lembre que ele já viu vídeo do YouTube sobre aquela pauta e debata com você sobre o que ele aprendeu.

Ou você é estudante, você quer que ele lembre de alguma coisa que você conversou na faculdade, que ele lembre sobre tudo que você estudou com ele sobre uma matéria.

Ou você é engenheiro, você quer que ele lembre de obras, de estruturas.

Ou você é dentista, ou você é estudante de medicina, você é advogado, você quer que ele lembre de casos, de processos.

Então, a memória é muito importante. A memória funciona em duas grandes estruturas. O workspace é a memória, vamos dizer, física, é a papelada.

Então, você arrumando o workspace, colocando mapas e pastas, o seu agente já tende a ter uma organização de memória muito, muito melhor do que se você deixasse ele solto e não seguisse o exemplo aqui do curso.

Então, sempre que você criar pastas, crie lá pastas. Você vai trabalhar com uma obra, crie a pasta chamada obra X.

Você vai trabalhar com advogado, cria uma pasta por cliente, cria uma pasta por processo, organiza o seu workspace.

Bruno, mas eu não consigo ver o workspace. Cara, não tem problema, cria aqui dentro, organiza isso aqui dentro, tá?

Então, antes da gente seguir aqui para os superpoderes do agente, eu quero explicar essa aula de memória para vocês.

Então, a memória, ela funciona em sete grandes blocos tá então o seu agente todo dia o que ele faz é salvar essa dele notes então ele salva tudo isso automaticamente então essas dele notes aqui dele basicamente é isso aqui ó ele salva essas coisas que você tá conversando então ó são arquivos brutos ó monte de texto aleatório ele cospe coisa aqui dentro, tá vendo?

Então isso aqui é uma Daily Note, tudo que você conversou com ele, ele só jogou assim, jogou, jogou, jogou.

Para ele salvar as coisas que são importantes, ele trabalha de duas formas.

A primeira é que ele faz uma coisa chamada Memory Flush, então quando você tá conversando aqui com ele, se você digitar status aqui dentro, Você vai ver que dentro do status ele mostra, olha, aqui tem o contexto.

Então aqui a gente já usou 96 mil tokens de 200 mil.

Então quando ele chega em 70% do consumo de tokens, ele faz esse memory flush.

É como se ele desse uma descarga na memória. Então ele pega tudo que você conversou aqui e automaticamente ele salva aqui nesses documentos cruz.

Ele joga todo esse lixo aqui dentro, que é onde ele vai ter essa memória dele.

Então, sempre que você estiver falando com ele, você fala com ele assim, lembra do que a gente conversou ontem?

Ele vai falar assim, tá, lembro, porque ele vai ler aqui a memória do dia, do mês e do ano.

e vai falar, tá, li sim. Agora, outra dica que eu dou pra você, porque assim, esse memory flush, às vezes ele não funciona 100% das vezes.

Às vezes não funciona. Então, quando você estiver conversando sobre uma coisa importante com o seu agente, você tem que falar pra ele assim, salva tudo que conversamos até aqui.

Então você fala para ele, salva isso, lembra disso, olha, anota isso aí que a gente estava conversando que isso aqui é muito importante.

Pega essa informação que a gente conversou agora, joga na pasta obra, joga na pasta faculdade, joga na pasta do cliente.

Então você tem que ir direcionando ele aqui dentro, tá vendo?

Então, por exemplo, aqui ele criou tudo que a gente conversou dentro de uma memória aqui chamado decisões.

Então ele tem uma pasta onde ele salva as decisões que você deu para ele.

Então aqui a gente decidiu várias coisas, a gente decidiu o nome dele, decidimos o mapa, decidimos o workspace, então ele salvou isso como uma decisão.

Então você tem vários tipos de memórias, você tem a memória da sessão, Então, o que acontece?

Quando ele acorda, ele lê o memory. Então, ele lê esse arquivo de memória dele. Ele lê 48 horas das últimas notas. Então, ele vai pegar aqui os últimos dois dias. Então, toda vez que ele acorda, ele lê os últimos dois dias e fala, lembrei o que eu estava conversando com o Bruno.

E ele vai ler os mapas. Então, se você falar com ele, lembra daquele projeto daquele cliente que estava falando daquela obra ele vai ler o mapa vai falar a lembrei tá aqui ó sobre a obra x então ele vai ler a memória dele vai associar nas naquela bagunça inteira que estava falando obra x ele vai ler o mapa vai achar a obra x e ele vai falar tá a gente parou aqui falando sobre isso na obra x e sempre que você pegar e falar assim agora salva isso ele vai salvar na obra X.

Então o OpenCLoud é muito inteligente nesse aspecto. Aí o que acontece? Quando você tem aqui, vamos supor, que você está conversando aqui incansavelmente com seu agente, você tá tipo blá blá blá igual a gente tá fazendo aqui nesse minicurso, blá blá blá, falando sem parar.

Uma hora o que acontece é que esse contexto ele estoura Então, diferente do Cloud, por exemplo, eu vou abrir aqui o exemplo do Cloud, né?

Então, o Cloud, por exemplo, quando você clica aqui embaixo, você tem essa janela de contexto, tá vendo?

E a janela de contexto é a mesma coisa que isso aqui.

Mas o Cloud, por exemplo, ou o Chat GPT, eles compactam automaticamente.

Então, você tá conversando, ele pega e compacta e fala, olha, compactei a conversa.

O Open Cloud, ele também compacta automaticamente, mas às vezes não.

às vezes o auto-compact dele não funciona. E o que acontece é que ele começa a ficar lento, ele começa a alucinar, ele começa a esquecer as coisas, ele começa a parar de responder.

E isso é muito comum, porque as pessoas acabam usando muito, principalmente eu, por exemplo, mando muito áudio, fico falando bá, bá, bá, bá.

Você já percebeu que eu falo muito? Então, eu jogo esses áudios ali, e às vezes ele estoura o contexto, buga.

Então o que vocês têm que fazer é sempre que você tá conversando de coisas com ele, você tem que ir falando salve, lembra disso, faz isso e aí quando você terminar o assunto, você terminou o assunto, você vem aqui digita barra nil e aí o que vai acontecer é que ele vai limpar a sessão dele, então ele vai pegar tudo que a gente conversou aqui dentro e ele vai guardar numa Daily Note, então ele vai guardar na memória, mas ele vai acordar e começar do zero.

Então se você pegar e digitar aqui status, você vai ver que ele limpou aqui o contexto dele, agora ele caiu para 19.200, tá bom?

E aí você pode falar para ele assim, lembra do que a gente está conversando no kit, podemos voltar aos passos.

Então assim, se você estiver sentindo dificuldade do seu agente lembrar as coisas, fala pra ele, lembra que a gente falou disso?

Lembra que a gente fez isso? Lembra do projeto? Lembra que tal? E aí ele vai ler aqui ó, pô lembro sim ó, a gente parou no kit com autonomia liberada, workspace organizado, então dá pra retomar os próximos passos sem começar do zero.

Memory, porque ele tá em memory? Porque a gente falou pra ele, salva aí tudo que a gente conversou.

Então ele foi lá e lembrou. Agora, se você tivesse só dado nil e não pedido para ele salvar, você ficava à mercê do seu agente ter inteligência suficiente para salvar as coisas sozinhos, que não é uma boa ideia.

É melhor você vir aqui e você mesmo guiar o seu usuário, seu agente, tá?

Então vamos seguir. Então aqui é só exemplo, tá bom? Outra coisa, Por que a gente pede a chave API?

Porque a gente liga essa memória semântica. A memória semântica é uma busca por significado e não por palavra.

Então, quando você precisa buscar algo, a gente faz com que o seu agente busque de forma semântica.

Então, para você ver se a memória semântica está guardada, a gente pode rodar prompt aqui, quer ver?

Vamos abrir aqui. Memória semântica. Aqui. Então, vamos ver aqui. Vamos pegar em outra conversa aqui. Você está com a sua memória semântica funcionando? Então, você pode perguntar para ele se a memória semântica está ativa.

A memória semântica é que faz a busca pelo significado.

Sim, tem a memória semântica ativa. Então, maravilha, não precisa nem ativar, ele já tá funcionando 100%, tá bom?

Então, blá blá blá, então o que que a gente decidiu sobre o WhatsApp?

Aqui tem exemplo de prompt, né? Aí ele faz uma busca semântica no workspace, ele não busca por palavra exata, ele me responde com data de decisão, raciocínio, onde tá registrado e o que mudou desde então, tá?

Então você tem a memória semântica aqui que você pode usar se você precisar e assim por diante.

E aí lembre-se de novo dos comandos. Então sempre der barra new, sempre der barra compact. Não, peraí Bruno, o que é barra compact? Barra compact é se você tá falando de assunto e ele tá se prolongando muito e você quer compactar aquela conversa para o seu agente não esquecer do assunto.

Então o Barra Compact é o que seu agente vai compactar tudo e ele vai lembrar mais ou menos de onde você estava.

Eu pessoalmente não gosto do Barra Compact porque quando você dá compact muitas vezes, o seu agente esquece das coisas que você estava conversando e ele vai ficando cada vez mais burro.

Então a minha recomendação é você conversar com seu agente mandando ele salvar de tempos e tempos quando são coisas importantes e você depois meter barra new quando você quiser resetar alguma coisa tá aqui no documento ele tá falando para você usar uma skill salvar mas não precisa você pode pedir isso em linguagem natural falando salva isso lembra disso faz isso guarda isso na sua memória salva isso na pasta de projetos pasta de clientes Então você vai direcionando ele mentalmente na organização dele, tá bom?

O que vocês precisarem saber mais sobre memória, tem aqui no material, tá bem completinho aqui, mas o que eu expliquei pra vocês já é o fundamental.

Então lembra de novo que o seu agente, ele tem vários tipos de memória.

e lembra que você tem que fazer higiene de contexto.

Se o seu agente bugar e travar e tiver qualquer problema, entra no seu CLI, que é esse documentinho aqui, tá?

E dá aquele OpenCloud Doctor que a gente te ensinou no começo do curso, tá bom?

Tamo junto! Vamos falar de Skills. Isso aqui é uma coisa muito importante. E esse conhecimento, ele não só funciona para agentes, como funciona para qualquer IA.

Então se você for usar o Cloud, se você for usar o OpenCLAL, se você for usar qualquer outra ferramenta, você tem que entender sobre Skills.

E antes de eu te explicar sobre Skills, eu preciso te explicar conceito muito importante para você entender a diferença de duas coisas.

O que é uma Skill e e o que é Pro.

Então, quando você pede para o seu OpenCloud fazer algo, você está dando prompt para ele, tá?

Então, o prompt nada mais é do que ele é comando.

Então, vamos colocar aqui, comando. O prompt, ele varia o resultado de acordo com a interpretação do agente.

Então, quando você dá prompt para ele, ele vai pegar, ele vai lembrar, ele vai seguir o prompt e vai executar a tarefa.

Então, se você for chegar para ele e falar assim, olha, exemplo, quero que você todos os dias leia as notícias de AI, tá?

Então, vamos supor que você quer que ele todos os dias leia notícias de AI.

Então, você vai passar para ele prompt, vai falar assim, olha, OpenCLAL, Tor, no caso, quero que você leia as as notícias e me traga sumário do que está rolando.

Então o Thor, ele vai chegar pra você, ele vai ler as coisas na internet pra você e ele vai te trazer sumário da forma que ele entender que é o melhor jeito pra você receber esse sumário.

Então, no caso do Thor, ele vai seguir uma ordem.

Toda vez que você pedir uma notícia, ele vai te trazer sumário da forma que ele interpretar que ele deve fazer dessa forma.

Já uma skill, ela é uma série de comandos, uma série de comandos, que ele vai trazer para você sempre o mesmo resultado.

Então a skill ela é muito boa para ela orquestrar atividades.

Então vamos supor que você quer pegar aqui case aqui, tá?

Então vamos pegar esse case aqui ó, o João tem uma agência criativa com cinco pessoas.

Então o João tem uma agência de design, ele tem deve em São Paulo, cinco funcionários, 12 clientes, tudo rodando no Slack, Notion, Figma e Línea.

Então, toda sexta-feira, ele perdia duas horas compilando o que tinha rolado na semana com clientes.

Ele abriu o canal do Slack, copiava as decisões importantes, atualizava o Notion, mandava resumo por e-mail, trabalho braçal, sem alavancagem.

Então, o que ele fez? Foi que ele pegou e criou uma skill chamado Briefings Cliente Semanal.

Então, o que ele fez? O João chegou, entrou com o OpenCloud dele, conectou o OpenCloud no Slack, E aí o João chegou aqui para o OpenClaw e falou assim, ó, quero que todos os dias você, não, quero que você leia estes 3, 4 canais aqui.

E aí o agente do OpenClaw leu o canal e falou assim, li e entendi isso.

Então, quando a gente dele leu e entendeu isso, o João foi lá e falou assim, tá, beleza, agora eu quero que você extraia as decisões.

Então, vamos lá, extraia todas as decisões opa, decisões e revise comigo elas.

Então o OpenClaw vai extrair as revisões, as decisões, e ele vai trazer para o João uma lista, falando assim, olha, isso aqui foram as decisões que vocês tomaram.

E aí o que o João vai chegar? O João vai chegar e falar assim, agora Agora cruza com com o Notion do do projeto e marque o que mudou de status.

Então o João foi lá e colocou uma nova camada, né?

Então vamos colocar que o João fez isso, aí o João fez isso e aí o João pediu para fazer isso aqui, tá?

Então o João foi lá, pegou, falou para ele cruzar no Notion.

e aí a gente falou assim tá mas eu não sei o que tá no notion e tal daí o João falou não peraí acessa a pasta de projetos ABC e aí dentro dessa pasta aqui tá os projetos que você tem que cruzar aqui dentro né e mudar o status então O que que tá acontecendo aqui?

A gente tem uma série de comandos. Então ele tem que ler o Slack, ler 3, 4 canais, extrair as decisões, e no caso não precisa revisar com o João, mas ele tem que extrair as revisões, cruzar com o Notion, ele tem que saber quais são os projetos, então ele tem que ir concateando uma série de conhecimento.

Isso aqui é o que faz uma Skill. Então a Skill é uma série de acontecimentos dividido em passos detalhados que o agente deve seguir para gerar mesmo resultado sempre.

Então, tudo que vocês fizerem de que for repetitivo e que vocês queiram resultado idêntico, tem que virar uma Skill.

Então a Skill é isso aqui, exatamente esse processo. E aí tem uma outra coisa importante, mas Bruno eu posso ter uma Skill que executa Skills?

Uma Skill que orquestra Skills? Sim! Você pode ter uma Skill que ativa outras Skills. Então você pode ter uma Skill que ela vai concateando e ativando múltiplas Skills em paralelo.

Então você pode ter uma Skill que ativa 5 Skills simultaneamente e cada Skill vai fazer uma coisa.

Então você pode ter agente que esse agente invoca cinco sub-agentes, cada sub-agente executa uma skill e traz o resultado perfeito pra você.

Então a lógica é sempre skills, tá bom? Então é muito importante vocês entenderem sobre skills, que é o conceito de skills que eu acabei de explicar.

Então vocês têm que saber as capacidades. Então você pode usar Skill para acessar sites, emitir uma nota fiscal, preencher planilhas, extrair dados de ferramentas.

Então vamos pegar outro exemplo aqui. Você pode pedir para o seu agente ler cinco ferramentas diferentes.

Então vamos supor que você quer que ele leia RP, CRM, o Notion, o Slack, o Linear.

Então você pode pedir para ele ler cinco ferramentas diferentes e ele vai ler.

Então você pode pôr ali a mesma skill para ler tudo isso.

Se ficar muito complexo, você quebra em várias skills, tá?

Então é muito importante isso aqui. Dentro do nosso kit aqui de instalação, a gente já está trazendo para vocês aqui kit de skills.

Então vamos falar para ele aqui, olha, agora Vamos seguir o Wizard.

Tá? Tá? Então, aqui no Wizard, a gente vai ver aqui, você vai ver aqui no Wizard, o nosso Wizard, ele já vai instalar para você seis Skills que eu coloquei no nosso Kit de Largada, tá?

Essas Skills são Skills que vão te ajudar a fazer várias coisas bacanas.

Então, vamos falar aqui, vamos falar. Estamos na aula de Skills, me mostre as Skills que vêm instaladas.

Então agora o que vai acontecer? Dentro do nosso Starter Kit a gente vem instalando para você seis Skills, que é o Super Powers, Criar Skill, Skill Checkup Open Claw, Canvas, Last 30 Days e PPTX.

Então o Super Powers é uma Skill que eu peguei de repositório na internet que se chama Super e esse repositório aqui ele é repositório que já tem aqui 177 mil estrelas e ele é uma ferra uma skill que dá super poderes para o seu agente só que essa skill ela foi feito para você desenvolver como Coding Agent Mas o que eu extraí dessa skill são as habilidades dele trazer o brainstorm.

Então olha só que bacana. A gente já tem aqui essas super powers, tá vendo?

Então fala assim ó, como funciona a skill super power.

power. Então, essa Skill Superpower aqui, tá? Detalhe, né? Aqui ele tá falando que já vem 53 Skills visíveis, mas essas são as Skills que já vêm instaladas no Open Cloud padrão.

Então, essas aqui que eu instalei pra você são Skills que não vêm no Open Cloud padrão, tá bom?

Então, vamos voltar aqui ao Wizard. Olha, ele saiu do Wizard. Aqui ele tá falando que a gente tava seguindo o Starter Kit aqui.

Cadê aqui o que que a gente estava seguindo? Bora Bora para os superpoderes. Então aqui você pode pegar e seguir o Wizard. Se você tiver tendo dificuldade no Wizard, porque está seguindo a aula aqui de novo, O mais importante era você seguir naquela opção de assistir a aula guiada.

Mas nesse caso aqui, o que você pode fazer é chegar para o agente e falar assim, pô, abre o kit na aula Skills.

Então vamos assim, abre o kit porque estou assistindo a aula Skills.

Então a gente pode abrir o Wizard e ele vai abrir referente a aula que a gente tá assistindo aqui, tá bom?

Então você pode usar essas Skills aqui que já veio criados, tá bom?

E aí é só pra você entender o que são essas Skills, tá?

Então a Superpowers que a gente instalou pra você é uma Skill que ele vai te ajudar a fazer Brainstorm quando você quiser criar algo.

ele vai montar planejamento para você e ele vai executar.

Então você diz a ideia, o agente faz brainstorm estruturado, transforma num planejamento e roda os passos.

Substitui o zigue-zague de prompts curtos, tá? Então a gente já coloca aqui. Abrir o kit superpowers nessa aula são basicamente duas frentes, integrações e skills de planejamento, tá bom?

Então vamos fazer teste, ó. Vamos testar a skill de Super Powers. Você já instalou ela? Quero fazer brainstorm sobre projeto de montar dashboard de finanças pessoais.

Então, sempre que você quiser fazer brainstorm, você fala para o seu agente que você quer fazer brainstorm, que você quer debater uma ideia e tal, e ele vai te entrevistar isso aqui, tá?

Então, ó, ele abre aqui as as perguntinhas e aí ele vai colocar aqui, ó, brainstorm pronto para usar, então bora testar agora.

Então, ele tá rodando aqui. Então, vamos lá, responda. qualquer coisa por mim para testar a skill e vamos para a próxima pergunta.

Então colocou aqui dentro. Vamos deixar ele rodando aqui. Tapa 2. Então ele vai para a pergunta 2 e ele vai te fazendo perguntas.

Então no final, quando ele terminar as perguntas, ele vai montar planejamento e vai colocar aqui dentro, tá bom?

Agora criar skill. Então vamos supor que a gente seguiu aqui num passo a passo.

Então você veio aqui no seu agente e falou assim pra ele, olha, quero que você acesse meus e-mails e todos os dias você pegue e-mails de invoices financeiras Audite elas, extraia todo o resultado nessa planilha, aí você coloca aqui, link planilha e faça report final para eu enviar para meu gerente.

Então, por exemplo, você passa esse comando para o seu agente.

E aí seu agente vai falar assim, tá Bruno, peraí.

como é o logo no seu e-mail. Tá, Bruno, peraí, que report é esse? Que invoice é essa? Que planilha é essa? Então ele vai fazer aqui, vai perguntar, ó, preciso acessar o e-mail, preciso acessar a planilha, preciso entender como faz, se é gmail, se não é.

Então ele traz aqui todas as dúvidas dele. Então o que você tem que fazer é passar passo a passo.

Então você Conecta ele no seu e-mail, ou você cria e-mail para ele, que é o que eu sugeri no curso.

Você passa pra ele a planilha, aí você fala pra ele, olha, a planilha são essas colunas, coluna A, B, C.

Aí você explica pra ele, olha, nessa coluna aqui é a invoice, essa aqui é tal.

Então você pode pegar e mandar áudio, olha, pega essa planilha aí, tá vendo ela?

Coluna A, coluna B, faz isso, vai pra lá, etc.

E aí o seu agente vai chegar e aí você vai falar para ele assim, agora eu quero que você pegue a skill, ative a skill, criar skill e cria skills.

Então agora você fala assim, quero ativar a skill, criar skill e transformar todos os passos que fizemos em uma skill.

Aí eu só vou abrir parênteses aqui e falar para ele assim, Nós não fizemos nada, só estamos fazendo uma simulação para o curso.

Então, finja que a gente fez monte de etapas e execute a skill Criar Skills para a gente mostrar como ela funciona.

Então, a gente só vai colocar isso aqui para a gente para ele entender que, na verdade, ele só tem que fingir que a gente fez monte de coisa, mas para ele mostrar para você como funciona a skill de Criar Skill.

Então, a skill de Criar Skill é uma skill que eu montei, tá?

É uma skill que está pública. Então, ela tem aqui, Skill Creator. Então a gente tem aqui o Skill Creator do Bruno Okamoto e a Skill Creator ela está aqui, você pode usar ela para criar Skills e ela funciona em qualquer IA, você pode usar ela em qualquer lugar.

Então ela tem vários formatos de trabalhar, você pode dar barra, criar Skill, blá blá blá, mas como você pode criar aqui e fazer a Skill só dando comando natural?

Então você fala Use o Criar Skills para transformar todos esses passos que a gente fez em uma Skill.

Você pode falar isso aqui para ele, ele vai rodar o Criar Skill, vai transformar todos esses passos.

Então é o exemplo que a gente colocou aqui, fazendo essa simulação, usando o Skill Criar Skills.

Então ele tá fazendo essa simulação, olha só. Boa, rodei a skill de criar skills, entreguei isso aqui, então ele foi lá, montou a skill chamado Invoice Audit Daily e aí o que tem dentro?

Ele criou a skill, colocou referências, colocou template, então ele criou aqui, você vê as pastas que a gente falou antes?

Então ele criou a pasta chamado referências, dentro das referências ele colocou o workflow, colocou o template e ele criou uma pasta chamado Assets, que ele coloca planilhas e coisas, tá bom?

E ele fez commit, quer dizer que ele já salvou isso aqui e aí tá tudo certinho.

Então a skill de criar skill. Agora vamos rodar a skill de checkup do OpenClaw, tá?

Agora eu eu quero que você rode a skill de checkup e faça checkup no nosso OpenClaw.

Aí você pode também rodar essa skill aqui, que é uma skill que eu fiz para rodar checkup e te dar uma nota, diagnóstico do seu workspace, do seu agente.

Então aqui ele vai rodar essa skill aqui de checkup e de novo ele não mexe em nada, 100% no modo leitura.

Então ele vai te trazer, ele vai fazer diagnóstico, ele vai te trazer uma nota, ele vai te dar algumas sugestões de melhoria, que basicamente você precisa chegar pro seu agente e falar, executa tudo aí e resolva pra mim.

E aí o que ele vai fazer é que ele vai fazer backup, óbvio, e vai editar e executar as coisas pra você.

Então a gente deixou essas aqui. Eu coloquei uma skill da Anthropic para fazer artes no Canvas.

Eu coloquei uma skill chamado Last 30 Days. Então se você produz conteúdo ou se você quer saber de uma pauta e quer saber o que as pessoas estão falando na internet sobre essa pauta, você fala para ele rodar essa skill do Last 30 Days e aí ele vai fazer uma pesquisa na internet sobre assunto específico.

E eu deixei aqui também a skill do PPTX. Então, se você quer gerar uma apresentação e você quer criar aqui PowerPoint, Keynote ou Google Slides, ele também consegue trabalhar no PPTX.

Bruno, mas você pegou aqui Skills da Antropic, funciona? funciona, Skills são universais. Então, as Skills da Antropic funcionam no OpenClaw, funcionam no Gemini, funcionam no OpenClaw, funcionam em todos os lugares, tá bom?

E aí, vocês têm aqui vários exemplos, tá? Então, eu deixei aqui dentro do kit, se vocês quiserem, três exemplos de Templates prontos.

Então, vocês têm aqui o Template Report, Template Report Executivo, Material Didático.

Bruno, como que eu faço para ver esses Templates? Chega aqui para o seu agente e fala aqui, O Bruno me disse, no curso, que você tem vários templates de reports.

Você pode me mandar o report comunidade como anexo nessa conversa?

Então, você pode pedir para ele te mandar as coisas.

Então, se você quer que ele te mande alguma coisa, se você quer ver algo, você pede para ele te enviar como anexo.

E aí, ele vai ver, ele vai pegar aqui o report.

Qual é o report? Vou falar para ele assim, esse aqui. É o report executivo. Vou pegar o report executivo. Esse aqui. Então, ele vai procurar o report e vai mandar para você, tá?

Então, vocês têm aqui vários exemplos de reports. Eventualmente, esse report vai aparecer aqui no Starter Kit, mas como a gente quebrou pouquinho a experiência do Starter Kit aqui dentro, a gente não chegou nele aqui nessa aula, tá?

Mas aí tem tudo o que vocês precisam aqui dentro.

Eu deixei aqui uma referência também de três fontes de skills que vocês podem baixar da internet.

Então, vocês têm o Antropic, você tem essa aqui chamado Awesome Open Claw e você tem o Claw Hub, tá?

O Claw Hub é o repositório oficial deles, então aqui é onde tem as Skills do Open Claw, tá?

Mas eu não recomendo vocês instalarem Skills da internet, então a minha recomendação, se você quer, você pega essa Skill aqui e você fala para o seu Open Claw analisar ela, tá?

Então aqui, você vai pegar aqui e falar assim, tá, aqui no caso, faltou o report.

Manda aí. Então no caso, você fala assim, olha, quero que você analise essa skill, não instale ela, e aí você pode pedir para ele analisar essa skill, ele vai analisar a skill e ele vai copiar ela.

Então você não precisa instalar ela, só pede para ele ler, ele vai ler a documentação aqui da skill, aqui ele vai ler toda essa documentação, e aí ele vai fazer uma cópia, ele não vai estalar ela, então você não corre risco grande, porque ele vai fazer uma cópia como se ele mesmo escrevesse, tá bom?

Então ele vai ler aqui ó, resumo curto, é uma skill de auto aprendizado, faz isso, faz isso, o que eu achei bom, o que eu achei fraco, então você quer saber só mais uma curiosidade para a gente fechar essa aula aqui?

Vamos supor que você quer que ele leia essas skills aqui ó, então você chega aqui para ele ó, analisa essas skills, aqui.

Eu quero, Thor, que você analise essas Skills e veja baseado em como a gente trabalha no dia a dia, quais Skills a gente pode pegar daqui para a gente usar na nossa estrutura que você acha que vai aumentar nossa produtividade de nota 8 para nota 10.

Aí você pode colocar isso E aí ele vai analisar as Skills e você pode implementar Skills de novo.

Não instalar elas, mas clonar essas Skills que você achar, tá?

Então ele vai analisar aqui as Skills, ele vai ver bastante coisa e vai te trazer resultado, tá bom?

Aqui ó, de novo, só pra gente concluir, ele não está mostrando o anexo, né?

Então você tem que falar assim ó, manda como anexo ou messages.

Então às vezes o OpenClaw ele não consegue enviar os arquivos para você e você tem que ficar forçando, manda como anexo, manda como mensagem, blá blá blá, mais uma hora vai certo, tá bom?

Então é isso aqui meus jovens empreendedores, vocês precisarem, vocês tem documento completo aqui, bem mais completinho com tudo aqui dentro e qualquer dúvida que vocês tiverem, nós estamos no curso do OpenClaw no Telegram, só entrar lá e estarei te esperando para tirar suas dúvidas.

Tamo junto! Vamos falar de crons e heartbeats. Então isso aqui é muito importante porque isso aqui é o que cria a proatividade no seu agente.

Então eu vou simplificar essa aula da da forma mais simples possível, tá bom?

Então vamos passar aqui pelo material. Então o que vocês vão aprender aqui basicamente? O cron, eles são os superpoderes. O cron é uma automação que você cria no seu agente.

O Chrome é basicamente você pedir para o seu agente, pedir para ele fazer algo recorrente.

Lê meus e-mails, manda uma mensagem, me lembra disso, faz isso, manda uma mensagem, atualiza o CRM, faz follow up.

Então o Chrome é esses agendamentos que a gente faz e eles têm duas características, né?

Eles podem ser por comandos naturais, né? E você pode falar criar, listar, apagar, rodar, blá blá blá.

Como eles também podem ser categorias, né? Então, monitora, pesquisa, estude, sumarize, né? E aí tem vários exemplos de formatos de crons, né?

Inclusive, esses crons, eles funcionam para várias coisas criativas. Então, você pode, por exemplo, falar, todo dia de madrugada, eu quero que você audite tudo que a gente fez no dia.

Todo dia eu quero que você leia as memórias que a gente fez e me proponha uma melhoria.

Todo dia eu quero que você me traga uma ideia da gente desenvolver sistema baseado no que você aprendeu sobre mim essa semana.

Então você pode ser muito criativo. Os crons, no final do dia, eles são sobre criatividade e sobre aonde você quer que seu agente faça as coisas, tá bom?

Então aqui tem as aulas do crons, alguns exemplos, né?

Trabalhar à noite. Então isso aqui de trabalhar à noite é uma coisa que eu faço muito, né?

Então, por exemplo, eu estou gravando esse curso quase meia-noite.

Então se você olhar aqui, eu tenho Chrome que rodou às 11h20, que ele pegou ideias de conteúdo pra mim na internet.

Na verdade, ele pegou ideias do meu WhatsApp. E eu tenho aqui Chrome, por exemplo, que rodou agora às 11h da noite pra sincronizar meu cérebro.

Então ele foi lá, ele deu uma olhada aqui na higiene, ele viu se minhas pastas estavam organizadas, ele arrumou as pastas, ele verificou o que deu errado, o que deu certo e ele fez backup automático.

Então ele deu uma higienização Aqui ele olhou e falou assim, não, olha, suas skills tão boas, seus mapas tão atualizados, suas referências tão certos, seu workspace tá organizado, você teve ideias promovidas.

Então ele me trouxe cinco ideias baseado em coisas que ele viu na minha bagunça.

Ele viu os mapas, falou que os mapas tão atualizados e o meu segundo cérebro tá atualizado.

Tá? Se você não sabe o que é o segundo cérebro, a gente vai chegar lá, não se preocupa.

Então, em linha geral, você pode criar Skills para tudo.

Skills com crons. Então, você cria crons que executam Skills. Então, eu tenho uma Skill de higiene. Então, eu tenho cron que ele roda essa Skill e faz a higiene do meu Workspace.

Então, o céu é o limite, tá? Então, aqui no final do dia, o que você tem que entender é que o cron é uma é comando que você dá para o seu agente simplesmente pelo Telegram, tá?

Se você quer saber quais crons você tem, você fala para ele me listar os crons, apaga os crons, roda os crons, então é tudo por cron, tá?

Então aqui ele trouxe vários crons de exemplos, né? Monitoramento, que é os que eu uso aqui no meu, pesquisa e conteúdo, sumarização, né?

Analisa fluxo, sticks de suporte, newsletter, Então, cara, a gente tem muito aluno que trabalha com TI, então você pode criar cron no OpenCloud que analisa tickets de helpdesk, que analisa relatórios, que analisa pesquisas, que analisa o mercado, que analisa finanças, variação do dólar, sei lá.

Você pode colocar planejamentos, revisão do dia pra ver o que você fez, auditar suas notas, o que você fez nessa semana, tipo, te fazer uma pergunta.

Agendar cron que todo dia, 9 da manhã, me faça uma pergunta sobre mim.

E aí o Thor chega e fala, Bruno quero saber sobre o que você gosta.

E aí todo dia você vai dando contexto, quanto mais contexto mais seu agente aprende.

Então o Chrome ele faz toda essa parte né, ele pode fazer vários trabalhos e tudo mais.

Então aqui eu posso criar Chrome né. Aqui eu vou criar Chrome aqui. Aí ele vai criar aqui. Aqui só detalhe importante, né? Aqui ele tá falando assim ó, sessão isolada. Então a sessão isolada é porque você isola ele nesse canal aqui.

Então se você deixar o Chrome aberto, às vezes ele manda Chrome no canal errado.

Então às vezes você coloca o Chrome aqui no kit, tá bom?

E aqui, às vezes ele pega e te manda no privado.

Aí você fala, pô, mas eu criei aqui Chrome aqui, né?

E aí ele dá, ele fala, não, não, pera aí, eu não isolei.

Aí quando você pede pra ele isolar, ele faz, né?

Aqui da Sparkar, blá blá blá, resolva você mesmo isso e agende o Chrome.

Então, como a gente já ligou aquele YOLO no começo do curso, né, a gente já passou por isso, então a gente fala pra gente resolver isso aí mesmo, tá bom?

Então beleza, aí a gente tem aqui o que acontece quando o cron quebra.

Então os crons quebram, isso é problema. Então às vezes o cron ele para de funcionar, às vezes o cron dá erro, ele retorna erro, uma ferramenta externa que ele conecta, então você quer achar relatório, quer puxar finanças de fluxo de caixa, às vezes você conecta uma ferramenta, a ferramenta Deu algum problema, quebrou, o prompt não funcionou como esperado, não tem auditoria, você só descobre quando alguém reclama ou quando aquele relatório que você precisava não chegou.

Então o que você pode fazer, por exemplo, é ter cron que audita crons.

Então você pode chegar, por exemplo, rodar cron de madrugada ou cron todo dia às sete da manhã, antes de começar o seu dia, que todos os dias ele vai checar todos os crons que rodaram nas últimas 24 horas listar os que deram ok e falar para você quais falharam e você inclusive pode falar para ele corrigir automaticamente e trazer eles 100% verificados e funcionando tá então você pode colocar isso aqui aqui ele fala o comando de terminal mas enfim você não precisa disso aqui né E aí a gente entra dentro de Heartbeat.

Heartbeat é outra coisa que o Cloud, o chat GPT e outras IAs não entregam.

Eles são orquestradores de agente, no caso isso aqui é o que faz o agente funcionar.

O Heartbeat é documento chamado heartbeat.md que ele fica batendo de hora em hora, como uma batida de coração.

Então, ele é pulo periódico, né? Então, a cada minutos, a cada X minutos, ele recebe uma batida.

E aí, ele acorda e ele fala assim, tá, tô vivo, o que eu preciso fazer?

Então, você pode colocar esse Heartbeat para ele fazer coisas específicas.

Então, aqui no nosso minicurso, eu configurei o Wizard, lá no nosso kit, para ele criar esse documento chamado Hot.

E esse documento chamado HOT é tudo que o seu agente vai acordar de hora em hora e ver se você está cumprindo, se está atrasado ou não.

Então você pode colocar de hora em hora para ele olhar coisas importantes para você.

Então você quer, por exemplo, que de hora em hora ele olhe seus e-mails, você quer que de hora em hora ele olhe sua agenda, você quer que de hora em hora ele olhe algum Chrome, que ele olhe alguma Skill, que ele olhe algum grupo de WhatsApp, que ele olhe alguma ação.

Então você pode colocar, inclusive se você tem múltiplos agentes, você pode colocar de hora em hora para ele ver se os outros agentes estão trabalhando.

Você pode colocar para ele fazer de hora em hora, para ele pegar Kanban, que tem várias tasks ali no Kanban, e de hora em hora ele acordar, pegar uma task e executar.

Então você pode literalmente deixar o seu agente trabalhando e desenvolvendo software de ponta a ponta só com o Heartbeat, então ele de hora em hora você fala quero que você acorde, lê o Kanban, pega card, executa, roda QA para ver se ele rodou bem, faz commit, por exemplo.

Então você pode criar pipeline inteiro e colocar esse Heartbeat de hora em hora.

Então qual que é a diferença do Heartbeat e do Chrome?

O Heartbeat ele roda de tempos em tempos, o Chrome é onde você agendar, O Heartbeat faz várias múltiplas pequenas checagens, então ele faz múltiplas pequenas tarefas.

O Chrome é uma task isolada. O Heartbeat usa o contexto de mensagens recentes, então ele sabe do que você estava falando.

Já o Chrome usa uma seção isolada. O Heartbeat, ele é mais caro. Só que no caso, como a gente está usando assinatura, não faz diferença.

Agora, se você usar API, é bom você usar modelo menor de LLM, então você colocar lá, sei lá, GPT 5.4 mini, mas você não rodar o 5.5, por exemplo, para fazer Heartbeat, porque ele vai ficar de hora em hora.

Então se ele ficar de hora em hora rodando, você vai estourar seu plano muito rápido.

Então é bom você colocar plano menor. Bruno, como eu faço isso? Você fala assim, olha, Thor, para os heartbeats eu quero que você configure para você rodar eles no chat gpt 5.4 mini e quero que você verifique se os heartbeats eles estão batendo de hora em hora ou a cada 30 minutos e se eles estão puxando o documento hot e o que que ele tá puxando, me dá mapa aqui do heartbeat, então você pode colocar isso aqui por exemplo O Thor vai pegar isso aqui, vai analisar o Heartbeat, você pode seguir o que eu sugeri aqui, você pode deixar esse hot, que é o que ele vai ficar vigiando, por exemplo.

Porque é muito melhor você deixar arquivo onde você pode manusear ele muito fácil, do que você ficar acessando o Heartbeat, que é o coração do seu agente, e ficar enfiando e tirando coisa lá dentro.

Então, isso aqui foi uma estratégia que eu tive aqui de diminuir as edições que você enfia a mão no coração do seu agente, tá bom?

E aí, aqui tem algumas ideias de heartbeats, né? Inbox, calendário, menções, menções em redes sociais, pendências paradas, manutenção de memória, previsão de tempo, tipo, se for chover, me traga, me fala pra levar guarda-chuva, me lembre de tomar água a cada uma hora, veja notícias, analise criptos, faça qualquer coisa.

e aí o que você o que vai acontecer é que ele vai ficar quieto se não tiver nada novo e se tiver alguma coisa ele vai te responder tá então você não tem nada da última checagem ele vai ficar em silêncio aqui tá bom então aqui é uma aulinha de heartbeat aqui estão os comandos de open close você precisa rodar alguma coisa no CLI mas tudo muito certinho, tudo muito simples e no final do dia lembre-se que o que conta para Chrome e para Heartbeat é muito mais a sua criatividade, aonde você vai colocar as coisas, do que qualquer coisa.

E é isso aqui no final do dia, é esse Chrome e esse Heartbeat que vai fazer o seu agente ganhar vida.

E esse aqui é o coração, literalmente, do seu agente.

Então use ele com sabedoria. E use os próprios crons e os heartbeats pra auditar o seu próprio agente.

E se você tem múltiplos agentes, use os crons pra auditar todos os seus agentes.

Então se dia você escalar e ter múltiplos agentes na sua operação, não se preocupe em ter humanos auditando seus agentes.

Você pode deixar os crons auditando os agentes. Então, tudo pode ser feito por agentes. Em 2026, o Chrome Heartbeat é o que faz essa máquina girar.

Tamo junto! Vamos falar sobre segurança. Então essa é uma aula importante para você entender pouco como você se precaver de algumas coisas importantes, tá?

Então, vamos voltar aqui para o Play. O que você vai aprender nessa aula? A gente vai falar sobre o Gate de ação, tá?

Então, como que funciona essa questão de senhas, chaves APIs, canais públicos, né?

O que acontece se você conectar o seu OpenCloud no WhatsApp, usar ele como SDR, pôr ele em comunidades, né?

O que vai acontecer? Como que funciona o Prompt Injection? A gente vai falar sobre cofre, então como você pode fazer para você deixar suas senhas e suas chaves APIs tudo muito mais organizado.

A gente vai falar sobre bancos de dados e APIs.

Então isso aqui, por exemplo, é erro que eu cometi no meu OpenCloud quando eu comecei, que no caso eu deixei o meu OpenCloud com acesso direto no meu banco de dados e ele pode fazer cagada.

A gente vai falar sobre os grupos de Whatsapp, né, que muita gente quer usar o OpenClaw no Whatsapp, então vamos dedicar essa tópica sobre o Whatsapp e até usar o meu exemplo aqui, né.

Então, por exemplo, o meu OpenClaw aqui, né, como que ele se, como que a gente pode precaver da gente sofrer aqui algum tipo de ataque ou qualquer coisa.

Vamos falar sobre Prompt Injection e vamos falar sobre Recovery, né, o que acontecer aqui se der merda, né?

Qual que é o plano B aqui, tá bom? Então, vamos voltar aqui pra nossa aula aqui. Há cinco frentes onde os agentes de IPMS quebram. Então, os alunos das pequenas e médias empresas, no caso, são você, né?

Então, o que acontece aqui dentro? Então, secrets, APIs e bancos e tudo mais. Então, vamos falar primeiro dos secrets, tá? Então, o que eu recomendo pra vocês recomendava no minicurso original aqui no V1, no V2 eu vou recomendar também, é que vocês usem o 1Password, tá?

Então o que eu recomendo que você faça é que você assine o 1Password.

Então aqui no meu caso a gente usa o 1Password, tá?

Então a gente pode vir aqui os planos, a gente tem aqui o plano aqui de Password Manager, E eu recomendo aqui vocês pegarem o monthly, é o que eu pago, ele só tem em dólar, infelizmente, e aí você tem a opção de pagar aqui de 5 dólares aqui para individual ou para família 8 dólares, tá?

Então se você quiser pegar o anual, aí vale muito a pena, eu assino o anual, então o anual fica 240 vezes 12, né?

Então fica 30 dólares por ano, 120, 130 reais, tá?

Então no caso eu recomendo muito você assinar o 1Password, tá?

Então eu tenho aqui o 1Password também. E aí o que que você faz? No 1Password você pode criar cofre dedicado para o seu agente.

Então, de vez você ficar jogando todas as chaves dentro desse arquivo.env, que é onde é o documento padrão, né?

Então, esse.env é onde o seu OpenCloud, por padrão, guarda as chaves APIs, guarda as senhas e tudo mais.

Então, tudo que você colocou aqui, chave API, Brave, GitHub, Stripe, blá blá blá, ele joga nesse.env.

E isso não quer dizer que você não está seguro.

Você está seguro, você está dentro de Docker isolado na Hostinger, então a chance disso dar problema é muito baixa, para não dizer zero.

Mas o problema é que, por exemplo, se você quer acessar as suas senhas em múltiplos agentes, ou você quer levar essas senhas do OpenCloud para usar no Cloud, para usar no chat GPT, para usar no Gemini, você tem que ficar colocando todas as vezes as mesmas senhas em todas as LLMs.

E aí, você meio que vai perdendo o controle disso.

Então, é melhor você ter aqui cofre dedicado. Então, o que você tem que fazer no OnPassword, tá?

É você literalmente aqui criar uma conta. Então, eu vou começar aqui. Vamos fazer isso aqui agora. Aqui a gente já tem conta aqui. Então, eu vou logar na minha conta. No caso, eu estou entrando com a conta da minha gente aqui, né?

Então, vamos colocar aqui a minha conta certinho. eu acho que eu tenho a identificação dos fatores não então aqui ó eu tenho o cofre da mora tá vendo então você pode vir aqui no cofre então você cria cofre então vamos porque você assinou a ferramenta você cria cofre então você criou o cofre aqui para ela vou carregar aqui o cofre da mora tá então aqui tem todas as senhas ó todas as chaves apis todas as senhas tudo bem organizadinho são coisas que o meu agente foi criando e gravando aqui então uma vez que você criar esse cofre aqui você vai em Não é em configurações, vamos ver onde é.

é isso tá então uma vez que você criou isso aqui vocês vão ali em volts então a gente tem aqui a mora volt tá vendo aqui a mora volt vocês têm aqui esses integrations então você cria aqui esses integrations Então, você pode compartilhar esse cofre com seu agente diretamente, como você pode criar uma integração.

Então, basta você vir aqui em Integrations, você cria essa integração aqui, tá?

Então, você vem aqui, desculpa, em Developer, né? aqui em Developer, você vem aqui em Service Accounts, aí você vem aqui em New Service Account, aí você coloca aqui, tipo OpenCLoud, Aí você vai em Next, aí você coloca o cofre que você quer compartilhar, aí você deixa ele só como Read, no meu caso eu recomendo você deixar como Write, né, porque ele também tem que salvar coisa, não adianta ele só ler e só salvar.

Aí você vai em Próximo e você cria esse ServiceVault aqui, tá?

Então a gente vai criar esse ServiceVault de teste, aí ele criou aqui o Token, então o que você vai fazer?

Caramba, vou chegar aqui para o seu agente. Vou colocar aqui. Vou falar assim, vamos dar nil aqui, porque a gente vai começar uma conversa nova.

Então deixa ele dar uma resetadinha. Bom, ele resetou. Aí você fala assim, seguinte, Thor, eu criei uma conta no 1Password e eu vou te passar agora Service Token que a gente vai substituir e vamos salvar todas as senhas e chaves APIs e tudo lá como padrão.

Então, eu quero que você sempre use esse Service Token e use o 1Password como default para salvar todas as senhas e tudo.

Então, tudo que você tem agora no seu Workspace de senhas e chaves APs e qualquer coisa, eu quero que você salve dentro do 1Password e daqui para frente, tudo que você tiver de senhas e acessos de chaves APs e qualquer coisa, que você use sempre esse 1Password.

Se você tiver qualquer dúvida, me aí você passa aqui para ele essa senha maluca aqui e aí o que ele vai fazer é que ele vai colocar tudo para você tá então primeiro ele ele vai ver se tem password né se tem uma integração do password e aí no caso ele não tem a integração aqui mas ele consegue fazer via CLI tá CLI tá E aí ele vai instalar esse CLI.

Pode ficar tranquilo. Vou revogar. Só instala e e testa. Então, enquanto isso, eu vou revogar essa integração aqui. vamos voltar então esse aqui tá é muito bom esse aqui Pô, ele tá pedindo token de novo, rapaz?

O nome do Vault é Amora Vault, tá? Então, aqui de novo. E aí, você conseguiu colocar a One Password, tá bom?

Então, vamos voltar aqui para a nossa aula aqui. Então, isso aqui é muito importante, tá? Coloquem sempre isso aqui. Eu recomendo que vocês também salvem todas as chaves API e tudo mais lá dentro, tá?

Agora Agora a próxima coisa que eu quero conversar com vocês é sobre chaves APIs.

Então, que é conexão com bancos de dados e com qualquer coisa perigosa.

Então, sempre que você for lidar com uma chave API, vocês têm que trabalhar sempre como read-only.

Então, se você quer que, por exemplo, o seu OpenCLoud acesse CRM e que ele atualize as coisas para você, que ele faz tudo automático, Primeiro você tem que colocar ele como Read Only.

Então, primeiro você tem que colocar ele para monitorar as coisas e para ele ser muito cirúrgico no que ele fizer.

E que você tem que colocar lá que ele não pode sair mexendo em nada, que ele tem que aprovar, que você tem que colocar uma aprovação quando ele for mexer em alguma coisa e assim por diante.

Então, qualquer coisa que você for mexer em API, é muito importante você mandar a documentação para ele, tá?

Então, eu vou pegar, por exemplo, a documentação da Hotmart que eu estava trabalhando esses dias aqui.

Então, por exemplo, eu quero que meu agente use a API da Hotmart para puxar para mim as métricas de quem comprou o meu minicurso e de quantas pessoas assistiram as aulas e qual que está a minha taxa de progresso e tudo mais.

vamos chamar aqui de APIs. Leia esta documentação. Quero que você aprenda tudo sobre a API da Hotmart.

vou te passar a chave API da Hotmart para a gente extrair algumas informações.

Por exemplo, o primeiro passo que eu recomendo vocês fazerem é vocês sempre passarem a documentação da API para o seu agente.

Então, manda a documentação. Tipo, Bruno, não tem API. Puts, aí complicou. Aí a gente tem que voltar para o modelo de entrar no navegador e pedir para o seu agente entrar lá e acessar o site, se o agente consegue.

Então, ele tá vendo aqui, ele tem browser. Então ele vai lá, ele abre o browser dele, ele vai lá e faz e guia isso aqui, tá bom?

Então você pode pedir para ele ler aqui as APIs e sempre como Read Only.

Outra coisa que é muito importante é banco de dado.

Banco de dado é muito importante. Banco de dado tem que ser Read Only. Então, se você for acessar banco de dado de alguma informação da sua empresa, deixa só como leitura.

Então, cria token. No meu caso, eu uso o SupaBase. Então, você cria token do SupaBase que deixa só como leitura, não como write, que é escrever.

tenta sempre colocar scope mínimo, né? Então, por exemplo, o agente que lê calendário, ele não precisa do token com acesso ao Google Drive.

O token do GitHub para ler repositório público não precisa do scope de admin.

Então, toda vez que você for criar uma função de acesso para uma API específica, limita as funções que são realmente necessárias, não precisa pôr tudo, porque a gente normalmente vai lá e fica pondo tudo, então limita ao escopo mínimo tá, e banco em produção nunca, nunca coloca o agente conectado numa API num banco em produção, tá bom?

Então é isso gente, eu acho que a gente passou aqui essa parte aqui de APIs e bancos de dados, eu já reforcei para você.

Questão do ano password, acho que isso aqui é muito importante, tá bom?

dica bônus. Quando você pedir para o seu agente ler uma API, fala para ele criar mapa.

Então fala assim, agora que você leu a documentação, cria mapa dessa API para a gente navegar mais facilmente.

Então se você tem CRM, vamos supor que você usa o HubSpot e você quer que o seu agente atualize o CRM todos os dias com leads que estão sem fazer follow-up há mais de sete dias e te traga relatório.

Então nessa skill você pede pra ele acessar o HubSpot via API, ele acessa lá, ele vê os deals que estão mais de sete dias e tal, e aí com essa skill ele traz isso pra você.

Então o que você pode falar pra ele, a primeira vez que você for acessar o HubSpot, é falar assim, olha, acessa aqui, leia toda a documentação do HubSpot.

Ele vai ler assim. Aí você vai falar assim, olha, agora eu quero que você crie mapa completo do CRM, como ele funciona.

Então, quando você chegar e criar skill, falando, olha, eu quero que você acesse essa API, vá ali dentro do CRM, atualize o card, faz isso, aí você fala pra ele, não só faça isso, como usa o mapa como referência.

E aí ele vai pegar, vai ler o mapa e vai falar, pô, já sei onde tá, já sei o que fazer e a chance dele errar é muito menor e a sua skill vai ter muito mais assertividade, você vai gastar muito menos token.

Então usa mapa também, com APIs, com bancos, com qualquer coisa, qualquer coisa cria mapa, tá?

E aí pra gente caminhar aqui, vamos falar de canais públicos.

Então qual é o problema de você conectar num canal público, tá?

O canal público, ele tem problema que é o seguinte, Se você coloca o WhatsApp pra você colocar ele como SDR, você usa ele, você quer colocar pras pessoas falarem com ele, ele funciona muito bem.

Então se você coloca ele no Slack pra sua equipe usar, ele vai funcionar.

Se você coloca ele no Telegram, ele vai funcionar. Agora se você coloca ele no WhatsApp, é diferente. O WhatsApp, ele fala com as pessoas sozinho, ele manda mensagens em grupos, mesmo você colocando proteções.

Então no Telegram é mais fácil de blindar isso, a PI dele funciona muito bem, ele já foi feito para botes, o WhatsApp não foi feito para botes.

Então o WhatsApp, ele é difícil. Então no meu caso, o que eu faço? Eu uso o meu agente para ler minhas conversas do WhatsApp.

Então se você olhar aqui, ele lê as conversas do meu WhatsApp, quer ver?

Então ele leu aqui as conversas do meu WhatsApp aqui e ele falou, olha, você tem aqui novas pessoas falando com você e aí ele pergunta se essas pessoas aqui entram no meu CRM.

Então no meu caso eu construí CRM que ele fica lendo as conversas no WhatsApp e quando eu aprovo a pessoa e ela salva todas as conversas dessa pessoa.

Mas para você construir uma estrutura que escuta as pessoas, que você só quer escutar e digerir mensagens, eu recomendo você montar uma arquitetura fora do OpenCLoud.

Então no meu caso eu uso N8n. Bruno, eu não sei usar N8n. Não se preocupa, o OpenClaw sabe, então pede pra ele que ele te ajuda.

Agora, se você quer montar OpenClaw no WhatsApp pra qualificar lead, pra falar com as pessoas, pra fazer tudo mais, você tem risco muito alto do seu OpenClaw, às vezes, alucinar, de às vezes ele mandar mensagem em grupos, de às vezes ele fazer coisas erradas.

Então, assim, tem como você configurar ele pra ele falar.

Mas se você quer só escutar, é fluxo e eu recomendo você não usar o OpenClaw só para escutar, porque ele manda mensagem.

Agora, se você quer usar o OpenClaw para falar, você pode criar uma arquitetura que ele faz e funciona e fala, tá?

Então, no meu caso, a gente tem o OpenClawzinho, que é o nosso agente aqui do nosso curso e o OpenClawzinho tá aqui o dia inteiro falando com as pessoas dentro do grupo aqui, tá?

Então, o OpenClawzinho tá sempre funcionando e ele tá sempre trabalhando muito bem.

Só que qual que é o ponto? Isso aqui é importante. O Open Clause está em ambiente controlado. Então, as pessoas que estão falando aqui, eu estou lendo as conversas.

Então, não tem ninguém aqui tentando jogar Prompt Injection aqui para zoar o Open Clause, porque isso aqui é grupo público.

Agora, se o Open Clause caísse na boca do povo e todo mundo começasse a mandar mensagem, E ele tem aquele allow list que a gente falou lá na aula do Telegram, que ele permite receber mensagens de qualquer pessoa, porque você deixou liberado, porque você queria que a sua família mandasse mensagem, você queria que seus funcionários mandassem mensagem, daí você liberou geral, se ele cai na boca do povo, Cara, as pessoas começam a mandar mensagem pro seu agente.

Seu agente sai fazendo as coisas. E aí seu agente vai fazer merda. Seu agente vai escutar informações, vai encher a memória dele de porcaria.

Se você põe ele num grupo do WhatsApp, ele vai salvar monte de porcaria na memória dele.

Então é muito importante você entender que você deixar ele pra escutar e deixar ele pra falar são dois desafios estruturais que eu recomendo que você estude muito bem como fazer isso.

Eu não vou te ensinar isso aqui no minicurso, porque senão vai deixar de ser minicurso e vai virar uma baita de uma arquitetura técnica.

mas você pode pedir para o seu agente te ajudar com tudo isso, manda o material para ele e ele te ajuda, tá bom?

Então isso aqui é muito importante, muita atenção quando for usar o OpenCloud como agente de SDR, de suporte e tal, que você tem que criar uma estrutura muito sólida para ele de Prompts, de escopo limitado, criar Crons para monitorar as conversas, criar Reports em cima das conversas, criar alertas, que se ele sair da conversa, se ele se perder, ele tem que avisar você, então você tem que fazer trabalho muito bem feito de arquitetura aqui dentro, tá bom?

Então, Prompt Injection, basicamente, é o seu agente receber uma instrução maliciosa.

Então, isso aqui é meio difícil a gente se blindar 100%.

E isso aqui não é nem trabalho do OpenClaw fazer isso.

Quem tem que blindar o OpenClaw é o próprio chat GPT, é o próprio Antropic.

Eles têm que blindar a LLM deles de Prompt Injection.

Então é muito comum, por exemplo, você às vezes receber e-mail de alguém tentando manipular o seu OpenClaw.

Então se o seu e-mail do seu OpenClaw é público, você corre uma grande chance de alguém tentar manipular ele.

Você deixa ele público, que qualquer pessoa pode mandar mensagem.

Pessoas desconhecidas vão mandar mensagem. Você deixa ele lendo documentos. Então você pega lá, ele abre todos os e-mails que ele recebe, ele lê todos os PDFs, lê todas as transcrições, lê todos os documentos.

Você corre o risco de Prompt Injection. Você pede pra ele fazer Scrapping de páginas de Deep Web, de páginas.

Então exemplo de Deep Web é ruim, mas de páginas complexas, páginas que você não conhece e tal, ele pode acessar uma página e receber Prompt Injection.

se você pega arquivos no Google Drive e tal de terceiros, se você pega qualquer outra coisa de pessoas que passam instruções, então, assim, é difícil, né?

O que você pode fazer de defesa, que é o que a gente recomendou, é colocar isso aqui no soul do seu agent, então você pode copiar esse prompt aqui, tá?

E você pode passar para o seu agent, então, você vem aqui, vamos colocar aqui, você coloca aqui ó, defesa contra input externo, Então você fala, olha, atualiza seu sou, né?

Aqui no caso eu esqueci de falar isso. Então, atualiza atualiza seu sou com essa informação. Boa! Então, a gente vai atualizar o arquivo raiz dele. Então, sempre que ele acordar, ele vai tratar isso aqui como uma verdade absoluta, tá bom?

E aí, por fim, o último ponto é Recovery. Então, se qualquer coisa acontecer de errado e você não quer descobrir o caminho, então, vazou uma senha, que nem eu agora, tô librando monte de Token pra vocês e mostrando chave API da OpenAI, mostrando monte de coisa, então, vocês podem revogar as coisas, tá?

Então, aqui tem quatro botões que vocês podem usar para revogar, tá?

Então, isso aqui são sinais de coisas que podem ter vazado.

Então, como você pode fazer para revogar as coisas? Eu deixei esses comandos aqui embaixo, você pode revogar, mas tem uma coisa importante, tá?

A Hostinger, na data de gravação desse vídeo, ela não tem essa funcionalidade, mas eles vão ter daqui a alguns dias.

que é você poder criar snapshot do seu OpenCloud do Manage, que é essa estrutura que a gente tá gravando aqui.

Esse snapshot permite que o seu agente salve uma foto do servidor.

Então, se dia der merda, e alguma coisa quebrar, o seu problema, vazou alguma coisa, quebrou alguma coisa, você consegue salvar fotografias da estrutura do seu servidor, tá?

Então isso aqui é uma feature, uma funcionalidade que em breve vai se liberar na Hostinger, que é bom vocês saberem, tá bom?

Então é isso gente, de novo, tá aqui tudo certinho, material bonitinho, completinho, tudo que vocês precisarem, vocês podem ler o material, senão nós estamos aqui no grupo do OpenCloud.

Tamo junto! o último ponto é Recovery. Então, se qualquer coisa acontecer de errado e você não quer descobrir o caminho, então, vazou uma senha, que nem eu agora, tô librando monte de Token pra vocês e mostrando chave API da OpenAI, mostrando monte de coisa, então, vocês podem revogar as coisas, tá?

Então, aqui tem quatro botões que vocês podem usar para revogar, tá?

Então, isso aqui são sinais de coisas que podem ter vazado.

Então, como você pode fazer para revogar as coisas? Eu deixei esses comandos aqui embaixo, você pode revogar, mas tem uma coisa importante, tá?

A Hostinger, na data de gravação desse vídeo, ela não tem essa funcionalidade, mas eles vão ter daqui a alguns dias.

que é você poder criar snapshot do seu OpenCloud do Manage, que é essa estrutura que a gente tá gravando aqui.

Esse snapshot permite que o seu agente salve uma foto do servidor.

Então, se dia der merda, e alguma coisa quebrar, o seu problema, vazou alguma coisa, quebrou alguma coisa, você consegue salvar fotografias da estrutura do seu servidor, tá?

Então isso aqui é uma feature, uma funcionalidade que em breve vai se liberar na Hostinger, que é bom vocês saberem, tá bom?

Então é isso gente, de novo, tá aqui tudo certinho, material bonitinho, completinho, tudo que vocês precisarem, vocês podem ler o material, senão nós estamos aqui no grupo do OpenCloud.

Tamo junto! Boa, vamos falar sobre uma coisa importante, que é como você conectar o seu OpenClaw em outros canais.

Então essa é uma aula bem curta e bem fácil, na verdade, que é o seguinte.

Então o que você tem que fazer é que você pode usar outros canais para fazer outros tipos de comunicação.

Então vamos supor que você está usando o Telegram, eu pessoalmente gosto muito de usar o Telegram, mas você quer pôr o OpenClaw no seu Discord, porque você quer ter vários canais, você quer ter uma visualização melhor no computador, Você quer falar por thread, né?

Você quer ter aquelas threads bonitinhas. Então você quer conectar em outros lugares. Então o OpenClaw, ele conecta em 26 canais nativos, tá?

Então o que você pode fazer é simplesmente jogar esse prompt pra ele, que basicamente eu acho que a grande diferença desse prompt de você simplesmente jogar aqui e falar, conecta no Slack, é que você passa a documentação oficial pra ele.

Eu acho que isso ajuda muito quando ele lê a documentação oficial, porque ele sabe exatamente o passo a passo pra conectar aquele canal, tá?

Outra coisa importante é que você pode conectar o canal para propósitos diferentes.

Então você pode usar o Discord para a empresa, o Telegram para o pessoal, você pode usar o Slack com seus funcionários e Mas aí você vai falar, mas Bruno, como que eu vou usar o mesmo agente em duas plataformas diferentes?

Então tem duas formas. Uma eu vou te ensinar agora, a outra eu vou te ensinar na aula de multiagentes.

Então, o que você pode fazer agora é que você pode pedir para o seu OpenClaw se comportar de uma forma diferente em outro canal.

Então, se você põe no Slack, você pode falar para ele que o Slack é só para trabalho.

Então, que tudo que acontecer no Slack é só profissional, então ele tem que ter outra personalidade lá.

Ele não pode falar palavrão, ele tem que ser educado, ele tem que ser gentil, tem que tratar as pessoas bem, por exemplo.

Então ele vai usar a mesma estrutura dele de memória e tudo mais, mas tudo relacionado ao Slack, ele vai interpretar e lidar com outras coisas de forma diferente.

Ponto de atenção. Isso significa que tudo que falarem para ele no Slack vai ser salvo na memória dele do dia-a-dia e o que eu falar para ele vai ser salvo na memória do Slack?

Sim, tudo é o mesmo ambiente. Então se você quer criar dois agentes diferentes, TOR corporativo, aí você tem que assistir aula de multi-agente.

Mas o ponto é que se você quer usar o mesmo agente, Porque você tem uma empresa pequena, 5, 6 pessoas, e você quer pôr agente para fazer a gestão da empresa inteira e também você usar ele no seu dia a dia, porque você é o dono da empresa, você pode fazer ele aqui no Telegram e no Slack você põe ele lá e fala, ó, você é o autor corporativo aqui, seja educado com as pessoas.

E aí funciona super bem, tá bom? Então, de certa forma, é isso aqui, tá? Só mostrando pra vocês aqui brevemente. Então eu também uso o Slack aqui pra conversar com meus agentes e tal.

Mas como você pode ver, eu não falo com ele desde o dia 4 de abril, porque eu pessoalmente gosto muito do Telegram.

E aqui no Telegram eu tenho todos os grupos, inclusive o grupo dos meus sócios, o grupo da minha empresa, tudo aqui dentro.

Então o Telegram funciona muito bem pra gente, mas você pode usar de novo esse multicanal de forma estratégica, né.

Então você pode usar pra pessoal, pode usar pra trabalho, né, você pode criar de várias formas, tá.

Então, isso aqui é muito importante. Se você travar em qualquer lugar, aqui tá aqui os caminhos que vocês precisam fazer para destravar, tá?

De novo, cuidado com o OpenCloud em grupos de WhatsApp.

Então, ele funciona, mas o WhatsApp, ele é meio truncado a experiência.

E, de novo, se você deixa o seu OpenCloud controlado no seu WhatsApp, ele, às vezes, pode mandar mensagem errada, fazer umas coisas erradas.

Então, do canal WhatsApp. Poucos ou o único canal que não performa 100% numa experiência agêntica no OpenCall porque o WhatsApp não foi feito para agentes.

Agora o Discord tem API muito boa, o Slack tem API muito boa, o Telegram tem API muito boa.

Então nesses canais ele funciona muito bem, tá bom? Então se você precisar de qualquer dúvida, estamos no mini-grupo ali do Telegram e é só entrar lá, chamar e estou à disposição para te ajudar.

Tamo junto! Essa é uma aula muito importante, porque a gente vai falar sobre integrações.

que é onde a gente começa a dar superpoderes para o seu agente.

Então, se você estiver seguindo o Wizard, que é o nosso Starter Kit, aqui, esse poder aqui, os superpoderes, como a gente chama, eles já acontecem logo no início.

Eu que pulei aqui ele, mas eu pedi para ele voltar aqui para a gente seguir isso aqui.

Então, fica a dica aí, quando você quiser, você pode pedir para o Wizard voltar para a aula aqui, tá?

Mas essas integrações, ela é muito importante Principalmente porque aqui é onde acontece a mágica do seu agente.

Então, quando seu agente se conecta nas coisas ao redor dele, ele começa a trabalhar por você e entrar no operacional das coisas.

Isso é muito, muito gostoso. Então, por exemplo, Você tem que ter trabalho de atualizar planilhas, atualizar sistemas, atualizar fluxos, você tem que fazer relatórios, você tem que fazer atividades em múltiplas ferramentas o dia inteiro.

Às vezes usar ClickUp, às vezes usar Notion, às vezes usar GitHub, CRM, enfim, você entendeu a fotografia.

E quando você pluga o seu agente lá dentro, ele faz tudo isso por você pelo Telegram.

Isso é muito mágico, é maravilhoso na verdade, tá? Então, a frase que o Amora colocou aqui ó, ele não está descrevendo o Notion, ele está no meu Notion e é realmente isso que acontece.

Então, vamos falar pouco do que que rola aqui, tá?

Então, existem aqui primeiro a tese de operar via API.

Então, vamos direto para o primeiro bloco aqui. Falar e não é operar. O Cloud Agent fala. Chat GPT puro responde quando você chama, dá conselho, escreve texto.

Agora, agente conectado é outra categoria. Ele lê o calendário, escreve no Notion, abre PR. É, tudo bem. O Cloud faz isso também, de certa forma, mas o legal disso é que eu acho que a grande mensagem é a autonomia, né?

Então quando você junta crons, com rotinas, com skills, aí você tem essa autonomia de fazer as coisas aqui, tá?

Então é muito legal isso aqui dele ter funcionário digital integrado que ele literalmente faz as coisas para você.

Nós temos quatro pradões de OAuth, de assinatura. Então, o agente tem quatro formas de se conectar e se integrar em ferramentas.

Ele tem token simples, que é chave API. Então, a gente já falou sobre isso antes. Então, tudo que tem uma API, basicamente, seu agente consegue conectar.

Então, o Notion tem API, GitHub tem API, tudo mais.

Agora a gente também tem ferramentas que precisa se conectar por fluxo de login, então Spotify, HubSpot, Twitter, tudo bem que o HubSpot também tem API né, mas assim tem alguns que ele tem esse fluxo de browser, que ele recebe esse access token que quando ele dá refresh ele expira de vez em quando.

A gente tem o CLI, que é o que a gente instalou aqui antes também.

O CLI é uma forma autêntica via browser. Então o Google Workspace, por exemplo, para você instalar calendário, o Google Drive e tal, ele funciona via GOG CLI.

Então é como se ele instalasse terminal para ele rodar isso de certa forma.

Então esse CLI é terminal específico para essa ferramenta. E aí você tem IMAP e SMTP, mas eu não recomendo muito e eu eu nem uso pessoalmente isso aqui então ele funciona mas eu não acho muito útil em 2026 você por esse caminho tá bom então vamos pegar aqui o Notion via API então vou pegar exemplo para vocês tá o Notion se a gente abrir aqui o Notion aqui agora então o que você tem que fazer sempre quando você vai conectar uma chave API lembre-se meu jovem padawan de fazer seguir esse conselho que eu tô te dando aqui que é você sempre passar a documentação da chave API que você quer conectar então você fala assim olha quero conectar na API do Notion leia a documentação do Notion Então o agente já vai saber como navegar lá dentro.

Porque se você só joga o agente lá dentro e fala, conecta no Notion, ele vai se conectar, mas ele não vai entender muito bem como navegar, pra onde ir, o que fazer, isso vai acabar com seus tokens, vai diminuir sua assinatura e vai te dar puta de trabalho pra você mapear tudo.

Então é mais fácil você mandar a documentação, que é o mapa dele.

E também não esquecer de depois que ele ler a documentação, o que eu já te ensinei várias vezes antes, que é falar pra ele criar mapa de como funciona a API, porque o seu agente vai criar mapa da forma que ele entendeu e vai ficar muito mais fácil de navegar lá dentro do que ele tem que ficar lendo a documentação toda hora para navegar lá dentro, tá bom?

Então a gente vai pegar aqui o Notion, então aqui no caso do Notion você vai aqui aqui em cima em Settings, Então, se você for em Settings aqui, você tem aqui esse botão chamado Connections, e você vai ver aqui que nós já temos vários Open Calls conectados aqui dentro, né?

O DaVinci é meu Open Call, o Chico é Open Call do meu sócio, o CloudBot do Bruno é meu Open Call, então a gente tem várias coisas conectadas aqui dentro, tá?

Então, você pode vir aqui, então aqui em Connections, você tem esse botãozinho aqui embaixo chamado Develop or Manage Connections, então você clica aqui, por exemplo, E aqui tem aqui os nossos agentes e as ferramentas.

Então você pode vir aqui em Create new integration, você coloca aqui OpenClaw no caso você pode por o seu OpenClaw né, vou colocar uma fotinho para dar charmezinho a mais aqui, vou usar a mesma foto que a gente tá usando da Hoxinger.

E aí você coloca o Workspace né, então o Workspace vai ser o Pixel Educação, a gente vai criar aqui tá.

e aí ele criou aqui a gente vai configurar essa integração então tá aqui ele criou aqui bababá bababá e aqui tá o o a chave né então a integração então você vai copiar essa chave aqui aí você pode pegar esse prompt aqui né falar assim olha então vamos criar aqui chamado apis então eu vou dar barra nil né lembra pra gente começar uma conversa nova sempre dá barra nil aí eu vou chegar para ele aqui vamos copiar esse prompt aqui no caso a gente esse prompt ele pede para você o agente te guiar né o agente falar como instalar no caso eu já tô te ensinando aqui então você não precisa seguir dessa forma aqui né então você falar para ele blá blá fala assim ó eu quero conectar meu notion vai no documento oficial do openclaw e em developer notions e conecte na chave API deles.

PS, não esqueça de montar o mapa de como funciona o Notion.

E aí, eu vou colocar a chave API deles aqui, que a gente acabou de Então, simples assim, você sai conectando nas ferramentas.

Então, tudo que tem API, você consegue seguir o mesmo processo e montar, tá bom?

O que eu recomendo você também instalar além de você instalar o Notion, que a grande maioria de vocês usa o Notion, mas isso serve para ClickUp, serve para outras ferramentas, é você instalar o GitHub.

O GitHub é fundamental para você criar o backup. Então se você está instalando aqui usando o Starter Kit, você vai ver que uma das primeiras aulas aqui do Starter Kit, uma das primeiras configurações no Wizard dele, é ele instalar aqui o GitHub.

O GitHub é muito importante. Então, o GitHub, você tem que acessar o GitHub, você tem que clicar aqui em cima, na sua foto, depois de criar sua conta, ir em Settings, em Configurações, aí vocês vão rodar lá embaixo, na última opção, aqui de baixo, Developer Settings, aí vocês vão aqui nesse menuzinho, colocar Personal Access Tokens e aí você vai em Tokens Classic, tá vendo?

E aí o que você vai fazer, você vai colocar em Generate New Token, e você vai aqui em Generate New Token Classic.

E aí você vai criar aqui o token, no caso o meu tem monte de proteção e senhas né, e você vai criar aqui o token chamado OpenClaw.

Aí você pode deixar ele para não expirar e você coloca que ele vai ter acesso ao repositório, workflows, admin, esse aqui não precisa, usuário, deletar, escrever, enterprise também não precisa, log, espaço de código, copilot, blá blá.

Então assim, você pode colocar aqui esses pontos aqui. Tipo, Bruno, posso pôr tudo? Pode, mas volta aquela ideia que eu te falei, né?

Seu funcionário precisa ter todos os acessos, mas no caso como o GitHub a gente vai usar para backup, acho que não tem tanto risco você deixar tudo marcado, tá?

Aí você vai criar o token aqui, e aqui no meu caso ele criou o token, tá?

Então, aqui no caso a gente vai falar assim, olha, criei service token do GitHub, pode instalar ele conforme o wizard, por favor?

aí a gente passa aqui para ele, ele instala aqui.

Então, você pode ir fazendo aqui no paralelo aqui, tá?

Então, o OpenCLoud não tem caminho nativo, então é plugar via MCP, blá, blá, blá.

Então, o OpenCLoud vai ler a documentação, ele vai fazer tudo para você e tá tudo certinho, tá?

Então, vou deletar aqui o token, para vocês não ficarem com o meu token, mas é muito importante vocês seguirem essa instalação no GitHub e aqui o que você vai fazer é pedir para ele criar cron.

Então, você vai falar assim, olha, É, o Token está inválido porque eu acabei de derretá-lo, tá?

Já faz assim. OpenCloud, eu quero que agora você crie Chrome. que todos os dias você vai pegar tudo que a gente fez e você vai salvar isso dentro do Github.

Então eu quero que no Github você crie uma pasta chamado Tor OpenClaw e lá dentro você todos os dias à meia-noite você grave e faça backup de toda a área de trabalho do Tor e deixe tudo salvo lá dentro.

Todos os dias, meia-noite. então por exemplo tá é uma simulação tor isso aqui é só uma simulação tá eu sei que o token deu válido Então, só para acalmar os ânimos aqui do nosso agente.

E aí, ele vai ficar de buenas, tá bom? Então, o GitHub, ele é muito importante para você fazer backup.

Bruno, eu posso usar Obsidian para fazer backup e tal?

Pode. Pode usar Obsidian. Pode usar qualquer outra ferramenta. Mas o mais importante é você criar uma ferramenta que ela seja boa para agentes acessarem.

Então, o GitHub, ele é uma ferramenta agêntica. Então, os agentes conseguem acessar muito bem. O Obsidian é uma ferramenta mais ou menos agêntica, mas funciona muito bem porque é Markdown.

Então você pode usar ele muito bem, tá? Agora Agora a gente vai instalar o Google Workspace. Então quase a maioria de vocês usa o Google. E o Google é chato pra caramba. Então a gente vai instalar o Google. a gente vai olhar se o Google já veio instalado, tá?

Então a gente vai passar esse prompt aqui, ó. Então ele vai instalar a skill do Google CLI automaticamente.

Mas como ele vai achar essa skill, Bruno? Ele Ele vai usar o Claw Hub, que é o repositório oficial do OpenClaw e ele vai instalar as skills do próprio Steve, né?

Que é o fundador do Peter, né? Peter? também né, já quase uma da manhã aqui. Então o Peter ele normalmente tem Skills de confiança. Então uma delas aqui ó, tem a Skill do Unpassword e ele tem várias Skills aqui que você pode pegar também aqui dentro e aqui também tem o do GOG tá.

Então aqui o do GOG é a Skill do GOG, então provavelmente na hora que você pedir para instalar essa Skill do GOG, ele vai instalar provavelmente essa Skill do GOG tá.

Como estamos? vamos ver aqui. Olha eu pedi para ele colocar isso aqui e aparentemente deu algum probleminha aqui que meu agente não está respondendo.

Vamos dar status aqui. E o que a gente pode fazer? Por exemplo, isso aqui às vezes pode acontecer. Então, antes de você se desesperar, manda uma mensagem privada para o seu agente.

Aqui, já aconteceu isso antes. Tor, por que você não está respondendo na HQ? Normalmente, o seu agente aqui no privado, ele responde para você 99% das vezes.

No caso, se ele não tá respondendo agora, nem no privado, nem no kit, provavelmente o que aconteceu é que ele está processando alguma coisa.

Então aqui ele está processando. Vamos fazer teste? Cara, olha que curioso, né? O Thor, ele tinha parado de responder, daí eu pausei a aula aqui, mas só para mostrar para vocês o que aconteceu, né?

É que ele travou e, aparentemente, o meu Gateway caiu.

Então, aqui ele estava como offline. Então, se dia isso acontecer com vocês, aqui a gente tem aqui, você pode dar uma olhadinha aqui no seu OpenCloud, aqui no Manage, e ver se o Gateway caiu.

Às vezes ele cai. Então, ele caiu aqui, aí o que eu fiz foi clicar aqui em reiniciar e ele reiniciou e voltou, tá bom?

Então, de volta aqui para a instalação da GOG aqui, para não tomar muito mais o tempo de vocês.

Então, o que está acontecendo? Ele está passando o passo aqui, tá? Estamos dentro, eu chequei a evidência, GOG não está instalado, então vamos colocar aqui, instale o GOG CLI e vamos configurar o e-mail do nosso agente.

Então, de novo, vocês podem conectar o GOG, pode conectar nas suas contas, você pode conectar o seu e-mail pessoal, seu calendário, seu Google Drive, mas eu recomendo você tratar ele como funcionário.

Então, você colocar e conectar ele nos e-mails dele. Então, exemplo que você pode fazer é que você pode conectar o e-mail dele e compartilhar o seu calendário com ele.

Ou você pode dar forward de todos os seus e-mails para ele.

Então, tudo que você receber, você dá o forward para ele.

Mas é muito melhor você isolar tudo no seu agente, do que você ter nos seus acessos e ele disparar e-mail sem querer no seu nome ou deletar algum compromisso da sua agenda.

Então agora ele vai instalar o CLI aqui, que é esse GOG CLI.

E ele vai colocar aqui, então gmail gog. Então vamos esperar ele carregar minutinho aqui. E aí a gente volta aqui tá? Então assim gente ó, para você instalar o GOG CLI, enquanto ele está instalando aqui, ele vai te abrir passo a passo que você pode seguir o fluxo tá?

Então se você tiver qualquer dúvida no passo a passo, você pode pedir para o seu próprio agente te guiar.

Falar assim, olha você pode me orientar como eu posso instalar o GOG CLI?

E aí você vai colocar aqui tá? Então qual é o e-mail do agente? Então assim, você pode colocar, ele já vai tentar logar aqui e ele vai abrir esse fluxo de OUF, tá?

Então só para mostrar para vocês, vamos fazer teste aqui com e-mail meu, para ver como que ele vai abrir aqui, a gente faz teste.

Mas assim, é muito tranquilo e aí você pode pedir para o seu agente te guiar e te instruir com tudo.

Então enquanto ele vai abrindo aqui, eu vou abrindo para vocês aqui, tá?

Boa! Achei o bloqueio, o Gog não vem com o cliente oaf embutido, então aqui ele te passa o comando, né?

Então você tem que abrir aqui esse site. Cara, isso aqui é chatinho, tá? Então você tem que abrir esse site aqui, criar projeto e seguir esses passos aqui, tá?

Então você pode seguir todo esse espaço, pedir para o OpenCloud te ajudar e ele te ajuda a instalar o Gogo CLI e aí é muito mais tranquilo.

Então mais tranquilo. Agora vamos para o próximo passo que é browser. Então o seu agente ele já vem com browser integrado.

Então se você quiser que ele faça alguma coisa, você pode pedir para ele acessar o seu browser.

Então você pode pedir para ele navegar, para ele pesquisar, para ele usar alguma coisa.

Então ele já vem com browser instalado. Mas no caso, aqui no nosso minicurso, eu recomendo você instalar esse aqui chamado Brave Browser.

Mas o problema do Brave Browser é que ele é pago.

Então você pode usar o Brave Browser. Tem outras versões gratuitas também, mas o Brave Browser é uma ferramenta feita para agentes.

Então ele funciona muito bem para agentes. Só que ele custa 5 dólares. Então você pode pagar 5 dólares e você pode usar o Brave Browser.

Então ele funciona muito bem para navegar na internet. mas o seu OpenCloud já vem com o browser embutido e tem outros browsers gratuitos que você pode pesquisar na internet tá então dentro do kit que a gente te passa a gente pede para instalar outro browser chamado chromium que é o chromium que a versão do chrome só que ele é headless então ele é chrome sem interface ele é chrome feito para robôs e agentes então assim no kit você já tem o suficiente e a gente pergunta se você quer instalar o Brave Então você pode aceitar pagar os 5 dólares ou não.

Então vale a pena você testar. Então se você não quiser pagar, você pode usar aqui o próprio browser que já vem aqui dentro e aí funciona tudo normal, tudo maravilhosamente, tá bom?

Outra questão também é que você tem integrações de Webhooks, então você pode configurar o Webhooks para o seu agente.

Então se você tem alguma ferramenta que ele não tem API, mas ele dispara o Webhook, você pode só pedir para ele disparar para o seu OpenCloud e ele capta as informações, tá bom?

Então, de novo, se o seu agente travar, tá aqui os comandinhos que você precisa rodar, tudo que você precisa, e aqui, no final dessa aula aqui, é a ideia que você já tenha feito as suas primeiras integrações, seja no seu Gmail, seja no seu Notion, seja no seu GitHub, GitHub é muito importante, e o que você precisa, de novo, estamos lá no nosso grupo do minicurso no Telegram, só chamar lá que eu tô à disposição para te ajudar, tá bom?

Tamo junto. Vamos falar de multi-agentes, que essa aqui é uma das aulas favoritas da galera e é uma aula muito divertida porque é muito legal você ter múltiplos agentes, mas tudo tem peso também.

Então primeiro vamos falar sobre o que é multi-agentes e pouco de como funciona.

Então a minha arquitetura hoje eu tenho quatro agentes operando.

Eu tenho a Amora, eu tenho o OpenCloudzinho, eu tenho o Léo e mais agente que não tá na lista aqui.

Então a Mora, ela é minha Chief of Staff. Então a Mora, ela administra quatro empresas minhas. Para você entender que você não precisa ter agente por empresa, agente por área e assim por diante.

Mas eu vou chegar nessa mensagem ainda. Então você tem a Mora que ela cuida de tudo para mim e a Mora custa, na verdade, R$1.000,00 por mês, tá?

Porque eu assino a assinatura do Chat GPT de R$1.000,00 por mês, porque eu uso muito a Mora.

Eu tenho mais de 100 crons rodando, Administro quatro negócios.

Cara, pensa num agente que trabalha muito. Daí a gente tem OpenCloudzinho, que é esse carinha aqui que tá rodando 24x7, processando de duas, três, quatro mil mensagens por dia de suporte pra galera aqui dentro.

Inclusive, uma das perguntas aqui que esse aluno trouxe aqui é que ele queria criar grupo no Telegram, onde a equipe dele pode funcionar, ou seja, criar agente pra equipe dele, que é o que você vai aprender nessa aula aqui também.

Aí eu tenho o Léo, que o Léo é esse gestor da minha empresa.

Então o Léo tem uma visão geral de todo o meu negócio.

O Léo cuida das minhas campanhas de Edis, cuida dos meus agentes, dos meus crons, das minhas skills.

O Léo, ele não só administra todas as minhas ferramentas, todas as iniciativas, tudo que está acontecendo, ele sabe aonde cada pessoa da minha equipe está trabalhando, fazendo o que?

O resultado de tudo, como performa meu funil, meu financeiro, meu fluxo de caixa e tal.

Então o Léo tem uma visão completa. Como o Léo também, ele é agente que ele cuida da governança de agentes.

Então o Léo, ele cuida de todos os agentes da nossa empresa.

Então ele vê se os agentes estão performando bem, estão fazendo backup, estão com workspace organizado.

Então o Léo é o suprassumo. Inclusive só abrindo parênteses, que se você quiser aprender a ter o seu Léo, e a construir o Léo para sua empresa, para ele ter essa visão agêntica, nós temos essa aula chamada imersão de A para Negócios, que são uma imersão de cinco horas dentro do PixlrHub, para você fazer e implementar essa estrutura agêntica, onde você pode ter Léo cuidando da sua empresa inteira e ter múltiplos agentes por funcionários diretores, tá bom?

que é a continuidade aqui desse mini curso que seria o próximo item da trilha.

Então, voltando aqui, vamos ver o que você vai aprender aqui.

Então, primeiro eu vou falar para você sobre manutenção, o custo de ter múltiplos agentes.

Vou falar para vocês a diferença de sub-agentes e agentes em paralelo.

Vou trazer exemplo de sub-agente em ação. Vou falar pouquinho sobre arquitetura. Vou falar sobre o Agents.md, que é a fundação dos agentes.

Vou trazer o caso da Pixel e quanto eu gasto com meus agentes aqui, para você ter uma ideia.

E a gente vai fazer recap, tá? Então primeiro vamos falar sobre custo, o que você precisa entender.

Quando você tem três agentes, você não tem três vezes mais trabalho, você tem cinco vezes mais trabalho.

Então antes de você sair pensando e falando assim, cara vou criar agente para fazer cada coisa, vou ter agente para fazer, agente para cuidar do financeiro, agente para cuidar do comercial, agente para não sei o que, agente para cuidar do suporte, lembra que Ter múltiplos agentes demanda múltiplas higienizações.

Então você tem que fazer manutenção, criar skills, cuidar dos crons, cuidar do workspace.

Você tem uma série de coisas que a gente passou ao longo do nosso mini curso que você tem que refazer com todos os agentes.

mas Bruno, você falou que você pode pôr agente que cuida de todos os agentes e faz tudo isso.

Sim. True fact. Mas o problema de você fazer isso é que mesmo assim as coisas quebram.

Mesmo assim o seu agente precisa de manutenção. Mesmo assim você tendo agente master que cuida de tudo, ele ainda vai precisar que você entre lá, que você veja porque quebrou uma skill, que você veja porque é Chrome, porque o report não foi enviado.

Então quanto mais agente você tem, mais trampo você tem.

Então tenha isso em mente. Então antes de você sair pensando em criar agente em tudo, A minha recomendação pra você, como uma pessoa que trabalha com agentes já há algum tempo, é tenha agente muito bem feito, muito completo de ponta a ponta, que ele domina tudo, todos os processos, tudo, e quando você tiver sobrecarregando seu agente, então você quer usar ele e você está tendo muito volume de suporte ou você tem muito volume em vendas, precisa atualizar muito deals e tal, você simplesmente pede para o seu agente segregar a estrutura dele e criar novo agente, clonando o cérebro do seu primeiro.

Então a nível de experiência, meu conselho para vocês é, crie agente muito bom e depois você cria outros agentes a partir do seu agente muito bom.

Então, tá, vamos falar assim, tá, é o que eu acabei de explicar.

Mais vale você ter agente único e os sinais que você pode ter para você evoluir é o seguinte.

Primeiro, seu agente único tá lento. Então você tá com muita coisa acontecendo, tá. Então você tem ele processando muita mensagem, que nem Open Clausezinho.

Você tem ele fazendo muitos crons. Você tem ele cuidando de muitas vendas. Você tem seus sócios usando. você tem às vezes alguém da sua equipe usando, ele tá ficando pesado e tal, então faz sentido você considerar ter dois agentes e colocar ele nas áreas que mais tem demanda.

Você fala duas línguas operacionais distintas. Então você fala o tempo inteiro. Por exemplo, no meu caso, eu falo múltiplas línguas. Eu falo conteúdo, eu falo produto, eu falo curso. Mas no caso da Mora, ela me supri muito bem.

Porque as minhas categorias, o que eu faço? Eu crio tópicos aqui pra falar com a Mora sobre projeto ou assunto específico e depois eu mato.

Então eu tô aqui gravando o curso inteiro de OpenCLAL que a Mora fez ele aqui dentro.

E aí eu ajusto aqui todo o material, faço tudo, e quando eu terminar de gravar esse curso eu vou vir aqui e simplesmente vou fechar esse tópico, porque tá tudo salvo na memória da Mora.

Então não é relevante isso aqui. Agora, eu poderia ter agente dedicado para criar o curso inteiro do OpenCLAL.

Mas será que eu preciso ter agente só pra fazer uma atividade, que é criar curso?

Acho que não. Então não faz sentido. Mas agora, se eu tivesse aqui desenvolvendo software o dia inteiro, software, software, software, software, e tivesse uma empresa de suporte, e eu tivesse software e suporte torando pau nos dois, talvez faça sentido, porque daí ele vai começar a misturar muitos contextos e perder a precisão em ambos, tá?

Você tem time de funcionários, então você quer que cada pessoa tenha o seu agente, você quer ter agente da empresa, você quer ter agente para os sócios, então nesse caso faz sentido você realmente quebrar os agentes porque senão mistura muita informação sua dos seus sócios.

E outro ponto é que você também quer agente para fazer uma função específica.

Eu tenho o Léo que administra a empresa inteira, então você pode ter agente que administra uma estrutura inteira, uma empresa inteira, administra agente que administra todos os funcionários, você pode ter agente que você vai delegar 24x7 num tópico específico que vai cuidar de uma thread específica.

Então Então qual que é a diferença de subagentes e agentes paralelos?

O subagente ele é agente que ele roda em background e ele roda com contexto limpo.

Então lembra que a gente falou aqui que a gente tem uma janela de contexto de 200.000 tokens, pelo menos no chat de GPT 5.5, que é o que eu recomendo no curso, né?

Se você usa outras LLMs, você pode ter contexto maior ou contexto menor aqui, tá?

Então, você tem ali o contexto. Então, toda vez que você roda subagente, no caso do namoro não carregou meu subcontexto, deixa eu fazer aqui, status, Você que rolou com a morinha ali.

Então, por exemplo, aqui o contexto está em 0 de 200.

Então, eu tenho aqui. Então, toda vez que você invoca subagente, ele nasce com o contexto zerado.

Por que isso é bom? Porque ele não enche o contexto do seu agente principal.

Então, se você estivesse aqui trabalhando e fazesse 5 coisas em paralelo, ele enche o contexto.

Se você pede para ele invocar 5 subagentes para eles fazerem 5 coisas em paralelo e voltar, eles não enchem o contexto.

Então, isso é bom, porque você não polui a sua conversa principal.

Já agente paralelo, ele tem que ter uma identidade própria, sou próprio, usuário próprio, uma vida própria.

Então é outros 500, não é só agente que nasceu, executou e morreu.

Custo de criar é baixo, comando só para o sub-agente, para o agente em paralelo você tem que montar toda a estrutura de novo de agente.

Custo de manter é zero, porque o agente nasce, executa e morre.

o custo do agente paralelo é cinco vezes o trabalho de você fazer a gestão de agente.

A identidade limitada, então no caso esse subagente ele invoca esse agents.md e o tools, então ele sabe as regras, as ferramentas, mas ele não tem arquivo de sou, ele não tem uma memória, ele não tem nada, ele só vai lá, executa e traz para o agente mãe as informações lá.

Já o agente paralelo não, ele tem tudo, executa tudo, tem memória própria, tem O agente isolado aqui, o sub-agente, ele é agente isolado, ou seja, ele só herda o contexto do pai, que é o da conversa principal.

Então, se você tá falando com ele de uma coisa e você pede pra ele invocar sub-agente pra falar de outra coisa, ele não tem o contexto porque ele só tem o contexto da conversa do pai.

Já o agente paralelo tem uma memória própria, ele tem autonomia, ele tem tudo porque ele é agente.

Aparece no Telegram? Não, não aparece, ele é invisível. Sim, o agente independente, agente paralelo, aparece no Telegram porque ele é agente.

Como invocar? Você pode invocar o subagente usando esse skill aqui, Subagents Spawn, e aí o que ele faz, a tarefa e tal.

Ou você pode simplesmente mandar áudio para ele, falando assim, invoca aí três agentes para fazer ABC.

Como aqui no caso, você pode ter agente dedicado, que você pode também ter tópico no Telegram, ou mandar mensagem para ele, ou você pode ter tópico do seu HQ, mas você pode ter às vezes uma conversa no Telegram com agente isolado aqui dentro.

Então você pode ter agente de desenvolvimento que fica sozinho aqui dentro.

O aluno invoca direto, não só pelo agente principal, sim você pode mandar mensagem para ele individualmente.

Ideal para tarefas pontuais, então os sub-agentes são ideais para tarefas pontuais, principalmente se eles rodam skills.

Então se você tem uma skill de criação de carrossel no Instagram, você roda agente para fazer pesquisa de pauta, você roda agente para montar roteiro, você roda agente para executar skill de carrossel e ele monta tudo e faz tudo maravilhosamente.

Aqui se você tem agente dedicado, o seu agente vai lá e vai fazer tudo, todas as etapas ele mesmo, tá.

risco de over engineering, de você fazer uma engenhoca muito grande para fazer acontecer e ter resultado, com subir agentes é quase zero, com múltiplos agentes é frequente, isso é verdade.

Então tarefa pontual, sub-agente. Domínio contínuo, com os quatro sinais que eu sugeri, agentes paralelo.

Não consegue decidir, sub-agente sempre, tá? Então é muito importante, é melhor você encher agente e deixar ele completamente operacional e deixar ele muito bom pra depois você quebrar em outros agentes do que você já começar sua jornada tendo uma porrada de agente fazendo a manutenção de monte de agente.

Então isso aqui é sub-agente, como ele funcionaria, tá? Então você pode usar esse aqui comando aqui. ele deixa esse comando aqui tá no caso tá falando que não posso usar diretamente subagents né então a gente pode fazer o seguinte falar falar assim ó e na verdade podemos fazer assim e só tirar isso só tirar o barra.

Eu acho que por conta, né, Agents ID is not allowed for this section.

Allowed none. Então isso aqui deve ser problema de configuração que eu poderia simplesmente pedir para ele.

Pode ativar a configuração para ligar os sub-agents. a gente pode pedir para ele aqui tá e ele bateu num bloqueio de pairing required mesma coisa que a gente teve aqui nos vários exemplos da aula né então de novo é só você pedir para ele lá e executar tá bom ele vai lá ele vai executar porque a gente já ligou aquele YOLO lá que aquele comando terminal que liga a execução Então aqui tem passo a passo do que vai acontecer enquanto o nosso brother aqui decide liberar o comando que ele já devia ter liberado antes.

Então ele vai aqui e esse aqui é o passo de coisas que vão acontecer.

O Hamora criou agente chamado Aurora aqui no caso. Toda coincidência é mera causalidade. Então vamos para o bloco 4, onde os agentes vivem mais quatro caminhos de comunicação.

Então, no caso do Manage Open Claw, que é o que a gente tá usando da Hostinger, você só pode ter agente por VPS, tá?

Então, o que significa isso na prática? Então, na prática, você pode ter agente só, então, se você quer criar Open Claw, você pode vir aqui e pagar R$30,00 por mês e criar o seu Open Claw, por VPS.

Agora, se você assinar a VPS Standalone, então vamos supor que você assinou a VPS aqui dentro, tá?

Então você veio aqui, página inicial, que nem eu, e você tem aqui suas múltiplas VPS, tá?

Então você tem aqui VPS1, VPS2, etc. Então aqui no caso dessas VPS você pode ter múltiplos agentes, então no caso você pode vir aqui e instalar via SSRoute, só que isso aqui volta para o curso 2 que a gente tem, que é o curso mais para pessoas técnicas, com terminal, com servidor, então esse modelo aqui de você ter múltiplos OpenCalls usando, você pode ter 3 OpenCalls workspace, ele já é pouco mais avançado.

Então, a minha recomendação é que você tenha múltiplos agentes dentro do mesmo OpenClaw.

Então, você pode pedir para o seu OpenClaw pegar aquele workspace dele, que tem no Soul, Agents, blá blá blá, e falar para ele duplicar e você ter dois workspaces.

Então, ele meio que duplica o cérebro dele em dois e ele tem dois agentes trabalhando.

Então, funciona também muito bem. a maior diferença entre você ter dois agentes em dois Workspaces diferentes e três agentes é que no caso aqui dos três agentes você consegue deixar eles completamente isolados do outro aqui no caso eles vão ficar meio que no Workspace de agente só meio que jeito estranho mas os dois vão tirar o mesmo resultado, os dois vão funcionar muito bem tá.

Então para o aluno do curso Manage, que é você que tá fazendo Manage aqui, que é pegou aquele com clique da Hostinger, a opção de multiagente é no mesmo workspace.

Então você volta aqui, você tem vários agentes aqui no seu workspace e cada agente tem o seu Soul, Identity, Memory e blá blá.

que é o que eu falei, né? Então ele vai criar outros Workspaces, então ele vai criar outras pastas e ele vai ter aqui a estrutura deles, né?

Então você inclusive pode criar estrutura de sub-agentes se você tem alguma demanda recorrente.

Então se você tem uma demanda de pesquisar conteúdo todo dia na internet, você pode criar sub-agente pra ele fazer isso pra você e deixar ele já pré-definido, tá bom?

Então o melhor caminho é sub-agente, o outro caminho é você criar agentes aqui dentro do seu Workspace.

mas Bruno, como faz? Calma, jovem padrão, vamos chegar lá. Uma pergunta que eu recebo muito nos cursos. O que acontece se eu colocar a Mora e o OpenCloudzinho no mesmo grupo do Telegram?

Eles vão ver as mensagens do outro? Sim, tecnicamente sim, mas eles não vão responder ao outro.

Bruno, como eu deixo os agentes conversando entre eles? você consegue fazer os agentes conversando entre eles, colocando tarefas dentro do Hot, que é o que o Heartbeat vê.

Lembra daquela aula do Heartbeat que a gente teve de Cronos e Heartbeat?

Então a gente criou arquivo chamado Hot, que é onde ele vai estar as tarefas deles, as pendências.

Então o que você pode fazer é pedir para agente, quando ele completar uma tarefa ou ele precisar transferir uma tarefa para outro agente, ele jogar no Hot, desse documento e pedir para todos os agentes rodarem esse hot.

Então, todos são exemplos, você pode criar outros arquivos, você pode criar arquivo chamado Projects e lá você coloca os projetos.

Então, toda vez que agente rodar heartbeat ou você pode agendar crons e você fala para ele ler aquele arquivo, Projects, e ele vai acordar, vai ler o projeto, ele vai falar, olha só, a Amora comentou aqui que eu preciso fazer uma ação.

Ele vai executar a ação e ele vai responder e falar, Amora, eu fiz a ação.

E aí a Mora vai tocar o heartbeat, ela vai acordar, vai falar assim, olha só, o OpenClose fez ação, agora eu preciso executar outra coisa, ele vai executar.

Então os agentes conversam entre eles, atualizando o mesmo documento com heartbeat ou com crons.

Então você não consegue deixar os dois conversando eles num canal, porque o que acontece?

Se você deixar eles num canal, o que vai acontecer?

Eles viram spam. Então se você deixa aqui, tipo, põe dois agentes conversando aqui dentro, e deixar sem o allow mention né pra ele funcionar sem menção vai ficar num loop infinito de falando com outro papapá papapá e eles vão é até experimento social ali de certa forma né agêntico mas é meio bizarro e você vai queimar token e vai encher sua memória de porcaria não vai te levar para lugar nenhum e os agentes conversando entre si parece sei lá converso de maluco assim, entendeu?

Mas assim, só abrindo parênteses, aposto que você já deve ter visto no Instagram, agentes criando a própria língua deles e criando uma religião e blá, blá, blá.

Cara, assim, eu não sei, nunca testei, acho pouco provável isso acontecer, tá bom?

Então, de novo, se você quer que eles respondam, você pode por os dois no grupo, só que você só tem que marcar esse required mention pra eles não entrarem nesse vórtex de spam.

Então, você deixa o required mention true e eles só respondem quando forem mencionados, tá bom?

Então, qualquer dúvida que você tiver aqui, não esqueça de me perguntar no nosso grupo do Telegram.

Mas é isso, tá? Sub Agents e Agentes podem criar essa pasta. Eu já vou te ensinar a fazer isso no Telegram, tá bom?

Então vamos para o bloco 4, onde os agentes vivem mais quatro caminhos de comunicação.

Agora, o Agents.md. Então, o Agents.md é o arquivo que ele tem o organograma do agente dele.

Então, é aqui onde você vai colocar o que é o papel do seu agente ou agentes.

Então, o que os agentes fazem? Como eles se chamam? Inclusive você pode pôr o sub-agent se você quiser criar uma personalidade no sentido de uma funcionalidade específica para sub-agent, né?

Então pesquisar, fazer isso, executar isso, tá? Você cria aqui dentro, você explica onde cada gente vive, é tipo mapa.

Então você fala, olha, a Mora mora nesse Workspace, o OpenClousinho nesse Workspace, esses são os canais, olha, a Mora funciona no WhatsApp, Mora funciona no Slack, o OpenClousinho funciona no Telegram e tal.

aí você pode colocar as permissões né e a governança tá então aqui tem exemplo aqui de agent.md aqui tá vocês podem usar esse aqui de exemplo mas basicamente se você jogar esse material aqui falar para o seu agente a cria que o agent.md seguindo o material ele vai fazer tudo isso tá tudo tranquilo tá Então, eu vou pegar caso real aqui da Pixel.

Então, no caso, eu tenho a Amora Cos. Então, por exemplo, vou abrir aqui a minha apresentação da Qualcomm, que eu fiz agora recentemente.

Então, olha só a Amora, né? A Amora, a minha Chief of Staff, ela tem vários lugares que ela alimenta.

Então, ela pega contexto aqui, e-mails, transcrições de reuniões, calendário, Notion.

Ela faz tudo isso rodando crons. Então, cron que roda aqui de noite, né? Então, voltando aqui para o nosso exemplo, acho que ele rodou aqui.

Então aqui ó, ele roda o cron do WhatsApp, rodou às 11, 10 horas da noite, puxou as minhas conversas do WhatsApp, puxa meus e-mails.

Então a Mora aqui puxou meus e-mails, aqui as reuniões, transcrições, calendário, Notion.

Então com crons ela puxa tudo e ela organiza tudo isso nos meus projetos, nas pessoas, que eu tenho CRM pessoal dentro da Mora.

Ela atualiza uma base de conhecimento viva, que eu tenho SupaBase.

Então a Amora já é uso mais avançado de agente, por exemplo, que a gente usa ela para fazer meio que tudo, né?

Então esse aqui é o exemplo, por exemplo. O exemplo é foda. Então, esse aqui é o exemplo dos agentes dos meus sócios.

Então, o meu sócio tem o Jarvis, que é o agente dele, eu tenho a Mora, a gente tem o Chico, a gente tem o segundo cérebro, que de novo a gente ensina a fazer isso no Pixel AI Hub, na imersão lá de cinco horas.

A gente tem o Léo Da Vinci, que é conectado nesse segundo cérebro, então tudo que os meus sócios trabalhamos, a gente comita para esse segundo cérebro.

Esse nosso agente geral, ele tem uma estrutura para atender todos os nossos funcionários simultaneamente.

Amora, como minha agente pessoal, o OpenClausinho como agente dedicado para a estrutura de suporte do curso e o Léo que é esse agente conectado para a empresa inteira que todos os funcionários usam ele simultaneamente.

Então, como que funciona? Cada tem Workspace separado, então cada tem o seu próprio Open Claw, então são pastas isoladas, identidades distintas, permissões cruzadas e caminhos de comunicação diferentes.

Então, a única forma que eles conseguem compartilhar dados é porque eles têm uma pasta no nosso Workspace chamado Shared.

Então, eu vou te ensinar a fazer isso, mas o que você pode falar é que todos os agentes podem compartilhar uma pasta chamada Shared.

Então, tudo que a Amora fizer, ela pode salvar nesse Shared.

Ou, por exemplo, tudo que é sobre o projeto X, obra X, processo tal, coloca na pasta Shared.

Tudo que é coisas do dia-a-dia, tipo transcrições, reuniões, coloca no workspace normal dela.

Então, você pode criar regras para decidir o que você vai compartilhar entre os agentes ou não.

Então, qual que é o custo real de você ter agente, tá?

Então, voltando para a estrutura da assinatura, o chat GPT hoje, ele consegue rodar entre 3 e 4 agentes numa assinatura de R$1.000,00.

Então, se você tem uma assinatura de R$1.000,00, 3, 4 agentes, ok.

Acima disso, você começa a ter muito problema de lentidão, porque não esqueça que no final do dia é uma assinatura, então a OpenAI, ela vê Mesmo que você tenha cinco agentes trabalhando, ela vê como uma assinatura.

Então, se você está socando cinco agentes de crons, automações e coisas, mais heartbeat tocando a cada uma hora, você vai dar rate limit.

Então, você vai estourar o limite das requisições da OpenAI e você vai entrar em cooldown, que você vai entrar num processo de espera até desbloquear de novo a sua assinatura.

No sentido de que eles fazem isso para evitar, por exemplo, spam, essas coisas, Então, só cuidado com isso.

Então, o que eu recomendo é você ter ali uma assinatura para no máximo 3, 4 agentes ali, tá bom?

Então, aqui no meu caso, a gente tem duas assinaturas para dividir esses agentes, né?

Então, a gente tem uma assinatura de R$1.000,00, que a gente põe Open Closing em Amora, e mais uma assinatura de R$1.000,00 para o Léo, porque a gente tem mais os funcionários usando.

Então, a gente quis deixar duas assinaturas separadas, tá bom?

Sintomas de overengineering, que você tá fazendo muita gambiarra e você talvez tenha que dar passo pra trás.

Vou criar cinco agentes porque é legal, coisa estética, não vale a pena.

Cada agente fica ocioso 90% do dia, subutilização, unifica tudo de volta.

o custo dobrou, produtividade não, ROE ruim, reverta, você passa mais tempo orquestrando do que produzindo, isso acontece muito, overhead, você fala com o agente e ele não sabe o que fez, AgentsMD desatualizado ou domínios mal divididos, manutenção do sou user ficou pesada, multiplicador de 5x, tá bom?

Então Então vamos para o bloco 4, onde os agentes vivem mais quatro caminhos de comunicação.

aqui estão os prompts para você criar os sub-agentes, então vamos criar sub-agente junto aqui dentro, tá.

Então vamos criar aqui sub-agente, vamos chamar esse agente de Esmeralda.

Então o que a gente vai fazer é o seguinte, ó, vamos pegar o prompt aqui de criar sub-agente especialista, gerar Agents.md, configurar handoff, né, de como você fazer dois agentes conversarem e aqui o agente paralelo.

Então vamos criar aqui. vamos pegar esse prompt, vamos falar assim. Thor, nesse tópico aqui a gente vai criar sub-agente chamado esmeralda, eu vou te passar prompt e esse sub-agente ele é outro workspace, é outra estrutura, tudo do zero, tá bom?

Então vamos só revisar o prompt aqui, quero criar sub-agente paralelo dedicado apenas este canal aqui, esse canal agente agente de conteúdo apenas.

Não quero que ele acesse outros canais, então vou tirar aqui canais do do Thor, no caso né.

Uma breve ajustadinha e a gente vai criar nosso subagente.

Mas Bruno, é isso mesmo? Não precisa entrar no dashboard do OpenClaw e criar o subagente e tal?

Não, você pode fazer tudo pelo Telegram. Sinceramente, eu nem abro o dashboard do OpenClaw. eu faço tudo via Telegram e funciona muito bem, tá?

Então isso aqui é muito tranquilo, então você pode criar aqui os agentes, aí você personaliza seu agente, coloca o user, coloca o agent, coloca tudo, inclusive você pode criar aqui dentro, né?

Então você pode pedir para o Thor falar assim ó, Thor, eu estou criando subagente chamada Esmeralda.

Preciso que você me ajude a criar uma personalidade para ela.

Preciso que você me ajude a criar soul, user, agents.

Preciso que você use o seu de inspiração, mas me ajude a criar uma agente de conteúdo.

Então, essa agente de conteúdo, ela vai ler conteúdos redes sociais, vai postar coisas, vai fazer brainstorming, vai fazer copy, vai cuidar de canal, vai cuidar de tudo.

Ela tem que ser uma super agente de conteúdo. Então, me ajuda a criar essas personalificações para esses arquivos raízes para gente construir ela e aí a gente põe aqui então a gente pode deixar aqui o tor trabalhando aqui trazendo as configurações tá então plano que eu recomendo né então aqui olha já sugeriu aqui uma identidade de papel sugeriu só deixar nesse canal aqui sugeriu criar bote novo essa não precisa criar bote novo aqui no caso tá mas você pode fazer isso se quiser sugeriu aqui registrar na configuração do OpenClaw, né?

Ele criou uma governança, então registrar aqui no Agents.md, que é o que eu te ensinei, fazer teste de validação e o escopo, tá?

E aí, cara, eu acho que a única coisa que eu mudaria aqui é que eu acho que ele não precisa criar agente novo no BotFather, então vou colocar aqui, ó.

A única coisa que eu não faria seria o ponto número 3, criar agente novo no Botfather.

A gente pode usar o mesmo perfil do Tor, só que nesse canal específico a gente deixa como esmeralda e cria agente aqui dentro, usando a infraestrutura do Tor.

Então você pode falar aqui para ele que você não precisa criar novo bot, porque pensa, se você criasse novo bot, você tem que adicionar o bot aqui no grupo, só para ele ficar num tópico.

não faz sentido é melhor você usar o Thor aqui mesmo tá então aqui ó ele já criou aqui a a esmeralda já colocou aqui tá atualizando né tudo aqui babá babá babá e você pode usar tudo isso aqui para colocar lá dentro né então a gente coloca aqui e vamos ver aí eu falei para ele do bot fader ele falou assim se você usar o mesmo bot perfil do tor dá para ter a gente separado para a gente arde e workspace separado blá blá ou seja serve para arquitetura e economia não serve para separação total da persona na superfície então tá tá mas eu vou vou não vou ficar lendo tudo aqui aí você pode colocar aqui então vou pegar aqui por exemplo esses Thor, eu vou te passar aqui então os Prompts que a gente pode vai criar da personalidade da Esmeralda, tá?

Então a gente pega aqui, fala pro Thor isso aqui e a gente dá forward nessas mensagens aqui.

Select, E aí ele vai criar o agente aqui dentro, tá bom?

Então assim, gente, você vê que é bem fácil, tá?

Tipo, é só você conversar no Telegram. Então você cria o tópico que você quer criar o agente isolado e pede pra ele criar o agente isolado aqui dentro.

Então se você precisar, pode mandar esse material aqui ou mandar a documentação oficial.

Fala pra ele, olha, leia a documentação do OpenClaw e crie agente isolado chamado Esmeralda aqui dentro.

Se você precisar que eu crie a personalidade, o Agent Sultan, me faça perguntas que eu vou te ajudar a construir.

Então você pode pedir para o seu OpenClaw te fazer perguntas para você construir a nova personalidade do seu agente, tá bom?

Então é isso, gente. Agora a próxima aula é de controle de missão. Qualquer dúvida que você tiver, use o nosso grupo de apoio do minicurso e eu vejo vocês na próxima aula.

Tamo junto e bem-vinda esmeralda à vida. confirmado esmeralda bora nascer aqui no tópico e aí a gente pode fazer isso tá considere aula concluída se você quiser ficar aqui só para ver funcionar a gente faz esse teste Então, olha só, consegui configurar a esmeralda aqui e olha qual foi a treta, né?

Então, tipo, a esmeralda, ela criou, né? A estrutura dela aqui. Então, a gente viu aqui, ela fez blá blá blá, fez tudo.

Confirma a esmeralda, bora nascer. Vou montar a esmeralda, achei uma pegadinha, aí ela achou aqui erro, aí ela pegou risco aqui, blá blá blá, e ela mesmo corrigiu o erro e ela reiniciou o Gator.

e aí ela ficou em silêncio ela ficou lá com quem eu falo blá blá blá blá blá e aí eu descobri que na verdade aí eu falei com o Thor no outro tópico aqui e falei Thor a Esmeralda tá viva?

Ela falou pô tá viva sim eu falei pô ela não me responde aí ele falou pô achei o problema ela tá como required mention true então a Esmeralda como ela nasceu de uma configuração zerada ela só funciona se você marcar ela então você fala assim Oi Esmeralda Esmeralda qual o seu propósito de vida?

Então a Esmeralda ela é agente separado no mesmo workspace do Tor que ela funciona isoladamente aqui nesse tópico aqui.

Então você pode criar outros agentes em tópicos do Telegram.

Tá bom? Tamo junto! 2026 é o ano dos agentes. Todo mundo quer, toda empresa quer ter o seu próprio agente.

Seja assistente pessoal, seja funcionário super inteligente que executa, que não come, que não dorme e que não reclama e que ele faz as coisas sem pensar, sem pensar muito, claro, mas faz as coisas com muita proatividade e muita perfeição.

No vídeo de hoje eu quero não só falar sobre as ferramentas que eu adoro, que é o OpenCLoud, sobre Cloud, sobre SuperBase, mas eu quero trazer para vocês passo a passo de como você pode montar o seu controle de emissão.

Então eu vou mostrar para vocês como eu planejei o meu controle de emissão, como eu peguei template de controle de emissão, Como eu montei a documentação, como eu subi no GitHub, eu vou mostrar toda a jornada de construção desse controle de emissão, tá?

Esse vídeo aqui é para você que está dando seus primeiros passos com seus agentes e precisa de norte para entender como construir dashboard para a administração empresa inteira.

O que você vai aprender nesse vídeo é exatamente isso aqui que você está vendo na minha Tella.

Então eu vou te ensinar como montar esse controle aqui de emissão, onde você vai ver esse Kanban para você pôr as tarefas que seus agentes estão fazendo, o que eles estão fazendo ou não, para você administrar os seus conteúdos, ver o que você está fazendo, postar nas redes sociais direto, para você ver as métricas das suas redes sociais, as métricas dos seus negócios, que inclusive ficou muito legal esse dashboard, para você ver também o que o mercado está falando sobre trend de mercado, sobre sinais, sobre ideias de conteúdo.

Então eu vou mostrar para vocês como construir essa estrutura completinha aqui que ficou bem legal assim, não acho que essa é a versão final, longe disso, mas já é uma boa base aqui para você dar pontapé aí na sua estrutura, tá?

Então, parte do vídeo de hoje! Então a primeira coisa que eu fiz quando eu quis montar esse controle de missão foi chegar para a minha Mora aqui, minha Chief of Staff, minha Cosa Mora, e pedir para ela analisar esse REPL, pedir para ela ver se tem Prompt Injections, se tem algum Malware, e eu falei para ela analisar esse template aqui.

Então, de vez eu construí controle de emissão do zero, eu pesquisei na internet, eu achei bonito esse template aqui desse rapaz aqui, e eu decidi usar ele como base para construir o meu controle de emissão, inclusive ele vem com escritóriozinho aqui em 3D eu achei isso charmezinho assim então achei bem legal assim então o que eu fiz para a Mora né inclusive dar os créditos aqui é Carlos Azustre né e aí o que eu pedi para Mora foi para ela analisar esse essa ferramenta para ela fazer audit de segurança né então esse sistema se chama TenacityOS E aí ela fez aqui uma análise e falou que não encontrou malware, mas que ela encontrou algumas vulnerabilidades de segurança.

Então a primeira coisa que eu pedi para ela fazer foi montar PRD desse controle de emissão e depois também dentro desse PRD ela vai incluir esses fix desses problemas de segurança.

Às vezes não é nenhum problema de segurança, às vezes pode ser a própria configuração da ferramenta que a IA identifica como problema de segurança quando nem é tanto assim.

Mas como eu não sou desenvolvedor e não sou uma pessoa técnica, eu não tenho a clareza para dizer se isso aqui é crítico ou não.

E aí eu vou ter que confiar na voz da minha IA, mas o que eu posso fazer é criar alguns prompts para fazer ela dar double check e trabalhar nisso aqui, tá?

Então, a primeira coisa que eu fiz foi criar esse PRD aqui.

Se você não sabe o que é PRD, a gente pode até fazer uma pergunta aqui.

Então, PRD significa Product Required Document, mas eles chamam de várias outras coisas.

Mas o PRD aqui, por exemplo, é esse conceito de desenvolvimento de produto.

Então, são todos os requisitos que você quer pôr no seu produto.

Então, o que o produto vai ter? O que ele vai fazer? Como ele vai fazer? Quais são as funcionalidades? O que vai ser o branding do produto? Ele já define tudo, né? Então, a primeira coisa que eu fiz foi criar esse PRD para trazer esse controle de emissão, né?

E eu pedi para minha IA pensar profundamente e me ajudar a planejar esse deploy para a nossa estrutura e não, claro, de esquecer de incluir esses fixes que são essas questões que ela pegou aqui, né?

Então, ela pegou e fez resumo executivo do que é essa ferramenta, né?

Ela diz como que tá minha infra, ela mapeou aqui as seis fases, né?

E ela me diz aqui o que eu preciso fazer ou não.

No caso, eu já usava o CloudFlare Tunnel, né? Que é pra poder acessar esse dashboard aqui, chamado amora.empreendedor.vc, mas eu acabei tirando aqui essa estrutura, eu não tenho mais esse CloudFlare Tunnel, e aí eu desliguei e uso o TailScale agora, ou seja, basicamente eu acesso minha VPS diretamente usando essa ferramenta chamada o TailScale, tá?

E aí eu comecei a refinar aqui pouco né, então eu expliquei para ela que eu quero usar o tail scale, blá blá blá, então ela tirou e ela removeu essas questões aqui do login e tudo mais e simplificou o processo né.

E aí o segundo passo que ele é muito importante nessa jornada, foi de instalar essa skill chamado Super Powers, tá?

Então, essa skill do Super Powers, ela é muito importante porque ela permite que o seu agente ganhe superpoderes.

Então, ele ganha superpoderes em três grandes aspectos aqui, quer ver?

Aqui, ó. Então, ela ajuda o seu agente a fazer brainstorming. Então, ele te ajuda a ele te perguntar as coisas antes de construir o PRD, antes de construir o produto, antes de fazer qualquer coisa.

Ele te ajuda a construir planos, né? Então ela te ajuda a quebrar o projeto em pequenas tarefas, a planejar tudo.

Ele ajuda a criar essa questão de subagentes, então como delegar, fazer esse despatch de subagentes por tarefas e executar esses planos.

mexe com a questão de compliance, qualidade do código e tudo mais, ele faz test drive do código e etc.

Então é uma ferramenta que ela se ativa na inicialização da conversa como default e eu gosto bastante dela porque ela faz a IA sempre tá pensando, sempre elaborando planos e não só sair executando as coisas.

Então para você usar esse super powers aqui basicamente o que você tem que fazer é só copiar o link aqui do GitHub né se você quiser você pode fazer fork né para o seu GitHub se você tiver uma conta lá e aí o que eu pedi foi para ela instalar esse skill aqui tá então se você ver aqui ela vai ver aqui ó super power instalado três skills copiadas brainstorming writing plans execute in plans né então eu cheguei para ela e falei assim olha use o brainstorming writing plans do Super Powers para revisar o nosso PRD do Mission Control.

Então ela releu o PRD que ela montou inicialmente, antes de eu criar essa skill, e ela começou a me fazer perguntas.

Pergunta 1, escopo do uso. Pergunta 2, permissões por role. Pergunta 3, Fork ou Upstream. Pergunta 4, 3D Office. E aí pergunta do escritório, pergunta 5 comportamento dos personagens, desculpa do terminal.

Então ela foi fazendo essa análise aqui e no final ela me sugeriu essas funcionalidades aqui de must have do que precisa ter e ela sugeriu essas aqui de nice to have que são legais de ter.

E aí eu falei para elas assim, não eu quero deixar essas aqui como must have e as outras a gente pode deixar como nice to have né.

Então o que eu falei para ela inclusive que eu queria que o front tivesse pronto para eu poder gravar esse conteúdo que vocês estão vendo.

Então, só porque eu tô mostrando esse front bonitinho aqui, não quer dizer que tá tudo funcionando.

Isso aqui, grande parte das coisas que estão aqui é mockup.

Então, esses dados aqui são mockados, porque eu ainda não terminei esse controle de emissão.

Eu basicamente instalei ele, porque eu tô precisando desse controle de emissão, porque até então eu fazia tudo muito pelo Telegram, e eu aproveitei para gravar esse conteúdo para vocês, para mostrar como eu faço, como eu faria, como eu estou fazendo.

Então, beleza. Então, a gente tem aqui a V1, tem aqui a vitrine, né?

O que vai ter, mas vai ser backup básico, né?

E aí, ela continua aqui com a pergunta aqui do branding, pra gente definir o branding, tá?

Então, ela montou aqui, né? E aí, eu cheguei pra ela e ela me gerou aqui esse documento aqui, que é esse MissionControlDesign.md e o MissionControlImplementation.md.

E aqui vai ponto importante e é motivo pelo qual o cloud está aberto aqui na minha janela da direita.

Então eu decidi fazer a fundação do meu controle de missão usando o cloud de vez usar o OpenCLoud.

E aí você vai falar pra mim, mas Bruno, por que esse OpenCLoud pode executar e construir tudo sozinho?

Por simples motivo, porque eu acredito que toda vez que eu peço uma tarefa muito complexa de desenvolvimento de software para o meu OpenCLoud, eu sinto que ele bebe muito token.

O meu OpenCLoudzinho aqui, meu Tamagotchi, ele é alcoólatra. Ele, cara, bebe demais e isso é problema. Então, o que eu decidi fazer foi usar o terminal e usar o Cloud Code para fazer isso, porque na minha cabeça, quem não tem muita experiência no assunto, mas que eu pressuponho, é que eu achei que usar o Cloud ia sair mais barato para eu fazer a fundação, da minha ferramenta e eu poderia continuar a implementação dela pelo OpenCloud que ficaria mais barato.

Então assim, eu não tenho nenhum artigo científico, eu não tenho nenhuma prova de que realmente é mais barato usar o Cloud, eu só resolvi plugar ele aqui e fazer.

Então o processo que eu fiz basicamente foi de instalar o Cloud Code, então se você não tem o Cloud Code, você vai no Google, digita Cloud Code ou você acessa aqui diretamente esse endereço aqui que está na minha Tella, cloud.com.br Product Cloud Code e aqui você tem esse comando aqui tá?

Então esse aqui é o comando do Cloud Code, então basicamente você copia esse comando aqui, você vai para o seu terminal, você cola esse comando aqui e você instala o Cloud Code.

Uma vez que você instalar o Cloud Code e ele vai confirmar que ele instalou para você, basta você vir aqui e digitar Cloud e aí ele vai abrir o Cloud dentro do seu computador aqui tá?

Então no caso o que eu fiz Eu pedi para o meu cloud acessar a minha VPS.

Então eu uso a VPS da Hoxinger. Por que eu prefiro a VPS? Porque a VPS fica online 24x7, porque ela está na nuvem, porque se der qualquer problema tem backup no meu GitHub do meu agente e se der qualquer problema eu simplesmente desligo a VPS e resolvo tudo.

Então, eu gosto de deixar lá, porque se cair minha internet, se cair minha luz, tá tudo na nuvem, tá tudo salvo.

Se eu viajar, tá lá meu agente trabalhando e assim, tá maravilhoso.

Então, eu uso a Rochinger, todos os meus agentes estão na Rochinger.

Então, basicamente o que eu fiz foi entrar na minha VPS, né?

Então, eu vou só exemplificar aqui para vocês terem essa visualização do processo, né?

Então, eu basicamente entrei na VPS aqui. Então, o que eu faço, né? Normalmente, eu copio aqui esse acesso root, né? Então, eu logo aqui dentro dessa parte aqui, eu pego essa senha root aqui, e eu peço para o cloud se conectar na minha vps tá então uma vez que o cloud se conectou na minha vps eu cheguei para o cloud aqui e falei assim brother preciso que você procure esses documentos aqui que é esse super power specs super power planks e que você pega esse prd e que você execute ele dentro dentro da VPS na pasta root e aí ele veio aqui e ele começou a executar tudo tá então ontem eu fiquei cerca de uma hora e meia executando tudo isso aqui né então não se gravar essa parte né basicamente ele ficou executando aqui esses quatro chunks né esses quatro os blocos de informação, que é o Chunk1 Segurança, Branding, o Escritório e o Deploy.

Então ele diz aqui nove horas de trabalho, mas na real é tipo assim uma hora.

E isso que eu ainda parei para revisar algumas coisas.

Então ele veio aqui e ele começou a instalar todo esse projeto aqui pra gente, então ele ficou executando todo esse processo, tá?

Como já tinha esse PRD, esse processo foi todo sendo executado aqui, tá?

Então ele foi fazendo Task 1, Task 2, Task 3, Task 4, foi Step 2, então ele foi executando tudo aqui e esse processo, de novo, demorou cerca de uma hora, uma hora e pouquinho, tá?

então o cloud veio fazendo todo o processo e aí no final ele terminou o prd tá então ele chegou e falou assim olha terminei aqui então eu já criei aqui clone aqui né do seu controle de emissão no seu github já criei a parte de segurança o terminal criei parte de segurança então ele diz aqui tudo que ele fez aonde ele fez tudo mais ele me falou aqui que eu tenho algumas pendências tá então como eu eu eu tô usando agora eu usei o Scale para alugar na minha VPS, eu pedi para ele me passar aqui uma forma de acessar essa VPS, então esse IP que você tá vendo aqui, provavelmente é o da minha máquina aqui, que obviamente eu vou mudar isso aqui no vídeo, e essa aqui é a senha né, então quando ele me passa isso aqui, eu logo aqui dentro da minha VPS, que é essa aqui, e eu consigo acessar esse controle aqui de emissão tá.

Então, quando ele fez todo esse processo aqui, o que eu pedi para ele na sequência foi que ele rodasse esse agente de QA.

Então, uma vez que ele terminou a construção do controle de missão e me passou login e senha, eu cheguei para ele e falei assim, Cláudio, eu quero que você analise tudo o trabalho que você fez E que você veja se deixou passar alguma coisa, se ficou alguma pendência, algum bug, se alguma parte você não gostou, ficou em dúvida.

Então eu dou pra ele essa visão de revisar as coisas e de me perguntar se tem algo que ele fez e ele não tem certeza se aquele era o caminho pra fazer corretamente e se ele precisa que eu intervenha em algum aspecto.

Então ele foi lá. Ele revisou todas as minhas questões, ele viu tudo aqui bonitinho e aí ele ficou trabalhando e aí a gente chegou nessa versão aqui, tá?

Então assim, basicamente isso aqui inteiro foi feito no primeiro prompt, tá?

Eu diria que 85% de tudo que vocês estão vendo aqui na minha Tella foi de prompt só, cara, que é bizarro.

Por por isso que é muito importante você fazer esse prd por isso que eu deixei aqui então tudo que eu tô explicando para vocês aqui tá num passo a passo aqui tá então a etapa 1 é você fazer scan instalar o template tá para dois é você fazer prompt injection malware nessa esse audit etapa 3 é você montar o prd daí você instala aqui o super o que eu recomendo você executar no seu terminal é esse comando aqui chamado cloud espaço if-in-if dangerous skip permissions então quando você faz isso ele não fica te perguntando para executar as coisas ele vai lá executando aí o próximo passo é você logar na sua vps você procurar o prd dentro da vps né e aquele peguei print dele achando né então encontrado prd tá aqui que é que eu leio o E aí eu falei para ele assim ó vamos executar o PRD, ative skill super powers, execute o PRD dentro da VPS, em cada etapa verifique se está tudo funcionando né, então esse foi o prompt e aí depois eu pedi para ele analisar o PRD, revisar o que foi feito e ver se está tudo em ordem né, então dar aquele double check.

Então basicamente esse aqui foi o trabalho da minha Claudete aqui que ela ficou trabalhando e eu fui acompanhando isso aqui pelo Telegram tá.

Então, depois que ele terminou a a revisão do PRD e tudo mais, eu peguei e mandei áudio, né?

Então, eu cheguei e mandei áudio e falei assim, olha, Mora, quero que você revise tudo, eu quero que você adicione.

Então, você vê que eu mandei áudio longo, cinco minutos, né?

Então, eu mandei tipo uma visão pra ela, falando assim, olha, Mora, eu quero colocar Kanban, estilo do Trello, Eu quero criar uma área de conteúdo, eu quero criar uma área de pesquisa de mercado, uma área com integração com o meu Notion, quero ter dashboard dos meus SaaS, quero ter a questão do Superbase, porque eu não estava usando Superbase, quero criar esse feedback loop para ela cruzar todas as minhas redes sociais, cruzar tudo e ver o que eu fiz e o que eu não fiz, quero fazer a gestão dos meus boss, dos meus agentes, então eu mandei áudio aqui para ela e ela me trouxe plano aqui para gente fazer tudo isso aqui que ela implementou tá então é o que eu fiz para ela foi você peguei essa mensagem para falar para ela amor vamos começar e aí ela falou assim cara primeiro preciso ver o super base bababá bababá e ela começou a executar tá Então, ela começou a executar, eu falei assim, tá, ela pediu para eu ir no Super Base e ativar o Super Base, eu falei, olha, não consigo fazer isso agora, estou na rua e tudo mais.

E aí, ela foi construindo as coisas ela mesma. Então, você pode ver que o mais legal de tudo aqui no OpenCLoud é que ela foi construindo e ela foi tirando o Print Screen para me mandar a visão dela.

Então, isso aqui que está na sua Tella é a visão do computador da Amora.

Então, ela tem esse computadorzinho aqui e ela foi implementando tudo.

Então, cara, você pode ver, daí às vezes ela. travava, né? Ela falava assim, vou fazer isso e aí ela não respondia mais.

Aí eu falava assim, e aí? Pode seguir. E aí ela começou a seguir, foi mandando as coisas e tudo mais.

Então, ela terminou aqui de entregar a parte de conteúdo, né?

Que é o front-end do conteúdo, que se vocês olharem aqui no dashboard, né?

Então, Ela entregou essa parte para mim enquanto eu estava na academia.

Achei isso muito legal, né? Estava malhando, mandei áudio para ela, ela montou aqui isso aqui, né?

Então, essa área de conteúdo eu consigo fazer a ejeção, editar o conteúdo e eu consigo publicar ele diretamente, agendar ele e tudo mais, né?

Então, aqui eu consigo categorizar os conteúdos, né? Deixar como calendário, deixar como lista e os conteúdos arquivados que foram já os feitos, né?

E o mais legal de tudo é que eu pedi para ela criar tracking.

Então, ela criou tracking dos últimos sete dias da performance do conteúdo, porque aí eu consigo saber que conteúdo que performou bem ou não, tá?

E aí, antes que você pergunte, Bruno, qual API você usa para pegar os dados dos conteúdos?

Eu uso uma chamada API PHY. Apify. E esse Apify eu pago, sei lá, 30 dólares por mês, 40 dólares, e ele faz scrapping de todos os dados das minhas redes sociais para mapear esses status aqui, esses dados, tá?

Então, depois que ela terminou esse processo aqui, eu fui mandando áudio para ela, né?

Muy bueno, né? E ela foi executando as coisas pra mim, né? Então, tipo, métricas das minhas redes sociais, métricas, blá, blá, blá.

agora gráfico aqui. Então, ela, tipo, ia fazendo as coisas e me fazendo spam aqui, executando as coisas.

Então, você pode ver que ela saiu executando tudo e tudo mais, né?

E aí, eu falei pra ela, olha, isso aqui que você fez do Intel de concorrentes, eu falei que eu não quero Intel de concorrentes, eu quero ideias de conteúdo.

Então, eu fui dando alguns pitacos durante o processo que eu falei pra ela que eu queria que ela fizesse.

e ela foi executando aqui e me mandando todas as questões.

Então, você pode ver, cara, que ela foi mandando print de todas as etapas do processo aqui para mim e eu fui simplesmente pedindo para ela.

Então, o que eu gosto disso? Eu gosto desse processo porque se eu tivesse feito tudo isso pelo Cloud, eu não teria tido a mesma experiência.

Então, o Cloud simplesmente ia ficar cuspindo o texto aqui falando, executei e agora?

Executei e agora? Tipo, aqui com a Mora, Eu vou fazendo, ela vai me mostrando como tá ficando, como tá ficando o layout e tudo mais.

E aí, por exemplo, se eu não gosto de de alguma coisa, né?

Então eu pedi pra ela criar editor de carrossel. E aí ela achou que ficou animal, né? Mas assim, se eu não gosto, eu chego pra ela e falo, cara, muda isso aqui, não põe aqui em cima e tal.

Então ter essas fotos é charme. Mas você vê que tipo assim, cara, ela só saiu executando assim, ó.

Ela nem me perguntava as coisas, tá? E aí eu fui falando as coisas pra ela e a gente foi construindo tudo isso aqui.

Então, esse processo inteiro de ter construído esse controle de emissão, eu acredito que ele tenha demorado cerca de uma hora, uma hora e meia.

Então, para você construir seu controle de emissão, você poderia ter feito esse processo inteiro pelo seu OpenCLoud.

E, sinceramente, eu acho que eu nem usei muito aqui do meu plano.

Vamos dar uma olhadinha aqui quanto que eu usei da minha da minha sessão.

Ó, eu usei aqui uns 39% do meu limite semanal, tá?

O meu plano é o plano mais caro, é o de mil reais, é o 20 vezes, né?

Então, assim, eu acho que ontem eu tava com uns 22, 25, então ela usou ali uns 15, 20% ali do meu consumo semanal.

Eu não cheguei a estourar a minha sessão do dia, tá?

Então, assim, foi ok, né? Não achei nada muito agressivo, assim. E aí, de novo, foi só fazendo ajustes finos aqui, tá?

Então. Ela foi fazendo as coisas, foi executando e a única coisa que eu falava para ela é tipo, não gostei disso, gostei disso, né?

Então até mostrando aqui, né? Tipo, ó, percebi que ao clicar no card de campanha não aparece subtasks, não tem como marcar agente.

Também nos cards eu quero poder acionar os agentes. Então ela falou, entendi e ela foi refazendo tudo, entendeu?

Então. É isso que eu gosto do Telegram, sabe? Porque, tipo, cara, se eu tivesse que pegar e abrir o controle de emissão e ficar criando esses cards aqui, tipo, amor, agora faz isso, agora executa isso, agora tal coisa, tipo, puta, ia dar muito trabalho.

No Telegram, cara, eu mando áudio, falo, olha, faz isso, isso e isso.

Às vezes você manda áudio dirigindo na academia e ele vai fazendo as coisas.

Então, eu gosto muito da interface do Telegram para eu poder falar com os meus agentes.

mas o controle de missão também ele funciona muito bem para você ter essa visualização da sua empresa dos seus negócios tudo mais tá então eu acho que é muito importante você ter esse controle de missão num segundo nível né então a minha recomendação para você meu jovem padrão é você começar essa jornada então se você é novo nesse mundo de open cloud agentes né então meu primeiro passo é você criar criar agente né então assim o que eu recomendo você fazer você ter esse seu robozinho aqui então você cria esse seu agente E a minha dica pra você é pra você ficar com esse cara aqui até você entender como funciona ele.

Então, você tem que usar esse cara aqui ao máximo.

Como aproveitar o seu agente? Então, quando é aproveitar o seu agente, não é plugar no calendário e falar pra ele ler seus e-mails.

Não. Como você transforma o seu financeiro, o seu comercial e a sua área de suporte de uma forma unificada, onde o seu agente consegue trazer relatórios cruzando dados entre múltiplas áreas, mapeando produto e tal.

Então, assim, usar o seu agente e explorar ele ao máximo.

E durante esse processo aqui, você vai começar a entender como funciona a memória, como funciona a organização do agente, você vai começar a entender aqui como funciona as skills, como ele se conecta com as ferramentas, como funcionam as APIs.

integrações. Então, o primeiro agente é muito essa etapa de você aprender e explorar onde esse seu super funcionário consegue te levar.

A segunda etapa que você pode fazer aqui do seu agente, o que eu recomendo naturalmente, é você ir para uma segunda etapa, onde você passa a ter dois ou três agentes.

Então, você pega aqui essa etapa, que é onde você começa a ter aqui no Telegram múltiplos agentes.

Então eu só recomendo você construir múltiplos agentes quando você chegar num ponto que você tá com agente fazendo muita coisa e você precisa categorizar esse conteúdo para diferentes agentes.

Então aqui no meu caso, por exemplo, eu tenho a Cosamora, que é essa minha chefe geral, então ela administra todos meus negócios, ela desenvolve, ela faz quase tudo, ela é meu braço direito, né?

Mas eu tenho aqui a FLG Amora, por exemplo, que ela é responsável por produção de conteúdo, que é 50, 60% do meu trabalho.

Então como ela tem muita demanda de extrair relatórios, de conectar nas redes sociais, de repostar conteúdo, de transformar texto em carrossel, de transformar YouTube em newsletter, então ela tem muitas skills, muitos crons, então faz sentido ela virar agente com identidade própria.

Assim como o MGM Amora. que é o meu SaaS inteiro, que eu tenho a gestão do meu SaaS inteiro, e ele faz a gestão aqui do meu SaaS.

Então, ela olha aqui o que está acontecendo com o meu SaaS, ela vê o que está acontecendo com o mercado, ela traz feedback dos meus clientes, vê faturamento, vê dados.

Então, eu uso ela, eu conecto ela no back-end, Ela analisa o meu repositório do GitHub, vê bugs de desenvolvimento, analisa meu suporte, meu funil, minha landing page, conversão.

Então, ela é dedicada inteira para o meu SaaS e isso aqui é maluco.

Então, esse passo aqui de você começar a ter múltiplos agentes é quando você acaba tendo uma demanda mais intensa.

Então, quando você tem tem uma demanda maior, para uma área, ou áreas no caso, específicas.

Então quando você começa a ter muita demanda para você fazer.

Outro ponto aqui também é que você pode ter múltiplos agentes quando você precisa que sua equipe use o agente.

Então assim, você quer ter agente para sua equipe usar, né?

Então, aqui no meu Telegram, eu tenho aqui o agente da minha empresa, né?

Que ele traz aqui meu relatório de vendas, que ele traz aqui as coisas.

Então, tipo, ele é da equipe, né? Então, aqui é onde estão os meus sócios e a gente tem esse agente dedicado, que a gente chama ele de Leonardo Da Vinci, que é esse agente que se conecta com toda a minha empresa e ele vê todos os meus dados.

Então, é agente para os para os funcionários, né? Então faz sentido você ter agente para sua equipe e não ter o seu agente próprio, tá?

E eu acho que o terceiro passo, assim, de você começar a ter múltiplos agentes é quando você também usa esses agentes, né?

Usa esses agentes para clientes externos. Então, por exemplo, você tem agente aqui que você vai usar porque você tem uma conta de cliente, você tem uma agência e tal, então faz sentido você ter agente que cuida de diferentes contas, né?

Então, aqui no caso, por exemplo, eu tenho aqui o OpenClose, que é esse meu bot que fica no grupo do meu minicurso, porque a gente já tem, sei lá, 3, 4 mil alunos.

E aí ele fica tipo tirando dúvida das pessoas, as pessoas marcam o Open Closing no grupo e ele fica respondendo as pessoas.

Então eu faço a gestão dele aqui pelo Telegram, mas a interface dele é integralmente no WhatsApp.

Então esse aqui é passo a passo para você construir o controle de missão.

Essa é a estrutura que eu recomendo. Eu vou deixar na descrição o link aqui das skills que você precisa, dos superpowers.

Vou deixar aqui esse template aqui do Carlos Azaustre, para você colocar as TenetOS.

Mas se você quiser também, basta você chegar para o seu OpenClaw e falar assim, tipo, ó.

Aqui, ó. Pesquise para para mim os top 5 controles de missão.

Em inglês, Mission Control. do GitHub e me traga uma sugestão de ideias para implementarmos.

Então, assim, você não precisa pegar esse, necessariamente, esse template que eu estou passando para vocês, vocês podem usar outro, aqui eu achei esse bonitinho.

E o resultado ficou legal. Então, quando vocês construíram o controle de emissão de vocês e fizerem a fundação, seja por cloud ou seja no seu próprio brain cloud, vocês podem ir fazendo os ajustes por aqui mesmo.

Então, você chega aqui e pede para o seu agente, agora faz isso, agora faz isso, agora tal.

E detalhe importante, que isso aqui é importante. Quando você fizer toda essa estrutura, o que eu recomendo a vocês é a coisa que é importante aqui é assim primeiro comece pelo front-end tá então não saia plugando tudo e fazendo tudo se conectar e tudo funcionar primeiro você faz toda a interface então você faz toda a parte de design visual porque uma vez que o agente ele entende quais são os campos ele entende quais são as rotas rotas campos as conexões fica muito mais fácil de você fazer o back-end.

Então depois que você fizer o front-end, o segundo passo é você fazer PRD, então o planejamento.

por sessão. Então, você pode chegar aqui para ele e falar assim, olha, vamos pegar agora esse Kanban que a gente montou de tarefas, vamos montar PRD para a gente desenvolver ele e fazer ele ficar 100% funcional.

Então, você cria esse PRD aqui para ele poder executar essa parte inteira, né?

E depois você vai fazendo PRD por sessão. No caso, eu recomendo fazer PRD porque ele tem muita feature, né?

Então, aqui ele filtra por rede social, aqui ele cria conteúdo por aqui, ele tem métricas, ele publica, Ele tem calendário, lista, então você precisa fazer PRD.

Se o seu for mais simples que esse, for só Kanban, aí você não precisa fazer PRD, aí você só manda o seu agente executar o back-end usando a skill de super power, né?

Usando super super power, tá? super power. Então é isso meus caros jovens empreendedores. Então se você chegou nessa etapa aqui, basicamente agora é você ir pedindo para o seu agente e executando para você o seu serviço.

Então é processo muito simples, relativamente simples, você pode usar o Cloud de novo ou não, deixa o seu critério, você pode usar o Codecs também.

O Codecs pode se conectar no terminal e conectar na sua VPS ou fazer isso na sua máquina local.

Você pode, por exemplo, fazer isso localmente na sua máquina, subir no GitHub e pedir para o seu OpenCloud fazer uma cópia desse GitHub na memória deles ali, no workspace deles, tá?

Então é isso o processo. Se você curtiu, Comenta aí, me fala o que você gostou, o que você não gostou, deixa seu like.

E se você tiver qualquer dúvida, escreve aí que eu respondo vocês.

E não esqueça de seguir o canal para os próximos vídeos, tá bom?

Tamo junto! Boa meu caro, minha cara aluna que chegou até aqui ao fim e assistiu o minicurso inteiro.

O que eu desejo de coração é que você tenha entendido a fundação de você construir agente.

Se essa foi a sua primeira experiência com agente, você Provavelmente abriu muito a sua cabeça e eu espero que você esteja aplicando ele na prática.

Cuidado com alguns erros clássicos, por exemplo, de você ficar mais tempo fazendo mal intenção no seu agente do que você pôr ele para executar as coisas.

Ou você ficar criando muitos agentes que vão ficar parados ou você usar ele para coisas que realmente não geram valor.

Tenta usar eles nas suas atividades do dia a dia.

Tenta automatizar as suas coisas. Tenta pegar passo a passo de uma atividade sua e transformá-la numa skill.

Usa os crons, usa agentes, usa sub-agentes. Então usa o charme todo de open call pra você aplicar ele aonde ele mais gera valor.

Então se você é dono de restaurante, usa ele nos processos, usa pra ver review de Google, usa ele em demandas de quantos a pagar e receber.

Se você cuida de RH, põe ele para administrar folha, entrevistas, criar relatórios.

Se você cuida de vendas, coloca ele para fazer follow up no seu CRM, para ele criar reports, para ele auditar dados, para ele ver transcrição dos seus vendedores.

Você pode usar o OpenCloud em todas as esferas. O que importa no final do dia é sempre criatividade e existem três grandes coisas que você precisa saber sobre agente.

que é Contexto, Rotinas e Skills. Então, quanto mais contexto você der para o seu agente, mais ele vai saber sobre você, sobre o que ele tem que fazer, sobre o que ele está fazendo, mais ele vai acertar o trabalho dele, tá?

Então, se você quiser, eu estou deixando aqui numa aula bônus, dois vídeos meus do YouTube, que estão aqui embaixo, tá bom?

Então, esses meus vídeos do YouTube, vocês também vão ter acesso ali na aula da Hotmart, que é vídeo que eu explico para vocês sobre o que é conceito de agente.

Então, que é contexto, rotina e skills. Então, se você quiser ter esse vídeo aqui, que você pode se aprofundar nesse vídeo, tá?

É vídeo de 37 minutos, do próprio YouTube mesmo. Aproveita e já segue o canal lá. E a gente tem esse vídeo aqui do segundo cérebro, que aí eu explico como construir esse cérebro, que você consegue trabalhar com OpenClaw, ChatGPT, com o Cloud, tudo ao mesmo tempo e se você quiser saber como aplicar esse conselho para a empresa, a gente também tem o Pixel AI Hub, tá?

Então vou deixar aqui embaixo o Pixel AI Hub, se você já é membro do Pixel AI Hub, top demais, espero que você tenha curtido o minicurso, se você não é, tá aqui o link do minicurso para você conhecer.

E lembre-se, no final do dia, que o seu agente é funcionário digital e que você tem aqui uma pessoa trabalhando e que ela é super inteligente.

E que a tendência é que quanto mais contexto você dá para o seu agente, mais ele te conhece, mais tarefa ele executa, mais inteligente ele fica.

Então a jornada que você passou foi essa jornada de vários aha moments, de várias vitórias.

Então você passou pela jornada do meu agente respondeu, pela personalidade, por ele trabalhou pra mim e criou minhas próprias skills, por ele começar a trabalhar sozinho, por ele lembrar de mim e das minhas decisões, por eu conectar APIs, sistemas e senhas, para ele falar comigo, onde eu trabalho, para ele me ajudar a guiar as coisas, para ele operar em cima da minha vida, para ele ter uma equipe quando eu precisar, de múltiplos agentes, e agora você sabe construir o cockpit completo, tá?

Então, se você chegou até aqui, show de bola, você tem esse material inteiro para você ler aqui depois, tá?

Tudo completinho, bonitinho. E uma coisa que é muito importante, por favor, colabore com isso aqui para mim, tá?

Que é a nossa NPS. Então, eu vou deixar aqui o link de NPS na descrição dessa aula, mas eu preciso muito que você avalie ela para mim, Aqui, avalie sua experiência para mim, tá?

Muito importante para mim entender o que você achou do curso, da dinâmica, das aulas, da profundidade.

Eu quero saber se você usou o Starter Kit, se o Starter Kit te ajudou.

Então, para mim é muito importante ter essa visualização. Seu feedback, ele conta muito. E se você precisar de qualquer coisa, qualquer sugestão, eu estou aqui no nosso mini-grupo aqui do OpenCloud com o Bruno Acamoto, tá bom?

sucesso na sua jornada, tô torcendo muito por você e eu espero te ver no Pixel e Hub se você não estiver lá com a gente, tá bom?

Tamo junto de mais, até mais.
