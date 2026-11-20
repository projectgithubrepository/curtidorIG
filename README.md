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
