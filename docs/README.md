# Документация Vemitreya

| Файл | Что внутри |
|------|------------|
| [CHANGELOG.md](./CHANGELOG.md) | История версий — что изменено в каждом релизе |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Как система устроена: компоненты, порты, потоки трафика |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Установка с нуля + обновление + что бэкапить |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Частые проблемы и решения |
| [API.md](./API.md) | API_TOKEN, MIHOMO_SECRET, REST endpoints |
| [routers/mikrotik-ros7.md](./routers/mikrotik-ros7.md) | Настройка Mikrotik с RouterOS 7 |
| [routers/mikrotik-ros6.md](./routers/mikrotik-ros6.md) | Настройка Mikrotik с RouterOS 6 |
| [routers/keenetic.md](./routers/keenetic.md) | Настройка Keenetic |

## С чего начать

- **Свежая установка** → [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Где взять API_TOKEN / как сменить** → [API.md](./API.md)
- **Что-то не работает** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Какая версия что добавила** → [CHANGELOG.md](./CHANGELOG.md)
- **Хочу понять как всё устроено** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Настроить роутер** → `routers/<твой-роутер>.md`

## Текущая версия

См. `backend/main.py` строка `PANEL_VERSION = "..."` или вкладку sidebar внизу UI.

## Эталонная стабильная

**v2.204** — последняя проверенная стабильная версия. Хранится для отката.

PR-серии (`v2.206-PR1`, `v2.206x`) — preview перед стабильным релизом 2.206.
