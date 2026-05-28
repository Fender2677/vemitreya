# DEPLOYMENT — установка Vemitreya с нуля

## Требования

### Железо
- VM/контейнер/железный сервер с **2 CPU / 2 GB RAM / 16 GB диска** (минимум)
- Сетевой интерфейс с публичным IP **или** в той же подсети что роутер
- IP-адрес статический (DHCP-резервация на роутере)

### Софт
- **Ubuntu 24.04 LTS** (рекомендуется) или 22.04 LTS
- Доступ через SSH под пользователем с правами sudo

### Сеть
- Сервер должен быть в подсети LAN роутера (например 192.168.100.218 если LAN = 192.168.100.0/24)
- Открытый egress наружу (для скачивания пакетов, GeoIP баз)
- Возможность настроить роутер на проксирование через этот сервер

## Установка

### 1. Подготовка сервера

```bash
# Обновить систему
sudo apt-get update && sudo apt-get upgrade -y

# Установить базовые утилиты
sudo apt-get install -y curl wget unzip nano htop

# Проверить версию
lsb_release -a
# Should: Ubuntu 24.04.x LTS
```

### 2. Скачать архив Vemitreya

```bash
# С локального компьютера через scp
scp vemitreya-2.206.zip user@<server-ip>:~/
ssh user@<server-ip>
unzip -o vemitreya-2.206.zip
cd vemitreya
```

### 3. Запустить install.sh

```bash
sudo ./install.sh
# Меню выбора:
# 1) Полная установка (Mihomo + Vemitreya панель)
# 2) Только Vemitreya панель (Mihomo уже установлен)
# 3) Обновить Vemitreya панель (применить новый frontend + системные фиксы)
#
# На новом сервере выбираем 1
```

Скрипт выполнит:
- Установку Mihomo core + GeoIP/GeoSite базы
- Создание Python venv, установку зависимостей
- Создание `/opt/vemitreya/.env` с генерированным API_TOKEN
- Создание `/opt/mihomo/config/config.yaml` со всеми 5 портами + localhost API + secret
- Применение системных фиксов (ip_forward, sysctl)
- Создание system user `vemitreya` + sudoers + Caddy (готовность, не активируется по умолчанию)
- Smoke-тесты в финале

В конце install.sh выводит **API_TOKEN в жёлтой рамке** — **сохрани его** в надёжном месте.

⚠️ **Если потерял токен или не записал** — не страшно, его всегда можно посмотреть:

```bash
sudo grep '^API_TOKEN=' /opt/vemitreya/.env | cut -d= -f2-
```

Подробнее — см. [API.md](./API.md).

### 4. Открыть в браузере

```
http://<server-ip>:8888/
```

Залогинься API токеном (из жёлтой рамки в выводе install.sh).

### 5. Установить AWG через UI

В Vemitreya → вкладка «AWG туннели» → кнопка «Установить».
Скрипт автоматически добавит PPA, поставит amneziawg + amneziawg-dkms.

Если упадёт (РФ часто блокирует PPA Amnezia) — появится кнопка
**«Попробовать через Mihomo proxy»**. Для этого Mihomo должен уже иметь активный VPN-канал
в группе `🌐 Основной трафик` (не DIRECT).

### 6. Установить TrustTunnel через UI

Аналогично — вкладка «TrustTunnel» → кнопка «Установить».
Скачивает официальный установщик с GitHub TrustTunnel.

### 7. Настроить туннели

#### AWG туннель
В вкладке «AWG туннели» → «Создать туннель» → ввести конфиг.

После создания install.sh **автоматически** применяет фиксы маршрутизации:
- `Table = off`
- `MTU = 1200`
- `PostUp/PostDown` с `fwmark 0xca6c lookup 51820`

(шаг 6b в install.sh при следующем запуске; либо вручную через UI)

#### TrustTunnel канал
Вкладка «TrustTunnel» → «Создать канал» → ввести параметры (сервер, порт, юзер, пароль, локальный SOCKS5 порт).

Создаётся:
- `/opt/trusttunnel_client/configs/<Name>_socks.toml` (TOML конфиг)
- `/etc/systemd/system/trusttunnel-<Name>.service` (systemd unit)
- `systemctl enable --now trusttunnel-<Name>`

После создания канала можно зарегистрировать его как Mihomo proxy:
вкладка → «Зарегистрировать в Mihomo» → выбрать имя прокси.

### 8. Настроить proxy-groups и rules в Vemitreya

Минимум для работы — одна группа `🌐 Основной трафик` с прокси (DIRECT или подписки) и
одно правило `MATCH,🌐 Основной трафик`.

Расширенная схема:

