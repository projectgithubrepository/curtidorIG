# Regras de negócio — origem das publicações por grupo

## Objetivo

A aplicação não deve pedir que a pessoa cole URLs individualmente. A origem da fila será uma conversa/grupo específico do Instagram, selecionado pela pessoa, e um intervalo de datas.

## Configuração da execução

A interface deverá solicitar:

- **Grupo do Instagram:** selecionar ou informar a conversa/grupo de onde serão coletadas as publicações.
- **Data inicial e data final:** período em que as publicações foram compartilhadas/adicionadas à conversa.
- **Coleção de destino:** nome exato da coleção dos Salvos; o valor inicial é `Curtido`, editável pelo usuário.
- **Grupo coletivo de envios:** nome exato da conversa que receberá cada publicação; o valor inicial é `grupo de envios`, editável pelo usuário.
- **Modo:** TESTE, AUTOMÁTICO ou MANUAL. TESTE é o padrão; AUTOMÁTICO exige confirmação explícita.

Não haverá campo para colar links manualmente como fluxo principal.

## Coleta das publicações

1. Abrir a conversa selecionada usando a sessão do Instagram autenticada manualmente.
2. Consultar as mensagens dentro do intervalo informado.
3. Identificar publicações compartilhadas na conversa, incluindo links de posts e Reels que estejam acessíveis.
4. Extrair a URL e a data/hora da mensagem que compartilhou cada publicação.
5. Ignorar mensagens fora do período, links que não sejam publicações compatíveis e itens indisponíveis.
6. Remover duplicatas da mesma URL dentro da mesma mensagem, preservando ocorrências em mensagens diferentes para que cada mensagem original receba sua própria reação.
7. Vincular cada publicação ao ID exato da mensagem de origem; a mesma URL em mensagens distintas continua tendo identidades distintas.
8. Consultar o histórico local para evitar repetir ações já confirmadas.
9. Apresentar a quantidade encontrada e o plano por publicação. No modo TESTE, nenhuma interação é executada.
10. Ao concluir o TESTE, exibir na própria interface um relatório preliminar com totais separados por tipo de ação: curtidas, salvamentos, comentários, envios ao grupo coletivo, reações na mensagem original, comentários públicos em Stories e envios de Stories. Para cada tipo, discriminar ocorrências analisadas, aptas no plano, aguardando pré-requisitos, já concluídas, bloqueadas e não verificadas; nunca chamar ações simuladas de executadas.
11. No detalhamento individual, exibir o texto original do pedido do grupo e relacioná-lo à publicação correspondente, além da decisão e justificativa de cada ação.

**Definição do período:** o filtro considera a data em que a publicação foi compartilhada na conversa, não a data original em que o autor publicou o conteúdo no Instagram.

### Limite e encerramento da varredura do histórico

- Não existe teto fixo de mensagens, respostas de rede ou rodadas de rolagem para a coleta.
- Continuar percorrendo o histórico até encontrar uma mensagem anterior à data inicial selecionada ou confirmar, após movimento real do painel correto, o início do histórico.
- Não considerar um contêiner já posicionado em `scrollTop = 0` como prova de histórico completo se nenhuma rolagem real foi observada; isso pode indicar que o seletor escolheu o painel errado.
- Se a rolagem não avançar por 8 tentativas consecutivas, interromper como **incompleta/travada**, preservar diagnóstico e não liberar execução automática. Esse mecanismo é proteção contra loop infinito, não um limite de mensagens.
- A captura de rede deve continuar processando respostas além de 500; o relatório pode limitar apenas a quantidade de detalhes individuais exibidos, sem descartar mensagens capturadas.


