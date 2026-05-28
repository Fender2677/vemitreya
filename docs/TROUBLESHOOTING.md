# TROUBLESHOOTING — частые проблемы и решения

## Симптом: забыл / потерял API_TOKEN

API_TOKEN хранится в открытом виде в `/opt/vemitreya/.env`:

```bash
sudo grep '^API_TOKEN=' /opt/vemitreya/.env | cut -d= -f2-
```

Или сменить на новый:

```bash
NEW_TOKEN=$(openssl rand -hex 32)
sudo sed -i "s|^API_TOKEN=.*|API_TOKEN=$NEW_TOKEN|" /opt/vemitreya/.env
sudo systemctl restart vemitreya
echo "Новый токен: $NEW_TOKEN"
```

Подробнее — см. [API.md](./API.md).

---

## Симптом: 502 `Cannot connect to host 127.0.0.1:9090` в UI

Backend не может достучаться до Mihomo API.

### Причины (по убыванию частоты)

**1. Mihomo упал** из-за невалидного конфига (например, импорт правил со ссылками на несуществующие группы)

```bash
sudo systemctl status mihomo --no-pager | head -10
sudo journalctl -u mihomo -n 30 --no-pager | tail -20
```

Если упал — откатить из бэкапа:
```bash
sudo ls -t /opt/mihomo/config/config.yaml.bak.* | head -5
sudo cp /opt/mihomo/config/config.yaml.bak.<TIMESTAMP> /opt/mihomo/config/config.yaml
sudo systemctl restart mihomo
```

**2. Рассинхрон secret** между `.env` Vemitreya и `config.yaml` Mihomo

```bash
SECRET=$(sudo grep '^MIHOMO_SECRET=' /opt/vemitreya/.env | cut -d= -f2-)
sudo grep "^secret:" /opt/mihomo/config/config.yaml
# Должны совпадать
```

Если не совпадают:
```bash
sudo cp /opt/mihomo/config/config.yaml /opt/mihomo/config/config.yaml.bak.$(date +%s)
sudo sed -i "s|^external-controller:.*|external-controller: 127.0.0.1:9090|" /opt/mihomo/config/config.yaml
sudo sed -i "s|^secret:.*|secret: '$SECRET'|" /opt/mihomo/config/config.yaml
sudo systemctl restart mihomo
sudo systemctl restart vemitreya
```

**3. external-controller на 0.0.0.0 вместо 127.0.0.1** + Vemitreya под secure-mode

В secure-mode backend идёт по `127.0.0.1:9090`. Если Mihomo слушает только LAN адрес — не достучится.

```bash
sudo grep external-controller /opt/mihomo/config/config.yaml
# Должно быть: external-controller: 127.0.0.1:9090
```

Если не так — поправить как выше.

---

## Симптом: 405 `Method Not Allowed` при удалении группы / провайдера со слэшами

Например, имя `EOF_VLESS/SS/TROJAN` со слэшами ломает FastAPI роутинг.

### Решение

Endpoints используют `{name:path}` — имена групп со спецсимволами обрабатываются корректно.

```bash
unzip -o vemitreya-2.206.zip
cd vemitreya
sudo ./install.sh   # пункт 3
```

---

## Симптом: `500 PermissionError: '/opt/mihomo/config/config.yaml'`

Backend под `User=vemitreya` (secure-mode) не может писать в Mihomo config — каталог под root:root.

### Решение

Обычно это чинится автоматически. Если нет:

```bash
sudo chgrp -R vemitreya /opt/mihomo/config
sudo chmod 770 /opt/mihomo/config
sudo chmod 660 /opt/mihomo/config/*.yaml
sudo systemctl restart vemitreya
```

---

## Симптом: Импорт правил кладёт Mihomo

Если в конфиг попадает правило с невалидной ссылкой
(`MATCH,Telegram [7891]` когда такой группы нет), Mihomo может упасть при старте.

### Решение временное

Откатить Mihomo на последний бэкап:
```bash
sudo ls -t /opt/mihomo/config/config.yaml.bak.* | head -3
sudo cp /opt/mihomo/config/config.yaml.bak.<TIMESTAMP> /opt/mihomo/config/config.yaml
sudo systemctl restart mihomo
```