```yaml
proxy-groups:
  - name: 🌐 Основной трафик
    type: select
    proxies: [📡 EOF_HY2, ⚡ AWG, ⚡ TT, DIRECT]
  - name: Telegram
    type: select
    proxies: [⚡ AWG, 📡 EOF_HY2, DIRECT]
  - name: ⚡ AWG
    type: select
    proxies: [FirstByte (AWG)]
  - name: ⚡ TT
    type: select
    proxies: [🔐 Netherlands (SOCKS5), 🔐 Poland (SOCKS5)]

rules:
  # Локалка
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  # Россия
  - GEOSITE,category-ru,DIRECT
  - GEOSITE,yandex,DIRECT
  - GEOSITE,vk,DIRECT
  # Telegram
  - DOMAIN-SUFFIX,telegram.org,Telegram
  - DOMAIN-KEYWORD,telegram,Telegram
  - IP-CIDR,91.108.0.0/16,Telegram,no-resolve
  - IP-CIDR,149.154.160.0/20,Telegram,no-resolve
  # Всё остальное
  - MATCH,🌐 Основной трафик
```

### 9. Настроить роутер

См. документы в `docs/routers/`:
- Mikrotik RouterOS 7 → `mikrotik-ros7.md`
- Mikrotik RouterOS 6 → `mikrotik-ros6.md`
- Keenetic → `keenetic.md`

После настройки роутера попробуй открыть в браузере клиента LAN:
- web.telegram.org → должен открыться через AWG или EOF_HY2
- chat.openai.com → через основной канал
- ya.ru → напрямую (DIRECT)

### 10. (Опционально) Активировать secure-mode

Когда всё работает несколько дней без проблем:

```bash
cd ~/vemitreya
sudo ./install.sh --secure-mode
```

Это:
- Переключит `User=root` → `User=vemitreya` в systemd unit
- Передаст ownership `/opt/vemitreya/` → `vemitreya:vemitreya`
- Включит Caddy на :8889 с self-signed TLS
- Применит group access к `/etc/amnezia/amneziawg/`, `/opt/mihomo/config/`, `/opt/trusttunnel_client/configs/`

UI станет доступен на `https://<server-ip>:8889/` (с предупреждением о self-signed cert).

## Проверка после установки

```bash
# Все сервисы активны?
sudo systemctl is-active mihomo vemitreya
# (caddy если в secure-mode)

# Mihomo слушает порты?
sudo ss -tlnp | grep mihomo
# Ожидаем 6 LISTEN: 7890, 7891, 7892, 7893, 7894, 9090

# Mihomo API отвечает с secret?
SECRET=$(sudo grep '^MIHOMO_SECRET=' /opt/vemitreya/.env | cut -d= -f2-)
curl -sS -H "Authorization: Bearer $SECRET" http://127.0.0.1:9090/version
# {"meta":true,"version":"v1.19.x"}

# Vemitreya health=ok?
curl -sS http://127.0.0.1:8888/api/health | python3 -m json.tool
# status: "ok" если всё ok

# IP forwarding?
cat /proc/sys/net/ipv4/ip_forward
# 1

# Sudoers валиден?
sudo visudo -c -f /etc/sudoers.d/vemitreya
# parsed OK

# User vemitreya существует?
id vemitreya
# uid=xxx(vemitreya) gid=xxx(vemitreya) groups=xxx(vemitreya)
```

## Обновление до новой версии

```bash
# Скачать новый архив
scp vemitreya-2.206-PR<N>.zip user@<server-ip>:~/
ssh user@<server-ip>
unzip -o vemitreya-2.206-PR<N>.zip
cd vemitreya
sudo ./install.sh    # выбрать пункт 3
```

Пункт 3 не трогает Mihomo install, geo-базы, AWG/TT — только обновляет
backend + frontend + перепроверяет конфиги и системные настройки.

Также можно через UI: Vemitreya → Обновления → Загрузить .zip.

## Откат на предыдущую версию

```bash
# Имея старый архив
unzip -o vemitreya-<OLD_VERSION>.zip
cd vemitreya
sudo ./install.sh    # пункт 3
```

После установки secure-mode откат secure-mode (вернуть User=root) — см. `TROUBLESHOOTING.md`.

## Что бэкапить

| Файл / каталог                          | Что хранит                       |
|------------------------------------------|----------------------------------|
| `/opt/vemitreya/.env`                    | API_TOKEN, MIHOMO_SECRET — критично! |
| `/opt/vemitreya/data/panel.db`           | History, install jobs, settings  |
| `/opt/mihomo/config/config.yaml`         | Mihomo конфиг с группами/правилами |
| `/etc/amnezia/amneziawg/*.conf`          | AWG туннели + private keys       |
| `/opt/trusttunnel_client/configs/*.toml` | TT каналы (логины/пароли)        |
| `/etc/systemd/system/trusttunnel-*.service` | systemd units TT каналов      |
| `/etc/sudoers.d/vemitreya`               | (если secure-mode активирован)   |

Простейший бэкап:

```bash
sudo tar czf ~/vemitreya-backup-$(date +%Y%m%d).tar.gz \
    /opt/vemitreya/.env \
    /opt/vemitreya/data/panel.db \
    /opt/mihomo/config/config.yaml \
    /etc/amnezia/amneziawg/ \
    /opt/trusttunnel_client/configs/ \
    /etc/systemd/system/trusttunnel-*.service 2>/dev/null
```

Восстановление:
```bash
sudo tar xzf vemitreya-backup-YYYYMMDD.tar.gz -C /
sudo systemctl restart mihomo vemitreya
```
