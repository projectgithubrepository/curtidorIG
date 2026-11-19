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

## Tratamento das publicações

Para cada item coletado, a aplicação poderá:

- Ler a legenda e identificar assunto, palavras-chave e intenção textual.
- Preparar um comentário contextual, sem IA ou serviços externos.
- Validar que o comentário tenha pelo menos duas palavras e pelo menos um emoji.
- Consultar o histórico CSV para reduzir repetições.
- Registrar URL, grupo de origem, data da mensagem, legenda, comentário sugerido e resultado no histórico local.

Ações de curtir, comentar e salvar em coleção não devem ser disparadas em lote automaticamente. A aplicação pode organizar a fila e preparar os comentários, mas cada interação com a conta deve depender de uma ação explícita da pessoa na interface do Instagram. Não implementar envio automático em massa, nem mecanismos para contornar limites, desafios ou proteções da plataforma.

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
