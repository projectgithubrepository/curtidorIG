# curtidorIG

Aplicação local, leve e em português para coletar publicações compartilhadas em um grupo/conversa do Instagram durante um período definido.

## Funcionalidades

- Coleta de Feed, Reels, carrosséis e Stories compartilhados em uma conversa do Instagram, vinculando cada link à mensagem original e à data do compartilhamento.
- Comparação da cobertura por tipo com a referência administrativa da data, quando disponível; itens sem data ou identidade ficam fora da execução até serem confirmados.
- Inventário da coleção de Salvos e do grupo coletivo por URLs diretas, com validação dos destinos e proteção contra envios duplicados.
- Modos TESTE, AUTOMÁTICO e MANUAL. O TESTE não altera o Instagram; o AUTOMÁTICO exige confirmação explícita e revalida cada ação; o MANUAL organiza e registra conferências.
- Planejamento de curtidas, salvamentos, comentários, compartilhamentos, comentários públicos em Stories e reação à mensagem original.
- Comentários preparados localmente, com fallback neutro quando não há legenda legível, mínimo de duas palavras e um emoji.
- Histórico CSV local e relatórios preliminares/diagnósticos para explicar estados concluídos, aptos, bloqueados e não verificados.
- Playwright abre um Chromium com perfil persistente, isolado do Chrome/Edge. O login é feito manualmente e a sessão fica armazenada nos dados locais do aplicativo.
- Botão para interromper a fila.

## Aplicativo para Mac Neo

O build é direcionado exclusivamente ao Mac Neo com Apple Silicon (ARM64). Não são geradas versões para Macs Intel ou outras arquiteturas.

O projeto gera um aplicativo desktop Electron e um instalador DMG, sem exigir VS Code, Node.js ou Terminal no uso cotidiano.

1. Abra a aba **Actions** deste repositório no GitHub.
2. Aguarde a execução **Build macOS app** terminar com sucesso.
3. Baixe o artefato **curtidorIG-macOS-arm64** da execução concluída.
4. Extraia o ZIP, abra o arquivo DMG, arraste **curtidorIG** para Aplicativos e abra pelo Finder ou Dock.

O pacote ainda não é assinado/notarizado com certificado Apple Developer; dependendo das configurações do macOS, pode ser necessário autorizar a abertura em Privacidade e Segurança. O primeiro login no Instagram é manual, pelo botão **Conectar Instagram / fazer login**. Depois disso, a sessão fica armazenada nos dados locais do aplicativo.

Para desenvolvimento, os comandos Node continuam disponíveis, mas não fazem parte do uso normal do aplicativo.

A sessão fica salva nos dados locais do aplicativo neste Mac. Não compartilhe essa pasta.

## Atualizações no Windows

Além do instalador completo, a compilação Windows gera `curtidorIG-Atualizacao-Windows.exe`. Esse patch substitui somente o pacote do aplicativo e os arquivos Playwright necessários; não reinstala o Electron nem copia novamente o Chromium. Execute-o com o curtidorIG fechado ou deixe que o atualizador feche o processo. O patch mantém o diretório de dados do usuário, incluindo perfil autenticado do Instagram e histórico CSV. Se a instalação foi feita em uma pasta personalizada, selecione essa pasta na tela do atualizador.

Use o instalador completo apenas na primeira instalação ou quando houver mudança estrutural que exija reinstalação dos componentes nativos.

## Histórico

O CSV é criado automaticamente nos dados locais do aplicativo e registra data/hora, URL, legenda lida, curtida, comentário, status e detalhes de erro. O histórico e o perfil do navegador ficam fora do Git.

## Regra de origem das publicações

A pessoa informa o grupo de origem e o período. A coleta combina DOM e respostas de rede do Direct para localizar Feed, Reels, carrosséis e Stories, usando a data/hora da mensagem que compartilhou o link. Mensagens com link e identidade, mas sem timestamp, são mantidas como candidatas com data desconhecida e não entram na cobertura nem na execução automática. A coleta só é considerada completa quando a fronteira do histórico e, quando disponível, a referência administrativa forem conferidas. Os detalhes estão em [Regras de negócio](docs/regras-de-negocio.md).

## Regras de negócio completas

Esta seção consolida as regras funcionais que a aplicação deve seguir. As regras descrevem o comportamento esperado; quando uma função ainda não estiver validada na interface real do Instagram, isso é indicado em **Estado atual e limitações**, sem transformar uma limitação técnica em alteração da regra de negócio.

### 1. Configuração e origem do trabalho

