# Архитектура Vemitreya

## Назначение

Vemitreya — панель управления для прокси-инфраструктуры на базе **Mihomo** (mihomo aka Clash Meta)
с поддержкой **AmneziaWG** (обфусцированный WireGuard) и **TrustTunnel** (SOCKS5 туннели).

Управляет роутингом трафика, подписками, прокси-группами, правилами и предоставляет веб-интерфейс.

## Слои

```
┌──────────────────────────────────────────────────────────────────┐
│  Клиенты в LAN (192.168.100.0/24)                                │
│  Браузеры, приложения, IoT                                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Роутер (Mikrotik / Keenetic)                                     │
│  - DST-NAT для blocked_sites → 192.168.100.218:7892               │
│  - DHCP, DNS, firewall, VLAN                                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ TCP (трафик в blocked_sites)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Сервер Vemitreya — 192.168.100.218 (Ubuntu 24.04)               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Mihomo (proxy core) — :7890 :7891 :7892 :7893 :7894     │    │
│  │  - HTTP/SOCKS proxy на :7890/:7891 (явное подключение)   │    │
│  │  - REDIR (:7892) — для DST-NAT с роутера                 │    │
│  │  - TPROXY (:7893) — для policy routing с роутера         │    │
│  │  - API :9090 (localhost only, secret в .env)             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Vemitreya panel — FastAPI :8888 (HTTP) + :8889 (HTTPS) │    │
│  │  - REST API: /api/mihomo/*, /api/awg/*, /api/trusttunnel/* │  │
│  │  - WebSocket /ws/logs/{service}                          │    │
│  │  - SQLite panel.db (install_jobs, traffic_history, ...)  │    │
│  │  - React SPA: /opt/vemitreya/frontend/app.jsx           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  AmneziaWG — awg0 (обфусцированный WG туннель)          │    │
│  │  - Table = off + fwmark 0xca6c → table 51820            │    │
│  │  - MTU 1200 (для Telegram через TCP)                    │    │
│  │  - Endpoint: 91.186.211.236:44357 (FirstByte FI)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  TrustTunnel — systemd units                             │    │
│  │  - trusttunnel-Netherlands.service (SOCKS5 :10005)      │    │
│  │  - trusttunnel-Poland.service (SOCKS5 :10006)           │    │
│  │  - Логи в journalctl -u trusttunnel-<name>              │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Поток трафика

### Сценарий 1: Прозрачное проксирование (DST-NAT)

```
Клиент 192.168.100.5 → google.com:443
  ↓
Mikrotik видит google.com IP в blocked_sites → DST-NAT
  ↓
Пакет переписан: dst = 192.168.100.218:7892
  ↓
Сервер 192.168.100.218 принимает на Mihomo redir-port
  ↓
Mihomo читает оригинальный destination через conntrack (google.com:443)
  ↓
Применяет правила:
  - DOMAIN-SUFFIX,google.com → группа "Основной трафик"
  - Группа Основной трафик → канал EOF_HY2 (или AWG / TT)
  ↓
Трафик уходит через выбранный канал в интернет
```

### Сценарий 2: Явное проксирование (HTTP/SOCKS)

```
Приложение настроено на proxy 192.168.100.218:7890
  ↓
Mihomo принимает HTTP CONNECT / SOCKS5 → читает destination
  ↓
Применяет правила, отправляет через канал
```

## Компоненты на сервере

### Файловая структура

```
/opt/
├── mihomo/
│   ├── config/config.yaml              # главный конфиг Mihomo
│   ├── geo/                            # GeoIP/GeoSite базы (.dat, .mmdb)
│   ├── ui/                             # External UI (YACD/Razord)
│   └── providers/                      # auto-downloaded subscriptions
├── vemitreya/
│   ├── backend/main.py                 # FastAPI приложение (~5000 строк)
│   ├── frontend/app.jsx                # React SPA (~5600 строк)
│   ├── frontend/vendor/                # React/Babel/recharts CDN-сборки
│   ├── data/panel.db                   # SQLite (traffic, install_jobs, settings)
│   ├── backups/                        # автоматические бэкапы при update
│   ├── venv/                           # Python virtualenv
│   └── .env                            # API_TOKEN, MIHOMO_SECRET, paths
└── trusttunnel_client/
    ├── trusttunnel_client              # binary
    └── configs/                        # *_socks.toml каналы
