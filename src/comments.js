// Motor local de comentários: identifica assunto, intenção e palavras-chave e combina
// estruturas linguísticas com vocabulário contextual. Não usa IA nem serviços externos.

const TOPICS = [
  { id:"gastronomia", terms:["receita","comida","prato","cozinha","ingrediente","bolo","doce","sobremesa","restaurante","almoço","jantar","café","gastronomia","massa","pizza","chocolate","lanche","churrasco"], nouns:["essa receita","esse prato","essa combinação","esse preparo"], reactions:["bem elaborado","muito apetitoso","caprichado","cheio de detalhes"], details:["a escolha dos ingredientes","a apresentação","a combinação de sabores","o cuidado no preparo"], emojis:["😋","🤤","🍰","🍽️"] },
  { id:"viagem", terms:["viagem","viajar","praia","destino","hotel","paisagem","turismo","roteiro","cidade","montanha","trilha","mar","pôr do sol","passeio","viagem","férias"], nouns:["esse destino","esse lugar","essa paisagem","esse passeio"], reactions:["incrível","encantador","especial","inspirador"], details:["o cenário","as cores do lugar","essa vista","a experiência"], emojis:["😍","✈️","🌅","🌎"] },
  { id:"pets", terms:["cachorro","cão","gato","pet","filhote","gatinho","cachorrinho","animal","veterin","adoção","adoção"], nouns:["esse companheiro","esse pet","esse registro","essa fofura"], reactions:["cheio de personalidade","adorável","especial","encantador"], details:["o jeitinho dele","essa expressão","a personalidade","esse momento"], emojis:["🐶","🐱","😍","❤️"] },
  { id:"familia", terms:["família","filho","filha","mãe","pai","avó","avô","aniversário","casamento","criança","irmão","irmã"], nouns:["esse momento","esse registro","essa lembrança","essa ocasião"], reactions:["muito especial","cheio de carinho","bonito de guardar","marcante"], details:["o carinho envolvido","essa união","a alegria do momento","essa lembrança"], emojis:["❤️","🥰","👏","✨"] },
  { id:"fitness", terms:["treino","academia","corrida","maratona","musculação","exercício","fitness","crossfit","bike","pedal","esporte","evolução","corrida"], nouns:["essa evolução","essa rotina","esse treino","essa conquista"], reactions:["inspirador","consistente","motivador","resultado de dedicação"], details:["a disciplina diária","a constância","cada etapa do processo","a dedicação"], emojis:["💪","🔥","👏","🏃"] },
  { id:"beleza_moda", terms:["maquiagem","make","beleza","cabelo","unha","skincare","pele","estética","look","moda","vestido","roupa","estilo"], nouns:["essa composição","esse visual","esse look","esse resultado"], reactions:["muito harmonioso","cheio de estilo","bem executado","elegante"], details:["a escolha dos detalhes","o acabamento","a combinação de cores","a personalidade"], emojis:["✨","😍","💅","👏"] },
  { id:"negocios", terms:["empreendedor","empreendedorismo","negócio","empresa","cliente","vendas","marca","marketing","loja","lançamento","projeto","equipe","resultado"], nouns:["essa iniciativa","esse projeto","essa proposta","esse trabalho"], reactions:["muito bem construído","promissor","interessante","cheio de potencial"], details:["o cuidado com os detalhes","a proposta apresentada","a experiência oferecida","o trabalho por trás disso"], emojis:["👏","🚀","💡","✨"] },
  { id:"tecnologia", terms:["tecnologia","software","aplicativo","app","programação","código","inteligência artificial","computador","gadget","inovação","sistema","digital"], nouns:["essa solução","essa ideia","essa tecnologia","essa aplicação"], reactions:["muito interessante","útil no dia a dia","bem pensado","inovador"], details:["a aplicação prática","a proposta","a facilidade que isso pode trazer","o problema que resolve"], emojis:["💡","🚀","👏","🤖"] },
  { id:"arte_cultura", terms:["arte","artista","pintura","desenho","ilustração","escultura","música","show","exposição","fotografia","foto","cinema","teatro"], nouns:["esse trabalho","essa criação","essa apresentação","essa composição"], reactions:["cheio de personalidade","marcante","criativo","expressivo"], details:["a identidade artística","a composição","os detalhes","a expressão criativa"], emojis:["🎨","👏","✨","😍"] },
  { id:"educacao", terms:["estudo","estudar","curso","aula","professor","aprendizado","aprendizagem","livro","leitura","conhecimento","escola","faculdade","dica","tutorial"], nouns:["esse conteúdo","essa explicação","essa iniciativa","essa dica"], reactions:["muito esclarecedor","útil","bem explicado","relevante"], details:["a forma de apresentar o tema","o conhecimento compartilhado","a clareza da explicação","a dica prática"], emojis:["📚","👏","💡","✨"] },
  { id:"natureza", terms:["natureza","flor","flores","planta","jardim","árvore","verde","campo","rio","cachoeira","céu","mar","pôr do sol"], nouns:["essa paisagem","esse cenário","esse registro","esse lugar"], reactions:["encantador","tranquilo","cheio de beleza","incrível"], details:["as cores da natureza","a luz desse momento","a paisagem","a tranquilidade da cena"], emojis:["🌿","🌸","🌻","😍"] },
  { id:"casa_arquitetura", terms:["casa","decoração","interiores","arquitetura","móvel","reforma","organização","quarto","sala","ambiente","projeto"], nouns:["esse ambiente","essa composição","esse projeto","esse espaço"], reactions:["bonito e funcional","muito acolhedor","bem equilibrado","cheio de personalidade"], details:["o aproveitamento do espaço","a escolha dos elementos","a harmonia da composição","os detalhes"], emojis:["🏡","✨","👏","😍"] },
  { id:"automoveis", terms:["carro","automóvel","moto","motocicleta","motor","automotivo","veículo","corrida","pista","restauração","mecânica"], nouns:["esse modelo","esse projeto","essa máquina","esse resultado"], reactions:["impressionante","muito bem cuidado","marcante","cheio de personalidade"], details:["o estado de conservação","os detalhes do projeto","o acabamento","essa configuração"], emojis:["🚗","🏁","🔥","👏"] },
  { id:"conquistas", terms:["conquista","consegui","formatura","aprovado","aprovada","meta","objetivo","vitória","certificado","promoção","novo emprego","realização"], nouns:["essa conquista","essa etapa","esse resultado","essa realização"], reactions:["muito merecido","inspirador","motivo de orgulho","especial"], details:["a dedicação até aqui","todo o esforço envolvido","a persistência","essa nova fase"], emojis:["🎉","👏","🥳","✨"] },
  { id:"eventos", terms:["evento","congresso","workshop","palestra","encontro","festival","feira","comunidade","networking","participação"], nouns:["esse encontro","essa iniciativa","esse evento","essa experiência"], reactions:["muito produtivo","enriquecedor","especial","interessante"], details:["a troca de experiências","as conexões criadas","a energia do encontro","a oportunidade de aprendizado"], emojis:["👏","🎉","🤝","✨"] }
];