- A pessoa seleciona/informa o **grupo de origem** do Instagram e o período de coleta.
- Informa a **URL direta da coleção de destino** dos Salvos (`/usuario/saved/slug/ID/`). A aplicação abre e valida a coleção específica; o nome exibido é extraído da própria página para uso interno no seletor de salvamento.
- Informa a **URL direta da conversa do grupo coletivo** (`/direct/t/ID/`). A aplicação abre a conversa pelo ID, confirma o cabeçalho e extrai o nome para uso interno no compartilhamento.
- Escolhe um dos modos: **TESTE**, **AUTOMÁTICO** ou **MANUAL**. TESTE é o modo padrão. AUTOMÁTICO exige confirmação explícita.
- O fluxo normal começa pela conversa/grupo e pelo período; não depende de colar URLs individualmente.
- Não escolher outro grupo ou coleção por aproximação. As URLs diretas informadas são obrigatórias e devem abrir exatamente a conversa ou coleção correspondente; se a identidade não puder ser confirmada, bloquear as operações dependentes.

### 2. Coleta, período e vínculo com a mensagem

- Coletar publicações compartilhadas no grupo de origem dentro do intervalo informado.
- A data considerada é a data/hora em que o link foi compartilhado na conversa, não a data original da publicação no Instagram.
- Identificar Feed, Reels, carrosséis e Stories quando estiverem disponíveis na conversa.
- Ler o texto do pedido associado a cada link. Na organização habitual do grupo, o pedido informa o que deve ser feito e o link da publicação vem associado a esse pedido; interpretar o conjunto da mensagem, inclusive o texto que aparece antes e depois do link.
- Um link não deve ser interpretado isoladamente quando o pedido está no mesmo bloco/mensagem ou em mensagens diretamente associadas.
- Cada publicação precisa permanecer vinculada ao **ID exato da mensagem original**. A mesma URL compartilhada em mensagens diferentes representa ocorrências distintas e cada mensagem original pode exigir sua própria reação de conclusão.
- Eliminar duplicação técnica do mesmo link dentro da mesma mensagem, mas não fundir ocorrências da mesma URL em mensagens diferentes.
- Ignorar links incompatíveis, mensagens fora do período e publicações indisponíveis, registrando o motivo.
- Consultar o histórico local para evitar repetir trabalho já confirmado.
- Se o histórico da conversa não carregar por completo, não declarar que todo o período foi analisado.

### 2.1 Stories e coleção de destino

- A extração de Stories deve reconhecer permalinks e formatos de compartilhamento aninhados do Direct, sem teto de URLs por mensagem. Cada Story exige identidade verificável do autor e do ID.
- Ao abrir um permalink de Story, mapear a tela intermediária de confirmação: localizar o botão **“Ver story”**, clicar uma única vez, aguardar a abertura e confirmar que a tela intermediária desapareceu antes de ler comentários ou planejar qualquer ação. Se o botão estiver ambíguo ou a tela não avançar, bloquear o Story e registrar o motivo; aplicar a mesma abertura antes de compartilhar o Story ao grupo.
- A varredura da conversa de origem deve encerrar assim que encontrar timestamp anterior à data inicial, usando tanto os horários visíveis quanto os timestamps capturados da rede **somente para o ID exato da conversa selecionada**. Não percorrer dias anteriores sem necessidade. O diagnóstico registra a data mais antiga encontrada e a fonte que comprovou o limite.
- Ao receber versões incrementais da mesma mensagem em respostas de rede diferentes, unir todos os links/IDs extraídos; uma resposta parcial nunca pode substituir uma versão anterior mais completa.
- Reconhecer marcadores de Story em nomes de campos versionados e em metadados como `media_product_type`, `item_type`, `share_type` e `attachment_type`, inclusive em estruturas XMA profundas.
- Preservar IDs longos (64 bits) como texto ao interpretar JSON de respostas HTTP e WebSocket; não converter IDs de mídia do Instagram para `Number`, pois a precisão numérica pode colapsar Stories diferentes.
- A varredura da área Salvos deve abrir a aba **Coleções/Collections** quando ela existir antes de procurar a pasta nomeada. O inventário só é confirmado após localizar um link inequívoco da coleção e ler os itens da página correspondente.
- A cobertura de Feed/Reels e Stories deve ser comparada separadamente com a mensagem administrativa da data selecionada. A divergência mantém o teste parcial; não se deve fabricar ou duplicar itens para atingir a meta.
- A coleção de destino é aberta diretamente pela URL específica fornecida no formulário (`/usuario/saved/slug/ID/`). A aplicação valida o caminho e o ID da coleção, percorre os itens e extrai o rótulo da própria página para selecionar essa pasta ao salvar.
- Se a coleção não for localizada, o diagnóstico deve preservar URL da página, texto visível e motivo da falha; não assumir que qualquer publicação genericamente salva pertence à coleção escolhida.

### 3. Regras obrigatórias por publicação

Aplicar as regras a cada publicação individualmente, considerando o pedido associado:

