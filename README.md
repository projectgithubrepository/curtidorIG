# curtidorIG

Aplicação local, leve e em português para coletar publicações compartilhadas em um grupo/conversa do Instagram durante um período definido.

## Primeira versão

- Interface para informar o nome exato do grupo e o período; coleta heurística de links de posts/Reels encontrados nas mensagens carregadas pelo Instagram.
- Playwright abre um navegador Chromium com perfil persistente e isolado do Chrome/Edge. Na primeira utilização, use **Conectar Instagram / fazer login** e entre manualmente; cookies e sessão ficam salvos nos dados locais do aplicativo para as próximas execuções. O navegador permanece aberto entre coletas.
- Histórico CSV local em `data/historico.csv`, atualizado a cada publicação.
- Verificação de URLs já registradas para evitar repetir uma publicação.
- Deduplicação, leitura de legenda, sugestão de comentário local e revisão dos resultados na interface.
- Checklist individual por publicação para registrar, após conferência no Instagram, salvamento, coleção/pasta correta, curtida, comentário e check na mensagem exata do grupo. Cada confirmação exige ação explícita e fica registrada no histórico CSV; a aplicação não clica nem publica essas interações automaticamente.
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

A pessoa informa o nome do grupo e o período. A coleta procura links de posts/Reels nas mensagens e usa a data/hora exposta no DOM pelo Instagram. O resultado é heurístico: mensagens sem data legível são ignoradas; mudanças na interface podem impedir a coleta. A data usada é a do compartilhamento na conversa, não a publicação original. Os detalhes estão em [Regras de negócio](docs/regras-de-negocio.md).

## Regras de negócio completas

Esta seção consolida as regras funcionais que a aplicação deve seguir. As regras descrevem o comportamento esperado; quando uma função ainda não estiver validada na interface real do Instagram, isso é indicado em **Estado atual e limitações**, sem transformar uma limitação técnica em alteração da regra de negócio.

### 1. Configuração e origem do trabalho

- A pessoa seleciona/informa o **grupo de origem** do Instagram e o período de coleta.
- Informa a **coleção de destino** dos Salvos pelo nome exato. O valor inicial é `Curtido`, mas pode ser alterado.
- Informa o **grupo coletivo de envios** pelo nome exato. O valor inicial é `grupo de envios`, mas pode ser alterado.
- Escolhe um dos modos: **TESTE**, **AUTOMÁTICO** ou **MANUAL**. TESTE é o modo padrão. AUTOMÁTICO exige confirmação explícita.
- O fluxo normal começa pela conversa/grupo e pelo período; não depende de colar URLs individualmente.
- Não escolher outro grupo, coleção ou conversa por aproximação quando o nome exato não puder ser confirmado.

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
- Ao receber versões incrementais da mesma mensagem em respostas de rede diferentes, unir todos os links/IDs extraídos; uma resposta parcial nunca pode substituir uma versão anterior mais completa.
- Reconhecer marcadores de Story em nomes de campos versionados e em metadados como `media_product_type`, `item_type`, `share_type` e `attachment_type`, inclusive em estruturas XMA profundas.
- Preservar IDs longos (64 bits) como texto ao interpretar JSON de respostas HTTP e WebSocket; não converter IDs de mídia do Instagram para `Number`, pois a precisão numérica pode colapsar Stories diferentes.
- A varredura da área Salvos deve abrir a aba **Coleções/Collections** quando ela existir antes de procurar a pasta nomeada. O inventário só é confirmado após localizar um link inequívoco da coleção e ler os itens da página correspondente.
- A cobertura de Feed/Reels e Stories deve ser comparada separadamente com a mensagem administrativa da data selecionada. A divergência mantém o teste parcial; não se deve fabricar ou duplicar itens para atingir a meta.
- A coleção de destino deve ser localizada pelo nome exato na área Salvos, inclusive quando o rótulo estiver em elemento irmão do link do cartão. A aplicação só confirma a pasta após navegar por um link inequívoco dentro de Salvos e inventariar seus itens.
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
- Antes de classificar envios ao grupo coletivo como aptos, localizar a conversa pelo nome exato e confirmar que abriu uma conversa com ID. Se a coleta estiver incompleta ou o grupo de destino não for confirmado, cancelar a execução automática antes de qualquer ação.

#### Diagnóstico obrigatório no relatório preliminar

- “Não verificada” nunca pode aparecer sem uma causa específica por publicação e por ação. O detalhe deve informar o controle/elemento procurado, o que foi encontrado, a limitação observada e a evidência que faltou.
- Curtida: separar “controle localizado” de “já curtida/não curtida”. Ausência do controle é estado desconhecido, não prova de que a publicação está pendente.
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

