#!/bin/bash
# =====================================================
# Vemitreya — Installer for Ubuntu 22.04/24.04
# Базовая установка: Mihomo + Vemitreya панель
# AWG и TrustTunnel ставятся через веб-интерфейс
# =====================================================
set -e

# Цвета
G='\033[0;32m'  # green
Y='\033[0;33m'  # yellow
R='\033[0;31m'  # red
B='\033[0;34m'  # blue
M='\033[0;35m'  # magenta
N='\033[0m'     # reset
BOLD='\033[1m'
DIM='\033[2m'

step() { echo -e "\n${B}${BOLD}[$1]${N} ${BOLD}$2${N}"; }
ok()   { echo -e "${G}✓${N} $1"; }
warn() { echo -e "${Y}⚠${N} $1"; }
err()  { echo -e "${R}✗${N} $1"; }
info() { echo -e "  ${B}→${N} $1"; }

# Логотип
clear
echo -e "${M}${BOLD}"
cat <<'BANNER'
  __     __              _ _
  \ \   / /__ _ __ ___ (_) |_ _ __ ___ _   _  __ _
   \ \ / / _ \ '_ ` _ \| | __| '__/ _ \ | | |/ _` |
    \ V /  __/ | | | | | | |_| | |  __/ |_| | (_| |
     \_/ \___|_| |_| |_|_|\__|_|  \___|\__, |\__,_|
                                       |___/
BANNER
echo -e "${N}"
echo -e "       ${BOLD}Управление прокси-инфраструктурой${N}"
echo -e "       ${B}Mihomo + Vemitreya${N}  ${DIM}· AWG и TT через веб-UI${N}"
echo ""

if [ "$EUID" -ne 0 ]; then
    err "Запустите от root: sudo $0"
    exit 1
fi

if ! grep -qi "ubuntu" /etc/os-release; then
    warn "Этот скрипт тестирован на Ubuntu 22.04/24.04. Может работать некорректно."
    read -p "Продолжить? (y/N): " yn
    [ "$yn" != "y" ] && exit 0
fi

UBUNTU_VERSION=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2)
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  MIHOMO_ARCH="linux-amd64-compatible" ;;
    aarch64) MIHOMO_ARCH="linux-arm64" ;;
    armv7l)  MIHOMO_ARCH="linux-armv7" ;;
    *) err "Архитектура $ARCH не поддерживается"; exit 1 ;;
esac

ok "Ubuntu $UBUNTU_VERSION · arch=$ARCH"

echo ""
echo -e "${BOLD}Что установить?${N}"
echo "  1) Полная установка (Mihomo + Vemitreya панель)"
echo "  2) Только Vemitreya панель (Mihomo уже установлен)"
echo "  3) Обновить Vemitreya панель (применить новый frontend + системные фиксы)"
echo ""
echo -e "${DIM}AWG и TrustTunnel устанавливаются позже через веб-интерфейс Vemitreya:${N}"
echo -e "${DIM}  • вкладка «AWG»          — установка и настройка AmneziaWG${N}"
echo -e "${DIM}  • вкладка «TrustTunnel»  — установка и настройка TrustTunnel${N}"
echo ""
read -p "Выберите [1-3] (по умолчанию 1): " CHOICE
CHOICE=${CHOICE:-1}

INSTALL_MIHOMO=0
INSTALL_PANEL=0
UPDATE_ONLY=0

case "$CHOICE" in
    1) INSTALL_MIHOMO=1; INSTALL_PANEL=1 ;;
    2) INSTALL_PANEL=1 ;;
    3) UPDATE_ONLY=1 ;;
    *) err "Неверный выбор"; exit 1 ;;
esac

# AWG/TT теперь не в установщике — ставятся через веб-UI
INSTALL_AWG=0
INSTALL_TT=0
TUNNELS_ONLY=0

# Опциональный флаг: использовать Mihomo HTTP-прокси для apt и curl при установке
USE_MIHOMO_PROXY=0
if [[ " $@ " =~ " --use-mihomo-proxy " ]] || [ "$USE_MIHOMO_PROXY_ENV" = "1" ]; then
    USE_MIHOMO_PROXY=1
fi

# Применяем proxy если запрошено
if [ $USE_MIHOMO_PROXY -eq 1 ]; then
    MIHOMO_HTTP_PORT=$(grep -E "^port:" /opt/mihomo/config/config.yaml 2>/dev/null | awk '{print $2}' | head -1)
    MIHOMO_HTTP_PORT=${MIHOMO_HTTP_PORT:-7890}
    if curl -s --max-time 3 -o /dev/null "http://127.0.0.1:$MIHOMO_HTTP_PORT" 2>/dev/null || \
       systemctl is-active --quiet mihomo; then
        export http_proxy="http://127.0.0.1:$MIHOMO_HTTP_PORT"
        export https_proxy="http://127.0.0.1:$MIHOMO_HTTP_PORT"
        export HTTP_PROXY="http://127.0.0.1:$MIHOMO_HTTP_PORT"
        export HTTPS_PROXY="http://127.0.0.1:$MIHOMO_HTTP_PORT"
        echo "Acquire::http::Proxy \"http://127.0.0.1:$MIHOMO_HTTP_PORT\";" > /etc/apt/apt.conf.d/99vemitreya-proxy
        echo "Acquire::https::Proxy \"http://127.0.0.1:$MIHOMO_HTTP_PORT\";" >> /etc/apt/apt.conf.d/99vemitreya-proxy
        ok "Использую Mihomo proxy 127.0.0.1:$MIHOMO_HTTP_PORT для apt и curl"
        trap 'rm -f /etc/apt/apt.conf.d/99vemitreya-proxy' EXIT
    else
        warn "Mihomo proxy не доступен на 127.0.0.1:$MIHOMO_HTTP_PORT — продолжаем без proxy"
    fi
fi

# =====================================================
# 0. Миграция со старых имён
# =====================================================
if [ -d /opt/vemireya ] && [ ! -d /opt/vemitreya ]; then
    step 0 "Миграция Vemireya → Vemitreya"
    info "Останавливаю старый сервис..."
    systemctl stop vemireya 2>/dev/null || true
    systemctl disable vemireya 2>/dev/null || true
    rm -f /etc/systemd/system/vemireya.service
    info "Перенос /opt/vemireya → /opt/vemitreya..."
    mv /opt/vemireya /opt/vemitreya
    [ -f /opt/vemitreya/.env ] && sed -i 's|/opt/vemireya|/opt/vemitreya|g' /opt/vemitreya/.env
    # venv хранит абсолютные пути - после переименования он сломан, удалим
    if [ -d /opt/vemitreya/venv ]; then
        info "Удаление старого venv (пересоздадим заново)..."
        rm -rf /opt/vemitreya/venv
    fi
    ok "Миграция выполнена"
fi

if [ -d /opt/mihomo-panel ] && [ ! -d /opt/vemitreya ]; then
    step 0 "Миграция mihomo-panel (Mihomo Ultra Panel) → Vemitreya"
    systemctl stop mihomo-panel 2>/dev/null || true
    systemctl disable mihomo-panel 2>/dev/null || true
    rm -f /etc/systemd/system/mihomo-panel.service
    mv /opt/mihomo-panel /opt/vemitreya
    [ -f /opt/vemitreya/.env ] && sed -i 's|/opt/mihomo-panel|/opt/vemitreya|g' /opt/vemitreya/.env

    # venv хранит абсолютные пути - после переименования он сломан, удалим
    if [ -d /opt/vemitreya/venv ]; then
        info "Удаление старого venv (пересоздадим заново)..."
        rm -rf /opt/vemitreya/venv
    fi

    # Если в .env нет API_TOKEN — добавим (Mihomo Ultra Panel мог работать без него)
    if [ -f /opt/vemitreya/.env ] && ! grep -q "^API_TOKEN=" /opt/vemitreya/.env; then
        TOKEN=$(openssl rand -hex 32)
        echo "API_TOKEN=$TOKEN" >> /opt/vemitreya/.env
        info "В .env добавлен API_TOKEN (его не было)"
    fi
    # Также добавим PANEL_INSTALL_DIR если его нет
    if [ -f /opt/vemitreya/.env ] && ! grep -q "^PANEL_INSTALL_DIR=" /opt/vemitreya/.env; then
        echo "PANEL_INSTALL_DIR=/opt/vemitreya" >> /opt/vemitreya/.env
    fi

    ok "Миграция выполнена"
fi

# =====================================================
# Базовые пакеты
# =====================================================
step 1 "Базовые системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    curl wget unzip jq git \
    python3 python3-venv python3-pip \
    iproute2 iptables \
    ca-certificates gnupg lsb-release \
    openssl \
    > /dev/null
ok "Системные зависимости установлены"

# =====================================================
# 1. MIHOMO
# =====================================================
if [ $INSTALL_MIHOMO -eq 1 ]; then
    step 2 "Установка Mihomo Core"
    if [ -f /usr/local/bin/mihomo ] && /usr/local/bin/mihomo -v >/dev/null 2>&1; then
        VER=$(/usr/local/bin/mihomo -v 2>&1 | head -1)
        info "Уже установлен: $VER"
    else
        info "Получение последнего релиза с GitHub..."
        LATEST=$(curl -s --max-time 10 --connect-timeout 5 \
            https://api.github.com/repos/MetaCubeX/mihomo/releases/latest 2>/dev/null | jq -r '.tag_name')

        # Если GitHub API недоступен — пробуем через прокси-зеркало
        if [ -z "$LATEST" ] || [ "$LATEST" = "null" ]; then
            warn "GitHub API недоступен напрямую, пробуем зеркало..."
            LATEST=$(curl -s --max-time 10 --connect-timeout 5 \
                "https://gh-proxy.com/https://api.github.com/repos/MetaCubeX/mihomo/releases/latest" 2>/dev/null | jq -r '.tag_name')
        fi

        if [ -z "$LATEST" ] || [ "$LATEST" = "null" ]; then
            err "Не удалось получить версию Mihomo. GitHub недоступен."
            err "Решение: настройте VPN на хосте или используйте --use-mihomo-proxy"
            err "Или скачайте mihomo вручную с https://github.com/MetaCubeX/mihomo/releases"
            exit 1
        fi

        info "Скачивание mihomo $LATEST ($MIHOMO_ARCH)..."
        # Несколько зеркал на случай блокировки GitHub
        MIHOMO_MIRRORS=(
            "https://github.com/MetaCubeX/mihomo/releases/download/${LATEST}/mihomo-${MIHOMO_ARCH}-${LATEST}.gz"
            "https://gh-proxy.com/https://github.com/MetaCubeX/mihomo/releases/download/${LATEST}/mihomo-${MIHOMO_ARCH}-${LATEST}.gz"
            "https://ghproxy.net/https://github.com/MetaCubeX/mihomo/releases/download/${LATEST}/mihomo-${MIHOMO_ARCH}-${LATEST}.gz"
        )

        DOWNLOADED=0
        for url in "${MIHOMO_MIRRORS[@]}"; do
            info "  → пробуем $(echo "$url" | awk -F'/' '{print $3}')..."
            if curl -fL --max-time 60 --connect-timeout 10 -o /tmp/mihomo.gz "$url" 2>/dev/null; then
                if [ -s /tmp/mihomo.gz ]; then
                    DOWNLOADED=1
                    break
                fi
            fi
        done

        if [ $DOWNLOADED -eq 0 ]; then
            err "Не удалось скачать mihomo ни с одного зеркала"
            err "Скачайте вручную: https://github.com/MetaCubeX/mihomo/releases"
            exit 1
        fi

        gunzip -f /tmp/mihomo.gz
        mv /tmp/mihomo /usr/local/bin/mihomo
        chmod +x /usr/local/bin/mihomo
        ok "Установлен mihomo $LATEST"
    fi

    mkdir -p /opt/mihomo/config /opt/mihomo/geo /opt/mihomo/ui

    info "Загрузка GeoIP/GeoSite баз..."

    # Несколько источников — если GitHub недоступен (часто блокируется в РФ),
    # пробуем зеркала. Каждый с таймаутом 30 секунд.
    GEO_FILES=(
        "geosite.dat"
        "geoip.dat"
        "Country.mmdb:country.mmdb"  # назначение:имя_в_релизе
    )

    GEO_MIRRORS=(
        "https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download"
        "https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download"
        "https://ghproxy.net/https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download"
    )

    download_geo_file() {
        local dest_name="$1"      # имя файла на диске
        local src_name="${2:-$1}" # имя файла в релизе
        local dest_path="/opt/mihomo/geo/$dest_name"

        if [ -f "$dest_path" ] && [ -s "$dest_path" ]; then
            return 0
        fi

        for mirror in "${GEO_MIRRORS[@]}"; do
            info "  → скачиваем $dest_name через $(echo "$mirror" | awk -F'/' '{print $3}')..."
            if curl -fL --max-time 30 --connect-timeout 8 \
                    -o "$dest_path.tmp" "$mirror/$src_name" 2>/dev/null; then
                if [ -s "$dest_path.tmp" ]; then
                    mv "$dest_path.tmp" "$dest_path"
                    ok "  ✓ $dest_name загружен ($(du -h "$dest_path" | cut -f1))"
                    return 0
                fi
            fi
            rm -f "$dest_path.tmp"
        done

        warn "Не удалось скачать $dest_name ни с одного зеркала"
        warn "Mihomo сможет работать без $dest_name, но GEO-правила не будут работать."
        warn "Скачайте файл вручную позже:"
        warn "  curl -L -o $dest_path \\"
        warn "    https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download/$src_name"
        return 1
    }

    download_geo_file "geosite.dat" || true
    download_geo_file "geoip.dat" || true
    download_geo_file "Country.mmdb" "country.mmdb" || true

    # symlinks в /opt/mihomo/ (CWD при mihomo -t),
    # чтобы валидация конфига работала без скачивания заново.
    # Mihomo при -t ищет файлы относительно -d, не по абсолютным geosite-path.
    for src_dest in \
        "geosite.dat:GeoSite.dat" \
        "geosite.dat:geosite.dat" \
        "geoip.dat:GeoIP.dat" \
        "geoip.dat:geoip.dat" \
        "Country.mmdb:Country.mmdb"
    do
        src="/opt/mihomo/geo/${src_dest%%:*}"
        dest="/opt/mihomo/${src_dest##*:}"
        if [ -f "$src" ] && [ ! -e "$dest" ]; then
            ln -sf "$src" "$dest"
        fi
    done

    ok "GeoIP базы — готово (symlinks в /opt/mihomo/ для валидации)"

    # Генерим Mihomo secret для API авторизации (если не задан)
    if [ -z "${MIHOMO_SECRET_VAL:-}" ]; then
        MIHOMO_SECRET_VAL=$(openssl rand -hex 16)
    fi

    if [ ! -f /opt/mihomo/config/config.yaml ]; then
        cat > /opt/mihomo/config/config.yaml << YAML
port: 7890
socks-port: 7891
redir-port: 7892
tproxy-port: 7893
mixed-port: 7894
allow-lan: true
bind-address: '*'
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
external-ui: /opt/mihomo/ui
secret: '${MIHOMO_SECRET_VAL}'
geodata-mode: true
geosite-path: /opt/mihomo/geo/geosite.dat
geoip-path: /opt/mihomo/geo/geoip.dat
mmdb-path: /opt/mihomo/geo/Country.mmdb

proxies: []
proxy-groups:
  - name: 🌐 Основной трафик
    type: select
    proxies:
      - DIRECT
rules:
  - MATCH,🌐 Основной трафик
YAML
        ok "Создан стартовый config.yaml (API на 127.0.0.1:9090 + secret)"
    else
        # Миграция существующего конфига: external-controller 0.0.0.0:9090 → 127.0.0.1:9090
        # и установить secret если пустой
        MIGRATED=0
        if grep -qE '^external-controller:\s*0\.0\.0\.0:9090' /opt/mihomo/config/config.yaml; then
            cp /opt/mihomo/config/config.yaml "/opt/mihomo/config/config.yaml.bak.$(date +%s)"
            sed -i -E 's|^external-controller:\s*0\.0\.0\.0:9090|external-controller: 127.0.0.1:9090|' /opt/mihomo/config/config.yaml
            MIGRATED=1
        fi
        # Установить secret если пустой
        if grep -qE "^secret:\s*''\s*\$|^secret:\s*\"\"\s*\$|^secret:\s*\$" /opt/mihomo/config/config.yaml; then
            cp /opt/mihomo/config/config.yaml "/opt/mihomo/config/config.yaml.bak.$(date +%s)"
            sed -i -E "s|^secret:.*|secret: '${MIHOMO_SECRET_VAL}'|" /opt/mihomo/config/config.yaml
            MIGRATED=1
        else
            # Secret уже есть — извлечь его чтобы синхронизировать с .env Vemitreya
            EXISTING_SECRET=$(grep -E "^secret:" /opt/mihomo/config/config.yaml | sed -E "s/^secret:\s*['\"]?([^'\"]*)['\"]?\s*\$/\1/" | head -1)
            [ -n "$EXISTING_SECRET" ] && MIHOMO_SECRET_VAL="$EXISTING_SECRET"
        fi
        [ $MIGRATED -eq 1 ] && ok "Mihomo config обновлён: API локально + secret"
    fi

    cat > /etc/systemd/system/mihomo.service << 'UNIT'
[Unit]
Description=Mihomo Proxy Core
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mihomo -d /opt/mihomo -f /opt/mihomo/config/config.yaml
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable mihomo >/dev/null 2>&1
    systemctl restart mihomo
    sleep 2
    if systemctl is-active --quiet mihomo; then
        ok "Mihomo запущен и в автозагрузке"
    else
        warn "Mihomo не запустился. Логи: journalctl -u mihomo -n 30"
    fi
fi

# =====================================================
# 4. VEMITREYA PANEL
# =====================================================
if [ $INSTALL_PANEL -eq 1 ] || [ $UPDATE_ONLY -eq 1 ]; then
    step 5 "Установка/обновление Vemitreya панели"

    INSTALL_DIR=/opt/vemitreya
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [ ! -d $INSTALL_DIR ]; then
        mkdir -p $INSTALL_DIR/{backend,frontend,data,backups}
        info "Создан $INSTALL_DIR"
    fi

    # Backup перед перезаписью
    if [ -d $INSTALL_DIR/backend ] && [ "$(ls -A $INSTALL_DIR/backend 2>/dev/null)" ]; then
        BACKUP_DIR=$INSTALL_DIR/backups/backup_$(date +%Y%m%d_%H%M%S)
        info "Backup → $BACKUP_DIR"
        mkdir -p $BACKUP_DIR
        cp -r $INSTALL_DIR/backend $BACKUP_DIR/ 2>/dev/null || true
        cp -r $INSTALL_DIR/frontend $BACKUP_DIR/ 2>/dev/null || true
    fi

    info "Копирование файлов из $SCRIPT_DIR..."
    cp -rf $SCRIPT_DIR/backend/* $INSTALL_DIR/backend/
    cp -rf $SCRIPT_DIR/frontend/* $INSTALL_DIR/frontend/

    # Проверка venv: существует ли + рабочий ли (шебанг указывает на правильный python)
    VENV_BROKEN=0
    if [ -d $INSTALL_DIR/venv ]; then
        if [ ! -f $INSTALL_DIR/venv/bin/python ] || ! $INSTALL_DIR/venv/bin/python -V >/dev/null 2>&1; then
            warn "venv сломан (битые шебанги или отсутствует python). Пересоздаю..."
            rm -rf $INSTALL_DIR/venv
            VENV_BROKEN=1
        fi
    fi

    if [ ! -f $INSTALL_DIR/venv/bin/python ]; then
        info "Создание Python venv..."
        python3 -m venv $INSTALL_DIR/venv
    fi

    info "Установка Python зависимостей..."
    if ! $INSTALL_DIR/venv/bin/pip install -q --upgrade pip; then
        err "Не удалось обновить pip. Проверьте доступ в интернет."
        exit 1
    fi
    if ! $INSTALL_DIR/venv/bin/pip install -q -r $INSTALL_DIR/backend/requirements.txt; then
        err "Не удалось установить зависимости из requirements.txt"
        exit 1
    fi
    ok "Зависимости установлены"

    if [ ! -f $INSTALL_DIR/.env ]; then
        TOKEN=$(openssl rand -hex 32)
        cat > $INSTALL_DIR/.env << ENV
API_TOKEN=$TOKEN
MIHOMO_CONFIG=/opt/mihomo/config/config.yaml
MIHOMO_API=http://127.0.0.1:9090
MIHOMO_SECRET=${MIHOMO_SECRET_VAL:-}
MIHOMO_BINARY=/usr/local/bin/mihomo
AWG_DIR=/etc/amnezia/amneziawg
TRUSTTUNNEL_DIR=/opt/trusttunnel_client/configs
TRUSTTUNNEL_BIN=/opt/trusttunnel_client/trusttunnel_client
DB_PATH=$INSTALL_DIR/data/panel.db
FRONTEND_DIR=$INSTALL_DIR/frontend
PANEL_INSTALL_DIR=$INSTALL_DIR
ENV
        chmod 600 $INSTALL_DIR/.env
        ok "Создан .env с новым API токеном"
    else
        ok ".env существует — не трогаем"
        # Поправим устаревшие пути TrustTunnel
        sed -i 's|/opt/trusttunnel-client/configs|/opt/trusttunnel_client/configs|g' $INSTALL_DIR/.env
        sed -i 's|/opt/trusttunnel-client/bin/trusttunnel_client|/opt/trusttunnel_client/trusttunnel_client|g' $INSTALL_DIR/.env
        sed -i 's|/opt/trusttunnel_client/bin/trusttunnel_client|/opt/trusttunnel_client/trusttunnel_client|g' $INSTALL_DIR/.env
        # И PANEL_INSTALL_DIR если его нет
        grep -q "^PANEL_INSTALL_DIR=" $INSTALL_DIR/.env || echo "PANEL_INSTALL_DIR=$INSTALL_DIR" >> $INSTALL_DIR/.env
        # Синхронизация MIHOMO_SECRET если он был обновлён (v2.206)
        if [ -n "${MIHOMO_SECRET_VAL:-}" ]; then
            if grep -q "^MIHOMO_SECRET=" $INSTALL_DIR/.env; then
                sed -i "s|^MIHOMO_SECRET=.*|MIHOMO_SECRET=${MIHOMO_SECRET_VAL}|" $INSTALL_DIR/.env
            else
                echo "MIHOMO_SECRET=${MIHOMO_SECRET_VAL}" >> $INSTALL_DIR/.env
            fi
        fi
    fi

    # Удаляем устаревшие сервисы
    for OLD in vemireya mihomo-panel; do
        if [ -f /etc/systemd/system/${OLD}.service ]; then
            info "Удаление старого ${OLD}.service"
            systemctl stop ${OLD} 2>/dev/null || true
            systemctl disable ${OLD} 2>/dev/null || true
            rm -f /etc/systemd/system/${OLD}.service
        fi
    done

    cat > /etc/systemd/system/vemitreya.service << UNIT
[Unit]
Description=Vemitreya — Mihomo Control Panel
After=network-online.target mihomo.service
Wants=network-online.target mihomo.service
StartLimitIntervalSec=300
StartLimitBurst=20

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/backend/main.py
Restart=always
RestartSec=10
LimitNOFILE=65535
TimeoutStartSec=30
TimeoutStopSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vemitreya

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable vemitreya >/dev/null 2>&1
    systemctl restart vemitreya
    sleep 3

    if systemctl is-active --quiet vemitreya; then
        ok "Vemitreya запущена"
    else
        err "Vemitreya не запустилась. Логи:"
        journalctl -u vemitreya -n 20 --no-pager
        exit 1
    fi
fi

# =====================================================
# 6. Системные фиксы (применяются всегда)
# =====================================================
step 6 "Системные исправления"

# 6.geo: symlinks geo-баз в /opt/mihomo/ — для работы mihomo -t
# При обновлении старых установок где symlinks не создавались
if [ -d /opt/mihomo/geo ]; then
    SYMLINKS_CREATED=0
    for src_dest in \
        "geosite.dat:GeoSite.dat" \
        "geosite.dat:geosite.dat" \
        "geoip.dat:GeoIP.dat" \
        "geoip.dat:geoip.dat" \
        "Country.mmdb:Country.mmdb"
    do
        src="/opt/mihomo/geo/${src_dest%%:*}"
        dest="/opt/mihomo/${src_dest##*:}"
        if [ -f "$src" ] && [ ! -e "$dest" ]; then
            ln -sf "$src" "$dest"
            SYMLINKS_CREATED=$((SYMLINKS_CREATED + 1))
        fi
    done
    if [ $SYMLINKS_CREATED -gt 0 ]; then
        ok "Geo symlinks: создано $SYMLINKS_CREATED для mihomo -t валидации"
    fi
fi

# 6a. Mihomo: гарантировать наличие всех 5 портов + localhost API + secret
if [ -f /opt/mihomo/config/config.yaml ]; then
    # Извлекаем secret из .env Vemitreya (если есть)
    ENV_MIHOMO_SECRET=""
    if [ -f /opt/vemitreya/.env ]; then
        ENV_MIHOMO_SECRET=$(grep '^MIHOMO_SECRET=' /opt/vemitreya/.env 2>/dev/null | cut -d= -f2-)
    fi

    LEGACY_COUNT=0
    for key in port socks-port mixed-port redir-port tproxy-port; do
        grep -qE "^${key}\s*:" /opt/mihomo/config/config.yaml 2>/dev/null && LEGACY_COUNT=$((LEGACY_COUNT+1))
    done
    LISTENERS_COUNT=$(grep -cE '^\s*- name:' /opt/mihomo/config/config.yaml 2>/dev/null || echo 0)

    CFG_NEEDS_FIX=0
    [ "$LEGACY_COUNT" -lt 5 ] && CFG_NEEDS_FIX=1
    grep -qE '^external-controller:\s*0\.0\.0\.0:9090' /opt/mihomo/config/config.yaml && CFG_NEEDS_FIX=1
    # Если в .env есть secret, а в config — нет/пусто
    if [ -n "$ENV_MIHOMO_SECRET" ]; then
        CFG_SECRET=$(grep -E "^secret:" /opt/mihomo/config/config.yaml | sed -E "s/^secret:\s*['\"]?([^'\"]*)['\"]?\s*\$/\1/" | head -1)
        [ "$CFG_SECRET" != "$ENV_MIHOMO_SECRET" ] && CFG_NEEDS_FIX=1
    fi

    if [ $CFG_NEEDS_FIX -eq 1 ]; then
        info "Mihomo: исправляю конфиг (порты / API / secret)..."
        cp /opt/mihomo/config/config.yaml "/opt/mihomo/config/config.yaml.bak.$(date +%s)"

        VPY=python3
        [ -x /opt/vemitreya/venv/bin/python ] && VPY=/opt/vemitreya/venv/bin/python

        if $VPY -c "from ruamel.yaml import YAML" 2>/dev/null; then
            ENV_SECRET="$ENV_MIHOMO_SECRET" $VPY - <<'PYEOF'
import os
from ruamel.yaml import YAML
yaml = YAML(); yaml.preserve_quotes = True; yaml.width = 4096
yaml.indent(mapping=2, sequence=4, offset=2)
path = "/opt/mihomo/config/config.yaml"
with open(path) as f: cfg = yaml.load(f)
changes = []

# 1. Конвертация listeners → top-level (если есть)
mp = {"http":"port","socks":"socks-port","mixed":"mixed-port","redir":"redir-port","tproxy":"tproxy-port"}
for l in (cfg.get("listeners") or []):
    if isinstance(l, dict):
        t = (l.get("type") or "").lower(); p = l.get("port")
        if t in mp and isinstance(p, int) and mp[t] not in cfg:
            cfg[mp[t]] = p
            changes.append(f"listeners→{mp[t]}={p}")
if "listeners" in cfg:
    del cfg["listeners"]
    changes.append("удалён listeners block")

# 2. Гарантировать все 5 портов (defaults)
defaults = {"port": 7890, "socks-port": 7891, "redir-port": 7892,
            "tproxy-port": 7893, "mixed-port": 7894}
for k, v in defaults.items():
    if k not in cfg:
        cfg[k] = v
        changes.append(f"добавлен {k}={v}")

# 3. external-controller на localhost (если был 0.0.0.0)
ctrl = cfg.get("external-controller", "")
if isinstance(ctrl, str) and ctrl.startswith("0.0.0.0:"):
    port = ctrl.split(":", 1)[1]
    cfg["external-controller"] = f"127.0.0.1:{port}"
    changes.append(f"external-controller → 127.0.0.1:{port}")
elif "external-controller" not in cfg:
    cfg["external-controller"] = "127.0.0.1:9090"
    changes.append("external-controller=127.0.0.1:9090")

# 4. Синхронизировать secret из .env (если есть)
env_secret = os.environ.get("ENV_SECRET", "")
if env_secret:
    if cfg.get("secret", "") != env_secret:
        cfg["secret"] = env_secret
        changes.append(f"secret синхронизирован с .env")

# 5. allow-lan
if not cfg.get("allow-lan"):
    cfg["allow-lan"] = True
    changes.append("allow-lan=true")

if changes:
    with open(path, "w") as f: yaml.dump(cfg, f)
    print("  + " + ", ".join(changes))
PYEOF
            if /usr/local/bin/mihomo -t -d /opt/mihomo -f /opt/mihomo/config/config.yaml >/dev/null 2>&1; then
                systemctl restart mihomo 2>/dev/null || true
                sleep 1
                if systemctl is-active --quiet mihomo; then
                    ok "Mihomo: конфиг обновлён, сервис активен"
                else
                    warn "Mihomo не стартанул — откат"
                    ls -t /opt/mihomo/config/config.yaml.bak.* | head -1 | xargs -I {} cp {} /opt/mihomo/config/config.yaml
                    systemctl restart mihomo 2>/dev/null
                fi
            else
                warn "Конфиг не прошёл валидацию — откат"
                ls -t /opt/mihomo/config/config.yaml.bak.* | head -1 | xargs -I {} cp {} /opt/mihomo/config/config.yaml
                systemctl restart mihomo 2>/dev/null
            fi
        else
            warn "ruamel.yaml недоступен — пропускаю"
        fi
    else
        ok "Mihomo: конфиг уже корректный (все порты, API на localhost, secret синхронизирован)"
    fi
fi

# 6b. AWG: исправления маршрутизации если awg0.conf существует
if [ -f /etc/amnezia/amneziawg/awg0.conf ]; then
    AWG_CONF=/etc/amnezia/amneziawg/awg0.conf
    NEED_FIX=0
    grep -qE '^Table\s*=\s*off' "$AWG_CONF" || NEED_FIX=1
    grep -qE '^MTU\s*=\s*1200'   "$AWG_CONF" || NEED_FIX=1
    grep -qE 'fwmark 0xca6c'     "$AWG_CONF" || NEED_FIX=1

    if [ $NEED_FIX -eq 1 ]; then
        info "AWG: применяю Table=off + fwmark policy + MTU=1200..."
        cp "$AWG_CONF" "${AWG_CONF}.bak.$(date +%s)"
        sed -i -E '/^(PostUp|PostDown|Table|MTU)\s*=/d' "$AWG_CONF"
        sed -i '/^\[Peer\]/i\
Table = off\
MTU = 1200\
PostUp = ip route add default dev awg0 table 51820 || true\
PostUp = ip rule add fwmark 0xca6c lookup 51820 || true\
PostDown = ip rule del fwmark 0xca6c lookup 51820 2>/dev/null || true\
PostDown = ip route del default dev awg0 table 51820 2>/dev/null || true\
' "$AWG_CONF"
        if ip link show awg0 >/dev/null 2>&1; then
            systemctl restart awg-quick@awg0 2>/dev/null || true
            sleep 1
        fi
        ok "AWG: Table=off + MTU 1200 + fwmark policy"
    else
        ok "AWG: маршрутизация уже корректна"
    fi
fi

# 6c. Sysctl: ip_forward персистентно
cat > /etc/sysctl.d/99-vemitreya.conf << 'SYSCTL'
# Vemitreya — параметры сети
net.ipv4.ip_forward = 1
net.ipv4.conf.all.src_valid_mark = 1
SYSCTL

DUPS=$(grep -cE '^net\.ipv4\.ip_forward' /etc/sysctl.conf 2>/dev/null || echo 0)
DUPS=${DUPS:-0}
DUPS=$(echo "$DUPS" | head -1 | tr -d '[:space:]')
if [ "${DUPS:-0}" -gt 1 ] 2>/dev/null; then
    cp /etc/sysctl.conf "/etc/sysctl.conf.bak.$(date +%s)"
    sed -i -E '/^#?\s*net\.ipv4\.ip_forward/d' /etc/sysctl.conf
    info "Удалено $DUPS дубликатов ip_forward из /etc/sysctl.conf"
fi
sysctl --system >/dev/null 2>&1 || true
ok "Sysctl: ip_forward + src_valid_mark применены и сохранены"

# 6d. Очистка остатков прошлых установок
CLEANED=0
if [ -d /opt/trusttunnel_client ] && [ ! -f /opt/trusttunnel_client/trusttunnel_client ]; then
    rm -rf /opt/trusttunnel_client
    info "Удалена пустая /opt/trusttunnel_client/"
    CLEANED=1
fi
if command -v nft >/dev/null 2>&1; then
    if nft list ruleset 2>/dev/null | grep -qE 'chain (dbg|debug-prerouting)'; then
        nft list ruleset 2>/dev/null | grep -oE 'chain (dbg|debug-prerouting)' | \
        while read -r _ name; do
            nft delete chain ip nat "$name" 2>/dev/null && info "Удалена nft-цепочка: $name"
        done
        CLEANED=1
    fi
fi
if [ -d /opt/trusttunnel-client/configs ]; then
    JUNK=$(find /opt/trusttunnel-client/configs -maxdepth 1 -type f \
           ! -name '*_socks.toml' 2>/dev/null | wc -l)
    if [ "$JUNK" -gt 0 ]; then
        find /opt/trusttunnel-client/configs -maxdepth 1 -type f \
            ! -name '*_socks.toml' -delete 2>/dev/null || true
        info "Удалено $JUNK wizard/backup файлов из TT configs"
        CLEANED=1
    fi
fi
[ $CLEANED -eq 0 ] && ok "Очистка: мусора не найдено"

# =====================================================
# 6e. Hardening: dedicated user + sudoers + опциональный TLS (v2.206)
# =====================================================
step 6e "Hardening: пользователь vemitreya + sudoers + Caddy"

# 1) Создать system user vemitreya если его нет
if ! id vemitreya &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin --user-group vemitreya
    info "Создан system user vemitreya"
else
    info "User vemitreya уже существует"
fi

# 2) Sudoers — узкий whitelist
cat > /etc/sudoers.d/vemitreya << 'SUDOERS'
# Vemitreya panel — узкие sudo-права для управления стеком
# Создано install.sh v2.206
Defaults:vemitreya !requiretty
Defaults:vemitreya env_keep += "DEBIAN_FRONTEND PATH http_proxy https_proxy HTTP_PROXY HTTPS_PROXY"

# Управление сервисами
vemitreya ALL=(root) NOPASSWD: /bin/systemctl start mihomo, \
                                /bin/systemctl stop mihomo, \
                                /bin/systemctl restart mihomo, \
                                /bin/systemctl reload mihomo, \
                                /bin/systemctl status mihomo, \
                                /bin/systemctl is-active mihomo, \
                                /bin/systemctl is-enabled mihomo
vemitreya ALL=(root) NOPASSWD: /bin/systemctl start awg-quick@*, \
                                /bin/systemctl stop awg-quick@*, \
                                /bin/systemctl restart awg-quick@*, \
                                /bin/systemctl status awg-quick@*, \
                                /bin/systemctl is-active awg-quick@*, \
                                /bin/systemctl is-enabled awg-quick@*, \
                                /bin/systemctl enable awg-quick@*, \
                                /bin/systemctl disable awg-quick@*
vemitreya ALL=(root) NOPASSWD: /bin/systemctl start trusttunnel-*, \
                                /bin/systemctl stop trusttunnel-*, \
                                /bin/systemctl restart trusttunnel-*, \
                                /bin/systemctl status trusttunnel-*, \
                                /bin/systemctl is-active trusttunnel-*, \
                                /bin/systemctl is-enabled trusttunnel-*

# Бинари стека
vemitreya ALL=(root) NOPASSWD: /usr/bin/awg, /usr/bin/awg-quick *
vemitreya ALL=(root) NOPASSWD: /opt/trusttunnel_client/trusttunnel_client *
vemitreya ALL=(root) NOPASSWD: /usr/local/bin/mihomo -t *

# Установка AWG/TT через UI
vemitreya ALL=(root) NOPASSWD: /usr/bin/apt-get update, \
                                /usr/bin/apt-get install -y -qq *
vemitreya ALL=(root) NOPASSWD: /usr/bin/add-apt-repository -y *

# Чтение journalctl
vemitreya ALL=(root) NOPASSWD: /usr/bin/journalctl *

# awg0.conf через временный файл
vemitreya ALL=(root) NOPASSWD: /bin/cp /tmp/awg-*.conf /etc/amnezia/amneziawg/*.conf
vemitreya ALL=(root) NOPASSWD: /bin/chmod 600 /etc/amnezia/amneziawg/*.conf
vemitreya ALL=(root) NOPASSWD: /bin/chown root\:root /etc/amnezia/amneziawg/*.conf
vemitreya ALL=(root) NOPASSWD: /bin/rm -f /etc/amnezia/amneziawg/*.conf

# TT systemd unit-файлы через временный файл
vemitreya ALL=(root) NOPASSWD: /bin/cp /tmp/ttunit-*.service /etc/systemd/system/trusttunnel-*.service
vemitreya ALL=(root) NOPASSWD: /bin/chmod 644 /etc/systemd/system/trusttunnel-*.service
vemitreya ALL=(root) NOPASSWD: /bin/chown root\:root /etc/systemd/system/trusttunnel-*.service
vemitreya ALL=(root) NOPASSWD: /bin/rm -f /etc/systemd/system/trusttunnel-*.service
vemitreya ALL=(root) NOPASSWD: /bin/systemctl daemon-reload
vemitreya ALL=(root) NOPASSWD: /bin/systemctl enable trusttunnel-*, \
                                /bin/systemctl disable trusttunnel-*, \
                                /bin/systemctl enable awg-quick@*, \
                                /bin/systemctl disable awg-quick@*

# Системные параметры (только чтение)
vemitreya ALL=(root) NOPASSWD: /usr/sbin/nft list ruleset
vemitreya ALL=(root) NOPASSWD: /usr/sbin/ip route, /usr/sbin/ip rule, /usr/sbin/ip link show *
SUDOERS
chmod 440 /etc/sudoers.d/vemitreya

# Проверка sudoers синтаксиса
if visudo -c -f /etc/sudoers.d/vemitreya >/dev/null 2>&1; then
    ok "sudoers /etc/sudoers.d/vemitreya валиден"
else
    err "sudoers НЕ прошёл валидацию — удаляю чтобы не сломать sudo"
    rm -f /etc/sudoers.d/vemitreya
fi

# 3) Caddy для TLS (опционально — активируется через --secure-mode)
if ! command -v caddy >/dev/null 2>&1; then
    info "Установка Caddy для TLS reverse-proxy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null 2>&1 || true
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' 2>/dev/null \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true
    if [ -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]; then
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
            > /etc/apt/sources.list.d/caddy-stable.list 2>/dev/null || true
        apt-get update -qq >/dev/null 2>&1
        if apt-get install -y -qq caddy >/dev/null 2>&1; then
            ok "Caddy установлен"
        else
            warn "Caddy не удалось установить"
        fi
    else
        warn "Caddy: не удалось добавить репозиторий (возможно блок GPG)"
    fi
else
    ok "Caddy уже установлен"
fi

# 4) Caddyfile — заготовка, выключен по умолчанию
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile.vemitreya << 'CADDY'
# Vemitreya — TLS reverse-proxy перед panel:8888
# Активация (вручную):
#   sudo cp /etc/caddy/Caddyfile.vemitreya /etc/caddy/Caddyfile
#   sudo systemctl enable --now caddy
# По умолчанию слушает :8889 с self-signed cert (tls internal).

:8889 {
    tls internal
    reverse_proxy 127.0.0.1:8888 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}

# Если есть домен — раскомментируйте:
# vemitreya.example.com {
#     reverse_proxy 127.0.0.1:8888
# }
CADDY
ok "Caddyfile-заготовка: /etc/caddy/Caddyfile.vemitreya"

# 5) Опционально — активировать secure-mode сразу
SECURE_MODE=0
if [[ " $@ " =~ " --secure-mode " ]]; then
    SECURE_MODE=1
fi

if [ $SECURE_MODE -eq 1 ]; then
    info "Активация secure-mode: User=vemitreya + Caddy TLS"
    chown -R vemitreya:vemitreya /opt/vemitreya 2>/dev/null || true
    chmod 640 /opt/vemitreya/.env 2>/dev/null || true

    # Доступ vemitreya group к /etc/amnezia/amneziawg/ (read+list)
    if [ -d /etc/amnezia/amneziawg ]; then
        chgrp vemitreya /etc/amnezia/amneziawg
        chmod 750 /etc/amnezia/amneziawg
        chgrp -R vemitreya /etc/amnezia/amneziawg/ 2>/dev/null || true
        find /etc/amnezia/amneziawg -type f -name "*.conf" -exec chmod 640 {} \; 2>/dev/null
        info "AWG_DIR: vemitreya group доступ (chmod 750/640)"
    fi

    # /opt/trusttunnel_client/configs — для чтения/записи TT toml
    if [ -d /opt/trusttunnel_client/configs ]; then
        chgrp vemitreya /opt/trusttunnel_client/configs
        chmod 770 /opt/trusttunnel_client/configs
        find /opt/trusttunnel_client/configs -type f -exec chgrp vemitreya {} \; 2>/dev/null
        find /opt/trusttunnel_client/configs -type f -exec chmod 660 {} \; 2>/dev/null
        info "TT configs: vemitreya group доступ (chmod 770/660)"
    fi

    # /opt/mihomo/config — backend пишет config.yaml при импорте подписок и правил
    if [ -d /opt/mihomo/config ]; then
        chgrp -R vemitreya /opt/mihomo/config
        chmod 770 /opt/mihomo/config
        find /opt/mihomo/config -type f -exec chmod 660 {} \; 2>/dev/null
        find /opt/mihomo/config -type d -exec chmod 770 {} \; 2>/dev/null
        info "Mihomo config: vemitreya group доступ (chmod 770/660)"
    fi

    # /opt/mihomo/geo — read-only (vemitreya только читает базы)
    if [ -d /opt/mihomo/geo ]; then
        chgrp vemitreya /opt/mihomo/geo
        chmod 750 /opt/mihomo/geo
        find /opt/mihomo/geo -type f -exec chgrp vemitreya {} \; 2>/dev/null
        find /opt/mihomo/geo -type f -exec chmod 640 {} \; 2>/dev/null
        info "Mihomo geo: vemitreya group read-only (chmod 750/640)"
    fi

    if [ -f /etc/systemd/system/vemitreya.service ]; then
        sed -i 's|^User=root|User=vemitreya|' /etc/systemd/system/vemitreya.service
        systemctl daemon-reload
        ok "vemitreya.service → User=vemitreya"
    fi
    if command -v caddy >/dev/null 2>&1; then
        cp /etc/caddy/Caddyfile.vemitreya /etc/caddy/Caddyfile
        systemctl enable --now caddy >/dev/null 2>&1
        ok "Caddy включён — TLS на :8889 (self-signed)"
    fi
else
    info "Hardening установлен но не активирован."
    info "Активация: sudo ./install.sh --secure-mode  (опция 3 — обновление)"
fi


# =====================================================
# 7. API_TOKEN: гарантируем что он есть и читается
# =====================================================
if [ -d /opt/vemitreya ]; then
    if [ ! -f /opt/vemitreya/.env ]; then
        warn ".env не существует — создаю с новым токеном"
        TOKEN=$(openssl rand -hex 32)
        cat > /opt/vemitreya/.env << EOFENV
API_TOKEN=$TOKEN
MIHOMO_CONFIG=/opt/mihomo/config/config.yaml
MIHOMO_API=http://127.0.0.1:9090
MIHOMO_SECRET=
MIHOMO_BINARY=/usr/local/bin/mihomo
AWG_DIR=/etc/amnezia/amneziawg
TRUSTTUNNEL_DIR=/opt/trusttunnel_client/configs
TRUSTTUNNEL_BIN=/opt/trusttunnel_client/trusttunnel_client
DB_PATH=/opt/vemitreya/data/panel.db
FRONTEND_DIR=/opt/vemitreya/frontend
PANEL_INSTALL_DIR=/opt/vemitreya
EOFENV
        chmod 600 /opt/vemitreya/.env
        systemctl restart vemitreya 2>/dev/null || true
        ok "Создан .env и сгенерирован новый API_TOKEN"
    elif ! grep -q "^API_TOKEN=" /opt/vemitreya/.env; then
        TOKEN=$(openssl rand -hex 32)
        echo "API_TOKEN=$TOKEN" >> /opt/vemitreya/.env
        systemctl restart vemitreya 2>/dev/null || true
        ok "В .env добавлен API_TOKEN (его не было)"
    fi
fi

# =====================================================
# 7. Transparent HTTP/HTTPS redirect → Mihomo redir-port (v2.206)
# =====================================================
# Перенаправляет TCP 80/443 в Mihomo :7892. Используется когда роутер
# делает policy-routing/mark-routing к этому серверу как к gateway,
# а трафик приходит с оригинальным destination (не DST-NATед на роутере).
#
# Только TCP, только 80/443. Для других портов или UDP — TPROXY/TUN (см. docs/).
step 7 "Transparent proxy (nftables redirect → Mihomo)"

# Установим nftables если нет
if ! command -v nft >/dev/null 2>&1; then
    info "Установка nftables..."
    apt-get install -y -qq nftables >/dev/null 2>&1 || warn "Не удалось установить nftables"
fi

if command -v nft >/dev/null 2>&1; then
    mkdir -p /etc/nftables.d
    cat > /etc/nftables.d/mihomo-redirect.nft << 'NFT_EOF'
# Vemitreya: transparent HTTP/HTTPS redirect → Mihomo
# Создано install.sh. Не редактируй вручную — будет перезаписано.
#
# Как работает:
#   1. Роутер маршрутизирует трафик клиентов LAN на этот сервер как gateway
#      (mark-routing + route table → gateway=<этот-сервер>)
#   2. Пакет приходит с оригинальным destination (например 149.154.167.50:443)
#   3. prerouting nat REDIRECT подменяет dst → 127.0.0.1:7892 (Mihomo redir-port)
#   4. Mihomo через SO_ORIGINAL_DST читает оригинальный destination из conntrack
#   5. Применяет правила и шлёт через выбранный канал
#   6. postrouting MASQUERADE подменяет src на IP сервера для исходящего

table ip mihomo_redirect {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;
        # Перехватываем только публичный HTTP/HTTPS трафик
        tcp dport 80  redirect to :7892
        tcp dport 443 redirect to :7892
    }

    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        # Маскарад для всего исходящего кроме loopback
        oifname != "lo" masquerade
    }
}
NFT_EOF

    # Подключаем наш файл в основной конфиг (один раз)
    if [ -f /etc/nftables.conf ]; then
        if ! grep -q "/etc/nftables.d" /etc/nftables.conf; then
            echo '' >> /etc/nftables.conf
            echo '# Подключение модульных правил Vemitreya' >> /etc/nftables.conf
            echo 'include "/etc/nftables.d/*.nft"' >> /etc/nftables.conf
            info "Добавлен include в /etc/nftables.conf"
        fi
    else
        cat > /etc/nftables.conf << 'EOF'
#!/usr/sbin/nft -f
flush ruleset
include "/etc/nftables.d/*.nft"
EOF
        info "Создан /etc/nftables.conf"
    fi

    # Применяем сразу
    if nft -f /etc/nftables.d/mihomo-redirect.nft 2>/dev/null; then
        ok "nftables redirect 80/443 → :7892 + masquerade установлен"
    else
        # Возможно таблица уже есть со старой версией — удалить и повторить
        nft delete table ip mihomo_redirect 2>/dev/null || true
        if nft -f /etc/nftables.d/mihomo-redirect.nft 2>/dev/null; then
            ok "nftables redirect обновлён"
        else
            warn "Не удалось применить nftables redirect — проверьте /etc/nftables.d/mihomo-redirect.nft"
        fi
    fi

    # Включить nftables на загрузке
    systemctl enable nftables >/dev/null 2>&1 || true

    # Очистка устаревшего mihomo_tproxy (если был от ручных экспериментов)
    if nft list table inet mihomo_tproxy >/dev/null 2>&1; then
        nft delete table inet mihomo_tproxy 2>/dev/null && \
            info "Удалена устаревшая таблица inet mihomo_tproxy"
    fi
    if [ -f /etc/nftables.d/mihomo-tproxy.nft ]; then
        rm -f /etc/nftables.d/mihomo-tproxy.nft
        info "Удалён устаревший /etc/nftables.d/mihomo-tproxy.nft"
    fi
    if systemctl list-unit-files | grep -q mihomo-tproxy-route.service; then
        systemctl disable --now mihomo-tproxy-route 2>/dev/null || true
        rm -f /etc/systemd/system/mihomo-tproxy-route.service
        systemctl daemon-reload
        info "Удалён устаревший mihomo-tproxy-route.service"
    fi
else
    warn "nftables недоступен — пропускаю transparent proxy setup"
fi

# =====================================================
# 7b. CLI-хелперы для админа (v2.206)
# =====================================================
# vemitreya-token — быстро посмотреть/сменить API_TOKEN
cat > /usr/local/bin/vemitreya-token << 'TOKEN_HELPER'
#!/bin/bash
# vemitreya-token — посмотреть или сменить API_TOKEN

ENV_FILE="/opt/vemitreya/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found" >&2
    exit 1
fi

case "${1:-show}" in
    show|"")
        if [ "$EUID" -ne 0 ]; then
            echo "Запусти под sudo: sudo vemitreya-token" >&2
            exit 1
        fi
        token=$(grep '^API_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
        if [ -z "$token" ]; then
            echo "API_TOKEN не найден в $ENV_FILE" >&2
            exit 1
        fi
        echo "$token"
        ;;
    rotate|new)
        if [ "$EUID" -ne 0 ]; then
            echo "Запусти под sudo: sudo vemitreya-token rotate" >&2
            exit 1
        fi
        new=$(openssl rand -hex 32)
        sed -i "s|^API_TOKEN=.*|API_TOKEN=$new|" "$ENV_FILE"
        systemctl restart vemitreya
        echo "Новый API_TOKEN: $new"
        echo "Сохрани его — все активные сессии разлогинились."
        ;;
    mihomo|secret)
        if [ "$EUID" -ne 0 ]; then
            echo "Запусти под sudo: sudo vemitreya-token mihomo" >&2
            exit 1
        fi
        s=$(grep '^MIHOMO_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
        echo "$s"
        ;;
    help|-h|--help)
        cat <<HELP
vemitreya-token — посмотреть или управлять токенами Vemitreya

  vemitreya-token [show]      Показать текущий API_TOKEN
  vemitreya-token rotate      Сгенерировать новый API_TOKEN (разлогинивает всех)
  vemitreya-token mihomo      Показать MIHOMO_SECRET (для прямого доступа к Mihomo API на :9090)
  vemitreya-token help        Эта справка

Все команды требуют sudo.
HELP
        ;;
    *)
        echo "Неизвестная команда: $1" >&2
        echo "Используй: sudo vemitreya-token help" >&2
        exit 1
        ;;
esac
TOKEN_HELPER
chmod +x /usr/local/bin/vemitreya-token
ok "CLI: vemitreya-token установлен (sudo vemitreya-token show)"

# =====================================================
# 8. Smoke-тесты (v2.206)
# =====================================================
step 8 "Smoke-тесты"

SMOKE_FAIL=0
SMOKE_REPORT=""
smoke_check() {
    local name="$1" cmd="$2"
    if eval "$cmd" >/dev/null 2>&1; then
        ok "  $name"
        SMOKE_REPORT="${SMOKE_REPORT}    ✓ $name\n"
    else
        err "  $name"
        SMOKE_REPORT="${SMOKE_REPORT}    ✗ $name\n"
        SMOKE_FAIL=$((SMOKE_FAIL+1))
    fi
}

# 1) Mihomo конфиг валиден
if [ -f /opt/mihomo/config/config.yaml ] && command -v /usr/local/bin/mihomo >/dev/null 2>&1; then
    smoke_check "Mihomo: конфиг валиден" \
        "/usr/local/bin/mihomo -t -d /opt/mihomo -f /opt/mihomo/config/config.yaml"
fi

# 2) Mihomo systemd активен
if systemctl is-enabled mihomo >/dev/null 2>&1; then
    smoke_check "Mihomo: сервис активен" "systemctl is-active --quiet mihomo"
fi

# 3) Mihomo API отвечает (с secret из .env)
MIHOMO_API_SECRET=$(grep '^MIHOMO_SECRET=' /opt/vemitreya/.env 2>/dev/null | cut -d= -f2-)
if [ -n "$MIHOMO_API_SECRET" ]; then
    smoke_check "Mihomo: API отвечает (с secret)" \
        "curl -sS -m 3 -H 'Authorization: Bearer ${MIHOMO_API_SECRET}' http://127.0.0.1:9090/version | grep -q version"
else
    smoke_check "Mihomo: API отвечает" \
        "curl -sS -m 3 http://127.0.0.1:9090/version | grep -q version"
fi

# 4) Vemitreya сервис
if [ -f /etc/systemd/system/vemitreya.service ]; then
    smoke_check "Vemitreya: сервис активен" "systemctl is-active --quiet vemitreya"
    smoke_check "Vemitreya: HTTP отвечает" \
        "curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8888/api/health | grep -E '^(200|503)$'"
    smoke_check "Vemitreya: /api/health.checks.mihomo = active" \
        "curl -sS -m 5 http://127.0.0.1:8888/api/health | grep -q '\"mihomo\":\"active\"'"
fi

# 5) AWG если установлен
if command -v awg >/dev/null 2>&1; then
    ok "  AWG установлен ($(awg --version 2>&1 | head -1))"
    SMOKE_REPORT="${SMOKE_REPORT}    ✓ AWG установлен\n"
fi

# 6) TT если установлен
if [ -f /opt/trusttunnel_client/trusttunnel_client ]; then
    ok "  TrustTunnel установлен"
    SMOKE_REPORT="${SMOKE_REPORT}    ✓ TrustTunnel установлен\n"
fi

# 7) Sysctl
smoke_check "Sysctl: ip_forward = 1" "[ \$(cat /proc/sys/net/ipv4/ip_forward) = '1' ]"

# Mihomo конфиг проходит валидацию (для будущих edit через UI)
if [ -x /usr/local/bin/mihomo ] && [ -f /opt/mihomo/config/config.yaml ]; then
    smoke_check "Mihomo: mihomo -t проходит на текущем конфиге" \
        "/usr/local/bin/mihomo -t -d /opt/mihomo -f /opt/mihomo/config/config.yaml"
fi

# Transparent proxy
if command -v nft >/dev/null 2>&1; then
    smoke_check "nftables: redirect 80/443 → :7892 активен" \
        "nft list table ip mihomo_redirect 2>/dev/null | grep -q 'redirect to :7892'"
    smoke_check "nftables: masquerade активен" \
        "nft list table ip mihomo_redirect 2>/dev/null | grep -q masquerade"
fi

# 8) Hardening: user vemitreya
smoke_check "Hardening: user vemitreya существует" "id vemitreya"
smoke_check "Hardening: sudoers валиден" "visudo -c -f /etc/sudoers.d/vemitreya"

if [ $SMOKE_FAIL -gt 0 ]; then
    echo ""
    err "ВНИМАНИЕ: $SMOKE_FAIL smoke-тестов провалилось"
    err "Это означает что установка прошла, но что-то не работает."
    err "Проверьте логи: journalctl -u vemitreya -u mihomo --no-pager -n 30"
fi

set +e  # фикс: финальный блок с токеном должен выполниться ВСЕГДА

# =====================================================
# Готово
# =====================================================
IP=$(hostname -I | awk '{print $1}')
TOKEN_VAL=$(grep '^API_TOKEN=' /opt/vemitreya/.env 2>/dev/null | cut -d= -f2)

echo ""
echo -e "${G}${BOLD}╔══════════════════════════════════════════════╗${N}"
echo -e "${G}${BOLD}║         ✓ УСТАНОВКА ЗАВЕРШЕНА                ║${N}"
echo -e "${G}${BOLD}╚══════════════════════════════════════════════╝${N}"
echo ""
echo -e "  ${BOLD}Веб-интерфейс:${N} ${B}http://${IP}:8888/${N}"
echo ""
if [ -n "$TOKEN_VAL" ]; then
    echo -e "${Y}${BOLD}╔══════════════════════════════════════════════════════════════════╗${N}"
    echo -e "${Y}${BOLD}║                       API ТОКЕН                                  ║${N}"
    echo -e "${Y}${BOLD}╠══════════════════════════════════════════════════════════════════╣${N}"
    echo -e "${Y}${BOLD}║${N}  ${TOKEN_VAL}  ${Y}${BOLD}║${N}"
    echo -e "${Y}${BOLD}╚══════════════════════════════════════════════════════════════════╝${N}"
    echo ""
    echo -e "  ${DIM}Сохраните его в надёжном месте! Получить позже:${N}"
    echo -e "  ${DIM}sudo vemitreya-token              # короткая команда${N}"
    echo -e "  ${DIM}sudo grep API_TOKEN /opt/vemitreya/.env   # альтернатива${N}"
    echo -e "  ${DIM}sudo vemitreya-token rotate       # сгенерировать новый${N}"
else
    echo -e "  ${R}⚠ API токен не найден в /opt/vemitreya/.env${N}"
    echo -e "  ${DIM}Создайте вручную:${N}"
    echo -e "  ${DIM}echo \"API_TOKEN=\$(openssl rand -hex 32)\" | sudo tee -a /opt/vemitreya/.env${N}"
fi
echo ""
echo -e "  ${BOLD}Применённые системные настройки:${N}"
[ -f /etc/sysctl.d/99-vemitreya.conf ] && echo -e "    ${G}✓${N} ip_forward = 1 (персистентно)"
if grep -qE '^Table\s*=\s*off' /etc/amnezia/amneziawg/awg0.conf 2>/dev/null; then
    echo -e "    ${G}✓${N} AWG: Table=off + fwmark policy + MTU 1200"
fi
if [ -f /opt/mihomo/config/config.yaml ]; then
    LEG=0
    for key in port socks-port mixed-port redir-port tproxy-port; do
        grep -qE "^${key}\s*:" /opt/mihomo/config/config.yaml 2>/dev/null && LEG=$((LEG+1))
    done
    [ "$LEG" -ge 4 ] && echo -e "    ${G}✓${N} Mihomo: top-level порты ($LEG/5)"
fi
if [ -f /opt/vemitreya/frontend/logo.png ]; then
    LOGO_MD5=$(md5sum /opt/vemitreya/frontend/logo.png 2>/dev/null | cut -c1-8)
    echo -e "    ${G}✓${N} Логотип Vemitreya (md5: $LOGO_MD5)"
fi
echo ""
echo -e "  ${BOLD}Управление:${N}"
echo "    sudo systemctl status vemitreya     - статус панели"
echo "    sudo systemctl restart vemitreya    - перезапуск"
echo "    sudo journalctl -u vemitreya -f     - логи"
echo ""
[ $INSTALL_MIHOMO -eq 1 ] && echo "    sudo systemctl status mihomo        - статус mihomo"
echo ""
echo -e "  ${BOLD}Дальнейшие шаги (через веб-интерфейс):${N}"
echo -e "    ${B}→${N} Откройте Vemitreya: ${B}http://${IP}:8888/${N}"
echo -e "    ${B}→${N} Войдите по API-токену (см. выше)"
echo -e "    ${B}→${N} Вкладка ${BOLD}«AWG»${N}        — установить и настроить AmneziaWG"
echo -e "    ${B}→${N} Вкладка ${BOLD}«TrustTunnel»${N} — установить и настроить TrustTunnel"
echo -e "    ${B}→${N} Нажмите ${BOLD}Ctrl+Shift+R${N} в браузере для сброса кэша логотипа"
echo ""
echo -e "  ${BOLD}Обновление:${N}"
echo "    Через CLI:    sudo ./install.sh  (пункт 4)"
echo "    Через UI:     Vemitreya → Обновления → Загрузить .zip"
echo ""