1. **Curtir:** obrigatório em toda publicação.
2. **Salvar:** obrigatório em toda publicação, na coleção/pasta exata escolhida na configuração (por padrão, `Curtido`). Não basta confirmar que a publicação está genericamente salva: é necessário confirmar a coleção correta. Se o estado ou a coleção não puderem ser comprovados, não alternar o controle e não arriscar dessalvar por engano.
3. **Comentar:** comentar por padrão, inclusive quando o pedido disser que o comentário é opcional. Só deixar de comentar quando houver uma instrução explícita proibindo comentário, como “não comentar”.
4. **Enviar/compartilhar no grupo coletivo:** obrigatório para toda publicação, independentemente do pedido individual. O destino é o grupo coletivo configurado. Enviar ao grupo não substitui curtir, salvar ou comentar.
5. **Reação de conclusão no grupo de origem:** usar o emoji configurado — padrão `🌸` — na mensagem exata que compartilhou aquela publicação. Só reagir depois de concluídas todas as ações obrigatórias e todas as ações adicionais explicitamente solicitadas. Se a reação já existir nessa mensagem, não repetir. Na interface, a configuração é identificada como **“Emoji de check no grupo”**.

A proibição explícita de comentar prevalece sobre a regra padrão de comentário. Ela não elimina as demais ações obrigatórias. Pedidos opcionais de comentário não significam “não comentar”.

### 4. Comentários: conteúdo, formato e fallback

- Todo comentário deve conter **pelo menos duas palavras e pelo menos um emoji**.
- Preferir comentários contextualizados, estruturados e relacionados ao texto/assunto identificável da publicação, evitando frases genéricas ou repetitivas.
- A legenda deve ser usada quando estiver legível. O motor local identifica assunto, palavras-chave e intenção textual para compor o comentário.
- **Quando não houver legenda legível ou ela estiver ausente**, ainda deve ser preparado um comentário alternativo para cumprir a regra de negócio, desde que o pedido não proíba comentar.
- O fallback deve ser neutro, não inventar características, imagens, fatos ou assunto que não foram identificados e respeitar o mínimo de duas palavras e um emoji.
- Consultar o histórico para evitar repetir comentários recentes.
- Informar no resultado se o comentário veio da legenda/conteúdo textual ou do fallback sem legenda legível.
- Se o pedido proibir comentário, não gerar nem publicar comentário, mesmo que exista legenda.

### 5. Regras específicas para Stories

- Stories também fazem parte do escopo de análise e devem aparecer individualmente no relatório.
- Quando houver recurso de comentário público no Story, o comentário deve ser publicado **no próprio Story**, de forma pública/visível nele.
- Não substituir comentário público por resposta privada/DM. Se o Instagram só permitir resposta privada ou não disponibilizar comentário público, bloquear essa etapa e explicar o motivo.
- Todo Story identificado também deve ser compartilhado no **grupo coletivo de envios**, conforme a regra geral de envio de publicações.
- A reação de conclusão continua vinculada à mensagem original do grupo de origem e só ocorre após as etapas obrigatórias daquele item.
- A regra de comentário opcional e a exceção de proibição explícita também se aplicam aos Stories.

### 6. Modos de operação

#### TESTE (padrão)

- Simular o fluxo completo que seria considerado no AUTOMÁTICO, sem alterar a conta do Instagram.
- Não curtir, comentar, salvar/dessalvar, compartilhar/enviar ou reagir. Nenhuma mutação pode ocorrer no TESTE.
- Inspecionar cada item, interpretar o pedido, identificar legenda/conteúdo, preparar o comentário (inclusive fallback), verificar os estados atuais e montar o plano de todas as etapas.
- Mostrar por publicação: link e tipo de conteúdo; mensagem de origem e regra interpretada; legenda ou ausência dela; comentário preparado e sua origem; estado de curtida, coleção/salvamento, comentário, envio ao grupo e reação; decisão de cada etapa; dependências, bloqueios e justificativas.
- Distinguir claramente:
  - **já concluída/verificada**;
  - **simulada e apta** — seria executada no AUTOMÁTICO, mas não foi executada no TESTE;
  - **candidata aguardando verificação** — não pode ser contada como ação pronta;
  - **bloqueada** — não executar, com motivo;
  - **estado não verificado** — não presumir que está pendente nem concluído;
  - **inspeção interrompida** — item ou etapa não foi analisado integralmente.
- Não somar estados não verificados como ações aptas à execução.
- O resumo geral deve ser coerente com o detalhamento por item. “Itens analisados” não significa “ações executadas”; “etapas no plano” não significa “etapas concluídas”.
- O TESTE deve mostrar o plano completo, e não apenas totais ou uma contagem agregada.
- Ao terminar o TESTE, exibir imediatamente um **relatório preliminar na própria interface** com totais separados por tipo de ação (curtidas, salvamentos na coleção, comentários em publicações, envios ao grupo coletivo, reações na mensagem original, comentários públicos em Stories e envios de Stories). Para cada tipo, separar ocorrências analisadas, aptas no plano, aguardando pré-requisitos, já concluídas, bloqueadas e não verificadas. Esses números nunca podem ser apresentados como ações executadas.
- Em cada publicação, mostrar também o texto original do pedido capturado no grupo, o link, o tipo, a data do compartilhamento, o comentário preparado e a decisão individual de cada etapa.

#### Referência administrativa posterior ao fechamento

