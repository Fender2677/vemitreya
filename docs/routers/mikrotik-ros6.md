# Mikrotik RouterOS 6 — настройка для Vemitreya

Тестировалось на: **RouterOS 6.49.x** (последняя стабильная 6-ветки).

Схема идентична RouterOS 7, но есть синтаксические отличия.
**Подробнее об архитектуре** — см. [mikrotik-ros7.md](./mikrotik-ros7.md).

## Архитектура

```
Клиент LAN → Mikrotik mark+route → Vemitreya сервер (nft REDIRECT) → Mihomo
```

## Отличия от RouterOS 7

| Аспект | RouterOS 7 | RouterOS 6 |
|--------|------------|------------|
| Routing table | `/routing table add fib name=...` | Создаётся автоматически через `routing-mark` в route |
| Подсветка fasttrack | Идёт после mangle | Может конфликтовать, требует accept перед fasttrack |
| Синтаксис ip route | `routing-table=to_proxy` | `routing-mark=to_proxy` |

---

## Переменные

| Переменная           | Пример              |
|----------------------|---------------------|
| `<VEMITREYA_IP>`     | `192.168.100.218`   |
| `<LAN_SUBNET>`       | `192.168.100.0/24`  |

---

## Автоматическая установка серверной части

**v2.206+** настраивает серверную часть (nftables REDIRECT + masquerade) автоматически
в шаге 7 install.sh. Этот документ — только про Mikrotik.

---

## Шаг 1. Address list `blocked_sites`

Идентичен RouterOS 7:

```routeros
/ip firewall address-list

# Telegram
add list=blocked_sites address=149.154.160.0/20 comment="Telegram"
add list=blocked_sites address=91.108.4.0/22    comment="Telegram"
add list=blocked_sites address=91.108.8.0/22    comment="Telegram"
add list=blocked_sites address=91.108.12.0/22   comment="Telegram"
add list=blocked_sites address=91.108.16.0/22   comment="Telegram"
add list=blocked_sites address=91.108.20.0/22   comment="Telegram"
add list=blocked_sites address=91.108.56.0/22   comment="Telegram"

# Meta
add list=blocked_sites address=31.13.64.0/18    comment="Meta"
add list=blocked_sites address=157.240.0.0/17   comment="Meta"
add list=blocked_sites address=129.134.0.0/17   comment="Meta"

# OpenAI
add list=blocked_sites address=104.18.32.0/24   comment="OpenAI"
add list=blocked_sites address=104.18.33.0/24   comment="OpenAI"
add list=blocked_sites address=172.64.150.0/24  comment="OpenAI"
add list=blocked_sites address=172.64.154.0/24  comment="OpenAI"

# Anthropic
add list=blocked_sites address=160.79.104.0/24  comment="Anthropic"
```

⚠️ В RouterOS 6 поддержка доменных имён в address-list менее надёжна.
Рекомендую только IP-диапазоны.

---

## Шаг 2. Mangle — mark-connection + mark-routing

В RouterOS 6 **нет** `/routing table` как отдельной сущности — таблица создаётся
автоматически при использовании `routing-mark`.

```routeros
/ip firewall mangle

# Защита от loop: трафик от самого сервера не маркируем
add chain=prerouting src-address=192.168.100.218 action=accept \
    place-before=0 comment="Vemitreya — no proxy loop"

# Mark connection
add chain=prerouting src-address=192.168.100.0/24 \
    dst-address-list=blocked_sites \
    action=mark-connection new-connection-mark=proxy_conn passthrough=yes \
    comment="Mark traffic for proxy"

# Mark routing
add chain=prerouting connection-mark=proxy_conn \
    action=mark-routing new-routing-mark=to_proxy passthrough=no \
    comment="Route to proxy table"
```

`place-before=0` в RouterOS 6 в `add` командах работает, но требует знать индекс.
Можно проще — добавить, потом переместить через `move`.

---

## Шаг 3. Route (синтаксис RouterOS 6)

```routeros
/ip route
add dst-address=0.0.0.0/0 gateway=192.168.100.218 routing-mark=to_proxy \
    distance=1 check-gateway=ping comment="To Vemitreya proxy"
```

**Обрати внимание**: в RouterOS 6 — `routing-mark=`, не `routing-table=`.

---

## Шаг 4. Особенности RouterOS 6: fast-track

В RouterOS 6 включён `fasttrack-connection` — пакеты established/related
проходят мимо mangle для ускорения. **Может ломать связку**.

### Проверить наличие
```routeros
/ip firewall filter print where action=fasttrack-connection
```

### Если правило есть — добавь исключение для проксируемого трафика
```routeros
/ip firewall filter
add chain=forward src-address=192.168.100.0/24 \
    dst-address-list=blocked_sites action=accept \
    comment="Don't fasttrack proxied traffic" \
    place-before=[/ip firewall filter find action=fasttrack-connection]
```

Это обходит fasttrack для трафика на сайты из blocked_sites — каждый пакет проходит через mangle и корректно маркируется.

---

## Шаг 5. Проверка

```routeros
# Mangle работает?
/ip firewall mangle print stats where comment~"proxy"

# Route активен?
/ip route print where routing-mark=to_proxy
# Должен быть флаг A (Active)

# Address-list заполнен?
/ip firewall address-list print count-only where list=blocked_sites
```

На клиенте LAN — открой `web.telegram.org` или `chat.openai.com` — должны открыться через VPN.

---

## Полный итоговый блок (копи-паст)

```routeros
# === Vemitreya RouterOS 6: mark+route → сервер ===

/ip firewall mangle
add chain=prerouting src-address=192.168.100.218 action=accept \
    place-before=0 comment="Vemitreya — no proxy loop"
add chain=prerouting src-address=192.168.100.0/24 \
    dst-address-list=blocked_sites \
    action=mark-connection new-connection-mark=proxy_conn passthrough=yes \
    comment="Mark traffic for proxy"
add chain=prerouting connection-mark=proxy_conn \
    action=mark-routing new-routing-mark=to_proxy passthrough=no \
    comment="Route to proxy table"

/ip route
add dst-address=0.0.0.0/0 gateway=192.168.100.218 routing-mark=to_proxy \
    distance=1 check-gateway=ping comment="To Vemitreya proxy"
```

---

## Migration с RouterOS 6 на 7

```routeros
# Бэкап перед апгрейдом
/export file=before-ros7-upgrade
```

После апгрейда:
1. Создать routing table явно: `/routing table add fib name=to_proxy`
2. В `/ip route` поменять `routing-mark=to_proxy` → `routing-table=to_proxy`
3. fast-track в RouterOS 7 настраивается иначе — конфликта обычно нет

---

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| Сайты не открываются | Проверь fasttrack — может перехватывать пакеты до mangle |
| Counters mangle = 0 | Address-list пустой или dst-IP сайта не в нём |
| Route неактивен | `check-gateway=ping` — сервер не отвечает на ping? Убери временно |
| Connection-mark не передаётся в routing | Порядок mangle важен: connection первым, routing вторым |

См. также **`docs/routers/mikrotik-ros7.md` → Troubleshooting** — большинство проблем общие.
