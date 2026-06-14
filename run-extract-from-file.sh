#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 <arquivo-com-links>"
  echo "Exemplo: $0 links.txt"
  exit 1
fi

links_file="$1"

if [[ ! -f "$links_file" ]]; then
  echo "Erro: arquivo nao encontrado: $links_file"
  exit 1
fi

mapfile -t urls < <(
  sed 's/\r$//' "$links_file" \
    | sed '/^[[:space:]]*$/d' \
    | sed '/^[[:space:]]*#/d'
)

if [[ ${#urls[@]} -eq 0 ]]; then
  echo "Nenhuma URL valida encontrada em: $links_file"
  exit 1
fi

for i in "${!urls[@]}"; do
  line="${urls[$i]}"
  url="${line%$'\r'}"

  # Ignora linhas vazias e comentarios.
  if [[ -z "${url//[[:space:]]/}" ]] || [[ "$url" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  echo "Processando: $url"
  npx tsx src/extract-match.ts "$url"

  if [[ "$i" -lt $(( ${#urls[@]} - 1 )) ]]; then
    delay_min=$(( (RANDOM % 3) + 1 ))
    echo "Aguardando $delay_min minuto(s) antes da proxima execucao..."
    sleep "$(( delay_min * 60 ))"
  fi
done

echo "Concluido."