A mensagem administrativa com os totais de Feed/Reels e Stories é publicada depois do fechamento. Ela serve somente como gabarito posterior de conferência: a coleta precisa funcionar sem essa mensagem. A ausência do aviso não pode impedir a coleta nem, isoladamente, classificar o resultado como incompleto. Quando o aviso correspondente existir, comparar os totais por data e por tipo; nunca reutilizar metas de outro dia nem deixar valores fixos no código. O exemplo de 18/11 (66 Feed/Reels + 34 Stories) é apenas referência histórica para validar o teste.

### Cobertura da coleta por data

- Quando houver mensagem administrativa com quantitativos para a data, usar esses números como referência de cobertura, sem presumir que a varredura encontrou tudo.
- Comparar separadamente Feed/Reels e Stories, exibindo esperado, encontrado, faltante e excedente. Exemplo de referência: 18/11 = 66 Feed/Reels + 34 Stories = 100 itens.
- A varredura não pode usar um teto fixo de quantidade de mensagens, respostas de rede ou rodadas de rolagem. Deve continuar até encontrar uma mensagem anterior à data inicial selecionada ou confirmar, após movimento real do painel correto, o início do histórico. Se a rolagem ficar travada por 8 tentativas consecutivas, interromper como coleta incompleta e registrar o estado do contêiner; nunca tratar a falta de movimento como prova de que o histórico terminou.
- A coleta é completa quando a fronteira temporal é comprovada (marco anterior à data inicial ou início real do histórico) e, quando houver aviso administrativo correspondente, as contagens por Feed/Reels e Stories conferirem. Sem aviso administrativo, a fronteira temporal continua sendo o critério de encerramento.
- Preservar o identificador completo de Stories (/stories/usuário/ID). Nunca reduzir o link ao nome do perfil, pois isso colapsa Stories diferentes da mesma pessoa.
- Mensagens com link e identidade, mas sem timestamp, não podem ser descartadas. Mantê-las como candidatas com data desconhecida, informar a quantidade e não executar ações nelas até confirmar que pertencem ao período.
- A quantidade de mensagens/pedidos não deve ser confundida com a quantidade de URLs únicas. Deduplicar URLs não pode apagar pedidos distintos identificados por message_id.
- Normalizar texto administrativo e instruções com compatibilidade Unicode (NFKD), pois avisos do grupo podem usar letras matemáticas/itálicas estilizadas e ainda precisam ser reconhecidos.
- Antes de classificar envios ao grupo coletivo como aptos, localizar a conversa pelo nome exato e confirmar que abriu uma conversa com ID.
- Quando houver URL direta do grupo coletivo (`https://www.instagram.com/direct/t/ID/`), usá-la como localizador primário: abrir o ID informado, confirmar que o ID da conversa aberta corresponde ao ID da URL e validar o nome exato no cabeçalho. Só depois inventariar o histórico. Se ID ou nome não coincidirem, bloquear os envios; não recorrer silenciosamente a outra conversa. Se a coleta estiver incompleta ou o grupo de destino não for confirmado, cancelar a execução automática antes de qualquer ação.

#### Diagnóstico obrigatório no relatório preliminar

- “Não verificada” nunca pode aparecer sem uma causa específica por publicação e por ação. O detalhe deve informar o controle/elemento procurado, o que foi encontrado, a limitação observada e a evidência que faltou.
- Curtida: separar “controle localizado” de “já curtida/não curtida”. Ausência do controle é estado desconhecido, não prova de que a publicação está pendente.
- Antes de qualquer ação em Feed/Reels, conferir o estado atual na página do Instagram: curtida existente = já concluída; salvamento exige botão + presença na coleção exata; comentário exige identificação do perfil e verificação dos comentários; envio exige conferência da URL no histórico do grupo coletivo. Ação já existente deve ser marcada como **“já concluída — não repetir”**.
- Se o estado atual não puder ser confirmado, bloquear a ação automática. Nunca interpretar ausência de dados como prova de que a ação não foi feita.
- O CSV/histórico local não é prova de conclusão: serve como contexto e proteção de tentativas não confirmadas. A decisão de pular ou executar deve vir do estado atual do Instagram. Reações na mensagem original também são conferidas na própria mensagem antes de selecionar o emoji; se o emoji já estiver presente, não repetir.
- Salvamento: separar três fatos: estado do botão Salvar, disponibilidade do inventário da coleção e presença da URL na coleção exata. Uma publicação salva fora da coleção escolhida não conta como concluída.
- Comentário anterior: informar se o perfil foi identificado, quantos comentários carregados foram examinados e se houve correspondência. “Não encontrado nos comentários visíveis” não equivale a provar que não existe em comentários ainda não carregados.
- Grupo coletivo: o nome digitado não comprova que o destino existe. Enquanto o grupo não for localizado e confirmado, o envio não pode ser classificado como apto no TESTE.
- Cada etapa deve terminar em uma categoria contabilizada: apta/simulada, candidata, aguardando pré-requisito, já concluída, bloqueada, não verificada ou sem classificação. Os totais devem fechar com a quantidade prevista.
- Erros de leitura dos controles precisam preservar a mensagem técnica e os dados de diagnóstico úteis, sem cookies, tokens ou credenciais.

