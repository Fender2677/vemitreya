# Mikrotik RouterOS 7 — настройка для Vemitreya

Тестировалось на: **RouterOS 7.22.3** (CCR2004-16G-2S+, RBD53iG-5HacD2HnD)

## Архитектура

```
Клиент LAN ──TCP 443──> Mikrotik ──mark-routing──> route gateway=сервер ──>
   Сервер с Mihomo (nftables REDIRECT 443→7892) ──> Mihomo redir-port ──>
   Mihomo читает оригинальный destination через SO_ORIGINAL_DST ──>
   Применяет rules ──> Шлёт через выбранный VPN-канал ──>
   (masquerade на исходящем)
```

**Ключевая идея**:
- Mikrotik **не делает DST-NAT** — пакет уходит на сервер **с оригинальным destination**
- На сервере **nftables REDIRECT** ловит TCP 80/443 и подменяет dst → :7892 (локально)
- Mihomo через `SO_ORIGINAL_DST` читает оригинальный dst и работает прозрачно

## Автоматическая установка серверной части

**v2.206+** настраивает серверную часть (nftables REDIRECT + masquerade)
**автоматически** в шаге 7 install.sh. Ниже только Mikrotik.

Серверная часть настраивается автоматически; ручная настройка описана в секции **«Серверная часть вручную»** ниже.

---

## Переменные

| Переменная           | Пример              | Что это                |
|----------------------|---------------------|------------------------|
| `<VEMITREYA_IP>`     | `192.168.100.218`   | IP сервера с Mihomo    |
| `<LAN_SUBNET>`       | `192.168.100.0/24`  | Подсеть клиентов       |

---

## Шаг 1. Address list `blocked_sites`

Список IP/подсетей которые проксировать.

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
add list=blocked_sites address=91.105.192.0/23  comment="Telegram"
add list=blocked_sites address=185.76.151.0/24  comment="Telegram"

# Meta (Facebook / Instagram / WhatsApp)
add list=blocked_sites address=31.13.64.0/18    comment="Meta"
add list=blocked_sites address=157.240.0.0/17   comment="Meta"
add list=blocked_sites address=157.240.192.0/18 comment="Meta"
add list=blocked_sites address=129.134.0.0/17   comment="Meta"

# OpenAI / ChatGPT
add list=blocked_sites address=104.18.32.0/24   comment="OpenAI"
add list=blocked_sites address=104.18.33.0/24   comment="OpenAI"
add list=blocked_sites address=172.64.150.0/24  comment="OpenAI"
add list=blocked_sites address=172.64.154.0/24  comment="OpenAI"
add list=blocked_sites address=188.114.98.0/24  comment="OpenAI CDN"
add list=blocked_sites address=188.114.99.0/24  comment="OpenAI CDN"

# Anthropic / Claude
add list=blocked_sites address=160.79.104.0/24  comment="Anthropic"
add list=blocked_sites address=104.16.0.0/13    comment="Cloudflare (Claude/ChatGPT)"
```

---

## Шаг 2. Routing table

```routeros
/routing table add fib name=to_proxy
```

---

## Шаг 3. Mangle — mark-connection + mark-routing

**Двухшаговая** схема: помечаем соединение (для ответа), потом маршрутизацию.

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

# Mark routing на основе connection-mark
add chain=prerouting connection-mark=proxy_conn \
    action=mark-routing new-routing-mark=to_proxy passthrough=no \
    comment="Route to proxy table"
```

---

## Шаг 4. Route

```routeros
/ip route
add dst-address=0.0.0.0/0 gateway=192.168.100.218 routing-table=to_proxy \
    comment="To Vemitreya proxy"
```

---

## Шаг 5. Проверка

### На роутере
```routeros
/ip firewall mangle print stats where comment~"proxy"
# packets и bytes должны расти при использовании сайтов из blocked_sites

/ip route print where routing-table=to_proxy
# Должен быть флаг A (Active)
```

### На клиенте LAN
Открой web.telegram.org, chat.openai.com, claude.ai — должны открыться.

### На сервере
```bash
sudo journalctl -u mihomo -f | grep -v "xo.e0f"
# Видишь: [TCP] 192.168.100.X:YYYY --> some-host:443 match ...
```

---

## Серверная часть вручную (если PR < 2.6)

```bash
sudo mkdir -p /etc/nftables.d
sudo tee /etc/nftables.d/mihomo-redirect.nft > /dev/null << 'EOF'
table ip mihomo_redirect {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;
        tcp dport 80  redirect to :7892
        tcp dport 443 redirect to :7892
    }
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        oifname != "lo" masquerade
    }
}
EOF

# Подключить include (один раз)
grep -q "/etc/nftables.d" /etc/nftables.conf 2>/dev/null || \
    echo 'include "/etc/nftables.d/*.nft"' | sudo tee -a /etc/nftables.conf

sudo nft -f /etc/nftables.d/mihomo-redirect.nft
sudo systemctl enable nftables
```

Если ранее экспериментировал с TPROXY — удалить:
```bash
sudo nft delete table inet mihomo_tproxy 2>/dev/null
sudo systemctl disable --now mihomo-tproxy-route 2>/dev/null
sudo rm -f /etc/systemd/system/mihomo-tproxy-route.service /etc/nftables.d/mihomo-tproxy.nft
sudo systemctl daemon-reload
```

---

## Ограничения

### Работает
- HTTP 80/TCP, HTTPS 443/TCP через прокси
- Все правила Mihomo (DOMAIN-SUFFIX, GEOSITE, IP-CIDR)
- Conntrack отслеживает соединения

### НЕ работает
- **UDP** — не проксируется (HTTP/3 QUIC, DNS over UDP)
  - Большинство сайтов имеют fallback на TCP — работают
- **Не-стандартные TCP порты** (8080, 8443, 5222) — мимо
  - Добавь в `prerouting` правила сервера вручную если нужно

### Conntrack и масштаб
Малая сеть (до 100 устройств) — без проблем. При росте мониторь:
```bash
sysctl net.netfilter.nf_conntrack_max
cat /proc/sys/net/netfilter/nf_conntrack_count
```

---

## Troubleshooting

| Симптом | Проверка |
|---------|----------|
| Сайты не открываются | `/ip firewall mangle print stats where comment~"proxy"` — packets > 0? |
| | `/ip route print where routing-table=to_proxy` — флаг A? |
| | `sudo ss -tlnp \| grep 7892` на сервере — Mihomo слушает? |
| | `sudo nft list table ip mihomo_redirect` — правила есть? |
| | `cat /proc/sys/net/ipv4/ip_forward` → должно быть `1` |
| Логи Mihomo пустые | `sudo grep "^log-level:" /opt/mihomo/config/config.yaml` → не silent? |
| Loop / высокий CPU | Не исключил `src-address=<VEMITREYA_IP>` в mangle |

### Полный итоговый блок (копи-паст)

```routeros
/routing table add fib name=to_proxy

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
add dst-address=0.0.0.0/0 gateway=192.168.100.218 routing-table=to_proxy \
    comment="To Vemitreya proxy"
```