### Identificação e conferência de Stories\n\n- Extrair Stories tanto de URLs/permalinks quanto de estruturas de compartilhamento recebidas pela rede do Direct, incluindo variantes aninhadas de `story_share`, `shared_story`, `story_media`, `story_item`, `story_items` e XMA quando houver identidade de Story verificável.\n- O ID numérico do Story e o nome de usuário do autor devem pertencer ao mesmo objeto/estrutura de mídia; não fabricar links a partir de IDs sem autor identificável.\n- Não limitar artificialmente a quantidade de URLs por mensagem. Deduplicar por ID de mensagem + URL, preservando Stories distintos do mesmo perfil e compartilhamentos repetidos em mensagens diferentes.
- Ao receber versões incrementais da mesma mensagem em respostas de rede diferentes, unir todos os links/IDs extraídos; uma resposta parcial nunca pode substituir uma versão anterior mais completa.
- Reconhecer marcadores de Story em nomes de campos versionados e metadados como `media_product_type`, `item_type`, `share_type` e `attachment_type`, inclusive em estruturas XMA profundas.
- Preservar IDs longos (64 bits) como texto ao interpretar JSON de respostas HTTP e WebSocket; não converter IDs de mídia do Instagram para `Number`, pois a precisão numérica pode colapsar Stories diferentes.
- A varredura da área Salvos deve abrir a aba **Coleções/Collections** quando ela existir antes de procurar a pasta nomeada. O inventário só é confirmado após localizar um link inequívoco da coleção e ler os itens da página correspondente.\n- Comparar a quantidade extraída com a referência administrativa da data. Divergência deve manter a coleta como parcial e registrar contagens por fonte/operação, sem completar a meta com números artificiais.\n\n## Referência administrativa posterior ao fechamento

A mensagem administrativa com os totais de Feed/Reels e Stories é publicada depois do fechamento do período. Portanto, ela é um gabarito de conferência, não uma fonte necessária para executar a coleta.

- A coleta deve localizar as mensagens e publicações do período por conta própria, sem aguardar ou exigir a mensagem administrativa.
- A ausência da mensagem administrativa não pode impedir a coleta nem tornar o resultado incompleto por si só.
- Quando o aviso posterior estiver disponível, interpretar os totais correspondentes à data selecionada e comparar Feed/Reels e Stories separadamente.
- Nunca reutilizar automaticamente metas de outra data nem manter quantitativos de referência fixos no código.
- Se não houver aviso correspondente, exibir a cobertura coletada e indicar que a conferência administrativa não está disponível.
- No teste histórico de 18/11, os valores 66 Feed/Reels e 34 Stories são apenas o gabarito posterior para validar a coleta independente.

## Regras de ações por pedido

Cada link deve ser associado ao texto do pedido da mensagem do grupo. As ações são decididas por publicação:

- **Curtir:** obrigatório em todas as publicações.
- **Salvar:** obrigatório em todas as publicações, sempre na coleção/pasta semanal informada (por exemplo, “Curtido”). A confirmação deve validar a coleção correta, não apenas o estado genérico de salvo.
- **Comentar:** comentar também quando o pedido disser que é opcional. Só não comentar quando houver proibição explícita. Todo comentário deve ter pelo menos duas palavras e um emoji; priorizar texto contextual e estruturado.
- **Enviar para o grupo coletivo de envios:** obrigatório para toda publicação, independentemente do texto do pedido. Não confundir esse envio com o salvamento obrigatório na coleção.
- **Reação de conclusão:** reagir com o emoji configurado à mensagem exata que compartilhou o link, uma reação por mensagem, depois de concluídas as ações obrigatórias e as ações explicitamente solicitadas. Se a reação já existir, não repetir.

O modo TESTE deve simular as mesmas decisões sem modificar a conta. O modo AUTOMÁTICO só pode executar ações pendentes após verificar novamente o estado e as instruções. O modo MANUAL apenas organiza o que falta. Em caso de instrução ambígua, identidade de mensagem não comprovada ou bloqueio do Instagram, interromper a ação correspondente e informar o motivo.

## Histórico CSV

Além dos campos atuais, prever os seguintes dados:

- grupo de origem;
- data/hora em que a mensagem foi enviada;
- data inicial e final da coleta;
- nome da coleção semanal selecionada;
- comentário preparado;
- estado da revisão/ação manual.

O histórico continua local, sem banco de dados ou envio a serviços externos.

## Restrições e tratamento de erros

- Não tentar acessar conversas às quais a conta autenticada não tenha acesso.
- Não contornar CAPTCHA, checkpoint, MFA, limites ou bloqueios.
- Se o grupo não for encontrado, solicitar nova seleção em vez de escolher outro grupo por aproximação.
- Se não for possível determinar a data da mensagem ou extrair uma publicação com segurança, ignorar o item e registrar o motivo.
- Se a interface do Instagram mudar ou a conversa não carregar completamente, interromper a coleta e informar que o resultado pode estar incompleto.
- Não afirmar que todas as mensagens do período foram coletadas se o Instagram não disponibilizar todo o histórico.

