"""
Vemitreya — Backend API v2.206
- YAML-aware editing (ruamel.yaml preserves comments)
- Multi-tunnel AWG support
- Proxy-providers (subscriptions) CRUD
- Rules CRUD with reorder
- Better TrustTunnel discovery
"""
import os
import re
import json
import time
import socket
import tempfile
import asyncio
import sqlite3
import subprocess
import urllib.parse
import io
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import aiohttp
import psutil
from ruamel.yaml import YAML
from fastapi import FastAPI, HTTPException, Header, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ============================================
# CONFIG
# ============================================
API_TOKEN = os.getenv("API_TOKEN", "change-this-token")
MIHOMO_CONFIG = os.getenv("MIHOMO_CONFIG", "/opt/mihomo/config/config.yaml")
AWG_DIR = os.getenv("AWG_DIR", "/etc/amnezia/amneziawg")
TRUSTTUNNEL_DIR = os.getenv("TRUSTTUNNEL_DIR", "/opt/trusttunnel_client/configs")
TRUSTTUNNEL_BIN = os.getenv("TRUSTTUNNEL_BIN", "/opt/trusttunnel_client/trusttunnel_client")
MIHOMO_API = os.getenv("MIHOMO_API", "http://127.0.0.1:9090")
MIHOMO_SECRET = os.getenv("MIHOMO_SECRET", "")
MIHOMO_BINARY = os.getenv("MIHOMO_BINARY", "/usr/local/bin/mihomo")
DB_PATH = os.getenv("DB_PATH", "/opt/mihomo-panel/data/panel.db")
FRONTEND_DIR = os.getenv("FRONTEND_DIR", "/opt/vemitreya/frontend")

# ruamel.yaml — сохраняет комментарии и форматирование
yaml_obj = YAML()
yaml_obj.preserve_quotes = True
yaml_obj.width = 4096
yaml_obj.indent(mapping=2, sequence=4, offset=2)

# Lock на параллельные операции с YAML — ruamel.yaml не thread-safe
# и без него load/dump гонки приводят к 500
import threading
_yaml_lock = threading.RLock()

def yaml_load(path: str):
    with _yaml_lock:
        with open(path, "r", encoding="utf-8") as f:
            return yaml_obj.load(f) or {}

def yaml_dump(data, path: str):
    """Атомарная запись: сначала во временный файл, потом rename.
    Так читатели никогда не видят полу-записанный YAML."""
    with _yaml_lock:
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            yaml_obj.dump(data, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)  # atomic на POSIX

def yaml_from_string(s: str):
    with _yaml_lock:
        return yaml_obj.load(s) or {}

