#!/usr/bin/env bash
# Генератор manifest.json для архива Vemitreya
# Запускается из корня архива (где лежит install.sh)
# Создаёт manifest.json с SHA256-суммами всех файлов backend/ и frontend/
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VERSION=$(grep -E '^PANEL_VERSION = ' backend/main.py 2>/dev/null | head -1 | cut -d'"' -f2)
[ -z "$VERSION" ] && VERSION="unknown"

MANIFEST="manifest.json"

# Собираем хэши
{
  echo '{'
  echo '  "version": "'"$VERSION"'",'
  echo '  "generated_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",'
  echo '  "files": {'
  FIRST=1
  while IFS= read -r f; do
    HASH=$(sha256sum "$f" | cut -d' ' -f1)
    if [ $FIRST -eq 1 ]; then
      FIRST=0
    else
      echo ','
    fi
    printf '    "%s": "sha256:%s"' "$f" "$HASH"
  done < <(find backend frontend systemd -type f \
              ! -name "*.bak.*" ! -name "*.pyc" \
              ! -path "*/__pycache__/*" \
              ! -path "*/venv/*" 2>/dev/null | sort)
  echo ''
  echo '  }'
  echo '}'
} > "$MANIFEST"

echo "✓ manifest.json создан: $(wc -l < $MANIFEST) строк, $(wc -c < $MANIFEST) байт"
echo "  версия: $VERSION"