const INTENTS = [
  { id:"pergunta", terms:["?","como fazer","qual","por que","o que acham"], prefixes:["Boa questão!","Tema interessante para conversar.","Essa dúvida é muito válida."] },
  { id:"tutorial", terms:["passo a passo","tutorial","dica","aprenda","como fazer","veja como"], prefixes:["Boa explicação!","Dica muito útil.","Conteúdo bem explicado."] },
  { id:"conquista", terms:["conquista","consegui","formatura","aprovado","vitória","meta alcançada"], prefixes:["Parabéns por essa conquista!","Que ótima notícia!","Muito merecido!"] },
  { id:"divulgacao", terms:["lançamento","novo produto","promoção","promo","inauguração","disponível","compre"], prefixes:["Boa iniciativa!","Interessante conhecer essa novidade.","Sucesso nessa divulgação!"] }
];

const GENERIC = {
  nouns:["essa publicação","esse conteúdo","essa ideia","esse registro"],
  reactions:["muito interessante","bem apresentado","cheio de detalhes","que chama a atenção"],
  details:["a forma como o assunto foi apresentado","os detalhes compartilhados","a proposta da publicação","o cuidado na apresentação"],
  emojis:["👏","✨","😍","💡","🙌"]
};

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function hash(value) {
  let h=2166136261;
  for (const c of value) h=Math.imul(h ^ c.charCodeAt(0),16777619);
  return h>>>0;
}
function pick(list, seed, offset=0) { return list[(seed+offset)%list.length]; }
function countWords(value) { return value.trim().split(/\s+/).filter(Boolean).length; }