# ============================================
# SQLITE
# ============================================
def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS traffic_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            upload_bps INTEGER NOT NULL,
            download_bps INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_history(ts);

        CREATE TABLE IF NOT EXISTS domain_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            upload_bytes INTEGER DEFAULT 0,
            download_bytes INTEGER DEFAULT 0,
            connections INTEGER DEFAULT 0,
            last_seen INTEGER NOT NULL,
            UNIQUE(domain)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- install jobs (AWG/TT) с persist через рестарты backend
        CREATE TABLE IF NOT EXISTS install_jobs (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,            -- 'awg' | 'trusttunnel'
            status TEXT NOT NULL,          -- 'running' | 'done' | 'failed'
            rc INTEGER,
            started REAL NOT NULL,
            done REAL,
            logs_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_install_jobs_started ON install_jobs(started DESC);

        -- списки доменов/IP для роутеров (MikroTik / Keenetic)
        CREATE TABLE IF NOT EXISTS router_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,     -- slug для URL (latin, lowercase, -)
            title TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            entries TEXT NOT NULL DEFAULT '',  -- по одной записи на строку
            list_name TEXT NOT NULL DEFAULT 'vpn',  -- имя address-list в MikroTik
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

    """)
    conn.commit()

    # дропаем устаревшую таблицу health_probes (Health Matrix удалена)
    try:
        c.execute("DROP TABLE IF EXISTS health_probes")
        conn.commit()
    except Exception:
        pass

    # Помечаем все running jobs как failed (backend перезагрузился во время установки)
    try:
        c.execute("""
            UPDATE install_jobs
               SET status='failed',
                   done=?,
                   logs_json = json_insert(logs_json, '$[#]', '[!] backend restarted, job interrupted')
             WHERE status='running'
        """, (time.time(),))
        if c.rowcount > 0:
            print(f"[init_db] помечено {c.rowcount} install_jobs как failed (рестарт во время установки)")
        conn.commit()
    except Exception as e:
        print(f"[init_db] не удалось пометить interrupted jobs: {e}")

    conn.close()

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ============================================
# COLLECTOR (live traffic & domains)
# ============================================
class Collector:
    def __init__(self):
        self.running = False
        self.task = None
        self.current_traffic = {"up": 0, "down": 0}
        self.last_save = 0
        # Кумулятивный трафик по proxy name (из chains активных connections)
        # name -> {"upload": int_bytes, "download": int_bytes, "ts": float}
        self.proxy_totals = {}
        # Скорость B/s по proxy: name -> {"up": float, "down": float}
        self.proxy_speed = {}

    async def start(self):
        self.running = True
        self.task = asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False
        if self.task: self.task.cancel()

    async def _loop(self):
        while self.running:
            try:
                await self._tick()
            except Exception as e:
                print(f"[Collector] {e}")
            await asyncio.sleep(2)

    async def _tick(self):
        headers = {"Authorization": f"Bearer {MIHOMO_SECRET}"} if MIHOMO_SECRET else {}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as s:
            try:
                async with s.get(f"{MIHOMO_API}/traffic", headers=headers) as r:
                    async for line in r.content:
                        data = json.loads(line.decode())
                        self.current_traffic = {"up": data.get("up", 0), "down": data.get("down", 0)}
                        now = int(datetime.now().timestamp())
                        if now - self.last_save >= 5:
                            conn = db()
                            conn.execute(
                                "INSERT INTO traffic_history(ts, upload_bps, download_bps) VALUES(?,?,?)",
                                (now, self.current_traffic["up"], self.current_traffic["down"]))
                            day_ago = int((datetime.now() - timedelta(hours=24)).timestamp())
                            conn.execute("DELETE FROM traffic_history WHERE ts < ?", (day_ago,))
                            conn.commit()
                            conn.close()
                            self.last_save = now
                        break
            except Exception:
                pass

            try:
                async with s.get(f"{MIHOMO_API}/connections", headers=headers) as r:
                    data = await r.json()
                    conn_db = db()
                    # Для скорости: суммарные totals по proxy name из активных connections
                    cur_totals = {}  # name -> {upload, download}
                    for c in data.get("connections", []):
                        meta = c.get("metadata", {})
                        host = meta.get("host") or meta.get("destinationIP")
                        chains = c.get("chains") or []
                        upload = int(c.get("upload", 0))
                        download = int(c.get("download", 0))
                        # Mihomo может класть конечный прокси в поле proxy
                        # (например для type: direct interface=awg0 — туда попадает имя AWG-прокси)
                        end_proxy = c.get("proxy") or ""
                        names = set(filter(None, chains))
                        if end_proxy:
                            names.add(end_proxy)
                        for ch_name in names:
                            t = cur_totals.setdefault(ch_name, {"upload": 0, "download": 0})
                            t["upload"] += upload
                            t["download"] += download
                        if not host: continue
                        conn_db.execute("""
                            INSERT INTO domain_stats(domain, upload_bytes, download_bytes, connections, last_seen)
                            VALUES(?, ?, ?, 1, ?)
                            ON CONFLICT(domain) DO UPDATE SET
                                upload_bytes = upload_bytes + excluded.upload_bytes,
                                download_bytes = download_bytes + excluded.download_bytes,
                                connections = connections + 1,
                                last_seen = excluded.last_seen
                        """, (host, upload, download, int(datetime.now().timestamp())))
                    conn_db.commit()
                    conn_db.close()

                    # Расчёт скорости (B/s) на основе delta totals
                    now_ts = time.time()
                    new_speed = {}
                    for name, t in cur_totals.items():
                        prev = self.proxy_totals.get(name)
                        if prev:
                            dt = max(now_ts - prev.get("ts", now_ts), 0.5)
                            up_delta = max(t["upload"] - prev.get("upload", 0), 0)
                            dn_delta = max(t["download"] - prev.get("download", 0), 0)
                            new_speed[name] = {
                                "up": up_delta / dt,
                                "down": dn_delta / dt,
                                "total_up": t["upload"],
                                "total_down": t["download"],
                            }
                        else:
                            new_speed[name] = {
                                "up": 0, "down": 0,
                                "total_up": t["upload"],
                                "total_down": t["download"],
                            }
                        self.proxy_totals[name] = {
                            "upload": t["upload"],
                            "download": t["download"],
                            "ts": now_ts
                        }
                    # Каналы которые исчезли из connections — их скорость 0
                    for name in list(self.proxy_speed.keys()):
                        if name not in new_speed:
                            new_speed[name] = {
                                "up": 0, "down": 0,
                                "total_up": self.proxy_totals.get(name, {}).get("upload", 0),
                                "total_down": self.proxy_totals.get(name, {}).get("download", 0),
                            }
                    self.proxy_speed = new_speed
            except Exception:
                pass

collector = Collector()

# ============================================
# LIFESPAN
# ============================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # warm-up psutil.cpu_percent — первый вызов всегда 0.
    # Дальше в endpoint используем interval=None для non-blocking точных замеров.
    try:
        psutil.cpu_percent(interval=None)
    except Exception:
        pass
    # нормализация существующих AWG-конфигов при старте.
    # Защита от ранее повреждённых файлов (склеенные ключи, CRLF, нет trailing \n).
    try:
        _normalize_awg_configs_at_startup()
    except Exception as e:
        print(f"[awg-normalize] startup error: {e}")
    await collector.start()
    # фоновый мониторинг сервисов и AWG handshake для Telegram alerts
    monitor_task = asyncio.create_task(_service_monitor_loop())
    smart_task = asyncio.create_task(_smart_autoselect_loop())
    yield
    monitor_task.cancel()
    smart_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    try:
        await smart_task
    except asyncio.CancelledError:
        pass
    await collector.stop()

def _normalize_awg_configs_at_startup():
    """одноразовая нормализация AWG-конфигов при старте backend.
    Чинит склеенные ключи (например `H4 = 12345Table = off`), CRLF, дубликаты."""
    AWG_KEYS = [
        "Address", "DNS", "PrivateKey", "PublicKey", "PresharedKey",
        "Endpoint", "AllowedIPs", "PersistentKeepalive",
        "MTU", "Table", "PostUp", "PostDown", "PreUp", "PreDown",
        "Jc", "Jmin", "Jmax", "S1", "S2", "S3", "S4",
        "H1", "H2", "H3", "H4", "I1", "I2", "I3", "I4", "I5",
        "J1", "J2", "J3",
    ]
    awg_dir = "/etc/amnezia/amneziawg"
    if not os.path.isdir(awg_dir):
        return
    try:
        files = [f for f in os.listdir(awg_dir) if f.endswith(".conf")]
    except (PermissionError, OSError):
        return

    fixed = []
    for f in files:
        path = os.path.join(awg_dir, f)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                content = fh.read()
        except (PermissionError, OSError, UnicodeDecodeError):
            continue

        original = content
        content = content.replace("\r\n", "\n").replace("\r", "\n")
        # Дубликаты Table = off подряд
        content = re.sub(r'(^\s*Table\s*=\s*off\s*\n)(\s*Table\s*=\s*off\s*\n)+',
                         r'\1', content, flags=re.MULTILINE)
        # Склеенные ключи
        for key in AWG_KEYS:
            pattern = re.compile(r'(\S)(' + re.escape(key) + r'\s*=)')
            content = pattern.sub(r'\1\n\2', content)
        if not content.endswith("\n"):
            content += "\n"

        if content != original:
            ts = time.strftime("%Y%m%d_%H%M%S")
            bak = f"{path}.bak.{ts}"
            try:
                with open(bak, "w", encoding="utf-8") as fh:
                    fh.write(original)
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(content)
                fixed.append(f)
            except (PermissionError, OSError) as e:
                print(f"[awg-normalize] не могу записать {path}: {e}")

    if fixed:
        print(f"[awg-normalize] исправлены: {fixed}. "
              f"Перезапусти 'awg-quick@<name>' чтобы применить.")

app = FastAPI(title="Vemitreya — Mihomo Control Panel", version="2.206.1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Глобальный обработчик любых необработанных исключений
import traceback
from fastapi.responses import JSONResponse, Response

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    tb = traceback.format_exc()
    print(f"[UNHANDLED {request.method} {request.url.path}]\n{tb}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"{type(exc).__name__}: {str(exc)[:300]}",
            "path": str(request.url.path),
        }
    )

# ============================================
# AUTH
# ============================================
def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    if authorization.replace("Bearer ", "") != API_TOKEN:
        raise HTTPException(401, "Invalid token")
    return True

Auth = Depends(verify_token)

# ============================================
# MODELS
# ============================================
class ConfigEdit(BaseModel):
    content: str

class ServiceAction(BaseModel):
    service: str
    action: str

class ProxySwitch(BaseModel):
    group: str
    proxy: str

class ProxyProvider(BaseModel):
    name: str
    type: str = "http"
    url: Optional[str] = ""
    interval: Optional[int] = 3600
    path: Optional[str] = ""
    health_check: Optional[dict] = None

class RuleItem(BaseModel):
    rule: str

class RulesReorder(BaseModel):
    rules: List[str]

class AWGTunnel(BaseModel):
    name: str
    content: str

class TrustTunnelConfig(BaseModel):
    name: str
    hostname: Optional[str] = None
    address: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    local_port: Optional[int] = None
    # Прямой ввод TOML — если задан, hostname/address/username/password/local_port игнорируются
    toml_content: Optional[str] = None
    # Интеграция с Mihomo
    add_to_mihomo: bool = True
    mihomo_proxy_name: Optional[str] = None
    add_to_groups: Optional[List[str]] = None

# ============================================
# UTILS
# ============================================
async def mihomo(method: str, path: str, data: Optional[Dict] = None):
    headers = {}
    if MIHOMO_SECRET:
        headers["Authorization"] = f"Bearer {MIHOMO_SECRET}"
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
        async with s.request(method, f"{MIHOMO_API}{path}", json=data, headers=headers) as r:
            body_text = None
            if r.content_type == "application/json":
                try:
                    body = await r.json()
                except Exception:
                    body = None
                    body_text = await r.text()
            else:
                body = None
                body_text = await r.text()

            if r.status >= 400:
                # Извлекаем понятное сообщение об ошибке
                msg = ""
                if body and isinstance(body, dict):
                    msg = body.get("message") or body.get("error") or str(body)
                else:
                    msg = body_text or f"Mihomo API error {r.status}"
                # Передаём 404 как 404, остальные как 502 (bad upstream)
                if r.status == 404:
                    raise HTTPException(404, f"Mihomo: {msg}")
                else:
                    raise HTTPException(502, f"Mihomo {r.status}: {msg}")

            return body if body is not None else body_text

def run(cmd, timeout=10):
    try:
        # auto-sudo для root-команд если backend не root
        cmd = _maybe_sudo(cmd)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"ok": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}
    except Exception as e:
        return {"ok": False, "stdout": "", "stderr": str(e)}

# hardening — список команд требующих root
_ROOT_COMMANDS = {
    "systemctl",  # restart/start/stop/reload (read-only is-active/is-enabled тоже работает но из-под vemitreya — не нужен sudo для is-active)
    "awg", "awg-quick",
    "apt-get", "add-apt-repository",
    "nft",
    "journalctl",
    "/opt/trusttunnel_client/trusttunnel_client",
}
_READ_ONLY_SYSTEMCTL = {"is-active", "is-enabled", "is-failed", "status", "show"}

def _maybe_sudo(cmd):
    """Префиксит 'sudo -n' если backend не root И команда требует root.

    Для systemctl — только для модифицирующих действий (restart/start/stop/...).
    is-active / is-enabled / status может вызвать любой user, sudo не нужен.
    """
    if os.geteuid() == 0:
        return cmd
    if not isinstance(cmd, (list, tuple)) or not cmd:
        return cmd
    cmd0 = cmd[0]
    # Полный путь? возьмём только basename для проверки
    bin_name = os.path.basename(cmd0) if "/" in str(cmd0) else cmd0
    # Спец-случай для mihomo -t (test config) — нужен только read к /opt/mihomo/, не root
    if "mihomo" in bin_name and "-t" in cmd:
        return cmd  # read-only test, без sudo
    # systemctl с read-only действиями не нужен sudo
    if bin_name == "systemctl" and len(cmd) >= 2:
        if cmd[1] in _READ_ONLY_SYSTEMCTL:
            return cmd
    if bin_name in _ROOT_COMMANDS:
        return ["sudo", "-n"] + list(cmd)
    return cmd

async def _async_run_root(cmd_parts, **kwargs):
    """Async версия — auto-sudo для root-команд."""
    cmd_parts = _maybe_sudo(list(cmd_parts))
    return await asyncio.create_subprocess_exec(*cmd_parts, **kwargs)

def _write_protected_file(target_path: str, content: str, mode: int = 0o600, owner: str = "root:root"):
    """Записать в защищённый системный файл (например /etc/amnezia/amneziawg/<name>.conf).

    Если backend под root — пишет напрямую.
    Если под vemitreya — пишет в /tmp/ и копирует через 'sudo -n cp' (whitelist в sudoers).
    """
    import tempfile
    if os.geteuid() == 0:
        # Прямая запись
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)
        os.chmod(target_path, mode)
        return

    # Под vemitreya — через /tmp + sudo cp
    # Префикс файла должен совпадать с тем что разрешено в sudoers!
    base = os.path.basename(target_path)  # например "Netherlands.conf"
    if target_path.startswith("/etc/amnezia/amneziawg/"):
        prefix = "awg-"
    elif target_path.startswith("/etc/systemd/system/trusttunnel-"):
        prefix = "ttunit-"
    else:
        raise PermissionError(f"_write_protected_file: путь {target_path} не разрешён под vemitreya")

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=base, prefix=prefix,
        dir="/tmp", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        os.chmod(tmp_path, 0o644)
        # cp /tmp/awg-XYZ.conf /etc/amnezia/amneziawg/XYZ.conf
        r = subprocess.run(["sudo", "-n", "cp", tmp_path, target_path],
                          capture_output=True, text=True)
        if r.returncode != 0:
            raise PermissionError(f"sudo cp failed: {r.stderr.strip()}")
        mode_str = oct(mode)[-3:]  # 0o600 → "600"
        subprocess.run(["sudo", "-n", "chmod", mode_str, target_path],
                      capture_output=True, text=True)
        subprocess.run(["sudo", "-n", "chown", owner, target_path],
                      capture_output=True, text=True)
    finally:
        try: os.unlink(tmp_path)
        except OSError: pass

def _remove_protected_file(target_path: str):
    """Удалить защищённый системный файл (auto-sudo)."""
    if not os.path.exists(target_path):
        return False
    if os.geteuid() == 0:
        os.remove(target_path)
    else:
        r = subprocess.run(["sudo", "-n", "rm", "-f", target_path],
                          capture_output=True, text=True)
        if r.returncode != 0:
            raise PermissionError(f"sudo rm failed: {r.stderr.strip()}")
    return True

def backup_file(path: str) -> Optional[str]:
    if not os.path.exists(path): return None
    bak = f"{path}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    run(["cp", path, bak])
    return bak

async def reload_mihomo():
    try:
        await mihomo("PUT", "/configs?force=true", {"path": MIHOMO_CONFIG})
        return True
    except Exception:
        r = run(["systemctl", "restart", "mihomo"])
        return r["ok"]

# ============================================
# Mihomo config validation (v2.206)
# ============================================
def _validate_mihomo_config(path: str = None) -> tuple[bool, str]:
    """Запускает 'mihomo -t' для проверки конфига.
    Возвращает (ok, error_message).

    правильный -d (родительская папка mihomo, не config/),
    чтобы SAFE_PATHS покрывал /opt/mihomo/ui, /opt/mihomo/geo и т.д.
    Фильтр ловит ERRO[/FATA[ (Mihomo пишет с заглавной O), не только ERR.
    Если ничего не отфильтровалось — возвращает полный stderr/stdout.
    """
    path = path or MIHOMO_CONFIG
    mihomo_bin = os.getenv("MIHOMO_BINARY", "/usr/local/bin/mihomo")

    # CWD должен покрывать ui/, geo/ и cache.db
    # /opt/mihomo/config/config.yaml → -d /opt/mihomo (а не /opt/mihomo/config)
    config_dir = os.path.dirname(path)
    if os.path.basename(config_dir) == "config":
        cwd_dir = os.path.dirname(config_dir)
    else:
        cwd_dir = config_dir

    try:
        r = subprocess.run(
            [mihomo_bin, "-t", "-d", cwd_dir, "-f", path],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode == 0:
            return True, ""

        # Mihomo пишет логи в stderr (или stdout — зависит от версии)
        combined = (r.stderr or "") + (("\n" + r.stdout) if (r.stderr and r.stdout) else (r.stdout or ""))
        combined = combined.strip()
        if not combined:
            return False, f"mihomo -t exit code {r.returncode}, no output"

        # Фильтр на error-строки (Mihomo использует ERRO[..]/FATA[..])
        err_lines = []
        for line in combined.split("\n"):
            up = line.upper()
            if any(tag in up for tag in [
                "ERRO[", "FATA[", "ERROR", "FATAL", "PANIC", "INVALID",
                "FAILED", "NOT FOUND", "TEST FAILED", "CAN'T", "CANNOT",
                "PATH IS NOT", "ALLOWED PATHS", "DUPLICATE"
            ]):
                err_lines.append(line.strip())

        if err_lines:
            # До 10 строк ошибок
            msg = "\n".join(err_lines[:10])
            if len(err_lines) > 10:
                msg += f"\n... и ещё {len(err_lines) - 10} строк ошибок"
            return False, msg

        # Если ничего не отфильтровалось — возвращаем хвост вывода целиком
        tail = "\n".join(combined.split("\n")[-15:])
        return False, f"mihomo -t failed (exit {r.returncode}):\n{tail[:2000]}"
    except subprocess.TimeoutExpired:
        return False, "mihomo -t timeout (>15s)"
    except FileNotFoundError:
        return False, f"mihomo binary not found at {mihomo_bin}"
    except Exception as e:
        return False, f"validation error: {type(e).__name__}: {e}"

def _check_rules_reference_existing_groups(rules: list, cfg: dict) -> tuple[bool, str]:
    """Проверяет что все правила ссылаются на существующие группы / proxies / DIRECT/REJECT.

    Возвращает (ok, error_message)."""
    valid_targets = {"DIRECT", "REJECT", "PASS"}
    # Имена групп
    for g in (cfg.get("proxy-groups") or []):
        if isinstance(g, dict) and "name" in g:
            valid_targets.add(str(g["name"]))
    # Имена proxies
    for p in (cfg.get("proxies") or []):
        if isinstance(p, dict) and "name" in p:
            valid_targets.add(str(p["name"]))

    missing = set()
    for r in rules:
        if not isinstance(r, str):
            continue
        parts = [x.strip() for x in r.split(",")]
        # MATCH,target  или  TYPE,value,target[,options]
        if len(parts) < 2:
            continue
        if parts[0].upper() == "MATCH":
            target = parts[1]
        elif len(parts) >= 3:
            target = parts[2]
        else:
            continue
        if target not in valid_targets:
            missing.add(target)

    if missing:
        return False, "Правила ссылаются на несуществующие группы: " + ", ".join(sorted(missing))
    return True, ""

async def _save_and_validate_mihomo(cfg: dict, expect_rules: list = None) -> tuple[bool, str, str]:
    """Сохраняет cfg в MIHOMO_CONFIG, валидирует через mihomo -t.
    Если упало — восстанавливает бэкап (не reload-ит Mihomo).
    Если ok — делает reload_mihomo().

    Возвращает (ok, backup_path, error_message)."""
    # Pre-check: правила ссылаются на существующие цели?
    if expect_rules is not None:
        ok, err = _check_rules_reference_existing_groups(expect_rules, cfg)
        if not ok:
            return False, "", err

    backup = backup_file(MIHOMO_CONFIG)
    try:
        yaml_dump(cfg, MIHOMO_CONFIG)
    except Exception as e:
        return False, backup or "", f"Не удалось записать конфиг: {e}"

    ok, err = _validate_mihomo_config()
    if not ok:
        # Откат
        if backup and os.path.exists(backup):
            try:
                with open(backup, "r", encoding="utf-8") as bf:
                    content = bf.read()
                # Атомарная запись (для secure-mode под vemitreya)
                if os.path.dirname(MIHOMO_CONFIG) == "/opt/mihomo/config":
                    # Прямая запись — vemitreya group имеет 770/660
                    with open(MIHOMO_CONFIG, "w", encoding="utf-8") as f:
                        f.write(content)
                else:
                    with open(MIHOMO_CONFIG, "w", encoding="utf-8") as f:
                        f.write(content)
            except Exception as e2:
                return False, backup, f"Конфиг невалиден: {err}\nОткат тоже упал: {e2}"
        return False, backup or "", f"Конфиг невалиден, откат выполнен:\n{err}"

    await reload_mihomo()
    return True, backup or "", ""

# ============================================
# HEALTH
# ============================================
@app.get("/api/health")
def health():
    """Базовый health-чек. Без авторизации — для smoke-тестов после установки."""
    checks = {}
    # Mihomo живой?
    try:
        r = subprocess.run(["systemctl", "is-active", "mihomo"],
                           capture_output=True, text=True, timeout=2)
        checks["mihomo"] = r.stdout.strip()
    except Exception as e:
        checks["mihomo"] = f"error: {e}"
    # Mihomo API отвечает?
    try:
        import urllib.request
        req = urllib.request.Request("http://127.0.0.1:9090/version")
        # передать secret если он установлен
        if MIHOMO_SECRET:
            req.add_header("Authorization", f"Bearer {MIHOMO_SECRET}")
        with urllib.request.urlopen(req, timeout=2) as resp:
            checks["mihomo_api"] = "ok" if resp.status == 200 else f"http {resp.status}"
    except Exception:
        checks["mihomo_api"] = f"unreachable"
    # AWG установлен?
    checks["awg_installed"] = bool(_shutil_check_awg())
    # TT установлен?
    checks["tt_installed"] = os.path.isfile("/opt/trusttunnel_client/trusttunnel_client")
    # Sysctl правильный?
    try:
        with open("/proc/sys/net/ipv4/ip_forward") as f:
            checks["ip_forward"] = f.read().strip() == "1"
    except Exception:
        checks["ip_forward"] = False

    overall = (checks["mihomo"] == "active" and checks["mihomo_api"] == "ok"
               and checks["ip_forward"])
    return {
        "status": "ok" if overall else "degraded",
        "time": datetime.now().isoformat(),
        "version": PANEL_VERSION if 'PANEL_VERSION' in globals() else None,
        "checks": checks,
    }

def _shutil_check_awg():
    """Helper: проверить наличие awg binary."""
    import shutil
    return shutil.which("awg") or shutil.which("awg-quick")

@app.get("/api/auth/check")
def auth_check(_: bool = Auth): return {"authenticated": True}

# ============================================
# ROUTER LISTS (v2.206)
# Списки доменов/IP для MikroTik / Keenetic.
# Управление — под Auth. Отдача (/rl/...) — публично в LAN без токена.
# ============================================
import re as _re_rl

def _rl_slug(s: str) -> str:
    """Превращает имя в URL-safe slug (для имени списка в URL)."""
    s = (s or "").strip().lower()
    s = _re_rl.sub(r'[^a-z0-9-]+', '-', s)
    s = _re_rl.sub(r'-+', '-', s).strip('-')
    return s or "list"

def _rl_listname(s: str) -> str:
    """имя address-list для MikroTik. В отличие от slug —
    СОХРАНЯЕТ подчёркивания (MikroTik их принимает: blocked_sites). Чистит
    только пробелы и явно недопустимые символы."""
    s = (s or "").strip()
    # MikroTik address-list имя: буквы, цифры, _, -, .
    s = _re_rl.sub(r'[^A-Za-z0-9_.\-]+', '', s)
    return s or "vemitreya"

def _rl_marker(name: str) -> str:
    """маркер для comment, regex-safe для поиска MikroTik (~).
    Проблема была ТОЛЬКО в квадратных скобках [] (символьный класс в regex).
    Двоеточие и дефис вне [] — обычные литералы, безопасны. Поэтому возвращаем
    читаемый 'vemitreya:kino-pub' (name уже slug из [a-z0-9-])."""
    return f"vemitreya:{name}"

def _rl_parse_entries(raw: str) -> list[str]:
    """Парсит entries: по строке, убирает пустые/комментарии/дубликаты."""
    seen = set()
    out = []
    for line in (raw or "").splitlines():
        e = line.strip()
        if not e or e.startswith("#") or e.startswith("//"):
            continue
        # убрать inline-комментарии и схему
        e = e.split("#")[0].strip()
        for prefix in ("https://", "http://"):
            if e.startswith(prefix):
                e = e[len(prefix):]
        e = e.rstrip("/").strip()
        if e and e not in seen:
            seen.add(e)
            out.append(e)
    return out

def _rl_get(name: str):
    conn = db()
    try:
        row = conn.execute("SELECT * FROM router_lists WHERE name=?", (name,)).fetchone()
    finally:
        conn.close()
    return row

@app.get("/api/router-lists")
def router_lists_all(_: bool = Auth):
    conn = db()
    try:
        rows = conn.execute("SELECT * FROM router_lists ORDER BY name").fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        entries = _rl_parse_entries(r["entries"])
        result.append({
            "id": r["id"], "name": r["name"], "title": r["title"],
            "description": r["description"], "entries": r["entries"],
            "entry_count": len(entries),
            "list_name": r["list_name"],
            "updated_at": r["updated_at"],
        })
    return result

@app.post("/api/router-lists")
async def router_lists_create(req: Request, _: bool = Auth):
    body = await req.json()
    name = _rl_slug(body.get("name") or body.get("title") or "")
    if not name:
        raise HTTPException(400, "Нужно имя списка")
    if _rl_get(name):
        raise HTTPException(409, f"Список '{name}' уже существует")
    now = int(time.time())
    conn = db()
    try:
        conn.execute(
            "INSERT INTO router_lists (name, title, description, entries, list_name, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (name, body.get("title", ""), body.get("description", ""),
             body.get("entries", ""), _rl_listname(body.get("list_name") or "vemitreya"),
             now, now)
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "name": name}

@app.put("/api/router-lists/{list_id}")
async def router_lists_update(list_id: int, req: Request, _: bool = Auth):
    body = await req.json()
    conn = db()
    try:
        row = conn.execute("SELECT * FROM router_lists WHERE id=?", (list_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Список не найден")
        conn.execute(
            "UPDATE router_lists SET title=?, description=?, entries=?, list_name=?, updated_at=? WHERE id=?",
            (body.get("title", row["title"]),
             body.get("description", row["description"]),
             body.get("entries", row["entries"]),
             _rl_listname(body.get("list_name") or row["list_name"]),
             int(time.time()), list_id)
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}

@app.delete("/api/router-lists/{list_id}")
def router_lists_delete(list_id: int, _: bool = Auth):
    conn = db()
    try:
        conn.execute("DELETE FROM router_lists WHERE id=?", (list_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}

# ---- Публичная отдача для роутеров (без Auth, в LAN) ----

def _rl_split_entries(entries: list[str]):
    """Разделяет на (домены, ip/подсети)."""
    domains, ips = [], []
    for e in entries:
        # IP или CIDR?
        if _re_rl.match(r'^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$', e):
            ips.append(e)
        else:
            domains.append(e)
    return domains, ips

def _cidr_to_route(entry: str):
    """'8.8.8.0/24' → ('8.8.8.0', '255.255.255.0').
    Одиночный IP '8.8.8.8' → ('8.8.8.8', '255.255.255.255').
    Возвращает None если не IP."""
    m = _re_rl.match(r'^(\d{1,3}(?:\.\d{1,3}){3})(?:/(\d{1,2}))?$', entry.strip())
    if not m:
        return None
    ip = m.group(1)
    prefix = int(m.group(2)) if m.group(2) else 32
    if prefix < 0 or prefix > 32:
        return None
    # prefix → netmask
    mask_int = (0xffffffff << (32 - prefix)) & 0xffffffff if prefix else 0
    netmask = ".".join(str((mask_int >> (24 - 8*i)) & 0xff) for i in range(4))
    return (ip, netmask)

# ---- объединённая выгрузка (ДОЛЖНА быть ПЕРЕД /rl/{name} ----
# иначе FastAPI матчит _all как {name}=_all). Каждая запись подписана списком.

def _rl_select(lists_param: str):
    """Возвращает row'ы: выбранные по ?lists=google,youtube либо все."""
    conn = db()
    try:
        if lists_param:
            wanted = [_rl_slug(x) for x in lists_param.split(",") if x.strip()]
            rows = []
            for w in wanted:
                r = conn.execute("SELECT * FROM router_lists WHERE name=?", (w,)).fetchone()
                if r:
                    rows.append(r)
            return rows
        return conn.execute("SELECT * FROM router_lists ORDER BY name").fetchall()
    finally:
        conn.close()

@app.get("/rl/_all.rsc")
def rl_all_mikrotik(lists: str = ""):
    """Объединённый MikroTik скрипт. Каждая запись с comment='vemitreya:<список>'.
    Address-list — свой у каждого списка (поле list_name)."""
    rows = _rl_select(lists)
    if not rows:
        raise HTTPException(404, "no lists")
    out = [f"# Vemitreya — объединённая выгрузка ({len(rows)} списков)",
           "/ip firewall address-list"]
    for row in rows:
        name = row["name"]
        list_name = row["list_name"] or "vemitreya"
        entries = _rl_parse_entries(row["entries"])
        title = (row["title"] or name).replace('"', "'")
        marker = _rl_marker(name)
        label = f"{title} - {marker}"
        out.append(f"# --- {row['title'] or name} -> {list_name} ({len(entries)}) ---")
        out.append(f":foreach i in=[find comment~\"{marker}\"] do={{ remove $i }}")
        for e in entries:
            out.append(f'add list={list_name} address={e} comment="{label}"')
    return Response("\n".join(out) + "\n", media_type="text/plain")

@app.get("/rl/_all.bat")
def rl_all_keenetic(lists: str = "", gateway: str = "0.0.0.0"):
    """Объединённый Keenetic batch. Каждый список в своей REM-секции."""
    rows = _rl_select(lists)
    if not rows:
        raise HTTPException(404, "no lists")
    out = [f"REM Vemitreya — объединённая выгрузка маршрутов ({len(rows)} списков)", ""]
    total = 0
    for row in rows:
        entries = _rl_parse_entries(row["entries"])
        domains, ips = _rl_split_entries(entries)
        out.append(f"REM === {row['title'] or row['name']} ({len(ips)} маршрутов) ===")
        for ip in ips:
            conv = _cidr_to_route(ip)
            if conv:
                net, mask = conv
                out.append(f"route add {net} mask {mask} {gateway}")
                total += 1
        out.append("")
    out.insert(1, f"REM Всего маршрутов: {total}")
    return Response("\n".join(out) + "\n", media_type="text/plain")

@app.get("/rl/_all.txt")
def rl_all_plain(lists: str = ""):
    """Объединённый plain — записи с заголовками-комментариями списков."""
    rows = _rl_select(lists)
    if not rows:
        raise HTTPException(404, "no lists")
    out = []
    for row in rows:
        entries = _rl_parse_entries(row["entries"])
        out.append(f"# === {row['title'] or row['name']} ({len(entries)}) ===")
        out.extend(entries)
        out.append("")
    return Response("\n".join(out) + "\n", media_type="text/plain")

@app.get("/rl/_all.keenetic")
def rl_all_keenetic_ndmc(lists: str = "", gateway: str = "", interface: str = ""):
    """объединённый ndmc-формат для Keenetic.
    Все маршруты через шлюз (IP сервера Vemitreya) или VPN-интерфейс роутера."""
    rows = _rl_select(lists)
    if not rows:
        raise HTTPException(404, "no lists")
    target = gateway or interface or "{SERVER_IP}"
    suffix = " auto" if (interface and not gateway) else ""
    out = []
    for row in rows:
        entries = _rl_parse_entries(row["entries"])
        domains, ips = _rl_split_entries(entries)
        for ip in ips:
            conv = _cidr_to_route(ip)
            if conv:
                net, mask = conv
                out.append(f"ip route {net} {mask} {target}{suffix}")
    return Response("\n".join(out) + "\n", media_type="text/plain")

@app.get("/rl/{name}.txt")
def rl_plain(name: str):
    """Plain список — по строке на запись. Универсальный."""
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    return Response("\n".join(entries) + "\n", media_type="text/plain")

@app.get("/rl/{name}.rsc")
def rl_mikrotik(name: str):
    """MikroTik RouterOS скрипт: добавляет записи в address-list.
    Сначала чистит старые записи этого списка, потом добавляет новые.
    comment = 'Название [vemitreya]' — читаемое название + маркер
    для точечной очистки (find по подстроке [vemitreya] не трогает чужие записи)."""
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    list_name = row["list_name"] or "vemitreya"
    title = (row["title"] or name).replace('"', "'")
    marker = _rl_marker(name)     # безопасный для regex маркер очистки
    label = f"{title} - {marker}"   # читаемое название - метка
    lines = [
        f"# Vemitreya router-list '{name}' → address-list '{list_name}'",
        f"# Записей: {len(entries)}",
        "/ip firewall address-list",
        f":foreach i in=[find list={list_name} comment~\"{marker}\"] do={{ remove $i }}",
    ]
    for e in entries:
        lines.append(f'add list={list_name} address={e} comment="{label}"')
    return Response("\n".join(lines) + "\n", media_type="text/plain")

@app.get("/rl/{name}.bat")
def rl_keenetic(name: str, gateway: str = "0.0.0.0"):
    """Keenetic/Windows batch формат статических маршрутов:
    'route add <сеть> mask <маска> <шлюз>'. Только IP/подсети (домены пропускаются —
    для них нужен DNS-based routing). gateway по умолчанию 0.0.0.0 (подставляется
    роутером) — можно задать через ?gateway=X.X.X.X."""
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    domains, ips = _rl_split_entries(entries)
    lines = [
        f"REM === {row['title'] or name} ({len(ips)} маршрутов) ===",
    ]
    for ip in ips:
        conv = _cidr_to_route(ip)
        if conv:
            net, mask = conv
            lines.append(f"route add {net} mask {mask} {gateway}")
    if domains:
        lines.append(f"REM Пропущено доменов: {len(domains)} (route add требует IP, не домены)")
    return Response("\n".join(lines) + "\n", media_type="text/plain")

@app.get("/rl/{name}.keenetic")
def rl_keenetic_ndmc(name: str, gateway: str = "", interface: str = ""):
    """формат CLI Keenetic (ndmc) для маршрутизации через сервер Vemitreya.
    'ip route <сеть> <маска> <шлюз>' где шлюз — IP сервера Vemitreya в LAN
    (например SERVER_IP). Роутер направит трафик на сервер, а Mihomo завернёт
    его дальше в AWG/TT/Hy2.
    - ?gateway=SERVER_IP — IP сервера (рекомендуется)
    - ?interface=Wireguard0 — альтернатива: VPN-интерфейс на самом роутере
    Без параметров — плейсхолдер {SERVER_IP}."""
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    domains, ips = _rl_split_entries(entries)
    target = gateway or interface or "{SERVER_IP}"
    suffix = " auto" if (interface and not gateway) else ""
    lines = []
    for ip in ips:
        conv = _cidr_to_route(ip)
        if conv:
            net, mask = conv
            lines.append(f"ip route {net} {mask} {target}{suffix}")
    return Response("\n".join(lines) + "\n", media_type="text/plain")

@app.get("/rl/{name}.dnsmasq")
def rl_dnsmasq(name: str):
    """dnsmasq ipset формат — для роутеров с dnsmasq (OpenWRT/Entware)."""
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    domains, ips = _rl_split_entries(entries)
    list_name = row["list_name"] or "vemitreya"
    lines = [f"# Vemitreya '{name}' dnsmasq ipset"]
    for d in domains:
        lines.append(f"ipset=/{d}/{list_name}")
    return Response("\n".join(lines) + "\n", media_type="text/plain")

@app.get("/rl/{name}.json")
def rl_json(name: str):
    row = _rl_get(name)
    if not row:
        raise HTTPException(404, "not found")
    entries = _rl_parse_entries(row["entries"])
    domains, ips = _rl_split_entries(entries)
    return {"name": name, "list_name": row["list_name"],
            "domains": domains, "ips": ips, "total": len(entries)}

# ============================================
# SYSTEM STATS
# ============================================
@app.get("/api/stats/system")
def stats_system(_: bool = Auth):
    # правильное измерение CPU.
    # `psutil.cpu_percent(interval=N)` блокирует на N секунд и в short window
    # может давать неточные значения. Правильный паттерн:
    #   1. На старте делаем "warm-up" вызов (см. init_db).
    #   2. В endpoint вызываем с interval=None (non-blocking) — возвращает
    #      средний % между этим и предыдущим вызовом.
    # Это и быстрее, и точнее.
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    return {
        "cpu": cpu,
        "memory": {"percent": mem.percent, "used_gb": round(mem.used/1024**3, 2),
                   "total_gb": round(mem.total/1024**3, 2)},
        "disk": {"percent": disk.percent, "used_gb": round(disk.used/1024**3, 2),
                 "total_gb": round(disk.total/1024**3, 2)},
        "network": {"sent": net.bytes_sent, "recv": net.bytes_recv},
        "uptime": int(datetime.now().timestamp() - psutil.boot_time())
    }

@app.get("/api/stats/traffic/live")
def traffic_live(_: bool = Auth):
    return collector.current_traffic

@app.get("/api/stats/traffic/history")
def traffic_history(minutes: int = 60, _: bool = Auth):
    since = int((datetime.now() - timedelta(minutes=minutes)).timestamp())
    conn = db()
    rows = conn.execute(
        "SELECT ts, upload_bps, download_bps FROM traffic_history WHERE ts >= ? ORDER BY ts",
        (since,)).fetchall()
    conn.close()
    return [{"ts": r["ts"], "up": r["upload_bps"], "down": r["download_bps"]} for r in rows]

@app.get("/api/stats/top-domains")
def top_domains(limit: int = 20, _: bool = Auth):
    conn = db()
    rows = conn.execute("""
        SELECT domain, upload_bytes, download_bytes, connections, last_seen
        FROM domain_stats
        ORDER BY (upload_bytes + download_bytes) DESC LIMIT ?""", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.delete("/api/stats/top-domains")
def clear_top_domains(_: bool = Auth):
    conn = db(); conn.execute("DELETE FROM domain_stats"); conn.commit(); conn.close()
    return {"ok": True}

@app.get("/api/stats/channels")
def stats_channels(_: bool = Auth):
    """
    Статистика всех активных каналов (туннелей).
    AWG: received/sent байты с awg show
    TrustTunnel: статус active + порт SOCKS5
    """
    channels = []

    # AWG туннели
    real_ifaces = set(_get_real_awg_interfaces())
    for iface in real_ifaces:
        show = run(["awg", "show", iface], timeout=3)
        handshake = endpoint = None
        received_b = sent_b = 0
        for line in show["stdout"].split("\n"):
            line = line.strip()
            if line.startswith("latest handshake:"):
                handshake = line.split(":", 1)[1].strip()
            elif line.startswith("endpoint:"):
                endpoint = line.split(":", 1)[1].strip()
            elif line.startswith("transfer:"):
                b = _parse_awg_transfer(line.split(":", 1)[1].strip())
                received_b = b["received"]
                sent_b = b["sent"]
        channels.append({
            "type": "awg",
            "name": iface,
            "active": True,
            "endpoint": endpoint,
            "handshake": handshake,
            "connected": bool(handshake and "ago" in handshake),
            "received_bytes": received_b,
            "sent_bytes": sent_b,
        })

    # TrustTunnel сервисы
    if os.path.exists(TRUSTTUNNEL_DIR) or os.path.exists("/opt/trusttunnel-client/configs"):
        for service_name in _tt_services():
            display_name = service_name.replace("trusttunnel-", "")
            info = _tt_parse_unit(service_name) or {}
            active = run(["systemctl", "is-active", service_name])
            local_port = info.get("local_port")
            hostname = info.get("hostname")
            # Формируем endpoint строку: "rus.eof.observer → :10007"
            ep_str = None
            if hostname and local_port:
                ep_str = f"{hostname} → :{local_port}"
            elif hostname:
                ep_str = hostname
            elif local_port:
                ep_str = f"127.0.0.1:{local_port}"

            channels.append({
                "type": "trusttunnel",
                "name": display_name,
                "service": service_name,
                "active": active["stdout"].strip() == "active",
                "endpoint": ep_str,
                "local_port": local_port,
                "hostname": hostname,
                "received_bytes": 0,  # TrustTunnel не даёт встроенной статистики
                "sent_bytes": 0,
                "connected": active["stdout"].strip() == "active",
            })

    # Суммарная статистика по AWG
    total_received = sum(c["received_bytes"] for c in channels if c["type"] == "awg")
    total_sent = sum(c["sent_bytes"] for c in channels if c["type"] == "awg")
    active_count = sum(1 for c in channels if c["connected"])

    return {
        "channels": channels,
        "summary": {
            "total": len(channels),
            "active": active_count,
            "total_received": total_received,
            "total_sent": total_sent,
        }
    }

# ============================================
# PROXIES
# ============================================
@app.get("/api/proxies")
async def proxies_all(_: bool = Auth):
    return await mihomo("GET", "/proxies")

@app.get("/api/proxies/groups")
async def proxies_groups(_: bool = Auth):
    try:
        data = await mihomo("GET", "/proxies")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Не удалось получить группы из Mihomo: {e}")

    groups = {}
    if not isinstance(data, dict):
        return groups
    proxies = data.get("proxies")
    if not isinstance(proxies, dict):
        return groups

    for name, info in proxies.items():
        try:
            if not isinstance(info, dict): continue
            # подтягиваем последний пинг из Mihomo history для всех
            # прокси — Mihomo сам пингует активные серверы групп, а url-test
            # держит свежие пинги всех членов. Складываем в общий стор.
            hist = info.get("history")
            if isinstance(hist, list) and hist:
                last = hist[-1]
                if isinstance(last, dict):
                    d = last.get("delay", 0)
                    if isinstance(d, (int, float)) and d > 0:
                        _record_delay(name, int(d))
            if info.get("type") in ("Selector", "URLTest", "Fallback", "LoadBalance"):
                all_list = info.get("all")
                if not isinstance(all_list, list): all_list = []
                groups[name] = {
                    "type": info["type"],
                    "now": info.get("now"),
                    "all": all_list,
                }
        except Exception:
            continue
    return groups

@app.put("/api/proxies/switch")
async def proxies_switch(data: ProxySwitch, _: bool = Auth):
    # safe='' — кодируем ВСЁ включая `/` (без этого имена групп со слешами,
    # такие как "EOF [SS/TROJAN/VLESS]", парсятся mihomo как путь)
    encoded = urllib.parse.quote(data.group, safe='')
    print(f"[switch] group={data.group!r} encoded={encoded!r} proxy={data.proxy!r}", flush=True)
    await mihomo("PUT", f"/proxies/{encoded}", {"name": data.proxy})
    return {"ok": True}

@app.get("/api/proxies/delay/{proxy_name}")
async def proxy_delay(proxy_name: str, _: bool = Auth):
    encoded = urllib.parse.quote(proxy_name, safe='')
    try:
        r = await mihomo("GET",
            f"/proxies/{encoded}/delay?timeout=5000&url=http://www.gstatic.com/generate_204")
        if isinstance(r, dict) and r.get("delay", 0) > 0:
            _record_delay(proxy_name, r["delay"])  # v2.206
        return r
    except Exception as e:
        return {"delay": -1, "error": str(e)}

@app.post("/api/proxies/best/{group_name}")
async def find_best_proxy(group_name: str, _: bool = Auth):
    data = await mihomo("GET", "/proxies")
    g = data.get("proxies", {}).get(group_name)
    if not g: raise HTTPException(404, f"Group {group_name} not found")

    results = []
    for p in g.get("all", []):
        if p in ("DIRECT", "REJECT"): continue
        try:
            encoded = urllib.parse.quote(p, safe='')
            r = await mihomo("GET",
                f"/proxies/{encoded}/delay?timeout=5000&url=http://www.gstatic.com/generate_204")
            if r.get("delay", -1) > 0:
                results.append({"name": p, "delay": r["delay"]})
                _record_delay(p, r["delay"])  # v2.206
        except Exception: pass

    if not results: raise HTTPException(503, "No working proxies")
    best = min(results, key=lambda x: x["delay"])
    encoded_g = urllib.parse.quote(group_name, safe='')
    await mihomo("PUT", f"/proxies/{encoded_g}", {"name": best["name"]})
    return {"ok": True, "best": best, "all_results": sorted(results, key=lambda x: x["delay"])}

# ============================================
# SPEED TEST — пинг популярных ресурсов через прокси
# ============================================
# Тестовые URL — все возвращают 204/200, маленький размер
# favicon — через Google S2 favicon API (универсальный, кешируемый)
def _favicon(domain):
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=32"

TEST_TARGETS = [
    {"id": "telegram", "name": "Telegram", "icon": "✈️",
     "favicon": _favicon("telegram.org"),
     "url": "https://web.telegram.org/k/"},
    {"id": "whatsapp", "name": "WhatsApp", "icon": "💚",
     "favicon": _favicon("whatsapp.com"),
     "url": "https://web.whatsapp.com/check"},
    {"id": "youtube", "name": "YouTube", "icon": "▶️",
     "favicon": _favicon("youtube.com"),
     "url": "https://www.youtube.com/generate_204"},
    {"id": "google", "name": "Google", "icon": "🔍",
     "favicon": _favicon("google.com"),
     "url": "http://www.gstatic.com/generate_204"},
    {"id": "openai", "name": "ChatGPT", "icon": "🤖",
     "favicon": _favicon("openai.com"),
     "url": "https://chat.openai.com/favicon.ico"},
    {"id": "claude", "name": "Claude", "icon": "🟧",
     "favicon": _favicon("claude.ai"),
     "url": "https://claude.ai/favicon.ico"},
    {"id": "cloudflare", "name": "Cloudflare", "icon": "☁️",
     "favicon": _favicon("cloudflare.com"),
     "url": "https://www.cloudflare.com/cdn-cgi/trace"},
    {"id": "github", "name": "GitHub", "icon": "🐙",
     "favicon": _favicon("github.com"),
     "url": "https://github.githubassets.com/favicons/favicon.svg"},
    {"id": "discord", "name": "Discord", "icon": "🎮",
     "favicon": _favicon("discord.com"),
     "url": "https://discord.com/api/v9/gateway"},
    {"id": "instagram", "name": "Instagram", "icon": "📷",
     "favicon": _favicon("instagram.com"),
     "url": "https://www.instagram.com/favicon.ico"},
]

@app.get("/api/speedtest/targets")
def speedtest_targets(_: bool = Auth):
    """Список доступных целей для speedtest"""
    return TEST_TARGETS

@app.get("/api/speedtest/dashboard-ping")
async def speedtest_dashboard_ping(_: bool = Auth):
    """Быстрый ping для всех конечных прокси.

    Источники:
    1. cfg.proxies — обычные прокси (AWG, TT, manual)
    2. Mihomo runtime /proxies — все прокси из subscriptions

    Mihomo runtime — единственный надёжный способ узнать список прокси из
    подписок (provider'ы хранят их в отдельных файлах, не в config.yaml).
    """
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    proxies = cfg.get("proxies")
    if not isinstance(proxies, list): proxies = []
    groups = cfg.get("proxy-groups")
    if not isinstance(groups, list): groups = []

    proxy_names = set()
    for p in proxies:
        if isinstance(p, dict) and p.get("name"):
            proxy_names.add(str(p.get("name")))

    group_names = set()
    for g in groups:
        if isinstance(g, dict) and g.get("name"):
            group_names.add(str(g.get("name")))
    SPECIALS = {"DIRECT", "REJECT", "GLOBAL", "PASS"}

    targets = set()

    # 1. Прокси из cfg.proxies (AWG/TT/manual) — всегда тестируем
    targets.update(proxy_names)

    # 2. Раскручиваем активные цепочки через полный /proxies.
    # /group и proxy-groups из config.yaml НЕ содержат provider-прокси из подписок
    # (Finland, Czechia из EOF-HY2 видны только в полном runtime /proxies).
    # Стратегия: для каждой группы берём её `now` и раскручиваем по цепочке
    # now→now→... до конечного НЕ-группового прокси. Это конечные активные каналы.
    # Так мы тестируем только реально используемые прокси, а не все 161.
    GROUP_TYPES = {"Selector", "URLTest", "Fallback", "LoadBalance", "Relay"}
    try:
        runtime_full = await mihomo("GET", "/proxies")
        rp = runtime_full.get("proxies") if isinstance(runtime_full, dict) else None
        if isinstance(rp, dict):
            def resolve_leaf(start, seen=None):
                """Раскрутить now-цепочку до конечного не-группового прокси."""
                if seen is None: seen = set()
                if start in seen or start in SPECIALS:
                    return None
                seen.add(start)
                info = rp.get(start)
                if not isinstance(info, dict):
                    return None
                ptype = info.get("type", "")
                if ptype in GROUP_TYPES:
                    nxt = info.get("now")
                    if nxt:
                        leaf = resolve_leaf(str(nxt), seen)
                        # Промежуточные группы тоже добавим как target —
                        # Mihomo умеет их пинговать (delay лучшего участника).
                        if leaf:
                            return leaf
                    return None
                # Это конечный прокси (Hysteria2/SS/Trojan/Vless/Socks5/Direct)
                return start

            for name, info in rp.items():
                if not isinstance(info, dict): continue
                if info.get("type") not in GROUP_TYPES: continue
                # Конечный лист текущего выбора (now) этой группы — ВСЕГДА тестируем
                leaf = resolve_leaf(name)
                if leaf and leaf not in SPECIALS:
                    targets.add(leaf)
                # Плюс — прямые члены группы (all), НО только если группа небольшая.
                # Большие подписочные группы (138 VLESS прокси) пинговать целиком —
                # перебор. Для них достаточно активного now-листа (выше).
                # Порог 20: группа Hy2 с 7 серверами попадёт целиком (удобно видеть
                # пинг всех каналов), а EOF [VLESS] с 138 — только now.
                g_all = info.get("all")
                if isinstance(g_all, list):
                    # Считаем сколько среди all конечных (не-групповых) прокси
                    leaf_members = []
                    for sub in g_all:
                        ss = str(sub) if sub is not None else ""
                        if not ss or ss in SPECIALS:
                            continue
                        sub_info = rp.get(ss)
                        if isinstance(sub_info, dict) and sub_info.get("type") not in GROUP_TYPES:
                            leaf_members.append(ss)
                    if len(leaf_members) <= 20:
                        targets.update(leaf_members)
                    # иначе — пропускаем (now-лист уже добавлен выше)
    except Exception as e:
        print(f"[dashboard-ping] runtime /proxies failed: {e}", flush=True)

    targets = sorted(targets)
    print(f"[dashboard-ping] testing {len(targets)} proxies", flush=True)

    if not targets:
        return {"results": [], "ts": int(time.time())}

    test_url = urllib.parse.quote("http://www.gstatic.com/generate_204", safe='')
    sem = asyncio.Semaphore(16)

    async def ping(name):
        async with sem:
            try:
                encoded = urllib.parse.quote(name, safe='')
                r = await mihomo("GET", f"/proxies/{encoded}/delay?timeout=3000&url={test_url}")
                d = r.get("delay", -1) if isinstance(r, dict) else -1
                return {"name": name, "delay": d if d > 0 else -1}
            except Exception:
                return {"name": name, "delay": -1}

    results = await asyncio.gather(*[ping(n) for n in targets])
    return {"results": results, "ts": int(time.time())}

class SpeedTestRequest(BaseModel):
    proxy: str  # имя прокси из mihomo
    targets: Optional[List[str]] = None  # id'шники или None = все
    timeout_ms: int = 5000

@app.post("/api/speedtest/run")
async def speedtest_run(data: SpeedTestRequest, _: bool = Auth):
    """
    Тестирует пинг до набора популярных ресурсов через указанный прокси.
    Использует Mihomo API /proxies/{name}/delay с разными URL.
    """
    targets = TEST_TARGETS
    if data.targets:
        targets = [t for t in TEST_TARGETS if t["id"] in data.targets]
    if not targets:
        raise HTTPException(400, "Нет целей для теста")

    encoded = urllib.parse.quote(data.proxy, safe='')
    results = []

    # Параллельные запросы (по 4 одновременно) для скорости
    sem = asyncio.Semaphore(4)

    async def test_one(target):
        async with sem:
            try:
                test_url = urllib.parse.quote(target["url"], safe='')
                r = await mihomo(
                    "GET",
                    f"/proxies/{encoded}/delay?timeout={data.timeout_ms}&url={test_url}"
                )
                delay = r.get("delay", -1)
                if delay > 0:
                    return {**target, "delay": delay, "ok": True}
                return {**target, "delay": -1, "ok": False, "error": r.get("message", "no response")}
            except Exception as e:
                return {**target, "delay": -1, "ok": False, "error": str(e)[:100]}

    results = await asyncio.gather(*[test_one(t) for t in targets])

    # Статистика
    ok_results = [r for r in results if r["ok"]]
    avg = sum(r["delay"] for r in ok_results) / len(ok_results) if ok_results else 0

    return {
        "proxy": data.proxy,
        "results": results,
        "summary": {
            "total": len(results),
            "ok": len(ok_results),
            "failed": len(results) - len(ok_results),
            "avg_delay": int(avg) if avg else 0,
        }
    }

class SpeedTestMatrixRequest(BaseModel):
    proxies: List[str]  # имена прокси
    targets: Optional[List[str]] = None  # id'шники или None = все
    timeout_ms: int = 5000

@app.post("/api/speedtest/matrix")
async def speedtest_matrix(data: SpeedTestMatrixRequest, _: bool = Auth):
    """
    Прогон по матрице: каждый прокси × каждая цель.
    Возвращает компактные результаты для сводной таблицы.
    """
    targets = TEST_TARGETS
    if data.targets:
        targets = [t for t in TEST_TARGETS if t["id"] in data.targets]
    if not targets or not data.proxies:
        raise HTTPException(400, "Нужны прокси и цели")

    matrix = {}  # proxy -> { target_id -> delay }

    sem = asyncio.Semaphore(6)

    async def test_cell(proxy, target):
        async with sem:
            try:
                encoded = urllib.parse.quote(proxy, safe='')
                test_url = urllib.parse.quote(target["url"], safe='')
                r = await mihomo(
                    "GET",
                    f"/proxies/{encoded}/delay?timeout={data.timeout_ms}&url={test_url}"
                )
                return proxy, target["id"], r.get("delay", -1)
            except Exception:
                return proxy, target["id"], -1

    tasks = [test_cell(p, t) for p in data.proxies for t in targets]
    results = await asyncio.gather(*tasks)

    for proxy, target_id, delay in results:
        if proxy not in matrix:
            matrix[proxy] = {}
        matrix[proxy][target_id] = delay

    return {
        "proxies": data.proxies,
        "targets": [{"id": t["id"], "name": t["name"], "icon": t["icon"], "favicon": t.get("favicon")} for t in targets],
        "matrix": matrix
    }

# ============================================
# MIHOMO CONFIG — raw edit
# ============================================
@app.get("/api/config/mihomo")
def config_mihomo_get(_: bool = Auth):
    with open(MIHOMO_CONFIG, "r", encoding="utf-8") as f:
        return {"content": f.read(), "path": MIHOMO_CONFIG}

@app.put("/api/config/mihomo")
async def config_mihomo_put(data: ConfigEdit, _: bool = Auth):
    try:
        yaml_from_string(data.content)
    except Exception as e:
        raise HTTPException(400, f"Invalid YAML: {e}")

    backup = backup_file(MIHOMO_CONFIG)
    with open(MIHOMO_CONFIG, "w", encoding="utf-8") as f:
        f.write(data.content)

    check = run([MIHOMO_BINARY, "-d", "/opt/mihomo", "-f", MIHOMO_CONFIG, "-t"])
    if not check["ok"]:
        if backup: run(["cp", backup, MIHOMO_CONFIG])
        raise HTTPException(400, f"Config invalid: {check['stderr']}")

    await reload_mihomo()
    return {"ok": True, "backup": backup}

# ============================================
# MIHOMO — summary
# ============================================
@app.get("/api/mihomo/summary")
def mihomo_summary(_: bool = Auth):
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        import traceback
        print(f"[summary] yaml_load failed: {e}\n{traceback.format_exc()}", flush=True)
        raise HTTPException(500, f"Failed to parse config.yaml: {e}")

    try:
        def _scalar(v):
            if v is None: return None
            if isinstance(v, bool): return v
            if isinstance(v, (int, float)): return v
            return str(v)

        def _safe_len(v, expect_dict=False):
            if v is None: return 0
            if expect_dict and not isinstance(v, dict): return 0
            if not expect_dict and not isinstance(v, list): return 0
            try: return len(v)
            except Exception: return 0

        return {
            "proxies_count": _safe_len(cfg.get("proxies"), expect_dict=False),
            "proxy_groups_count": _safe_len(cfg.get("proxy-groups"), expect_dict=False),
            "proxy_providers_count": _safe_len(cfg.get("proxy-providers"), expect_dict=True),
            "rules_count": _safe_len(cfg.get("rules"), expect_dict=False),
            "ports": {
                "mixed": _scalar(cfg.get("mixed-port")),
                "http": _scalar(cfg.get("port")),
                "socks": _scalar(cfg.get("socks-port")),
                "redir": _scalar(cfg.get("redir-port")),
                "tproxy": _scalar(cfg.get("tproxy-port")),
            },
            "external_controller": _scalar(cfg.get("external-controller")),
            "mode": _scalar(cfg.get("mode")),
            "log_level": _scalar(cfg.get("log-level")),
        }
    except Exception as e:
        import traceback
        print(f"[summary] processing failed: {e}\n{traceback.format_exc()}", flush=True)
        raise HTTPException(500, f"Failed to process config: {e}")

# ============================================
# MIHOMO BINARY UPDATER
# ============================================
import platform
import gzip
import shutil
import tempfile

# Глобальный статус обновления (in-progress notifications)
_update_status = {"running": False, "step": "", "progress": 0, "error": None, "result": None}

def _detect_mihomo_arch_candidates() -> list[str]:
    """возвращает список кандидатов архитектуры по приоритету.

    Mihomo с v1.19.12 объявил `-amd64-compatible` deprecated, но **по факту**
    продолжает выкладывать его в релизы (проверено в 1.19.25). И это самый
    безопасный вариант — работает на любом amd64 включая VM где AVX/SSE4
    выключены.

    Стратегия: compatible первым (если есть — берём), v1 как fallback, остальное
    после. Это и совместимо со старыми пакетами и со свежими.

    `-amd64-v2` / `-v3` НЕ выбираем автоматически потому что они требуют SSE4.2 / AVX2
    которые могут отсутствовать в VM. Пользователь может выбрать вручную через
    «Ручное обновление» если хочет максимальной скорости.
    """
    m = platform.machine().lower()
    if m in ("x86_64", "amd64"):
        return [
            "linux-amd64-compatible",  # самый безопасный, работает на любом amd64
            "linux-amd64-v1",          # новая схема, то же самое что compatible
            "linux-amd64",             # старая совсем — fallback
        ]
    elif m in ("aarch64", "arm64"):
        return ["linux-arm64-v8", "linux-arm64"]
    elif m.startswith("armv7"):
        return ["linux-armv7"]
    elif m.startswith("armv6"):
        return ["linux-armv6"]
    elif m.startswith("arm"):
        return ["linux-armv7"]
    return [f"linux-{m}"]

def _detect_mihomo_arch() -> str:
    """Совместимость со старым кодом — возвращает первый кандидат."""
    return _detect_mihomo_arch_candidates()[0]

def _get_mihomo_local_version() -> Optional[str]:
    """Получает текущую версию mihomo через mihomo -v"""
    if not os.path.exists(MIHOMO_BINARY):
        return None
    r = run([MIHOMO_BINARY, "-v"], timeout=5)
    if not r["ok"]: return None
    # Возможные форматы вывода:
    #   "Mihomo Meta v1.18.10 linux amd64 ..."        — стабильный релиз
    #   "Mihomo Meta alpha-b3104a5 linux amd64 ..."   — alpha-сборка
    #   "Mihomo Meta beta-xxxxxxx linux amd64 ..."    — beta-сборка
    #   "Mihomo v1.19.5 ..."                          — без "Meta"
    line = r["stdout"].split("\n")[0]
    # Сначала пробуем найти семвер vX.Y.Z(...)
    m = re.search(r'v(\d+\.\d+\.\d+(?:[-\w.]+)?)', line)
    if m:
        return m.group(1)
    # Не нашли — попробуем alpha-/beta- сборку
    m = re.search(r'(alpha|beta|dev|nightly)-([a-f0-9]{6,})', line)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return None

def _is_prerelease_version(ver: Optional[str]) -> bool:
    """Проверяет является ли версия alpha/beta (не стабильной)"""
    if not ver: return False
    return any(p in ver.lower() for p in ("alpha", "beta", "dev", "nightly"))

async def _get_mihomo_latest_release() -> dict:
    """Получает информацию о последнем релизе с GitHub. С fallback на зеркала."""
    sources = [
        ("https://api.github.com/repos/MetaCubeX/mihomo/releases/latest", "api.github.com"),
        # Зеркало через ghproxy на случай блокировки/DNS issues
        ("https://ghproxy.com/https://api.github.com/repos/MetaCubeX/mihomo/releases/latest", "ghproxy.com"),
    ]

    last_error = None
    for url, source_name in sources:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.get(url, headers={"Accept": "application/vnd.github+json"}) as r:
                    if r.status == 200:
                        data = await r.json()
                        data["_source"] = source_name
                        return data
                    last_error = f"HTTP {r.status} from {source_name}"
        except aiohttp.ClientConnectorError as e:
            last_error = f"Сетевая ошибка через {source_name}: {str(e)[:120]}"
        except asyncio.TimeoutError:
            last_error = f"Таймаут через {source_name}"
        except Exception as e:
            last_error = f"Ошибка через {source_name}: {str(e)[:120]}"

    raise HTTPException(502,
        f"Не удалось получить информацию о релизе ни с одного источника. "
        f"Последняя ошибка: {last_error}. "
        f"Проверьте DNS на сервере (nslookup api.github.com).")

@app.get("/api/mihomo/version")
async def mihomo_version(check: bool = False, _: bool = Auth):
    """Возвращает текущую версию Mihomo. С check=true — проверяет GitHub (медленно)."""
    current = _get_mihomo_local_version()
    arch = _detect_mihomo_arch()

    info = {
        "current": current,
        "binary_path": MIHOMO_BINARY,
        "binary_exists": os.path.exists(MIHOMO_BINARY),
        "arch": arch,
        "channel": "prerelease" if _is_prerelease_version(current) else "stable",
        "latest": None,
        "latest_url": None,
        "latest_published": None,
        "update_available": False,
        "checked": check,
    }

    if not check:
        return info

    try:
        rel = await _get_mihomo_latest_release()
        latest_tag = rel.get("tag_name", "").lstrip("v")
        info["latest"] = latest_tag
        info["latest_published"] = rel.get("published_at")
        info["release_notes_url"] = rel.get("html_url")
        info["release_source"] = rel.get("_source")

        # ищем по списку приоритетных кандидатов.
        # Точное совпадение arch как substring + .gz + начинается с mihomo-.
        # Чтобы случайно не подцепить "linux-amd64-v3" когда искали "linux-amd64-v1",
        # сравниваем кандидата с границами: <arch>-v или <arch>. (т.е. после идёт версия)
        candidates = _detect_mihomo_arch_candidates()
        assets = rel.get("assets", [])
        chosen = None
        for cand in candidates:
            for asset in assets:
                name = asset.get("name", "")
                if not (name.startswith("mihomo-") and name.endswith(".gz")):
                    continue
                # mihomo-<cand>-v<version>.gz — должно быть точно <cand>-v
                if f"-{cand}-v" in name or name.endswith(f"-{cand}.gz"):
                    chosen = asset
                    info["latest_arch_used"] = cand
                    break
            if chosen:
                break

        if chosen:
            info["latest_url"] = chosen.get("browser_download_url")
            info["latest_size"] = chosen.get("size")
            info["latest_asset_name"] = chosen.get("name")
        else:
            # Диагностика — какие assets есть, чтобы пользователь видел причину
            available = [a.get("name", "") for a in assets if a.get("name", "").startswith("mihomo-")]
            info["error"] = (
                f"Не найден подходящий релиз для {candidates[0]}. "
                f"Проверены кандидаты: {', '.join(candidates)}. "
                f"Доступные assets в релизе: {', '.join(available[:10]) if available else 'нет'}"
            )

        # update_available
        if current and latest_tag:
            if _is_prerelease_version(current):
                info["update_available"] = True
                info["downgrade_to_stable"] = True
                info["note"] = f"У вас alpha/dev сборка. Доступен переход на стабильный релиз v{latest_tag}."
            elif current != latest_tag:
                info["update_available"] = True
    except HTTPException as e:
        info["error"] = e.detail
        info["github_unreachable"] = True
    except Exception as e:
        info["error"] = str(e)
        info["github_unreachable"] = True

    return info

@app.get("/api/mihomo/update/status")
def mihomo_update_status(_: bool = Auth):
    """Текущий статус операции обновления"""
    return _update_status

async def _do_mihomo_update(download_url: str = None, expected_size: int = None,
                             local_path: str = None):
    """Фоновая задача: скачать (или взять локальный файл) → распаковать → backup → заменить → перезапустить.

    теперь поддерживает:
    - `download_url` — скачать с URL (.gz или raw binary)
    - `local_path` — взять локальный файл (после upload через UI, .gz или raw binary)
    Тип содержимого определяется по magic bytes:
    - 0x1f 0x8b → gzip, распаковываем
    - 0x7f 'E' 'L' 'F' → ELF binary, используем как есть
    """
    global _update_status
    try:
        _update_status.update({"running": True, "step": "Подготовка...", "progress": 5,
                               "error": None, "result": None})

        # 1. Получаем файл — либо скачиваем, либо берём локальный
        tmp_raw = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
        tmp_raw_path = tmp_raw.name
        tmp_raw.close()

        if local_path:
            _update_status.update({"step": "Копирование загруженного файла...", "progress": 10})
            if not os.path.isfile(local_path):
                raise Exception(f"Локальный файл не найден: {local_path}")
            shutil.copyfile(local_path, tmp_raw_path)
            try:
                os.remove(local_path)  # очистка
            except Exception:
                pass
        elif download_url:
            _update_status.update({"step": f"Скачивание с {download_url[:60]}...", "progress": 10})
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as s:
                async with s.get(download_url) as r:
                    if r.status != 200:
                        raise Exception(f"Download failed: HTTP {r.status} ({download_url})")
                    total = int(r.headers.get("Content-Length", expected_size or 0))
                    downloaded = 0
                    with open(tmp_raw_path, "wb") as f:
                        async for chunk in r.content.iter_chunked(64 * 1024):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total:
                                _update_status["progress"] = 10 + int(40 * downloaded / total)
        else:
            raise Exception("Нужен либо download_url, либо local_path")

        _update_status.update({"step": "Распознавание формата...", "progress": 50})

        # 2. Определяем — это .gz или сырой ELF?
        with open(tmp_raw_path, "rb") as f:
            magic = f.read(4)

        tmp_bin_path = None
        if magic[:2] == b"\x1f\x8b":
            # gzip — распаковываем
            _update_status.update({"step": "Распаковка gzip...", "progress": 55})
            tmp_bin = tempfile.NamedTemporaryFile(suffix="", delete=False)
            tmp_bin_path = tmp_bin.name
            tmp_bin.close()
            with gzip.open(tmp_raw_path, "rb") as gz_in:
                with open(tmp_bin_path, "wb") as bin_out:
                    shutil.copyfileobj(gz_in, bin_out)
            try: os.remove(tmp_raw_path)
            except: pass
        elif magic[:4] == b"\x7fELF":
            # сырой ELF binary
            _update_status.update({"step": "ELF binary, распаковка не нужна...", "progress": 55})
            tmp_bin_path = tmp_raw_path
        else:
            try: os.remove(tmp_raw_path)
            except: pass
            raise Exception(f"Неподдерживаемый формат файла (magic={magic.hex()}). "
                            f"Ожидается .gz архив или ELF binary.")

        os.chmod(tmp_bin_path, 0o755)

        # 3. Проверка что бинарник работоспособен
        _update_status.update({"step": "Проверка бинаря...", "progress": 65})
        check = run([tmp_bin_path, "-v"], timeout=10)
        if not check["ok"]:
            raise Exception(f"Скачанный бинарь не запускается: {check['stderr']}")

        new_version = None
        m = re.search(r'v(\d+\.\d+\.\d+(?:[-\w.]+)?)', check["stdout"])
        if m:
            new_version = m.group(1)
        else:
            m = re.search(r'(alpha|beta|dev|nightly)-([a-f0-9]{6,})', check["stdout"])
            if m: new_version = f"{m.group(1)}-{m.group(2)}"

        _update_status.update({"step": "Создание backup...", "progress": 70})

        # 4. Backup текущего
        if os.path.exists(MIHOMO_BINARY):
            bak = backup_file(MIHOMO_BINARY)
            _update_status["backup"] = bak

        _update_status.update({"step": "Замена бинаря...", "progress": 80})

        # 5. Остановка mihomo
        run(["systemctl", "stop", "mihomo"], timeout=15)

        # 6. Замена
        shutil.move(tmp_bin_path, MIHOMO_BINARY)
        os.chmod(MIHOMO_BINARY, 0o755)

        _update_status.update({"step": "Запуск mihomo...", "progress": 90})

        # 7. Запуск mihomo
        start = run(["systemctl", "start", "mihomo"], timeout=20)
        if not start["ok"]:
            # Откат
            _update_status.update({"step": "❌ Mihomo не запустился, откат...", "progress": 95})
            if _update_status.get("backup") and os.path.exists(_update_status["backup"]):
                run(["cp", _update_status["backup"], MIHOMO_BINARY])
                run(["systemctl", "start", "mihomo"], timeout=20)
            raise Exception(f"Не удалось запустить mihomo: {start['stderr']}\n\nОткат выполнен.")

        _update_status.update({
            "running": False, "step": "✓ Обновление завершено",
            "progress": 100, "result": {"new_version": new_version}
        })

    except Exception as e:
        _update_status.update({
            "running": False, "step": f"❌ Ошибка: {str(e)[:200]}",
            "progress": 0, "error": str(e)
        })

@app.post("/api/mihomo/update")
async def mihomo_update(_: bool = Auth):
    """Запускает фоновое обновление Mihomo до последней версии"""
    if _update_status["running"]:
        raise HTTPException(409, "Обновление уже запущено")

    info = await mihomo_version(_=True)
    if not info.get("latest_url"):
        raise HTTPException(404, "Не найден подходящий релиз для архитектуры " + info.get("arch", ""))
    if not info.get("update_available"):
        raise HTTPException(400, f"Уже последняя версия: {info.get('current')}")

    # Запуск в фоне
    asyncio.create_task(_do_mihomo_update(download_url=info["latest_url"],
                                          expected_size=info.get("latest_size")))
    return {"ok": True, "started": True, "from": info.get("current"), "to": info.get("latest")}

@app.post("/api/mihomo/update-from-url")
async def mihomo_update_from_url(req: Request, _: bool = Auth):
    """обновление Mihomo по произвольному URL.
    Пользователь даёт ссылку на .gz архив или сырой ELF бинарь.
    Полезно когда github API не находит подходящий asset (новая схема имён,
    proxy блокирует, форк репозитория, и т.д.)."""
    if _update_status["running"]:
        raise HTTPException(409, "Обновление уже запущено")
    body = await req.json()
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "Поле 'url' обязательно")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "URL должен начинаться с http:// или https://")
    asyncio.create_task(_do_mihomo_update(download_url=url))
    return {"ok": True, "started": True, "from_url": url}

@app.post("/api/mihomo/update-from-file")
async def mihomo_update_from_file(file: UploadFile = File(...), _: bool = Auth):
    """обновление Mihomo через загрузку файла.
    Принимает .gz архив или сырой ELF бинарь через multipart/form-data."""
    if _update_status["running"]:
        raise HTTPException(409, "Обновление уже запущено")

    # Сохраняем в temp
    tmp = tempfile.NamedTemporaryFile(suffix="-mihomo-upload", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        with open(tmp_path, "wb") as f:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        try: os.remove(tmp_path)
        except: pass
        raise HTTPException(500, f"Ошибка загрузки: {e}")

    size = os.path.getsize(tmp_path)
    if size < 1024 * 1024:  # < 1 MB — точно не бинарь mihomo
        try: os.remove(tmp_path)
        except: pass
        raise HTTPException(400, f"Файл слишком маленький ({size} байт). "
                            f"Ожидается .gz архив или ELF binary Mihomo.")

    asyncio.create_task(_do_mihomo_update(local_path=tmp_path))
    return {"ok": True, "started": True, "filename": file.filename, "size": size}

# ============================================
# GEO DATABASES UPDATE (v2.206)
# ============================================
# Обновление geosite.dat / geoip.dat / Country.mmdb из github MetaCubeX/meta-rules-dat
# Не требует рестарта Mihomo — он перечитает базы при следующем reload конфига.

GEO_DIR = "/opt/mihomo/geo"
GEO_FILES = {
    "geosite.dat": "https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download/geosite.dat",
    "geoip.dat": "https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download/geoip.dat",
    "Country.mmdb": "https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download/country.mmdb",
}

_geo_update_status = {"running": False, "step": "", "progress": 0, "error": None, "result": None}

def _geo_files_info() -> list[dict]:
    """Возвращает info по каждому geo-файлу: размер, mtime, symlink-цели."""
    out = []
    for fname in GEO_FILES.keys():
        path = os.path.join(GEO_DIR, fname)
        info = {"name": fname, "path": path, "exists": False}
        if os.path.isfile(path):
            try:
                st = os.stat(path)
                info.update({
                    "exists": True,
                    "size": st.st_size,
                    "mtime": int(st.st_mtime),
                    "size_mb": round(st.st_size / 1024 / 1024, 1),
                })
            except Exception:
                pass
        out.append(info)
    return out

@app.get("/api/mihomo/geo/info")
async def geo_info(_: bool = Auth):
    """Информация о текущих geo-базах."""
    return {
        "dir": GEO_DIR,
        "files": _geo_files_info(),
        "source": "github.com/MetaCubeX/meta-rules-dat (latest)",
    }

@app.get("/api/mihomo/geo/update/status")
async def geo_update_status(_: bool = Auth):
    return _geo_update_status

async def _do_geo_update():
    """Скачивает geo-базы во временные файлы, проверяет, заменяет, обновляет symlinks."""
    global _geo_update_status
    _geo_update_status = {"running": True, "step": "Начало...", "progress": 0, "error": None, "result": None}

    try:
        os.makedirs(GEO_DIR, exist_ok=True)
        downloaded = []
        total_files = len(GEO_FILES)

        for i, (fname, url) in enumerate(GEO_FILES.items()):
            _geo_update_status["step"] = f"Скачивание {fname}..."
            _geo_update_status["progress"] = int((i / total_files) * 70)

            tmp_path = os.path.join(GEO_DIR, fname + ".tmp")
            timeout = aiohttp.ClientTimeout(total=120)
            try:
                async with aiohttp.ClientSession(timeout=timeout) as sess:
                    async with sess.get(url) as r:
                        if r.status != 200:
                            raise Exception(f"HTTP {r.status} при скачивании {fname}")
                        size = 0
                        with open(tmp_path, "wb") as f:
                            async for chunk in r.content.iter_chunked(65536):
                                f.write(chunk)
                                size += len(chunk)
                        if size < 1024:
                            raise Exception(f"{fname} слишком маленький ({size} байт) — вероятно ошибка")
                        downloaded.append((fname, tmp_path, size))
            except Exception as e:
                # удалить tmp если есть
                if os.path.exists(tmp_path):
                    try: os.remove(tmp_path)
                    except: pass
                raise Exception(f"Скачивание {fname}: {e}")

        # Бэкап старых + замена
        _geo_update_status["step"] = "Замена файлов..."
        _geo_update_status["progress"] = 80
        ts = time.strftime("%Y%m%d_%H%M%S")
        replaced = []
        for fname, tmp_path, size in downloaded:
            final_path = os.path.join(GEO_DIR, fname)
            # Бэкап существующего
            if os.path.isfile(final_path):
                bak_path = f"{final_path}.bak.{ts}"
                try:
                    _shutil.copy2(final_path, bak_path)
                except Exception as e:
                    print(f"[geo] backup failed for {fname}: {e}")
            # Атомарная замена
            os.replace(tmp_path, final_path)
            try:
                os.chmod(final_path, 0o644)
            except Exception:
                pass
            replaced.append({"name": fname, "size_mb": round(size / 1024 / 1024, 1)})

        # Обновить symlinks в /opt/mihomo/ для mihomo -t (логика как в install.sh шаг 6.geo)
        _geo_update_status["step"] = "Обновление symlinks..."
        _geo_update_status["progress"] = 90
        symlinks = [
            ("geosite.dat", "GeoSite.dat"),
            ("geosite.dat", "geosite.dat"),
            ("geoip.dat", "GeoIP.dat"),
            ("geoip.dat", "geoip.dat"),
            ("Country.mmdb", "Country.mmdb"),
        ]
        for src_name, dest_name in symlinks:
            src = os.path.join(GEO_DIR, src_name)
            dest = os.path.join("/opt/mihomo", dest_name)
            if os.path.isfile(src):
                try:
                    if os.path.islink(dest) or os.path.exists(dest):
                        os.remove(dest)
                    os.symlink(src, dest)
                except (PermissionError, OSError) as e:
                    print(f"[geo] symlink {dest}: {e}")

        # Готово
        _geo_update_status["step"] = "Готово"
        _geo_update_status["progress"] = 100
        _geo_update_status["running"] = False
        _geo_update_status["result"] = {
            "files": replaced,
            "ts": ts,
        }
        print(f"[geo] updated {len(replaced)} files")
    except Exception as e:
        _geo_update_status["running"] = False
        _geo_update_status["error"] = str(e)
        _geo_update_status["step"] = "Ошибка"
        print(f"[geo] update failed: {e}")

@app.post("/api/mihomo/geo/update")
async def geo_update(_: bool = Auth):
    if _geo_update_status.get("running"):
        raise HTTPException(409, "Обновление уже выполняется")
    asyncio.create_task(_do_geo_update())
    return {"ok": True, "started": True}

# ============================================
# VEMIREYA PANEL SELF-UPDATE (через архив или GitHub)
# ============================================
PANEL_VERSION = "2.206.1"
PANEL_INSTALL_DIR = os.environ.get("PANEL_INSTALL_DIR", "/opt/vemitreya")

# Опционально GitHub для апдейтов
GITHUB_REPO = os.environ.get("PANEL_GITHUB_REPO", "")  # например "username/vemitreya"

_panel_update_status = {"running": False, "step": "", "progress": 0, "error": None, "result": None}

@app.get("/api/panel/version")
async def panel_version_info(check: bool = False, _: bool = Auth):
    """Информация о текущей версии панели. С check=true — проверяет GitHub (медленно)."""
    info = {
        "current": PANEL_VERSION,
        "install_dir": PANEL_INSTALL_DIR,
        "github_repo": GITHUB_REPO,
        "latest": None,
        "latest_url": None,
        "update_available": False,
        "checked": check,
    }
    if not GITHUB_REPO:
        info["note"] = ("GitHub repo не настроен. Добавьте в .env строку "
                        "PANEL_GITHUB_REPO=user/repo чтобы включить онлайн-обновления.")
        return info
    if not check:
        return info

    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url) as r:
                if r.status != 200:
                    info["error"] = f"GitHub API HTTP {r.status}"
                    return info
                rel = await r.json()
                tag = rel.get("tag_name", "").lstrip("v")
                info["latest"] = tag
                info["latest_published"] = rel.get("published_at")
                info["release_notes_url"] = rel.get("html_url")
                # Найти zip-архив с панелью
                for asset in rel.get("assets", []):
                    n = asset.get("name", "")
                    if n.endswith(".zip"):
                        info["latest_url"] = asset.get("browser_download_url")
                        info["latest_size"] = asset.get("size")
                        break
                # Если zip не нашли — берём source code
                if not info["latest_url"]:
                    info["latest_url"] = rel.get("zipball_url")
                if tag and tag != PANEL_VERSION:
                    info["update_available"] = True
    except Exception as e:
        info["error"] = str(e)
    return info

@app.get("/api/panel/update/status")
def panel_update_status(_: bool = Auth):
    return _panel_update_status

async def _do_panel_update_from_zip(zip_path: str):
    """Применить обновление из zip-архива.

    Архив должен содержать структуру:
        vemitreya/backend/main.py
        vemitreya/backend/requirements.txt
        vemitreya/frontend/...
    ИЛИ
        backend/main.py
        backend/requirements.txt
        frontend/...
    """
    global _panel_update_status
    import zipfile
    import shutil

    try:
        _panel_update_status.update({"running": True, "step": "Распаковка архива...",
                                     "progress": 10, "error": None, "result": None})

        # Распаковываем во временный каталог
        tmpdir = tempfile.mkdtemp(prefix="vemitreya-update-")
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(tmpdir)

        # Ищем где лежат backend/ и frontend/
        src_root = None
        for root, dirs, files in os.walk(tmpdir):
            if "backend" in dirs and "frontend" in dirs:
                src_root = root
                break
        if not src_root:
            raise Exception("В архиве не найдена структура backend/ + frontend/")

        backend_src = os.path.join(src_root, "backend")
        frontend_src = os.path.join(src_root, "frontend")

        # Проверяем что main.py существует
        if not os.path.exists(os.path.join(backend_src, "main.py")):
            raise Exception("В архиве нет backend/main.py")

        # === Проверка manifest.json (если есть) ===
        manifest_path = os.path.join(src_root, "manifest.json")
        if os.path.exists(manifest_path):
            import hashlib, json as _json
            try:
                with open(manifest_path) as mf:
                    manifest = _json.load(mf)
                mismatches = []
                missing = []
                checked = 0
                for rel_path, expected in manifest.get("files", {}).items():
                    abs_path = os.path.join(src_root, rel_path)
                    if not os.path.exists(abs_path):
                        missing.append(rel_path)
                        continue
                    # expected — "sha256:abc123..."
                    algo, _, exp_hash = expected.partition(":")
                    if algo != "sha256":
                        continue  # пропускаем неизвестные алгоритмы
                    with open(abs_path, "rb") as f:
                        actual_hash = hashlib.sha256(f.read()).hexdigest()
                    if actual_hash != exp_hash:
                        mismatches.append(rel_path)
                    checked += 1
                if mismatches:
                    raise Exception(
                        f"Manifest: SHA256 не совпадает для {len(mismatches)} файлов: "
                        + ", ".join(mismatches[:5])
                    )
                if missing:
                    raise Exception(
                        f"Manifest: отсутствуют {len(missing)} файлов: "
                        + ", ".join(missing[:5])
                    )
                _panel_update_status["step"] = f"Manifest валиден ({checked} файлов)..."
                _panel_update_status["manifest_version"] = manifest.get("version", "?")
            except Exception as e:
                # Если manifest.json повреждён — считаем это ошибкой подписи
                raise Exception(f"Проверка manifest упала: {e}")
        else:
            # Manifest отсутствует — предупреждение в логе, но разрешаем (для совместимости со старыми архивами)
            _panel_update_status["step"] = "WARN: manifest.json отсутствует, проверка SHA256 пропущена"

        _panel_update_status.update({"step": "Создание backup...", "progress": 30})

        # Backup текущих файлов
        backup_dir = os.path.join(PANEL_INSTALL_DIR, "backups",
                                   f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        os.makedirs(backup_dir, exist_ok=True)
        for sub in ["backend", "frontend"]:
            src = os.path.join(PANEL_INSTALL_DIR, sub)
            if os.path.exists(src):
                shutil.copytree(src, os.path.join(backup_dir, sub))
        _panel_update_status["backup_dir"] = backup_dir

        _panel_update_status.update({"step": "Замена файлов...", "progress": 60})

        # Копирование (сохраняя .env, data/, venv/)
        for src_dir, sub in [(backend_src, "backend"), (frontend_src, "frontend")]:
            dst_dir = os.path.join(PANEL_INSTALL_DIR, sub)
            os.makedirs(dst_dir, exist_ok=True)
            for item in os.listdir(src_dir):
                s = os.path.join(src_dir, item)
                d = os.path.join(dst_dir, item)
                if os.path.isdir(s):
                    if os.path.exists(d):
                        shutil.rmtree(d)
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)

        _panel_update_status.update({"step": "Установка зависимостей...", "progress": 75})

        # Pip install (если изменились)
        venv_pip = os.path.join(PANEL_INSTALL_DIR, "venv/bin/pip")
        req_file = os.path.join(PANEL_INSTALL_DIR, "backend/requirements.txt")
        if os.path.exists(venv_pip) and os.path.exists(req_file):
            run([venv_pip, "install", "-q", "-r", req_file], timeout=120)

        # Чистим временное
        try: shutil.rmtree(tmpdir)
        except: pass
        try: os.remove(zip_path)
        except: pass

        _panel_update_status.update({"step": "✓ Обновление применено. Перезапуск...", "progress": 95})

        # Запланируем рестарт через 1 секунду (чтобы успеть отдать ответ клиенту)
        async def delayed_restart():
            await asyncio.sleep(1.5)
            run(["systemctl", "restart", "vemitreya"])
        asyncio.create_task(delayed_restart())

        _panel_update_status.update({
            "running": False, "step": "✓ Готово, идёт перезапуск сервиса",
            "progress": 100, "result": {"backup_dir": backup_dir}
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        _panel_update_status.update({
            "running": False, "step": f"❌ {str(e)[:200]}",
            "progress": 0, "error": str(e)
        })

@app.post("/api/panel/update/upload")
async def panel_update_upload(file: UploadFile = File(...), _: bool = Auth):
    """Загрузка zip-архива для обновления панели"""
    if _panel_update_status["running"]:
        raise HTTPException(409, "Обновление уже выполняется")
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "Ожидается .zip архив")

    # Сохраняем во временный
    upload_dir = os.path.join(PANEL_INSTALL_DIR, "tmp")
    os.makedirs(upload_dir, exist_ok=True)
    tmp_path = os.path.join(upload_dir, f"upload-{int(datetime.now().timestamp())}.zip")
    size = 0
    with open(tmp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            f.write(chunk)
    if size == 0:
        os.remove(tmp_path)
        raise HTTPException(400, "Пустой файл")

    # Запускаем фоновое обновление
    asyncio.create_task(_do_panel_update_from_zip(tmp_path))
    return {"ok": True, "started": True, "size": size}

@app.post("/api/panel/update/from-github")
async def panel_update_from_github(_: bool = Auth):
    """Обновление панели с GitHub releases"""
    if _panel_update_status["running"]:
        raise HTTPException(409, "Обновление уже выполняется")
    if not GITHUB_REPO:
        raise HTTPException(400, "GitHub repo не настроен в .env")

    info = await panel_version_info(_=True)
    if not info.get("latest_url"):
        raise HTTPException(404, "Не найден архив в последнем релизе")
    if not info.get("update_available"):
        raise HTTPException(400, f"Уже последняя версия: {info['current']}")

    # Скачиваем zip
    upload_dir = os.path.join(PANEL_INSTALL_DIR, "tmp")
    os.makedirs(upload_dir, exist_ok=True)
    tmp_path = os.path.join(upload_dir, f"github-{int(datetime.now().timestamp())}.zip")

    _panel_update_status.update({"running": True, "step": "Скачивание с GitHub...",
                                 "progress": 5, "error": None})
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as s:
            async with s.get(info["latest_url"]) as r:
                if r.status != 200:
                    raise Exception(f"HTTP {r.status}")
                with open(tmp_path, "wb") as f:
                    async for chunk in r.content.iter_chunked(64*1024):
                        f.write(chunk)
    except Exception as e:
        _panel_update_status.update({"running": False, "error": str(e), "step": f"❌ {e}"})
        raise HTTPException(502, f"Скачивание: {e}")

    # Применяем
    asyncio.create_task(_do_panel_update_from_zip(tmp_path))
    return {"ok": True, "started": True, "from": info["current"], "to": info["latest"]}

@app.get("/api/panel/backups")
def panel_list_backups(_: bool = Auth):
    """Список доступных backup'ов панели"""
    backups_dir = os.path.join(PANEL_INSTALL_DIR, "backups")
    if not os.path.isdir(backups_dir):
        return []
    items = []
    for name in sorted(os.listdir(backups_dir), reverse=True):
        path = os.path.join(backups_dir, name)
        if os.path.isdir(path):
            stat = os.stat(path)
            items.append({
                "name": name,
                "path": path,
                "created": stat.st_ctime,
                "size_mb": round(sum(
                    os.path.getsize(os.path.join(dp, f))
                    for dp, _, files in os.walk(path)
                    for f in files
                ) / (1024*1024), 2)
            })
    return items[:20]  # последние 20

# ============================================
# PROXY PROVIDERS (subscriptions)
# ============================================
def _ruamel_to_plain(obj):
    """Глубокая конвертация ruamel.yaml CommentedMap/Seq в обычные dict/list для JSON"""
    if hasattr(obj, 'items'):
        return {str(k): _ruamel_to_plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)) or (hasattr(obj, '__iter__') and not isinstance(obj, (str, bytes))):
        try:
            return [_ruamel_to_plain(x) for x in obj]
        except TypeError:
            return obj
    return obj

@app.get("/api/mihomo/providers")
def providers_list(_: bool = Auth):
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Failed to read config: {e}")

    providers = cfg.get("proxy-providers") or {}
    result = []
    for name, p in providers.items():
        plain = _ruamel_to_plain(p) if hasattr(p, 'items') else {}
        hc = plain.get("health-check")
        result.append({
            "name": str(name),
            "type": plain.get("type", "http"),
            "url": plain.get("url", ""),
            "interval": plain.get("interval", 3600),
            "path": plain.get("path", ""),
            "health_check": hc if hc else None,
            "proxy": plain.get("proxy"),
        })
    return result

@app.post("/api/mihomo/providers")
async def providers_create(data: ProxyProvider, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("proxy-providers") is None:
        cfg["proxy-providers"] = {}
    providers = cfg["proxy-providers"]

    if data.name in providers:
        raise HTTPException(409, f"Provider '{data.name}' already exists")

    new_p = {
        "type": data.type,
        "url": data.url,
        "interval": data.interval,
        "path": data.path or f"./providers/{data.name}.yaml",
    }
    if data.health_check:
        new_p["health-check"] = data.health_check

    providers[data.name] = new_p

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup}

@app.put("/api/mihomo/providers/{name:path}")
async def providers_update(name: str, data: ProxyProvider, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    providers = cfg.get("proxy-providers") or {}
    if name not in providers:
        raise HTTPException(404, f"Provider '{name}' not found")

    old_p = dict(providers[name]) if hasattr(providers[name], 'items') else {}
    old_url = old_p.get("url", "")
    old_path = old_p.get("path", "")

    p = providers[name]
    p["type"] = data.type
    p["url"] = data.url
    p["interval"] = data.interval
    if data.path:
        p["path"] = data.path
    if data.health_check:
        p["health-check"] = data.health_check

    if data.name != name:
        providers[data.name] = p
        del providers[name]

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)

    # КРИТИЧНО: если URL изменился — удалить кешированный файл,
    # иначе Mihomo продолжит использовать старые прокси из кеша
    url_changed = data.url != old_url
    cache_deleted = None
    if url_changed and old_path:
        cache_path = old_path
        # Относительные пути — от рабочей директории Mihomo
        if not os.path.isabs(cache_path):
            cache_path = os.path.join("/opt/mihomo", cache_path)
        if os.path.exists(cache_path):
            try:
                os.remove(cache_path)
                cache_deleted = cache_path
            except Exception as e:
                print(f"[providers] Failed to delete cache {cache_path}: {e}")

    await reload_mihomo()

    # Принудительное обновление через API (если URL изменился)
    refreshed = False
    if url_changed:
        try:
            await asyncio.sleep(0.5)  # дать Mihomo время перечитать конфиг
            encoded = urllib.parse.quote(data.name, safe='')
            await mihomo("PUT", f"/providers/proxies/{encoded}")
            refreshed = True
        except Exception as e:
            print(f"[providers] Auto-refresh failed: {e}")

    return {
        "ok": True, "backup": backup,
        "url_changed": url_changed,
        "cache_deleted": cache_deleted,
        "refreshed": refreshed
    }

@app.delete("/api/mihomo/providers/{name:path}")
async def providers_delete(name: str, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    providers = cfg.get("proxy-providers") or {}
    if name not in providers:
        raise HTTPException(404, f"Provider '{name}' not found")
    del providers[name]

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup}

@app.post("/api/mihomo/providers/{name}/refresh")
async def providers_refresh(name: str, clear_cache: bool = False, _: bool = Auth):
    """
    Обновить провайдер. При clear_cache=true удалит кешированный файл
    (нужно когда URL был изменён вне панели).
    """
    result = {"ok": True}
    if clear_cache:
        cfg = yaml_load(MIHOMO_CONFIG)
        providers = cfg.get("proxy-providers") or {}
        if name in providers:
            p = dict(providers[name]) if hasattr(providers[name], 'items') else {}
            path = p.get("path", "")
            if path:
                if not os.path.isabs(path):
                    path = os.path.join("/opt/mihomo", path)
                if os.path.exists(path):
                    try:
                        os.remove(path)
                        result["cache_deleted"] = path
                        await reload_mihomo()
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        result["cache_error"] = str(e)
    try:
        encoded = urllib.parse.quote(name, safe='')
        await mihomo("PUT", f"/providers/proxies/{encoded}")
        result["refreshed"] = True
    except HTTPException as e:
        if e.status_code == 404:
            try:
                await reload_mihomo()
                await asyncio.sleep(1)
                await mihomo("PUT", f"/providers/proxies/{encoded}")
                result["refreshed"] = True
                result["note"] = "Mihomo был перезагружен, чтобы подхватить новый провайдер"
            except Exception as e2:
                raise HTTPException(404,
                    f"Провайдер '{name}' не загружен в runtime Mihomo. "
                    f"Сделайте restart mihomo-сервиса. Детали: {e2}")
        elif e.status_code in (502, 503):
            # Mihomo не смог скачать подписку — раскручиваем причину
            detail_str = str(e.detail) if e.detail else ""
            if "EOF" in detail_str or "connection" in detail_str.lower() or "timeout" in detail_str.lower():
                raise HTTPException(502,
                    f"Подписка '{name}' недоступна: сервер провайдера не отвечает (EOF/timeout). "
                    f"Возможно URL устарел или провайдер временно лежит. Попробуйте позже или замените URL.")
            if "no such host" in detail_str.lower() or "lookup" in detail_str.lower():
                raise HTTPException(502,
                    f"Подписка '{name}': домен не разрешается. Проверьте URL провайдера.")
            if "401" in detail_str or "403" in detail_str or "unauthorized" in detail_str.lower():
                raise HTTPException(401,
                    f"Подписка '{name}': требуется авторизация (URL/токен невалидны).")
            raise HTTPException(502,
                f"Подписка '{name}' не обновилась: {detail_str[:200]}")
        else:
            raise
    except Exception as e:
        raise HTTPException(500, f"Refresh failed: {e}")
    return result

@app.post("/api/mihomo/providers/test-url")
async def providers_test_url(data: dict, _: bool = Auth):
    """
    Проверить URL подписки до её добавления в Mihomo.
    Принимает {url: ..., timeout: 10}, возвращает доступность и формат содержимого.
    """
    url = data.get("url", "").strip()
    timeout = int(data.get("timeout", 10))
    if not url:
        raise HTTPException(400, "url обязателен")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL должен начинаться с http:// или https://")

    result = {"url": url, "ok": False, "error": None, "format": None,
              "size": 0, "proxy_count": 0, "status": None}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as s:
            async with s.get(url, allow_redirects=True) as r:
                result["status"] = r.status
                if r.status >= 400:
                    result["error"] = f"HTTP {r.status} {r.reason}"
                    return result
                content = await r.read()
                result["size"] = len(content)
                if not content:
                    result["error"] = "Пустой ответ"
                    return result

                text = content.decode("utf-8", errors="replace")[:200000]

                # Попытка распарсить как YAML с proxies
                try:
                    parsed = yaml_load_str(text) if hasattr(globals(), 'yaml_load_str') else None
                    if parsed is None:
                        # ручной парсинг через ruamel
                        from ruamel.yaml import YAML
                        y = YAML(typ='safe')
                        parsed = y.load(text)
                    if isinstance(parsed, dict) and isinstance(parsed.get("proxies"), list):
                        result["format"] = "clash-yaml"
                        result["proxy_count"] = len(parsed["proxies"])
                        result["ok"] = True
                        return result
                except Exception:
                    pass

                # base64-encoded subscription (v2ray-style)
                import base64 as _b64
                _PROTO = ("vless://", "vmess://", "trojan://", "ss://",
                          "hysteria2://", "hy2://", "hysteria://", "tuic://")
                try:
                    decoded = _b64.b64decode(text.strip(), validate=False).decode("utf-8", errors="ignore")
                    if any(p in decoded for p in _PROTO):
                        lines = [ln for ln in decoded.splitlines() if "://" in ln]
                        has_hy2 = any(("hysteria2://" in ln or "hy2://" in ln) for ln in lines)
                        result["format"] = "hysteria2-base64" if has_hy2 else "v2ray-base64"
                        result["proxy_count"] = len(lines)
                        result["ok"] = True
                        return result
                except Exception:
                    pass

                # Plain text (vless://... hysteria2://... и т.д.)
                if any(p in text for p in _PROTO):
                    lines = [ln for ln in text.splitlines() if "://" in ln]
                    has_hy2 = any(("hysteria2://" in ln or "hy2://" in ln) for ln in lines)
                    result["format"] = "hysteria2-plain" if has_hy2 else "v2ray-plain"
                    result["proxy_count"] = len(lines)
                    result["ok"] = True
                    return result

                # Одиночная hy2:// ссылка прямо в URL (без подписки-обёртки)
                if url.startswith(("hy2://", "hysteria2://")):
                    result["format"] = "hysteria2-single"
                    result["proxy_count"] = 1
                    result["ok"] = True
                    return result

                result["error"] = ("Формат не распознан как Clash YAML, base64, v2ray/hysteria2. "
                                   "Mihomo может не понять эту подписку (будет COMPATIBLE).")
    except asyncio.TimeoutError:
        result["error"] = f"Timeout {timeout}с — сервер не отвечает"
    except aiohttp.ClientConnectorError as e:
        result["error"] = f"Не удалось подключиться: {str(e)[:150]}"
    except aiohttp.ServerDisconnectedError:
        result["error"] = "Сервер закрыл соединение (EOF)"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)[:150]}"
    return result


# ============================================
# PROXY GROUPS CRUD
# ============================================
class ProxyGroupModel(BaseModel):
    name: str
    type: str = "select"  # select, url-test, fallback, load-balance
    proxies: Optional[List[str]] = None
    use: Optional[List[str]] = None
    filter: Optional[str] = None  # regex-фильтр серверов внутри use
    url: Optional[str] = None
    interval: Optional[int] = None
    tolerance: Optional[int] = None
    lazy: Optional[bool] = None
    icon: Optional[str] = None

@app.get("/api/mihomo/proxy-groups")
def proxy_groups_list(_: bool = Auth):
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось прочитать конфиг: {e}")

    raw_groups = cfg.get("proxy-groups")
    if raw_groups is None:
        return []

    result = []
    errors = []
    for i, g in enumerate(raw_groups):
        try:
            # Конвертируем ruamel-объект в плоский dict
            if hasattr(g, 'items'):
                plain = {k: g[k] for k in g}
            elif isinstance(g, dict):
                plain = dict(g)
            else:
                errors.append(f"group #{i}: unexpected type {type(g).__name__}")
                continue

            # Принудительно строки/числа без ruamel-обёрток
            def _to_str_list(v):
                if v is None: return []
                try: return [str(x) for x in v]
                except Exception: return []

            result.append({
                "name": str(plain.get("name", "")),
                "type": str(plain.get("type", "select")),
                "proxies": _to_str_list(plain.get("proxies")),
                "use": _to_str_list(plain.get("use")),
                "filter": str(plain.get("filter")) if plain.get("filter") is not None else None,
                "url": str(plain.get("url")) if plain.get("url") is not None else None,
                "interval": int(plain.get("interval")) if plain.get("interval") is not None else None,
                "tolerance": int(plain.get("tolerance")) if plain.get("tolerance") is not None else None,
                "lazy": bool(plain.get("lazy")) if plain.get("lazy") is not None else None,
                "icon": str(plain.get("icon")) if plain.get("icon") is not None else None,
            })
        except Exception as e:
            errors.append(f"group #{i} ({g.get('name', '?') if hasattr(g, 'get') else '?'}): {e}")

    if errors:
        print(f"[proxy_groups_list] errors:\n  " + "\n  ".join(errors))

    return result

@app.get("/api/mihomo/proxy-groups/available-proxies")
async def proxy_groups_available(_: bool = Auth):
    """Список возможных членов группы: другие группы + proxies + DIRECT/REJECT +
    отдельные прокси внутри каждого провайдера (из Mihomo runtime),
    чтобы можно было добавить в канал конкретный сервер из подписки."""
    cfg = yaml_load(MIHOMO_CONFIG)
    groups = [str(g.get("name")) for g in (cfg.get("proxy-groups") or []) if g.get("name")]
    proxies = [str(p.get("name")) for p in (cfg.get("proxies") or []) if p.get("name")]
    providers = list((cfg.get("proxy-providers") or {}).keys())

    # Прокси внутри провайдеров — из runtime Mihomo API
    provider_proxies = {}
    try:
        data = await mihomo("GET", "/providers/proxies")
        all_p = (data or {}).get("providers", {})
        for pname in providers:
            entry = all_p.get(pname) or {}
            members = entry.get("proxies") or []
            names = [m.get("name") for m in members if isinstance(m, dict) and m.get("name")]
            if names:
                provider_proxies[pname] = names
    except Exception:
        pass  # Mihomo недоступен — вернём без provider_proxies

    return {
        "groups": groups,
        "proxies": proxies,
        "providers": providers,
        "provider_proxies": provider_proxies,
        "specials": ["DIRECT", "REJECT"]
    }

@app.post("/api/mihomo/proxy-groups")
async def proxy_groups_create(data: ProxyGroupModel, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("proxy-groups") is None:
        cfg["proxy-groups"] = []
    groups = cfg["proxy-groups"]

    # Проверка уникальности имени
    for g in groups:
        if str(g.get("name")) == data.name:
            raise HTTPException(409, f"Group '{data.name}' already exists")

    # Нормализуем входные массивы
    proxies = [p for p in (data.proxies or []) if p and str(p).strip()]
    use = [u for u in (data.use or []) if u and str(u).strip()]
    if not proxies and not use:
        raise HTTPException(400, "Группа должна содержать proxies или use (хотя бы что-то одно)")

    new_g = {"name": data.name, "type": data.type}
    if proxies: new_g["proxies"] = proxies
    if use: new_g["use"] = use
    if data.filter and data.filter.strip(): new_g["filter"] = data.filter.strip()
    if data.type in ("url-test", "fallback", "load-balance"):
        if data.url: new_g["url"] = data.url
        else: new_g["url"] = "http://www.gstatic.com/generate_204"
        if data.interval: new_g["interval"] = data.interval
        else: new_g["interval"] = 300
        if data.type == "url-test" and data.tolerance:
            new_g["tolerance"] = data.tolerance
    if data.lazy is not None: new_g["lazy"] = data.lazy
    if data.icon: new_g["icon"] = data.icon

    groups.append(new_g)

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup}

@app.put("/api/mihomo/proxy-groups/{name:path}")
async def proxy_groups_update(name: str, data: ProxyGroupModel, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    groups = cfg.get("proxy-groups") or []

    idx = next((i for i, g in enumerate(groups) if str(g.get("name")) == name), -1)
    if idx < 0:
        raise HTTPException(404, f"Group '{name}' not found")

    # Нормализуем входные массивы (фильтруем пустые/None строки)
    proxies = [p for p in (data.proxies or []) if p and str(p).strip()] if data.proxies is not None else None
    use = [u for u in (data.use or []) if u and str(u).strip()] if data.use is not None else None

    # Защита: группа без членов = ошибка (раньше получалось use: [] которое ломало mihomo)
    final_proxies = proxies if proxies is not None else groups[idx].get("proxies", [])
    final_use = use if use is not None else groups[idx].get("use", [])
    if not final_proxies and not final_use:
        raise HTTPException(400,
            "Группа не может быть пустой. Должен быть хотя бы один прокси (proxies) или подписка (use). "
            "Если это routing-группа — добавьте DIRECT или REJECT.")

    g = groups[idx]
    g["name"] = data.name
    g["type"] = data.type

    # proxies: пустой список → удалить поле (НЕ записывать [])
    if proxies is not None:
        if proxies:
            g["proxies"] = proxies
        elif "proxies" in g:
            del g["proxies"]

    # use: пустой список → удалить поле (НЕ записывать [])
    if use is not None:
        if use:
            g["use"] = use
        elif "use" in g:
            del g["use"]

    # filter — regex серверов внутри use
    if data.filter is not None:
        if data.filter.strip():
            g["filter"] = data.filter.strip()
        elif "filter" in g:
            del g["filter"]

    if data.type in ("url-test", "fallback", "load-balance"):
        g["url"] = data.url or "http://www.gstatic.com/generate_204"
        g["interval"] = data.interval or 300
        if data.type == "url-test":
            if data.tolerance: g["tolerance"] = data.tolerance
            elif "tolerance" in g: del g["tolerance"]
    else:
        for k in ("url", "interval", "tolerance"):
            if k in g: del g[k]

    if data.lazy is not None: g["lazy"] = data.lazy
    if data.icon: g["icon"] = data.icon

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup}

@app.delete("/api/mihomo/proxy-groups/{name:path}")
async def proxy_groups_delete(name: str, force: bool = False, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    groups = cfg.get("proxy-groups") or []

    idx = next((i for i, g in enumerate(groups) if str(g.get("name")) == name), -1)
    if idx < 0:
        raise HTTPException(404, f"Group '{name}' not found")

    # Проверка что группа не используется в правилах и других группах
    usage = []
    rule_refs = []
    group_refs = []
    for r in (cfg.get("rules") or []):
        if name in str(r):
            usage.append(f"rule: {r}")
            rule_refs.append(r)
    for g in groups:
        if g is groups[idx]: continue
        if name in (g.get("proxies") or []):
            usage.append(f"group '{g.get('name')}' references it")
            group_refs.append(g)

    if usage and not force:
        # вернём детали чтобы фронт мог предложить force-удаление
        raise HTTPException(409, f"Group is in use: {'; '.join(usage[:3])}")

    # force=true — вычищаем ссылки на группу из других групп и правил
    cleaned_refs = []
    if force:
        for g in group_refs:
            g["proxies"] = [p for p in (g.get("proxies") or []) if p != name]
            cleaned_refs.append(f"группа '{g.get('name')}'")
            # Если группа осталась без членов — добавим DIRECT чтобы не сломать Mihomo
            if not g.get("proxies") and not g.get("use"):
                g["proxies"] = ["DIRECT"]
        if rule_refs:
            new_rules = []
            for r in (cfg.get("rules") or []):
                # Удаляем правила, целью которых была эта группа.
                # Правило MATCH,name или TYPE,val,name — проверяем последний сегмент (target)
                parts = str(r).split(",")
                target = parts[-1].strip() if parts else ""
                if target == name:
                    cleaned_refs.append(f"правило '{r}'")
                    continue
                new_rules.append(r)
            cfg["rules"] = new_rules

    # Запоминаем что было в `use:` — это могут быть orphan provider-файлы
    deleted_uses = list(groups[idx].get("use") or [])
    del groups[idx]

    # Подчищаем orphan provider-файлы:
    # если провайдер использовался только в этой группе И его нет в proxy-providers конфига,
    # значит это битая ссылка — удаляем файл из /opt/mihomo/providers/
    cleaned_files = []
    if deleted_uses:
        # Какие провайдеры всё ещё используются другими группами
        still_used = set()
        for g in groups:
            for u in (g.get("use") or []):
                still_used.add(str(u))
        # Какие провайдеры есть в конфиге
        configured = set(str(k) for k in (cfg.get("proxy-providers") or {}).keys())

        providers_dir = os.path.join(os.path.dirname(MIHOMO_CONFIG), "..", "providers")
        providers_dir = os.path.normpath(providers_dir)
        if not os.path.isdir(providers_dir):
            # альтернативный путь
            providers_dir = "/opt/mihomo/providers"

        for u in deleted_uses:
            if u in still_used or u in configured:
                continue
            # Это orphan — попробуем удалить файл
            for candidate in [u, u.lower(), u.replace(" ", "-"), u.replace(" ", "_"),
                              u.replace(" (", "-").replace(")", ""),
                              u.replace(" (", "_").replace(")", "")]:
                for ext in [".yaml", ".yml"]:
                    fp = os.path.join(providers_dir, candidate + ext)
                    if os.path.isfile(fp):
                        try:
                            os.remove(fp)
                            cleaned_files.append(fp)
                        except Exception:
                            pass
            # Точное имя как в YAML (с пробелами) тоже пробуем
            fp_exact = os.path.join(providers_dir, u + ".yaml")
            if os.path.isfile(fp_exact):
                try:
                    os.remove(fp_exact)
                    cleaned_files.append(fp_exact)
                except Exception:
                    pass

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup, "cleaned_orphan_files": cleaned_files,
            "cleaned_refs": cleaned_refs}

@app.get("/api/mihomo/config/validate")
async def mihomo_config_validate(_: bool = Auth):
    """Полная валидация текущего config.yaml — ищет проблемы которые ломают mihomo при старте."""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        return {"valid": False, "errors": [f"YAML parse error: {e}"], "warnings": []}

    errors = []
    warnings = []
    info = []

    groups = cfg.get("proxy-groups") or []
    proxies = cfg.get("proxies") or []
    providers = cfg.get("proxy-providers") or {}
    rules = cfg.get("rules") or []

    proxy_names = set(str(p.get("name")) for p in proxies if p.get("name"))
    group_names = set(str(g.get("name")) for g in groups if g.get("name"))
    provider_names = set(str(k) for k in providers.keys())
    SPECIALS = {"DIRECT", "REJECT", "PASS", "GLOBAL"}

    for g in groups:
        gname = str(g.get("name", ""))
        if not gname:
            errors.append(f"Group без name: {g}")
            continue
        g_proxies = list(g.get("proxies") or [])
        g_use = list(g.get("use") or [])
        if not g_proxies and not g_use:
            errors.append(f"Группа '{gname}': пустая (нет proxies, нет use). Mihomo не запустится.")
            continue
        if "use" in g and g.get("use") == []:
            warnings.append(f"Группа '{gname}': имеет 'use: []' — лучше удалить это поле")
        for p in g_proxies:
            ps = str(p)
            if ps in SPECIALS: continue
            if ps not in proxy_names and ps not in group_names:
                errors.append(f"Группа '{gname}': '{ps}' не найден ни в proxies ни в proxy-groups")
        for u in g_use:
            us = str(u)
            if us not in provider_names:
                errors.append(f"Группа '{gname}': провайдер '{us}' не найден в proxy-providers")

    for i, r in enumerate(rules):
        rs = str(r).strip()
        # Пустое или мусорное правило
        if not rs:
            errors.append(f"Rule #{i}: пустое правило")
            continue
        # Заканчивается запятой → пустой target (как 'MATCH,')
        if rs.endswith(","):
            errors.append(f"Rule #{i}: '{rs}' заканчивается запятой — пустой target. Нужно 'MATCH,DIRECT' или подобное.")
            continue
        parts = rs.split(",")
        if len(parts) < 2:
            errors.append(f"Rule #{i}: '{rs}' слишком короткое")
            continue
        # Пустые элементы между запятыми
        if any(not p.strip() for p in parts):
            errors.append(f"Rule #{i}: '{rs}' содержит пустые элементы между запятыми")
            continue
        target = parts[-1].strip()
        if target.startswith("no-resolve") and len(parts) >= 3:
            target = parts[-2].strip()
        if target in SPECIALS: continue
        if target not in proxy_names and target not in group_names:
            errors.append(f"Rule #{i}: target '{target}' не найден")

    providers_dir = "/opt/mihomo/providers"
    if os.path.isdir(providers_dir):
        for fname in os.listdir(providers_dir):
            if not fname.endswith((".yaml", ".yml")): continue
            base = fname.rsplit(".", 1)[0]
            in_config = False
            for pname, pcfg in providers.items():
                ppath = str(pcfg.get("path", "")) if isinstance(pcfg, dict) else ""
                if ppath and os.path.basename(ppath) == fname:
                    in_config = True; break
                if str(pname) == base:
                    in_config = True; break
            if not in_config:
                warnings.append(f"Orphan provider-файл: providers/{fname} (не упомянут в proxy-providers)")

    info.append(f"Групп: {len(groups)}, прокси: {len(proxies)}, провайдеров: {len(providers)}, правил: {len(rules)}")
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings, "info": info}

