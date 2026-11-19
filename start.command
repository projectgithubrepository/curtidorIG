#!/bin/zsh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Instale o Node.js LTS para usar o curtidorIG." buttons {"OK"}'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
  npx playwright install chromium
fi
if [ ! -f .env ]; then
  cp .env.example .env
  osascript -e 'display dialog "Foi criado o arquivo .env. Configure sua chave de API antes de iniciar." buttons {"OK"}'
  open -e .env
  exit 0
fi
npm start
