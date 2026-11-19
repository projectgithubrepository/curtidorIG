# curtidorIG

Aplicação local, leve e em português para coletar publicações compartilhadas em um grupo/conversa do Instagram durante um período definido.

## Primeira versão

- Interface para informar o nome exato do grupo e o período; coleta heurística de links de posts/Reels encontrados nas mensagens carregadas pelo Instagram.
- Playwright abre um navegador Chromium com perfil persistente; o login é feito manualmente no Instagram.
- Histórico CSV local em `data/historico.csv`, atualizado a cada publicação.
- Verificação de URLs já registradas para evitar repetir uma publicação.
- Deduplicação, leitura de legenda, sugestão de comentário local e revisão dos resultados na interface. Não publica curtidas/comentários nem salva coleções automaticamente.
- Botão para interromper a fila.

## Requisitos

- macOS Intel ou Apple Silicon.
- Node.js LTS: https://nodejs.org/
- Biblioteca local de comentários por assunto, sem IA ou serviços externos.

## Aplicativo para macOS

O projeto agora está configurado para gerar um aplicativo desktop Electron e um instalador DMG, sem exigir VS Code, Node.js ou Terminal no uso cotidiano.

1. Abra a aba **Actions** deste repositório no GitHub.
2. Aguarde a execução **Build macOS app** terminar com sucesso.
3. Baixe o artefato **curtidorIG-macOS** da execução concluída.
4. Abra o arquivo DMG, arraste **curtidorIG** para Aplicativos e abra pelo Finder ou Dock.

A primeira compilação é feita em um runner macOS do GitHub Actions. O pacote ainda não é assinado/notarizado com certificado Apple Developer; dependendo das configurações do macOS, pode ser necessário autorizar a abertura em Privacidade e Segurança. O primeiro login no Instagram é manual. Depois disso, a sessão fica armazenada nos dados locais do aplicativo.

Para desenvolvimento, os comandos Node continuam disponíveis, mas não fazem parte do uso normal do aplicativo.

A sessão fica salva em `data/instagram-profile` neste Mac. Não compartilhe essa pasta.

## Histórico

O CSV é criado automaticamente em `data/historico.csv` e registra data/hora, URL, legenda lida, curtida, comentário, status e detalhes de erro. O histórico e o perfil do navegador ficam fora do Git.

## Regra de origem das publicações

A pessoa informa o nome do grupo e o período. A coleta procura links de posts/Reels nas mensagens e usa a data/hora exposta no DOM pelo Instagram. O resultado é heurístico: mensagens sem data legível são ignoradas; mudanças na interface podem impedir a coleta. A data usada é a do compartilhamento na conversa, não a publicação original. Os detalhes estão em [Regras de negócio](docs/regras-de-negocio.md).

## Biblioteca de comentários

Os comentários são gerados localmente por composição, não pela escolha de uma lista curta de frases prontas. O motor identifica assunto, palavras-chave e intenção textual (pergunta, tutorial, conquista ou divulgação) e combina estruturas com vocabulário contextual. A biblioteca cobre 15 temas, mais de 100 palavras-chave e milhares de combinações possíveis. Todo comentário gerado precisa ter pelo menos duas palavras e um emoji. O histórico CSV é consultado para evitar repetir comentários recentes. Não há IA, API, chave, cobrança ou envio da legenda para terceiros. Como é um sistema baseado em regras, ele interpreta texto, não imagens, e pode não reconhecer ironia, contexto implícito ou assuntos fora da biblioteca.

## Limitações importantes

Esta é uma primeira implementação e ainda precisa ser validada com a conta e a versão atual do Instagram. O Instagram altera frequentemente a interface; seletores podem precisar de ajustes. Publicações privadas, removidas ou indisponíveis não serão processadas.

O aplicativo não contorna CAPTCHA, checkpoint, MFA, limites ou bloqueios. Se surgir uma verificação ou sinal de restrição, interrompa o uso e conclua qualquer confirmação diretamente no Instagram. A coleta e preparação de comentários não devem se transformar em disparos automáticos em lote: curtir, comentar ou salvar deve depender de uma ação explícita da pessoa na interface do Instagram. Não use para spam ou interação em massa.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npm start
```
