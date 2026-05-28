# Vemitreya

<img width="480" height="376" alt="image" src="https://github.com/user-attachments/assets/0fbf01d4-42d3-409a-93a0-9789b97709b3" />


**Веб-панель управления прокси-инфраструктурой на базе [Mihomo](https://github.com/MetaCubeX/mihomo).**
Объединяет Mihomo, AmneziaWG и TrustTunnel в одном интерфейсе: маршрутизация трафика,
подписки, умный автовыбор быстрейшего сервера и автонастройка домашних роутеров.

![version](https://img.shields.io/badge/version-2.206-blue)
![platform](https://img.shields.io/badge/platform-Ubuntu%2022.04%20%7C%2024.04-orange)
![license](https://img.shields.io/badge/license-MIT-green)

---
<img width="1148" height="594" alt="image" src="https://github.com/user-attachments/assets/d927f17d-f3ee-45b7-b449-82bc5bcf9872" />

## Возможности

- **Дашборд** — CPU/RAM/диск, живой трафик, активные каналы и маршрутизация.
- **Переключение каналов** — ручной выбор сервера или **умный автовыбор**: панель
  сама пингует серверы и держит быстрейший, с настройками на каждую группу
  (интервал, порог переключения, исключения серверов по ключевым словам).
- **Группы** — визуальный редактор с разделением на маршрутизацию и каналы.
  Выбор отдельных серверов из подписок через `use` + `filter`.
- **Подписки** — добавление и обновление proxy-providers.
- **Правила** — редактор rules с изменением порядка.
- **Speedtest** — матрица «прокси × сайты».
- **AmneziaWG** — создание туннелей и интеграция в Mihomo.
- **TrustTunnel** — обнаружение и регистрация SOCKS5-туннелей.
- **Роутеры** — генерация скриптов автонастройки для MikroTik (RouterOS 6/7)
  и Keenetic: списки доменов/IP маршрутизируются через сервер.
- **Mihomo YAML** — встроенный редактор конфига.
- **Обновления** — Mihomo и сама панель (через архив или GitHub-релизы).
- **Telegram** — уведомления о падении сервисов.

---

## Требования

- Ubuntu 22.04 или 24.04 (чистый сервер или VPS)
- Root-доступ (`sudo`)
- Открытый порт `8888` для веб-панели

---

## Установка

```bash
git clone https://github.com/Fender2677/vemitreya.git
cd vemitreya
sudo ./install.sh
```

Установщик предложит варианты:

```
1) Полная установка (Mihomo + AWG + TrustTunnel + Vemitreya)  ← рекомендуется
2) Только Vemitreya панель (Mihomo уже установлен)
3) Vemitreya + Mihomo (без AWG/TrustTunnel)
4) Только обновить Vemitreya панель
```

После установки откройте `http://SERVER_IP:8888/`. API-токен будет показан в конце
установки и сохранён в `/opt/vemitreya/.env`.

---

## Обновление

**Через git:**

```bash
cd vemitreya
git pull
sudo ./install.sh   # пункт 4 — обновить панель
```

**Через веб-интерфейс:** раздел «Обновления» → загрузить `.zip` архив, либо
кнопка «Обновить с GitHub» (если в `.env` задан `PANEL_GITHUB_REPO`).
<img width="1140" height="530" alt="image" src="https://github.com/user-attachments/assets/c329501c-18ef-4306-b14a-b0caf2bec3b5" />

---

## Архитектура

| Компонент | Технология |
|-----------|-----------|
| Backend | Python, FastAPI |
| Frontend | React (single-page, без сборки) |
| Хранилище | SQLite (статистика, настройки) |
| Прокси-ядро | Mihomo (внешний процесс) |

Панель не подменяет Mihomo, а управляет им через его REST API
(`external-controller`) и редактирует YAML-конфиг с сохранением комментариев.

| Путь | Назначение |
|------|------------|
| `/opt/vemitreya/` | Панель (backend + frontend) |
| `/opt/vemitreya/data/panel.db` | SQLite |
| `/opt/vemitreya/.env` | Конфигурация и API-токен |
| `/opt/mihomo/` | Mihomo core + конфиг |
| `/etc/amnezia/amneziawg/` | Туннели AmneziaWG (`*.conf`) |
| `/opt/trusttunnel_client/` | TrustTunnel + конфиги |

Подробнее — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Документация

- [Установка и развёртывание](docs/DEPLOYMENT.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Решение проблем](docs/TROUBLESHOOTING.md)
- [Настройка роутеров](docs/routers/) — MikroTik (RouterOS 6/7), Keenetic

---

## Управление сервисами

```bash
# Панель
sudo systemctl status vemitreya
sudo systemctl restart vemitreya
sudo journalctl -u vemitreya -f

# Mihomo
sudo systemctl restart mihomo

# AmneziaWG
sudo awg-quick up <tunnel>
sudo awg show
```

---
## Поддержать проект

Если панель оказалась полезной, можно поддержать разработку:

[![Donate](https://img.shields.io/badge/YooMoney-%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B0%D1%82%D1%8C-8B3FFD?style=for-the-badge)](https://yoomoney.ru/to/4100116126044784)

---
## Лицензия

[MIT](LICENSE) — свободное использование, изменение и распространение, в том
числе в коммерческих целях, при сохранении текста лицензии.

Проект не аффилирован с Mihomo, AmneziaWG или Keenetic; использует их как
внешние компоненты.