@app.get("/api/mihomo/providers/orphan")
async def mihomo_providers_orphan(_: bool = Auth):
    """Список файлов в /opt/mihomo/providers/ которые не привязаны ни к одному провайдеру."""
    cfg = yaml_load(MIHOMO_CONFIG)
    providers = cfg.get("proxy-providers") or {}
    referenced_paths = set()
    for pname, pcfg in providers.items():
        if isinstance(pcfg, dict):
            p = str(pcfg.get("path", ""))
            if p: referenced_paths.add(os.path.basename(p))

    providers_dir = "/opt/mihomo/providers"
    if not os.path.isdir(providers_dir): return []

    orphans = []
    for fname in os.listdir(providers_dir):
        if not fname.endswith((".yaml", ".yml")): continue
        if fname not in referenced_paths and fname.replace(".yaml", "").replace(".yml", "") not in providers:
            full = os.path.join(providers_dir, fname)
            try:
                stat = os.stat(full)
                orphans.append({"name": fname, "path": full, "size": stat.st_size, "mtime": stat.st_mtime})
            except Exception: pass
    return sorted(orphans, key=lambda x: -x["mtime"])

@app.delete("/api/mihomo/providers/orphan/{filename:path}")
async def mihomo_providers_orphan_delete(filename: str, _: bool = Auth):
    """Удалить orphan provider-файл вручную из UI."""
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    full = os.path.join("/opt/mihomo/providers", filename)
    if not os.path.isfile(full):
        raise HTTPException(404, "File not found")
    cfg = yaml_load(MIHOMO_CONFIG)
    providers = cfg.get("proxy-providers") or {}
    for pname, pcfg in providers.items():
        if isinstance(pcfg, dict):
            p = str(pcfg.get("path", ""))
            if p and os.path.basename(p) == filename:
                raise HTTPException(409, f"Файл используется провайдером '{pname}'")
    os.remove(full)
    return {"ok": True, "deleted": full}