export function analyzeCaption(caption) {
  const text=String(caption ?? "").slice(0,5000);
  const normalized=normalize(text);
  const ranked=TOPICS.map(topic=>({
    topic,
    matches:topic.terms.filter(term=>normalized.includes(normalize(term))),
    score:topic.terms.filter(term=>normalized.includes(normalize(term))).reduce((sum,term)=>sum+(term.includes(" ") ? 2 : 1),0)
  })).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  const intent=INTENTS.find(item=>item.terms.some(term=>normalized.includes(normalize(term))))?.id ?? "conversa";
  return {
    topic:ranked[0]?.topic.id ?? "geral",
    keywords:ranked[0]?.matches.slice(0,8) ?? [],
    secondaryTopics:ranked.slice(1,3).map(item=>item.topic.id),
    intent
  };
}

export function createComment(caption, previousComments = []) {
  const source=String(caption ?? "").slice(0,5000);
  const analysis=analyzeCaption(source);
  const topic=TOPICS.find(item=>item.id===analysis.topic);
  const vocabulary=topic ?? GENERIC;
  const seed=hash(normalize(source));
  const used=new Set(previousComments.map(item=>normalize(item)));
  const intent=INTENTS.find(item=>item.id===analysis.intent);
  const candidates=[];
  if(intent) for(let i=0;i<intent.prefixes.length;i++) candidates.push(pick(intent.prefixes,seed,i)+" "+pick(vocabulary.emojis ?? GENERIC.emojis,seed,i+1));
  for(let i=0;i<24;i++) {
    const noun=pick(vocabulary.nouns,seed,i);
    const reaction=pick(vocabulary.reactions,seed,i+2);
    const detail=pick(vocabulary.details,seed,i+3);
    const emoji=pick(vocabulary.emojis,seed,i+4);
    const templates=[
      `Esse ${noun.replace(/^esse |^essa /,"")} ficou ${reaction}, e ${detail} merece destaque! ${emoji}`,
      `Gostei de ver ${noun}: ${detail} deixa tudo ainda mais ${reaction}! ${emoji}`,
      `${noun.charAt(0).toUpperCase()+noun.slice(1)} realmente chama atenção; ${detail} ficou ${reaction}! ${emoji}`,
      `Muito bom! ${detail.charAt(0).toUpperCase()+detail.slice(1)} faz ${noun} ficar ${reaction}. ${emoji}`
    ];
    candidates.push(templates[i%templates.length]);
  }
  const genericCandidates=GENERIC.nouns.map((noun,i)=>`Gostei de ver ${noun}; ${pick(GENERIC.details,seed,i)} ficou ${pick(GENERIC.reactions,seed,i+1)!} ${pick(GENERIC.emojis,seed,i+2)}`);
  candidates.push(...genericCandidates);
  for(let i=0;i<candidates.length;i++) {
    const candidate=candidates[(seed+i)%candidates.length].replace(/\s+/g," ").trim();
    if(countWords(candidate)>=2 && /\p{Extended_Pictographic}/u.test(candidate) && !used.has(normalize(candidate))) return candidate;
  }
  return null;
}

export function getCommentLibraryStats() {
  return {
    topics:TOPICS.length,
    intents:INTENTS.length,
    keywords:TOPICS.reduce((sum,topic)=>sum+topic.terms.length,0),
    combinations:TOPICS.reduce((sum,topic)=>sum+topic.nouns.length*topic.reactions.length*topic.details.length*topic.emojis.length*4,0),
    minimumWords:2,
    minimumEmojis:1
  };
}
