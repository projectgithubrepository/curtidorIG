# Diagnóstico técnico — CurtidorIG — 22/11/2026

## Contexto e evidências de origem

Base: relatório de diagnóstico e histórico CSV enviados para a coleta de 21/11/2026.

- 53 ocorrências encontradas: 43 Feed/Reels e 10 Stories; 52 inspecionadas.
- 43 Feed/Reels abriram, mas os estados de curtida e salvamento não foram reconhecidos. O plano gerou 129 ações não verificadas (43 × 3: curtir, salvar e comentar).
- O perfil autenticado não foi identificado nos posts; comentários anteriores ficaram sem verificação.
- A extração de legenda usava o texto integral de `main`/página, misturando autor, comentários, métricas e outros elementos.
- Em Stories, a inspeção reconhecia somente um editor já aberto; não reconhecia o botão público que abre o compositor.
- A referência administrativa trazia `HOJE` e `00/00`, mas a data placeholder não era resolvida pelo timestamp da própria mensagem.
- O inventário da coleção de destino estava disponível, mas a confirmação de presença exigia também que o botão Salvar fosse reconhecido.
- A comparação original contava ocorrências, não URLs únicas. Duas URLs Feed/Reels estavam repetidas.
- Referência administrativa: 37 Feed/Reels e 13 Stories. Coleta: 43/10 ocorrências; após deduplicação, 41/10 URLs únicas. Restam quatro Feed/Reels excedentes e três Stories ausentes.
- A captura de rede observou 36 URLs únicas de Stories: 10 aceitas na data e 26 atribuídas a outra conversa. O CSV não demonstra ações concluídas anteriormente.

## Correções implementadas

1. **Data administrativa**
   - `00/00` deixou de ser tratado como data válida.
   - Datas impossíveis também são rejeitadas, inclusive quando o ano não foi informado.
   - Quando o texto contém `HOJE`, a associação usa o timestamp da própria mensagem administrativa; uma data explícita válida prevalece.
   - A leitura de avisos visíveis também preserva o timestamp disponível no DOM.

2. **Legenda**
   - `interpretPostSnapshot` não usa mais `articleText`, `dialogText` ou `mainText` como legenda.
   - Só aceita um nó específico de legenda identificado no DOM.
   - Sem elemento único, retorna legenda vazia e registra que o gerador deve usar o fallback neutro.

3. **Salvos**
   - A presença da URL no inventário completo da coleção é prova positiva de salvamento naquela coleção, mesmo quando o rótulo do botão não é reconhecido.
   - Ausência no inventário não é interpretada como prova de que a publicação não está salva em outra coleção.

4. **Stories**
   - A inspeção procura um botão público inequívoco `Comentar` e pode abrir o compositor sem publicar.
   - `Responder` e `Enviar mensagem` não são alvos.
   - O estado de comentário público só é marcado disponível quando o editor público foi efetivamente localizado após a abertura; a presença isolada do botão fica registrada como evidência separada.

5. **Identidade e controles**
   - A descoberta do perfil autenticado considera links em `nav`, `[role=navigation]` e `header`, mantendo bloqueio quando a identidade é ambígua.
   - A inspeção de Feed/Reels registra controles visíveis, atributos acessíveis e rótulos internos, inclusive candidatos ainda não reconhecidos. Isso permite diferenciar ausência de controles de falha de interpretação.

6. **Duplicidade e métricas**
   - As metas administrativas passam a comparar URLs únicas, com ocorrências de mensagens reportadas separadamente.
   - Curtida, salvamento, comentário e compartilhamento são contabilizados uma vez por URL canônica.
   - Uma ocorrência repetida herda o estado da publicação principal e não repete ações sobre o post.
   - A reação de conclusão permanece individual por ID da mensagem original. No modo automático, só é tentada na mensagem repetida depois que as etapas obrigatórias da publicação principal foram concluídas; tentativa anterior sem confirmação bloqueia novo clique.
   - As ações repetidas não inflacionam os totais de ações previstas/simuladas/bloqueadas.

7. **Rastreamento de coleta**
   - O relatório inclui, para cada URL capturada na rede, tipo de conteúdo, ID da mensagem, ID da conversa, timestamp e classificação.
   - O rastreamento não copia o texto privado das mensagens.
   - O relatório textual lista os candidatos Feed/Reels e Stories para explicar exclusões por conversa, data, identidade ou marcador administrativo.