И **не импортировать невалидные правила**: убедись что все targets в rules ссылаются на:
- DIRECT / REJECT / PASS
- Существующую группу в `proxy-groups`
- Существующий proxy в `proxies`

### Решение постоянное

Backend валидирует правила перед записью: `_save_and_validate_mihomo()` проверяет
ссылки до записи и прогоняет `mihomo -t` после, откатывая невалидный конфиг.

---

## Симптом: `405` или `400` при работе с группами через UI

Открой DevTools (F12) → Network → повтори действие → найди красный запрос → пришли:
- URL запроса (полный, как `/api/mihomo/...`)
- Method (`GET`/`POST`/`PUT`/`DELETE`)
- Response body

Это нужно чтобы понять — это bug в backend (неправильный endpoint), bug в frontend
(шлёт не на тот URL/методом), или проблема с правами (под secure-mode).

---

## Симптом: AWG туннель установился, но Mihomo через него не идёт

### Проверка

```bash
# 1. AWG интерфейс активен?
sudo awg show
# Должен быть peer с handshake не старше нескольких минут

# 2. fwmark policy работает?
ip rule show | grep 0xca6c
# Должно быть: from all fwmark 0xca6c lookup 51820

# 3. Default route в таблице 51820 на awg0?
ip route show table 51820
# Должно быть: default dev awg0

# 4. Tест через mark
sudo ip route get 8.8.8.8 mark 0xca6c
# Должен пойти через awg0
```

### Если что-то из этого не так

В `/etc/amnezia/amneziawg/awg0.conf` должно быть:

```ini
[Interface]
PrivateKey = ...
Address = 10.x.x.x/32
DNS = 1.1.1.1
Table = off
MTU = 1200
PostUp = ip route add default dev awg0 table 51820 || true
PostUp = ip rule add fwmark 0xca6c lookup 51820 || true
PostDown = ip rule del fwmark 0xca6c lookup 51820 2>/dev/null || true
PostDown = ip route del default dev awg0 table 51820 2>/dev/null || true

[Peer]
...
```

Если не так — install.sh шаг 6b применяет это автоматически (если awg0.conf уже создан).
Запусти `sudo ./install.sh` → пункт 3.

В Mihomo `proxies:` должен быть proxy типа `direct` с привязкой к awg0:

```yaml
proxies:
  - name: FirstByte (AWG)
    type: direct
    interface: awg0
    routing-mark: 51820
```

И группа должна включать этот proxy.

---

## Симптом: TrustTunnel канал не запускается

### Проверка

```bash
# Статус юнита
sudo systemctl status trusttunnel-<Name>

# Логи
sudo journalctl -u trusttunnel-<Name> -n 50 --no-pager
```

### Частые причины

**Конфиг невалидный** — TOML с ошибкой синтаксиса. Открой через Vemitreya UI → проверь поля.

**Порт занят** — другой канал на том же локальном порту. Каждый TT канал должен иметь
уникальный SOCKS5 порт (10005, 10006, ...).

```bash
sudo ss -tlnp | grep 100
```

**Сервер недоступен** — endpoint TT-сервера упал или сменился IP/порт. Проверь:

```bash
sudo grep -E "address|host" /opt/trusttunnel_client/configs/<Name>_socks.toml
nc -zv <tt-server> <tt-port>
```

---

## Симптом: secure-mode сломал backend — Permission denied на чём-то

Самое быстрое — откат на User=root:

```bash
sudo sed -i 's|^User=vemitreya|User=root|' /etc/systemd/system/vemitreya.service
sudo chown -R root:root /opt/vemitreya
sudo chmod 600 /opt/vemitreya/.env
sudo systemctl daemon-reload
sudo systemctl restart vemitreya
```

После этого UI работает как раньше. Пришли логи:

```bash
sudo journalctl -u vemitreya -n 100 --no-pager > ~/secure-mode-fail.log
sudo grep -i "permission\|denied\|sudo" ~/secure-mode-fail.log
```

В логах будет видно какая команда упала — туда добавим в sudoers и снова попробуем.

---

## Симптом: Caddy active но :8889 не отвечает

```bash
sudo ss -tlnp | grep -E "caddy|:8889"
sudo journalctl -u caddy -n 30 --no-pager | tail -25
sudo cat /etc/caddy/Caddyfile
```