# ============================================
# MIHOMO PROXIES — add/remove single proxies (for TrustTunnel integration)
# ============================================
class MihomoProxyAdd(BaseModel):
    name: str
    type: str  # socks5, http, ss, vless, trojan, ...
    server: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    # Дополнительные опции (сырой dict, для редких случаев)
    extra: Optional[dict] = None
    # Группы, в которые добавить прокси
    add_to_groups: Optional[List[str]] = None

def _get_mihomo_proxy(cfg, name):
    """Находит прокси по имени, возвращает (index, proxy) или (None, None)"""
    proxies = cfg.get("proxies") or []
    for i, p in enumerate(proxies):
        if str(p.get("name")) == name:
            return i, p
    return None, None

@app.get("/api/mihomo/proxies/list")
def mihomo_proxies_list(_: bool = Auth):
    """Все прокси из секции proxies:"""
    cfg = yaml_load(MIHOMO_CONFIG)
    proxies = cfg.get("proxies") or []
    result = []
    for p in proxies:
        plain = dict(p) if hasattr(p, 'items') else {}
        result.append({
            "name": str(plain.get("name", "")),
            "type": str(plain.get("type", "")),
            "server": str(plain.get("server", "")),
            "port": plain.get("port"),
        })
    return result

@app.post("/api/mihomo/proxies")
async def mihomo_proxy_add(data: MihomoProxyAdd, _: bool = Auth):
    """Добавить прокси в секцию proxies и опционально в группы"""
    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("proxies") is None:
        cfg["proxies"] = []
    proxies = cfg["proxies"]

    # Проверка что имени нет
    for p in proxies:
        if str(p.get("name")) == data.name:
            raise HTTPException(409, f"Proxy '{data.name}' already exists")

    new_p = {
        "name": data.name,
        "type": data.type,
        "server": data.server,
        "port": data.port,
    }
    if data.username: new_p["username"] = data.username
    if data.password: new_p["password"] = data.password
    if data.extra:
        for k, v in data.extra.items():
            if k not in new_p:
                new_p[k] = v

    proxies.append(new_p)

    # Добавить в группы
    added_to = []
    if data.add_to_groups:
        groups = cfg.get("proxy-groups") or []
        for group in groups:
            gname = str(group.get("name", ""))
            if gname in data.add_to_groups:
                if group.get("proxies") is None:
                    group["proxies"] = []
                if data.name not in group["proxies"]:
                    group["proxies"].append(data.name)
                    added_to.append(gname)

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup, "added_to_groups": added_to}

