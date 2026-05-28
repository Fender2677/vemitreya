# API_TOKEN и REST API

## Как посмотреть API_TOKEN

API_TOKEN — это секретный ключ для доступа к Vemitreya UI и REST API.
Хранится в `/opt/vemitreya/.env` на сервере.

### Способ 1 — через SSH прямо

```bash
sudo grep '^API_TOKEN=' /opt/vemitreya/.env
```

Получишь строку вида `API_TOKEN=abc123def456...`.

Чтобы получить **только значение** без префикса:

```bash
sudo grep '^API_TOKEN=' /opt/vemitreya/.env | cut -d= -f2-
```

### Способ 2 — через локальный терминал (одной командой)

```bash
ssh user@<server-ip> "sudo grep '^API_TOKEN=' /opt/vemitreya/.env | cut -d= -f2-"
```

### Способ 3 — посмотреть весь `.env`

```bash
sudo cat /opt/vemitreya/.env
```

Там будут все переменные:
```ini
API_TOKEN=<ваш_токен_для_UI>
MIHOMO_SECRET=<секрет_для_внутреннего_API_Mihomo>
MIHOMO_API=http://127.0.0.1:9090
# ... возможно другие переменные
```

### Способ 4 — через journalctl (если запоминал при установке)

В выводе `install.sh` API_TOKEN печатается в жёлтой рамке в самом конце.
Можно найти его в логах:

```bash
sudo journalctl --since "1 day ago" | grep -A 2 "API_TOKEN" | head -20
```

(работает только если install.sh запускался под root и его вывод попал в systemd journal —
это нестандартный случай).

## Где использовать токен

### В UI (claude.ai/Vemitreya web интерфейсе)

При первом открытии `http://<server-ip>:8888/` будет запрошен API token —
введи его в поле. Он сохраняется в localStorage браузера, на следующих заходах не спрашивается.

Если **разлогинился** или сменил браузер — снова потребуется ввести.

### В curl / API запросах

```bash
TOKEN=$(sudo grep '^API_TOKEN=' /opt/vemitreya/.env | cut -d= -f2-)

# Health (без авторизации, для smoke-тестов)
curl http://localhost:8888/api/health

# С авторизацией — любой другой endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:8888/api/mihomo/proxy-groups

curl -H "Authorization: Bearer $TOKEN" http://localhost:8888/api/awg/tunnels

# POST с JSON
curl -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"test","rule":"DOMAIN-SUFFIX,example.com,DIRECT"}' \
    http://localhost:8888/api/mihomo/rules
```

### В скриптах / интеграциях

```python
import os
import requests

# Чтение токена из .env (требует root)
def get_token():
    with open("/opt/vemitreya/.env") as f:
        for line in f:
            if line.startswith("API_TOKEN="):
                return line.strip().split("=", 1)[1]

token = get_token()
headers = {"Authorization": f"Bearer {token}"}

# Например — статус всех AWG туннелей
r = requests.get("http://localhost:8888/api/awg/tunnels", headers=headers)
print(r.json())
```

## Сменить API_TOKEN

Если токен утёк или просто хочешь сгенерировать новый:

```bash
# Сгенерировать новый и записать
NEW_TOKEN=$(openssl rand -hex 32)
sudo sed -i "s|^API_TOKEN=.*|API_TOKEN=$NEW_TOKEN|" /opt/vemitreya/.env
sudo systemctl restart vemitreya
echo "Новый токен: $NEW_TOKEN"
```

После смены **все** активные сессии разлогинятся. Логнись с новым токеном в браузере
(потребуется ввести в UI).

## Что делать если потерял API_TOKEN

Не страшно — просто посмотри `/opt/vemitreya/.env` (см. выше), или сгенерируй новый.

Vemitreya не хранит токен в захэшированном виде — это plain text в .env.
Файл `.env` должен иметь права `600` (только владелец читает):

```bash
sudo chmod 600 /opt/vemitreya/.env
sudo chown root:root /opt/vemitreya/.env       # обычный режим
# или
sudo chown root:vemitreya /opt/vemitreya/.env  # --secure-mode
```

## MIHOMO_SECRET — отдельный токен

Не путай `API_TOKEN` (для Vemitreya UI/API) и `MIHOMO_SECRET` (для Mihomo собственного API):

| Токен | Где используется | Куда |
|-------|------------------|------|
| `API_TOKEN` | Vemitreya UI на `:8888` | `Authorization: Bearer <API_TOKEN>` |
| `MIHOMO_SECRET` | Mihomo API на `:9090` (внутренний) | `Authorization: Bearer <MIHOMO_SECRET>` |

Backend Vemitreya использует **оба**:
- API_TOKEN для аутентификации **тебя** (когда ты делаешь запросы к Vemitreya)
- MIHOMO_SECRET для **своих** запросов к Mihomo (для управления)

Тебе обычно нужен только `API_TOKEN`. `MIHOMO_SECRET` нужен только если хочешь работать с Mihomo напрямую через `:9090`:

```bash
MIHOMO_SECRET=$(sudo grep '^MIHOMO_SECRET=' /opt/vemitreya/.env | cut -d= -f2-)
curl -H "Authorization: Bearer $MIHOMO_SECRET" http://127.0.0.1:9090/version
```

## Полный список API endpoints

См. `ARCHITECTURE.md` → секция "API Endpoints" для актуального списка.
Краткий обзор:

- `GET /api/health` — без авторизации, для smoke-тестов
- `GET/POST/PUT/DELETE /api/mihomo/...` — управление Mihomo (группы, правила, прокси)
- `GET/POST/PUT/DELETE /api/awg/tunnels/...` — управление AWG туннелями
- `GET/POST/PUT/DELETE /api/trusttunnel/...` — управление TrustTunnel каналами
- `GET /api/alerts/dashboard` — данные для dashboard карточек
- `GET/PUT /api/telegram/settings` — настройки Telegram
- `POST /api/telegram/test` — тест Telegram уведомлений
- `WS /ws/logs/{service}` — WebSocket стрим логов
- `GET/PUT /api/config/mihomo` — Mihomo YAML editor
- `GET /api/config/export` / `POST /api/config/import/...` — backup/restore конфигов

Все требуют `Authorization: Bearer <API_TOKEN>` кроме `/api/health`.