## Duas revisões independentes

### Revisão 1 — lógica de negócio e estados

- Conferido: a URL canônica representa a publicação; o ID da mensagem representa a ocorrência de origem.
- Conferido: as ações sobre a publicação não se repetem em URLs duplicadas; a reação não é herdada de outra mensagem.
- Conferido: uma tentativa ambígua continua bloqueando novo clique; estados desconhecidos não são convertidos em concluídos.
- Conferido: inventário completo fornece prova positiva de presença na coleção, mas ausência não prova estado genérico não salvo.
- Conferido: o modo TESTE não executa reação nem comentário.
- Conferido: a referência `HOJE` depende do timestamp da própria mensagem e não da data atual arbitrária.
- Limite: esta revisão é de código e regras; não comprova comportamento real no Instagram.

### Revisão 2 — implementação, integração e execução

- Conferido: timestamps são convertidos para o dia local do processo, consistente com o filtro de período já usado pela coleta.
- Conferido: o rastreamento por URL não inclui texto privado da conversa.
- Conferido: o clique do Story é limitado a um único botão público identificado; a publicação só ocorre depois da validação de editor, perfil e lista de comentários.
- Conferido: o inventário da coleção é usado antes do planejamento de salvamento.
- Corrigido durante a revisão: escapes duplicados em expressões regulares do parser administrativo e normalização de rótulos do Story.
- Limite: não foi possível executar `npm test` nem abrir a sessão autenticada do Instagram nesta etapa. Os testes foram adicionados, mas ainda precisam de execução no CI e de uma nova coleta TESTE.

## Testes adicionados

- `tests/group-state.test.js`: placeholder `00/00`, associação `HOJE` pelo timestamp, precedência de data explícita, rejeição de data fora do período e rejeição de data impossível.
- `tests/instagram-caption.test.js`: usa apenas legenda específica e não recorre ao texto integral da página.

## Pendências objetivas para a próxima execução TESTE

1. Conferir se o aviso administrativo de 21/11 agora aparece como 37 Feed/Reels e 13 Stories.
2. Comparar 41 URLs Feed/Reels únicas com a meta 37 e identificar as quatro excedentes pelo rastreamento.
3. Identificar as três URLs Story ausentes entre os candidatos classificados, incluindo mensagem, conversa, timestamp e motivo.
4. Inspecionar `controlCandidates` dos 43 posts para ajustar os seletores de Curtir/Salvar com evidência real do DOM.
5. Confirmar se a identificação do perfil em `nav`, `[role=navigation]` ou `header` resolveu o estado de comentários.
6. Confirmar em Story real se o botão `Comentar` abre o compositor público e se a lista de comentários pode ser verificada integralmente.
7. Executar a suíte completa no GitHub Actions. Não considerar build/commit como prova de teste aprovado.
8. Fazer validação manual em TESTE com sessão autenticada antes de autorizar qualquer execução AUTOMÁTICA.

## Regra para continuidade

Em cada nova resposta e alteração, atualizar este diagnóstico com: problema atual, evidência, causa, correção, resultado de testes e pendências. Não repetir coleta ou ação já confirmada; não declarar comportamento validado sem evidência real.


## Atualização — falha de build e correções (22/11/2026)