@app.delete("/api/mihomo/proxies/{name:path}")
async def mihomo_proxy_delete(name: str, _: bool = Auth):
    """Удалить прокси из proxies и из всех групп"""
    cfg = yaml_load(MIHOMO_CONFIG)
    idx, _p = _get_mihomo_proxy(cfg, name)
    if idx is None:
        raise HTTPException(404, f"Proxy '{name}' not found")

    del cfg["proxies"][idx]

    # Удалить из всех групп
    removed_from = []
    for g in (cfg.get("proxy-groups") or []):
        ps = g.get("proxies") or []
        if name in ps:
            g["proxies"] = [x for x in ps if x != name]
            removed_from.append(str(g.get("name")))

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "backup": backup, "removed_from_groups": removed_from}

# ============================================
# AWG → MIHOMO INTEGRATION
# ============================================
# AWG туннель уже поднят на уровне ОС (awg-quick@name).
# В Mihomo добавляем простой type: direct прокси, который
# отправляет трафик через интерфейс awg<name> с routing-mark.
# Это НЕ создаёт отдельный wireguard клиент в Mihomo,
# а использует существующий системный туннель.

def _default_awg_proxy_name(awg_name: str) -> str:
    """Имя для AWG прокси в Mihomo по умолчанию"""
    return f"🔒 {awg_name.upper()} (AWG)"

def _find_mihomo_proxy_by_interface(cfg, interface: str) -> Optional[str]:
    """Ищет direct прокси с заданным interface, возвращает имя или None"""
    if not interface: return None
    for p in (cfg.get("proxies") or []):
        plain = dict(p) if hasattr(p, 'items') else {}
        if plain.get("type") == "direct" and str(plain.get("interface", "")) == interface:
            return str(plain.get("name", ""))
    return None

async def _register_awg_in_mihomo(proxy_name: str, interface: str,
                                   routing_mark: int = 51820,
                                   groups_to_add: Optional[List[str]] = None):
    """Добавляет direct-прокси через AWG интерфейс в Mihomo + опционально в группы"""
    if not interface:
        raise HTTPException(400, "Не указан интерфейс AWG туннеля")

    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("proxies") is None:
        cfg["proxies"] = []
    proxies = cfg["proxies"]

    # Проверка на дубликат по имени
    for p in proxies:
        if str(p.get("name")) == proxy_name:
            raise HTTPException(409, f"Прокси '{proxy_name}' уже существует в Mihomo")

    # Собираем direct-прокси через интерфейс
    new_proxy = {
        "name": proxy_name,
        "type": "direct",
        "interface": interface,
    }
    if routing_mark:
        new_proxy["routing-mark"] = routing_mark

    proxies.append(new_proxy)

    # Добавить в группы
    added_to = []
    if groups_to_add:
        groups = cfg.get("proxy-groups") or []
        for g in groups:
            if str(g.get("name")) in groups_to_add:
                if g.get("proxies") is None:
                    g["proxies"] = []
                if proxy_name not in g["proxies"]:
                    g["proxies"].append(proxy_name)
                    added_to.append(str(g.get("name")))

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"backup": backup, "added_to_groups": added_to}

def _unregister_awg_from_mihomo_by_interface(interface: str):
    """Удаляет direct-прокси для этого интерфейса + ссылки в группах.

    Также делает reload Mihomo чтобы изменения сразу применились.
    """
    if not interface: return None
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        print(f"[awg unregister] yaml_load failed: {e}", flush=True)
        return None

    removed_names = []
    proxies = cfg.get("proxies") or []
    kept = []
    for p in proxies:
        # ruamel CommentedMap поддерживает .get() напрямую
        try:
            p_type = str(p.get("type", "")) if hasattr(p, 'get') else ""
            p_iface = str(p.get("interface", "")) if hasattr(p, 'get') else ""
            p_name = str(p.get("name", "")) if hasattr(p, 'get') else ""
        except Exception:
            kept.append(p)
            continue

        if p_type == "direct" and p_iface == interface:
            removed_names.append(p_name)
        else:
            kept.append(p)

    if not removed_names:
        print(f"[awg unregister] нет прокси с interface={interface}", flush=True)
        return None

    print(f"[awg unregister] удаляю прокси: {removed_names}", flush=True)
    cfg["proxies"] = kept

    # Удалить ссылки из всех групп.
    # если группа была "channel-обёрткой" только над удалёнными
    # AWG-прокси, и после удаления стала пустой — удаляем группу целиком, а не
    # подменяем на DIRECT. Иначе группа реклассифицируется из "Каналы" в
    # "Маршрутизация" (DIRECT — это routing target).
    groups = cfg.get("proxy-groups") or []
    groups_to_remove = []  # имена групп которые удалим целиком
    for g in groups:
        if not isinstance(g, dict) and not hasattr(g, 'get'): continue
        ps = g.get("proxies") or []
        if not ps: continue
        new_ps = [x for x in ps if str(x) not in removed_names]
        if new_ps:
            # В группе остались другие прокси — обновляем
            g["proxies"] = new_ps
        else:
            # Группа была чисто-канальной над удалёнными AWG прокси
            gname = g.get("name")
            if gname:
                groups_to_remove.append(str(gname))
                print(f"[awg unregister] группа '{gname}' стала пустой — удаляю целиком", flush=True)

    # Удаляем пустые группы целиком
    if groups_to_remove:
        cfg["proxy-groups"] = [g for g in groups
                               if str(g.get("name", "")) not in groups_to_remove]

        # Каскад: убрать ссылки на удалённые группы из ОСТАЛЬНЫХ групп
        for g in cfg["proxy-groups"]:
            ps = g.get("proxies") or []
            if ps:
                new_ps = [x for x in ps if str(x) not in groups_to_remove]
                if new_ps != ps:
                    if new_ps:
                        g["proxies"] = new_ps
                    else:
                        # И эта группа стала пустой — добавляем DIRECT как fallback
                        # (это reasonable: пользователь явно ссылался на эту группу
                        # для маршрутизации, ему нужен какой-то выход)
                        g["proxies"] = ["DIRECT"]
                        print(f"[awg unregister] вторичная группа '{g.get('name')}' "
                              f"стала пустой, добавлен DIRECT", flush=True)

        # Каскад: убрать ссылки на удалённые группы из rules
        rules = cfg.get("rules") or []
        new_rules = []
        for rule in rules:
            r_str = str(rule)
            # Правило вида "TYPE,payload,target[,no-resolve]"
            # Если target — удалённая группа, заменим на MATCH или удалим
            keep = True
            for gname in groups_to_remove:
                # Точное совпадение target (с разделителем , или конец строки)
                if f",{gname}," in r_str or r_str.endswith(f",{gname}"):
                    # Правило ссылается на удалённую группу — пропускаем
                    keep = False
                    print(f"[awg unregister] правило удалено (target='{gname}'): {r_str[:60]}", flush=True)
                    break
            if keep:
                new_rules.append(rule)
        cfg["rules"] = new_rules

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)

    # Перезагрузим mihomo чтобы изменения применились
    try:
        import asyncio
        asyncio.create_task(reload_mihomo())
    except Exception as e:
        print(f"[awg unregister] reload_mihomo failed: {e}", flush=True)

    return {
        "backup": backup,
        "removed_proxies": removed_names,
        "removed_groups": groups_to_remove,
    }

@app.post("/api/awg/tunnels/{name}/register-in-mihomo")
async def awg_register_in_mihomo(name: str, body: dict, _: bool = Auth):
    """Добавить AWG туннель в Mihomo как direct-прокси через interface"""
    path = os.path.join(AWG_DIR, f"{name}.conf")
    if not os.path.exists(path):
        raise HTTPException(404, "AWG config not found")

    # Интерфейс = имя awg туннеля (awg-quick@name создаёт интерфейс с именем name)
    interface = name
    proxy_name = body.get("proxy_name") or _default_awg_proxy_name(name)
    routing_mark = int(body.get("routing_mark", 51820))
    groups = body.get("add_to_groups") or []

    cfg = yaml_load(MIHOMO_CONFIG)
    existing = _find_mihomo_proxy_by_interface(cfg, interface)
    if existing:
        raise HTTPException(409, f"Прокси для interface '{interface}' уже существует: '{existing}'")

    result = await _register_awg_in_mihomo(proxy_name, interface, routing_mark, groups)
    return {"ok": True, "proxy_name": proxy_name, "interface": interface,
            "routing_mark": routing_mark, **result}

# ============================================
# RULES
# ============================================
@app.get("/api/mihomo/rules")
def rules_list(_: bool = Auth):
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    rules = cfg.get("rules")
    if not isinstance(rules, list):
        rules = []

    parsed = []
    for i, r in enumerate(rules):
        try:
            s = str(r) if r is not None else ""
            parts = [p.strip() for p in s.split(",")] if s else []
            rtype = parts[0] if len(parts) > 0 else ""

            # MATCH — особое правило формата "MATCH,target"
            # Только 2 части, target идёт сразу после MATCH
            if rtype.upper() == "MATCH":
                parsed.append({
                    "index": i,
                    "raw": s,
                    "type": rtype,
                    "payload": "",
                    "target": parts[1] if len(parts) > 1 else "",
                    "params": parts[2:] if len(parts) > 2 else [],
                })
            else:
                # Остальные: TYPE,PAYLOAD,TARGET[,params...]
                parsed.append({
                    "index": i,
                    "raw": s,
                    "type": rtype,
                    "payload": parts[1] if len(parts) > 1 else "",
                    "target": parts[2] if len(parts) > 2 else "",
                    "params": parts[3:] if len(parts) > 3 else [],
                })
        except Exception as e:
            parsed.append({
                "index": i, "raw": str(r), "type": "?", "payload": "?",
                "target": "?", "params": [], "error": str(e)
            })
    return parsed

@app.get("/api/mihomo/rules/targets")
async def rules_targets(_: bool = Auth):
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    groups = cfg.get("proxy-groups")
    if not isinstance(groups, list):
        groups = []

    names = []
    for g in groups:
        if isinstance(g, dict) and g.get("name"):
            names.append(str(g.get("name")))
    return {"targets": names + ["DIRECT", "REJECT"]}

def _validate_rule(rule: str, available_targets: set = None) -> str:
    """Проверяет валидность правила Mihomo. Возвращает trimmed rule.
    Кидает HTTPException(400) если правило битое."""
    rule = (rule or "").strip()
    if not rule:
        raise HTTPException(400, "Правило не может быть пустым")

    # Уберём trailing запятые
    while rule.endswith(","):
        rule = rule[:-1].strip()

    parts = [p.strip() for p in rule.split(",")]
    rule_type = parts[0].upper() if parts else ""

    # Приводим available_targets к set обычных Python str
    if available_targets is not None:
        available_targets = {str(t) for t in available_targets}
    SPECIALS = {"DIRECT", "REJECT", "PASS"}

    # MATCH — особое правило, имеет ровно 2 части: MATCH,target
    if rule_type == "MATCH":
        if len(parts) < 2 or not parts[1]:
            raise HTTPException(400,
                "Правило MATCH должно иметь target: например 'MATCH,DIRECT' или 'MATCH,Основной трафик'. "
                "Пустой target ломает Mihomo.")
        target = str(parts[1])
        # Проверяем target — если задан available_targets, то он должен совпадать
        if available_targets and target not in available_targets and target not in SPECIALS:
            print(f"[validate_rule] MATCH target '{target}' не найден среди {available_targets}", flush=True)
            raise HTTPException(400,
                f"Target '{target}' не найден ни в proxy-groups, ни в DIRECT/REJECT.")
        return f"MATCH,{target}"

    # Остальные правила: TYPE,PAYLOAD,TARGET[,params...]
    if len(parts) < 3:
        raise HTTPException(400,
            f"Правило должно быть в формате 'TYPE,PAYLOAD,TARGET': получено '{rule}'")
    if not parts[1] or not parts[2]:
        raise HTTPException(400,
            f"Правило '{rule}' содержит пустой PAYLOAD или TARGET")

    target = str(parts[2])
    if available_targets and target not in available_targets and target not in SPECIALS:
        print(f"[validate_rule] target '{target}' не найден среди {available_targets}", flush=True)
        raise HTTPException(400,
            f"Target '{target}' не найден ни в proxy-groups, ни в DIRECT/REJECT.")

    return ",".join(parts)


@app.post("/api/mihomo/rules")
async def rules_add(data: RuleItem, position: int = -1, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("rules") is None:
        cfg["rules"] = []
    rules = cfg["rules"]

    # Собираем доступные targets для валидации
    groups = cfg.get("proxy-groups") or []
    targets = set()
    for g in groups:
        if isinstance(g, dict) and g.get("name"):
            targets.add(str(g["name"]))

    validated = _validate_rule(data.rule, targets)

    if position < 0 or position >= len(rules):
        rules.append(validated)
    else:
        rules.insert(position, validated)

    ok, backup, err = await _save_and_validate_mihomo(cfg, expect_rules=rules)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True, "backup": backup}

@app.put("/api/mihomo/rules/{index}")
async def rules_update(index: int, data: RuleItem, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    rules = cfg.get("rules") or []
    if index < 0 or index >= len(rules):
        raise HTTPException(404, "Index out of range")

    groups = cfg.get("proxy-groups") or []
    targets = set()
    for g in groups:
        if isinstance(g, dict) and g.get("name"):
            targets.add(str(g["name"]))

    validated = _validate_rule(data.rule, targets)
    rules[index] = validated

    ok, backup, err = await _save_and_validate_mihomo(cfg, expect_rules=rules)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True, "backup": backup}

@app.delete("/api/mihomo/rules/{index}")
async def rules_delete(index: int, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    rules = cfg.get("rules") or []
    if index < 0 or index >= len(rules):
        raise HTTPException(404, "Index out of range")
    del rules[index]

    ok, backup, err = await _save_and_validate_mihomo(cfg, expect_rules=rules)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True, "backup": backup}

@app.put("/api/mihomo/rules")
async def rules_reorder(data: RulesReorder, _: bool = Auth):
    cfg = yaml_load(MIHOMO_CONFIG)
    cfg["rules"] = data.rules

    ok, backup, err = await _save_and_validate_mihomo(cfg, expect_rules=data.rules)
    if not ok:
        raise HTTPException(400, err)
    return {"ok": True, "backup": backup, "count": len(data.rules)}

# ============================================
# AWG TUNNELS (multi-tunnel)
# ============================================
def _parse_awg_transfer(line: str) -> dict:
    """Парсит '1.50 MiB received, 200.00 KiB sent' в байты"""
    result = {"received": 0, "sent": 0}
    if not line: return result
    units = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}
    m = re.search(r'([\d.]+)\s*(B|KiB|MiB|GiB|TiB)\s*received', line)
    if m:
        try: result["received"] = int(float(m.group(1)) * units[m.group(2)])
        except: pass
    m = re.search(r'([\d.]+)\s*(B|KiB|MiB|GiB|TiB)\s*sent', line)
    if m:
        try: result["sent"] = int(float(m.group(1)) * units[m.group(2)])
        except: pass
    return result

def _get_real_awg_interfaces() -> List[str]:
    """Реально активные AWG интерфейсы через `awg show interfaces`"""
    r = run(["awg", "show", "interfaces"], timeout=5)
    if not r["ok"]: return []
    return [x.strip() for x in r["stdout"].split() if x.strip()]

@app.get("/api/awg/tunnels")
def awg_list(_: bool = Auth):
    # Загрузим Mihomo прокси один раз для проверки регистрации
    mihomo_interfaces = set()
    try:
        m_cfg = yaml_load(MIHOMO_CONFIG)
        for p in (m_cfg.get("proxies") or []):
            plain = dict(p) if hasattr(p, 'items') else {}
            if plain.get("type") == "direct":
                iface = str(plain.get("interface", ""))
                if iface: mihomo_interfaces.add(iface)
    except Exception: pass

    real_ifaces = set(_get_real_awg_interfaces())
    tunnels = []
    seen_names = set()

    if os.path.exists(AWG_DIR):
        for f in sorted(os.listdir(AWG_DIR)):
            if f.endswith(".conf"):
                name = f.replace(".conf", "")
                seen_names.add(name)
                path = os.path.join(AWG_DIR, f)
                active = run(["systemctl", "is-active", f"awg-quick@{name}"])
                enabled = run(["systemctl", "is-enabled", f"awg-quick@{name}"])
                show = run(["awg", "show", name])
                handshake = endpoint = transfer = None
                received_b = sent_b = 0
                for line in show["stdout"].split("\n"):
                    line = line.strip()
                    if line.startswith("latest handshake:"):
                        handshake = line.split(":", 1)[1].strip()
                    elif line.startswith("endpoint:"):
                        endpoint = line.split(":", 1)[1].strip()
                    elif line.startswith("transfer:"):
                        transfer = line.split(":", 1)[1].strip()
                        b = _parse_awg_transfer(transfer)
                        received_b = b["received"]
                        sent_b = b["sent"]

                in_mihomo = name in mihomo_interfaces

                tunnels.append({
                    "name": name,
                    "path": path,
                    "service": f"awg-quick@{name}",
                    "active": active["stdout"].strip() == "active",
                    "enabled": enabled["stdout"].strip() == "enabled",
                    "endpoint": endpoint,
                    "handshake": handshake,
                    "transfer": transfer,
                    "received_bytes": received_b,
                    "sent_bytes": sent_b,
                    "connected": bool(handshake and "ago" in handshake),
                    "in_mihomo": in_mihomo,
                    "orphan": False,
                })

    # Мини-фикс: туннели которые есть в Mihomo но не имеют .conf файла
    # (например, FirstByte установлен другим путём — через bivlked-installer и т.п.)
    for iface in mihomo_interfaces:
        if iface not in seen_names:
            # Проверяем активен ли реально через awg show
            is_real = iface in real_ifaces
            show = run(["awg", "show", iface]) if is_real else {"stdout": "", "ok": False}
            handshake = endpoint = transfer = None
            received_b = sent_b = 0
            for line in show["stdout"].split("\n"):
                line = line.strip()
                if line.startswith("latest handshake:"):
                    handshake = line.split(":", 1)[1].strip()
                elif line.startswith("endpoint:"):
                    endpoint = line.split(":", 1)[1].strip()
                elif line.startswith("transfer:"):
                    transfer = line.split(":", 1)[1].strip()
                    b = _parse_awg_transfer(transfer)
                    received_b = b["received"]
                    sent_b = b["sent"]

            tunnels.append({
                "name": iface,
                "path": None,
                "service": f"awg-quick@{iface}",
                "active": is_real,
                "enabled": False,
                "endpoint": endpoint,
                "handshake": handshake,
                "transfer": transfer,
                "received_bytes": received_b,
                "sent_bytes": sent_b,
                "connected": bool(handshake and "ago" in handshake),
                "in_mihomo": True,
                "orphan": True,  # есть в Mihomo, но .conf не найден
            })

    return tunnels

@app.get("/api/awg/tunnels/{name}")
def awg_get(name: str, _: bool = Auth):
    path = os.path.join(AWG_DIR, f"{name}.conf")
    if not os.path.exists(path):
        raise HTTPException(404, "Tunnel not found")
    with open(path, "r", encoding="utf-8") as f:
        return {"name": name, "content": f.read(), "path": path}

@app.put("/api/awg/tunnels/{name}")
def awg_update(name: str, data: ConfigEdit, _: bool = Auth):
    path = os.path.join(AWG_DIR, f"{name}.conf")
    backup = backup_file(path)

    try:
        _write_protected_file(path, data.content, mode=0o600)
    except PermissionError as e:
        raise HTTPException(500, f"Не удалось записать конфиг: {e}")

    r = run(["systemctl", "restart", f"awg-quick@{name}"])
    if not r["ok"] and backup:
        try:
            with open(backup, "r", encoding="utf-8") as bf:
                _write_protected_file(path, bf.read(), mode=0o600)
        except Exception:
            run(["cp", backup, path])
        raise HTTPException(400, f"Restart failed: {r['stderr']}")
    return {"ok": True, "backup": backup}

class AWGTunnelCreate(BaseModel):
    name: str
    content: str
    # Опционально: добавить в Mihomo как direct-прокси через interface
    add_to_mihomo: bool = False
    mihomo_proxy_name: Optional[str] = None
    mihomo_groups: Optional[List[str]] = None
    routing_mark: Optional[int] = 51820

@app.post("/api/awg/tunnels")
async def awg_create(data: AWGTunnelCreate, _: bool = Auth):
    # Не делаем makedirs — каталог создан install.sh с правильными правами
    path = os.path.join(AWG_DIR, f"{data.name}.conf")
    if os.path.exists(path):
        raise HTTPException(409, f"Tunnel '{data.name}' already exists")

    try:
        _write_protected_file(path, data.content, mode=0o600)
    except PermissionError as e:
        raise HTTPException(500, f"Не удалось записать конфиг: {e}")

    run(["systemctl", "enable", f"awg-quick@{data.name}"])
    r = run(["systemctl", "start", f"awg-quick@{data.name}"])

    result = {"ok": True, "path": path, "started": r["ok"], "output": r["stderr"] or r["stdout"]}

    # Опционально регистрируем в Mihomo как direct-прокси
    if data.add_to_mihomo:
        try:
            proxy_name = data.mihomo_proxy_name or _default_awg_proxy_name(data.name)
            mih = await _register_awg_in_mihomo(
                proxy_name, data.name,
                data.routing_mark or 51820,
                data.mihomo_groups or [])
            result["mihomo"] = {
                "added": True, "proxy_name": proxy_name,
                "interface": data.name,
                "added_to_groups": mih["added_to_groups"]
            }
        except Exception as e:
            result["mihomo"] = {"added": False, "error": str(e)}

    return result

@app.delete("/api/awg/tunnels/{name}")
def awg_delete(name: str, remove_from_mihomo: bool = True, _: bool = Auth):
    path = os.path.join(AWG_DIR, f"{name}.conf")

    run(["systemctl", "stop", f"awg-quick@{name}"])
    run(["systemctl", "disable", f"awg-quick@{name}"])
    if os.path.exists(path):
        os.remove(path)

    removed_from_mihomo = None
    if remove_from_mihomo:
        try:
            r = _unregister_awg_from_mihomo_by_interface(name)
            if r: removed_from_mihomo = r
        except Exception: pass

    return {"ok": True, "removed_from_mihomo": removed_from_mihomo}

@app.post("/api/awg/tunnels/{name}/action")
def awg_action(name: str, data: ServiceAction, _: bool = Auth):
    if data.action not in ("start", "stop", "restart"):
        raise HTTPException(400, "Invalid action")
    r = run(["systemctl", data.action, f"awg-quick@{name}"])
    return {"ok": r["ok"], "output": r["stderr"] or r["stdout"]}

@app.get("/api/awg/orphan-proxies")
async def awg_orphan_proxies(_: bool = Auth):
    """Список AWG-прокси в Mihomo которые ссылаются на несуществующий interface."""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    existing = set()
    if os.path.isdir(AWG_DIR):
        for f in os.listdir(AWG_DIR):
            if f.endswith(".conf"):
                existing.add(f.replace(".conf", ""))

    orphans = []
    proxies = cfg.get("proxies") or []
    for p in proxies:
        try:
            if not hasattr(p, 'get'): continue
            if str(p.get("type", "")) != "direct": continue
            iface = str(p.get("interface", ""))
            if not iface: continue
            if iface not in existing:
                rmark = p.get("routing-mark")
                # Конвертируем ruamel ScalarInt в обычный int для JSON
                if rmark is not None:
                    try: rmark = int(rmark)
                    except: rmark = None
                orphans.append({
                    "name": str(p.get("name", "")),
                    "interface": iface,
                    "routing_mark": rmark,
                })
        except Exception:
            continue  # одно битое не валит весь список

    return {"orphans": orphans, "existing_interfaces": sorted(existing)}

@app.post("/api/awg/orphan-proxies/cleanup")
async def awg_orphan_proxies_cleanup(_: bool = Auth):
    """Удалить все orphan AWG-прокси одной командой."""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    existing = set()
    if os.path.isdir(AWG_DIR):
        for f in os.listdir(AWG_DIR):
            if f.endswith(".conf"):
                existing.add(f.replace(".conf", ""))

    proxies = cfg.get("proxies") or []
    removed_names = []
    kept = []
    for p in proxies:
        if not hasattr(p, 'get'):
            kept.append(p); continue
        if str(p.get("type", "")) == "direct":
            iface = str(p.get("interface", ""))
            if iface and iface not in existing:
                removed_names.append(str(p.get("name", "")))
                continue
        kept.append(p)

    if not removed_names:
        return {"ok": True, "removed": [], "message": "Orphan-прокси не найдены"}

    cfg["proxies"] = kept
    for g in (cfg.get("proxy-groups") or []):
        if not hasattr(g, 'get'): continue
        ps = g.get("proxies") or []
        if ps:
            new_ps = [x for x in ps if str(x) not in removed_names]
            if new_ps:
                g["proxies"] = new_ps
            else:
                g["proxies"] = ["DIRECT"]

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"ok": True, "removed": removed_names, "backup": backup}

# ============================================
# TRUSTTUNNEL — discovery via systemd (reliable)
# ============================================
import re

def _tt_services():
    """Находим все trusttunnel-* сервисы.

    Используем 2 источника — объединение даёт надёжный результат:
    1. systemctl list-unit-files (может отставать после daemon-reload)
    2. Файлы /etc/systemd/system/trusttunnel-*.service (мгновенно)
    """
    services = set()

    # Источник 1: systemctl
    r = run(["systemctl", "list-unit-files", "--no-legend", "--no-pager", "trusttunnel-*.service"])
    if r["ok"]:
        for line in r["stdout"].split("\n"):
            parts = line.split()
            if parts and parts[0].startswith("trusttunnel-") and parts[0].endswith(".service"):
                services.add(parts[0].replace(".service", ""))

    # Источник 2: файловая система (мгновенный пикап только что созданных)
    try:
        for f in os.listdir("/etc/systemd/system"):
            if f.startswith("trusttunnel-") and f.endswith(".service"):
                services.add(f.replace(".service", ""))
    except Exception:
        pass

    return sorted(services)

