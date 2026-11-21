# Regras de negócio — origem das publicações por grupo

## Objetivo

A aplicação não deve pedir que a pessoa cole URLs individualmente. A origem da fila será uma conversa/grupo específico do Instagram, selecionado pela pessoa, e um intervalo de datas.

## Configuração da execução

A interface deverá solicitar:

- **Grupo do Instagram:** selecionar ou informar a conversa/grupo de onde serão coletadas as publicações.
- **Data inicial e data final:** período em que as publicações foram compartilhadas/adicionadas à conversa.
- **Coleção de destino:** nome da coleção semanal do Instagram na qual a pessoa deseja organizar as publicações, quando esse recurso estiver disponível na interface.

Não haverá campo para colar links manualmente como fluxo principal.

## Coleta das publicações

1. Abrir a conversa selecionada usando a sessão do Instagram autenticada manualmente.
2. Consultar as mensagens dentro do intervalo informado.
3. Identificar publicações compartilhadas na conversa, incluindo links de posts e Reels que estejam acessíveis.
4. Extrair a URL e a data/hora da mensagem que compartilhou cada publicação.
5. Ignorar mensagens fora do período, links que não sejam publicações compatíveis e itens indisponíveis.
6. Remover duplicatas, inclusive quando a mesma publicação tiver sido compartilhada mais de uma vez.
7. Comparar com o histórico local para não incluir novamente publicações já processadas.
8. Apresentar a quantidade encontrada e a lista coletada antes de qualquer ação na conta.

**Definição do período:** o filtro considera a data em que a publicação foi compartilhada na conversa, não a data original em que o autor publicou o conteúdo no Instagram.

## Regras de ações por pedido

Cada link deve ser associado ao texto do pedido da mensagem do grupo. As ações são decididas por publicação:

- **Curtir:** obrigatório em todas as publicações.
- **Salvar:** obrigatório em todas as publicações, sempre na coleção/pasta semanal informada (por exemplo, “Curtido”). A confirmação deve validar a coleção correta, não apenas o estado genérico de salvo.
- **Comentar:** somente quando o pedido solicitar. Se estiver marcado como opcional, não comentar por padrão. Se houver instrução para não comentar, essa proibição prevalece e o comentário não pode ser publicado.
- **Enviar para outro grupo/conversa:** somente quando solicitado. Se houver instrução para não enviar, não enviar. Não confundir esse envio com o salvamento obrigatório na coleção.
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

## Fora do escopo desta etapa

A coleta direta da conversa, seleção do grupo, filtro por período, organização em coleção e integração com o histórico ainda precisam ser implementados e validados no Instagram real. Este documento registra a regra de negócio desejada; não significa que essas funções já estejam disponíveis.