As regras acima são o comportamento funcional esperado; nem todas as etapas estão validadas no Instagram real. Feed/Reels e a seleção da coleção dependem dos elementos que o Instagram efetivamente disponibilizar na sessão. O fluxo de Stories ainda possui etapas específicas bloqueadas enquanto não forem validadas, inclusive comentário público e compartilhamento no grupo coletivo. A limpeza de Salvos também depende da identificação inequívoca da coleção e da confirmação do estado individual; se a coleção não for localizada com segurança, nenhuma alteração deve ser feita. Esses bloqueios devem aparecer no relatório e não autorizam substituir as regras por um comportamento diferente.

A interface do Instagram muda frequentemente. Publicações privadas, removidas, expiradas ou indisponíveis podem não ser processadas. A coleta é limitada ao histórico que o Instagram disponibilizar e não pode afirmar cobertura integral quando houver falha de carregamento ou rolagem.

## Biblioteca de comentários

Os comentários são gerados localmente por composição, não pela escolha de uma lista curta de frases prontas. O motor identifica assunto, palavras-chave e intenção textual (pergunta, tutorial, conquista ou divulgação) e combina estruturas com vocabulário contextual. A biblioteca cobre 15 temas, mais de 100 palavras-chave e milhares de combinações possíveis. Todo comentário gerado precisa ter pelo menos duas palavras e um emoji. O histórico CSV é consultado para evitar repetir comentários recentes. Não há IA, API, chave, cobrança ou envio da legenda para terceiros. Como é um sistema baseado em regras, ele interpreta texto, não imagens, e pode não reconhecer ironia, contexto implícito ou assuntos fora da biblioteca.

## Limitações importantes

Esta é uma primeira implementação e ainda precisa ser validada com a conta e a versão atual do Instagram. O Instagram altera frequentemente a interface; seletores podem precisar de ajustes. Publicações privadas, removidas ou indisponíveis não serão processadas. A análise de Stories ainda não está implementada. O checklist registra confirmações manuais e não comprova ações por leitura automática da conta.

O aplicativo não contorna CAPTCHA, checkpoint, MFA, limites ou bloqueios. Se surgir uma verificação ou sinal de restrição, interrompa o uso e conclua qualquer confirmação diretamente no Instagram. A coleta e preparação de comentários não devem se transformar em disparos automáticos em lote: curtir, comentar ou salvar deve depender de uma ação explícita da pessoa na interface do Instagram. Não use para spam ou interação em massa.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npm start
```

### Identificação da área Salvos

A rota de Salvos é construída dinamicamente a partir do perfil da sessão autenticada, no formato `/{usuario}/saved/`. O nome de usuário não pode ser fixado no código nem inferido de um link aleatório da página. A aplicação identifica o link de perfil na navegação do Instagram e só então abre a rota de Salvos correspondente. Dentro dela, a coleção é identificada pelo rótulo exato exibido na interface; não se deve tratar uma rota genérica `/saved/`, outro perfil ou uma página aleatória como a coleção solicitada. Se o perfil ou a coleção não puderem ser identificados sem ambiguidade, a operação é interrompida e registrada no diagnóstico.


## Proteção contra ações duplicadas

- Antes de curtir, a aplicação identifica explicitamente o estado do controle. Se já estiver curtido, não clica novamente; se o estado for desconhecido, bloqueia a ação para não desfazer a curtida.
- Antes de comentar em posts/Reels ou Stories, identifica o perfil autenticado e confere a lista de comentários. Comentário do próprio perfil encontrado significa ação concluída. Ausência só é considerada confirmada quando a lista está integralmente carregada (contagem visível compatível ou indicação explícita de lista vazia); sem essa evidência, não comenta.
- Antes de salvar, distingue publicação não salva, salva na coleção solicitada e salva fora dela. Se já estiver salva em outra coleção ou a pasta não puder ser comprovada, não alterna o botão Salvar.
- Antes de enviar ao grupo coletivo, percorre o histórico do grupo de destino e compara a URL canônica da publicação (incluindo Reels e Stories). Link encontrado significa envio já concluído e não deve ser repetido. Se o histórico não puder ser percorrido até o início e o link não for encontrado, o estado é desconhecido e a execução automática é bloqueada.
- Tentativa de envio sem confirmação permanece bloqueada até conferência manual; não repetir automaticamente.
- O histórico local é uma proteção adicional, não substitui a conferência do estado atual no Instagram.