## Estado e limites da implementação

A interface possui os modos TESTE, AUTOMÁTICO e MANUAL. A execução automática de Feed/Reels usa a interface visível do Instagram e interrompe a etapa quando não consegue identificar ou verificar o controle correto. A seleção da coleção depende de o Instagram exibir o seletor de coleções; se a publicação já estiver salva sem confirmação da pasta, a aplicação não alterna o estado para evitar dessalvar por engano. Stories ainda são identificados, mas permanecem bloqueados para execução porque exigem fluxo específico. O comportamento real dos seletores deve ser validado com a conta autenticada e uma publicação de teste antes de usar em lote.


## Limpeza posterior dos Salvos

A função **Dessalvar publicações em lote, individualmente** deve navegar até os Salvos, abrir a coleção selecionada (a coleção `laranja antigos` pode ser usada para teste), listar Feed, Reels e carrosséis e processar cada publicação individualmente. A operação remove o estado de salvo da publicação por completo, não apenas a associação a uma coleção. Não apagar a coleção nem a publicação. O modo TESTE apenas lista e classifica, sem clicar em salvar/dessalvar. O modo AUTOMÁTICO exige confirmação explícita, revalida cada publicação e só aciona o controle quando o estado atual comprovar que está salva; após o clique, verifica que o estado passou a não salva. Se a interface não permitir comprovar o resultado, interrompe e informa o item, sem adivinhar.

### Identificação dinâmica da área Salvos

- O endereço de Salvos segue o formato `https://www.instagram.com/{usuario}/saved/`, sendo `{usuario}` obtido dinamicamente do perfil da sessão autenticada.
- É proibido fixar no código o nome de usuário de uma conta de exemplo ou reaproveitar um endereço de outro perfil.
- A aplicação deve localizar o link do próprio perfil na navegação do Instagram antes de construir a URL de Salvos.
- A coleção de destino/origem é identificada pelo nome exato exibido na interface dentro dessa área. O endereço-base `/{usuario}/saved/` não comprova, sozinho, que uma coleção específica foi localizada.
- Se não for possível identificar o perfil autenticado ou associar o nome da coleção a um elemento inequívoco, interromper a operação e registrar o diagnóstico; nunca escolher uma página aleatória.


## Proteção contra ações duplicadas

- Antes de curtir, a aplicação identifica explicitamente o estado do controle. Se já estiver curtido, não clica novamente; se o estado for desconhecido, bloqueia a ação para não desfazer a curtida.
- Antes de comentar em posts/Reels ou Stories, identifica o perfil autenticado e confere a lista de comentários. Comentário do próprio perfil encontrado significa ação concluída. Ausência só é considerada confirmada quando a lista está integralmente carregada (contagem visível compatível ou indicação explícita de lista vazia); sem essa evidência, não comenta.
- Antes de salvar, distingue publicação não salva, salva na coleção solicitada e salva fora dela. Se já estiver salva em outra coleção ou a pasta não puder ser comprovada, não alterna o botão Salvar.
- Antes de enviar ao grupo coletivo, percorre o histórico do grupo de destino e compara a URL canônica da publicação (incluindo Reels e Stories). Link encontrado significa envio já concluído e não deve ser repetido. Se o histórico não puder ser percorrido até o início e o link não for encontrado, o estado é desconhecido e a execução automática é bloqueada.
- Tentativa de envio sem confirmação permanece bloqueada até conferência manual; não repetir automaticamente.
- O histórico local é uma proteção adicional, não substitui a conferência do estado atual no Instagram.


### Identificação do grupo coletivo por URL direta

Quando configurada, a URL `https://www.instagram.com/direct/t/ID/` é o localizador primário da conversa coletiva. A aplicação deve confirmar o ID aberto e o nome exato no cabeçalho antes de inventariar o histórico ou permitir envios. Se a confirmação falhar, bloquear a etapa; não selecionar outra conversa por aproximação.