#### AUTOMÁTICO

- Exige confirmação explícita da pessoa.
- Antes de cada ação, reler a instrução associada e verificar novamente o estado atual no Instagram.
- Executar somente ações realmente pendentes, permitidas e com pré-requisitos confirmados.
- Executar uma etapa por vez e verificar o resultado após cada ação.
- Não repetir ação já concluída, não duplicar comentários/envios/reação e não clicar em controles cujo estado seja desconhecido.
- Se uma etapa falhar, ficar ambígua ou não puder ser verificada, interromper aquela etapa e registrar o motivo; não declarar sucesso sem confirmação.
- A reação de conclusão é sempre a última etapa do item, respeitando todas as ações obrigatórias e adicionais solicitadas.

#### MANUAL

- Não executar interações automaticamente.
- Organizar por publicação as ações pendentes, comentários preparados, coleção escolhida, destino de envio e reação que ainda precisa ser feita.
- Permitir acompanhar/registrar as confirmações correspondentes sem confundir uma confirmação manual com uma verificação automática do Instagram.

### 7. Limpeza de publicações salvas (dessalvar)

- A limpeza deve abrir Salvos, localizar a coleção escolhida e listar as publicações nela.
- O processamento é **individual por publicação** e inclui Feed, Reels e carrosséis identificados.
- A operação deve remover o estado de salvo da publicação por completo, não apenas removê-la de uma coleção específica.
- Não apagar a coleção e não apagar a publicação original.
- No TESTE, apenas inventariar/listar e classificar; nunca clicar para salvar ou dessalvar.
- No AUTOMÁTICO, exigir confirmação explícita, reabrir/revalidar cada publicação e dessalvar somente quando o estado atual comprovar que ela está salva.
- Depois do clique, verificar que o estado passou a não salvo. Se não for possível provar o estado anterior ou o resultado, interromper aquele item e informar o motivo; nunca adivinhar.
- A coleção usada em testes de limpeza pode ser `Laranja antigo`; isso não autoriza apagar a coleção.

### 8. Histórico, relatório e diagnóstico

- Manter histórico local para URLs, data/hora, grupo de origem, período, coleção selecionada, comentário preparado, status e detalhes de erro/confirmação.
- O histórico deve apoiar deduplicação e prevenção de repetição, mas não substituir a verificação do estado atual antes de uma ação automática.
- O relatório precisa permitir entender o resultado de cada publicação e cada etapa, inclusive quando não houve legenda, quando o estado não pôde ser verificado ou quando uma etapa foi bloqueada.
- Não apresentar totais agregados como se fossem prova de execução.
- Não afirmar que uma publicação foi curtida, salva, comentada, enviada ou reagida sem evidência de conclusão.
- Preservar diagnósticos suficientes para explicar falhas de navegação, carregamento, identificação de mensagem, leitura de legenda e localização de controles, sem expor cookies, tokens, senhas ou conteúdo privado desnecessário.

### 9. Segurança e condições de interrupção

- Usar somente a sessão autenticada manualmente pela pessoa e conversas/publicações às quais essa conta tenha acesso.
- Não contornar CAPTCHA, checkpoint, MFA, limites, bloqueios ou mecanismos de segurança do Instagram.
- Interromper a etapa afetada se o grupo, a mensagem, a publicação, a coleção, o controle ou o estado não puderem ser identificados com segurança.
- Não escolher destinos por aproximação nem executar cliques destrutivos com estado desconhecido.
- Não enviar resposta privada quando a regra exigir comentário público no Story.
- Respeitar a instrução explícita de não comentar.
- Ações em lote não dispensam verificação individual e prevenção de duplicatas.

### 10. Estado atual e limitações conhecidas

As regras acima são o comportamento funcional esperado; nem todas as etapas estão validadas no Instagram real. Feed/Reels e a seleção da coleção dependem dos elementos que o Instagram efetivamente disponibilizar na sessão. O fluxo de Stories possui inspeção, preparação de comentário público, compartilhamento no grupo coletivo e reação à mensagem original. O compartilhamento só é considerado concluído quando o link aparece nas mensagens recentes do destino; se a interface não permitir essa confirmação, a tentativa fica registrada e não é repetida automaticamente. Essas etapas ainda exigem validação em uma sessão real do Instagram antes do uso em lote. A limpeza de Salvos depende da identificação inequívoca da coleção e da confirmação do estado individual; se a coleção não for localizada com segurança, nenhuma alteração deve ser feita.

A interface do Instagram muda frequentemente. Publicações privadas, removidas, expiradas ou indisponíveis podem não ser processadas. A coleta é limitada ao histórico que o Instagram disponibilizar e não pode afirmar cobertura integral quando houver falha de carregamento ou rolagem.

## Biblioteca de comentários