def _tt_parse_unit(service_name):
    """Читает systemd юнит и парсит путь к конфигу из ExecStart.
    Также читает .toml для извлечения hostname/local_port."""
    r = run(["systemctl", "cat", service_name])
    if not r["ok"]:
        return None
    config_path = None
    binary = None
    for line in r["stdout"].split("\n"):
        if line.strip().startswith("ExecStart="):
            cmd = line.strip().split("=", 1)[1]
            tokens = cmd.split()
            if tokens:
                binary = tokens[0]
            for tok in tokens:
                if tok.endswith(".toml"):
                    config_path = tok
                    break
            break

    # Парсим .toml для local_port и hostname
    # расширенный парсер — поддержка разных форматов:
    #   address = "127.0.0.1:1080"  (стандарт)
    #   address = '127.0.0.1:1080'  (одинарные кавычки)
    #   address="0.0.0.0:1080"      (без пробелов)
    #   address = "[::]:1080"       (IPv6 wildcard)
    #   address = ":1080"           (только порт)
    #   port = 1080                 (отдельное поле port)
    local_port = None
    hostname = None
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()

            # 1. Любой address с портом — извлекаем число после `:`
            m = re.search(r'address\s*=\s*["\']([^"\']*?):(\d+)["\']', content, re.MULTILINE)
            if m:
                local_port = int(m.group(2))
            # 2. Альтернатива: отдельное поле port = <число>
            if local_port is None:
                m = re.search(r'^\s*port\s*=\s*(\d+)\s*$', content, re.MULTILINE)
                if m:
                    local_port = int(m.group(1))
            # 3. Альтернатива: listen = ":1080" или listen = "127.0.0.1:1080"
            if local_port is None:
                m = re.search(r'listen\s*=\s*["\']([^"\']*?):(\d+)["\']', content, re.MULTILINE)
                if m:
                    local_port = int(m.group(2))
            # 4. Альтернатива: socks_port = 1080
            if local_port is None:
                m = re.search(r'socks_?port\s*=\s*(\d+)', content, re.MULTILINE | re.IGNORECASE)
                if m:
                    local_port = int(m.group(1))

            # hostname
            m = re.search(r'hostname\s*=\s*["\']([^"\']+)["\']', content)
            if m:
                hostname = m.group(1)
            # альтернатива: server = "..."
            if hostname is None:
                m = re.search(r'server\s*=\s*["\']([^"\']+)["\']', content)
                if m:
                    hostname = m.group(1)
        except Exception as e:
            print(f"[tt] parse error in {config_path}: {e}")

    return {
        "config_path": config_path,
        "binary": binary,
        "local_port": local_port,
        "hostname": hostname,
    }

@app.get("/api/trusttunnel/list")
def trusttunnel_list(_: bool = Auth):
    """Список TrustTunnel сервисов - discovery через systemd"""
    # Загрузим Mihomo прокси один раз, чтобы проверить регистрацию
    mihomo_socks_ports = set()
    try:
        m_cfg = yaml_load(MIHOMO_CONFIG)
        for p in (m_cfg.get("proxies") or []):
            plain = dict(p) if hasattr(p, 'items') else {}
            if (plain.get("type") == "socks5"
                    and str(plain.get("server")) in ("127.0.0.1", "localhost", "::1")):
                try:
                    mihomo_socks_ports.add(int(plain.get("port", 0)))
                except Exception: pass
    except Exception: pass

    configs = []
    for service_name in _tt_services():
        name = service_name.replace("trusttunnel-", "", 1)
        info = _tt_parse_unit(service_name) or {}
        config_path = info.get("config_path")

        # Парсим порт из .toml
        local_port = None
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    for line in f:
                        m = re.match(r'\s*address\s*=\s*"127\.0\.0\.1:(\d+)"', line)
                        if m:
                            local_port = int(m.group(1))
                            break
            except Exception: pass

        active = run(["systemctl", "is-active", service_name])
        enabled = run(["systemctl", "is-enabled", service_name])

        configs.append({
            "name": name,
            "service": service_name,
            "path": config_path,
            "file": os.path.basename(config_path) if config_path else None,
            "exists": bool(config_path and os.path.exists(config_path)),
            "binary": info.get("binary"),
            "active": active["stdout"].strip() == "active",
            "enabled": enabled["stdout"].strip() == "enabled",
            "local_port": local_port,
            "in_mihomo": local_port is not None and local_port in mihomo_socks_ports
        })
    return configs

def _tt_path_by_name(name: str) -> Optional[str]:
    """Находим путь к конфигу для данного TrustTunnel сервиса через ExecStart"""
    info = _tt_parse_unit(f"trusttunnel-{name}")
    if info and info.get("config_path"):
        return info["config_path"]
    # Fallback: пробуем стандартные имена в директории
    for filename in [f"{name}_socks.toml", f"{name}.toml"]:
        path = os.path.join(TRUSTTUNNEL_DIR, filename)
        if os.path.exists(path):
            return path
    return None

@app.get("/api/trusttunnel/{name}")
def trusttunnel_get(name: str, _: bool = Auth):
    path = _tt_path_by_name(name)
    if not path or not os.path.exists(path):
        raise HTTPException(404, f"Config for '{name}' not found")
    with open(path, "r", encoding="utf-8") as f:
        return {"content": f.read(), "path": path, "file": os.path.basename(path)}

@app.put("/api/trusttunnel/{name}")
def trusttunnel_put(name: str, data: ConfigEdit, _: bool = Auth):
    path = _tt_path_by_name(name)
    if not path:
        raise HTTPException(404, "Config not found")

    backup = backup_file(path)
    with open(path, "w", encoding="utf-8") as f:
        f.write(data.content)

    r = run(["systemctl", "restart", f"trusttunnel-{name}"])
    return {"ok": r["ok"], "backup": backup, "output": r["stderr"] or r["stdout"]}

def _default_tt_proxy_name(tt_name: str) -> str:
    """Имя прокси в Mihomo для TrustTunnel по умолчанию"""
    flags = {
        "belarus": "🇧🇾", "by": "🇧🇾",
        "france": "🇫🇷", "fr": "🇫🇷",
        "usa": "🇺🇸", "us": "🇺🇸",
        "germany": "🇩🇪", "de": "🇩🇪",
        "netherlands": "🇳🇱", "nl": "🇳🇱",
        "poland": "🇵🇱", "pl": "🇵🇱",
        "turkey": "🇹🇷", "tr": "🇹🇷",
        "uk": "🇬🇧", "gb": "🇬🇧",
        "italy": "🇮🇹", "it": "🇮🇹",
    }
    flag = flags.get(tt_name.lower(), "🔐")
    return f"{flag} {tt_name.title()} (SOCKS5)"

async def _register_tt_in_mihomo(proxy_name: str, local_port: int,
                                  groups_to_add: Optional[List[str]] = None):
    """Добавляет SOCKS5 прокси в Mihomo config + опционально в группы"""
    cfg = yaml_load(MIHOMO_CONFIG)
    if cfg.get("proxies") is None:
        cfg["proxies"] = []
    proxies = cfg["proxies"]

    # Проверка на дубликат по имени
    for p in proxies:
        if str(p.get("name")) == proxy_name:
            raise HTTPException(409, f"Proxy '{proxy_name}' already in Mihomo")

    proxies.append({
        "name": proxy_name,
        "type": "socks5",
        "server": "127.0.0.1",
        "port": local_port,
        "udp": True,
    })

    added_to = []
    if groups_to_add:
        groups = cfg.get("proxy-groups") or []
        for g in groups:
            if str(g.get("name")) in groups_to_add:
                if g.get("proxies") is None:
                    g["proxies"] = []
                if proxy_name not in g["proxies"]:
                    g["proxies"].append(proxy_name)
                    added_to.append(str(g.get("name")))

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    await reload_mihomo()
    return {"backup": backup, "added_to_groups": added_to}

def _unregister_tt_from_mihomo_by_port(local_port: int):
    """Удаляет SOCKS5 прокси по порту + ссылки на него из групп"""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception:
        return None

    removed_names = []
    proxies = cfg.get("proxies") or []
    # Найти и удалить прокси указывающие на этот порт на 127.0.0.1
    keep_proxies = []
    for p in proxies:
        plain = dict(p) if hasattr(p, 'items') else {}
        if (plain.get("type") == "socks5"
                and str(plain.get("server")) in ("127.0.0.1", "localhost", "::1")
                and int(plain.get("port", 0)) == local_port):
            removed_names.append(str(plain.get("name")))
        else:
            keep_proxies.append(p)

    if not removed_names:
        return None

    cfg["proxies"] = keep_proxies

    # Удалить из групп
    groups = cfg.get("proxy-groups") or []
    for g in groups:
        if g.get("proxies"):
            g["proxies"] = [p for p in g["proxies"] if p not in removed_names]

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)
    return {"removed": removed_names, "backup": backup}

@app.post("/api/trusttunnel")
async def trusttunnel_create(cfg: TrustTunnelConfig, _: bool = Auth):
    print(f"[trusttunnel_create] name='{cfg.name}' mode={'toml' if cfg.toml_content else 'fields'}", flush=True)
    os.makedirs(TRUSTTUNNEL_DIR, exist_ok=True)

    # Проверка имени
    if not cfg.name or not cfg.name.strip():
        raise HTTPException(400, "Имя обязательно")
    safe_name = cfg.name.strip()
    if not re.match(r'^[A-Za-z0-9_-]+$', safe_name):
        raise HTTPException(400,
            f"Имя '{safe_name}' содержит недопустимые символы. "
            f"Разрешены только латинские буквы, цифры, _ и -")

    path = os.path.join(TRUSTTUNNEL_DIR, f"{safe_name}_socks.toml")
    unit_path = f"/etc/systemd/system/trusttunnel-{safe_name}.service"

    # Проверка конфликтов — отдельно для конфига и для systemd unit
    if os.path.exists(path):
        raise HTTPException(409,
            f"Файл конфига уже существует: {path}. "
            f"Удалите старый сервис trusttunnel-{safe_name} через UI или используйте другое имя.")
    if os.path.exists(unit_path):
        raise HTTPException(409,
            f"Systemd unit уже существует: {unit_path}. "
            f"Возможно остался от предыдущей попытки — удалите вручную или выберите другое имя.")

    # Обновляем cfg.name на безопасный вариант
    cfg.name = safe_name

    # Решаем как формировать конфиг: из TOML (как есть) или из полей
    if cfg.toml_content and cfg.toml_content.strip():
        content = cfg.toml_content.strip() + "\n"

        # Парсим чтобы вытащить port для регистрации в Mihomo
        try:
            import tomllib
            parsed = tomllib.loads(content)
        except Exception as e:
            raise HTTPException(400, f"Невалидный TOML: {e}")

        # Извлекаем local_port из [listener.socks] address = "127.0.0.1:PORT"
        local_port = cfg.local_port
        try:
            socks_addr = parsed.get("listener", {}).get("socks", {}).get("address", "")
            if ":" in socks_addr:
                local_port = int(socks_addr.rsplit(":", 1)[1])
        except Exception:
            pass

        if not local_port:
            raise HTTPException(400,
                "Не удалось определить local_port. В TOML должна быть секция "
                "[listener.socks] с address = \"127.0.0.1:PORT\", или укажите local_port отдельно.")
    else:
        # Поэтапный ввод — все поля обязательны
        missing = [k for k in ("hostname", "address", "username", "password", "local_port")
                   if not getattr(cfg, k, None)]
        if missing:
            raise HTTPException(400, f"Не заполнены поля: {', '.join(missing)} (или используйте toml_content)")

        local_port = cfg.local_port
        content = f"""loglevel = "info"
vpn_mode = "selective"

[endpoint]
hostname = "{cfg.hostname}"
addresses = ["{cfg.address}"]
username = "{cfg.username}"
password = "{cfg.password}"
skip_verification = true
upstream_protocol = "http2"

[listener]
[listener.socks]
address = "127.0.0.1:{local_port}"
"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[trusttunnel_create] wrote TOML: {path}", flush=True)

    unit = f"""[Unit]
Description=TrustTunnel Client - {cfg.name.title()} (SOCKS5 port {local_port})
After=network.target awg-quick@awg0.service
Wants=awg-quick@awg0.service

[Service]
Type=simple
User=root
ExecStart={TRUSTTUNNEL_BIN} -c {path}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    try:
        _write_protected_file(unit_path, unit, mode=0o644)
    except PermissionError as e:
        raise HTTPException(500, f"Не удалось записать systemd unit: {e}")
    print(f"[trusttunnel_create] wrote unit: {unit_path}", flush=True)

    r_dr = run(["systemctl", "daemon-reload"])
    r_en = run(["systemctl", "enable", f"trusttunnel-{cfg.name}"])
    r = run(["systemctl", "start", f"trusttunnel-{cfg.name}"])
    print(f"[trusttunnel_create] daemon-reload ok={r_dr['ok']}, enable ok={r_en['ok']}, start ok={r['ok']}", flush=True)
    if not r["ok"]:
        print(f"[trusttunnel_create] start STDERR: {r['stderr']}", flush=True)

    result = {
        "ok": True, "path": path, "service": f"trusttunnel-{cfg.name}",
        "local_port": local_port,
        "started": r["ok"], "output": r["stderr"] or r["stdout"]
    }

    # Регистрация в Mihomo
    if cfg.add_to_mihomo:
        proxy_name = cfg.mihomo_proxy_name or _default_tt_proxy_name(cfg.name)
        try:
            mihomo_result = await _register_tt_in_mihomo(
                proxy_name, local_port, cfg.add_to_groups
            )
            result["mihomo"] = {
                "added": True,
                "proxy_name": proxy_name,
                "added_to_groups": mihomo_result["added_to_groups"]
            }
        except Exception as e:
            result["mihomo"] = {"added": False, "error": str(e)}

    return result

@app.post("/api/trusttunnel/{name}/register-in-mihomo")
async def trusttunnel_register(name: str, body: dict, _: bool = Auth):
    """Добавить существующий TrustTunnel в Mihomo как SOCKS5 прокси"""
    # Найдём port из .toml
    path = _tt_path_by_name(name)
    if not path or not os.path.exists(path):
        raise HTTPException(404, "TrustTunnel config not found")

    local_port = None
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            m = re.match(r'address\s*=\s*"127\.0\.0\.1:(\d+)"', line)
            if m:
                local_port = int(m.group(1))
                break

    if not local_port:
        raise HTTPException(400, "Could not parse local port from TrustTunnel config")

    proxy_name = body.get("proxy_name") or _default_tt_proxy_name(name)
    groups = body.get("add_to_groups") or []

    result = await _register_tt_in_mihomo(proxy_name, local_port, groups)
    return {"ok": True, "proxy_name": proxy_name, "port": local_port, **result}

@app.post("/api/trusttunnel/{name}/action")
def trusttunnel_action(name: str, body: dict, _: bool = Auth):
    """управление TT-сервисом из UI — start/stop/restart."""
    action = (body or {}).get("action", "")
    if action not in ("start", "stop", "restart"):
        raise HTTPException(400, "action must be one of: start, stop, restart")

    # Проверка что сервис существует
    unit = f"trusttunnel-{name}.service"
    chk = run(["systemctl", "list-unit-files", "--no-legend", "--no-pager", unit])
    if not chk["stdout"].strip():
        raise HTTPException(404, f"Сервис {unit} не найден")

    r = run(["systemctl", action, f"trusttunnel-{name}"])
    if not r["ok"]:
        return {"ok": False, "error": (r["stderr"] or r["stdout"] or "").strip()[:300]}

    # Дать сервису ~1 сек чтобы стартануть и проверить статус
    import time as _t
    _t.sleep(1)
    state = run(["systemctl", "is-active", f"trusttunnel-{name}"])
    return {
        "ok": True,
        "action": action,
        "active": state["stdout"].strip() == "active",
    }

@app.delete("/api/trusttunnel/{name}")
def trusttunnel_delete(name: str, remove_from_mihomo: bool = True, _: bool = Auth):
    run(["systemctl", "stop", f"trusttunnel-{name}"])
    run(["systemctl", "disable", f"trusttunnel-{name}"])

    # Найдём port до удаления файла (для очистки в Mihomo)
    local_port = None
    if remove_from_mihomo:
        path = _tt_path_by_name(name)
        if path and os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    m = re.match(r'\s*address\s*=\s*"127\.0\.0\.1:(\d+)"', line)
                    if m:
                        local_port = int(m.group(1))
                        break

    # Удаляем конфиг по пути из ExecStart
    config_path = _tt_path_by_name(name)
    if config_path and os.path.exists(config_path):
        os.remove(config_path)

    unit = f"/etc/systemd/system/trusttunnel-{name}.service"
    if os.path.exists(unit):
        os.remove(unit)

    run(["systemctl", "daemon-reload"])

    result = {"ok": True}
    if remove_from_mihomo and local_port:
        cleanup = _unregister_tt_from_mihomo_by_port(local_port)
        if cleanup:
            # reload mihomo асинхронно не критично, но попробуем
            try:
                subprocess.Popen(
                    ["curl", "-s", "-X", "PUT",
                     f"{MIHOMO_API}/configs?force=true",
                     "-H", f"Authorization: Bearer {MIHOMO_SECRET}",
                     "-H", "Content-Type: application/json",
                     "-d", json.dumps({"path": MIHOMO_CONFIG})],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            except Exception: pass
            result["mihomo_cleanup"] = cleanup

    return result

# ============================================
# SERVICES
# ============================================
STATIC_SERVICES = ["mihomo", "vemitreya"]

@app.get("/api/services")
def services_list(_: bool = Auth):
    items = []
    svcs = list(STATIC_SERVICES)

    # Совместимость со старыми установками: если есть mihomo-panel.service —
    # показываем чтобы можно было его остановить/удалить
    legacy = ["mihomo-panel", "vemireya"]
    for old in legacy:
        if os.path.exists(f"/etc/systemd/system/{old}.service"):
            if old not in svcs:
                svcs.append(old)

    if os.path.exists(AWG_DIR):
        for f in os.listdir(AWG_DIR):
            if f.endswith(".conf"):
                svcs.append(f"awg-quick@{f.replace('.conf', '')}")

    if os.path.exists(TRUSTTUNNEL_DIR):
        for f in os.listdir(TRUSTTUNNEL_DIR):
            if f.endswith(".toml"):
                name = f.replace(".toml", "")
                if name.endswith("_socks"): name = name[:-6]
                svc = f"trusttunnel-{name}"
                if svc not in svcs: svcs.append(svc)

    for svc in svcs:
        active = run(["systemctl", "is-active", svc])
        enabled = run(["systemctl", "is-enabled", svc])
        # Помечаем legacy-сервисы чтобы UI мог показать значок «устаревший»
        is_legacy = svc in legacy
        items.append({
            "name": svc,
            "active": active["stdout"].strip() == "active",
            "enabled": enabled["stdout"].strip() == "enabled",
            "legacy": is_legacy,
        })
    return items

@app.post("/api/services/action")
def services_action(data: ServiceAction, _: bool = Auth):
    if data.action not in ("start", "stop", "restart"):
        raise HTTPException(400, "Invalid action")
    r = run(["systemctl", data.action, data.service])
    return {"ok": r["ok"], "output": r["stderr"] or r["stdout"]}

@app.post("/api/services/legacy-remove")
def services_legacy_remove(data: dict, _: bool = Auth):
    """Безопасно удалить устаревший сервис (только из white-list).

    Применяется когда после миграции остался старый mihomo-panel.service
    или vemireya.service — даём пользователю одну кнопку чтобы убрать всё.
    """
    svc = (data.get("service") or "").strip()
    LEGACY_ALLOWED = {"mihomo-panel", "vemireya"}
    if svc not in LEGACY_ALLOWED:
        raise HTTPException(400,
            f"'{svc}' не является устаревшим сервисом. Разрешено удалять только: {sorted(LEGACY_ALLOWED)}")

    unit_path = f"/etc/systemd/system/{svc}.service"
    wants_path = f"/etc/systemd/system/multi-user.target.wants/{svc}.service"

    if not os.path.exists(unit_path) and not os.path.exists(wants_path):
        raise HTTPException(404, f"Сервис {svc}.service не найден в /etc/systemd/system")

    steps = []
    # 1. stop
    r = run(["systemctl", "stop", svc])
    steps.append(f"stop: {'ok' if r['ok'] else r['stderr'][:100]}")
    # 2. disable
    r = run(["systemctl", "disable", svc])
    steps.append(f"disable: {'ok' if r['ok'] else r['stderr'][:100]}")
    # 3. удалить unit-файл
    for p in [unit_path, wants_path]:
        if os.path.exists(p):
            try:
                os.remove(p)
                steps.append(f"removed: {p}")
            except Exception as e:
                steps.append(f"error removing {p}: {e}")
    # 4. daemon-reload + reset-failed
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "reset-failed", svc])
    steps.append("daemon-reload done")

    return {"ok": True, "service": svc, "steps": steps}

# ============================================
# SYSTEM PROXY — использовать Mihomo как прокси для apt/curl
# ============================================
APT_PROXY_FILE = "/etc/apt/apt.conf.d/99vemitreya-proxy"
SYS_ENV_FILE = "/etc/profile.d/vemitreya-proxy.sh"

def _get_mihomo_http_port():
    """Возвращает порт HTTP-прокси Mihomo из config.yaml."""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
        port = cfg.get("port") or cfg.get("mixed-port")
        if port:
            return int(port)
    except Exception:
        pass
    return 7890

@app.get("/api/system-proxy/status")
def system_proxy_status(_: bool = Auth):
    """Проверить установлен ли системный прокси."""
    port = _get_mihomo_http_port()
    apt_enabled = os.path.exists(APT_PROXY_FILE)
    env_enabled = os.path.exists(SYS_ENV_FILE)
    return {
        "enabled": apt_enabled and env_enabled,
        "apt_enabled": apt_enabled,
        "env_enabled": env_enabled,
        "port": port,
        "proxy_url": f"http://127.0.0.1:{port}",
    }

class SystemProxyToggle(BaseModel):
    enable: bool

@app.post("/api/system-proxy")
def system_proxy_toggle(data: SystemProxyToggle, _: bool = Auth):
    """Включить/выключить использование Mihomo как системного прокси.

    Прописывает proxy для apt и для shell environment (через /etc/profile.d/).
    """
    if data.enable:
        port = _get_mihomo_http_port()
        proxy_url = f"http://127.0.0.1:{port}"

        # 1. APT proxy
        try:
            with open(APT_PROXY_FILE, "w") as f:
                f.write(f'Acquire::http::Proxy "{proxy_url}";\n')
                f.write(f'Acquire::https::Proxy "{proxy_url}";\n')
        except Exception as e:
            raise HTTPException(500, f"Не удалось записать {APT_PROXY_FILE}: {e}")

        # 2. Shell environment (для curl/wget/git)
        # Локальные адреса исключаем — чтобы 127.0.0.1:9090 (Mihomo API) и SSH работали напрямую
        try:
            with open(SYS_ENV_FILE, "w") as f:
                f.write("# Vemitreya: системный прокси через Mihomo\n")
                f.write(f'export http_proxy="{proxy_url}"\n')
                f.write(f'export https_proxy="{proxy_url}"\n')
                f.write(f'export HTTP_PROXY="{proxy_url}"\n')
                f.write(f'export HTTPS_PROXY="{proxy_url}"\n')
                f.write('export no_proxy="localhost,127.0.0.1,::1"\n')
                f.write('export NO_PROXY="localhost,127.0.0.1,::1"\n')
            os.chmod(SYS_ENV_FILE, 0o644)
        except Exception as e:
            raise HTTPException(500, f"Не удалось записать {SYS_ENV_FILE}: {e}")

        return {
            "ok": True,
            "enabled": True,
            "proxy_url": proxy_url,
            "message": (
                "Системный прокси включён. "
                "apt будет использовать его сразу, "
                "для shell-сессий перезайдите по SSH или выполните: "
                f'export http_proxy="{proxy_url}" https_proxy="{proxy_url}"'
            )
        }
    else:
        # Выключить — удалить файлы
        removed = []
        for p in [APT_PROXY_FILE, SYS_ENV_FILE]:
            if os.path.exists(p):
                try:
                    os.remove(p)
                    removed.append(p)
                except Exception as e:
                    print(f"[system-proxy] не удалось удалить {p}: {e}", flush=True)

        return {
            "ok": True,
            "enabled": False,
            "removed": removed,
            "message": "Системный прокси выключен. Активные shell-сессии не затронуты — выйдите и зайдите снова."
        }

@app.post("/api/system-proxy/test")
async def system_proxy_test(_: bool = Auth):
    """Проверить — работает ли прокси (через Mihomo достижим ли интернет)."""
    port = _get_mihomo_http_port()
    import asyncio
    try:
        # Используем curl с явным proxy — простейший тест
        proc = await asyncio.create_subprocess_exec(
            "curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
            "--max-time", "5",
            "-x", f"http://127.0.0.1:{port}",
            "https://www.gstatic.com/generate_204",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        code = stdout.decode().strip()
        if code == "204":
            return {"ok": True, "status_code": code, "message": "Прокси работает, интернет доступен"}
        else:
            return {"ok": False, "status_code": code,
                    "stderr": stderr.decode()[:200],
                    "message": f"Прокси отвечает но не работает (код {code})"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ============================================
# MIHOMO PORTS — управление портами через UI
# ============================================
PORT_FIELDS = {
    "mixed-port": "Mixed (HTTP+SOCKS5)",
    "port": "HTTP",
    "socks-port": "SOCKS5",
    "redir-port": "REDIR (Linux iptables)",
    "tproxy-port": "TPROXY (Linux transparent)",
}

@app.get("/api/mihomo/ports")
def mihomo_ports_get(_: bool = Auth):
    """Возвращает текущие порты из config.yaml."""
    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    result = {}
    for field, label in PORT_FIELDS.items():
        v = cfg.get(field)
        # Может быть int, str или None
        port = None
        if v is not None:
            try:
                port = int(v)
            except (TypeError, ValueError):
                port = None
        result[field] = {"label": label, "value": port}
    return result

class MihomoPortsUpdate(BaseModel):
    ports: Dict[str, Optional[int]]  # {"mixed-port": 7890, "port": 7891, ...}

@app.put("/api/mihomo/ports")
async def mihomo_ports_set(data: MihomoPortsUpdate, _: bool = Auth):
    """Обновляет порты. Валидация: 1024-65535 или None (отключить).
    Проверка дубликатов. Сохранение + reload."""
    # Валидация
    for field, port in data.ports.items():
        if field not in PORT_FIELDS:
            raise HTTPException(400, f"Неизвестное поле: {field}")
        if port is None or port == 0:
            continue  # отключение порта — OK
        try:
            port = int(port)
        except (TypeError, ValueError):
            raise HTTPException(400, f"{field}: '{port}' не число")
        if port < 1 or port > 65535:
            raise HTTPException(400, f"{field}: порт {port} вне диапазона 1-65535")
        if port < 1024:
            raise HTTPException(400,
                f"{field}: порт {port} зарезервирован (нужен root). "
                f"Используйте порт ≥ 1024.")

    # Проверка дубликатов среди задействованных портов
    used = {}
    for field, port in data.ports.items():
        if port and port > 0:
            if port in used:
                raise HTTPException(400,
                    f"Дубликат: {field} и {used[port]} оба используют порт {port}")
            used[port] = field

    # Применяем
    cfg = yaml_load(MIHOMO_CONFIG)
    for field, port in data.ports.items():
        if port is None or port == 0:
            # Удаляем поле если оно есть
            if field in cfg:
                del cfg[field]
        else:
            cfg[field] = int(port)

    backup = backup_file(MIHOMO_CONFIG)
    yaml_dump(cfg, MIHOMO_CONFIG)

    # Валидация конфига перед reload
    r_test = run(["/usr/local/bin/mihomo", "-d", "/opt/mihomo", "-f", MIHOMO_CONFIG, "-t"], timeout=10)
    if not r_test["ok"]:
        # Откат
        try:
            import shutil
            shutil.copy2(backup, MIHOMO_CONFIG)
        except Exception:
            pass
        raise HTTPException(400, f"Mihomo отклонил конфиг: {r_test['stderr'][:200]}")

    try:
        await reload_mihomo()
    except Exception as e:
        print(f"[ports_set] reload failed: {e}", flush=True)

    return {"ok": True, "backup": backup, "applied": data.ports}

# ============================================
# LOGS
# ============================================
@app.get("/api/logs/{service}")
def logs_get(service: str, lines: int = 200, _: bool = Auth):
    r = run(["journalctl", "-u", service, "-n", str(lines), "--no-pager"], timeout=15)
    return {"service": service, "logs": r["stdout"]}

# ============================================
# EMERGENCY SSH RESTORE — выключить все AWG туннели
# ============================================
@app.post("/api/awg/emergency-stop-all")
def awg_emergency_stop_all(_: bool = Auth):
    """Аварийное выключение всех AWG туннелей.
    Используется когда туннель сломал маршрутизацию и SSH/доступ к VM пропал.
    После этого можно безопасно отредактировать конфиг и запустить заново."""
    log = []
    if not os.path.isdir(AWG_DIR):
        return {"ok": True, "log": ["AWG_DIR не существует"]}

    for f in sorted(os.listdir(AWG_DIR)):
        if f.endswith(".conf"):
            name = f.replace(".conf", "")
            r_st = run(["systemctl", "stop", f"awg-quick@{name}"])
            log.append(f"stop awg-quick@{name}: {'ok' if r_st['ok'] else r_st['stderr'][:80]}")
            r_dn = run(["ip", "link", "delete", name])
            if r_dn["ok"]:
                log.append(f"link delete {name}: ok")

    # Дополнительно — попробуем удалить любые маршруты которые туннели могли оставить
    run(["ip", "route", "flush", "table", "main", "dev", "awg0"])
    run(["ip", "route", "flush", "table", "main", "dev", "awg1"])

    return {"ok": True, "log": log,
            "message": "Все AWG туннели выключены. Маршрутизация восстановлена."}

# ============================================
# CONFIG EXPORT / IMPORT
# ============================================
import tarfile
import io
import json as _json
from fastapi.responses import StreamingResponse

EXPORT_VERSION = "1.0"

def _scan_awg_files():
    """Возвращает список (name, content) AWG конфигов."""
    items = []
    if os.path.isdir(AWG_DIR):
        for f in sorted(os.listdir(AWG_DIR)):
            if f.endswith(".conf"):
                p = os.path.join(AWG_DIR, f)
                try:
                    with open(p, "r", encoding="utf-8") as fh:
                        items.append({"name": f, "content": fh.read()})
                except Exception as e:
                    print(f"[export] read awg {f}: {e}", flush=True)
    return items

def _discover_tt_configs():
    """Находит все TT .toml-конфиги через парсинг systemd unit-файлов.

    Это надёжнее чем просто scan TRUSTTUNNEL_DIR, потому что разные установки
    могут использовать разные пути:
      - /opt/trusttunnel_client/configs/  (наш install.sh, с подчёркиванием)
      - /opt/trusttunnel-client/configs/  (официальный установщик, с дефисом)
      - кастомные пути

    Returns: list of dict {service_name, config_path, exists}
    """
    results = []
    seen_paths = set()
    systemd_dir = "/etc/systemd/system"

    if os.path.isdir(systemd_dir):
        for fn in sorted(os.listdir(systemd_dir)):
            if not fn.startswith("trusttunnel-") or not fn.endswith(".service"):
                continue
            unit_path = os.path.join(systemd_dir, fn)
            if not os.path.isfile(unit_path):
                continue
            try:
                with open(unit_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            # Найти ExecStart=... -c <path>.toml
            m = re.search(r'ExecStart=.*?-c\s+(\S+\.toml)', content)
            if not m:
                continue

            cfg_path = m.group(1)
            if cfg_path in seen_paths:
                continue
            seen_paths.add(cfg_path)

            service_name = fn.replace(".service", "")
            results.append({
                "service": service_name,
                "config_path": cfg_path,
                "exists": os.path.exists(cfg_path),
            })

    # Дополнительно — конфиги в стандартной папке которые НЕ привязаны к сервисам
    for d in [TRUSTTUNNEL_DIR, "/opt/trusttunnel-client/configs"]:
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                if not f.endswith(".toml"): continue
                p = os.path.join(d, f)
                if p in seen_paths: continue
                seen_paths.add(p)
                results.append({
                    "service": None,
                    "config_path": p,
                    "exists": True,
                })

    return results


def _scan_tt_files():
    """Возвращает список (name, content) ВСЕХ TT TOML конфигов через systemd discovery."""
    items = []
    discovered = _discover_tt_configs()
    for entry in discovered:
        if not entry["exists"]:
            continue
        path = entry["config_path"]
        try:
            with open(path, "r", encoding="utf-8") as fh:
                # Используем basename для arcname в архиве — а сам путь сохраним
                # как "ext_path" в metadata если нужно потом восстановить ровно сюда
                items.append({
                    "name": os.path.basename(path),
                    "content": fh.read(),
                    "src_path": path,
                    "service": entry["service"],
                })
        except Exception as e:
            print(f"[export tt] read {path}: {e}", flush=True)
    return items

def _scan_providers_files():
    """Возвращает providers/*.yaml (содержимое подписок)."""
    items = []
    pdir = os.path.join(os.path.dirname(MIHOMO_CONFIG), "..", "providers")
    pdir = os.path.normpath(pdir)
    if not os.path.isdir(pdir):
        pdir = "/opt/mihomo/providers"
    if os.path.isdir(pdir):
        for f in sorted(os.listdir(pdir)):
            if f.endswith((".yaml", ".yml")):
                p = os.path.join(pdir, f)
                try:
                    with open(p, "r", encoding="utf-8") as fh:
                        items.append({"name": f, "content": fh.read()})
                except Exception as e:
                    print(f"[export] read provider {f}: {e}", flush=True)
    return items

@app.get("/api/config/export")
async def config_export(type: str = "full", _: bool = Auth):
    """Экспорт в .tar.gz. type ∈ {full, tunnels, rules}"""
    if type not in ("full", "tunnels", "rules"):
        raise HTTPException(400, f"Invalid type '{type}'. Use: full, tunnels, rules")

    try:
        cfg = yaml_load(MIHOMO_CONFIG)
    except Exception as e:
        raise HTTPException(500, f"Не удалось распарсить config.yaml: {e}")

    awg_files = _scan_awg_files() if type in ("full", "tunnels") else []
    tt_files = _scan_tt_files() if type in ("full", "tunnels") else []
    providers = _scan_providers_files() if type == "full" else []

    # Считаем элементы для manifest
    items_count = {
        "mihomo_groups": len(cfg.get("proxy-groups") or []) if type == "full" else 0,
        "mihomo_rules": len(cfg.get("rules") or []) if type in ("full", "rules") else 0,
        "mihomo_proxies": len(cfg.get("proxies") or []) if type == "full" else 0,
        "awg_tunnels": len(awg_files),
        "tt_tunnels": len(tt_files),
        "providers": len(providers),
    }

    manifest = {
        "type": type,
        "version": PANEL_VERSION,
        "export_format_version": EXPORT_VERSION,
        "exported_at": datetime.now().isoformat() + "Z",
        "source_host": socket.gethostname(),
        "items": items_count,
    }

    # Собираем tar.gz в памяти
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        # manifest
        manifest_bytes = _json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")
        info = tarfile.TarInfo("manifest.json")
        info.size = len(manifest_bytes)
        info.mtime = int(time.time())
        tar.addfile(info, io.BytesIO(manifest_bytes))

        if type == "full":
            # mihomo/config.yaml целиком
            tar.add(MIHOMO_CONFIG, arcname="mihomo/config.yaml")
            for prov in providers:
                content = prov["content"].encode("utf-8")
                info = tarfile.TarInfo(f"mihomo/providers/{prov['name']}")
                info.size = len(content); info.mtime = int(time.time())
                tar.addfile(info, io.BytesIO(content))
        elif type == "rules":
            # только секция rules
            rules_only = {
                "rules": cfg.get("rules") or []
            }
            from io import StringIO
            sio = StringIO()
            yaml_obj.dump(rules_only, sio)
            content = sio.getvalue().encode("utf-8")
            info = tarfile.TarInfo("mihomo/rules-only.yaml")
            info.size = len(content); info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(content))

        for awg in awg_files:
            content = awg["content"].encode("utf-8")
            info = tarfile.TarInfo(f"awg/{awg['name']}")
            info.size = len(content); info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(content))

        for tt in tt_files:
            content = tt["content"].encode("utf-8")
            info = tarfile.TarInfo(f"trusttunnel/{tt['name']}")
            info.size = len(content); info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(content))

    buf.seek(0)
    fname = f"vemitreya-{type}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.tar.gz"
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"'
        }
    )