/etc/
├── amnezia/amneziawg/
│   ├── awg0.conf                       # главный AWG туннель
│   └── *.conf                          # дополнительные туннели (через UI)
├── systemd/system/
│   ├── mihomo.service
│   ├── vemitreya.service
│   ├── caddy.service                   # TLS reverse-proxy (опционально)
│   └── trusttunnel-*.service           # один на каждый TT канал
├── sudoers.d/vemitreya                 # узкие права для vemitreya user
├── sysctl.d/99-vemitreya.conf          # ip_forward, src_valid_mark
└── caddy/Caddyfile                     # TLS-фронт перед :8888
```

### Сетевые порты

| Порт  | Сервис      | Слушает на              | Назначение                              |
|-------|-------------|-------------------------|------------------------------------------|
| 7890  | Mihomo HTTP | 0.0.0.0                 | HTTP proxy для приложений               |
| 7891  | Mihomo SOCKS| 0.0.0.0                 | SOCKS5 proxy для приложений             |
| 7892  | Mihomo REDIR| 0.0.0.0                 | DST-NAT от роутера                      |
| 7893  | Mihomo TPROXY| 0.0.0.0                | TPROXY от роутера (UDP+TCP)             |
| 7894  | Mihomo MIXED| 0.0.0.0                 | HTTP+SOCKS на одном порту               |
| 8888  | Vemitreya HTTP| 0.0.0.0               | Web UI и REST API (без TLS)             |
| 8889  | Caddy HTTPS | 0.0.0.0                 | TLS reverse-proxy перед :8888 (опц.)    |
| 9090  | Mihomo API  | 127.0.0.1               | Управление Mihomo (только localhost)    |
| 10005+| TT каналы   | 127.0.0.1               | SOCKS5 локальные туннели                |

### systemd units

```
mihomo.service                  → /usr/local/bin/mihomo
vemitreya.service               → /opt/vemitreya/venv/bin/python /opt/vemitreya/backend/main.py
awg-quick@awg0.service          → ifup AWG туннеля
caddy.service                   → TLS reverse-proxy (опционально, --secure-mode)
trusttunnel-<Name>.service      → один на каждый TT канал, по одному `trusttunnel_client -c ...toml`
```

## Безопасность

### Без `--secure-mode` (по умолчанию)
- Vemitreya backend под `User=root`
- API через HTTP на :8888 (без TLS)
- API_TOKEN в `.env` — Bearer аутентификация
- Mihomo external-controller на 127.0.0.1 + secret

### С `--secure-mode`
- Vemitreya backend под `User=vemitreya` (system user, no-home, nologin)
- `/etc/sudoers.d/vemitreya` — узкий whitelist:
  - systemctl restart/start/stop для mihomo, awg-quick@*, trusttunnel-*
  - awg, awg-quick (для управления туннелями)
  - apt-get install (для установки AWG/TT через UI)
  - journalctl (для чтения логов в UI)
  - cp /tmp/awg-*.conf → /etc/amnezia/amneziawg/ (через временный файл)
- Caddy на :8889 c self-signed TLS
- Группа доступа `vemitreya` к `/etc/amnezia/amneziawg/` (chmod 750/640) и `/opt/mihomo/config/` (770/660)

## API Endpoints (краткий обзор)

### Аутентификация
Все эндпоинты кроме `/api/health` требуют `Authorization: Bearer <API_TOKEN>`.

### Группы (Mihomo)
```
GET    /api/mihomo/proxy-groups
GET    /api/mihomo/proxy-groups/available-proxies
POST   /api/mihomo/proxy-groups                       # создать
PUT    /api/mihomo/proxy-groups/{name:path}           # обновить
DELETE /api/mihomo/proxy-groups/{name:path}           # удалить
```

### Правила (Mihomo) — все идут через `_save_and_validate_mihomo`
```
GET    /api/mihomo/rules
GET    /api/mihomo/rules/targets
POST   /api/mihomo/rules                              # добавить одно
PUT    /api/mihomo/rules/{index}                      # изменить
DELETE /api/mihomo/rules/{index}                      # удалить
PUT    /api/mihomo/rules                              # импорт всех (replace)
```

### AWG туннели
```
GET    /api/awg/tunnels
GET    /api/awg/tunnels/{name}
POST   /api/awg/tunnels                               # создать
PUT    /api/awg/tunnels/{name}                        # обновить
DELETE /api/awg/tunnels/{name}                        # удалить
GET    /api/awg/install/status
POST   /api/awg/install                               # установка через UI
```

### TrustTunnel
```
GET    /api/trusttunnel/list
GET    /api/trusttunnel/{name}
POST   /api/trusttunnel                               # создать канал
PUT    /api/trusttunnel/{name}
DELETE /api/trusttunnel/{name}
GET    /api/trusttunnel/install/status
POST   /api/trusttunnel/install
```

### Установка / системные
```
GET    /api/install/jobs/{jid}                        # статус задачи + логи
GET    /api/install/jobs                              # история задач
GET    /api/system/apt-proxy/status
POST   /api/system/apt-proxy/{enable|disable}         # apt через Mihomo proxy
GET    /api/health                                    # без auth, для smoke-тестов
```

### WebSocket
```
WS     /ws/logs/{service}                             # стрим journalctl -u <service> -f
```

## Зависимости

### OS
- Ubuntu 22.04 LTS или 24.04 LTS
- systemd
- python3 (≥3.10), python3-venv, python3-ruamel.yaml
- iptables, nftables, iproute2

### Python (в venv)
- fastapi
- uvicorn
- aiohttp
- ruamel.yaml
- psutil
- pydantic

См. `backend/requirements.txt`.

### Внешние
- mihomo (CLI binary, скачивается с GitHub MetaCubeX/mihomo)
- amneziawg, amneziawg-dkms (через PPA amnezia/ppa)
- trusttunnel_client (через официальный installer)
- caddy (опционально для TLS)
