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
- Chave da API OpenAI para gerar comentários contextualizados.

## Configuração inicial

1. Baixe/clonar este repositório no Mac.
2. Instale o Node.js LTS.
3. Abra a pasta do projeto no Finder e execute `start.command`. Se o macOS bloquear o arquivo, abra as propriedades/permissões ou execute uma única vez `chmod +x start.command` no Terminal.
4. Na primeira execução, o projeto cria `.env` e abre o arquivo para configuração.
5. Preencha `OPENAI_API_KEY=` com sua chave da API OpenAI e salve.
6. Execute `start.command` novamente. O servidor ficará disponível em `http://127.0.0.1:4173`.
7. O navegador controlado abre o Instagram; faça login manualmente.

A sessão fica salva em `data/instagram-profile` neste Mac. Não compartilhe essa pasta.

## Histórico

O CSV é criado automaticamente em `data/historico.csv` e registra data/hora, URL, legenda lida, curtida, comentário, status e detalhes de erro. O histórico e o perfil do navegador ficam fora do Git.

## Chave da API

A chave fica no arquivo local `.env`, ignorado pelo Git. O comentário é gerado pela API OpenAI; isso pode gerar cobrança na conta da API, conforme o uso. Não coloque a chave em arquivos do projeto nem a envie ao GitHub.

## Limitações importantes

Esta é uma primeira implementação e ainda precisa ser validada com a conta e a versão atual do Instagram. O Instagram altera frequentemente a interface; seletores podem precisar de ajustes. Publicações privadas, removidas ou indisponíveis não serão processadas.

O aplicativo não contorna CAPTCHA, checkpoint, MFA, limites ou bloqueios. Se surgir uma verificação ou sinal de restrição, interrompa o uso e conclua qualquer confirmação diretamente no Instagram. O uso automatizado de curtidas e comentários pode contrariar as regras da plataforma e gerar restrições à conta. Não use para spam, comentários repetitivos ou interação em massa.

## Desenvolvimento

```bash
npm install
npx playwright install chromium
cp .env.example .env
# configure OPENAI_API_KEY no .env
npm start
```