### Частые причины

**Caddy слушает не на 8889** — Caddyfile содержит другой порт или ничего:
```bash
sudo cat /etc/caddy/Caddyfile
# Должна быть строка ":8889 {"
```

**Не успел получить cert** (для tls internal — это локальный CA, обычно мгновенно).
Если в логах ошибки про cert — проверь права на `/var/lib/caddy/`:
```bash
sudo ls -la /var/lib/caddy/
sudo chown -R caddy:caddy /var/lib/caddy/
sudo systemctl restart caddy
```

**Конфликт с другим сервисом на 8889**:
```bash
sudo lsof -i :8889
```

---

## Симптом: Сайты из blocked_sites не открываются на клиенте LAN

### Проверка сверху вниз

**1. Mikrotik NAT правило срабатывает?**
```routeros
/ip firewall nat print stats where comment~"Blocked"
# packets и bytes должны расти
```

**2. Пакеты доходят до Vemitreya?**
```bash
# На сервере
sudo tcpdump -ni any -c 20 'dst port 7892 and tcp[tcpflags] & tcp-syn != 0'
# Зайди на сайт из blocked_sites — должны увидеть SYN
```

**3. Mihomo принимает на 7892?**
```bash
sudo ss -tlnp | grep 7892
# Должен быть LISTEN
```

**4. Правила Mihomo не банят запрос?**
```bash
# Логи Mihomo в реальном времени
sudo journalctl -u mihomo -f
# Открой сайт — должны увидеть запись с правилом
```

**5. Выбранный proxy в группе работает?**
В UI попробуй переключить группу `🌐 Основной трафик` на DIRECT — если сайт открылся,
проблема в канале (VPN сервер не работает). Если не открылся — проблема в DST-NAT/конфиге.

---

## Симптом: install.sh падает на шаге N

```bash
sudo bash -x ./install.sh 2>&1 | tee ~/install-debug.log
# Запустит с детальным трейсом
```

В логе будет видно последнюю выполненную команду. Частые причины:
- Нет доступа к интернету (для скачивания Mihomo / GeoIP)
- DNS не работает (для add-apt-repository)
- Архив развёрнут не полностью (нет backend/main.py)

---

## Полная диагностика для bug-report

Если ничего не помогло — пришли:

```bash
echo "=== Versions ===" > ~/vemitreya-debug.log
grep PANEL_VERSION /opt/vemitreya/backend/main.py >> ~/vemitreya-debug.log
mihomo -v 2>&1 | head -1 >> ~/vemitreya-debug.log

echo "=== Services ===" >> ~/vemitreya-debug.log
for s in vemitreya mihomo caddy; do
    echo "--- $s ---" >> ~/vemitreya-debug.log
    sudo systemctl status $s --no-pager 2>&1 | head -5 >> ~/vemitreya-debug.log
done

echo "=== Mihomo config ===" >> ~/vemitreya-debug.log
sudo grep -E "^(port|socks-port|redir-port|tproxy-port|mixed-port|external-controller|secret|allow-lan|bind-address):" /opt/mihomo/config/config.yaml >> ~/vemitreya-debug.log

echo "=== .env ===" >> ~/vemitreya-debug.log
sudo grep -v "^#" /opt/vemitreya/.env | sed 's|=.*|=<REDACTED>|' >> ~/vemitreya-debug.log

echo "=== Listening ports ===" >> ~/vemitreya-debug.log
sudo ss -tlnp 2>&1 | grep -E "mihomo|vemitreya|caddy|:789|:888|:9090" >> ~/vemitreya-debug.log

echo "=== Recent logs ===" >> ~/vemitreya-debug.log
sudo journalctl -u vemitreya -n 30 --no-pager 2>&1 >> ~/vemitreya-debug.log
echo "---" >> ~/vemitreya-debug.log
sudo journalctl -u mihomo -n 30 --no-pager 2>&1 >> ~/vemitreya-debug.log

echo "=== Health ===" >> ~/vemitreya-debug.log
curl -sS http://127.0.0.1:8888/api/health >> ~/vemitreya-debug.log

cat ~/vemitreya-debug.log
```

И пришли вывод. Из этого видно версию, статус всех сервисов, ключевые настройки и недавние ошибки.
