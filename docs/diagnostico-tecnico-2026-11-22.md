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