@app.post("/api/config/import/preview")
async def config_import_preview(file: UploadFile = File(...), _: bool = Auth):
    """Распаковывает .tar.gz, возвращает manifest + diff с текущим состоянием.
    НЕ применяет изменения. Возвращает staging_id для последующего apply."""
    raw = await file.read()
    if len(raw) > 50 * 1024 * 1024:  # 50 MB лимит
        raise HTTPException(413, "Архив > 50 MB — слишком большой")

    # Распаковываем в стейджинг
    staging_root = "/opt/vemitreya/staging"
    os.makedirs(staging_root, exist_ok=True)
    staging_id = f"import-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{os.urandom(4).hex()}"
    staging_dir = os.path.join(staging_root, staging_id)
    os.makedirs(staging_dir)

    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
            # Безопасная распаковка — никаких path traversal
            for member in tar.getmembers():
                if member.name.startswith("/") or ".." in member.name:
                    raise HTTPException(400, f"Небезопасный путь в архиве: {member.name}")
                if member.size > 10 * 1024 * 1024:
                    raise HTTPException(400, f"Файл {member.name} > 10 MB — подозрительно")
            tar.extractall(staging_dir, filter='data')
    except tarfile.ReadError:
        raise HTTPException(400, "Не удалось прочитать архив (битый .tar.gz?)")

    # Читаем manifest
    manifest_path = os.path.join(staging_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        # Чистим
        import shutil
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise HTTPException(400, "В архиве нет manifest.json — это не экспорт Vemitreya")
    try:
        with open(manifest_path) as f:
            manifest = _json.load(f)
    except Exception as e:
        raise HTTPException(400, f"manifest.json битый: {e}")

    # Собираем что есть в архиве
    diff = {"manifest": manifest, "staging_id": staging_id, "items": {}}

    # AWG
    awg_dir_in_archive = os.path.join(staging_dir, "awg")
    new_awg = []
    if os.path.isdir(awg_dir_in_archive):
        existing_awg = set(os.listdir(AWG_DIR)) if os.path.isdir(AWG_DIR) else set()
        for f in sorted(os.listdir(awg_dir_in_archive)):
            if f.endswith(".conf"):
                new_awg.append({
                    "name": f,
                    "exists": f in existing_awg,
                })
    diff["items"]["awg"] = new_awg

    # TT
    tt_dir_in_archive = os.path.join(staging_dir, "trusttunnel")
    new_tt = []
    if os.path.isdir(tt_dir_in_archive):
        existing_tt = set(os.listdir(TRUSTTUNNEL_DIR)) if os.path.isdir(TRUSTTUNNEL_DIR) else set()
        for f in sorted(os.listdir(tt_dir_in_archive)):
            if f.endswith(".toml"):
                new_tt.append({
                    "name": f,
                    "exists": f in existing_tt,
                })
    diff["items"]["tt"] = new_tt

    # Mihomo config
    config_in_archive = os.path.join(staging_dir, "mihomo/config.yaml")
    rules_in_archive = os.path.join(staging_dir, "mihomo/rules-only.yaml")
    diff["items"]["has_full_config"] = os.path.exists(config_in_archive)
    diff["items"]["has_rules_only"] = os.path.exists(rules_in_archive)

    if os.path.exists(rules_in_archive):
        try:
            ro = yaml_load(rules_in_archive)
            diff["items"]["new_rules_count"] = len(ro.get("rules") or [])
        except Exception:
            diff["items"]["new_rules_count"] = 0
    if os.path.exists(config_in_archive):
        try:
            new_cfg = yaml_load(config_in_archive)
            diff["items"]["new_config_summary"] = {
                "proxies": len(new_cfg.get("proxies") or []),
                "groups": len(new_cfg.get("proxy-groups") or []),
                "rules": len(new_cfg.get("rules") or []),
            }
        except Exception as e:
            diff["items"]["new_config_summary"] = {"error": str(e)}

    # Providers
    providers_in_archive = os.path.join(staging_dir, "mihomo/providers")
    if os.path.isdir(providers_in_archive):
        diff["items"]["providers"] = sorted([
            f for f in os.listdir(providers_in_archive)
            if f.endswith((".yaml", ".yml"))
        ])
    else:
        diff["items"]["providers"] = []

    return diff


class ConfigImportApply(BaseModel):
    staging_id: str
    do_backup: bool = True
    awg_mode: str = "merge"   # merge | replace | skip_existing
    tt_mode: str = "merge"
    rules_mode: str = "merge"  # merge | replace
    apply_full_config: bool = False
    apply_providers: bool = False


@app.post("/api/config/import/apply")
async def config_import_apply(opts: ConfigImportApply, _: bool = Auth):
    """Применяет импорт из стейджинга."""
    staging_root = "/opt/vemitreya/staging"
    staging_dir = os.path.join(staging_root, opts.staging_id)

    if not os.path.isdir(staging_dir) or ".." in opts.staging_id or "/" in opts.staging_id:
        raise HTTPException(400, "Невалидный staging_id")

    log = []

    # 1. Backup всего что трогаем
    if opts.do_backup:
        backup_root = "/opt/vemitreya/backups"
        os.makedirs(backup_root, exist_ok=True)
        bk_path = os.path.join(backup_root,
                               f"import-rollback-{datetime.now().strftime('%Y%m%d-%H%M%S')}.tar.gz")
        with tarfile.open(bk_path, "w:gz") as tar:
            if os.path.exists(MIHOMO_CONFIG):
                tar.add(MIHOMO_CONFIG, arcname="mihomo/config.yaml")
            if os.path.isdir(AWG_DIR):
                tar.add(AWG_DIR, arcname="awg")
            if os.path.isdir(TRUSTTUNNEL_DIR):
                tar.add(TRUSTTUNNEL_DIR, arcname="trusttunnel")
        log.append(f"Backup создан: {bk_path}")

    # 2. AWG
    awg_src = os.path.join(staging_dir, "awg")
    awg_imported_names = []
    if os.path.isdir(awg_src):
        if opts.awg_mode == "replace":
            # Удаляем существующие awg-quick@* и .conf
            if os.path.isdir(AWG_DIR):
                for f in os.listdir(AWG_DIR):
                    if f.endswith(".conf"):
                        name = f.replace(".conf", "")
                        run(["systemctl", "stop", f"awg-quick@{name}"])
                        run(["systemctl", "disable", f"awg-quick@{name}"])
                        try:
                            os.remove(os.path.join(AWG_DIR, f))
                            log.append(f"Удалён старый AWG: {f}")
                        except Exception as e:
                            log.append(f"Ошибка удаления {f}: {e}")
        os.makedirs(AWG_DIR, exist_ok=True)
        for f in os.listdir(awg_src):
            if not f.endswith(".conf"): continue
            dst = os.path.join(AWG_DIR, f)
            if os.path.exists(dst) and opts.awg_mode == "skip_existing":
                log.append(f"Пропуск AWG {f} (уже существует)")
                continue

            # Читаем конфиг и принудительно добавляем Table = off если его нет
            # Это критично для безопасности — без Table=off AWG ставит default-route и SSH рвётся
            with open(os.path.join(awg_src, f), "r", encoding="utf-8") as fh:
                content = fh.read()

            # защитная нормализация — конфиги из AmneziaVPN-приложения
            # иногда приходят с CRLF, без trailing \n, или со склеенными ключами.
            # Это вызывает `Unable to modify interface: Invalid argument` в kernel module.
            content = content.replace("\r\n", "\n").replace("\r", "\n")
            if not content.endswith("\n"):
                content += "\n"
            # Разделить склеенные ключи AWG: если после значения сразу идёт другой
            # ключ без \n — вставить \n. Защита от багов парсеров.
            AWG_KEYS = [
                "Address", "DNS", "PrivateKey", "PublicKey", "PresharedKey",
                "Endpoint", "AllowedIPs", "PersistentKeepalive",
                "MTU", "Table", "PostUp", "PostDown", "PreUp", "PreDown",
                "Jc", "Jmin", "Jmax", "S1", "S2", "S3", "S4",
                "H1", "H2", "H3", "H4", "I1", "I2", "I3", "I4", "I5",
                "J1", "J2", "J3",
            ]
            # Регексп: находим (\S)(KeyName\s*=) без \n между ними и вставляем \n
            for key in AWG_KEYS:
                # \S перед KeyName означает что нет \n или пробела (то есть склейка)
                pattern = re.compile(r'(\S)(' + re.escape(key) + r'\s*=)')
                # Подставляем \n между ними
                content = pattern.sub(r'\1\n\2', content)

            has_table = bool(re.search(r'^\s*Table\s*=', content, re.MULTILINE))
            if not has_table:
                # Вставляем Table = off в секцию [Interface] перед первой пустой строкой или [Peer]
                lines = content.split("\n")
                new_lines = []
                in_interface = False
                inserted = False
                for line in lines:
                    stripped = line.strip()
                    if stripped == "[Interface]":
                        in_interface = True
                        new_lines.append(line)
                        continue
                    if in_interface and not inserted and (stripped.startswith("[") or stripped == ""):
                        # Вставляем перед началом следующей секции или пустой строки
                        new_lines.append("")
                        new_lines.append("# AUTO: добавлено при импорте Vemitreya — защита от потери SSH")
                        new_lines.append("Table = off")
                        inserted = True
                        in_interface = False
                    new_lines.append(line)
                # Если не нашли куда вставить — добавим в конец секции (на случай если файл кончается без [Peer])
                if not inserted and in_interface:
                    new_lines.append("")
                    new_lines.append("# AUTO: добавлено при импорте Vemitreya — защита от потери SSH")
                    new_lines.append("Table = off")
                content = "\n".join(new_lines)
                log.append(f"⚠ В {f} добавлено 'Table = off' для безопасности (SSH не пропадёт)")

            with open(dst, "w", encoding="utf-8") as fh:
                fh.write(content)
            os.chmod(dst, 0o600)

            tunnel_name = f.replace(".conf", "")
            awg_imported_names.append(tunnel_name)
            log.append(f"Импортирован AWG: {f}")

        # daemon-reload + enable + start для всех импортированных
        if awg_imported_names:
            run(["systemctl", "daemon-reload"])
            for name in awg_imported_names:
                r_en = run(["systemctl", "enable", f"awg-quick@{name}"])
                r_st = run(["systemctl", "start", f"awg-quick@{name}"])
                if r_st["ok"]:
                    log.append(f"✓ AWG {name} запущен")
                else:
                    log.append(f"⚠ AWG {name}: {r_st['stderr'][:120]}")

    # 3. TT
    tt_src = os.path.join(staging_dir, "trusttunnel")
    tt_imported_names = []  # имя без _socks.toml
    if os.path.isdir(tt_src):
        if opts.tt_mode == "replace":
            if os.path.isdir(TRUSTTUNNEL_DIR):
                for f in os.listdir(TRUSTTUNNEL_DIR):
                    if f.endswith(".toml"):
                        name = f.replace("_socks.toml", "").replace(".toml", "")
                        run(["systemctl", "stop", f"trusttunnel-{name}"])
                        run(["systemctl", "disable", f"trusttunnel-{name}"])
                        try:
                            os.remove(os.path.join(TRUSTTUNNEL_DIR, f))
                            log.append(f"Удалён старый TT: {f}")
                        except Exception as e:
                            log.append(f"Ошибка удаления {f}: {e}")
                        # Удалить unit-файл тоже
                        unit_path = f"/etc/systemd/system/trusttunnel-{name}.service"
                        if os.path.exists(unit_path):
                            try:
                                os.remove(unit_path)
                                log.append(f"Удалён unit: trusttunnel-{name}.service")
                            except Exception:
                                pass

        os.makedirs(TRUSTTUNNEL_DIR, exist_ok=True)
        TRUSTTUNNEL_BIN = "/opt/trusttunnel_client/trusttunnel_client"

        for f in os.listdir(tt_src):
            if not f.endswith(".toml"): continue
            dst = os.path.join(TRUSTTUNNEL_DIR, f)
            if os.path.exists(dst) and opts.tt_mode == "skip_existing":
                log.append(f"Пропуск TT {f} (уже существует)")
                continue
            import shutil
            shutil.copy2(os.path.join(tt_src, f), dst)
            os.chmod(dst, 0o644)
            log.append(f"Импортирован TT: {f}")

            # Извлекаем имя для systemd (с suffix _socks или без)
            tt_name = f.replace("_socks.toml", "").replace(".toml", "")
            tt_imported_names.append((tt_name, dst))

        # Создаём systemd units и запускаем
        if tt_imported_names:
            # Проверка что бинарь установлен
            if not os.path.isfile(TRUSTTUNNEL_BIN):
                log.append(f"⚠ TrustTunnel бинарь не найден ({TRUSTTUNNEL_BIN}). "
                           f"Установите через ./install.sh → 5. Конфиги скопированы, "
                           f"сервисы НЕ запущены.")
            else:
                for tt_name, tt_path in tt_imported_names:
                    unit_path = f"/etc/systemd/system/trusttunnel-{tt_name}.service"
                    unit = f"""[Unit]
Description=TrustTunnel Client - {tt_name}
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart={TRUSTTUNNEL_BIN} -c {tt_path}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
                    try:
                        with open(unit_path, "w") as fh:
                            fh.write(unit)
                        log.append(f"Создан unit: trusttunnel-{tt_name}.service")
                    except Exception as e:
                        log.append(f"⚠ Не удалось создать unit для {tt_name}: {e}")
                        continue

                run(["systemctl", "daemon-reload"])

                for tt_name, _ in tt_imported_names:
                    r_en = run(["systemctl", "enable", f"trusttunnel-{tt_name}"])
                    r_st = run(["systemctl", "start", f"trusttunnel-{tt_name}"])
                    if r_st["ok"]:
                        log.append(f"✓ TT {tt_name} запущен")
                    else:
                        log.append(f"⚠ TT {tt_name}: {r_st['stderr'][:120]}")

    # 4. Rules или Full config
    full_cfg_src = os.path.join(staging_dir, "mihomo/config.yaml")
    rules_src = os.path.join(staging_dir, "mihomo/rules-only.yaml")

    if opts.apply_full_config and os.path.exists(full_cfg_src):
        # Сначала валидируем
        r = run(["/usr/local/bin/mihomo", "-d", "/opt/mihomo", "-f", full_cfg_src, "-t"], timeout=15)
        if not r["ok"]:
            log.append(f"❌ Импортированный config невалидный: {r['stderr'][:200]}")
            raise HTTPException(400, f"Импортированный config.yaml невалидный: {r['stderr'][:300]}")
        backup_file(MIHOMO_CONFIG)
        import shutil
        shutil.copy2(full_cfg_src, MIHOMO_CONFIG)
        log.append("Импортирован полный config.yaml")
    elif os.path.exists(rules_src):
        try:
            new_rules = yaml_load(rules_src).get("rules") or []
            cur = yaml_load(MIHOMO_CONFIG)
            if opts.rules_mode == "replace":
                cur["rules"] = new_rules
                log.append(f"Заменены все правила ({len(new_rules)} шт)")
            else:  # merge
                existing = set(str(r).strip() for r in (cur.get("rules") or []))
                added = 0
                for nr in new_rules:
                    if str(nr).strip() not in existing:
                        if cur.get("rules") is None: cur["rules"] = []
                        cur["rules"].append(nr)
                        added += 1
                log.append(f"Добавлено новых правил: {added}")
            backup_file(MIHOMO_CONFIG)
            yaml_dump(cur, MIHOMO_CONFIG)
        except Exception as e:
            log.append(f"❌ Ошибка применения правил: {e}")

    # 5. Providers (опционально)
    if opts.apply_providers:
        prov_src = os.path.join(staging_dir, "mihomo/providers")
        if os.path.isdir(prov_src):
            prov_dst = "/opt/mihomo/providers"
            os.makedirs(prov_dst, exist_ok=True)
            import shutil
            for f in os.listdir(prov_src):
                if f.endswith((".yaml", ".yml")):
                    shutil.copy2(os.path.join(prov_src, f), os.path.join(prov_dst, f))
                    log.append(f"Импортирован provider: {f}")

    # 6. Reload mihomo + reload daemon
    run(["systemctl", "daemon-reload"])
    try:
        await reload_mihomo()
        log.append("Mihomo перезагружен")
    except Exception as e:
        log.append(f"Mihomo reload error: {e}")

    # Чистим staging
    import shutil
    shutil.rmtree(staging_dir, ignore_errors=True)
    log.append("Staging очищен")

    return {"ok": True, "log": log}


@app.delete("/api/config/import/staging/{staging_id}")
def config_import_staging_clear(staging_id: str, _: bool = Auth):
    """Удалить staging без применения."""
    if ".." in staging_id or "/" in staging_id:
        raise HTTPException(400, "Невалидный staging_id")
    staging_dir = os.path.join("/opt/vemitreya/staging", staging_id)
    if os.path.isdir(staging_dir):
        import shutil
        shutil.rmtree(staging_dir, ignore_errors=True)
    return {"ok": True}


# ============================================
# WEBSOCKETS
# ============================================
@app.websocket("/ws/traffic")
async def ws_traffic(ws: WebSocket):
    await ws.accept()
    try:
        auth = await ws.receive_json()
        if auth.get("token") != API_TOKEN:
            await ws.close(code=1008); return
        while True:
            await ws.send_json(collector.current_traffic)
            await asyncio.sleep(0.5)  # 2 update/sec — для более плавной анимации
    except WebSocketDisconnect: pass

@app.websocket("/ws/logs/{service}")
async def ws_logs(ws: WebSocket, service: str):
    await ws.accept()
    proc = None
    try:
        auth = await ws.receive_json()
        if auth.get("token") != API_TOKEN:
            await ws.close(code=1008); return
        proc = await asyncio.create_subprocess_exec(
            "journalctl", "-u", service, "-f", "-n", "50", "--no-pager",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        while True:
            line = await proc.stdout.readline()
            if not line: break
            await ws.send_text(line.decode(errors="replace"))
    except WebSocketDisconnect: pass
    finally:
        if proc:
            try: proc.terminate()
            except Exception: pass

# ============================================
# CONNECTIONS
# ============================================
@app.get("/api/proxies/traffic")
def proxies_traffic(_: bool = Auth):
    """
    Текущая скорость трафика (B/s) по каждому прокси/группе из активных соединений.
    Считается на стороне сервера в Collector каждые 2с по delta.
    """
    return collector.proxy_speed

@app.get("/api/proxies/traffic/debug")
async def proxies_traffic_debug(_: bool = Auth):
    """Сырые данные из /connections — для диагностики (почему AWG/TT не показывают трафик)."""
    try:
        data = await mihomo("GET", "/connections")
    except Exception as e:
        return {"error": str(e)}
    conns = data.get("connections", [])
    sample = []
    for c in conns[:30]:
        meta = c.get("metadata", {})
        sample.append({
            "host": meta.get("host"),
            "dst_ip": meta.get("destinationIP"),
            "chains": c.get("chains"),
            "proxy": c.get("proxy"),
            "rule": c.get("rule"),
            "rulePayload": c.get("rulePayload"),
            "upload": c.get("upload"),
            "download": c.get("download"),
        })
    # Какие имена сейчас попадают в proxy_speed
    return {
        "total_connections": len(conns),
        "sample": sample,
        "tracked_proxies": list(collector.proxy_speed.keys()),
        "speeds": collector.proxy_speed,
    }

@app.get("/api/connections")
async def connections_all(limit: int = 200, _: bool = Auth):
    try:
        data = await mihomo("GET", "/connections")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Не удалось получить соединения от Mihomo: {e}")

    if not isinstance(data, dict):
        return {"connections": [], "total": 0, "uploadTotal": 0, "downloadTotal": 0}

    conns_raw = data.get("connections")
    # Mihomo иногда возвращает null или другой тип — приводим к list
    if not isinstance(conns_raw, list):
        conns_raw = []

    result = []
    for c in conns_raw[:limit]:
        try:
            if not isinstance(c, dict):
                continue
            m = c.get("metadata") if isinstance(c.get("metadata"), dict) else {}
            chains = c.get("chains")
            if not isinstance(chains, list):
                chains = []
            result.append({
                "id": c.get("id"),
                "host": m.get("host") or m.get("destinationIP"),
                "port": m.get("destinationPort"),
                "network": m.get("network"),
                "source": f"{m.get('sourceIP','')}:{m.get('sourcePort','')}",
                "chains": chains,
                "upload": c.get("upload", 0) or 0,
                "download": c.get("download", 0) or 0,
                "start": c.get("start"),
                "rule": c.get("rule"),
            })
        except Exception:
            continue  # битое соединение пропускаем
    return {
        "connections": result,
        "total": len(conns_raw),
        "uploadTotal": data.get("uploadTotal", 0) or 0,
        "downloadTotal": data.get("downloadTotal", 0) or 0,
    }

@app.delete("/api/connections")
async def connections_close_all(_: bool = Auth):
    await mihomo("DELETE", "/connections")
    return {"ok": True}

@app.post("/api/connections/close-by-chain")
async def connections_close_by_chain(data: dict, _: bool = Auth):
    """закрыть активные соединения через указанную группу (по chains)."""
    chain = (data or {}).get("chain", "")
    if not chain:
        raise HTTPException(400, "chain required")
    closed = 0
    try:
        conns = await mihomo("GET", "/connections")
        for c in (conns or {}).get("connections", []) or []:
            if chain in (c.get("chains") or []):
                cid = c.get("id")
                if cid:
                    try:
                        await mihomo("DELETE", f"/connections/{cid}")
                        closed += 1
                    except Exception:
                        pass
    except Exception as e:
        raise HTTPException(502, f"Mihomo: {e}")
    return {"ok": True, "closed": closed}

# умный автовыбор быстрейшего члена группы.
# Настройки per-group в settings.smart_config (JSON):
#   {"<имя группы>": {"interval": 30, "tolerance": 0, "exclude": "Russia, Mobile"}}
# Наличие ключа = умный автовыбор включён для группы.

def _smart_load_config() -> dict:
    """Читает per-group конфиг. Мигрирует старый формат (smart_groups CSV +
    глобальные interval/tolerance/exclude) в per-group при первом чтении."""
    conn = db()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key='smart_config'").fetchone()
        if row and row["value"]:
            try:
                return json.loads(row["value"]) or {}
            except Exception:
                pass
        # Миграция из старого формата
        g = conn.execute("SELECT value FROM settings WHERE key='smart_groups'").fetchone()
        i = conn.execute("SELECT value FROM settings WHERE key='smart_interval'").fetchone()
        t = conn.execute("SELECT value FROM settings WHERE key='smart_tolerance'").fetchone()
        e = conn.execute("SELECT value FROM settings WHERE key='smart_exclude'").fetchone()
        groups = [s.strip() for s in (g["value"].split(",") if g and g["value"] else []) if s.strip()]
        interval = int(i["value"]) if i and i["value"] else 60
        tolerance = int(t["value"]) if t and t["value"] else 0
        exclude = e["value"] if e and e["value"] else ""
        cfg = {name: {"interval": interval, "tolerance": tolerance, "exclude": exclude}
               for name in groups}
        if cfg:
            conn.execute("INSERT INTO settings(key, value) VALUES('smart_config', ?) "
                         "ON CONFLICT(key) DO UPDATE SET value=?",
                         (json.dumps(cfg, ensure_ascii=False), json.dumps(cfg, ensure_ascii=False)))
            conn.commit()
        return cfg
    finally:
        conn.close()

def _smart_save_config(cfg: dict):
    conn = db()
    try:
        v = json.dumps(cfg, ensure_ascii=False)
        conn.execute("INSERT INTO settings(key, value) VALUES('smart_config', ?) "
                     "ON CONFLICT(key) DO UPDATE SET value=?", (v, v))
        conn.commit()
    finally:
        conn.close()

@app.get("/api/mihomo/smart-groups")
def smart_groups_get(_: bool = Auth):
    """Обратная совместимость: отдаёт список групп + дефолтные настройки.
    Для per-group используйте /api/mihomo/smart-config."""
    cfg = _smart_load_config()
    groups = list(cfg.keys())
    # дефолты — из первой группы или базовые
    first = next(iter(cfg.values()), {})
    return {"groups": groups,
            "interval": first.get("interval", 60),
            "tolerance": first.get("tolerance", 0),
            "exclude": first.get("exclude", ""),
            "config": cfg}

@app.post("/api/mihomo/smart-groups")
def smart_groups_set(data: dict, _: bool = Auth):
    """Обратная совместимость: задаёт список умных групп. Новым группам — дефолты
    или переданные interval/tolerance/exclude; существующим сохраняет их настройки."""
    groups = data.get("groups") or []
    interval = data.get("interval", 60)
    tolerance = data.get("tolerance", 0)
    exclude = data.get("exclude", "")
    cfg = _smart_load_config()
    new_cfg = {}
    for g in groups:
        g = str(g).strip()
        if not g:
            continue
        if g in cfg:
            new_cfg[g] = cfg[g]  # сохраняем существующие настройки группы
        else:
            new_cfg[g] = {"interval": int(interval), "tolerance": int(tolerance),
                          "exclude": str(exclude)}
    _smart_save_config(new_cfg)
    return {"ok": True, "groups": list(new_cfg.keys())}

@app.get("/api/mihomo/smart-config")
def smart_config_get(_: bool = Auth):
    """полный per-group конфиг умного автовыбора."""
    return {"config": _smart_load_config()}

@app.post("/api/mihomo/smart-config")
def smart_config_set(data: dict, _: bool = Auth):
    """настройки одной группы. body: {group, enabled, interval,
    tolerance, exclude}. enabled=false сохраняет конфиг, но отключает автовыбор
    для этой группы (чтобы при повторном включении настройки сохранились)."""
    group = (data or {}).get("group", "").strip()
    if not group:
        raise HTTPException(400, "group required")
    cfg = _smart_load_config()
    existing = cfg.get(group, {})
    enabled_in = data.get("enabled")
    # Если не передали interval/tolerance/exclude — сохраняем существующие.
    cfg[group] = {
        "interval": int(data.get("interval", existing.get("interval", 60))),
        "tolerance": int(data.get("tolerance", existing.get("tolerance", 0))),
        "exclude": str(data.get("exclude", existing.get("exclude", ""))),
        "enabled": (False if enabled_in is False
                    else True if enabled_in is True
                    else existing.get("enabled", True)),
    }
    _smart_save_config(cfg)
    return {"ok": True, "config": cfg}

# ============================================
# TELEGRAM
# ============================================
@app.get("/api/telegram/settings")
def tg_settings(_: bool = Auth):
    conn = db()
    rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE 'tg_%'").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

@app.put("/api/telegram/settings")
def tg_settings_put(s: dict, _: bool = Auth):
    conn = db()
    for k, v in s.items():
        if k.startswith("tg_"):
            conn.execute(
                "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, str(v)))
    conn.commit(); conn.close()
    return {"ok": True}

@app.post("/api/telegram/test")
async def tg_test(_: bool = Auth):
    s = _get_tg_settings()
    if not s.get("tg_bot_token") or not s.get("tg_chat_id"):
        raise HTTPException(400, "Not configured")
    ok = await _send_tg(s["tg_bot_token"], s["tg_chat_id"], "✅ Vemitreya: тестовое сообщение")
    return {"ok": ok}

# ============================================
# Service alerts monitor (v2.206)
# ============================================
# Фоновая задача проверяет статусы критичных сервисов и handshake AWG.
# При смене состояния шлёт alert в Telegram.

def _get_tg_settings() -> dict:
    """Читает все tg_* настройки из SQLite."""
    conn = db()
    rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE 'tg_%'").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

async def _send_tg(token: str, chat_id: str, text: str) -> bool:
    """Отправляет сообщение в Telegram. Возвращает True если HTTP 200."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as sess:
            async with sess.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
            ) as r:
                return r.status == 200
    except Exception as e:
        print(f"[tg_send] error: {e}")
        return False

