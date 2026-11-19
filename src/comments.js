// Biblioteca local e autoral de comentários em português brasileiro.
// O gerador usa correspondência de temas e variações de texto; não chama serviços externos.

const TOPICS = [
  { id:"comida", terms:["receita","comida","prato","cozinha","ingrediente","bolo","doce","sobremesa","restaurante","almoço","jantar","café","gastronomia","massa","pizza","chocolate"], lines:[
    "A combinação de sabores parece muito bem pensada.",
    "Esse preparo ficou com uma apresentação muito caprichada.",
    "Dá para perceber o cuidado em cada detalhe dessa receita.",
    "A escolha dos ingredientes faz toda a diferença aqui.",
    "O resultado ficou com uma cara ótima."
  ]},
  { id:"viagem", terms:["viagem","viajar","praia","destino","hotel","paisagem","turismo","roteiro","cidade","montanha","trilha","mar","por do sol","pôr do sol","passeio"], lines:[
    "Que lugar interessante para conhecer e explorar.",
    "A paisagem por si só já chama bastante atenção.",
    "Esse cenário transmite uma tranquilidade muito boa.",
    "Um destino que parece render ótimas experiências.",
    "O registro conseguiu mostrar bem a beleza do lugar."
  ]},
  { id:"pets", terms:["cachorro","cão","gato","pet","filhote","gatinho","cachorrinho","animal","veterin","adoção","adocao"], lines:[
    "Que registro cheio de personalidade.",
    "Dá para ver o quanto esse companheiro é especial.",
    "Esses momentos com os pets são sempre únicos.",
    "Uma fofura de publicação.",
    "O jeito dele já conquista a atenção."
  ]},
  { id:"familia", terms:["família","familia","filho","filha","mãe","mae","pai","avó","avo","aniversário","casamento","criança","crianca"], lines:[
    "Momentos assim merecem mesmo ser registrados.",
    "Uma lembrança que certamente vai ter muito valor.",
    "O carinho presente nesse momento aparece em cada detalhe.",
    "Que registro bonito de um momento especial.",
    "São ocasiões que ficam na memória."
  ]},
  { id:"fitness", terms:["treino","academia","corrida","correndo","maratona","musculação","musculacao","exercício","exercicio","fitness","crossfit","bike","pedal","esporte"], lines:[
    "A consistência é o que constrói resultados ao longo do tempo.",
    "Muito bom ver essa dedicação ao treino.",
    "Cada etapa faz parte da evolução.",
    "O importante é manter o ritmo e respeitar o processo.",
    "Disciplina e constância fazem diferença."
  ]},
  { id:"beleza", terms:["maquiagem","make","beleza","cabelo","unha","skincare","pele","estética","estetica","look","moda","vestido","roupa","estilo"], lines:[
    "O resultado ficou muito bem executado.",
    "A escolha dos detalhes valorizou bastante a composição.",
    "Ficou uma combinação muito harmoniosa.",
    "O acabamento chama bastante atenção.",
    "Uma proposta cheia de personalidade."
  ]},
  { id:"negocios", terms:["empreendedor","empreendedorismo","negócio","negocio","empresa","cliente","vendas","marca","marketing","loja","lançamento","lancamento","projeto","equipe"], lines:[
    "É muito interessante acompanhar a construção desse trabalho.",
    "O cuidado com a experiência faz diferença.",
    "Uma proposta bem apresentada e com identidade própria.",
    "Dá para perceber o trabalho envolvido em cada etapa.",
    "Que esse projeto siga evoluindo."
  ]},
  { id:"tecnologia", terms:["tecnologia","software","aplicativo","app","programação","programacao","código","codigo","inteligência artificial","inteligencia artificial"," computador","gadget","inovação","inovacao"], lines:[
    "Interessante ver como essa solução pode facilitar o dia a dia.",
    "A aplicação prática dessa ideia chama atenção.",
    "Tecnologia faz mais sentido quando resolve problemas reais.",
    "Um tema que merece mesmo ser explorado.",
    "Boa explicação sobre essa novidade."
  ]},
  { id:"arte", terms:["arte","artista","pintura","desenho","ilustração","ilustracao","escultura","música","musica","show","exposição","exposicao","fotografia","foto"], lines:[
    "A composição tem uma identidade muito própria.",
    "É interessante observar os detalhes desse trabalho.",
    "Uma expressão criativa muito marcante.",
    "O resultado transmite bastante personalidade.",
    "Um trabalho que prende o olhar."
  ]},
  { id:"educacao", terms:["estudo","estudar","curso","aula","professor","aprendizado","aprendizagem","livro","leitura","conhecimento","escola","faculdade","dica","tutorial"], lines:[
    "Conteúdo útil e apresentado de forma clara.",
    "Sempre vale compartilhar conhecimento assim.",
    "Uma explicação que ajuda a entender melhor o assunto.",
    "Aprender algo novo a cada dia faz diferença.",
    "Boa iniciativa em trazer esse tema."
  ]},
  { id:"natureza", terms:["natureza","flor","flores","planta","jardim","árvore","arvore","verde","animal silvestre","campo","rio","cachoeira","céu","ceu"], lines:[
    "A natureza sempre rende registros especiais.",
    "As cores desse cenário chamam bastante atenção.",
    "Um momento de tranquilidade muito bem registrado.",
    "Os detalhes naturais deixam a cena ainda mais bonita.",
    "Que paisagem agradável."
  ]},
  { id:"casa", terms:["casa","decoração","decoracao","decoração","interiores","arquitetura","móvel","movel","reforma","organização","organizacao","quarto","sala","cozinha planejada"], lines:[
    "A composição do ambiente ficou muito equilibrada.",
    "Os detalhes fazem o espaço ganhar personalidade.",
    "Uma solução bonita e funcional.",
    "O aproveitamento do espaço ficou interessante.",
    "O cuidado com a composição aparece no resultado."
  ]},
  { id:"carros", terms:["carro","automóvel","automovel","moto","motocicleta","motor","automotivo","veículo","veiculo","corrida","pista","restauração","restauracao"], lines:[
    "Esse modelo tem uma presença marcante.",
    "Os detalhes desse projeto chamam atenção.",
    "Muito capricho no resultado final.",
    "É interessante acompanhar esse trabalho de perto.",
    "Uma máquina que não passa despercebida."
  ]},
  { id:"conquista", terms:["conquista","consegui","formatura","aprovado","aprovada","meta","objetivo","vitória","vitoria","certificado","promoção","promocao","novo emprego"], lines:[
    "Parabéns pela conquista e por todo o caminho até aqui.",
    "Que essa etapa abra portas para muitas outras oportunidades.",
    "Resultado de dedicação e persistência.",
    "Que venham novos desafios e realizações.",
    "Uma conquista que merece ser celebrada."
  ]},
  { id:"evento", terms:["evento","congresso","workshop","palestra","encontro","festival","feira","comunidade","networking","participação","participacao"], lines:[
    "Parece ter sido um encontro muito produtivo.",
    "Essas trocas de experiências são muito valiosas.",
    "Muito bom ver iniciativas que aproximam pessoas.",
    "Um registro que mostra a energia do encontro.",
    "Que venham outras oportunidades como essa."
  ]}
];