### Evidência da falha
- Workflow: [Build Windows app — execução 519](https://github.com/projectgithubrepository/curtidorIG/actions/runs/44979632163).
- SHA avaliado: `e8cc9577ce151f432fd35f7de3bcaf3b4c1299d4`.
- Resultado: 107 testes aprovados, 3 reprovados; a etapa `Run tests` falhou e todas as etapas de empacotamento foram ignoradas.
- Teste 53 (`tests/group-state.test.js:96`): a data explícita `20/11` perdeu prioridade para o timestamp de `HOJE`; resultado observado `2026-11-21`, esperado `11-20`.
- Testes 65 e 85 (`tests/instagram-inspection.test.js` e `tests/instagram-post-inspection.test.js`): a legenda retornou vazia nos cenários em que só havia texto útil em `main`, sem `article`.

### Causa e correção aplicada
1. **Data administrativa:** o filtro de seleção já aceitava a data explícita sem ano, mas a montagem do campo de retorno priorizava o timestamp de `HOJE`. Corrigido para preservar qualquer data explícita válida (com ou sem ano) antes de consultar `sharedAt`.
2. **Legenda:** mantida a prioridade para `captionText` de DOM específico. Adicionado fallback restrito ao texto de `main` apenas quando não há `article` nem `dialog`; remove linhas isoladas que são rótulos de interface, contagens e nomes de usuário. Não usa `bodyText`, descrição OG ou texto geral da página como legenda.

### Revisões após a correção
- **Revisão 1 — regra/negócio:** data explícita válida prevalece sobre `HOJE`; data sem ano continua sendo comparada dentro dos dias do período; fallback de legenda é condicionado à ausência de article/dialog e remove ruído de interface conhecido.
- **Revisão 2 — implementação/integração:** conferidas as expressões regulares no arquivo salvo, a exportação pública de `interpretPostSnapshot`, o uso prioritário de `captionText` e a ausência de fallback para `bodyText`. A nova execução de CI ainda precisa terminar para confirmar os 110 testes e a build do instalador.

### Estado após os commits corretivos
- Correções publicadas em `src/group-state.js` e `src/instagram.js`.
- Último SHA no momento desta atualização: `d4419128f598151945e4894bf96ca4d2c04e2e56`.
- CI para esse SHA: em andamento; não declarar build aprovada até o workflow terminar.
- Pendência funcional anterior permanece: executar nova coleta TESTE autenticada e conferir controles de 43 publicações, divergência de 4 Feed/Reels e 3 Stories ausentes. Nenhuma execução AUTOMÁTICA deve ser liberada com base apenas nos testes unitários.


## Atualização — estados de curtida, salvamento e comentário (22/11/2026)

### Evidência nova do TESTE

A execução mais recente apresentou 41 Feed/Reels com 123 etapas não verificadas: 41 curtidas, 41 salvamentos e 41 comentários. A conta confirma que o problema está concentrado na inspeção de estado, não na preparação de comentários ou no compartilhamento ao grupo.

### Causa identificada no código

1. **Curtida e salvamento:** os rótulos do controle eram concatenados em uma única string com `data-testid`, `aria-label`, texto e SVG. A expressão de reconhecimento exigia que a string começasse diretamente por `Curtir`, `Descurtir`, `Salvar` ou `Remover dos salvos`. Se o atributo começasse por um identificador, por exemplo `like_button`, o controle válido não era reconhecido mesmo com o rótulo acessível presente.
2. **Identidade do perfil:** a busca incluía todos os links dentro de qualquer `header`, inclusive cabeçalhos internos da publicação. Isso podia misturar o link do autor do post com o link do perfil autenticado e produzir identidade ambígua.
3. **Segurança:** a correção não transforma ausência de evidência em estado negativo. Se houver dois controles possíveis ou rótulos contraditórios, a ação continua desconhecida e bloqueada.

### Correções publicadas

- Os atributos e rótulos dos controles agora são preservados separadamente.
- A classificação é feita por controle, normaliza acentos/separadores e reconhece os estados Curtir/Descurtir e Salvar/Remover dos salvos em português e inglês.
- O sistema exige exatamente um controle compatível para cada estado; duplicidade ou contradição permanece desconhecida.
- A identificação do perfil desconsidera links localizados dentro de `article`, `main`, `[role=main]` e diálogos, para não confundir o autor do conteúdo com a conta autenticada.
- O relatório passa a manter candidatos DOM individuais, rótulos e contagem de controles reconhecidos para permitir diagnóstico por publicação.

### Testes de regressão adicionados

`tests/instagram-control-state.test.js` cobre:
- `data-testid` antes do rótulo acessível;
- estados já curtido/salvo em português e inglês;
- normalização de acentos e separadores;
- controles duplicados;
- evidências contraditórias no mesmo controle.

### Revisões independentes

**Revisão 1 — regra de negócio e estados**
- Estado positivo/negativo só é reconhecido com um controle único.
- Não se clica quando o estado é ambíguo.
- Inventário de Salvos continua sendo evidência positiva independente; ausência na coleção não prova que o post não está salvo em outra pasta.
- Comentários só podem ser considerados ausentes quando a identidade do perfil e a integralidade da lista forem comprovadas.

**Revisão 2 — implementação e integração**
- A classificação foi extraída para função pura testável e é aplicada aos candidatos capturados pelo Playwright.
- O retorno da inspeção preserva `controlCandidates`, `controlLabels`, quantidade de controles e contagem de candidatos por ação.
- A seleção de links de perfil exclui cabeçalhos internos de conteúdo.
- A suíte completa e o CI ainda precisam ser executados; a sessão autenticada do Instagram não está disponível nesta revisão.

### Pendências de validação real

1. Executar a suíte completa e confirmar o resultado do GitHub Actions.
2. Rodar novo TESTE autenticado e verificar se curtida/salvamento deixam de ficar desconhecidos.
3. Conferir por publicação o candidato DOM que fundamentou cada estado.
4. Confirmar a identificação do perfil e a integralidade da lista de comentários.
5. Reconciliar a divergência de cobertura Feed/Reels e Stories já registrada acima.

**AUTOMÁTICO permanece não autorizado até que o novo TESTE demonstre reconhecimento consistente.** Esta correção melhora a interpretação do DOM observado; não comprova, por si só, o comportamento da interface real do Instagram.


### Revisão complementar — IDs genéricos e evidência de perfil

Na segunda revisão da classificação, foi identificado que `like_button` e `save_button` podem ser identificadores estáticos do componente, sem informar o estado do toggle. A implementação foi ajustada para não inferir “não curtida/não salva” apenas desses IDs. Rótulos acessíveis/textuais explícitos determinam o estado; IDs `unlike` e `unsave` só são aceitos como prova positiva de estado aplicado quando não há rótulo explícito. A classificação usa todos os controles visíveis capturados, não apenas a amostra exibida no diagnóstico.

O diagnóstico também passa a registrar até 20 hrefs candidatos do menu de navegação, depois de excluir cabeçalhos internos de conteúdo. Isso permitirá conferir se o link identificado pertence à sessão autenticada sem confundi-lo com o autor da publicação.

Foram executados manualmente no ambiente disponível quatro cenários isolados do classificador: controles não aplicados com rótulos, controles já aplicados, IDs genéricos sem rótulo (mantidos desconhecidos) e IDs explícitos `unlike/unsave`. Os quatro cenários passaram. Isso é uma verificação isolada da função, não substitui `npm test`, GitHub Actions ou a coleta autenticada.


### Complemento — identificação positiva de comentários (22/11/2026)

A inspeção de comentários agora combina as linhas estruturadas (`li`, `role=listitem`, atributos de comentário) com contêineres textuais menores que possuem link de autor. Isso cobre layouts em que o seletor estruturado encontra um `li` agregador, mas o comentário individual aparece em um descendente. Os nós são deduplicados. Essa união só é usada para encontrar positivamente um comentário da conta; não é usada para declarar a lista inteira vazia. A ausência continua dependendo da contagem integral de comentários ou de uma mensagem explícita de lista vazia.

O diagnóstico registra separadamente quantas linhas estruturadas, linhas genéricas e linhas próprias foram encontradas, além dos hrefs candidatos de perfil. Foram adicionados testes para garantir que um comentário próprio encontrado seja reconhecido mesmo com lista parcial e que ausência em lista parcial permaneça desconhecida.



### Verificação final de implementação — 22/11/2026

Na revisão cruzada do código, foi detectado e corrigido um escape duplicado nas expressões regulares do classificador (normalização de acentos e espaços). A correção foi validada diretamente a partir da função publicada, e não por uma cópia manual.

- 6 cenários isolados do classificador executados contra a função do repositório: todos passaram.
- 3 verificações de segurança de comentário executadas contra a função do repositório: todas passaram.
- Compilação sintática por `new Function` após remoção apenas das declarações `import/export`: `src/instagram.js`, `src/execution-plan.js` e o novo teste compilaram sem erro.
- A suíte completa `npm test` não foi executada neste ambiente; dependências/runtime local não estão disponíveis.
- A consulta de status do commit no GitHub não retornou checks nem execuções de workflow. Portanto, CI permanece **não verificado**, não aprovado.

Último commit de código no momento desta anotação: `610635e8006134ec190743adb28a26bf18686f7e`. A validação real depende de uma nova coleta TESTE com a sessão autenticada do Instagram.


## Atualização — reconciliação de Stories após novo TESTE (22/11/2026)

### Evidência do teste mais recente
- Referência administrativa: Feed 37, Stories 13.
- Coleta: 41 URLs únicas Feed/Reels e 3 URLs únicas de Stories; 44 URLs únicas no total.
- Divergência: +4 Feed/Reels e -10 Stories.
- Rede: 24 ocorrências de URL Story, 22 URLs únicas; apenas 3 URLs foram associadas à conversa alvo e ao dia solicitado. As outras 19 foram corretamente classificadas como provenientes de outras conversas.
- A varredura percorreu 68 rodadas, alcançou o topo e identificou o marco temporal; portanto, o relatório não indica travamento de rolagem.
- 3 inspeções de Story falharam; cada falha foi registrada, mas o resumo não traz a causa individual.

### Causa de código identificada
A rotina `storyIdentity` só aceitava uma identidade quando username e ID estavam no mesmo objeto descendente. Payloads em que o proprietário e o objeto de mídia aparecem como irmãos — por exemplo, `story_share.user.username` separado de `story_share.media.pk` — eram descartados mesmo dentro de uma estrutura Story. Isso reduz a extração de URLs de Stories em respostas GraphQL que não trazem permalink explícito.

### Correção aplicada
- A identidade do Story agora agrega username e ID de mídia em ramos irmãos dentro do mesmo contexto Story.
- IDs genéricos de mensagem continuam excluídos: `message_id` não pode virar ID de Story.
- IDs `pk`/`media_id` são priorizados; `id` genérico só é aceito quando há evidência de objeto de mídia ou username no próprio nó.
- Foram adicionados dois testes de regressão: proprietário/mídia em objetos irmãos e proteção contra confusão entre ID da mensagem e ID do Story.

### Revisões
- **Revisão de regra de negócio:** só constrói permalink quando username e ID da mídia podem ser associados no mesmo ramo/contexto Story; não converte ID de mensagem em Story.
- **Revisão de implementação:** mantida a travessia com limite de profundidade e proteção contra ciclos; IDs de mídia continuam validados como numéricos; URLs são deduplicadas no coletor.
- **Validação pendente:** executar suíte completa e novo TESTE autenticado. A correção é uma causa concreta de subextração identificada no parser; ainda não prova que os 10 Stories faltantes foram todos recuperados.


### Complemento — abertura do Story e confirmação "Ver story" (22/11/2026)

A inspeção anterior dependia de `getByRole("button", { name: /^ver story$/i })`. Em alguns layouts do Instagram, o controle visível pode ser um elemento `[role=button]` ou apresentar diferenças entre nome acessível, `aria-label`, `title` e texto interno. Isso podia deixar a confirmação sem reconhecimento e interromper a inspeção dos Stories.

Correção:
- A abertura agora varre controles visíveis `button,[role=button]` e compara separadamente `aria-label`, `title` e texto interno após normalização de acentos e espaços.
- Só aceita o rótulo exato "Ver story"; "Responder", "Enviar mensagem" e outros controles não são confundidos.
- Mais de um candidato continua bloqueando a abertura.
- Se a confirmação não puder ser localizada ou continuar visível após o clique, o erro inclui os rótulos observados para diagnóstico, sem prosseguir com ações.
- A função de normalização recebeu testes de regressão para variações de caixa, espaços e controles não equivalentes.

Validação de código:
- O extrator completo de payload foi compilado e executado em dois cenários locais isolados: proprietário e mídia em objetos irmãos geraram permalink correto; ausência de ID de mídia não converteu o ID da mensagem em Story.
- A suíte de testes do projeto e a execução autenticada ainda não foram executadas neste ambiente.
- O CI não retornou checks/workflow runs para os commits consultados; estado de CI permanece não verificado.

Pendências mantidas:
- O último TESTE mostrou 41/37 Feed/Reels e 3/13 Stories. A extração de identidade em ramos irmãos e a abertura do botão "Ver story" foram corrigidas, mas só uma nova coleta pode confirmar quantos dos 10 Stories faltantes serão recuperados.
- Os 4 Feed/Reels excedentes continuam sem causa individual comprovada; não foram removidos por heurística.
- As 3 inspeções de Story anteriores não incluem causa individual no resumo filtrado. A nova versão registra os rótulos dos controles para diferenciar falha de seletor, confirmação persistente e outros erros.


## Atualização — correção da inspeção de estados Feed/Reels (22/11/2026)

### Problema
O último TESTE apresentou 123 etapas não verificadas em 41 Feed/Reels: 41 curtidas, 41 salvamentos e 41 comentários. A causa imediata não era uma regra que proibia ações pendentes: o plano já aceita estados conhecidos negativos. O ponto sem comprovação era a leitura da interface, que não estava identificando de forma suficiente os controles e/ou a identidade e completude dos comentários.

### Correção de inspeção de Curtir/Salvar
- A captura anterior buscava somente button e [role="button"] dentro do primeiro elemento selecionado (main, article, dialog ou body). Isso deixava de fora controles acessíveis que estivessem fora daquele escopo ou que fossem expostos por um nó interno.
- A nova captura varre o documento inteiro, considera button, [role="button"], [tabindex="0"] e nós com aria-label, title ou data-testid; rótulos encontrados em filhos/SVG são associados ao ancestral acionável e deduplicados pelo elemento.
- A seleção do estado continua estrita: somente rótulos inequívocos Curtir/Like, Descurtir/Unlike, Salvar/Save e Remover dos salvos/Remove from saved são aceitos. IDs genéricos like_button e save_button não determinam o estado. Mais de um candidato ou evidência contraditória permanece desconhecido.
- O classificador passou a reconhecer também sufixos acessíveis “botão/button”.

### Correção do mapeamento de ações pendentes
Foi adicionado teste explícito para os três estados conhecidos negativos: quando a inspeção comprova “não curtida”, “não salva” e “sem comentário”, com inventário de coleção, grupo e identidade de origem confirmados, as etapas são classificadas como simulada e testMode.mapped=true. No AUTOMÁTICO, esses estados negativos são os que permitem executar a ação; estados desconhecidos continuam bloqueados.

### Testes adicionados
- tests/instagram-control-state.test.js: rótulos acessíveis com sufixo de botão em português e inglês.
- tests/execution-plan.test.js: estados negativos comprovados entram no mapeamento de ações pendentes.

### Revisões independentes
1. **Lógica de negócio:** não converter desconhecido em falso; não repetir curtida/salvamento/comentário; só mapear ação quando o estado negativo for comprovado; manter a verificação da coleção de destino separada do botão Salvar.
2. **Implementação/runtime:** ampliar a descoberta DOM sem aceitar qualquer texto como evidência; associar rótulos filhos ao controle acionável; deduplicar controles; adicionar testes de classificador e plano.

### Estado de validação
- Commits de código/testes: ef6c30fa4af042d61988ab0c18e95285f92a0963, 13917181d39231eb27f515671d13faf96655eb9b, d39ada2a8358819f624de89fb7aaef6e928140b6, 76b9ff70d88b1a15c41d037b7c2c5725d6f20124, 5463efcd0f046b5a8b295fc08643fd4d08d1a7b3 e 0b00b651e7ee24ce9b786dfb94be07cb69e8783b.
- GitHub Actions run #544 para o último SHA foi iniciado e ainda está em andamento na última consulta. A execução #543 foi cancelada porque um novo push substituiu o commit em teste.
- Ainda não há nova coleta TESTE autenticada; portanto, não declarar corrigidas as 123 etapas nem autorizar AUTOMÁTICO. A validação funcional exige novo relatório com diagnósticos individuais de controles, perfil e comentários.


### Complemento — inspeção integral dos comentários (22/11/2026)

A expansão de comentários também foi corrigida: a rotina agora percorre todos os controles visíveis de “ver mais/ver todos” (em vez de depender apenas do primeiro resultado) e permite até 40 lotes de expansão. A verificação dos comentários consulta o diálogo de comentários quando ele existe; caso contrário, usa a área da publicação. Isso evita declarar lista completa quando a área de comentários está em um diálogo separado ou quando o primeiro controle encontrado está oculto.

A regra de segurança permanece: a ausência de comentário só é considerada comprovada quando o perfil autenticado foi identificado e a lista está completa; encontrar um comentário próprio é evidência positiva mesmo com lista parcial. A ausência de identidade ou de completude continua desconhecida e não dispara comentário automático.

Commit desta extensão: e6532757235471206e2a5e97f5ce695d07928492. O novo CI precisa validar esta alteração também; não usar o resultado do commit anterior como prova desta extensão. A nova coleta TESTE autenticada ainda é necessária para verificar a captura real.