Os comentários são gerados localmente por composição, não pela escolha de uma lista curta de frases prontas. O motor identifica assunto, palavras-chave e intenção textual (pergunta, tutorial, conquista ou divulgação) e combina estruturas com vocabulário contextual. A biblioteca cobre 15 temas, mais de 100 palavras-chave e milhares de combinações possíveis. Todo comentário gerado precisa ter pelo menos duas palavras e um emoji. O histórico CSV é consultado para evitar repetir comentários recentes. Não há IA, API, chave, cobrança ou envio da legenda para terceiros. Como é um sistema baseado em regras, ele interpreta texto, não imagens, e pode não reconhecer ironia, contexto implícito ou assuntos fora da biblioteca.

## Limitações importantes

Esta implementação ainda precisa ser validada com a conta e a versão atual do Instagram. O Instagram altera frequentemente a interface; seletores podem precisar de ajustes. Publicações privadas, removidas, expiradas ou indisponíveis não serão processadas. A inspeção de Stories e seus fluxos de comentário público/compartilhamento estão implementados, mas precisam ser confirmados em execução real; estados desconhecidos permanecem bloqueados.

O aplicativo não contorna CAPTCHA, checkpoint, MFA, limites ou bloqueios. Se surgir uma verificação ou sinal de restrição, interrompa o uso e conclua qualquer confirmação diretamente no Instagram. O modo AUTOMÁTICO só opera após confirmação explícita, preflight completo e verificação individual do estado de cada ação. Se o Instagram não permitir identificar o conteúdo, o controle ou o resultado, a etapa é bloqueada e registrada. Não use para spam ou interação em massa.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npm start
```

### Identificação da área Salvos

A rota de Salvos é construída dinamicamente a partir do perfil da sessão autenticada, no formato `/{usuario}/saved/`. O nome de usuário não pode ser fixado no código nem inferido de um link aleatório da página. A aplicação identifica o link de perfil na navegação do Instagram e só então abre a rota de Salvos correspondente. Dentro dela, a coleção é identificada pelo rótulo exato exibido na interface; não se deve tratar uma rota genérica `/saved/`, outro perfil ou uma página aleatória como a coleção solicitada. Se o perfil ou a coleção não puderem ser identificados sem ambiguidade, a operação é interrompida e registrada no diagnóstico.


## Reconhecimento conservador dos controles do Instagram

A inspeção lê separadamente `aria-label`, `title`, texto visível, `data-testid` e rótulos dos SVGs internos. Esses valores não podem ser concatenados antes da classificação: um identificador como `like_button` antes do rótulo `Curtir` fazia a expressão ancorada deixar de reconhecer o controle. A classificação normaliza acentos e separadores, reconhece rótulos em português/inglês e exige exatamente um controle inequívoco por ação. IDs genéricos `like_button`/`save_button` não definem sozinhos se a ação já foi aplicada; somente rótulos acessíveis/textuais ou IDs explicitamente de estado (`unlike`/`unsave`) comprovam o estado. Controles ausentes, duplicados ou contraditórios continuam como desconhecidos.

A identificação do perfil autenticado exclui links de autoria dentro de `main`, `article` e diálogos. Isso evita confundir o autor da publicação com o perfil da sessão ao conferir comentários. A inspeção procura comentários próprios tanto nas linhas estruturadas quanto nos contêineres textuais menores com link de autor, combinando evidências positivas sem contar duas vezes o mesmo nó. A lista de comentários só é considerada conferida quando há comentário próprio identificado ou evidência de lista integralmente carregada; a ausência de comentário em uma lista parcial nunca libera uma nova publicação.

## Proteção contra ações duplicadas

- Antes de curtir, a aplicação identifica explicitamente o estado do controle. Se já estiver curtido, não clica novamente; se o estado for desconhecido, bloqueia a ação para não desfazer a curtida.
- Antes de comentar em posts/Reels ou Stories, identifica o perfil autenticado e confere a lista de comentários. Comentário do próprio perfil encontrado significa ação concluída. Ausência só é considerada confirmada quando a lista está integralmente carregada (contagem visível compatível ou indicação explícita de lista vazia); sem essa evidência, não comenta.
- Antes de salvar, distingue publicação não salva, salva na coleção solicitada e salva fora dela. Se já estiver salva em outra coleção ou a pasta não puder ser comprovada, não alterna o botão Salvar.
- Antes de enviar ao grupo coletivo, percorre o histórico do grupo de destino e compara a URL canônica da publicação (incluindo Reels e Stories). Link encontrado significa envio já concluído e não deve ser repetido. Se o histórico não puder ser percorrido até o início e o link não for encontrado, o estado é desconhecido e a execução automática é bloqueada.
- Tentativa de envio sem confirmação permanece bloqueada até conferência manual; não repetir automaticamente.
- O histórico local é uma proteção adicional, não substitui a conferência do estado atual no Instagram.


## Segurança de ações, tentativas e diagnóstico

- O modo TESTE nunca executa ações. “Apta” descreve apenas a elegibilidade inicial; o modo AUTOMÁTICO precisa revalidar o estado imediatamente antes de cada interação.
- Estado desconhecido não autoriza clique. O sistema tenta estratégias alternativas de localização (A/B/C) quando existem sinais estruturados e seguros; se houver ambiguidade ou não for possível confirmar o controle, registra o motivo e pula a ação sem alterar o estado.
- Curtidas são reconhecidas por um controle de ação único e específico da publicação. Rótulos de comentários, contadores ou controles duplicados não são evidência suficiente.
- Comentários publicados só são confirmados quando o texto exato aparece em uma linha de comentário associada ao perfil autenticado. A presença do texto no editor ou no corpo geral da página não comprova publicação.
- A tentativa de comentar é gravada no histórico antes do clique de publicação. Se a confirmação posterior falhar, a tentativa fica pendente de verificação manual e não é repetida automaticamente, inclusive após reiniciar o aplicativo.
- A localização da mensagem original para reação prioriza o ID estruturado; o texto é apenas fallback quando identifica uma única mensagem. O emoji no texto da mensagem não é considerado reação. Reações cuja autoria não possa ser confirmada não são alternadas.
- O relatório separa aptas no teste, já concluídas, não verificadas, bloqueadas, aguardando, dispensadas, candidatas e sem classificação, explicando o significado de cada estado.

## Regra de revisão de qualidade

Toda alteração de código, correção ou fluxo deve passar por duas revisões independentes: (1) revisão sênior de lógica e regras de negócio; (2) revisão sênior de implementação, integração e comportamento em execução. Depois, deve haver revisão cruzada do código novo com o código existente, testes de regressão e validação do resultado do GitHub Actions. Build aprovado isoladamente não comprova comportamento correto.

- Além de comentários e compartilhamentos, tentativas de curtida, salvamento e reação são registradas antes do clique. Se a confirmação falhar, a aplicação não repete automaticamente uma ação que pode alternar/desfazer o estado; solicita conferência manual.

- Tentativas não confirmadas de curtida, salvamento, comentário e envio são protegidas por URL, não apenas por mensagem de origem. Assim, a mesma publicação repetida em duas mensagens não gera uma segunda tentativa enquanto a primeira estiver ambígua. A reação continua vinculada ao ID da mensagem específica.


## Registro contínuo de diagnóstico e correções

A cada atualização, manter problema observado, causa técnica, correção aplicada, testes executados e pendências, para permitir retomada em outra conversa.

### Diagnóstico de 21/11/2026

- Referência administrativa `00/00`: inválida. Quando o aviso disser explicitamente `HOJE`, associar pelo timestamp da própria mensagem; data explícita válida tem precedência.
- Legenda contaminada: não usar o texto integral da página como legenda. Capturar apenas elemento específico de legenda; se não houver elemento único, usar fallback neutro.
- Coleção de Salvos: URL presente no inventário completo comprova que está salva naquela coleção mesmo se o botão não for reconhecido. Ausência não prova que esteja não salva em outra coleção.
- Stories: reconhecer o botão público `Comentar` e abrir o compositor sem publicar; nunca confundir com resposta privada.
- Feed/Reels: registrar candidatos DOM visíveis e seus atributos para distinguir ausência de controles de falha de reconhecimento.
- Divergência administrativa 37 Feed/Reels e 13 Stories versus coleta 43/10 permanece pendente de rastreamento por URL/mensagem. Não forçar contagens.
- URLs repetidas: ações de publicação uma vez por URL canônica; reação vinculada a cada mensagem original.

**Validação pendente:** rodar suíte completa e nova coleta TESTE autenticada. Teste automatizado não comprova seletor real do Instagram.


### Complemento — duplicidade e rastreamento por mensagem (22/11/2026)

- A comparação com a meta administrativa agora usa URLs únicas por conteúdo (Feed/Reels e Stories), enquanto o relatório mantém separadamente a quantidade de ocorrências compartilhadas.
- O plano deduplica curtida, salvamento, comentário e compartilhamento pela URL canônica. Ocorrências repetidas não inflacionam os totais de ações.
- A reação de conclusão continua independente por ID da mensagem original. Quando uma publicação repetida aparece em outra mensagem, as ações da publicação são herdadas da primeira ocorrência e somente a reação da nova mensagem pode ser executada, após os pré-requisitos.
- O relatório de diagnóstico inclui rastreamento por URL com ID da mensagem, ID da conversa, timestamp e classificação (aceita, outra conversa, sem identidade, administrativa, fora do período ou aguardando data), sem copiar o texto privado da mensagem.
- Próxima validação necessária: executar TESTE novamente e examinar o rastreamento completo para explicar as quatro URLs Feed/Reels excedentes e as três URLs Story ausentes. A instrumentação explica a classificação, mas não substitui a nova coleta real.


## Diagnóstico técnico — cobertura Feed/Reels e Stories (22/11/2026)

O último TESTE real reportado apresentou referência administrativa de 37 Feed/Reels e 13 Stories, contra 41 Feed/Reels e 3 Stories coletados. A coleta atingiu o topo do histórico e não registrou travamento; portanto, não se deve interpretar a varredura concluída como prova de cobertura correta.

Correções recentes:
- O extrator de Stories agora combina username e ID de mídia quando aparecem em objetos irmãos no payload GraphQL do Direct.
- O parser continua proibido de transformar o ID genérico da mensagem em ID do Story.
- A abertura de Stories reconhece o botão público "Ver story" em `button` ou `[role=button]`, lendo separadamente `aria-label`, `title` e texto visível. Controles ambíguos continuam bloqueados.
- Os erros da confirmação incluem os rótulos visíveis para facilitar o diagnóstico das próximas inspeções.

Validação:
- Os arquivos alterados e os testes novos passaram por verificação sintática.
- O extrator de payload foi executado em dois cenários isolados: estrutura com usuário/mídia em ramos irmãos e cenário sem ID de mídia.
- A suíte completa e o CI não foram executados/confirmados nesta etapa.
- O próximo TESTE precisa demonstrar a recuperação dos 10 Stories faltantes e explicar os 4 Feed/Reels excedentes. Não liberar AUTOMÁTICO enquanto houver divergência de cobertura ou estados não verificados.

O diagnóstico detalhado, histórico de causas, regras de segurança e pendências permanece em [docs/diagnostico-tecnico-2026-11-22.md](docs/diagnostico-tecnico-2026-11-22.md).


## Diagnóstico técnico — estados não verificados de Feed/Reels (22/11/2026)

O TESTE mais recente mostrou 123 etapas não verificadas em 41 publicações (curtida, salvamento e comentário). A revisão do fluxo confirmou que o plano já diferencia estado conhecido positivo, conhecido negativo e desconhecido; quando a inspeção retorna estado conhecido negativo, a ação é elegível para mapeamento no TESTE e execução no AUTOMÁTICO, desde que os demais pré-requisitos estejam confirmados. O bloqueio observado decorre de a inspeção não conseguir classificar com segurança os controles/perfil/comentários; não é correto transformar ausência de rótulo em estado negativo.

Correção aplicada:
- A descoberta de controles de Curtir/Salvar deixou de depender apenas dos descendentes de um único elemento main/article; a inspeção agora varre os controles acessíveis do documento e consolida rótulos de elementos filhos (incluindo SVG) no respectivo controle acionável.
- Foram incluídos controles com tabindex="0" e elementos com atributos acessíveis, sem considerar elementos arbitrários como prova: o classificador só aceita rótulos explícitos de estado e mantém duplicidade/contradição como desconhecida.
- O classificador reconhece rótulos com sufixo de papel acessível “botão/button”.
- Testes de regressão cobrem esses rótulos e garantem que estados negativos conhecidos sejam mapeados como ações simuladas, não como “não verificadas”.

Duas revisões independentes:
1. **Regra de negócio:** estado conhecido “não curtida/não salva/sem comentário” deve virar ação pendente; estado desconhecido, divergente, duplicado ou tentativa anterior sem confirmação continua bloqueado. O inventário da coleção continua sendo verificação separada do estado do botão.
2. **Implementação/integração:** varredura DOM ampliada, deduplicação por elemento acionável, classificação por rótulo explícito e testes de regressão adicionados. O teste automatizado no GitHub Actions está em execução para o commit 0b00b651e7ee24ce9b786dfb94be07cb69e8783b; ainda não há resultado final.

**Limite importante:** ainda não houve nova coleta autenticada para demonstrar que as 123 etapas passaram a ser reconhecidas no DOM real do Instagram. Não liberar AUTOMÁTICO até confirmar os estados reais e os demais pré-requisitos por publicação. O próximo relatório deve trazer, por URL, controlCandidates, quantidade de candidatos Curtir/Salvar, identidade do perfil, quantidade de comentários examinados, total esperado e motivo específico de desconhecimento.


### Complemento — inspeção integral dos comentários (22/11/2026)

A expansão de comentários também foi corrigida: a rotina agora percorre todos os controles visíveis de “ver mais/ver todos” (em vez de depender apenas do primeiro resultado) e permite até 40 lotes de expansão. A verificação dos comentários consulta o diálogo de comentários quando ele existe; caso contrário, usa a área da publicação. Isso evita declarar lista completa quando a área de comentários está em um diálogo separado ou quando o primeiro controle encontrado está oculto.

A regra de segurança permanece: a ausência de comentário só é considerada comprovada quando o perfil autenticado foi identificado e a lista está completa; encontrar um comentário próprio é evidência positiva mesmo com lista parcial. A ausência de identidade ou de completude continua desconhecida e não dispara comentário automático.

Commit desta extensão: e6532757235471206e2a5e97f5ce695d07928492. O novo CI precisa validar esta alteração também; não usar o resultado do commit anterior como prova desta extensão. A nova coleta TESTE autenticada ainda é necessária para verificar a captura real.