const GENERIC = [
  "Que publicação interessante, obrigado por compartilhar.",
  "Muito bom acompanhar esse tipo de conteúdo.",
  "Um registro que chama a atenção pelos detalhes.",
  "Interessante a forma como esse tema foi apresentado.",
  "Dá para perceber o cuidado colocado nessa publicação.",
  "Conteúdo que rende uma boa reflexão.",
  "Gostei da maneira como você apresentou esse assunto.",
  "Uma publicação muito bem construída."
];

const OPENERS = ["", "Muito interessante: ", "Gostei de ver: ", "Realmente, "];

function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function createComment(caption, previousComments = []) {
  const source = String(caption || "").slice(0, 5000);
  const normalized = normalize(source);
  const matches = TOPICS
    .map((topic) => ({ topic, score: topic.terms.reduce((sum, term) => sum + (normalized.includes(normalize(term)) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const pool = matches.length ? matches[0].topic.lines : GENERIC;
  const used = new Set(previousComments.map((item) => normalize(item)));
  const seed = hash(source);
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(seed + offset) % pool.length];
    if (!used.has(normalize(candidate))) return candidate;
  }
  const genericSeed = hash(source + "fallback");
  for (let offset = 0; offset < GENERIC.length; offset++) {
    const candidate = GENERIC[(genericSeed + offset) % GENERIC.length];
    if (!used.has(normalize(candidate))) return candidate;
  }
  return null;
}

export function getCommentLibraryStats() {
  return {
    topics: TOPICS.length,
    specificPhrases: TOPICS.reduce((sum, topic) => sum + topic.lines.length, 0),
    genericPhrases: GENERIC.length,
    totalPhrases: TOPICS.reduce((sum, topic) => sum + topic.lines.length, 0) + GENERIC.length
  };
}