async def _send_alert(text: str):
    """Шлёт alert если настройки заполнены и alerts включены."""
    s = _get_tg_settings()
    if s.get("tg_alerts_enabled") != "1":
        return
    if not s.get("tg_bot_token") or not s.get("tg_chat_id"):
        return
    await _send_tg(s["tg_bot_token"], s["tg_chat_id"], text)

def _service_state(unit: str) -> str:
    """Возвращает 'active' / 'inactive' / 'failed' / 'unknown'."""
    try:
        r = subprocess.run(["systemctl", "is-active", unit],
                          capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or "unknown"
    except Exception:
        return "unknown"

def _list_monitored_services() -> list[str]:
    """Список сервисов для dashboard-мониторинга.
    оставлены только mihomo + vemitreya.
    AWG и TT-сервисы видны в своих вкладках Туннели → AWG/TrustTunnel —
    лишний шум на Dashboard не нужен."""
    return ["mihomo", "vemitreya"]

def _awg_handshake_age_seconds(iface: str) -> int | None:
    """Возвращает возраст последнего handshake в секундах. None если интерфейс down."""
    try:
        r = subprocess.run(["awg", "show", iface, "latest-handshakes"],
                         capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            return None
        # Формат: <pubkey>\t<unix_timestamp>
        for line in r.stdout.splitlines():
            parts = line.strip().split()
            if len(parts) >= 2:
                ts = int(parts[1])
                if ts > 0:
                    return int(time.time()) - ts
        return None
    except Exception:
        return None

# Состояние мониторинга в памяти (last seen state)
_monitor_state = {}  # service_name -> {"state": str, "since": float, "alert_sent": bool}
_monitor_awg_state = {}  # iface -> {"alert_sent": bool, "since": float}
_DEBOUNCE_SECONDS = 60  # если флапает чаще — не алертим


# общий стор последних пингов от любых тестов (воркер, кнопки)
# {name: {"delay": int, "ts": float}}
_recent_delays = {}

def _record_delay(name: str, delay: int):
    """Сохранить пинг сервера/группы для отображения в UI."""
    try:
        _recent_delays[name] = {"delay": int(delay), "ts": time.time()}
    except Exception:
        pass

@app.get("/api/proxies/recent-delays")
def proxies_recent_delays(_: bool = Auth):
    """последние известные пинги (от воркера или кнопок тестов).
    Возвращает {name: {delay, ts}}, ts — unix timestamp последнего теста."""
    return _recent_delays

async def _smart_autoselect_loop():
    """«умный автовыбор» для групп, помеченных в настройках.
    Mihomo url-test не умеет пинговать вложенные Selector-группы (отдаёт 0).
    Воркер пингует членов НАШИМ способом (разворачивая Selector до реального
    сервера), находит член с минимальным живым пингом и переключает группу на
    него через PUT /proxies/{group}. Список — settings.smart_groups (CSV)."""
    print("[smart-select] loop started")
    await asyncio.sleep(25)
    GROUP_TYPES = {"Selector", "URLTest", "Fallback", "LoadBalance", "Relay"}
    SPECIALS = {"DIRECT", "REJECT", "PASS", "COMPATIBLE", "GLOBAL"}
    test_url = urllib.parse.quote("http://www.gstatic.com/generate_204", safe='')

    while True:
        min_interval = 60  # пауза цикла = минимальный интервал среди групп
        try:
            cfg = _smart_load_config()  # {group: {interval, tolerance, exclude}}

            if cfg:
                # минимальный интервал среди всех групп — частота опроса цикла
                try:
                    enabled_cfgs = [c for c in cfg.values() if c.get("enabled") is not False]
                    if enabled_cfgs:
                        min_interval = max(10, min(int(c.get("interval", 60)) for c in enabled_cfgs))
                except Exception:
                    min_interval = 60

                data = await mihomo("GET", "/proxies")
                rp = (data or {}).get("proxies", {})

                def resolve_leaf(start, seen=None):
                    seen = seen or set()
                    if start in seen:
                        return None
                    if start in SPECIALS:
                        return start
                    seen.add(start)
                    info = rp.get(start)
                    if not isinstance(info, dict):
                        return None
                    if info.get("type") in GROUP_TYPES:
                        nxt = info.get("now")
                        return resolve_leaf(str(nxt), seen) if nxt else None
                    return start  # конечный прокси

                for gname, gconf in cfg.items():
                    # пропускаем группы где enabled=false
                    # (конфиг сохранён, но автовыбор временно отключён)
                    if gconf.get("enabled") is False:
                        continue
                    # настройки конкретной группы
                    tolerance = max(0, int(gconf.get("tolerance", 0)))
                    exclude_pats = [p.strip().lower()
                                    for p in _re_rl.split(r'[,\n]', gconf.get("exclude", "") or "")
                                    if p.strip()]
                    ginfo = rp.get(gname)
                    if not isinstance(ginfo, dict) or ginfo.get("type") not in GROUP_TYPES:
                        continue
                    members = ginfo.get("all") or []
                    member_leaf = {}
                    for m in members:
                        ms = str(m)
                        if ms in SPECIALS:
                            continue
                        leaf = resolve_leaf(ms)
                        if leaf and leaf not in SPECIALS:
                            # исключаем если имя члена ИЛИ его листа
                            # содержит любой из паттернов (Mobile, Russia и т.п.)
                            check = (ms + " " + leaf).lower()
                            if exclude_pats and any(p in check for p in exclude_pats):
                                continue
                            member_leaf[ms] = leaf

                    async def ping_leaf(leaf):
                        try:
                            enc = urllib.parse.quote(leaf, safe='')
                            r = await mihomo("GET", f"/proxies/{enc}/delay?timeout=3000&url={test_url}")
                            d = r.get("delay", 0) if isinstance(r, dict) else 0
                            if d and d > 0:
                                _record_delay(leaf, d)  # в общий стор
                                return d
                            return None
                        except Exception:
                            return None

                    leaves = list(set(member_leaf.values()))
                    if not leaves:
                        continue
                    delays = await asyncio.gather(*[ping_leaf(l) for l in leaves])
                    leaf_delay = dict(zip(leaves, delays))
                    # также сохраняем пинг по имени члена (для UI)
                    for m, leaf in member_leaf.items():
                        d = leaf_delay.get(leaf)
                        if d is not None:
                            _record_delay(m, d)
                    best_member, best_delay = None, None
                    for m, leaf in member_leaf.items():
                        d = leaf_delay.get(leaf)
                        if d is not None and (best_delay is None or d < best_delay):
                            best_delay, best_member = d, m

                    # tolerance — переключаем только если новый
                    # быстрее ТЕКУЩЕГО больше чем на порог (избегаем дёрганья при
                    # near-равных пингах). Если текущий мёртв (нет в leaf_delay) —
                    # переключаем всегда.
                    now_member = ginfo.get("now")
                    now_leaf = member_leaf.get(now_member)
                    now_delay = leaf_delay.get(now_leaf) if now_leaf else None
                    should_switch = False
                    if best_member and best_member != now_member:
                        if now_delay is None:
                            should_switch = True  # текущий не пингуется/мёртв
                        elif best_delay is not None and (now_delay - best_delay) > tolerance:
                            should_switch = True

                    if should_switch:
                        try:
                            enc = urllib.parse.quote(gname, safe='')
                            await mihomo("PUT", f"/proxies/{enc}", {"name": best_member})
                            print(f"[smart-select] {gname}: {now_member} ({now_delay}) → {best_member} ({best_delay}ms)", flush=True)
                            try:
                                conns = await mihomo("GET", "/connections")
                                for c in (conns or {}).get("connections", []) or []:
                                    if gname in (c.get("chains") or []):
                                        cid = c.get("id")
                                        if cid:
                                            try: await mihomo("DELETE", f"/connections/{cid}")
                                            except: pass
                            except Exception:
                                pass
                        except Exception as e:
                            print(f"[smart-select] switch error {gname}: {e}", flush=True)
        except Exception as e:
            # не глотаем ошибку молча — логируем чтобы видеть причину
            print(f"[smart-select] loop error: {e}\n{traceback.format_exc()}", flush=True)
        await asyncio.sleep(min_interval)

async def _service_monitor_loop():
    """Главный цикл мониторинга. Запускается из lifespan."""
    print("[monitor] service alerts loop started")
    await asyncio.sleep(30)  # начальная пауза чтобы сервисы успели подняться

    while True:
        try:
            s = _get_tg_settings()
            alerts_on = s.get("tg_alerts_enabled") == "1"
            recovery_on = s.get("tg_alerts_recovery") == "1"
            awg_max_minutes = int(s.get("tg_alerts_awg_handshake_max_minutes") or "10")

            if alerts_on and s.get("tg_bot_token") and s.get("tg_chat_id"):
                # 1. Service health
                services = _list_monitored_services()
                now = time.time()
                for svc in services:
                    state = _service_state(svc)
                    prev = _monitor_state.get(svc, {"state": state, "since": now, "alert_sent": False})

                    if state != prev["state"]:
                        # Состояние изменилось
                        _monitor_state[svc] = {"state": state, "since": now, "alert_sent": False}
                    else:
                        # Состояние стабильно, обновим since если новое
                        if svc not in _monitor_state:
                            _monitor_state[svc] = {"state": state, "since": now, "alert_sent": False}

                    # Алерт на падение
                    if state in ("failed", "inactive") and prev["state"] == "active":
                        if now - prev["since"] > _DEBOUNCE_SECONDS or not prev["alert_sent"]:
                            text = f"🔴 *Сервис упал*: `{svc}`\nСостояние: `{state}`\nХост: `{platform.node()}`"
                            await _send_tg(s["tg_bot_token"], s["tg_chat_id"], text)
                            _monitor_state[svc]["alert_sent"] = True

                    # Алерт на восстановление
                    if recovery_on and state == "active" and prev["state"] in ("failed", "inactive"):
                        text = f"🟢 *Сервис восстановился*: `{svc}`\nХост: `{platform.node()}`"
                        await _send_tg(s["tg_bot_token"], s["tg_chat_id"], text)
                        _monitor_state[svc]["alert_sent"] = False

                # 2. AWG handshake stale check
                try:
                    for f in os.listdir("/etc/amnezia/amneziawg"):
                        if f.endswith(".conf"):
                            iface = f[:-5]
                            age = _awg_handshake_age_seconds(iface)
                            prev = _monitor_awg_state.get(iface, {"alert_sent": False, "since": now})
                            if age is None or age > awg_max_minutes * 60:
                                if not prev["alert_sent"] or now - prev["since"] > 600:
                                    age_str = "никогда" if age is None else f"{age // 60} мин назад"
                                    text = (f"⚠️ *AWG handshake устарел*: `{iface}`\n"
                                           f"Последний handshake: {age_str}\n"
                                           f"Порог: {awg_max_minutes} мин")
                                    await _send_tg(s["tg_bot_token"], s["tg_chat_id"], text)
                                    _monitor_awg_state[iface] = {"alert_sent": True, "since": now}
                            else:
                                if prev.get("alert_sent"):
                                    if recovery_on:
                                        text = f"🟢 *AWG handshake восстановился*: `{iface}`"
                                        await _send_tg(s["tg_bot_token"], s["tg_chat_id"], text)
                                _monitor_awg_state[iface] = {"alert_sent": False, "since": now}
                except (FileNotFoundError, PermissionError):
                    pass

        except Exception as e:
            print(f"[monitor] error: {e}")

        await asyncio.sleep(30)

# ============================================
# Alerts dashboard data (v2.206)
# ============================================
@app.get("/api/alerts/dashboard")
def alerts_dashboard(_: bool = Auth):
    """Возвращает данные для dashboard карточек: AWG handshake, Mihomo memory, disk."""
    out = {"services": {}, "awg": [], "system": {}}

    # Сервисы
    for svc in _list_monitored_services():
        out["services"][svc] = _service_state(svc)

    # AWG handshake мониторинг убран из dashboard.
    # Информация по AWG доступна на странице Туннели → AWG.

    # System: Mihomo memory + disk
    try:
        import psutil
        # Mihomo memory
        for p in psutil.process_iter(['name', 'memory_info']):
            try:
                if p.info['name'] == 'mihomo':
                    rss_mb = p.info['memory_info'].rss / 1024 / 1024
                    out["system"]["mihomo_memory_mb"] = round(rss_mb, 1)
                    out["system"]["mihomo_memory_status"] = (
                        "ok" if rss_mb < 200 else
                        "warning" if rss_mb < 500 else
                        "critical"
                    )
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # Disk
        d = psutil.disk_usage('/')
        out["system"]["disk_used_pct"] = round(d.percent, 1)
        out["system"]["disk_free_gb"] = round(d.free / 1024 / 1024 / 1024, 1)
        out["system"]["disk_status"] = (
            "ok" if d.percent < 80 else
            "warning" if d.percent < 90 else
            "critical"
        )

        # Memory total
        m = psutil.virtual_memory()
        out["system"]["mem_used_pct"] = round(m.percent, 1)

        # Load average
        try:
            load = os.getloadavg()
            out["system"]["load_1min"] = round(load[0], 2)
        except (OSError, AttributeError):
            pass
    except ImportError:
        out["system"]["error"] = "psutil not installed"
    except Exception as e:
        out["system"]["error"] = str(e)

    return out

# ============================================
# INSTALLATION (AWG / TrustTunnel / APT proxy)  — добавлено в v2.203
# persist через SQLite вместо in-memory dict
# ============================================
import uuid as _uuid
import shutil as _shutil
import json as _json_install

def _job_create(kind: str) -> str:
    """Создать новую задачу установки. Возвращает job_id."""
    jid = _uuid.uuid4().hex[:12]
    conn = db()
    try:
        conn.execute(
            "INSERT INTO install_jobs (id, kind, status, started, logs_json) VALUES (?, ?, 'running', ?, '[]')",
            (jid, kind, time.time())
        )
        conn.commit()
        # Чистим старые (оставляем 30 последних)
        conn.execute("""
            DELETE FROM install_jobs WHERE id NOT IN (
                SELECT id FROM install_jobs ORDER BY started DESC LIMIT 30
            )
        """)
        conn.commit()
    finally:
        conn.close()
    return jid

def _job_log_append(jid: str, line: str):
    """Дописать строку в логи задачи."""
    conn = db()
    try:
        row = conn.execute("SELECT logs_json FROM install_jobs WHERE id=?", (jid,)).fetchone()
        if not row:
            return
        try:
            logs = _json_install.loads(row["logs_json"])
        except Exception:
            logs = []
        logs.append(line)
        # Ограничиваем размер
        if len(logs) > 500:
            logs = logs[-500:]
        conn.execute("UPDATE install_jobs SET logs_json=? WHERE id=?",
                     (_json_install.dumps(logs), jid))
        conn.commit()
    finally:
        conn.close()

def _job_finish(jid: str, status: str, rc: int):
    """Завершить задачу с указанным статусом."""
    conn = db()
    try:
        conn.execute(
            "UPDATE install_jobs SET status=?, rc=?, done=? WHERE id=?",
            (status, rc, time.time(), jid)
        )
        conn.commit()
    finally:
        conn.close()

def _job_get(jid: str) -> dict:
    """Прочитать задачу. None если нет."""
    conn = db()
    try:
        row = conn.execute(
            "SELECT id, kind, status, rc, started, done, logs_json FROM install_jobs WHERE id=?",
            (jid,)
        ).fetchone()
        if not row:
            return None
        try:
            logs = _json_install.loads(row["logs_json"])
        except Exception:
            logs = []
        return {
            "id": row["id"],
            "kind": row["kind"],
            "status": row["status"],
            "rc": row["rc"],
            "logs": logs,
            "started": row["started"],
            "done": row["done"],
        }
    finally:
        conn.close()

async def _run_install(jid: str, cmd_parts: list, env_extra: dict = None):
    """Запустить shell-команду, стримя её вывод в БД."""
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    rc = -1
    status = "failed"
    try:
        _job_log_append(jid, f"$ {' '.join(cmd_parts)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd_parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        async for raw in proc.stdout:
            try:
                line = raw.decode("utf-8", "replace").rstrip()
            except Exception:
                line = repr(raw)
            if line:
                _job_log_append(jid, line)
        rc = await proc.wait()
        status = "done" if rc == 0 else "failed"
    except Exception as e:
        _job_log_append(jid, f"!! exception: {e!r}")
    finally:
        _job_finish(jid, status, rc)

# ---------- APT proxy через Mihomo ----------
APT_PROXY_FILE = "/etc/apt/apt.conf.d/99vemitreya-proxy"

def _detect_mihomo_http_port() -> int:
    """Найти HTTP-порт Mihomo из его конфига."""
    try:
        with open("/opt/mihomo/config/config.yaml") as f:
            for line in f:
                if line.startswith("port:") or line.startswith("mixed-port:"):
                    val = line.split(":", 1)[1].strip()
                    try:
                        return int(val)
                    except ValueError:
                        continue
    except Exception:
        pass
    return 7890

@app.get("/api/system/apt-proxy/status")
async def apt_proxy_status(_: bool = Auth):
    enabled = os.path.exists(APT_PROXY_FILE)
    port = _detect_mihomo_http_port()
    mihomo_active = False
    try:
        r = subprocess.run(["systemctl", "is-active", "mihomo"], capture_output=True, text=True, timeout=3)
        mihomo_active = (r.stdout.strip() == "active")
    except Exception:
        pass
    return {"enabled": enabled, "mihomo_port": port, "mihomo_active": mihomo_active}

@app.post("/api/system/apt-proxy/enable")
async def apt_proxy_enable(_: bool = Auth):
    port = _detect_mihomo_http_port()
    content = (
        f'Acquire::http::Proxy "http://127.0.0.1:{port}";\n'
        f'Acquire::https::Proxy "http://127.0.0.1:{port}";\n'
    )
    try:
        with open(APT_PROXY_FILE, "w") as f:
            f.write(content)
        return {"ok": True, "port": port}
    except Exception as e:
        raise HTTPException(500, f"Не удалось включить apt-proxy: {e}")

@app.post("/api/system/apt-proxy/disable")
async def apt_proxy_disable(_: bool = Auth):
    try:
        if os.path.exists(APT_PROXY_FILE):
            os.remove(APT_PROXY_FILE)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Не удалось выключить apt-proxy: {e}")

# ---------- AWG: установка ----------
@app.get("/api/awg/install/status")
async def awg_install_status(_: bool = Auth):
    # множественные пути + fallback на systemd unit
    awg_bin = _shutil.which("awg") or _shutil.which("awg-quick")
    if not awg_bin:
        for p in ("/usr/bin/awg", "/usr/local/bin/awg",
                  "/usr/bin/awg-quick", "/usr/local/bin/awg-quick"):
            if os.path.isfile(p):
                awg_bin = p
                break

    installed = bool(awg_bin)

    # Fallback: если бинарь не найден — проверим конфиги или активные unit
    if not installed:
        if os.path.isdir("/etc/amnezia/amneziawg"):
            try:
                files = [f for f in os.listdir("/etc/amnezia/amneziawg") if f.endswith(".conf")]
                if files:
                    installed = True
                    awg_bin = "(detected via /etc/amnezia/amneziawg)"
            except Exception:
                pass

    version = None
    if installed and awg_bin and awg_bin.startswith("/"):
        try:
            r = subprocess.run([awg_bin, "--version"], capture_output=True, text=True, timeout=3)
            version = (r.stdout + r.stderr).strip().split("\n")[0]
        except Exception:
            version = "installed"
    elif installed:
        version = "installed (configs detected)"

    return {"installed": installed, "version": version, "path": awg_bin}

@app.post("/api/awg/install")
async def awg_install(req: Request, _: bool = Auth):
    body = {}
    try:
        body = await req.json()
    except Exception:
        pass
    use_proxy = bool(body.get("use_mihomo_proxy", False))
    jid = _job_create("awg")

    async def do():
        env_extra = {"DEBIAN_FRONTEND": "noninteractive"}
        if use_proxy:
            port = _detect_mihomo_http_port()
            env_extra.update({
                "http_proxy":  f"http://127.0.0.1:{port}",
                "https_proxy": f"http://127.0.0.1:{port}",
                "HTTP_PROXY":  f"http://127.0.0.1:{port}",
                "HTTPS_PROXY": f"http://127.0.0.1:{port}",
            })
            # Также пишем в apt.conf.d на время установки
            try:
                with open(APT_PROXY_FILE, "w") as f:
                    f.write(
                        f'Acquire::http::Proxy "http://127.0.0.1:{port}";\n'
                        f'Acquire::https::Proxy "http://127.0.0.1:{port}";\n'
                    )
                _job_log_append(jid, f"[i] apt proxy: 127.0.0.1:{port}")
            except Exception as e:
                _job_log_append(jid, f"[!] не удалось включить apt-proxy: {e}")

        # Скрипт установки: PPA + apt install
        script = (
            "set -e\n"
            "apt-get install -y -qq software-properties-common dkms linux-headers-$(uname -r) || true\n"
            "add-apt-repository -y ppa:amnezia/ppa\n"
            "apt-get update -qq\n"
            "apt-get install -y -qq amneziawg amneziawg-dkms\n"
            "mkdir -p /etc/amnezia/amneziawg && chmod 700 /etc/amnezia/amneziawg\n"
            "awg --version || true\n"
        )
        await _run_install(jid, ["bash", "-c", script], env_extra=env_extra)

    asyncio.create_task(do())
    return {"job_id": jid}

# ---------- TrustTunnel: установка ----------
@app.get("/api/trusttunnel/install/status")
async def tt_install_status(_: bool = Auth):
    # расширенный список путей.
    # У разных установщиков TT бинарь лежит по-разному:
    #   /opt/trusttunnel_client/trusttunnel_client (старый installer, с подчёркиванием)
    #   /opt/trusttunnel-client/bin/trusttunnel_client (новый installer, с дефисом + bin/)
    candidates = [
        "/opt/trusttunnel_client/trusttunnel_client",
        "/opt/trusttunnel-client/bin/trusttunnel_client",
        "/opt/trusttunnel-client/trusttunnel_client",
        "/opt/trusttunnel_client/bin/trusttunnel_client",
        "/usr/local/bin/trusttunnel_client",
        "/usr/bin/trusttunnel_client",
    ]
    tt_bin = None
    for p in candidates:
        if os.path.isfile(p):
            tt_bin = p
            break

    installed = tt_bin is not None

    # Fallback 1: если бинарь не найден — ищем через find в типовых местах
    if not installed:
        for base in ("/opt", "/usr/local"):
            if not os.path.isdir(base):
                continue
            try:
                for root, dirs, files in os.walk(base, followlinks=False):
                    # ограничим глубину чтобы не сканировать всё
                    depth = root[len(base):].count(os.sep)
                    if depth > 3:
                        dirs[:] = []
                        continue
                    if "trusttunnel_client" in files:
                        tt_bin = os.path.join(root, "trusttunnel_client")
                        installed = True
                        break
                if installed:
                    break
            except (PermissionError, OSError):
                continue

    # Fallback 2: проверяем активный systemd unit trusttunnel-*.service
    # Если есть — TT точно установлен, просто файл лежит где не ожидаем
    if not installed:
        try:
            r = subprocess.run(
                ["systemctl", "list-units", "--type=service", "--all",
                 "--no-pager", "--no-legend", "trusttunnel-*"],
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0 and r.stdout.strip():
                installed = True
                tt_bin = "(detected via systemctl)"
        except Exception:
            pass

    version = None
    if installed and tt_bin and tt_bin.startswith("/"):
        try:
            r = subprocess.run([tt_bin, "--version"], capture_output=True, text=True, timeout=3)
            version = (r.stdout + r.stderr).strip().split("\n")[0]
        except Exception:
            version = "installed"
    elif installed:
        version = "installed (via systemd)"

    return {"installed": installed, "version": version, "path": tt_bin if installed else None}

@app.post("/api/trusttunnel/install")
async def tt_install(req: Request, _: bool = Auth):
    body = {}
    try:
        body = await req.json()
    except Exception:
        pass
    use_proxy = bool(body.get("use_mihomo_proxy", False))
    jid = _job_create("trusttunnel")

    async def do():
        env_extra = {"DEBIAN_FRONTEND": "noninteractive"}
        if use_proxy:
            port = _detect_mihomo_http_port()
            env_extra.update({
                "http_proxy":  f"http://127.0.0.1:{port}",
                "https_proxy": f"http://127.0.0.1:{port}",
                "HTTP_PROXY":  f"http://127.0.0.1:{port}",
                "HTTPS_PROXY": f"http://127.0.0.1:{port}",
            })
            _job_log_append(jid, f"[i] HTTP proxy: 127.0.0.1:{port}")

        script = (
            "set -e\n"
            "curl -fsSL --max-time 60 "
            "https://raw.githubusercontent.com/TrustTunnel/TrustTunnelClient/refs/heads/master/scripts/install.sh "
            "| sh -s -\n"
            "test -f /opt/trusttunnel_client/trusttunnel_client && echo 'OK: binary at /opt/trusttunnel_client/'\n"
            "mkdir -p /opt/trusttunnel_client/configs\n"
        )
        await _run_install(jid, ["bash", "-c", script], env_extra=env_extra)

    asyncio.create_task(do())
    return {"job_id": jid}

# ---------- Job status / logs ----------
@app.get("/api/install/jobs/{jid}")
async def install_job(jid: str, _: bool = Auth):
    job = _job_get(jid)
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "status": job["status"],
        "rc": job.get("rc"),
        "logs": job.get("logs", []),
        "started": job.get("started"),
        "done": job.get("done"),
        "kind": job.get("kind"),
    }

@app.get("/api/install/jobs")
async def install_jobs_list(_: bool = Auth, limit: int = 20):
    """Список последних задач установки (v2.206)."""
    conn = db()
    try:
        rows = conn.execute(
            "SELECT id, kind, status, rc, started, done FROM install_jobs ORDER BY started DESC LIMIT ?",
            (max(1, min(limit, 100)),)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

# ============================================
# STATIC (must be LAST)
# ============================================
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
