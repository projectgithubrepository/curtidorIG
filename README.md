# curtidorIG

Aplicação local, leve e em português para organizar URLs de publicações do Instagram no macOS.

## Primeira versão

- Interface local no navegador, com campo para colar URLs (uma por linha).
- Playwright abre um navegador Chromium com perfil persistente; o login é feito manualmente no Instagram.
- Histórico CSV local em `data/historico.csv`, atualizado a cada publicação.
- Verificação de URLs já registradas para evitar repetir uma publicação.
- Fila sequencial, limite de até 10 URLs por execução e intervalo mínimo de 60 segundos.
- Botão para interromper a fila.

## Requisitos

- macOS Intel ou Apple Silicon.
- Node.js LTS: https://nodejs.org/
- Biblioteca local de comentários por assunto, sem IA ou serviços externos.

## Configuração inicial

1. Baixe/clonar este repositório no Mac.
2. Instale o Node.js LTS.
3. Abra a pasta do projeto no Finder e execute `start.command`. Se o macOS bloquear o arquivo, abra as propriedades/permissões ou execute uma única vez `chmod +x start.command` no Terminal.
4. Execute `start.command` novamente. O servidor ficará disponível em `http://127.0.0.1:4173`.
5. O navegador controlado abre o Instagram; faça login manualmente.

A sessão fica salva em `data/instagram-profile` neste Mac. Não compartilhe essa pasta.

## Histórico

O CSV é criado automaticamente em `data/historico.csv` e registra data/hora, URL, legenda lida, curtida, comentário, status e detalhes de erro. O histórico e o perfil do navegador ficam fora do Git.

## Biblioteca de comentários

Os comentários são gerados localmente por composição, não pela escolha de uma lista curta de frases prontas. O motor identifica assunto, palavras-chave e intenção textual (pergunta, tutorial, conquista ou divulgação) e combina estruturas com vocabulário contextual. A biblioteca cobre 15 temas, mais de 100 palavras-chave e milhares de combinações possíveis. Todo comentário gerado precisa ter pelo menos duas palavras e um emoji. O histórico CSV é consultado para evitar repetir comentários recentes. Não há IA, API, chave, cobrança ou envio da legenda para terceiros. Como é um sistema baseado em regras, ele interpreta texto, não imagens, e pode não reconhecer ironia, contexto implícito ou assuntos fora da biblioteca.

## Limitações importantes

Esta é uma primeira implementação e ainda precisa ser validada com a conta e a versão atual do Instagram. O Instagram altera frequentemente a interface; seletores podem precisar de ajustes. Publicações privadas, removidas ou indisponíveis não serão processadas.

O aplicativo não contorna CAPTCHA, checkpoint, MFA, limites ou bloqueios. Se surgir uma verificação ou sinal de restrição, interrompa o uso e conclua qualquer confirmação diretamente no Instagram. O uso automatizado de curtidas e comentários pode contrariar as regras da plataforma e gerar restrições à conta. Não use para spam, comentários repetitivos ou interação em massa.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
npm start
```
