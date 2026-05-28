// =========================================================
// Vemitreya v2.206 — React SPA
// =========================================================
const { useState, useEffect, useCallback, useRef, useMemo } = React;
const { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
        Tooltip, ResponsiveContainer } = Recharts;

// =========================================================
// ICONS — Lucide-style line icons (inline SVG)
// =========================================================
const ICON_PATHS = {
  // Дашборд
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  // Соединения / активность
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
  // Переключение прокси
  shuffle: <><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></>,
  // Группы / папки слоями
  layers: <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></>,
  // Подписки (radio waves)
  satellite: <><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></>,
  // Правила (list-checks)
  list: <><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></>,
  // Speedtest (gauge)
  gauge: <><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></>,
  // AWG туннели (shield)
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>,
  // TrustTunnel (route)
  route: <><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></>,
  // YAML / код
  fileCode: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 18 3-3-3-3"/><path d="m13 12 3 3-3 3"/></>,
  // Сервисы (sliders)
  sliders: <><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></>,
  // Обновления (download)
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>,
  // Логи (terminal)
  terminal: <><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></>,
  // Telegram (send)
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,

  // Прочие действия (для кнопок и т.п.)
  refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></>,
  plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></>,
  trash: <><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  arrowUp: <path d="m5 12 7-7 7 7M12 5v14" />,
  play: <polygon points="6 3 20 12 6 21 6 3"/>,
  pause: <><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1"/>,

  // Настройки (gear)
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  // Дашборд: метрики системы и каналы
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></>,
  memory: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4M10 10v4M14 10v4M18 10v4"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></>,
  radio: <><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></>,
  target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  chart: <><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></>,
};

function Icon({ name, size = 18, strokeWidth = 1.75, className = '', style = {} }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      style={style}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}


// =========================================================
// USER SETTINGS — частота обновления, пр.
// =========================================================
const REFRESH_INTERVALS = [
  { ms: 1000, label: '1 сек' },
  { ms: 2000, label: '2 сек' },
  { ms: 5000, label: '5 сек' },
  { ms: 10000, label: '10 сек' },
  { ms: 30000, label: '30 сек' },
  { ms: 60000, label: '1 мин' },
];

const settingsStore = {
  _listeners: new Set(),
  get refreshInterval() {
    const v = parseInt(localStorage.getItem('mp_refresh_ms'));
    return REFRESH_INTERVALS.some(i => i.ms === v) ? v : 2000;
  },
  set refreshInterval(ms) {
    localStorage.setItem('mp_refresh_ms', String(ms));
    this._listeners.forEach(fn => fn());
  },
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },
};

function useRefreshInterval() {
  const [ms, setMs] = useState(settingsStore.refreshInterval);
  useEffect(() => settingsStore.subscribe(() => setMs(settingsStore.refreshInterval)), []);
  return ms;
}


// =========================================================
// GROUP CLASSIFICATION HELPERS
// =========================================================
// Системные группы Mihomo, которые не нужно показывать
const SYSTEM_GROUPS = new Set(['GLOBAL']);

/**
 * Классификация группы:
 * - 'routing': группа управления трафиком — содержит ДРУГИЕ группы или DIRECT/REJECT в proxies
 *              (используется в rules: для маршрутизации типа трафика)
 * - 'channel': группа каналов — содержит КОНКРЕТНЫЕ прокси / подписки
 *              (это "пул серверов одного протокола", типа AWG, TrustTunnel, EOF [VLESS])
 *
 * @param group объект группы { name, type, proxies, use, ... }
 * @param allGroupNames Set с именами всех групп
 */
function classifyGroup(group, allGroupNames) {
  if (!group) return 'channel';
  const proxies = group.proxies || [];

  // Если есть use: (подписки) — почти наверняка это channel-группа
  if ((group.use || []).length > 0 && proxies.length === 0) return 'channel';

  // Если хотя бы один член — другая группа или DIRECT/REJECT → routing
  const hasGroupMember = proxies.some(p =>
    p === 'DIRECT' || p === 'REJECT' || allGroupNames.has(p)
  );
  if (hasGroupMember) return 'routing';

  return 'channel';
}

/**
 * Из объекта runtime-групп с /api/proxies/groups строит карту классификации.
 * Возвращает { groupName -> 'routing' | 'channel' }
 */
function buildGroupClassification(groupsObj) {
  const allNames = new Set(Object.keys(groupsObj));
  const result = {};
  Object.entries(groupsObj).forEach(([name, g]) => {
    if (SYSTEM_GROUPS.has(name)) {
      result[name] = 'system';
      return;
    }
    // У runtime-групп поле all = members, но без разбиения use/proxies.
    // Эвристика: если все члены входят в allNames или это DIRECT/REJECT → routing
    const members = g.all || [];
    if (members.length === 0) { result[name] = 'channel'; return; }
    const hasGroupMember = members.some(m =>
      m === 'DIRECT' || m === 'REJECT' || allNames.has(m)
    );
    result[name] = hasGroupMember ? 'routing' : 'channel';
  });
  return result;
}


const api = {
  base: '', token: '',
  configure(base, token) { this.base = base.replace(/\/$/, ''); this.token = token; },
  async req(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    const r = await fetch(`${this.base}${path}`, opts);
    if (!r.ok) {
      const text = await r.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j.detail)) {
          // Pydantic validation errors
          msg = j.detail.map(e => {
            const loc = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : '';
            return loc ? `${loc}: ${e.msg}` : e.msg;
          }).join('; ');
        } else if (typeof j.detail === 'string') {
          msg = j.detail;
        } else if (j.detail) {
          msg = JSON.stringify(j.detail);
        }
      } catch {}
      throw new Error(`${r.status}: ${msg}`);
    }
    return r.json();
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
  put(p, b) { return this.req('PUT', p, b); },
  del(p) { return this.req('DELETE', p); },
  wsUrl(path) { return `${this.base.replace(/^http/, 'ws')}${path}`; }
};

// =========================================================
// TOASTS
// =========================================================
let tId = 0;
const tSubs = new Set();
const showToast = (msg, type = 'info') => {
  const t = { id: ++tId, msg, type };
  tSubs.forEach(fn => fn('add', t));
  setTimeout(() => tSubs.forEach(fn => fn('rm', t)), 3500);
};
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const sub = (a, t) => setItems(its => a === 'add' ? [...its, t] : its.filter(x => x.id !== t.id));
    tSubs.add(sub);
    return () => tSubs.delete(sub);
  }, []);
  return <div className="toast-container">
    {items.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
  </div>;
}

// =========================================================
// HELPERS
// =========================================================

// единый компонент поля ввода с чёткой визуальной иерархией.
// Поле в карточке-обёртке. Обязательные поля помечены красной звёздочкой
// И подсветкой рамки (акцентная левая полоса + усиленная обводка).
function Field({ label, required, hint, children, style = {} }) {
  const requiredStyle = required ? {
    borderColor: 'var(--accent, #5b8cff)',
    borderLeft: '3px solid var(--accent, #5b8cff)',
    background: 'rgba(91,140,255,.04)',
  } : {};
  return (
    <div style={{
      marginBottom: 12,
      padding: '12px 14px',
      background: 'var(--bg-2, rgba(255,255,255,.02))',
      border: '1px solid var(--border)',
      borderRadius: 8,
      ...requiredStyle,
      ...style,
    }}>
      {label && (
        <label style={{
          display: 'block', fontSize: 13, fontWeight: 600,
          marginBottom: hint ? 2 : 8, color: 'var(--text)',
        }}>
          {label}
          {required && (
            <span style={{ color: 'var(--error)', marginLeft: 4, fontWeight: 700 }}
                  title="Обязательное поле">*</span>
          )}
        </label>
      )}
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3, var(--text-2))',
                      marginBottom: 8, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

// блок-подсказка/предупреждение с явным заголовком-бейджем —
// чтобы визуально отличался от полей ввода (это ЧИТАТЬ, а не заполнять).
function InfoBox({ kind = 'info', title, children, style = {} }) {
  const palette = {
    info:    { bg: 'rgba(91,140,255,.07)', border: 'rgba(91,140,255,.35)', bar: '#5b8cff', icon: 'ℹ️', badge: 'ПОДСКАЗКА' },
    warning: { bg: 'rgba(239,68,68,.07)',  border: 'rgba(239,68,68,.35)',  bar: '#ef4444', icon: '⚠️', badge: 'ВАЖНО' },
    tip:     { bg: 'rgba(16,185,129,.07)', border: 'rgba(16,185,129,.35)', bar: '#10b981', icon: '💡', badge: 'СОВЕТ' },
  };
  const p = palette[kind] || palette.info;
  return (
    <div style={{
      marginBottom: 12, padding: '11px 14px', borderRadius: 8,
      background: p.bg, border: `1px solid ${p.border}`,
      borderLeft: `3px solid ${p.bar}`, fontSize: 12, lineHeight: 1.55,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: title || children ? 6 : 0 }}>
        <span style={{ fontSize: 13 }}>{p.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
          color: p.bar, textTransform: 'uppercase',
        }}>{p.badge}</span>
        {title && <strong style={{ fontSize: 12.5, marginLeft: 2 }}>{title}</strong>}
      </div>
      {children && <div style={{ color: 'var(--text-2)' }}>{children}</div>}
    </div>
  );
}

// сворачиваемый блок. По умолчанию свёрнут. С опциональной
// пометкой «важное» (important) — тогда заголовок акцентный (красная рамка/иконка),
// чтобы свёрнутый блок было видно и хотелось раскрыть.
function Collapsible({ title, important, defaultOpen = false, children, style = {} }) {
  const [open, setOpen] = useState(defaultOpen);
  const accent = important ? '#ef4444' : 'var(--border)';
  const bg = important ? 'rgba(239,68,68,.06)' : 'transparent';
  return (
    <div style={{
      marginBottom: 12, borderRadius: 8,
      border: `1px solid ${important ? 'rgba(239,68,68,.35)' : 'var(--border)'}`,
      borderLeft: important ? '3px solid #ef4444' : '1px solid var(--border)',
      overflow: 'hidden', ...style,
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', background: bg, border: 'none', cursor: 'pointer',
        textAlign: 'left', color: 'var(--text)', fontSize: 12.5, fontWeight: 600,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)',
                       transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        {important && (
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em',
                         color: '#ef4444', textTransform: 'uppercase',
                         border: '1px solid rgba(239,68,68,.4)', borderRadius: 4,
                         padding: '1px 6px' }}>⚠ ВАЖНОЕ</span>
        )}
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
          {open ? 'свернуть' : 'подробнее'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', fontSize: 12, lineHeight: 1.55,
                      color: 'var(--text-2)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const fmtBytes = (b) => {
  if (!b || b < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v > 100 || i === 0 ? 0 : 1)} ${u[i]}`;
};
const fmtBps = (b) => fmtBytes(b) + '/s';
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
};
const delayClass = (d) => !d || d < 0 ? 'bad' : d < 200 ? 'good' : d < 500 ? 'medium' : 'bad';

// =========================================================
// ANIMATED NUMBER — плавное обновление чисел
// =========================================================
function AnimatedNumber({ value, format = (v) => v, duration = 400, className = '' }) {
  const [displayed, setDisplayed] = useState(value);
  const startRef = useRef(null);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value === displayed) return;
    fromRef.current = displayed;
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplayed(next);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span className={`animated-number ${className}`}>{format(displayed)}</span>;
}

// =========================================================
// THEME
// =========================================================
const THEMES = [
  { id: 'dark', label: 'Тёмная' },
  { id: 'light', label: 'Светлая' },
];

function ThemeSelector({ theme, onChange }) {
  // SVG иконки для тёмной (луна) и светлой (солнце) тем
  const icons = {
    dark: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    ),
    light: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    )
  };
  return (
    <div className="theme-selector">
      {THEMES.map(t => (
        <button key={t.id}
                className={`theme-btn ${theme === t.id ? 'active' : ''}`}
                title={t.label} onClick={() => onChange(t.id)}>
          {icons[t.id]}
          <span className="theme-btn-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// =========================================================
// LOGIN
// =========================================================
function Login({ onAuth }) {
  const [url, setUrl] = useState(() => localStorage.getItem('mp_url') || location.origin);
  const [token, setToken] = useState(() => localStorage.getItem('mp_token') || '');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      api.configure(url, token);
      await api.get('/api/auth/check');
      localStorage.setItem('mp_url', url);
      localStorage.setItem('mp_token', token);
      onAuth();
    } catch (e) { showToast(`Ошибка: ${e.message}`, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="Vemitreya" className="login-logo-img" />
          <h1>Vemitreya</h1>
          <p>Управление прокси-инфраструктурой</p>
        </div>
        <div className="form-group">
          <label className="form-label">Адрес сервера</label>
          <input className="form-input" value={url} onChange={e => setUrl(e.target.value)}
                 placeholder="http://SERVER_IP:8888" />
        </div>
        <div className="form-group">
          <label className="form-label">API токен</label>
          <input className="form-input" type="password" value={token} onChange={e => setToken(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', padding: 11 }}
                onClick={connect} disabled={loading || !token}>
          {loading ? 'Проверка...' : 'Войти →'}
        </button>
      </div>
      <Toasts />
    </div>
  );
}

// =========================================================
// DASHBOARD
// =========================================================
function Dashboard() {
  const refreshMs = useRefreshInterval();
  const [sys, setSys] = useState(null);
  const [summary, setSummary] = useState(null);
  const [traffic, setTraffic] = useState({ up: 0, down: 0 });
  const [history, setHistory] = useState([]);
  const [topDomains, setTopDomains] = useState([]);
  const [conns, setConns] = useState({ total: 0 });
  const [channels, setChannels] = useState({ channels: [], summary: { total: 0, active: 0, total_received: 0, total_sent: 0 } });
  const [proxyGroups, setProxyGroups] = useState({});
  const [pings, setPings] = useState({ results: [], ts: 0 });
  const [pinging, setPinging] = useState(false);
  const [alerts, setAlerts] = useState(null);  // alert cards

  // Лёгкие данные — обновляются часто (CPU/RAM/uptime/conns/groups)
  const reloadFast = async () => {
    try {
      const [s, c, pg, a] = await Promise.all([
        api.get('/api/stats/system'),
        api.get('/api/connections?limit=1').catch(() => ({ total: 0 })),
        api.get('/api/proxies/groups').catch(() => ({})),
        api.get('/api/alerts/dashboard').catch(() => null),
      ]);
      setSys(s); setConns(c); setProxyGroups(pg); setAlerts(a);
    } catch (e) { console.error(e); }
  };

  // Тяжёлые данные — обновляются реже
  const reloadSlow = async () => {
    try {
      const [sm, h, td, ch] = await Promise.all([
        api.get('/api/mihomo/summary').catch(() => null),
        api.get('/api/stats/traffic/history?minutes=15'),
        api.get('/api/stats/top-domains?limit=10'),
        api.get('/api/stats/channels').catch(() => ({ channels: [], summary: { total: 0, active: 0, total_received: 0, total_sent: 0 } })),
      ]);
      setSummary(sm); setHistory(h); setTopDomains(td); setChannels(ch);
    } catch (e) { console.error(e); }
  };

  // Backward-compat: первый запуск делает всё сразу
  const reload = async () => {
    await Promise.all([reloadFast(), reloadSlow()]);
  };

  const reloadPings = async () => {
    setPinging(true);
    try {
      const r = await api.get('/api/speedtest/dashboard-ping');
      setPings(r);
    } catch {} finally { setPinging(false); }
  };

  useEffect(() => {
    reload();
    reloadPings();
    // Лёгкие данные = выбранный пользователем интервал
    // Тяжёлые данные = max(refreshMs * 2, 5000)
    const slowMs = Math.max(refreshMs * 2, 5000);
    const iFast = setInterval(reloadFast, refreshMs);
    const iSlow = setInterval(reloadSlow, slowMs);
    const ip = setInterval(reloadPings, 30000);
    const ws = new WebSocket(api.wsUrl('/ws/traffic'));
    ws.onopen = () => ws.send(JSON.stringify({ token: api.token }));
    ws.onmessage = (ev) => { try { setTraffic(JSON.parse(ev.data)); } catch {} };
    return () => { clearInterval(iFast); clearInterval(iSlow); clearInterval(ip); ws.close(); };
  }, [refreshMs]);

  if (!sys) return <div className="loading"><div className="spinner"></div>Загрузка...</div>;

  const chartData = history.map(p => ({
    time: new Date(p.ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    up: +(p.up / 1024).toFixed(1),
    down: +(p.down / 1024).toFixed(1)
  }));

  return (
    <div>
      {/* Шапка дашборда с селектором частоты обновления */}
      <div className="dashboard-header">
        <div className="dashboard-header-spacer" />
        <div className="dashboard-refresh-selector" title="Частота обновления данных">
          <Icon name="refresh" size={12} />
          <select value={refreshMs}
                  onChange={e => settingsStore.refreshInterval = parseInt(e.target.value)}
                  className="dashboard-refresh-select">
            {REFRESH_INTERVALS.map(i => (
              <option key={i.ms} value={i.ms}>{i.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Алерт-карточки (показываются только если есть проблемы) */}
      {alerts && (() => {
        const cards = [];
        // AWG handshake age
        for (const a of (alerts.awg || [])) {
          if (a.handshake_status === 'ok') continue; // не показываем зелёные
          const age = a.handshake_age_seconds;
          const ageStr = age == null ? 'никогда' : age < 60 ? `${age}s` : `${Math.floor(age/60)}m ${age%60}s`;
          cards.push({
            key: `awg-${a.name}`,
            severity: a.handshake_status,
            icon: 'shield',
            title: `AWG: ${a.name}`,
            value: ageStr,
            label: 'handshake устарел',
          });
        }
        // Mihomo memory
        const sys2 = alerts.system || {};
        if (sys2.mihomo_memory_status && sys2.mihomo_memory_status !== 'ok') {
          cards.push({
            key: 'mihomo-mem',
            severity: sys2.mihomo_memory_status,
            icon: 'cpu',
            title: 'Mihomo память',
            value: `${sys2.mihomo_memory_mb} MB`,
            label: sys2.mihomo_memory_status === 'critical' ? 'критично — рестарт?' : 'выше нормы',
          });
        }
        // Disk
        if (sys2.disk_status && sys2.disk_status !== 'ok') {
          cards.push({
            key: 'disk',
            severity: sys2.disk_status,
            icon: 'database',
            title: 'Диск',
            value: `${sys2.disk_used_pct}%`,
            label: `свободно ${sys2.disk_free_gb} GB`,
          });
        }
        // Services down
        for (const [svc, state] of Object.entries(alerts.services || {})) {
          if (state === 'active') continue;
          cards.push({
            key: `svc-${svc}`,
            severity: 'critical',
            icon: 'x',
            title: svc,
            value: state,
            label: 'сервис не активен',
          });
        }

        if (cards.length === 0) return null;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            {cards.map(c => (
              <div key={c.key} className="stat-card" style={{
                minWidth: 200,
                borderLeft: `4px solid ${c.severity === 'critical' ? '#ef4444' : '#f59e0b'}`,
              }}>
                <div className="stat-card-head" style={{ color: c.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>
                  <Icon name={c.icon} size={14} />
                  <span className="stat-label">{c.title}</span>
                </div>
                <div className="stat-value" style={{ fontSize: 18 }}>{c.value}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="cpu" size={14} />
            <span className="stat-label">CPU</span>
          </div>
          <div className="stat-value">
            <AnimatedNumber value={sys.cpu} format={v => v.toFixed(1) + '%'} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="memory" size={14} />
            <span className="stat-label">RAM</span>
          </div>
          <div className="stat-value">
            <AnimatedNumber value={sys.memory.percent} format={v => v.toFixed(0) + '%'} />
          </div>
          <div className="stat-sublabel">{sys.memory.used_gb} / {sys.memory.total_gb} GB</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="clock" size={14} />
            <span className="stat-label">Uptime</span>
          </div>
          <div className="stat-value" style={{ fontSize: 20 }}>{fmtUptime(sys.uptime)}</div>
          <div className="stat-sublabel">
            <Icon name="link" size={10} /> Соединений: <AnimatedNumber value={conns.total} format={v => Math.round(v)} />
          </div>
        </div>
        {summary && (
          <div className="stat-card">
            <div className="stat-card-head">
              <Icon name="shield" size={14} />
              <span className="stat-label">Mihomo</span>
            </div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {summary.rules_count} правил
            </div>
            <div className="stat-sublabel">
              Прокси: {summary.proxies_count} · Подписки: {summary.proxy_providers_count}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Icon name="activity" size={14} /> Live трафик
          </div>
        </div>
        <div className="traffic-live">
          <div className="traffic-live-card">
            <div className="traffic-live-icon up"><Icon name="upload" size={18} /></div>
            <div>
              <div className="traffic-live-label">UPLOAD</div>
              <div className="traffic-live-value">
                <AnimatedNumber value={traffic.up} format={v => fmtBps(v)} />
              </div>
            </div>
          </div>
          <div className="traffic-live-card">
            <div className="traffic-live-icon down"><Icon name="download" size={18} /></div>
            <div>
              <div className="traffic-live-label">DOWNLOAD</div>
              <div className="traffic-live-value">
                <AnimatedNumber value={traffic.down} format={v => fmtBps(v)} />
              </div>
            </div>
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={.4}/>
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
              <XAxis dataKey="time" stroke="#5b6578" fontSize={10} />
              <YAxis stroke="#5b6578" fontSize={10} unit=" KB/s" />
              <Tooltip contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="up" stroke="#eab308" fill="url(#gUp)" name="↑ KB/s" />
              <Area type="monotone" dataKey="down" stroke="#22c55e" fill="url(#gDown)" name="↓ KB/s" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Активные прокси-группы и статистика использования каналов */}
      {Object.keys(proxyGroups).length > 0 && (() => {
        // Подсчитаем — какой канал в скольких группах используется
        const usageMap = {};  // proxy_name -> [groups using it]
        const activeMap = {}; // proxy_name -> [groups where it's CURRENTLY active]
        Object.entries(proxyGroups).forEach(([gname, g]) => {
          if (SYSTEM_GROUPS.has(gname)) return;  // GLOBAL не учитываем
          (g.all || []).forEach(p => {
            if (p === 'DIRECT' || p === 'REJECT') return;
            if (proxyGroups[p]) return;  // вложенная группа — скипаем
            if (!usageMap[p]) usageMap[p] = [];
            usageMap[p].push(gname);
            if (g.now === p) {
              if (!activeMap[p]) activeMap[p] = [];
              activeMap[p].push(gname);
            }
          });
        });

        // Только активные каналы — те что выбраны хотя бы в одной группе
        const usageList = Object.entries(usageMap)
          .filter(([name]) => (activeMap[name] || []).length > 0)
          .map(([name, gs]) => ({
            name,
            groups: gs,
            activeIn: activeMap[name] || []
          }))
          .sort((a, b) => {
            if (b.activeIn.length !== a.activeIn.length) return b.activeIn.length - a.activeIn.length;
            return b.groups.length - a.groups.length;
          });

        // Классификация
        const classification = buildGroupClassification(proxyGroups);
        // Только routing группы
        const routingEntries = Object.entries(proxyGroups)
          .filter(([gname]) => classification[gname] === 'routing');

        // Резолв: пройти по цепочке group → ... → конкретный прокси
        const resolveChain = (startGroupName) => {
          const chain = [];
          let cur = startGroupName;
          const seen = new Set();
          while (cur && !seen.has(cur)) {
            seen.add(cur);
            const g = proxyGroups[cur];
            if (!g) break;
            const next = g.now;
            if (!next) break;
            chain.push(next);
            // Если конечный — выходим
            if (!proxyGroups[next] || next === 'DIRECT' || next === 'REJECT') break;
            cur = next;
          }
          return chain;
        };

        return (
          <>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title"><Icon name="target" size={14} /> Активная маршрутизация трафика</div>
                  <div className="card-subtitle">
                    {routingEntries.length} групп управления · показывается полная цепочка до конечного канала
                  </div>
                </div>
              </div>

              <div className="active-groups-grid">
                {routingEntries.length === 0 && (
                  <div className="text-muted" style={{ padding: 12, fontSize: 11 }}>
                    Нет routing-групп. Создайте на странице «Группы».
                  </div>
                )}
                {(() => {
                  // Мапа имя_прокси → delay для быстрого lookup
                  const pingMap = {};
                  (pings.results || []).forEach(r => { pingMap[r.name] = r.delay; });
                  return routingEntries.map(([gname, g]) => {
                    const chain = resolveChain(gname);
                    const finalChannel = chain[chain.length - 1];
                    const isFallback = finalChannel === 'DIRECT' || finalChannel === 'REJECT';
                    const delay = pingMap[finalChannel];
                    const pingCls = !delay || delay < 0 ? 'bad'
                                  : delay < 200 ? 'good'
                                  : delay < 500 ? 'medium' : 'bad';
                    return (
                      <div key={gname} className="active-group-card">
                        <div className="active-group-name">{gname}</div>
                        <div className="active-group-type">{g.type}</div>
                        <div className={`active-group-channel ${isFallback ? 'is-fallback' : ''}`}>
                          {chain.length > 1 ? (
                            <div title={chain.join(' → ')}>
                              <div className="active-group-chain-prefix">
                                {chain.slice(0, -1).join(' › ')} ›
                              </div>
                              <strong>{finalChannel}</strong>
                            </div>
                          ) : (
                            <strong>{finalChannel || <span className="text-muted">—</span>}</strong>
                          )}
                        </div>
                        {finalChannel && !isFallback && (
                          <div className={`active-group-ping ping-${pingCls}`}>
                            {delay > 0
                              ? <><Icon name="zap" size={10} /> {delay} ms</>
                              : <><Icon name="zap" size={10} /> {pinging ? 'тест...' : '—'}</>}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title"><Icon name="layers" size={14} /> Использование активных каналов</div>
                  <div className="card-subtitle">
                    Сейчас задействовано: <strong>{usageList.length}</strong> каналов
                  </div>
                </div>
              </div>

              {usageList.length === 0 ? (
                <div className="empty-state">Нет каналов в группах</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Группа (где канал активен)</th>
                      <th>Канал</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Доступен в группах</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageList.map(item => (
                      <tr key={item.name}>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {item.activeIn.length > 0
                              ? item.activeIn.map(gn => (
                                  <span key={gn} className="badge badge-success" title="Активен здесь">
                                    {gn}
                                  </span>
                                ))
                              : <span className="text-muted" style={{ fontSize: 11 }}>не активен</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`status-dot ${item.activeIn.length > 0 ? 'green' : 'gray'}`}></span>
                          <strong style={{ marginLeft: 4 }}>{item.name}</strong>
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>
                          {item.groups.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        );
      })()}

      <div className="card">
        <div className="card-header">
          <div className="card-title">🏆 Top-10 доменов</div>
          <button className="btn btn-sm btn-ghost" onClick={async () => {
            await api.del('/api/stats/top-domains'); reload();
            showToast('Очищено', 'success');
          }}>Очистить</button>
        </div>
        {topDomains.length === 0 ? (
          <div className="empty-state">Нет данных</div>
        ) : (
          <table className="table">
            <thead><tr><th>Домен</th><th style={{ textAlign: 'right' }}>Трафик</th></tr></thead>
            <tbody>
              {topDomains.map(d => (
                <tr key={d.domain}>
                  <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{d.domain}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtBytes((d.upload_bytes || 0) + (d.download_bytes || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Активные каналы — туннели с трафиком (в самом низу) */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Icon name="radio" size={14} /> Активные каналы ({channels.summary.active}/{channels.summary.total})
            </div>
            <div className="card-subtitle">
              <Icon name="download" size={10} /> {fmtBytes(channels.summary.total_received)} получено
              · <Icon name="upload" size={10} /> {fmtBytes(channels.summary.total_sent)} отправлено
            </div>
          </div>
        </div>
        {channels.channels.length === 0 ? (
          <div className="empty-state"><Icon name="radio" size={32} className="muted-icon" />Нет активных каналов</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Канал</th>
                <th>Тип</th>
                <th>Endpoint / Порт</th>
                <th>Handshake</th>
                <th style={{ textAlign: 'right' }}>RX</th>
                <th style={{ textAlign: 'right' }}>TX</th>
              </tr>
            </thead>
            <tbody>
              {channels.channels.map(c => (
                <tr key={`${c.type}-${c.name}`}>
                  <td>
                    <span className={`status-dot ${c.connected ? 'green' : (c.active ? 'yellow' : 'red')}`}></span>
                    <strong style={{ marginLeft: 6 }}>{c.name}</strong>
                  </td>
                  <td>
                    <span className={`badge ${c.type === 'awg' ? 'badge-info' : 'badge-purple'}`}>
                      {c.type === 'awg' ? 'AWG' : 'TrustTunnel'}
                    </span>
                  </td>
                  <td className="text-mono" style={{ fontSize: 11 }}>
                    {c.endpoint || (c.local_port ? `127.0.0.1:${c.local_port}` : '—')}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {c.handshake || (c.type === 'trusttunnel' ? (c.active ? 'running' : 'stopped') : '—')}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {c.type === 'awg' ? fmtBytes(c.received_bytes) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {c.type === 'awg' ? fmtBytes(c.sent_bytes) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =========================================================
// PROXY SWITCHER — пользовательские вкладки + прогрессивный пинг
// =========================================================

// Ключи localStorage
const LS_CUSTOM_TABS = 'mp_proxy_custom_tabs';
const LS_ACTIVE_TAB = 'mp_proxy_active_tab';
const LS_DELAYS = 'mp_proxy_delays';

// Загрузка/сохранение вкладок
const loadCustomTabs = () => {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_TABS) || '[]'); }
  catch { return []; }
};
const saveCustomTabs = (t) => localStorage.setItem(LS_CUSTOM_TABS, JSON.stringify(t));

// Загрузка/сохранение пингов — чтобы не терять при рефреше страницы
const loadStoredDelays = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_DELAYS) || '{}');
    // Пинги старше 10 минут сбрасываем
    const now = Date.now();
    const fresh = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && v.ts && now - v.ts < 10 * 60 * 1000) fresh[k] = v;
    }
    return fresh;
  } catch { return {}; }
};
const saveStoredDelays = (d) => {
  try { localStorage.setItem(LS_DELAYS, JSON.stringify(d)); } catch {}
};

function ProxySwitcher() {
  const [groups, setGroups] = useState({});
  const [smartGroupsList, setSmartGroupsList] = useState([]);  // v2.206
  const [smartConfigMap, setSmartConfigMap] = useState({});    // {group: {interval, tolerance, exclude}}
  const [smartModal, setSmartModal] = useState(null);          // {name, g} | null
  // какие каналы раскрыты (схлопнутые показывают только активный сервер)
  const [expandedChannels, setExpandedChannels] = useState({});
  const [delays, setDelays] = useState(() => loadStoredDelays());
  // Live трафик по proxy {name: {up, down, total_up, total_down}}
  const [traffic, setTraffic] = useState({});
  const [testing, setTesting] = useState(null);
  const [testingProgress, setTestingProgress] = useState(null);  // { current, total }
  const [loading, setLoading] = useState(true);
  const [customTabs, setCustomTabs] = useState(() => loadCustomTabs());
  const [activeTabId, setActiveTabId] = useState(() => localStorage.getItem(LS_ACTIVE_TAB) || 'all');
  const [editMode, setEditMode] = useState(false);
  const [tabModal, setTabModal] = useState(null);  // null | 'create' | tab object
  const [sortByPing, setSortByPing] = useState(() => localStorage.getItem('mp_sort_by_ping') === '1');

  useEffect(() => { localStorage.setItem('mp_sort_by_ping', sortByPing ? '1' : '0'); }, [sortByPing]);

  // Сохраняем пинги в localStorage при каждом изменении
  useEffect(() => { saveStoredDelays(delays); }, [delays]);

  const load = async () => {
    try { setGroups(await api.get('/api/proxies/groups')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const loadSmart = () => api.get("/api/mihomo/smart-config")
      .then(r => {
        const c = r.config || {};
        setSmartConfigMap(c);
        setSmartGroupsList(Object.keys(c).filter(n => c[n] && c[n].enabled !== false));
      }).catch(() => {});
    loadSmart();
    // подтягиваем последние пинги от воркера и других тестов,
    // чтобы в Переключении были свежие задержки без ручного «Тест всех».
    const loadRecent = () => api.get('/api/proxies/recent-delays')
      .then(r => {
        if (!r || typeof r !== 'object') return;
        setDelays(prev => {
          const next = { ...prev };
          for (const [name, info] of Object.entries(r)) {
            if (info && typeof info.delay === 'number' && info.delay > 0) {
              const tsMs = (info.ts || 0) * 1000;
              const prevEntry = prev[name];
              // обновляем только если сервер дал свежее значение чем то что у нас
              if (!prevEntry || tsMs > (prevEntry.ts || 0)) {
                next[name] = { delay: info.delay, ts: tsMs };
              }
            }
          }
          return next;
        });
      }).catch(() => {});
    loadRecent();
    const i = setInterval(() => { loadSmart(); loadRecent(); }, 10000);
    return () => clearInterval(i);
  }, []);

  // Polling трафика каждые 2с + обновление выбранного сервера (now) каждые 5с
  useEffect(() => {
    let stopped = false;
    let tickCount = 0;
    const tick = async () => {
      try {
        const t = await api.get('/api/proxies/traffic');
        if (!stopped) setTraffic(t || {});
      } catch {}
      // каждые ~6с обновляем группы, чтобы now (выбранный сервер)
      // менялся визуально без ручного F5 — особенно для умного автовыбора.
      tickCount++;
      if (tickCount % 3 === 0) {
        try {
          const g = await api.get('/api/proxies/groups');
          if (!stopped && g) setGroups(g);
        } catch {}
      }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { stopped = true; clearInterval(interval); };
  }, []);

  useEffect(() => { localStorage.setItem(LS_ACTIVE_TAB, activeTabId); }, [activeTabId]);
  useEffect(() => { saveCustomTabs(customTabs); }, [customTabs]);

  // Классификация групп: routing/channel/system
  const classification = useMemo(() => buildGroupClassification(groups), [groups]);

  // Резолвинг цепочки g.now → ... → конечный канал (для отображения в шапке)
  const resolveChain = (startGroupName) => {
    const chain = [];
    let cur = startGroupName;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const g = groups[cur];
      if (!g) break;
      const next = g.now;
      if (!next) break;
      chain.push(next);
      if (!groups[next] || next === 'DIRECT' || next === 'REJECT') break;
      cur = next;
    }
    return chain;
  };

  // Имена всех видимых групп (без GLOBAL)
  const allGroupNames = Object.keys(groups).filter(n => !SYSTEM_GROUPS.has(n));
  const routingGroups = allGroupNames.filter(n => classification[n] === 'routing');
  const channelGroups = allGroupNames.filter(n => classification[n] === 'channel');
  const assignedGroupNames = new Set(customTabs.flatMap(t => t.groups));

  let visibleGroupNames = [];
  if (activeTabId === 'all') {
    visibleGroupNames = allGroupNames;
  } else if (activeTabId === 'routing') {
    visibleGroupNames = routingGroups;
  } else if (activeTabId === 'channels') {
    visibleGroupNames = channelGroups;
  } else if (activeTabId === 'unassigned') {
    visibleGroupNames = allGroupNames.filter(n => !assignedGroupNames.has(n));
  } else {
    const t = customTabs.find(t => t.id === activeTabId);
    if (t) visibleGroupNames = t.groups.filter(n => allGroupNames.includes(n));
  }

  // ============ ПИНГ ============
  // Тест ОДНОГО прокси — обновляет state сразу
  const testOne = async (name) => {
    try {
      const r = await api.get(`/api/proxies/delay/${encodeURIComponent(name)}`);
      const delay = r.delay > 0 ? r.delay : -1;
      setDelays(prev => ({ ...prev, [name]: { delay, ts: Date.now() } }));
      return delay;
    } catch {
      setDelays(prev => ({ ...prev, [name]: { delay: -1, ts: Date.now() } }));
      return -1;
    }
  };

  // Тест списка — с прогрессом
  const testMany = async (proxyNames) => {
    const list = Array.from(new Set(proxyNames)).filter(p => p !== 'DIRECT' && p !== 'REJECT');
    setTestingProgress({ current: 0, total: list.length });

    // Параллельно по 4 штуки
    const CONCURRENT = 4;
    let done = 0;
    const queue = [...list];

    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        if (!p) break;
        await testOne(p);
        done++;
        setTestingProgress({ current: done, total: list.length });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENT, list.length) }, worker));
    setTestingProgress(null);
  };

  const testAll = async () => {
    const all = new Set();
    Object.values(groups).forEach(g => g.all.forEach(p => all.add(p)));
    await testMany(Array.from(all));
    showToast('✓ Тест завершён', 'success');
  };

  const testVisible = async () => {
    const set = new Set();
    visibleGroupNames.forEach(n => {
      if (groups[n]) groups[n].all.forEach(p => set.add(p));
    });
    await testMany(Array.from(set));
    showToast(`✓ Протестировано во вкладке`, 'success');
  };

  const testGroup = async (name) => {
    const g = groups[name];
    if (!g) return;
    await testMany(g.all);
  };

  const switchP = async (group, proxy) => {
    try {
      await api.put('/api/proxies/switch', { group, proxy });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  // вкл/выкл умного автовыбора. При первом включении открывает
  // модал настроек этой конкретной группы (per-group: разный exclude для каналов).
  const toggleSmartGroup = (name, g) => {
    const has = smartGroupsList.includes(name);
    if (has) {
      // Выключение — конфиг сохраняется, только enabled=false
      api.post('/api/mihomo/smart-config', { group: name, enabled: false })
        .then(() => {
          setSmartGroupsList(prev => prev.filter(x => x !== name));
          setSmartConfigMap(prev => ({ ...prev, [name]: { ...(prev[name] || {}), enabled: false } }));
          showToast(`Умный автовыбор выключен: "${name}"`, 'success');
        })
        .catch(e => showToast(e.message, 'error'));
    } else {
      // Включение: если у группы уже есть сохранённый конфиг — просто включаем,
      // без модала (настройки помнятся). Иначе открываем модал с дефолтами.
      const existing = smartConfigMap[name];
      if (existing && (existing.interval || existing.tolerance || existing.exclude)) {
        api.post('/api/mihomo/smart-config', { group: name, enabled: true })
          .then(() => {
            setSmartGroupsList(prev => [...prev, name]);
            setSmartConfigMap(prev => ({ ...prev, [name]: { ...existing, enabled: true } }));
            showToast(`⚡ Умный автовыбор включён: "${name}" (восстановлены настройки)`, 'success');
          })
          .catch(e => showToast(e.message, 'error'));
      } else {
        setSmartModal({ name, g });
      }
    }
  };

  const findBest = async (group) => {
    setTesting(group);
    showToast(`Поиск лучшего в "${group}"...`, 'info');
    try {
      const r = await api.post(`/api/proxies/best/${encodeURIComponent(group)}`);
      showToast(`✨ ${r.best.name} (${r.best.delay}ms)`, 'success');
      const now = Date.now();
      setDelays(prev => {
        const next = { ...prev };
        r.all_results.forEach(x => { next[x.name] = { delay: x.delay, ts: now }; });
        return next;
      });
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setTesting(null); }
  };

  // ============ УПРАВЛЕНИЕ ВКЛАДКАМИ ============
  const createTab = (name) => {
    const newTab = { id: `tab_${Date.now()}`, name, groups: [] };
    setCustomTabs([...customTabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const renameTab = (id, newName) => {
    setCustomTabs(customTabs.map(t => t.id === id ? { ...t, name: newName } : t));
  };

  const deleteTab = (id) => {
    if (!confirm('Удалить вкладку? Группы останутся, просто не будут закреплены.')) return;
    setCustomTabs(customTabs.filter(t => t.id !== id));
    if (activeTabId === id) setActiveTabId('all');
  };

  const toggleGroupInTab = (tabId, groupName) => {
    setCustomTabs(customTabs.map(t => {
      if (t.id !== tabId) return t;
      const has = t.groups.includes(groupName);
      return { ...t, groups: has ? t.groups.filter(g => g !== groupName) : [...t.groups, groupName] };
    }));
  };

  const moveGroupTo = (groupName, targetTabId) => {
    setCustomTabs(customTabs.map(t => {
      const without = t.groups.filter(g => g !== groupName);
      if (t.id === targetTabId) {
        return { ...t, groups: [...without, groupName] };
      }
      return { ...t, groups: without };
    }));
    showToast(targetTabId === null ? 'Откреплена от вкладок' : 'Перенесена', 'success');
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const unassignedCount = allGroupNames.filter(n => !assignedGroupNames.has(n)).length;

  return (
    <div>
      {/* Полоса вкладок */}
      <div className="proxy-tabs">
        <div className={`proxy-tab ${activeTabId === 'all' ? 'active' : ''}`}
             onClick={() => setActiveTabId('all')}>
          <Icon name="list" size={13} /> Все
          <span className="badge badge-info">{allGroupNames.length}</span>
        </div>

        {routingGroups.length > 0 && (
          <div className={`proxy-tab ${activeTabId === 'routing' ? 'active' : ''}`}
               onClick={() => setActiveTabId('routing')}
               title="Группы управления трафиком — определяют куда направить тип трафика">
            <Icon name="target" size={13} /> Маршрутизация
            <span className="badge badge-purple">{routingGroups.length}</span>
          </div>
        )}

        {channelGroups.length > 0 && (
          <div className={`proxy-tab ${activeTabId === 'channels' ? 'active' : ''}`}
               onClick={() => setActiveTabId('channels')}
               title="Группы каналов — пулы серверов одного протокола (AWG, TT, VLESS...)">
            <Icon name="shield" size={13} /> Каналы
            <span className="badge badge-success">{channelGroups.length}</span>
          </div>
        )}

        {unassignedCount > 0 && unassignedCount < allGroupNames.length && (
          <div className={`proxy-tab ${activeTabId === 'unassigned' ? 'active' : ''}`}
               onClick={() => setActiveTabId('unassigned')}>
            <Icon name="layers" size={13} /> Без вкладки
            <span className="badge badge-warning">{unassignedCount}</span>
          </div>
        )}

        {customTabs.map(t => (
          <div key={t.id} className={`proxy-tab ${activeTabId === t.id ? 'active' : ''}`}
               onClick={() => setActiveTabId(t.id)}>
            {t.name}
            <span className="badge badge-info">{t.groups.filter(g => allGroupNames.includes(g)).length}</span>
            {editMode && (
              <>
                <span className="tab-action" onClick={e => { e.stopPropagation(); setTabModal(t); }} title="Настроить"><Icon name="settings" size={12} /></span>
                <span className="tab-action" onClick={e => { e.stopPropagation(); deleteTab(t.id); }} title="Удалить">🗑</span>
              </>
            )}
          </div>
        ))}

        <div className="proxy-tab tab-add" onClick={() => setTabModal('create')} title="Новая вкладка">
          ➕
        </div>

        <div style={{ flex: 1 }}></div>

        <button className={`btn btn-sm ${editMode ? 'btn-primary' : ''}`}
                onClick={() => setEditMode(!editMode)} title="Режим редактирования">
          {editMode ? <><Icon name="check" size={12}/> Готово</> : <Icon name="edit" size={12}/>}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex-between mb-16" style={{ marginTop: 12 }}>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {testingProgress
            ? `🧪 Тестируется ${testingProgress.current}/${testingProgress.total}...`
            : `Видимо групп: ${visibleGroupNames.length} · Всего: ${allGroupNames.length}`}
        </span>
        <div className="btn-group">
          <button className={`btn btn-sm ${sortByPing ? 'btn-primary' : ''}`}
                  onClick={() => setSortByPing(!sortByPing)}
                  title="Сортировать прокси в группе по пингу">
            {sortByPing ? <><Icon name="chart" size={12}/> По пингу</> : <><Icon name="list" size={12}/> Порядок</>}
          </button>
          <button className="btn btn-sm" onClick={load}>↻</button>
        </div>
      </div>

      {/* Прогресс-бар */}
      {testingProgress && (
        <div className="progress-bar-container">
          <div className="progress-bar"
               style={{ width: `${(testingProgress.current / testingProgress.total) * 100}%` }}></div>
        </div>
      )}

      {/* Группы */}
      {visibleGroupNames.length === 0 && (
        <div className="empty-state">
          <div className="icon">📂</div>
          {activeTabId === 'all' ? 'Нет групп в конфиге' :
           activeTabId === 'unassigned' ? 'Все группы закреплены за вкладками' :
           'Вкладка пуста. Нажмите шестерёнку чтобы добавить группы.'}
        </div>
      )}

      {visibleGroupNames.map(name => {
        const g = groups[name];
        if (!g) return null;
        const groupKind = classification[name];
        const isRouting = groupKind === 'routing';

        // Трафик через группу: всегда показываем для routing-групп (даже 0)
        const grpTraffic = traffic[name] || { down: 0, up: 0 };
        const showGroupTraffic = isRouting;

        return (
          <div key={name} className="proxy-group-card">
            {(() => {
              const isChannel = classification[name] === 'channel';
              const isExpanded = !isChannel || expandedChannels[name];
              const activeProxy = g.now;
              const activeDelay = delays[activeProxy]?.delay;
              return (
                <>
                <div className="proxy-group-header"
                     onClick={isChannel ? (e) => {
                       // не сворачиваем если клик по кнопке
                       if (e.target.closest('button')) return;
                       setExpandedChannels(p => ({ ...p, [name]: !p[name] }));
                     } : undefined}
                     style={isChannel ? { cursor: 'pointer' } : {}}>
                  {/* Левая часть: имя группы + badge + скорость */}
                  <div className="proxy-group-title">
                    {isChannel && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)',
                                     transform: isExpanded ? 'rotate(90deg)' : 'none',
                                     transition: 'transform .15s', display: 'inline-block',
                                     marginRight: 4 }}>▶</span>
                    )}
                    <span className="proxy-group-name">{name}</span>
                <span className="badge badge-info">
                  {{ 'Selector': 'Выбор вручную', 'URLTest': 'Авто (Mihomo)',
                     'Fallback': 'Резерв', 'LoadBalance': 'Баланс', 'Relay': 'Цепочка'
                  }[g.type] || g.type}
                </span>
                {smartGroupsList.includes(name) && (
                  <span className="badge" title="Умный автовыбор быстрейшего сервера включён"
                        style={{ background: 'var(--success)', color: '#fff', fontWeight: 600 }}>
                    ⚡ Умный выбор
                  </span>
                )}
                {showGroupTraffic && (
                  <span className="proxy-group-traffic-inline"
                        title={`Скорость трафика через группу ${name}`}>
                    <span className="trf-label">RX</span>
                    <span className="trf-value">{fmtBps(grpTraffic.down)}</span>
                    <span className="trf-sep">·</span>
                    <span className="trf-label">TX</span>
                    <span className="trf-value">{fmtBps(grpTraffic.up)}</span>
                  </span>
                )}
              </div>

              {/* Правая часть: кнопки действий */}
              <div className="proxy-group-actions">
                {customTabs.length > 0 && (
                  <GroupMoveMenu
                    groupName={name}
                    currentTabId={customTabs.find(t => t.groups.includes(name))?.id}
                    customTabs={customTabs}
                    onMove={(tid) => moveGroupTo(name, tid)}
                  />
                )}
                <button className="btn btn-sm" onClick={() => testGroup(name)}
                        title="Протестировать пинг всех серверов в этой группе"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="refresh" size={12} /> Тест
                </button>
                <button className={`btn btn-sm ${smartGroupsList.includes(name) ? 'btn-success' : ''}`}
                        onClick={() => toggleSmartGroup(name, g)}
                        title={smartGroupsList.includes(name)
                          ? 'Умный автовыбор включён — нажмите чтобы выключить'
                          : 'Включить умный автовыбор быстрейшего сервера'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="zap" size={12} />
                  {smartGroupsList.includes(name) ? 'Умный вкл' : 'Умный'}
                </button>
                {smartGroupsList.includes(name) && (
                  <button className="btn btn-sm" onClick={() => setSmartModal({ name, g })}
                          title="Настройки умного автовыбора для этой группы">
                    ⚙
                  </button>
                )}
              </div>
            </div>
                {isChannel && !isExpanded && (
                  <div onClick={() => setExpandedChannels(p => ({ ...p, [name]: true }))}
                       style={{ display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 11px', background: 'var(--bg-3)',
                                border: '1px solid var(--border)', borderRadius: 6,
                                cursor: 'pointer', fontSize: 12, marginTop: 6 }}>
                    <span style={{ color: 'var(--text-2)' }}>
                      {activeProxy ? `↳ ${activeProxy}` : '(нет выбора)'}
                    </span>
                    {activeDelay !== undefined && activeDelay > 0 && (
                      <span className={`proxy-delay ${delayClass(activeDelay)}`}>
                        {activeDelay}ms
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
                      ▼ показать {g.all.length}
                    </span>
                  </div>
                )}
                {isExpanded && (
                <div className={`proxy-options ${isChannel ? 'channel-expand' : ''}`}>
              {(() => {
                let opts = [...g.all];
                if (sortByPing) {
                  // DIRECT/REJECT — в конце, остальные по пингу asc (untested в конце)
                  opts.sort((a, b) => {
                    const sA = a === 'DIRECT' || a === 'REJECT';
                    const sB = b === 'DIRECT' || b === 'REJECT';
                    if (sA && !sB) return 1;
                    if (!sA && sB) return -1;
                    if (sA && sB) return g.all.indexOf(a) - g.all.indexOf(b);
                    const dA = delays[a]?.delay;
                    const dB = delays[b]?.delay;
                    const validA = dA !== undefined && dA > 0;
                    const validB = dB !== undefined && dB > 0;
                    if (validA && !validB) return -1;
                    if (!validA && validB) return 1;
                    if (validA && validB) return dA - dB;
                    // Оба не тестированы или оба не работают — по исходному порядку
                    return g.all.indexOf(a) - g.all.indexOf(b);
                  });
                }
                return opts.map(p => {
                  const entry = delays[p];
                  const d = entry?.delay;
                  const age = entry?.ts ? Math.floor((Date.now() - entry.ts) / 1000) : null;
                  const isActive = g.now === p;

                  // Если эта плитка ссылается на другую группу — резолвим её цепочку,
                  // показываем финальный прокси под именем (вне зависимости активна она или нет)
                  let finalProxy = null;
                  if (groups[p] && p !== 'DIRECT' && p !== 'REJECT') {
                    const subChain = resolveChain(p);
                    const last = subChain[subChain.length - 1];
                    if (last && last !== p && last !== 'DIRECT' && last !== 'REJECT') {
                      finalProxy = last;
                    }
                  }

                  const isSmart = smartGroupsList.includes(name);
                  return (
                    <div key={p}
                         className={`proxy-option ${isActive ? 'active' : ''} ${finalProxy ? 'has-final' : ''}`}
                         onClick={() => {
                           if (isSmart) {
                             showToast('Управляется умным автовыбором — отключите ⚡ Умный для ручного выбора', 'info');
                             return;
                           }
                           switchP(name, p);
                         }}
                         style={isSmart ? { cursor: 'not-allowed', opacity: 0.85 } : {}}
                         title={isSmart ? 'Управляется умным автовыбором' : ''}>
                      <div className="proxy-option-main">
                        <span className="proxy-option-name">{p}</span>
                        <span className="proxy-option-meta">
                          {d !== undefined && (
                            <span className={`proxy-delay ${delayClass(d)}`}
                                  title={age !== null ? `${age}с назад` : ''}>
                              {d > 0 ? `${d}ms` : '❌'}
                            </span>
                          )}
                        </span>
                      </div>
                      {finalProxy && (
                        <div className="proxy-option-final" title={`Внутри ${p} активен: ${finalProxy}`}>
                          ↳ {finalProxy}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
                )}
                </>
              );
            })()}
          </div>
        );
      })}

      {tabModal && <TabEditModal
        initial={tabModal === 'create' ? null : tabModal}
        allGroups={allGroupNames}
        onClose={() => setTabModal(null)}
        onCreate={(name) => { createTab(name); setTabModal(null); }}
        onRename={(id, name) => { renameTab(id, name); setTabModal(null); }}
        onToggleGroup={(id, group) => toggleGroupInTab(id, group)}
      />}
      {smartModal && (
        <SmartGroupSettingsModal
          groupName={smartModal.name}
          isChannel={(() => {
            const all = Object.keys(groups).filter(n => !SYSTEM_GROUPS.has(n));
            return classifyGroup({ name: smartModal.name, ...(smartModal.g || {}) },
                                 new Set(all)) === 'channel';
          })()}
          initialConfig={smartConfigMap[smartModal.name]}
          onClose={() => setSmartModal(null)}
          onSaved={() => {
            api.get('/api/mihomo/smart-config').then(r => {
              const c = r.config || {};
              setSmartConfigMap(c);
              setSmartGroupsList(Object.keys(c).filter(n => c[n] && c[n].enabled !== false));
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function GroupMoveMenu({ groupName, currentTabId, customTabs, onMove }) {
  const [open, setOpen] = useState(false);
  const current = customTabs.find(t => t.id === currentTabId);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
              title="Переместить на вкладку">
        📂 {current ? current.name : 'Без вкладки'} ▾
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 51,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4, minWidth: 180, boxShadow: 'var(--shadow)'
          }}>
            <div className="menu-item" onClick={() => { onMove(null); setOpen(false); }}>
              📌 Без вкладки
            </div>
            {customTabs.map(t => (
              <div key={t.id} className={`menu-item ${t.id === currentTabId ? 'active' : ''}`}
                   onClick={() => { onMove(t.id); setOpen(false); }}>
                {t.id === currentTabId ? '✓ ' : ''}{t.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TabEditModal({ initial, allGroups, onClose, onCreate, onRename, onToggleGroup }) {
  const isCreate = !initial;
  const [name, setName] = useState(initial?.name || '');

  const submit = () => {
    if (!name.trim()) return;
    if (isCreate) onCreate(name.trim());
    else onRename(initial.id, name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 480 }}>
        <div className="modal-title">
          {isCreate ? '+ Новая вкладка' : `Настроить: ${initial.name}`}
        </div>

        <div className="form-group">
          <label className="form-label">Название вкладки</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                 placeholder="Основной трафик" autoFocus
                 onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {!isCreate && (
          <div className="form-group">
            <label className="form-label">
              Группы на этой вкладке ({initial.groups.length})
            </label>
            <div style={{ maxHeight: 280, overflowY: 'auto',
                          border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
              {allGroups.length === 0 && (
                <div className="text-muted" style={{ padding: 8, fontSize: 11 }}>Нет групп в конфиге</div>
              )}
              {allGroups.map(g => (
                <label key={g} style={{ display: 'flex', gap: 8, padding: 6, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={initial.groups.includes(g)}
                         onChange={() => onToggleGroup(initial.id, g)} />
                  <span>{g}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {isCreate ? 'Отмена' : 'Закрыть'}
          </button>
          {(isCreate || name !== initial.name) && (
            <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
              {isCreate ? 'Создать' : 'Переименовать'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// PROXY PROVIDERS (Subscriptions)
// =========================================================
function Providers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {name, ...}

  const load = async () => {
    try { setList(await api.get('/api/mihomo/providers')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const del = async (name) => {
    if (!confirm(`Удалить провайдер "${name}"?`)) return;
    try {
      await api.del(`/api/mihomo/providers/${encodeURIComponent(name)}`);
      showToast('Удалён', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const refresh = async (name, clearCache = false) => {
    try {
      const url = `/api/mihomo/providers/${encodeURIComponent(name)}/refresh${clearCache ? '?clear_cache=true' : ''}`;
      const r = await api.post(url);
      if (r.cache_deleted) showToast(`Кеш удалён, подписка перезагружается`, 'success');
      else showToast('Обновление запущено', 'success');
      setTimeout(load, 1500);
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <span className="text-muted">Подписки (proxy-providers): {list.length}</span>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            💡 Это подписки из секции <code>proxy-providers</code> вашего config.yaml
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Новая подписка</button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <Icon name="satellite" size={32} className="muted-icon" />
          В конфиге нет секции proxy-providers
        </div>
      ) : list.map(p => (
        <div key={p.name} className="provider-card">
          <div className="provider-header">
            <div style={{ flex: 1 }}>
              <div className="provider-name">{p.name}</div>
              <div className="provider-meta">
                <span><span className="badge badge-info">{p.type}</span></span>
                <span>Interval: <strong>{p.interval}s</strong></span>
                {p.health_check?.enable && <span className="badge badge-success">health-check</span>}
              </div>
            </div>
            <div className="btn-group">
              <button className="btn btn-sm" onClick={() => refresh(p.name)} title="Обновить подписку (из кеша/по URL)"><Icon name="refresh" size={12} /> Обновить</button>
              <button className="btn btn-sm btn-ghost" onClick={() => refresh(p.name, true)}
                      title="Удалить кеш и скачать заново">🧹 Hard refresh</button>
              <button className="btn btn-sm" onClick={() => setModal(p)}>✏️</button>
              <button className="btn btn-sm btn-danger" onClick={() => del(p.name)}>🗑</button>
            </div>
          </div>
          {p.url && <div className="provider-url">{p.url}</div>}
          {p.path && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            Path: <code>{p.path}</code>
          </div>}
        </div>
      ))}

      {modal && <ProviderEditModal initial={modal === 'create' ? null : modal}
                                   onClose={() => setModal(null)}
                                   onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function ProviderEditModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => initial || {
    name: '',
    type: 'http',
    url: '',
    interval: 3600,
    path: '',
    health_check: { enable: true, url: 'http://www.gstatic.com/generate_204', interval: 600 }
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testUrl = async () => {
    if (!form.url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/api/mihomo/providers/test-url', {
        url: form.url,
        timeout: 10
      });
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const f = (k) => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), disabled: saving });
  const hcf = (k) => ({
    value: (form.health_check || {})[k] ?? '',
    onChange: e => setForm(p => ({ ...p, health_check: { ...(p.health_check || {}), [k]: e.target.value } })),
    disabled: saving,
  });

  const submit = async () => {
    try {
      setSaving(true);
      const payload = {
        ...form,
        interval: parseInt(form.interval) || 3600,
        health_check: form.health_check?.enable ? form.health_check : null
      };
      if (isEdit) {
        await api.put(`/api/mihomo/providers/${encodeURIComponent(initial.name)}`, payload);
        showToast('Обновлено', 'success');
      } else {
        await api.post('/api/mihomo/providers', payload);
        showToast('Создано', 'success');
      }
      onSaved();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {saving && (
          <div className="modal-saving-overlay">
            <div className="spinner"></div>
            <div className="modal-saving-text">Сохранение и перезагрузка Mihomo...</div>
          </div>
        )}
        <div className="modal-title">{isEdit ? `✏️ ${initial.name}` : '+ Новая подписка'}</div>

        <div className="form-group">
          <label className="form-label">Имя (уникальное)</label>
          <input className="form-input" {...f('name')} disabled={isEdit}
                 placeholder="EOF [SS/TROJAN/VLESS]" />
        </div>

        <div className="form-group">
          <label className="form-label">Тип</label>
          <select className="form-select" {...f('type')}>
            <option value="http">http (URL подписки)</option>
            <option value="file">file (локальный файл)</option>
            <option value="inline">inline</option>
          </select>
        </div>

        {form.type !== 'file' && (
          <div className="form-group">
            <label className="form-label">URL подписки</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" {...f('url')}
                     style={{ flex: 1 }}
                     placeholder="https://example.com/sub/token" />
              <button type="button" className="btn btn-sm" onClick={testUrl}
                      disabled={!form.url || testing || saving}
                      style={{ whiteSpace: 'nowrap' }}>
                {testing ? '⏳ Проверка...' : '🔍 Проверить'}
              </button>
            </div>
            {testResult && (
              <div className={`url-test-result ${testResult.ok ? 'ok' : 'err'}`}>
                {testResult.ok ? (
                  <>
                    <strong>✓ Доступна</strong> · формат: <code>{testResult.format}</code>
                    {testResult.proxy_count > 0 && <> · прокси: <strong>{testResult.proxy_count}</strong></>}
                    · размер: {(testResult.size / 1024).toFixed(1)} KB
                  </>
                ) : (
                  <>
                    <strong>✗ Недоступна</strong> · {testResult.error}
                    {testResult.status && <> (HTTP {testResult.status})</>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Interval (секунды)</label>
          <input className="form-input" type="number" {...f('interval')} />
        </div>

        <div className="form-group">
          <label className="form-label">Path (путь кеша)</label>
          <input className="form-input" {...f('path')}
                 placeholder={`./providers/${form.name || 'name'}.yaml`} />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.health_check?.enable}
                   onChange={e => setForm(p => ({
                     ...p,
                     health_check: { ...(p.health_check || {}),
                                     enable: e.target.checked,
                                     url: (p.health_check?.url || 'http://www.gstatic.com/generate_204'),
                                     interval: +(p.health_check?.interval || 600) }
                   }))} />
            <strong>Health-check</strong>
          </label>
        </div>

        {form.health_check?.enable && (
          <>
            <div className="form-group">
              <label className="form-label">Health-check URL</label>
              <input className="form-input" {...hcf('url')} />
            </div>
            <div className="form-group">
              <label className="form-label">Health-check Interval (сек)</label>
              <input className="form-input" type="number" {...hcf('interval')} />
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !form.name}>
            {saving ? <><Icon name="refresh" size={12} className="spin" /> Сохранение...</> : (isEdit ? 'Сохранить' : 'Создать')}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// RULES EDITOR
// =========================================================
const RULE_TYPES = [
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX',
  'IP-CIDR', 'IP-CIDR6', 'SRC-IP-CIDR',
  'GEOIP', 'GEOSITE',
  'DST-PORT', 'SRC-PORT', 'PROCESS-NAME', 'PROCESS-PATH',
  'RULE-SET', 'MATCH'
];

function RulesEditor() {
  const [rules, setRules] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingIdx, setEditingIdx] = useState(null);
  const [newRule, setNewRule] = useState({ type: 'DOMAIN-SUFFIX', payload: '', target: '' });
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const [r, t] = await Promise.all([
        api.get('/api/mihomo/rules'),
        api.get('/api/mihomo/rules/targets')
      ]);
      setRules(r);
      setTargets(t.targets);
      if (!newRule.target && t.targets.length) {
        setNewRule(prev => ({ ...prev, target: t.targets[0] }));
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const addRule = async () => {
    if (!newRule.target || !newRule.target.trim()) {
      showToast('Выберите target (целевую группу или DIRECT/REJECT)', 'warning');
      return;
    }
    if (newRule.type !== 'MATCH' && !newRule.payload) {
      showToast('Заполните payload', 'warning');
      return;
    }
    // автоматически добавлять no-resolve для IP правил
    const needsNoResolve = ['IP-CIDR', 'IP-CIDR6', 'GEOIP', 'SRC-IP-CIDR'].includes(newRule.type);
    let ruleStr;
    if (newRule.type === 'MATCH') {
      ruleStr = `MATCH,${newRule.target}`;
    } else if (needsNoResolve && newRule.noResolve !== false) {
      ruleStr = `${newRule.type},${newRule.payload},${newRule.target},no-resolve`;
    } else {
      ruleStr = `${newRule.type},${newRule.payload},${newRule.target}`;
    }
    try {
      await api.post('/api/mihomo/rules', { rule: ruleStr });
      showToast('Правило добавлено', 'success');
      setNewRule({ ...newRule, payload: '' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const delRule = async (idx) => {
    if (!confirm(`Удалить правило #${idx + 1}?`)) return;
    try {
      await api.del(`/api/mihomo/rules/${idx}`);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const saveEdit = async (idx, newStr) => {
    try {
      await api.put(`/api/mihomo/rules/${idx}`, { rule: newStr });
      showToast('Сохранено', 'success');
      setEditingIdx(null);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const move = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= rules.length) return;
    const arr = rules.map(r => r.raw);
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    try {
      await api.put('/api/mihomo/rules', { rules: arr });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  // drag&drop для переупорядочивания правил
  const [dragSrc, setDragSrc] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const onDragStart = (idx) => (e) => {
    setDragSrc(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOverIdx = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== idx) setDragOver(idx);
  };
  const onDragLeave = () => setDragOver(null);
  const onDrop = (dstIdx) => async (e) => {
    e.preventDefault();
    setDragOver(null);
    const src = dragSrc;
    setDragSrc(null);
    if (src === null || src === dstIdx) return;
    const arr = rules.map(r => r.raw);
    const [item] = arr.splice(src, 1);
    arr.splice(dstIdx, 0, item);
    try {
      await api.put('/api/mihomo/rules', { rules: arr });
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const filtered = search
    ? rules.filter(r => r.raw.toLowerCase().includes(search.toLowerCase()))
    : rules;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="flex-between mb-16">
        <span className="text-muted" style={{ fontSize: 11 }}>
          💡 Target — группа из <code>proxy-groups</code> или <code>DIRECT</code>/<code>REJECT</code>.
          Управлять группами — на вкладке <strong>📂 Группы</strong>.
        </span>
      </div>

      <div className="card">
        <div className="card-title">+ Добавить правило</div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 180px auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Тип</label>
            <select className="form-select" value={newRule.type}
                    onChange={e => setNewRule(p => ({ ...p, type: e.target.value }))}>
              {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Payload {newRule.type === 'MATCH' && '(не требуется)'}</label>
            <input className="form-input" placeholder={
              newRule.type === 'DOMAIN-SUFFIX' ? 'example.com' :
              newRule.type === 'IP-CIDR' ? '91.108.0.0/16' :
              newRule.type === 'GEOIP' ? 'RU' : 'payload'
            } value={newRule.payload}
                   disabled={newRule.type === 'MATCH'}
                   onChange={e => setNewRule(p => ({ ...p, payload: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Target</label>
            <select className="form-select" value={newRule.target}
                    onChange={e => setNewRule(p => ({ ...p, target: e.target.value }))}>
              {targets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={addRule}>+ Добавить</button>
        </div>
      </div>

      <div className="flex-between mb-16">
        <span className="text-muted">Правил: {rules.length} {search && `· отфильтровано: ${filtered.length}`}</span>
        <input className="form-input" style={{ width: 280 }}
               placeholder="🔍 Поиск..." value={search}
               onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 8 }}>
        {filtered.map(r => (
          <div key={r.index}
               draggable={editingIdx !== r.index}
               onDragStart={onDragStart(r.index)}
               onDragOver={onDragOverIdx(r.index)}
               onDragLeave={onDragLeave}
               onDrop={onDrop(r.index)}
               style={{
                 opacity: dragSrc === r.index ? 0.4 : 1,
                 borderTop: dragOver === r.index && dragSrc !== null && dragSrc !== r.index
                   ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
                 cursor: editingIdx !== r.index ? 'grab' : 'default',
               }}
               title={editingIdx === r.index ? '' : 'Перетащи чтобы изменить порядок'}>
            <RuleRow rule={r} targets={targets}
                     editing={editingIdx === r.index}
                     onStartEdit={() => setEditingIdx(r.index)}
                     onCancelEdit={() => setEditingIdx(null)}
                     onSave={(str) => saveEdit(r.index, str)}
                     onDelete={() => delRule(r.index)}
                     onMoveUp={() => move(r.index, -1)}
                     onMoveDown={() => move(r.index, 1)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProxyGroupModal({ onClose, onSaved, initial = null }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => initial || {
    name: '',
    type: 'select',
    proxies: [],
    use: [],
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: null,
  });
  const [available, setAvailable] = useState({ groups: [], proxies: [], providers: [], provider_proxies: {}, specials: [] });

  useEffect(() => {
    api.get('/api/mihomo/proxy-groups/available-proxies').then(setAvailable).catch(() => {});
  }, []);

  const f = (k) => ({ value: form[k] ?? '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  const toggleItem = (field, item) => {
    setForm(p => {
      const arr = p[field] || [];
      return { ...p, [field]: arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item] };
    });
  };

  const submit = async () => {
    if (!form.name) return;
    if ((form.proxies?.length || 0) + (form.use?.length || 0) === 0) {
      showToast('Выберите хотя бы один прокси или подписку', 'warning');
      return;
    }
    const payload = {
      name: form.name, type: form.type,
      proxies: form.proxies?.length ? form.proxies : null,
      use: form.use?.length ? form.use : null,
    };
    if (form.type !== 'select') {
      payload.url = form.url;
      payload.interval = parseInt(form.interval) || 300;
      if ((form.type === 'url-test' || form.type === 'fallback') && form.tolerance) {
        payload.tolerance = parseInt(form.tolerance);
      }
    }
    try {
      if (isEdit) {
        await api.put(`/api/mihomo/proxy-groups/${encodeURIComponent(initial.name)}`, payload);
        showToast('Группа обновлена', 'success');
      } else {
        await api.post('/api/mihomo/proxy-groups', payload);
        showToast('Группа создана', 'success');
      }
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const allForGroupMembers = [
    ...available.specials,
    ...available.groups.filter(g => g !== form.name),  // не даём добавить себя
    ...available.proxies
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 560 }}>
        <div className="modal-title">
          {isEdit ? `✏️ ${initial.name}` : '➕ Новая proxy-group'}
        </div>

        <div className="form-group">
          <label className="form-label">Имя группы</label>
          <input className="form-input" {...f('name')} disabled={isEdit}
                 placeholder="My Group" />
        </div>

        <div className="form-group">
          <label className="form-label">Тип</label>
          <select className="form-select" {...f('type')}>
            <option value="select">select — ручной выбор</option>
            <option value="url-test">url-test — автоматически самый быстрый</option>
            <option value="fallback">fallback — переключение при недоступности</option>
            <option value="load-balance">load-balance — распределение нагрузки</option>
          </select>
        </div>

        {form.type !== 'select' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Test URL</label>
              <input className="form-input" {...f('url')} />
            </div>
            <div className="form-group">
              <label className="form-label">Interval (сек)</label>
              <input className="form-input" type="number" {...f('interval')} />
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">
            Прокси в группе ({form.proxies?.length || 0} выбрано)
          </label>
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)',
                        borderRadius: 6, padding: 6 }}>
            {allForGroupMembers.length === 0
              ? <div className="text-muted" style={{ padding: 8, fontSize: 11 }}>Нет доступных прокси</div>
              : allForGroupMembers.map(p => (
                <label key={p} style={{ display: 'flex', gap: 8, padding: 4, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={form.proxies?.includes(p) || false}
                         onChange={() => toggleItem('proxies', p)} />
                  <span>{p}</span>
                  {available.specials.includes(p) && <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>special</span>}
                  {available.groups.includes(p) && <span className="badge badge-info" style={{ marginLeft: 'auto' }}>group</span>}
                </label>
              ))
            }
          </div>
        </div>

        {available.providers.length > 0 && (
          <div className="form-group">
            <label className="form-label">
              Подписки целиком (use, {form.use?.length || 0} выбрано)
            </label>
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)',
                          borderRadius: 6, padding: 6 }}>
              {available.providers.map(p => (
                <label key={p} style={{ display: 'flex', gap: 8, padding: 4, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={form.use?.includes(p) || false}
                         onChange={() => toggleItem('use', p)} />
                  <span>{p}</span>
                  <span className="badge badge-purple" style={{ marginLeft: 'auto' }}>provider</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {available.provider_proxies && Object.keys(available.provider_proxies).length > 0 && (
          <div className="form-group">
            <label className="form-label">
              Отдельные серверы из подписок ({(form.proxies || []).filter(p =>
                Object.values(available.provider_proxies).some(arr => arr.includes(p))).length} выбрано)
            </label>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 6 }}>
              Выберите конкретный сервер (Vless/Hy2/...) из подписки — он добавится в канал
              как отдельный прокси, без всей подписки.
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)',
                          borderRadius: 6, padding: 6 }}>
              {Object.entries(available.provider_proxies).map(([prov, names]) => (
                <div key={prov} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                                textTransform: 'uppercase', letterSpacing: '.04em',
                                padding: '4px 4px 2px' }}>
                    {prov}
                  </div>
                  {names.map(pn => (
                    <label key={pn} style={{ display: 'flex', gap: 8, padding: '3px 4px 3px 12px',
                                              cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={form.proxies?.includes(pn) || false}
                             onChange={() => toggleItem('proxies', pn)} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pn}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={!form.name}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleRow({ rule, targets, editing, onStartEdit, onCancelEdit, onSave, onDelete, onMoveUp, onMoveDown }) {
  const [form, setForm] = useState({
    type: rule.type, payload: rule.payload, target: rule.target
  });
  // target существует в текущих группах?
  const targetMissing = targets && targets.length > 0 && !targets.includes(rule.target);

  useEffect(() => {
    if (editing) setForm({ type: rule.type, payload: rule.payload, target: rule.target });
  }, [editing, rule]);

  if (editing) {
    return (
      <div className="rule-row editing">
        <span className="rule-idx">{rule.index + 1}</span>
        <select className="rule-type form-select" value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
          {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="rule-payload form-input" value={form.payload}
               disabled={form.type === 'MATCH'}
               onChange={e => setForm(p => ({ ...p, payload: e.target.value }))} />
        <select className="rule-target form-select" value={form.target}
                onChange={e => setForm(p => ({ ...p, target: e.target.value }))}>
          {targets.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn btn-sm btn-success" onClick={() => {
          if (!form.target || !form.target.trim()) {
            showToast('Выберите target', 'warning');
            return;
          }
          const s = form.type === 'MATCH' ? `MATCH,${form.target}` : `${form.type},${form.payload},${form.target}`;
          onSave(s);
        }}>✓</button>
        <button className="btn btn-sm" onClick={onCancelEdit}>✕</button>
      </div>
    );
  }

  return (
    <div className="rule-row" style={targetMissing ? { background: 'rgba(239, 68, 68, 0.05)' } : undefined}>
      <span className="rule-idx">{rule.index + 1}</span>
      <span className="rule-type-badge">{rule.type}</span>
      <span className="rule-payload">{rule.payload}</span>
      <span className="rule-target">
        <span className={`badge ${targetMissing ? 'badge-danger' : 'badge-info'}`}
              title={targetMissing ? '⚠️ Группа/прокси не найдены в текущей конфигурации' : ''}>
          {targetMissing && '⚠️ '}{rule.target}
        </span>
        {rule.params.map((p, i) => <span key={i} className="badge badge-warning" style={{ marginLeft: 4 }}>{p}</span>)}
      </span>
      <button className="btn btn-sm btn-icon" onClick={onMoveUp} title="Вверх">↑</button>
      <button className="btn btn-sm btn-icon" onClick={onMoveDown} title="Вниз">↓</button>
      <button className="btn btn-sm btn-icon" onClick={onStartEdit} title="Редактировать">✏️</button>
      <button className="btn btn-sm btn-icon btn-danger" onClick={onDelete} title="Удалить">🗑</button>
    </div>
  );
}

// =========================================================
// AWG MULTI-TUNNEL
// =========================================================
// ──────────────────────────────────────────────────────────────────
// Установка AWG/TrustTunnel — общий компонент-визард (v2.203)
// ──────────────────────────────────────────────────────────────────
function InstallPrompt({ kind, title, description, onInstalled }) {
  // kind = 'awg' | 'trusttunnel'
  const [phase, setPhase] = useState('idle'); // idle | running | done | failed
  const [logs, setLogs] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [proxyOffered, setProxyOffered] = useState(false);
  const [proxyMode, setProxyMode] = useState(false);
  const logsRef = useRef(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const start = async (useProxy = false) => {
    setPhase('running');
    setLogs([]);
    setProxyMode(useProxy);
    try {
      const r = await api.post(`/api/${kind}/install`, { use_mihomo_proxy: useProxy });
      setJobId(r.job_id);
    } catch (e) {
      setPhase('failed');
      setLogs(['Ошибка запуска: ' + e.message]);
    }
  };

  // Polling логов
  useEffect(() => {
    if (!jobId || phase !== 'running') return;
    const iv = setInterval(async () => {
      try {
        const r = await api.get(`/api/install/jobs/${jobId}`);
        setLogs(r.logs || []);
        if (r.status === 'done') {
          setPhase('done');
          clearInterval(iv);
          // через секунду проверим что status стал installed
          setTimeout(async () => {
            try {
              const s = await api.get(`/api/${kind}/install/status`);
              if (s.installed) {
                onInstalled && onInstalled();
              }
            } catch (e) {}
          }, 1500);
        } else if (r.status === 'failed') {
          setPhase('failed');
          clearInterval(iv);
          // если ещё не пробовали proxy — предложить
          if (!proxyMode) setProxyOffered(true);
        }
      } catch (e) {}
    }, 1200);
    return () => clearInterval(iv);
  }, [jobId, phase, proxyMode]);

  return (
    <div className="card" style={{ padding: 20, maxWidth: 720, margin: '20px auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h2>
      <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 13 }}>
        {description}
      </div>

      {phase === 'idle' && (
        <div>
          <button className="btn btn-primary" onClick={() => start(false)}>
            Установить
          </button>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
            Если установка не удастся — будет предложено повторить через системный прокси Mihomo
            (полезно если внешние репозитории заблокированы).
          </div>
        </div>
      )}

      {(phase === 'running' || phase === 'done' || phase === 'failed') && (
        <div>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {phase === 'running' && <><div className="spinner" style={{ width: 14, height: 14 }} /> <span>Идёт установка…</span></>}
            {phase === 'done' && <span style={{ color: 'var(--success, #22c55e)' }}>✓ Установка успешно завершена</span>}
            {phase === 'failed' && <span style={{ color: 'var(--danger, #ef4444)' }}>✗ Установка завершилась с ошибкой</span>}
            {proxyMode && (
              <span className="badge" style={{ marginLeft: 8, fontSize: 10 }}>через Mihomo proxy</span>
            )}
          </div>
          <pre
            ref={logsRef}
            style={{
              background: 'var(--bg-3, #1f1f24)',
              border: '1px solid var(--border, #2a2a30)',
              borderRadius: 6,
              padding: 12,
              fontSize: 12,
              fontFamily: 'var(--mono, monospace)',
              maxHeight: 360,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              color: 'var(--text-2)',
            }}>
            {logs.length > 0 ? logs.join('\n') : '...'}
          </pre>

          {phase === 'failed' && proxyOffered && (
            <div style={{
              marginTop: 14, padding: 12,
              border: '1px solid var(--warning, #eab308)',
              borderRadius: 6,
              background: 'rgba(234, 179, 8, 0.07)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Возможная причина — блокировка репозитория
              </div>
              <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-2)' }}>
                Установка может не пройти из-за блокировок (например PPA Amnezia в РФ).
                Mihomo может работать как системный прокси и пропустить установочные запросы
                через VPN-канал.
              </div>
              <div style={{ fontSize: 12, marginBottom: 12, color: 'var(--text-3)' }}>
                Условие: в Mihomo выбран VPN-канал в группе «🌐 Основной трафик» (не DIRECT),
                и этот канал реально работает.
              </div>
              <button className="btn btn-primary" onClick={() => start(true)}>
                Попробовать через Mihomo proxy
              </button>
              <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => start(false)}>
                Повторить без прокси
              </button>
            </div>
          )}

          {phase === 'failed' && !proxyOffered && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => start(false)}>
                Попробовать снова
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => onInstalled && onInstalled()}>
                Продолжить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Хук для проверки установлен ли сервис (AWG/TT)
function useInstallStatus(kind) {
  const [status, setStatus] = useState({ loading: true, installed: false, version: null });
  const check = async () => {
    try {
      const r = await api.get(`/api/${kind}/install/status`);
      setStatus({ loading: false, installed: !!r.installed, version: r.version });
    } catch (e) {
      setStatus({ loading: false, installed: false, version: null });
    }
  };
  useEffect(() => { check(); }, []);
  return [status, check];
}

function AWGTunnels() {
  const [installStatus, recheckInstall] = useInstallStatus('awg');
  const [list, setList] = useState([]);
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [registering, setRegistering] = useState(null);

  const load = async () => {
    if (!installStatus.installed) { setLoading(false); return; }
    try {
      const [tunnels, orph] = await Promise.all([
        api.get('/api/awg/tunnels'),
        api.get('/api/awg/orphan-proxies').catch(() => ({ orphans: [] })),
      ]);
      setList(tunnels);
      setOrphans(orph.orphans || []);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!installStatus.loading) {
      load();
      if (installStatus.installed) {
        const i = setInterval(load, 5000);
        return () => clearInterval(i);
      }
    }
  }, [installStatus.installed, installStatus.loading]);

  if (installStatus.loading) return <div className="loading"><div className="spinner"></div></div>;

  if (!installStatus.installed) {
    return (
      <InstallPrompt
        kind="awg"
        title="AmneziaWG не установлен"
        description="AmneziaWG (AWG) — это форк WireGuard с обфускацией, обходящий DPI-блокировки. После установки появится возможность создавать и управлять AWG-туннелями."
        onInstalled={recheckInstall}
      />
    );
  }

  const action = async (name, a) => {
    try {
      await api.post(`/api/awg/tunnels/${name}/action`, { service: name, action: a });
      showToast(`${name}: ${a}`, 'success');
      setTimeout(load, 500);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const del = async (name) => {
    if (!confirm(`Удалить туннель "${name}"?\nЕсли он добавлен в Mihomo как direct прокси через interface — прокси тоже удалится.`)) return;
    try {
      await api.del(`/api/awg/tunnels/${name}`);
      showToast('Удалён', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const cleanupOrphans = async () => {
    if (!orphans.length) return;
    const names = orphans.map(o => o.name).join(', ');
    if (!confirm(`Удалить из Mihomo orphan-прокси (${orphans.length}): ${names}?\n\n` +
                 `Они ссылаются на удалённые AWG-интерфейсы и не работают.\n` +
                 `Также будут удалены ссылки на них во всех proxy-groups.\n` +
                 `Если группа станет пустой — в неё добавится DIRECT.`)) return;
    try {
      const r = await api.post('/api/awg/orphan-proxies/cleanup', {});
      showToast(`Удалено ${r.removed?.length || 0} orphan-прокси`, 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const emergencyStopAll = async () => {
    if (!confirm(
      'АВАРИЙНАЯ ОСТАНОВКА всех AWG туннелей?\n\n' +
      'Используйте если AWG туннель сломал маршрутизацию и SSH/доступ к VM был потерян.\n\n' +
      '• Все awg-quick@* будут остановлены\n' +
      '• Все интерфейсы awg* будут удалены через ip link delete\n' +
      '• Маршруты в default routing table будут очищены\n\n' +
      'Конфиги и автозагрузка НЕ удаляются — туннели можно запустить заново позже.'
    )) return;
    try {
      const r = await api.post('/api/awg/emergency-stop-all', {});
      showToast(r.message || 'Все AWG туннели остановлены', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (editing) return <AWGEdit name={editing} onBack={() => { setEditing(null); load(); }} />;
  if (creating) return <AWGCreate onBack={() => { setCreating(false); load(); }} />;

  return (
    <div>
      {/* Warning баннер если есть orphan AWG-прокси в Mihomo */}
      {orphans.length > 0 && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(245, 158, 11, .08)',
          border: '1px solid rgba(245, 158, 11, .3)',
          borderLeft: '3px solid var(--warning)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text)',
          marginBottom: 14,
          lineHeight: 1.6
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong><Icon name="shield" size={12} /> Orphan AWG-прокси в Mihomo: {orphans.length}</strong>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                Прокси ссылаются на удалённые интерфейсы: {orphans.map(o => `"${o.name}" → ${o.interface}`).join(', ')}.
                Они не работают и засоряют конфиг.
              </div>
            </div>
            <button className="btn btn-sm btn-warning" onClick={cleanupOrphans}>
              <Icon name="trash" size={12} /> Очистить ({orphans.length})
            </button>
          </div>
        </div>
      )}

      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-3)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--success)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-2)',
        marginBottom: 14,
        lineHeight: 1.6
      }}>
        <Icon name="zap" size={12} /> AWG туннель работает на уровне ОС. <strong style={{ color: 'var(--text)' }}>Чтобы Mihomo направлял
        трафик через него</strong>, добавьте прокси в <code>proxies:</code> с <code>type: direct</code> и
        <code>interface: имя</code> — это и сделает кнопка <strong>"+ В Mihomo"</strong> на карточке.
      </div>
      <div className="flex-between mb-16">
        <span className="text-muted">AWG туннелей: {list.length}</span>
        <div className="btn-group">
          {list.some(t => t.active) && (
            <button className="btn btn-sm btn-danger" onClick={emergencyStopAll}
                    title="Аварийно выключить все туннели если потеряли доступ к VM">
              <Icon name="shield" size={11} /> Аварийная остановка
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Новый туннель</button>
        </div>
      </div>

      {list.length === 0 && <div className="empty-state"><Icon name="shield" size={32} className="muted-icon" />Нет AWG туннелей</div>}

      {list.map(t => (
        <div key={t.name} className="card">
          <div className="flex-between mb-16">
            <div>
              <strong style={{ fontSize: 15 }}>
                <span className={`status-dot ${t.connected ? 'green' : 'red'}`}></span>
                {t.name}
              </strong>
              {t.active && <span className="badge badge-success" style={{ marginLeft: 8 }}>active</span>}
              {t.enabled && <span className="badge badge-info" style={{ marginLeft: 4 }}>auto</span>}
              {t.orphan && <span className="badge badge-warning" style={{ marginLeft: 4 }}
                                  title="В Mihomo есть прокси с этим interface, но .conf файл не найден в /etc/amnezia/amneziawg/">
                    ⚠ orphan
                  </span>}
              {t.in_mihomo
                ? <span className="badge badge-success" style={{ marginLeft: 4 }}
                        title="Зарегистрирован как direct-прокси через interface в Mihomo">
                    ✓ в Mihomo
                  </span>
                : <span className="badge badge-warning" style={{ marginLeft: 4 }}
                        title="Не добавлен в Mihomo proxies">
                    ⚠ нет в Mihomo
                  </span>}
            </div>
            <div className="btn-group">
              {!t.in_mihomo && !t.orphan && (
                <button className="btn btn-sm btn-primary"
                        onClick={() => setRegistering({ name: t.name })}>
                  ➕ В Mihomo
                </button>
              )}
              <button className="btn btn-sm btn-success" disabled={t.active}
                      onClick={() => action(t.name, 'start')}><Icon name="play" size={12} /></button>
              <button className="btn btn-sm" onClick={() => action(t.name, 'restart')}>↻</button>
              <button className="btn btn-sm btn-danger" disabled={!t.active}
                      onClick={() => action(t.name, 'stop')}><Icon name="stop" size={12} /></button>
              {!t.orphan && <button className="btn btn-sm" onClick={() => setEditing(t.name)}>✏️</button>}
              {!t.orphan && <button className="btn btn-sm btn-danger" onClick={() => del(t.name)}>🗑</button>}
            </div>
          </div>
          <div className="row"><span className="row-label">Endpoint</span>
            <span className="text-mono" style={{ fontSize: 11 }}>{t.endpoint || '—'}</span></div>
          <div className="row"><span className="row-label">Handshake</span>
            <span style={{ fontSize: 11 }}>{t.handshake || '—'}</span></div>
          <div className="row"><span className="row-label">Трафик</span>
            <span style={{ fontSize: 11 }}>{t.transfer || '—'}</span></div>
        </div>
      ))}

      {registering && <AWGRegisterModal
        name={registering.name}
        onClose={() => setRegistering(null)}
        onSaved={() => { setRegistering(null); load(); }} />}
    </div>
  );
}

function AWGRegisterModal({ name, onClose, onSaved }) {
  const defaultName = `${name.toUpperCase()} (AWG)`;
  const [proxyName, setProxyName] = useState(defaultName);
  const [routingMark, setRoutingMark] = useState(51820);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    api.get('/api/mihomo/proxy-groups').then(setGroups).catch(() => {});
  }, []);

  const toggle = (g) => setSelected(s => s.includes(g) ? s.filter(x => x !== g) : [...s, g]);

  const submit = async () => {
    try {
      await api.post(`/api/awg/tunnels/${name}/register-in-mihomo`, {
        proxy_name: proxyName,
        routing_mark: parseInt(routingMark) || 51820,
        add_to_groups: selected
      });
      showToast(`✓ ${proxyName} добавлен в Mihomo`, 'success');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 540 }}>
        <div className="modal-title">➕ Добавить AWG "{name}" в Mihomo</div>

        <div className="form-group">
          <label className="form-label">Имя прокси в Mihomo</label>
          <input className="form-input" value={proxyName}
                 onChange={e => setProxyName(e.target.value)} />
        </div>

        <div style={{ fontSize: 11, background: 'var(--bg)', padding: 10,
                       borderRadius: 6, border: '1px solid var(--border)',
                       fontFamily: 'var(--mono)', lineHeight: 1.6, marginBottom: 14 }}>
          <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>Будет добавлено в config.yaml:</div>
          <div>- name: <span style={{ color: 'var(--accent)' }}>{proxyName}</span></div>
          <div>&nbsp;&nbsp;type: <span style={{ color: 'var(--success)' }}>direct</span></div>
          <div>&nbsp;&nbsp;interface: <span style={{ color: 'var(--warning)' }}>{name}</span></div>
          <div>&nbsp;&nbsp;routing-mark: <span style={{ color: 'var(--purple)' }}>{routingMark || 51820}</span></div>
        </div>

        <div className="form-group">
          <label className="form-label">
            routing-mark (обычно 51820 — порт WG)
          </label>
          <input className="form-input" type="number" value={routingMark}
                 onChange={e => setRoutingMark(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">
            Добавить в группы ({selected.length} выбрано)
          </label>
          {groups.length === 0
            ? <div className="text-muted" style={{ fontSize: 11 }}>Нет групп в конфиге</div>
            : <div style={{ maxHeight: 220, overflowY: 'auto',
                             border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                {groups.map(g => (
                  <label key={g.name} style={{ display: 'flex', gap: 8, padding: 5,
                                                cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={selected.includes(g.name)}
                           onChange={() => toggle(g.name)} />
                    <span>{g.name}</span>
                    <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{g.type}</span>
                  </label>
                ))}
              </div>}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={!proxyName}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

function AWGEdit({ name, onBack }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/awg/tunnels/${name}`).then(d => setContent(d.content))
      .catch(e => showToast(e.message, 'error'));
  }, [name]);

  const save = async () => {
    if (!confirm(`Сохранить и перезапустить ${name}?`)) return;
    setSaving(true);
    try {
      await api.put(`/api/awg/tunnels/${name}`, { content });
      showToast('✓ Сохранено', 'success');
      onBack();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <button className="btn btn-sm" onClick={onBack}>← Назад</button>
          <strong style={{ marginLeft: 12 }}>✏️ {name}.conf</strong>
        </div>
        <button className="btn btn-success" onClick={save} disabled={saving}>
          {saving ? '...' : <><Icon name="check" size={12} /> Сохранить</>}
        </button>
      </div>
      <textarea className="form-textarea" style={{ height: 'calc(100vh - 260px)' }}
                value={content} onChange={e => setContent(e.target.value)} spellCheck="false" />
    </div>
  );
}

// блок с готовым snippet для вставки в [Interface] секцию.
// Подменяет awg0 на имя текущего интерфейса. Кнопка копирования.
function AWGRequiredSnippet({ ifaceName }) {
  const [copied, setCopied] = useState(false);
  const name = ifaceName || 'awg0';
  const snippet = `Table = off
MTU = 1100
PostUp = ip route add default dev ${name} table 51820 || true
PostUp = ip rule add fwmark 0xca6c lookup 51820 || true
PostDown = ip rule del fwmark 0xca6c lookup 51820 2>/dev/null || true
PostDown = ip route del default dev ${name} table 51820 2>/dev/null || true`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // fallback для не-HTTPS
      const ta = document.createElement('textarea');
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); }
      catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div style={{
      marginBottom: 14, padding: 14, borderRadius: 8,
      background: 'rgba(239,68,68,.07)',
      border: '1px solid rgba(239,68,68,.4)',
      borderLeft: '3px solid #ef4444',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em',
                           color: '#ef4444', textTransform: 'uppercase',
                           border: '1px solid rgba(239,68,68,.4)', borderRadius: 4,
                           padding: '1px 6px' }}>⚠ ОБЯЗАТЕЛЬНО</span>
            <strong style={{ fontSize: 13 }}>Строки для секции <code>[Interface]</code></strong>
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Эти строки нужно добавить в <code>[Interface]</code> туннеля (после <code>Address</code>, <code>DNS</code>, обфускации Jc/S/H).
            Они обеспечивают что трафик через AWG идёт <strong>только когда Mihomo его туда направил</strong> (по fwmark),
            а SSH/системный трафик не пропадёт.
            {!ifaceName && (
              <div style={{ marginTop: 4, color: 'var(--warning)' }}>
                ⚠ Сначала укажи «Имя» туннеля выше — тогда подстановка обновится автоматически.
              </div>
            )}
          </div>
        </div>
        <button className={`btn btn-sm ${copied ? 'btn-success' : 'btn-primary'}`}
                onClick={copy} style={{ whiteSpace: 'nowrap' }}>
          {copied ? '✓ Скопировано' : '📋 Копировать'}
        </button>
      </div>
      <div style={{
        marginTop: 10, borderRadius: 6, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--bg)',
      }}>
        {snippet.split('\n').map((ln, i, arr) => (
          <div key={i} style={{ display: 'flex', minWidth: 'max-content' }}>
            <span style={{
              flexShrink: 0, width: `${String(arr.length).length + 2}ch`, textAlign: 'right',
              paddingRight: 10, paddingLeft: 10, paddingTop: i === 0 ? 8 : 0,
              paddingBottom: i === arr.length - 1 ? 8 : 0,
              color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11.5,
              userSelect: 'none', lineHeight: 1.7,
              borderRight: '1px solid var(--border)', marginRight: 10,
            }}>{i + 1}</span>
            <code style={{
              flex: 1, paddingRight: 12, whiteSpace: 'pre',
              paddingTop: i === 0 ? 8 : 0, paddingBottom: i === arr.length - 1 ? 8 : 0,
              color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7,
            }}>{ln || ' '}</code>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
        💡 <code>{name}</code> подставляется автоматически из поля «Имя» выше. Готовый шаблон в окне ниже
        уже содержит <code>Table = off</code> — добавь только <code>PostUp</code>/<code>PostDown</code> и
        измени <code>MTU</code> на 1100 если у тебя не указан.
      </div>
    </div>
  );
}

function AWGCreate({ onBack }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState(`[Interface]
PrivateKey = 
Address = 10.0.0.2/32
DNS = 1.1.1.1
MTU = 1280

# БЕЗОПАСНО: Table = off — не трогаем системный routing.
# Mihomo сам направит трафик через routing-mark.
# Если убрать эту строку, AWG поставит default-route — VM станет недоступна.
Table = off

# Обфускация AmneziaWG
Jc = 4
Jmin = 40
Jmax = 70
S1 = 50
S2 = 100
H1 = 1234567890
H2 = 2345678901
H3 = 3456789012
H4 = 4567890123

[Peer]
PublicKey = 
PresharedKey = 
AllowedIPs = 0.0.0.0/0
Endpoint = 
PersistentKeepalive = 25
`);
  // Добавление в Mihomo
  const [addToMihomo, setAddToMihomo] = useState(true);
  const [mihomoName, setMihomoName] = useState('');
  const [routingMark, setRoutingMark] = useState(51820);
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);

  useEffect(() => {
    api.get('/api/mihomo/proxy-groups').then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    // Автоматически подставить имя прокси в Mihomo
    if (name && !mihomoName) setMihomoName(`${name.toUpperCase()} (AWG)`);
  }, [name]);

  const toggleGroup = (g) =>
    setSelectedGroups(s => s.includes(g) ? s.filter(x => x !== g) : [...s, g]);

  const create = async () => {
    if (!name.match(/^[a-z0-9]+$/)) {
      showToast('Имя: только латиница и цифры, lowercase', 'warning');
      return;
    }
    try {
      const body = {
        name, content,
        add_to_mihomo: addToMihomo,
        mihomo_proxy_name: mihomoName || undefined,
        mihomo_groups: selectedGroups,
        routing_mark: parseInt(routingMark) || 51820
      };
      const r = await api.post('/api/awg/tunnels', body);
      if (r.mihomo?.added) {
        showToast(`✓ Создан и добавлен в Mihomo${selectedGroups.length ? ` (в ${selectedGroups.length} групп)` : ''}`, 'success');
      } else if (r.mihomo && !r.mihomo.added) {
        showToast(`Туннель создан, но Mihomo: ${r.mihomo.error}`, 'warning');
      } else {
        showToast('✓ Туннель создан и запущен', 'success');
      }
      onBack();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <button className="btn btn-sm" onClick={onBack}>← Назад</button>
          <strong style={{ marginLeft: 12 }}>+ Новый AWG туннель</strong>
        </div>
        <button className="btn btn-primary" onClick={create} disabled={!name}>Создать</button>
      </div>

      <Collapsible title="Связь с этой VM может пропасть — как не потерять SSH" important>
        Если в конфиге <code>AllowedIPs = 0.0.0.0/0</code> и <code>Table</code> не указан как <code>off</code> —
        AWG установит default-route, и весь исходящий трафик (включая ваш SSH) уйдёт через туннель.
        Если туннель недоступен — VM станет недоступной.
        <br /><br />
        <strong style={{ color: 'var(--text)' }}>Безопасные варианты:</strong>
        <ul style={{ marginTop: 4, paddingLeft: 18 }}>
          <li>Добавьте в <code>[Interface]</code>: <code>Table = off</code> — Mihomo сам направит трафик через
            <code>routing-mark</code>, маршруты ОС не трогаются.</li>
          <li>Или сузьте <code>AllowedIPs</code> до конкретных подсетей VPN-сервиса (не <code>0.0.0.0/0</code>).</li>
        </ul>
      </Collapsible>

      <Field label="Имя туннеля" required
             hint="Только латиница и цифры в нижнем регистре. Станет именем сервиса awg-quick@имя и интерфейса.">
        <input className="form-input" value={name}
               onChange={e => setName(e.target.value.toLowerCase())}
               placeholder="awg1" />
      </Field>

      {/* готовый snippet который нужно вставить в [Interface] */}
      <AWGRequiredSnippet ifaceName={name || 'awg0'} />

      <Field label="Содержимое .conf" required
             hint="Вставьте полный конфиг AmneziaWG. Не забудьте добавить строки из подсказки выше в секцию [Interface].">
        <textarea className="form-textarea" style={{ height: 280 }}
                  value={content} onChange={e => setContent(e.target.value)} spellCheck="false" />
      </Field>

      {/* Mihomo интеграция */}
      <div className="card" style={{
        background: 'rgba(91,140,255,.05)',
        borderColor: 'var(--accent)',
        marginTop: 14
      }}>
        <div className="form-group" style={{ marginBottom: addToMihomo ? 14 : 0 }}>
          <label style={{ display: 'flex', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={addToMihomo}
                   onChange={e => setAddToMihomo(e.target.checked)} />
            <div>
              <strong>➕ Добавить в Mihomo как direct-прокси через интерфейс</strong>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                Создаст прокси с <code>type: direct</code>, <code>interface: {name || '...'}</code>,
                <code>routing-mark: 51820</code>. Трафик пойдёт через системный AWG туннель.
              </div>
            </div>
          </label>
        </div>

        {addToMihomo && (
          <>
            <Collapsible title="Что будет добавлено в proxies (YAML)">
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10,
                             border: '1px solid var(--border)', padding: 8, borderRadius: 4, marginTop: 4 }}>
                - name: {mihomoName || '...'}<br/>
                &nbsp;&nbsp;type: direct<br/>
                &nbsp;&nbsp;interface: {name || 'имя_туннеля'}<br/>
                &nbsp;&nbsp;routing-mark: {routingMark || 51820}
              </div>
            </Collapsible>

            <Field label="Имя прокси в Mihomo" required
                   hint="Под этим именем туннель появится в списке прокси Mihomo.">
              <input className="form-input" value={mihomoName}
                     onChange={e => setMihomoName(e.target.value)}
                     placeholder="AWG1 (AWG)" />
            </Field>

            <Field label="routing-mark"
                   hint="Метка пакетов для policy-routing. Обычно 51820 — менять не нужно.">
              <input className="form-input" type="number" value={routingMark}
                     onChange={e => setRoutingMark(e.target.value)} />
            </Field>

            <Field label={`Добавить в группы (${selectedGroups.length} выбрано)`}
                   hint="Выберите proxy-groups в которые добавить этот канал. Можно оставить пустым."
                   style={{ marginBottom: 0 }}>
              {groups.length === 0
                ? <div className="text-muted" style={{ fontSize: 11 }}>
                    Нет proxy-groups в конфиге. Создайте группу на странице "Правила".
                  </div>
                : <div style={{ maxHeight: 180, overflowY: 'auto',
                                 border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                    {groups.map(g => (
                      <label key={g.name} style={{ display: 'flex', gap: 8, padding: 5,
                                                    cursor: 'pointer', fontSize: 12 }}>
                        <input type="checkbox" checked={selectedGroups.includes(g.name)}
                               onChange={() => toggleGroup(g.name)} />
                        <span>{g.name}</span>
                        <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{g.type}</span>
                      </label>
                    ))}
                  </div>}
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

// =========================================================
// TRUSTTUNNEL
// =========================================================
function TrustTunnels() {
  const [installStatus, recheckInstall] = useInstallStatus('trusttunnel');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [registering, setRegistering] = useState(null); // { name, suggestedPort }

  const load = async () => {
    if (!installStatus.installed) { setLoading(false); return; }
    try { setList(await api.get('/api/trusttunnel/list')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!installStatus.loading) {
      load();
      if (installStatus.installed) {
        const i = setInterval(load, 5000);
        return () => clearInterval(i);
      }
    }
  }, [installStatus.installed, installStatus.loading]);

  if (installStatus.loading) return <div className="loading"><div className="spinner"></div></div>;

  if (!installStatus.installed) {
    return (
      <InstallPrompt
        kind="trusttunnel"
        title="TrustTunnel не установлен"
        description="TrustTunnel — клиент для подключения к VPN-серверам с поддержкой SOCKS5. После установки можно будет добавлять каналы и регистрировать их в Mihomo как прокси."
        onInstalled={recheckInstall}
      />
    );
  }

  const del = async (name) => {
    if (!confirm(`Удалить ${name}? Также удалится соответствующий прокси из Mihomo.`)) return;
    await api.del(`/api/trusttunnel/${name}`);
    showToast('Удалён', 'success');
    load();
  };

  const action = async (name, a) => {
    try {
      await api.post(`/api/trusttunnel/${name}/action`, { action: a });
      showToast(`${name}: ${a}`, 'success');
      setTimeout(load, 500);
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (editing) return <TTEdit name={editing} onBack={() => { setEditing(null); load(); }} />;
  if (creating) return <TTCreate onBack={() => { setCreating(false); load(); }} />;

  return (
    <div>
      <div className="flex-between mb-16">
        <span className="text-muted">TrustTunnel серверов: {list.length}</span>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Новый</button>
      </div>
      {list.length === 0 && <div className="empty-state"><Icon name="shield" size={32} className="muted-icon" />Нет серверов</div>}
      {list.map(c => (
        <div key={c.name} className="service-item">
          <div className="service-name">
            <span className={`status-dot ${c.active ? 'green' : 'red'}`}></span>
            <strong>{c.name}</strong>
            {c.local_port && <span className="badge badge-info">:{c.local_port}</span>}
            {c.in_mihomo
              ? <span className="badge badge-success" title="Зарегистрирован как SOCKS5 прокси в Mihomo">
                  ✓ в Mihomo
                </span>
              : <span className="badge badge-warning" title="Не добавлен в Mihomo proxies">
                  ⚠ нет в Mihomo
                </span>}
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{c.file}</span>
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-success" disabled={c.active}
                    onClick={() => action(c.name, 'start')}
                    title="Запустить"><Icon name="play" size={12} /></button>
            <button className="btn btn-sm" onClick={() => action(c.name, 'restart')}
                    title="Перезапустить">↻</button>
            <button className="btn btn-sm btn-danger" disabled={!c.active}
                    onClick={() => action(c.name, 'stop')}
                    title="Остановить"><Icon name="stop" size={12} /></button>
            {!c.in_mihomo && c.local_port && (
              <button className="btn btn-sm btn-primary"
                      onClick={() => setRegistering({ name: c.name, port: c.local_port })}>
                ➕ В Mihomo
              </button>
            )}
            <button className="btn btn-sm" onClick={() => setEditing(c.name)} title="Редактировать">✏️</button>
            <button className="btn btn-sm btn-danger" onClick={() => del(c.name)} title="Удалить">🗑</button>
          </div>
        </div>
      ))}

      {registering && <TTRegisterModal
        name={registering.name}
        port={registering.port}
        onClose={() => setRegistering(null)}
        onSaved={() => { setRegistering(null); load(); }} />}
    </div>
  );
}

function TTRegisterModal({ name, port, onClose, onSaved }) {
  const defaultName = `🔐 ${name[0].toUpperCase() + name.slice(1)} (SOCKS5)`;
  const [proxyName, setProxyName] = useState(defaultName);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    api.get('/api/mihomo/proxy-groups').then(setGroups).catch(() => {});
  }, []);

  const toggle = (g) => setSelected(s => s.includes(g) ? s.filter(x => x !== g) : [...s, g]);

  const submit = async () => {
    try {
      await api.post(`/api/trusttunnel/${name}/register-in-mihomo`, {
        proxy_name: proxyName,
        add_to_groups: selected
      });
      showToast(`✓ ${proxyName} добавлен в Mihomo`, 'success');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 520 }}>
        <div className="modal-title">➕ Добавить {name} в Mihomo</div>

        <div className="form-group">
          <label className="form-label">Имя прокси</label>
          <input className="form-input" value={proxyName}
                 onChange={e => setProxyName(e.target.value)} />
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            socks5 · 127.0.0.1:{port} · udp: true
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            Включить в группы ({selected.length} выбрано)
          </label>
          {groups.length === 0
            ? <div className="text-muted" style={{ fontSize: 11 }}>Нет групп в конфиге</div>
            : <div style={{ maxHeight: 240, overflowY: 'auto',
                             border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                {groups.map(g => (
                  <label key={g.name} style={{ display: 'flex', gap: 8, padding: 5,
                                                cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={selected.includes(g.name)}
                           onChange={() => toggle(g.name)} />
                    <span>{g.name}</span>
                    <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{g.type}</span>
                  </label>
                ))}
              </div>}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={!proxyName}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

function TTEdit({ name, onBack }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/trusttunnel/${name}`).then(d => setContent(d.content))
      .catch(e => showToast(e.message, 'error'));
  }, [name]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/trusttunnel/${name}`, { content });
      showToast('✓ Сохранено', 'success');
      onBack();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex-between mb-16">
        <div><button className="btn btn-sm" onClick={onBack}>← Назад</button>
          <strong style={{ marginLeft: 12 }}>✏️ {name}</strong></div>
        <button className="btn btn-success" onClick={save} disabled={saving}><Icon name="check" size={12} /> Сохранить</button>
      </div>
      <textarea className="form-textarea" style={{ height: 'calc(100vh - 260px)' }}
                value={content} onChange={e => setContent(e.target.value)} spellCheck="false" />
    </div>
  );
}

function TTCreate({ onBack }) {
  const [mode, setMode] = useState('form'); // 'form' | 'toml'
  const [form, setForm] = useState({
    name: '', hostname: 'xx.eof.observer', address: '',
    username: '', password: '', local_port: 10007,
    toml_content: '',
    add_to_mihomo: true,
    mihomo_proxy_name: '',
    add_to_groups: []
  });
  const [groups, setGroups] = useState([]);
  const [existingNames, setExistingNames] = useState([]);
  const [saving, setSaving] = useState(false);
  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), disabled: saving });

  useEffect(() => {
    api.get('/api/mihomo/proxy-groups').then(setGroups).catch(() => {});
    api.get('/api/trusttunnel/list').then(list => setExistingNames(list.map(t => t.name))).catch(() => {});
  }, []);

  // Валидация имени
  const nameValid = /^[A-Za-z0-9_-]+$/.test(form.name);
  const nameTaken = form.name && existingNames.includes(form.name);
  const nameError = !form.name ? null
    : !nameValid ? 'Только латинские буквы, цифры, _ и -'
    : nameTaken ? `Имя занято — уже есть TrustTunnel "${form.name}"`
    : null;

  // Авто-извлечение порта из TOML для preview
  const tomlPort = (() => {
    if (mode !== 'toml' || !form.toml_content) return null;
    const m = form.toml_content.match(/address\s*=\s*"127\.0\.0\.1:(\d+)"/);
    return m ? parseInt(m[1]) : null;
  })();

  // Автогенерация имени прокси на основе name
  const suggestedProxyName = form.name
    ? `🔐 ${form.name[0].toUpperCase() + form.name.slice(1)} (SOCKS5)`
    : '';

  const toggleGroup = (g) => setForm(p => ({
    ...p,
    add_to_groups: p.add_to_groups.includes(g)
      ? p.add_to_groups.filter(x => x !== g)
      : [...p.add_to_groups, g]
  }));

  const create = async () => {
    try {
      setSaving(true);
      const payload = {
        name: form.name,
        mihomo_proxy_name: form.mihomo_proxy_name || suggestedProxyName,
        add_to_mihomo: form.add_to_mihomo,
        add_to_groups: form.add_to_mihomo ? form.add_to_groups : null,
      };
      if (mode === 'toml') {
        payload.toml_content = form.toml_content;
      } else {
        payload.hostname = form.hostname;
        payload.address = form.address;
        payload.username = form.username;
        payload.password = form.password;
        payload.local_port = parseInt(form.local_port);
      }
      const r = await api.post('/api/trusttunnel', payload);
      if (r.mihomo?.added) {
        showToast(`✓ Создан и добавлен в Mihomo${r.mihomo.added_to_groups?.length ? ` (${r.mihomo.added_to_groups.length} групп)` : ''}`, 'success');
      } else if (r.mihomo?.error) {
        showToast(`✓ Создан, но не добавлен в Mihomo: ${r.mihomo.error}`, 'warning');
      } else {
        showToast('✓ Создан', 'success');
      }
      onBack();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Шаблон TOML для подсказки
  const tomlTemplate = `loglevel = "info"
vpn_mode = "selective"

[endpoint]
hostname = "xx.eof.observer"
addresses = ["1.2.3.4:443"]
username = "your_username"
password = "your_password"
skip_verification = true
upstream_protocol = "http2"

[listener]
[listener.socks]
address = "127.0.0.1:10007"`;

  // Можно ли создавать
  const canCreate = !saving && form.name && !nameError && (
    mode === 'toml'
      ? form.toml_content.trim().length > 0
      : (form.address && form.username)
  );

  return (
    <div>
      <div className="flex-between mb-16">
        <div><button className="btn btn-sm" onClick={onBack}>← Назад</button>
          <strong style={{ marginLeft: 12 }}>+ Новый TrustTunnel сервер</strong></div>
      </div>

      <div className="card">
        <div className="card-title"><Icon name="route" size={14} /> TrustTunnel endpoint</div>

        <div className="form-group">
          <label className="form-label">Имя (латиница, цифры, _ и -)</label>
          <input className={`form-input ${nameError ? 'input-error' : ''}`}
                 {...f('name')} placeholder="turkey" />
          {nameError ? (
            <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>
              ⚠️ {nameError}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              Файл <code>{form.name || 'NAME'}_socks.toml</code> · сервис <code>trusttunnel-{form.name || 'NAME'}.service</code>
            </div>
          )}
        </div>

        {/* Tabs: По полям / TOML конфиг */}
        <div className="form-group">
          <div className="tt-mode-tabs">
            <button type="button"
                    className={`tt-mode-tab ${mode === 'form' ? 'active' : ''}`}
                    onClick={() => setMode('form')} disabled={saving}>
              📋 По полям
            </button>
            <button type="button"
                    className={`tt-mode-tab ${mode === 'toml' ? 'active' : ''}`}
                    onClick={() => setMode('toml')} disabled={saving}>
              📄 TOML-конфиг
            </button>
          </div>
        </div>

        {mode === 'form' ? (
          <>
            <div className="form-group">
              <label className="form-label">Hostname</label>
              <input className="form-input" {...f('hostname')} />
            </div>
            <div className="form-group">
              <label className="form-label">Address (IP:Port)</label>
              <input className="form-input" {...f('address')} placeholder="1.2.3.4:443" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" {...f('username')} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" {...f('password')} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Local SOCKS5 порт</label>
              <input className="form-input" type="number" {...f('local_port')} />
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="form-label">
              Содержимое TOML-конфига
              {tomlPort && (
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Обнаружен порт: {tomlPort}
                </span>
              )}
            </label>
            <textarea className="form-textarea"
                      style={{ height: 280, fontFamily: 'var(--mono)', fontSize: 12 }}
                      value={form.toml_content}
                      onChange={e => setForm(p => ({ ...p, toml_content: e.target.value }))}
                      placeholder={tomlTemplate}
                      spellCheck="false"
                      disabled={saving} />
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
              Вставьте TOML-конфиг как есть. Backend распарсит и автоматически извлечёт <code>local_port</code> из <code>[listener.socks]</code>.
              Используйте этот режим если у вас уже есть готовый конфиг от провайдера.
              <br />
              <button type="button" className="btn-link"
                      onClick={() => setForm(p => ({ ...p, toml_content: tomlTemplate }))}
                      style={{ marginTop: 4, padding: 0, background: 'none', border: 'none',
                               color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}>
                📝 Вставить шаблон
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><Icon name="link" size={14} /> Интеграция с Mihomo</div>

        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.add_to_mihomo}
                   onChange={e => setForm(p => ({ ...p, add_to_mihomo: e.target.checked }))}
                   disabled={saving} />
            <strong>Автоматически добавить как SOCKS5 прокси в config.yaml</strong>
          </label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, marginLeft: 24 }}>
            Без этого сервер будет работать как systemd сервис,
            но не появится в Mihomo proxy-groups
          </div>
        </div>

        {form.add_to_mihomo && (
          <>
            <div className="form-group">
              <label className="form-label">Имя прокси в Mihomo</label>
              <input className="form-input" value={form.mihomo_proxy_name}
                     onChange={e => setForm(p => ({ ...p, mihomo_proxy_name: e.target.value }))}
                     placeholder={suggestedProxyName || '🔐 Name (SOCKS5)'}
                     disabled={saving} />
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                Оставьте пустым — сгенерируется автоматически
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Включить в группы ({form.add_to_groups.length} выбрано)
              </label>
              {groups.length === 0
                ? <div className="text-muted" style={{ fontSize: 11 }}>Нет групп в конфиге</div>
                : <div style={{ maxHeight: 240, overflowY: 'auto',
                                 border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
                    {groups.map(g => (
                      <label key={g.name} style={{ display: 'flex', gap: 8, padding: 5,
                                                    cursor: 'pointer', fontSize: 12 }}>
                        <input type="checkbox"
                               checked={form.add_to_groups.includes(g.name)}
                               onChange={() => toggleGroup(g.name)}
                               disabled={saving} />
                        <span>{g.name}</span>
                        <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{g.type}</span>
                      </label>
                    ))}
                  </div>}
            </div>
          </>
        )}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={create}
                disabled={!canCreate}>
          {saving ? <><Icon name="refresh" size={12} className="spin" /> Создание и запуск сервиса...</> : 'Создать и запустить'}
        </button>
      </div>
    </div>
  );
}

// =========================================================
// RAW MIHOMO YAML EDITOR
// =========================================================
function MihomoConfigEditor() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/config/mihomo').then(d => { setContent(d.content); setLoading(false); })
      .catch(e => { showToast(e.message, 'error'); setLoading(false); });
  }, []);

  const save = async () => {
    if (!confirm('Сохранить Mihomo конфиг?')) return;
    setSaving(true);
    try {
      await api.put('/api/config/mihomo', { content });
      showToast('✓ Сохранено', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  return (
    <div>
      <div className="flex-between mb-16">
        <span className="text-muted text-mono" style={{ fontSize: 11 }}>
          /opt/mihomo/config/config.yaml
        </span>
        <button className="btn btn-success" onClick={save} disabled={saving}>
          {saving ? '...' : <><Icon name="check" size={12} /> Сохранить</>}
        </button>
      </div>
      <textarea className="form-textarea" style={{ height: 'calc(100vh - 250px)', fontSize: 12 }}
                value={content} onChange={e => setContent(e.target.value)} spellCheck="false" />
    </div>
  );
}

// =========================================================
// SERVICES
// =========================================================
function SystemProxyCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    try {
      const s = await api.get('/api/system-proxy/status');
      setStatus(s);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async () => {
    if (!status) return;
    const goingOn = !status.enabled;
    if (goingOn) {
      if (!confirm(
        'Включить системный прокси?\n\n' +
        'Системные команды (apt, curl, wget, git) будут использовать Mihomo\n' +
        `как HTTP-прокси (127.0.0.1:${status.port}).\n\n` +
        'Это нужно когда часть репозиториев заблокирована (например PPA Amnezia).\n\n' +
        'Локальные адреса (127.0.0.1, localhost) идут напрямую.'
      )) return;
    }
    setToggling(true);
    try {
      const r = await api.post('/api/system-proxy', { enable: goingOn });
      showToast(r.message || (goingOn ? 'Включён' : 'Выключен'), 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setToggling(false); }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/api/system-proxy/test', {});
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally { setTesting(false); }
  };

  if (loading) return null;
  if (!status) return null;

  return (
    <div className="card" style={{
      borderLeft: status.enabled ? '3px solid var(--success)' : '3px solid var(--border)'
    }}>
      <div className="card-title">
        <Icon name="shield" size={14} /> Системный прокси через Mihomo
      </div>
      <div className="card-subtitle">
        Использовать локальный Mihomo как HTTP-прокси для системных команд (apt, curl, wget, git).
        Полезно когда репозитории заблокированы — например при доустановке AmneziaWG (PPA заблокирован в РФ).
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <span className="row-label">Состояние</span>
        <span>
          {status.enabled
            ? <span style={{ color: 'var(--success)', fontWeight: 600 }}><Icon name="check" size={11}/> Включён</span>
            : <span style={{ color: 'var(--text-2)' }}>Выключен</span>}
        </span>
      </div>
      <div className="row">
        <span className="row-label">Прокси-адрес</span>
        <span className="text-mono">{status.proxy_url}</span>
      </div>
      <div className="row">
        <span className="row-label">apt.conf.d</span>
        <span style={{ fontSize: 11 }}>
          {status.apt_enabled
            ? <span style={{ color: 'var(--success)' }}>✓ настроен</span>
            : <span style={{ color: 'var(--text-3)' }}>не настроен</span>}
        </span>
      </div>
      <div className="row">
        <span className="row-label">profile.d (shell env)</span>
        <span style={{ fontSize: 11 }}>
          {status.env_enabled
            ? <span style={{ color: 'var(--success)' }}>✓ настроен</span>
            : <span style={{ color: 'var(--text-3)' }}>не настроен</span>}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button className={`btn ${status.enabled ? 'btn-danger' : 'btn-primary'}`}
                onClick={toggle} disabled={toggling}>
          {toggling
            ? <><Icon name="refresh" size={12} className="spin" /> Применение...</>
            : status.enabled
              ? <><Icon name="stop" size={12} /> Выключить</>
              : <><Icon name="play" size={12} /> Включить</>}
        </button>
        {status.enabled && (
          <button className="btn" onClick={test} disabled={testing}>
            {testing
              ? <><Icon name="refresh" size={12} className="spin" /> Тест...</>
              : <><Icon name="zap" size={12} /> Тест соединения</>}
          </button>
        )}
      </div>

      {testResult && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: testResult.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
          border: `1px solid ${testResult.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
          borderRadius: 6, fontSize: 12, lineHeight: 1.5
        }}>
          {testResult.ok
            ? <><Icon name="check" size={12} /> {testResult.message}</>
            : <><Icon name="shield" size={12} /> {testResult.message || testResult.error}</>}
        </div>
      )}

      <Collapsible title="ℹ️ Как это работает" style={{ marginTop: 14 }}>
        • Создаются файлы <code>/etc/apt/apt.conf.d/99vemitreya-proxy</code> и
        <code>/etc/profile.d/vemitreya-proxy.sh</code><br />
        • <code>apt</code> применяет настройку сразу. <code>curl/wget/git</code> — после re-login
        SSH или <code>source /etc/profile.d/vemitreya-proxy.sh</code><br />
        • Локальные адреса (<code>127.0.0.1</code>, <code>localhost</code>) идут <strong>напрямую</strong>,
        не через прокси
      </Collapsible>
    </div>
  );
}

function MihomoPortsCard() {
  const [ports, setPorts] = useState(null);
  const [edited, setEdited] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const p = await api.get('/api/mihomo/ports');
      setPorts(p);
      // edited = текущие значения для редактирования
      const e = {};
      Object.entries(p).forEach(([k, v]) => { e[k] = v.value ?? ''; });
      setEdited(e);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleChange = (field, val) => {
    setEdited(prev => ({ ...prev, [field]: val }));
  };

  const isDirty = ports && Object.keys(ports).some(k => {
    const cur = ports[k].value;
    const ed = edited[k];
    if ((cur ?? '') === '' && (ed === '' || ed === null)) return false;
    return String(cur ?? '') !== String(ed);
  });

  const validate = () => {
    const used = {};
    for (const [field, val] of Object.entries(edited)) {
      if (val === '' || val === null || val === 0) continue;
      const port = parseInt(val);
      if (isNaN(port)) return `${field}: «${val}» не число`;
      if (port < 1024 || port > 65535) return `${field}: порт ${port} вне 1024-65535`;
      if (used[port]) return `Дубликат: ${used[port]} и ${field} оба ${port}`;
      used[port] = field;
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { showToast(err, 'error'); return; }

    setSaving(true);
    try {
      // Готовим payload — пустые → null
      const payload = {};
      Object.entries(edited).forEach(([k, v]) => {
        payload[k] = (v === '' || v === null) ? null : parseInt(v);
      });
      await api.put('/api/mihomo/ports', { ports: payload });
      showToast('Порты сохранены, Mihomo перезагружен', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setSaving(false); }
  };

  const reset = () => {
    if (!ports) return;
    const e = {};
    Object.entries(ports).forEach(([k, v]) => { e[k] = v.value ?? ''; });
    setEdited(e);
  };

  if (loading || !ports) return null;

  return (
    <div className="card">
      <div className="card-title">
        <Icon name="sliders" size={14} /> Порты Mihomo
      </div>
      <div className="card-subtitle">
        Локальные порты на которых Mihomo принимает запросы. Оставьте пустым чтобы отключить порт.
        Все значения должны быть в диапазоне 1024-65535.
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {Object.entries(ports).map(([field, info]) => (
          <div key={field} className="row" style={{
            padding: '10px 12px',
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{info.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {field}
              </div>
            </div>
            <input type="number" min="1024" max="65535" placeholder="отключено"
                   className="form-input"
                   style={{
                     width: 110,
                     fontFamily: 'var(--mono)',
                     textAlign: 'center',
                     fontSize: 14
                   }}
                   value={edited[field] ?? ''}
                   onChange={e => handleChange(field, e.target.value)} />
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 14,
        justifyContent: 'flex-end',
        flexWrap: 'wrap'
      }}>
        {isDirty && (
          <button className="btn" onClick={reset} disabled={saving}>
            Отменить
          </button>
        )}
        <button className="btn btn-primary"
                onClick={save}
                disabled={saving || !isDirty}>
          {saving
            ? <><Icon name="refresh" size={12} className="spin" /> Сохранение...</>
            : <><Icon name="check" size={12} /> Сохранить</>}
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        После сохранения Mihomo перезагрузится. Если изменили порт API — Vemitreya
        не сможет связаться с Mihomo (сейчас API не настраивается через эту форму, только локальные порты).
      </div>
    </div>
  );
}

function Services() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setItems(await api.get('/api/services')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  const action = async (svc, act) => {
    try {
      await api.post('/api/services/action', { service: svc, action: act });
      showToast(`${svc}: ${act}`, 'success');
      setTimeout(load, 500);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const removeLegacy = async (svc) => {
    if (!confirm(
      `Удалить устаревший сервис «${svc}»?\n\n` +
      `Это безопасная операция:\n` +
      `1. Сервис будет остановлен (если запущен)\n` +
      `2. Отключён из автозагрузки\n` +
      `3. Файл /etc/systemd/system/${svc}.service удалится\n` +
      `4. systemd будет перезагружен\n\n` +
      `Продолжить?`
    )) return;
    try {
      await api.post('/api/services/legacy-remove', { service: svc });
      showToast(`${svc} удалён`, 'success');
      setTimeout(load, 500);
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  return (
    <div>
      <MihomoPortsCard />
      <SystemProxyCard />

      {items.map(s => (
        <div key={s.name} className={`service-item ${s.legacy ? 'service-legacy' : ''}`}>
          <div className="service-name">
            <span className={`status-dot ${s.active ? 'green' : 'red'}`}></span>
            <span>{s.name}</span>
            {s.enabled && <span className="badge badge-info">auto</span>}
            {s.legacy && (
              <span className="badge badge-warning" title="Устаревший сервис от предыдущей версии. Можно удалить.">
                ⚠ устаревший
              </span>
            )}
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-success" disabled={s.active}
                    onClick={() => action(s.name, 'start')}><Icon name="play" size={12} /></button>
            <button className="btn btn-sm" onClick={() => action(s.name, 'restart')}>↻</button>
            <button className="btn btn-sm btn-danger" disabled={!s.active}
                    onClick={() => action(s.name, 'stop')}><Icon name="stop" size={12} /></button>
            {s.legacy && (
              <button className="btn btn-sm btn-danger" title="Удалить устаревший сервис"
                      onClick={() => removeLegacy(s.name)}>🗑</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =========================================================
// CONNECTIONS
// =========================================================
function Connections() {
  const [conns, setConns] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [field, setField] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.get('/api/connections?limit=200');
        setConns(d.connections); setTotal(d.total);
      } catch {}
    };
    load();
    const i = setInterval(load, 2000);
    return () => clearInterval(i);
  }, []);

  // фильтр по хосту / порту / источнику / сети / цепочке / всем сразу
  const matchConn = (c, q) => {
    if (!q) return true;
    q = q.toLowerCase();
    const fields = {
      host: c.host,
      port: String(c.port ?? ''),
      source: c.source,
      network: c.network,
      chain: (c.chains || []).join(' → '),
    };
    if (field === 'all') {
      return Object.values(fields).some(v => (v || '').toLowerCase().includes(q));
    }
    return (fields[field] || '').toLowerCase().includes(q);
  };
  const filtered = conns.filter(c => matchConn(c, filter));

  const fieldLabels = {
    all: 'Везде', host: 'Хост', port: 'Порт',
    source: 'Источник', network: 'Сеть', chain: 'Цепочка',
  };

  return (
    <div>
      <div className="flex-between mb-16">
        <div><strong>{total}</strong> активных
          <span className="text-muted"> · показано {filtered.length}</span></div>
        <div className="flex gap-8">
          <select className="form-select" style={{ width: 130 }}
                  value={field} onChange={e => setField(e.target.value)}>
            {Object.entries(fieldLabels).map(([k, v]) =>
              <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="form-input" style={{ width: 220 }}
                 placeholder={field === 'all' ? '🔍 Поиск по всем полям...'
                            : field === 'port' ? '🔍 напр. 443'
                            : field === 'source' ? '🔍 напр. 192.168.1.50'
                            : `🔍 Фильтр по «${fieldLabels[field]}»...`}
                 value={filter} onChange={e => setFilter(e.target.value)} />
          <button className="btn btn-sm btn-danger" onClick={async () => {
            await api.del('/api/connections');
            showToast('Закрыто', 'success');
          }}>Закрыть все</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr><th>Хост</th><th>Порт</th><th>Сеть</th><th>Источник</th><th>Цепочка</th>
                <th style={{ textAlign: 'right' }}>↑</th><th style={{ textAlign: 'right' }}>↓</th></tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td className="text-mono">{c.host}</td>
                <td>{c.port}</td>
                <td><span className="badge badge-info">{c.network}</span></td>
                <td className="text-mono" style={{ fontSize: 10 }}>{c.source}</td>
                <td style={{ fontSize: 10 }}>{c.chains?.join(' → ')}</td>
                <td className="text-mono" style={{ textAlign: 'right' }}>{fmtBytes(c.upload)}</td>
                <td className="text-mono" style={{ textAlign: 'right' }}>{fmtBytes(c.download)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Нет соединений</div>}
      </div>
    </div>
  );
}

// =========================================================
// LOGS
// =========================================================
function LogsView() {
  const [svcs, setSvcs] = useState([]);
  const [svc, setSvc] = useState('mihomo');
  const [text, setText] = useState('');
  const [live, setLive] = useState(false);
  const ref = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => { api.get('/api/services').then(s => setSvcs(s.map(x => x.name))); }, []);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/api/logs/${svc}?lines=200`);
      setText(d.logs);
      setTimeout(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, 50);
    } catch (e) { showToast(e.message, 'error'); }
  }, [svc]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!live) { wsRef.current?.close(); return; }
    const ws = new WebSocket(api.wsUrl(`/ws/logs/${svc}`));
    ws.onopen = () => ws.send(JSON.stringify({ token: api.token }));
    ws.onmessage = (ev) => {
      setText(t => t + ev.data);
      setTimeout(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, 50);
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [live, svc]);

  const hl = (l) => {
    if (/error|failed|fatal/i.test(l)) return 'log-error';
    if (/warn/i.test(l)) return 'log-warn';
    if (/success|started|listening|handshake/i.test(l)) return 'log-success';
    if (/info/i.test(l)) return 'log-info';
    return '';
  };

  return (
    <div>
      <div className="flex gap-12 mb-16">
        <select className="form-select" style={{ width: 280 }} value={svc} onChange={e => setSvc(e.target.value)}>
          {svcs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-sm" onClick={load}>↻</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />
          Live
        </label>
      </div>
      <div ref={ref} className="logs-viewer">
        {text.split('\n').map((l, i) => <div key={i} className={hl(l)}>{l}</div>)}
      </div>
    </div>
  );
}

// =========================================================
// TELEGRAM
// =========================================================
function TelegramSettings() {
  const [s, setS] = useState({
    tg_bot_token: '', tg_chat_id: '', tg_enabled: 'false',
    tg_alerts_enabled: '0', tg_alerts_recovery: '1',
    tg_alerts_awg_handshake_max_minutes: '10'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/api/telegram/settings').then(d => setS(p => ({ ...p, ...d }))); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.put('/api/telegram/settings', s); showToast('Сохранено', 'success'); }
    finally { setSaving(false); }
  };

  const test = async () => {
    try {
      const r = await api.post('/api/telegram/test');
      showToast(r.ok ? 'Отправлено!' : 'Ошибка', r.ok ? 'success' : 'error');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const f = (k) => ({ value: s[k] || '', onChange: e => setS(p => ({ ...p, [k]: e.target.value })) });
  const cb = (k, on, off) => ({
    checked: s[k] === on,
    onChange: e => setS(p => ({ ...p, [k]: e.target.checked ? on : off }))
  });

  return (
    <div>
      <div className="card">
        <div className="card-title">🤖 Telegram Bot</div>
        <div className="form-group">
          <label className="form-label">Bot Token (@BotFather)</label>
          <input className="form-input" type="password" {...f('tg_bot_token')} />
        </div>
        <div className="form-group">
          <label className="form-label">Chat ID</label>
          <input className="form-input" {...f('tg_chat_id')} />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" {...cb('tg_enabled', 'true', 'false')} />
            Включить уведомления (общий toggle)
          </label>
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={save} disabled={saving}><Icon name="check" size={12} /> Сохранить</button>
          <button className="btn" onClick={test}>📨 Тест</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">🚨 Алерты при падении сервисов</div>
        <p style={{ marginTop: 0, fontSize: 13, opacity: 0.75 }}>
          Backend каждые 30 сек проверяет mihomo, vemitreya, awg-quick@*, trusttunnel-*.
          При смене состояния active → failed/inactive шлёт алерт. Также мониторится handshake AWG.
        </p>
        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" {...cb('tg_alerts_enabled', '1', '0')} />
            <strong>Включить алерты на падение сервисов</strong>
          </label>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" {...cb('tg_alerts_recovery', '1', '0')} />
            Также шлать алерт при восстановлении (active снова)
          </label>
        </div>
        <div className="form-group">
          <label className="form-label">Порог alert если AWG handshake старше (минут)</label>
          <input className="form-input" type="number" min="2" max="60"
                 {...f('tg_alerts_awg_handshake_max_minutes')} style={{ width: 100 }} />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Icon name="check" size={12} /> Сохранить настройки
        </button>
      </div>
    </div>
  );
}

// =========================================================
// SPEEDTEST — пинг популярных ресурсов через прокси
// =========================================================
function Speedtest() {
  const [groups, setGroups] = useState({});
  const [targets, setTargets] = useState([]);
  const [selectedProxies, setSelectedProxies] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  // Развёрнуты ли секции групп
  const [expandedGroups, setExpandedGroups] = useState({});
  // Развёрнут ли блок прокси-серверов целиком (по умолчанию свёрнут)
  const [proxiesExpanded, setProxiesExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/proxies/groups').catch(() => ({})),
      api.get('/api/speedtest/targets').catch(() => [])
    ]).then(([g, t]) => {
      setGroups(g);
      setTargets(t);
      setSelectedTargets(t.slice(0, 5).map(x => x.id));
      // По умолчанию все группы развёрнуты
      const expanded = {};
      Object.keys(g).forEach(name => { expanded[name] = true; });
      setExpandedGroups(expanded);
    });
  }, []);

  // Классификация групп: routing vs channel
  const classification = useMemo(() => buildGroupClassification(groups), [groups]);

  // Группировка прокси: { groupName -> [proxy_names] }
  // Только CHANNEL-группы (т.е. пулы серверов: AWG, TrustTunnel, VLESS, HY2 и т.п.)
  // Не показываем routing-группы (Основной трафик, Серверный, Telegram и т.п.)
  // Не показываем системные (GLOBAL)
  const proxiesByGroup = useMemo(() => {
    const result = {};
    Object.entries(groups).forEach(([groupName, g]) => {
      // Скипаем системные и routing
      if (SYSTEM_GROUPS.has(groupName)) return;
      if (classification[groupName] !== 'channel') return;

      const proxies = (g.all || []).filter(p =>
        p !== 'DIRECT' && p !== 'REJECT' && !groups[p]
      );
      if (proxies.length > 0) {
        result[groupName] = proxies;
      }
    });
    return result;
  }, [groups, classification]);

  // Все уникальные прокси (для allProxies счётчика)
  const allProxies = useMemo(() => {
    const set = new Set();
    Object.values(proxiesByGroup).forEach(list => list.forEach(p => set.add(p)));
    return Array.from(set);
  }, [proxiesByGroup]);

  const toggleProxy = (p) => setSelectedProxies(s =>
    s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  const toggleTarget = (id) => setSelectedTargets(s =>
    s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  // Toggle всю группу
  const toggleGroup = (groupName) => {
    const list = proxiesByGroup[groupName] || [];
    const allSelected = list.every(p => selectedProxies.includes(p));
    if (allSelected) {
      setSelectedProxies(s => s.filter(p => !list.includes(p)));
    } else {
      setSelectedProxies(s => Array.from(new Set([...s, ...list])));
    }
  };

  const toggleGroupExpanded = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const selectAllProxies = () => setSelectedProxies(allProxies);
  const clearProxies = () => setSelectedProxies([]);
  const selectAllTargets = () => setSelectedTargets(targets.map(t => t.id));
  const clearTargets = () => setSelectedTargets([]);

  const runTest = async () => {
    if (!selectedProxies.length || !selectedTargets.length) {
      showToast('Выберите прокси и цели', 'warning');
      return;
    }
    setRunning(true);
    setMatrix(null);
    setProgress({ done: 0, total: selectedProxies.length * selectedTargets.length });
    try {
      const r = await api.post('/api/speedtest/matrix', {
        proxies: selectedProxies,
        targets: selectedTargets,
        timeout_ms: 5000
      });
      setMatrix(r);
      showToast('✓ Тест завершён', 'success');
    } catch (e) {
      showToast(`Ошибка: ${e.message}`, 'error');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const runSingleProxy = async (proxy) => {
    try {
      setRunning(true);
      const r = await api.post('/api/speedtest/run', {
        proxy, targets: selectedTargets, timeout_ms: 5000
      });
      const m = { [proxy]: {} };
      r.results.forEach(res => { m[proxy][res.id] = res.ok ? res.delay : -1; });
      setMatrix({
        proxies: [proxy],
        targets: r.results.map(t => ({ id: t.id, name: t.name, icon: t.icon, favicon: t.favicon })),
        matrix: m
      });
      showToast(`✓ ${proxy}: ${r.summary.ok}/${r.summary.total} OK`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setRunning(false); }
  };

  const delayClass = (d) => !d || d < 0 ? 'bad' : d < 200 ? 'good' : d < 500 ? 'medium' : 'bad';

  // Render favicon с fallback на эмодзи
  const TargetFavicon = ({ target, size = 16 }) => {
    const [failed, setFailed] = useState(false);
    if (!target.favicon || failed) {
      return <span style={{ fontSize: size - 1 }}>{target.icon}</span>;
    }
    return (
      <img src={target.favicon} alt={target.name}
           width={size} height={size}
           style={{ borderRadius: 3, verticalAlign: 'middle' }}
           onError={() => setFailed(true)} />
    );
  };

  return (
    <div>
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="card-title">
            <Icon name="target" size={14} /> Цели ({selectedTargets.length}/{targets.length})
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-ghost" onClick={selectAllTargets}>Все</button>
            <button className="btn btn-sm btn-ghost" onClick={clearTargets}>Снять</button>
          </div>
        </div>
        <div className="speedtest-targets">
          {targets.map(t => (
            <div key={t.id}
                 onClick={() => toggleTarget(t.id)}
                 className={`speedtest-target-card ${selectedTargets.includes(t.id) ? 'active' : ''}`}>
              <div className="speedtest-target-icon">
                <TargetFavicon target={t} size={32} />
              </div>
              <div className="speedtest-target-name">{t.name}</div>
              {selectedTargets.includes(t.id) && (
                <div className="speedtest-target-check">
                  <Icon name="check" size={12} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex-between"
             style={{ cursor: 'pointer', userSelect: 'none' }}
             onClick={() => setProxiesExpanded(v => !v)}>
          <div className="card-title">
            <Icon name="satellite" size={14} /> Прокси серверы ({selectedProxies.length}/{allProxies.length})
          </div>
          <div className="btn-group" onClick={e => e.stopPropagation()}>
            {proxiesExpanded && (
              <>
                <button className="btn btn-sm btn-ghost" onClick={selectAllProxies}>Все</button>
                <button className="btn btn-sm btn-ghost" onClick={clearProxies}>Снять</button>
              </>
            )}
            <button className="btn btn-sm btn-ghost"
                    onClick={() => setProxiesExpanded(v => !v)}
                    title={proxiesExpanded ? 'Свернуть' : 'Развернуть'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', transition: 'transform .15s',
                             transform: proxiesExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                <Icon name="arrowUp" size={12} />
              </span>
            </button>
          </div>
        </div>

        {proxiesExpanded && (
        <div className="speedtest-groups" style={{ marginTop: 12 }}>
          {Object.keys(proxiesByGroup).length === 0 ? (
            <div className="text-muted" style={{ fontSize: 11, padding: 12, textAlign: 'center' }}>
              Нет proxy-groups в конфиге
            </div>
          ) : Object.entries(proxiesByGroup).map(([groupName, proxies]) => {
            const selectedInGroup = proxies.filter(p => selectedProxies.includes(p)).length;
            const allInGroupSelected = selectedInGroup === proxies.length;
            const someSelected = selectedInGroup > 0;
            const isExpanded = expandedGroups[groupName] !== false;

            return (
              <div key={groupName} className="speedtest-group">
                <div className="speedtest-group-header">
                  <button className="speedtest-group-toggle"
                          onClick={() => toggleGroupExpanded(groupName)}>
                    <span style={{ display: 'inline-block',
                                   transition: 'transform .15s',
                                   transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                  </button>
                  <strong className="speedtest-group-name" onClick={() => toggleGroupExpanded(groupName)}>
                    {groupName}
                  </strong>
                  <span className="badge badge-info" style={{ marginLeft: 4 }}>
                    {selectedInGroup}/{proxies.length}
                  </span>
                  <button className="btn btn-sm btn-ghost"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => toggleGroup(groupName)}>
                    {allInGroupSelected ? 'Снять все' : someSelected ? 'Выбрать все' : 'Выбрать все'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="speedtest-group-body">
                    {proxies.map(p => (
                      <div key={p}
                           onClick={() => toggleProxy(p)}
                           className={`chip ${selectedProxies.includes(p) ? 'chip-active' : ''}`}>
                        {p}
                        <span className="chip-action"
                              onClick={(e) => { e.stopPropagation(); runSingleProxy(p); }}
                              title="Тест только этого"><Icon name="play" size={10} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={runTest}
                disabled={running || !selectedProxies.length || !selectedTargets.length}>
          {running ? <><Icon name="refresh" size={12} className="spin" /> Тестируется...</>
                   : <><Icon name="play" size={12} /> Запустить ({selectedProxies.length}×{selectedTargets.length})</>}
        </button>
      </div>

      {progress && (
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }}></div>
        </div>
      )}

      {/* Матрица результатов */}
      {matrix && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table speedtest-table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg-3)', zIndex: 2, minWidth: 200 }}>
                  Прокси \ Цель
                </th>
                {matrix.targets.map(t => (
                  <th key={t.id} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <TargetFavicon target={t} size={14} />
                      <span>{t.name}</span>
                    </div>
                  </th>
                ))}
                <th style={{ textAlign: 'center', minWidth: 70 }}>📊 Среднее</th>
              </tr>
            </thead>
            <tbody>
              {matrix.proxies.map(proxy => {
                const row = matrix.matrix[proxy] || {};
                const okValues = matrix.targets.map(t => row[t.id]).filter(d => d > 0);
                const avg = okValues.length ? Math.round(okValues.reduce((a, b) => a + b, 0) / okValues.length) : 0;
                return (
                  <tr key={proxy}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-2)',
                                  fontFamily: 'var(--mono)', fontSize: 11, zIndex: 1 }}>
                      {proxy}
                    </td>
                    {matrix.targets.map(t => {
                      const d = row[t.id];
                      return (
                        <td key={t.id} style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>
                          {d > 0
                            ? <span className={`proxy-delay ${delayClass(d)}`}>{d}ms</span>
                            : <span className="text-muted">❌</span>}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                      {avg ? <span className={`proxy-delay ${delayClass(avg)}`}>{avg}ms</span> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================
// QUICK RULES (v2.206) — per-domain channel selector
// =========================================================
// Простой UI: введи домен → выбери канал → правило создано перед MATCH
function QuickRules() {
  const [target, setTarget] = useState('');
  const [targets, setTargets] = useState([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quickrules_history') || '[]'); }
    catch { return []; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [matchHint, setMatchHint] = useState(null);

  useEffect(() => {
    api.get('/api/mihomo/rules/targets').then(r => {
      setTargets(r.targets || []);
      if (!target && r.targets?.length) {
        // Дефолт — первая группа кроме DIRECT/REJECT
        const def = r.targets.find(t => !['DIRECT', 'REJECT', 'PASS'].includes(t)) || r.targets[0];
        setTarget(def);
      }
    });
  }, []);

  // Авто-определение типа правила по введённому
  const detectType = (str) => {
    const s = str.trim();
    if (!s) return null;
    // IP-CIDR (IPv4)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/.test(s)) {
      return { type: 'IP-CIDR', payload: s.includes('/') ? s : s + '/32', label: 'IPv4-адрес/подсеть' };
    }
    // IP-CIDR6
    if (s.includes(':') && /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(s)) {
      return { type: 'IP-CIDR6', payload: s.includes('/') ? s : s + '/128', label: 'IPv6-адрес/подсеть' };
    }
    // GEOIP — 2 буквы заглавные
    if (/^[A-Z]{2}$/.test(s)) {
      return { type: 'GEOIP', payload: s, label: 'GeoIP страна' };
    }
    // Domain — содержит точку, без слешей и пробелов
    if (s.includes('.') && !/[\s\/\\]/.test(s)) {
      return { type: 'DOMAIN-SUFFIX', payload: s, label: 'Домен (suffix-match)' };
    }
    // Keyword (короткое слово без точки)
    if (s.length > 1 && /^[\w-]+$/.test(s)) {
      return { type: 'DOMAIN-KEYWORD', payload: s, label: 'Ключевое слово в домене' };
    }
    return null;
  };

  useEffect(() => {
    setMatchHint(detectType(input));
  }, [input]);

  const submit = async () => {
    const m = matchHint;
    if (!m || !target) {
      showToast('Заполни поле и выбери канал', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      // Формируем правило с no-resolve если IP
      const needsNoResolve = ['IP-CIDR', 'IP-CIDR6', 'GEOIP'].includes(m.type);
      const rule = needsNoResolve
        ? `${m.type},${m.payload},${target},no-resolve`
        : `${m.type},${m.payload},${target}`;

      // Загружаем текущие правила, чтобы вставить перед MATCH
      const cur = await api.get('/api/mihomo/rules');
      const rules = cur.map(r => r.raw);
      // Найти MATCH
      const matchIdx = rules.findIndex(r => /^MATCH\b/i.test(r));
      const insertIdx = matchIdx >= 0 ? matchIdx : rules.length;
      rules.splice(insertIdx, 0, rule);

      await api.put('/api/mihomo/rules', { rules });
      showToast(`✓ ${m.payload} → ${target}`, 'success');

      // Сохраняем в history (последние 20)
      const newHistory = [
        { input: input.trim(), target, rule, ts: Date.now() },
        ...history.filter(h => h.input !== input.trim() || h.target !== target)
      ].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem('quickrules_history', JSON.stringify(newHistory));

      setInput('');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const removeFromHistory = (idx) => {
    const newHistory = history.filter((_, i) => i !== idx);
    setHistory(newHistory);
    localStorage.setItem('quickrules_history', JSON.stringify(newHistory));
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">⚡ Быстрое правило</div>
        <p style={{ marginTop: 0, fontSize: 12, opacity: 0.75 }}>
          Введи домен (или IP) и выбери канал. Правило добавится перед <code>MATCH</code> с авто-определением типа.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Домен или IP</label>
            <input className="form-input"
                   placeholder="youtube.com  или  91.108.0.0/16  или  RU"
                   value={input}
                   onChange={e => setInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && submit()} />
            {matchHint && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                Будет создано: <code>{matchHint.type},{matchHint.payload},{target}</code>
                <span style={{ marginLeft: 8 }}>({matchHint.label})</span>
              </div>
            )}
            {input.trim() && !matchHint && (
              <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>
                Не удалось определить тип. Используй точное значение: домен (`google.com`),
                IP (`8.8.8.8`), подсеть (`8.8.0.0/16`), или код страны (`US`).
              </div>
            )}
          </div>
          <div>
            <label className="form-label">Канал / группа</label>
            <select className="form-select" value={target} onChange={e => setTarget(e.target.value)}>
              {targets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={!matchHint || submitting}>
            {submitting ? 'Сохранение...' : '+ Добавить'}
          </button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>
          {(() => {
            // пример из реальных групп, а не захардкоженный EOF_HY2.
            const real = targets.filter(t => !['DIRECT', 'REJECT', 'PASS', 'GLOBAL'].includes(t));
            if (real.length === 0) {
              return <>💡 Введи домен (например <code>youtube.com</code>), выбери канал и нажми «Добавить». Правило сразу подействует.</>;
            }
            // Предпочитаем Hysteria2/EOF-подобную группу для примера, иначе первую
            const example = real.find(t => /hy|hysteria|eof/i.test(t)) || real[0];
            return <>💡 Хочешь чтобы YouTube открывался через <code>{example}</code>? Введи <code>youtube.com</code>,
              выбери <code>{example}</code> и нажми «Добавить». Правило сразу подействует.</>;
          })()}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Недавно добавленные через быстрое правило</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            История из браузера. Сами правила хранятся в Mihomo и не пропадают.
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ opacity: 0.7, fontSize: 11 }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Когда</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Введено</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Канал</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Правило</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(115,115,115,0.15)' }}>
                  <td style={{ padding: 6, fontSize: 11, opacity: 0.65 }}>
                    {new Date(h.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: 6, fontFamily: 'monospace' }}>{h.input}</td>
                  <td style={{ padding: 6 }}><span className="badge badge-info">{h.target}</span></td>
                  <td style={{ padding: 6, fontSize: 11, fontFamily: 'monospace', opacity: 0.8 }}>{h.rule}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>
                    <button className="btn btn-sm btn-icon" onClick={() => removeFromHistory(i)}
                            title="Убрать из истории">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================
// HEALTH MATRIX (v2.206) — матрица proxy × target
// =========================================================

// =========================================================
// КОМБИНИРОВАННЫЕ СТРАНИЦЫ (без табов внутри)
// =========================================================

// Правила = быстрое правило (вверху) + редактор (снизу), друг под другом
// настройки умного автовыбора (вынесены в Систему отдельной вкладкой)
// модал настроек умного автовыбора для одной группы.
// Разный набор полей для каналов (с исключениями) и маршрутизации (без).
function SmartGroupSettingsModal({ groupName, isChannel, initialConfig, onClose, onSaved }) {
  const [interval, setIntervalV] = useState(initialConfig?.interval ?? (isChannel ? 30 : 60));
  const [tolerance, setTolerance] = useState(initialConfig?.tolerance ?? (isChannel ? 0 : 50));
  const [exclude, setExclude] = useState(initialConfig?.exclude ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/mihomo/smart-config', {
        group: groupName, enabled: true,
        interval, tolerance,
        exclude: isChannel ? exclude : '',
      });
      showToast('Настройки сохранены', 'success');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>⚡ Настройки умного автовыбора</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-3)' }}>
            Группа: <strong style={{ color: 'var(--text)' }}>{groupName}</strong>
            {' · '}
            {isChannel
              ? 'Канал — выбор лучшего сервера внутри'
              : 'Маршрутизация — выбор лучшего канала'}
          </div>

          <Field label="Проверять каждые">
            <select className="form-select" value={interval}
                    onChange={e => setIntervalV(+e.target.value)}>
              <option value={10}>10 секунд</option>
              <option value={30}>30 секунд</option>
              <option value={60}>1 минуту</option>
              <option value={120}>2 минуты</option>
              <option value={300}>5 минут</option>
            </select>
          </Field>

          <Field label={isChannel ? 'Порог переключения' : 'Допустимый максимальный пинг разницы'}
                 hint="Переключаться только если новый сервер быстрее текущего больше чем на эту величину.">
            <select className="form-select" value={tolerance}
                    onChange={e => setTolerance(+e.target.value)}>
              <option value={0}>Всегда выбирать быстрейший</option>
              <option value={30}>Только если быстрее на 30+ мс</option>
              <option value={50}>Только если быстрее на 50+ мс</option>
              <option value={100}>Только если быстрее на 100+ мс</option>
              <option value={200}>Только если быстрее на 200+ мс</option>
            </select>
          </Field>

          {isChannel && (
            <Field label="Исключить серверы (по ключевым словам)"
                   hint="Серверы, в имени которых есть любое из этих слов, не будут выбираться. Через запятую, регистр не важен. Эти исключения действуют только для этого канала.">
              <input className="form-input" value={exclude}
                     onChange={e => setExclude(e.target.value)}
                     placeholder="Mobile, Russia, Belarus" />
            </Field>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RulesPage() {
  return (
    <div>
      <QuickRules />
      <div style={{ height: 16 }} />
      <RulesEditor />
    </div>
  );
}

// =========================================================
// PROXY GROUPS — визуальный редактор групп
// =========================================================
function ProxyGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [available, setAvailable] = useState({ groups: [], proxies: [], providers: [], specials: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);  // null | 'new' | group object
  const [search, setSearch] = useState('');
  const [smartGroups, setSmartGroups] = useState([]);  // v2.206
  const [smartInterval, setSmartInterval] = useState(60);
  const [smartTolerance, setSmartTolerance] = useState(0);
  const [smartExclude, setSmartExclude] = useState('');  // v2.206

  const loadSmart = async () => {
    try {
      const r = await api.get('/api/mihomo/smart-groups');
      setSmartGroups(r.groups || []);
      if (r.interval) setSmartInterval(r.interval);
      if (r.tolerance != null) setSmartTolerance(r.tolerance);
      if (r.exclude != null) setSmartExclude(r.exclude);
    } catch {}
  };
  const saveSmartSettings = async (interval, tolerance, exclude) => {
    try {
      await api.post('/api/mihomo/smart-groups',
        { groups: smartGroups, interval, tolerance,
          exclude: exclude !== undefined ? exclude : smartExclude });
      showToast('Настройки автовыбора сохранены', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  const toggleSmart = async (name) => {
    const next = smartGroups.includes(name)
      ? smartGroups.filter(g => g !== name)
      : [...smartGroups, name];
    setSmartGroups(next);
    try {
      await api.post('/api/mihomo/smart-groups',
        { groups: next, interval: smartInterval, tolerance: smartTolerance });
      showToast(next.includes(name)
        ? `⚡ Умный автовыбор включён: "${name}"`
        : `Умный автовыбор выключен: "${name}"`, 'success');
    } catch (e) { showToast(e.message, 'error'); loadSmart(); }
  };

  const load = async () => {
    setLoadError(null);
    try {
      const g = await api.get('/api/mihomo/proxy-groups');
      const av = await api.get('/api/mihomo/proxy-groups/available-proxies')
        .catch(() => ({ groups: [], proxies: [], providers: [], provider_proxies: {}, specials: [] }));
      setGroups(Array.isArray(g) ? g : []);
      setAvailable(av);
    } catch (e) {
      setLoadError(e.message);
      showToast(`Ошибка загрузки групп: ${e.message}`, 'error');
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); loadSmart(); }, []);
  // пока есть умные группы — тихо обновляем список, чтобы видеть
  // автопереключения без ручного F5.
  useEffect(() => {
    if (!smartGroups.length) return;
    const i = setInterval(() => {
      api.get('/api/mihomo/proxy-groups')
        .then(g => setGroups(Array.isArray(g) ? g : []))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(i);
  }, [smartGroups]);

  const del = async (name) => {
    if (!confirm(`Удалить группу "${name}"?`)) return;
    try {
      await api.del(`/api/mihomo/proxy-groups/${encodeURIComponent(name)}`);
      showToast('Удалено', 'success');
      load();
    } catch (e) {
      // если группа используется — предложить удалить вместе со ссылками
      if (String(e.message).startsWith('409')) {
        if (confirm(
          `Канал "${name}" используется в других группах или правилах.\n\n` +
          `Удалить его и автоматически убрать все ссылки на него?`
        )) {
          try {
            const r = await api.del(`/api/mihomo/proxy-groups/${encodeURIComponent(name)}?force=true`);
            const refs = r.cleaned_refs || [];
            showToast(refs.length
              ? `Удалено. Очищено ссылок: ${refs.length}`
              : 'Удалено', 'success');
            load();
          } catch (e2) { showToast(e2.message, 'error'); }
        }
      } else {
        showToast(e.message, 'error');
      }
    }
  };

  // Классификация для каждой группы
  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;
  const allGroupNames = new Set(groups.map(g => g.name));
  const classifyOne = (g) => {
    if (SYSTEM_GROUPS.has(g.name)) return 'system';
    return classifyGroup(g, allGroupNames);
  };

  // Тип таба для фильтрации
  const [groupTab, setGroupTab] = useState('all');  // all | routing | channels
  const visible = filtered.filter(g => {
    if (SYSTEM_GROUPS.has(g.name)) return false;  // никогда не показываем GLOBAL
    if (groupTab === 'all') return true;
    const cls = classifyOne(g);
    return groupTab === 'routing' ? cls === 'routing' : cls === 'channel';
  });

  const routingCount = filtered.filter(g => !SYSTEM_GROUPS.has(g.name) && classifyOne(g) === 'routing').length;
  const channelCount = filtered.filter(g => !SYSTEM_GROUPS.has(g.name) && classifyOne(g) === 'channel').length;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="flex-between mb-16">
        <div className="flex gap-12" style={{ alignItems: 'center' }}>
          <input className="form-input" style={{ width: 220 }} placeholder="🔍 Поиск..."
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Новая группа
        </button>
      </div>

      {/* Табы Routing / Channels */}
      <div className="proxy-tabs" style={{ marginBottom: 14 }}>
        <div className={`proxy-tab ${groupTab === 'all' ? 'active' : ''}`}
             onClick={() => setGroupTab('all')}>
          📋 Все
          <span className="badge badge-info">{routingCount + channelCount}</span>
        </div>
        <div className={`proxy-tab ${groupTab === 'routing' ? 'active' : ''}`}
             onClick={() => setGroupTab('routing')}
             title="Группы управления трафиком — определяют куда направить тип трафика. В rules: используются именно они.">
          🎯 Маршрутизация
          <span className="badge badge-purple">{routingCount}</span>
        </div>
        <div className={`proxy-tab ${groupTab === 'channels' ? 'active' : ''}`}
             onClick={() => setGroupTab('channels')}
             title="Группы каналов — пулы серверов одного протокола (AWG, TrustTunnel, VLESS, HY2 и т.п.)">
          🔒 Каналы
          <span className="badge badge-success">{channelCount}</span>
        </div>
      </div>

      {/* Описание текущей вкладки */}
      <div className="group-tab-hint">
        {groupTab === 'routing' && (
          <>
            <strong>🎯 Маршрутизация</strong> — группы управления трафиком.
            Содержат другие группы или DIRECT/REJECT. На них ссылаются <code>rules:</code>
            (например «Telegram идёт через эту группу»).
          </>
        )}
        {groupTab === 'channels' && (
          <>
            <strong>🔒 Каналы</strong> — пулы конкретных серверов одного протокола (AWG, TrustTunnel, VLESS, HY2…).
            Не используются напрямую в правилах, а служат «выбором сервера» когда канал
            подключён в маршрутизирующую группу.
          </>
        )}
        {groupTab === 'all' && (
          <>
            <strong>📋 Все</strong> — обе категории сразу.
            Сверху — Маршрутизация (используется в rules), ниже — Каналы (пулы серверов).
          </>
        )}
      </div>

      {loadError && (
        <div className="card" style={{
          borderColor: 'var(--error)',
          background: 'rgba(239,68,68,.05)'
        }}>
          <div className="flex-between">
            <div>
              <strong style={{ color: 'var(--error)' }}>Не удалось загрузить группы</strong>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                {loadError}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Возможно на сервере старая версия backend — обновите через <code>sudo ./update.sh</code>
              </div>
            </div>
            <button className="btn btn-sm" onClick={load}>↻ Повторить</button>
          </div>
        </div>
      )}

      {!loadError && visible.length === 0 && (
        <div className="empty-state">
          <div className="icon">📂</div>
          {groups.length === 0 ? 'Нет групп. Создайте первую.'
           : groupTab === 'routing' ? 'Нет групп маршрутизации'
           : groupTab === 'channels' ? 'Нет групп-каналов'
           : 'Ничего не найдено'}
        </div>
      )}

      <div className="groups-grid">
        {(() => {
          // В режиме "Все" — сначала routing, потом channels
          const sorted = groupTab === 'all'
            ? [...visible].sort((a, b) => {
                const ca = classifyOne(a), cb = classifyOne(b);
                if (ca === cb) return 0;
                return ca === 'routing' ? -1 : 1;
              })
            : visible;
          return sorted.map(g => (
            <ProxyGroupCard key={g.name} group={g}
                            kind={classifyOne(g)}
                            available={available}
                            smart={smartGroups.includes(g.name)}
                            onToggleSmart={() => toggleSmart(g.name)}
                            onEdit={() => setEditing(g)}
                            onDelete={() => del(g.name)}
                            onReload={load} />
          ));
        })()}
      </div>

      {editing && <ProxyGroupEditor
        initial={editing === 'new' ? null : editing}
        defaultKind={editing === 'new'
          ? (groupTab === 'channels' ? 'channel' : 'routing')
          : null}
        available={available}
        existingGroups={groups}
        initialSmart={editing !== 'new' && smartGroups.includes(editing.name)}
        smartGroups={smartGroups}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); loadSmart(); }} />}
    </div>
  );
}

const TYPE_INFO = {
  'select': { label: 'Выбор вручную', icon: '👉', color: 'var(--accent)' },
  'url-test': { label: 'Авто (по пингу)', icon: '⚡', color: 'var(--success)' },
  'fallback': { label: 'Резервирование', icon: '🛡️', color: 'var(--warning)' },
  'load-balance': { label: 'Балансировка', icon: '⚖️', color: 'var(--purple)' },
};

function ProxyGroupCard({ group, kind, available, smart, onToggleSmart, onEdit, onDelete, onReload }) {
  const type = TYPE_INFO[group.type] || { label: group.type, icon: '📂', color: 'var(--text-3)' };
  const totalMembers = (group.proxies || []).length + (group.use || []).length;
  const isRouting = kind === 'routing';

  // Быстро убрать прокси из группы
  const removeMember = async (member, isUse) => {
    try {
      const updated = {
        ...group,
        proxies: isUse ? group.proxies : (group.proxies || []).filter(p => p !== member),
        use: isUse ? (group.use || []).filter(u => u !== member) : group.use,
      };
      await api.put(`/api/mihomo/proxy-groups/${encodeURIComponent(group.name)}`, updated);
      onReload();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className={`group-card group-card-${kind || 'channel'}`}>
      <div className="group-card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="group-card-name">{group.name}</div>
          <div className="group-card-meta">
            <span className={`badge ${isRouting ? 'badge-purple' : 'badge-success'}`} style={{ fontSize: 9 }}
                  title={isRouting ? 'Маршрутизация — управляет трафиком' : 'Канал — пул серверов одного протокола'}>
              {isRouting ? '🎯 ROUTING' : '🔒 CHANNEL'}
            </span>
            <span className="group-type-badge"
                  style={smart
                    ? { color: '#fff', background: 'var(--success)', borderColor: 'var(--success)' }
                    : { color: type.color, borderColor: type.color }}>
              {smart ? '⚡ Умный автовыбор' : `${type.icon} ${type.label}`}
            </span>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {totalMembers} {totalMembers === 1 ? 'элемент' : 'элементов'}
            </span>
          </div>
        </div>
        <div className="btn-group">
          <button className="btn btn-sm" onClick={onEdit} title="Редактировать">✏️</button>
          <button className="btn btn-sm btn-ghost" onClick={onDelete} title="Удалить"
                  style={{ color: 'var(--error)' }}>🗑</button>
        </div>
      </div>

      {/* Список членов группы */}
      <div className="group-members">
        {(group.proxies || []).map(p => {
          const isSpecial = p === 'DIRECT' || p === 'REJECT';
          const isGroup = available.groups?.includes(p);
          return (
            <div key={'p:' + p} className={`group-member ${isSpecial ? 'special' : ''} ${isGroup ? 'is-group' : ''}`}>
              <span className="member-name">{p}</span>
              <button className="member-remove" onClick={() => removeMember(p, false)}
                      title="Убрать из группы">×</button>
            </div>
          );
        })}
        {(group.use || []).map(u => (
          <div key={'u:' + u} className="group-member is-provider">
            <span className="provider-icon">📡</span>
            <span className="member-name">{u}</span>
            <button className="member-remove" onClick={() => removeMember(u, true)}
                    title="Убрать">×</button>
          </div>
        ))}
        {totalMembers === 0 && (
          <div className="text-muted" style={{ fontSize: 11, padding: 8 }}>Пусто</div>
        )}
      </div>

      {/* Дополнительная инфа для url-test/fallback */}
      {group.type !== 'select' && (group.url || group.interval) && (
        <div className="group-card-footer">
          {group.url && <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
            test: {group.url}
          </span>}
          {group.interval && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            every {group.interval}s
          </span>}
        </div>
      )}
    </div>
  );
}

function ProxyGroupEditor({ initial, available, existingNames, existingGroups, defaultKind, initialSmart, smartGroups, onClose, onSaved }) {
  const isEdit = !!initial;

  // Определяем kind при редактировании
  const initialKind = useMemo(() => {
    if (defaultKind) return defaultKind;
    if (!initial) return 'routing';
    const allNames = new Set((existingGroups || existingNames || []).map(g => typeof g === 'string' ? g : g.name));
    return classifyGroup(initial, allNames);
  }, [initial, defaultKind]);

  const [kind, setKind] = useState(initialKind);  // 'routing' | 'channel'

  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    type: initial.type || 'select',
    proxies: [...(initial.proxies || [])],
    use: [...(initial.use || [])],
    filter: initial.filter || '',
    url: initial.url || 'http://www.gstatic.com/generate_204',
    interval: initial.interval || 300,
    tolerance: initial.tolerance || null,
    icon: initial.icon || '',
  } : {
    name: '',
    type: 'select',
    proxies: [],
    use: [],
    filter: '',
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: null,
    icon: '',
  });
  // при редактировании группы с filter — восстановить выбранные
  // серверы подписок в proxies (для отображения галочек), чтобы submit пересобрал их.
  useEffect(() => {
    if (!initial?.filter) return;
    const pp = available.provider_proxies || {};
    if (!Object.keys(pp).length) return;
    let re;
    try { re = new RegExp(initial.filter); } catch { return; }
    const matched = [];
    Object.values(pp).forEach(names => names.forEach(n => { if (re.test(n)) matched.push(n); }));
    if (matched.length) {
      setForm(p => ({
        ...p,
        proxies: Array.from(new Set([...p.proxies, ...matched])),
      }));
    }
  }, [available.provider_proxies]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  // поиск и сворачивание серверов подписок
  const [srvSearch, setSrvSearch] = useState('');
  const [openProvs, setOpenProvs] = useState({});  // {provName: true} — раскрытые
  const toggleProv = (p) => setOpenProvs(o => ({ ...o, [p]: !o[p] }));

  const f = (k) => ({
    value: form[k] ?? '',
    onChange: e => setForm(p => ({ ...p, [k]: e.target.value })),
    disabled: saving,
  });

  // Доступные элементы — фильтруются по типу группы
  // Routing-группа: можно добавлять других routing-групп, channel-группы, DIRECT/REJECT
  // Channel-группа: можно добавлять только конкретные прокси и подписки (use:)
  const channelGroupNames = useMemo(() => {
    if (!existingGroups) return new Set();
    const allNames = new Set(existingGroups.map(g => g.name));
    return new Set(existingGroups
      .filter(g => classifyGroup(g, allNames) === 'channel')
      .map(g => g.name));
  }, [existingGroups]);

  const isChannelKind = kind === 'channel';

  let allItems = [];
  if (isChannelKind) {
    // Channel: только прокси (без других групп и без DIRECT/REJECT)
    allItems = (available.proxies || []).map(p => ({ name: p, kind: 'proxy' }));
  } else {
    // Routing: специальные + ВСЕ группы (но не сама себя), без сырых прокси
    allItems = [
      ...(available.specials || []).map(p => ({ name: p, kind: 'special' })),
      ...(available.groups || [])
        .filter(g => g !== form.name && !SYSTEM_GROUPS.has(g))
        .map(p => ({
          name: p,
          kind: channelGroupNames.has(p) ? 'channel-group' : 'group'
        })),
    ];
  }

  const allProviders = isChannelKind ? (available.providers || []) : [];

  const filtered = search
    ? allItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const toggleMember = (name) => setForm(p => ({
    ...p,
    proxies: p.proxies.includes(name) ? p.proxies.filter(x => x !== name) : [...p.proxies, name]
  }));
  const toggleProvider = (name) => setForm(p => ({
    ...p,
    use: p.use.includes(name) ? p.use.filter(x => x !== name) : [...p.use, name]
  }));

  const moveMember = (name, dir) => setForm(p => {
    const arr = [...p.proxies];
    const idx = arr.indexOf(name);
    if (idx < 0) return p;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return p;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return { ...p, proxies: arr };
  });

  // drag&drop для proxies внутри группы
  const [memDragSrc, setMemDragSrc] = useState(null);
  const [memDragOver, setMemDragOver] = useState(null);
  const onMemDragStart = (idx) => (e) => {
    setMemDragSrc(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onMemDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (memDragOver !== idx) setMemDragOver(idx);
  };
  const onMemDragLeave = () => setMemDragOver(null);
  const onMemDrop = (dstIdx) => (e) => {
    e.preventDefault();
    const src = memDragSrc;
    setMemDragSrc(null);
    setMemDragOver(null);
    if (src === null || src === dstIdx) return;
    setForm(p => {
      const arr = [...p.proxies];
      const [item] = arr.splice(src, 1);
      arr.splice(dstIdx, 0, item);
      return { ...p, proxies: arr };
    });
  };

  const submit = async () => {
    if (!form.name.trim()) { showToast('Укажите имя группы', 'warning'); return; }
    const existingList = existingGroups
      ? existingGroups.map(g => g.name)
      : (existingNames || []);
    if (!isEdit && existingList.includes(form.name)) {
      showToast('Группа с таким именем уже существует', 'warning');
      return;
    }
    if (form.proxies.length + form.use.length === 0) {
      showToast('Добавьте хотя бы один прокси или подписку', 'warning');
      return;
    }

    // Защита от потери fallback в routing-группе
    if (!isChannelKind) {
      const hasFallback = form.proxies.includes('DIRECT') || form.proxies.includes('REJECT');
      if (!hasFallback) {
        const ok = confirm(
          `⚠️ Внимание!\n\nГруппа "${form.name}" — routing-группа, но в ней НЕТ DIRECT или REJECT.\n\n` +
          `Если все прокси-каналы упадут, трафик не сможет пойти напрямую — это приведёт к timeout'ам ` +
          `(как у группы Telegram при недоступности EOF).\n\n` +
          `Рекомендуется добавить DIRECT в конец списка как fallback.\n\n` +
          `Сохранить без DIRECT/REJECT?`
        );
        if (!ok) return;
      }
    }

    // серверы из подписок нельзя класть в proxies (Mihomo упадёт:
    // 'not found'). Их надо перевести в use:[provider] + filter:"regex имён".
    // Разделяем form.proxies на настоящие прокси/группы и серверы-из-подписок.
    const provProxies = available.provider_proxies || {};
    const serverToProvider = {};  // имя сервера → провайдер
    Object.entries(provProxies).forEach(([prov, names]) => {
      names.forEach(n => { serverToProvider[n] = prov; });
    });
    const realProxies = [];           // статические прокси и группы — в proxies
    const usedProviders = new Set(form.use);  // подписки целиком
    const filterNames = [];           // имена серверов для regex-фильтра
    form.proxies.forEach(p => {
      if (serverToProvider[p]) {
        usedProviders.add(serverToProvider[p]);
        filterNames.push(p);
      } else {
        realProxies.push(p);
      }
    });
    // Экранируем regex-спецсимволы в именах серверов, объединяем через |
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filterStr = filterNames.length
      ? filterNames.map(escapeRe).join('|')
      : null;

    const payload = {
      name: form.name.trim(),
      type: 'select',  // всегда select; авто — через умный автовыбор панели
      proxies: realProxies.length ? realProxies : null,
      use: usedProviders.size ? Array.from(usedProviders) : null,
      filter: filterStr || '',  // пустая строка → backend удалит старый filter
    };

    try {
      setSaving(true);
      const gname = form.name.trim();
      if (isEdit) {
        await api.put(`/api/mihomo/proxy-groups/${encodeURIComponent(initial.name)}`, payload);
        showToast(`✓ ${form.name} обновлена`, 'success');
      } else {
        await api.post('/api/mihomo/proxy-groups', payload);
        showToast(`✓ ${form.name} создана`, 'success');
      }
      onSaved();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const presetEmojis = ['🌐', '✈️', '💚', '🇺🇸', '🇪🇺', '🇷🇺', '🇩🇪', '🇫🇮', '🇳🇱', '🇫🇷', '🤖', '🎮', '📺', '🛡️', '⚡', '🎯', '📡', '🔒'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        {saving && (
          <div className="modal-saving-overlay">
            <div className="spinner"></div>
            <div className="modal-saving-text">Сохранение и перезагрузка Mihomo...</div>
          </div>
        )}
        <div className="modal-title">
          {isEdit ? `✏️ Редактирование «${initial.name}»` : '➕ Новая группа'}
        </div>

        {!isEdit && (
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Что создаём?</label>
            <div className="kind-options">
              <div className={`kind-option ${kind === 'routing' ? 'active' : ''}`}
                   onClick={() => setKind('routing')}>
                <div className="kind-option-header">
                  <span className="kind-option-icon">🎯</span>
                  <strong>Маршрутизация</strong>
                </div>
                <div className="kind-option-desc">
                  Управляет трафиком: «Telegram → одна группа», «весь остальной → другая».
                  Содержит ДРУГИЕ группы или DIRECT/REJECT. Используется в <code>rules:</code>.
                </div>
                <div className="kind-option-example">
                  Пример: <em>🌐 Основной трафик, ✈️ Telegram, 🖥️ Серверный</em>
                </div>
              </div>

              <div className={`kind-option ${kind === 'channel' ? 'active' : ''}`}
                   onClick={() => setKind('channel')}>
                <div className="kind-option-header">
                  <span className="kind-option-icon">🔒</span>
                  <strong>Канал (пул серверов)</strong>
                </div>
                <div className="kind-option-desc">
                  Пул серверов одного протокола: AWG, TrustTunnel, VLESS, HY2 и т.п.
                  Содержит конкретные прокси или подписки <code>use:</code>.
                </div>
                <div className="kind-option-example">
                  Пример: <em>🔒 AWG Tunnel, 🔒 EOF [Hysteria-2], 🔒 EOF [TrustTunnel]</em>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Левая колонка: настройки группы */}
          <div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" {...f('name')} disabled={isEdit}
                     placeholder="🌐 Основной трафик" autoFocus />
              {!isEdit && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {presetEmojis.map(em => (
                    <button key={em} type="button" className="emoji-pick"
                            onClick={() => setForm(p => ({
                              ...p,
                              name: em + (p.name && !p.name.startsWith(em) ? ' ' + p.name.replace(/^[\p{Emoji}\s]+/u, '') : ' ')
                            }))}>{em}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Выбранные элементы */}
            <div className="form-group">
              <label className="form-label">
                В группе: {form.proxies.length + form.use.length}
              </label>
              <div className="selected-list">
                {form.proxies.length === 0 && form.use.length === 0 && (
                  <div className="text-muted" style={{ fontSize: 11, padding: 12, textAlign: 'center' }}>
                    Кликни справа чтобы добавить
                  </div>
                )}
                {form.proxies.map((p, i) => (
                  <div key={'p:' + p} className="selected-item"
                       draggable
                       onDragStart={onMemDragStart(i)}
                       onDragOver={onMemDragOver(i)}
                       onDragLeave={onMemDragLeave}
                       onDrop={onMemDrop(i)}
                       style={{
                         opacity: memDragSrc === i ? 0.4 : 1,
                         borderTop: memDragOver === i && memDragSrc !== null && memDragSrc !== i
                           ? '2px solid var(--accent, #3b82f6)' : undefined,
                         cursor: 'grab',
                       }}>
                    <span className="selected-idx" title="Перетащи чтобы изменить порядок">{i + 1}</span>
                    <span className="selected-name">{p}</span>
                    <button onClick={() => moveMember(p, -1)} disabled={i === 0}
                            className="btn btn-sm btn-icon" title="Вверх">↑</button>
                    <button onClick={() => moveMember(p, 1)} disabled={i === form.proxies.length - 1}
                            className="btn btn-sm btn-icon" title="Вниз">↓</button>
                    <button onClick={() => toggleMember(p)} className="btn btn-sm btn-icon"
                            style={{ color: 'var(--error)' }}>×</button>
                  </div>
                ))}
                {form.use.map(u => (
                  <div key={'u:' + u} className="selected-item provider">
                    <span className="selected-idx">📡</span>
                    <span className="selected-name">{u}</span>
                    <button onClick={() => toggleProvider(u)} className="btn btn-sm btn-icon"
                            style={{ color: 'var(--error)' }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Правая колонка: доступные элементы */}
          <div>
            <div className="form-group">
              <label className="form-label">
                {isChannelKind ? 'Доступные прокси и серверы' : 'Доступные группы и DIRECT/REJECT'}
              </label>
              <input className="form-input" placeholder="🔍 Поиск..." value={search}
                     onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />

              <div className="available-list">
                {filtered.map(item => {
                  const selected = form.proxies.includes(item.name);
                  return (
                    <div key={'a:' + item.name}
                         className={`available-item ${selected ? 'selected' : ''} ${item.kind}`}
                         onClick={() => toggleMember(item.name)}>
                      <span className="kind-marker">
                        {item.kind === 'special' ? '⚙️'
                         : item.kind === 'channel-group' ? '🔒'
                         : item.kind === 'group' ? '🎯'
                         : '🔌'}
                      </span>
                      <span style={{ flex: 1 }}>{item.name}</span>
                      <span className={`add-mark ${selected ? 'remove' : ''}`}>
                        {selected ? '✓' : '+'}
                      </span>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-muted" style={{ fontSize: 11, padding: 12, textAlign: 'center' }}>
                    {search ? 'Ничего не найдено' : 'Список пуст'}
                  </div>
                )}
              </div>
            </div>

            {allProviders.length > 0 && (
              <div className="form-group">
                <label className="form-label">Подписки (use)</label>
                <div className="available-list">
                  {allProviders.map(p => {
                    const selected = form.use.includes(p);
                    return (
                      <div key={'pp:' + p} className={`available-item provider ${selected ? 'selected' : ''}`}
                           onClick={() => toggleProvider(p)}>
                        <span className="kind-marker">📡</span>
                        <span style={{ flex: 1 }}>{p}</span>
                        <span className={`add-mark ${selected ? 'remove' : ''}`}>
                          {selected ? '✓' : '+'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isChannelKind && available.provider_proxies
              && Object.keys(available.provider_proxies).length > 0 && (
              <div className="form-group">
                <label className="form-label">Отдельные серверы из подписок</label>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 6 }}>
                  Конкретный сервер (Vless/Hy2/...) из подписки — добавится в канал
                  отдельно, без всей подписки.
                </div>
                <input className="form-input" value={srvSearch}
                       onChange={e => setSrvSearch(e.target.value)}
                       placeholder="🔍 Поиск сервера по имени..."
                       style={{ marginBottom: 8, fontSize: 12 }} />
                <div className="available-list" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {Object.entries(available.provider_proxies).map(([prov, names]) => {
                    const q = srvSearch.trim().toLowerCase();
                    const matched = q ? names.filter(n => n.toLowerCase().includes(q)) : names;
                    if (q && matched.length === 0) return null;  // скрыть провайдера без совпадений
                    // При активном поиске — раскрываем автоматически; иначе по клику
                    const isOpen = q ? true : !!openProvs[prov];
                    const selCount = names.filter(n => form.proxies.includes(n)).length;
                    return (
                      <div key={'grp:' + prov} style={{ borderBottom: '1px solid var(--border)' }}>
                        <div onClick={() => !q && toggleProv(prov)}
                             style={{ display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '8px 6px', cursor: q ? 'default' : 'pointer',
                                      fontSize: 12, fontWeight: 600 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-3)',
                                         transform: isOpen ? 'rotate(90deg)' : 'none',
                                         transition: 'transform .15s' }}>▶</span>
                          <span className="kind-marker">📡</span>
                          <span style={{ flex: 1 }}>{prov}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>
                            {selCount > 0 && <span style={{ color: 'var(--accent)' }}>{selCount} выбр. · </span>}
                            {matched.length} серв.
                          </span>
                        </div>
                        {isOpen && matched.map(pn => {
                          const selected = form.proxies.includes(pn);
                          return (
                            <div key={'ps:' + pn} className={`available-item ${selected ? 'selected' : ''}`}
                                 onClick={() => toggleMember(pn)} style={{ paddingLeft: 28 }}>
                              <span className="kind-marker">🔹</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                             whiteSpace: 'nowrap' }}>{pn}</span>
                              <span className={`add-mark ${selected ? 'remove' : ''}`}>
                                {selected ? '✓' : '+'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn btn-primary" onClick={submit}
                  disabled={saving || !form.name.trim() || (form.proxies.length + form.use.length === 0)}>
            {saving ? <><Icon name="refresh" size={12} className="spin" /> Сохранение...</> : (isEdit ? 'Сохранить' : 'Создать группу')}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// MIHOMO UPDATER
// =========================================================
function MihomoUpdater() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  // кастомный URL и upload файла
  const [customUrl, setCustomUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Быстрая загрузка — только локальная версия, без GitHub
  const loadVersion = async () => {
    try {
      setInfo(await api.get('/api/mihomo/version'));
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Проверка обновлений (медленно — идёт в GitHub)
  const checkUpdates = async () => {
    setChecking(true);
    try {
      setInfo(await api.get('/api/mihomo/version?check=true'));
    } catch (e) { showToast(e.message, 'error'); }
    finally { setChecking(false); }
  };

  useEffect(() => { loadVersion(); }, []);

  // Poll статуса при обновлении
  useEffect(() => {
    if (!updating) return;
    const poll = async () => {
      try {
        const s = await api.get('/api/mihomo/update/status');
        setStatus(s);
        if (!s.running) {
          setUpdating(false);
          if (s.error) showToast(`Ошибка: ${s.error.slice(0, 100)}`, 'error');
          else showToast(`✓ Mihomo обновлён${s.result?.new_version ? ` до v${s.result.new_version}` : ''}`, 'success');
          setTimeout(loadVersion, 1000);
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 1500);
    poll();
    return () => clearInterval(pollRef.current);
  }, [updating]);

  const startUpdate = async () => {
    const action = info.downgrade_to_stable
      ? `Перейти со сборки "${info.current}" на стабильную v${info.latest}?`
      : `Обновить Mihomo с v${info.current} до v${info.latest}?`;
    if (!confirm(`${action}\n\nMihomo будет ненадолго остановлен. В случае ошибки автоматически произойдёт откат.`)) return;
    try {
      await api.post('/api/mihomo/update');
      setUpdating(true);
      setStatus({ running: true, step: 'Запуск...', progress: 5 });
    } catch (e) { showToast(e.message, 'error'); }
  };

  // обновление с произвольного URL
  const startUpdateFromUrl = async () => {
    const url = customUrl.trim();
    if (!url) { showToast('Введи URL', 'warning'); return; }
    if (!confirm(`Скачать и установить Mihomo с этого URL?\n\n${url}\n\nMihomo будет ненадолго остановлен. В случае ошибки автоматически произойдёт откат.`)) return;
    try {
      await api.post('/api/mihomo/update-from-url', { url });
      setUpdating(true);
      setStatus({ running: true, step: 'Запуск...', progress: 5 });
      setCustomUrl('');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // обновление из загруженного файла
  const startUpdateFromFile = async (file) => {
    if (!file) return;
    if (file.size < 1024 * 1024) {
      showToast(`Файл слишком маленький (${file.size} байт). Ожидается .gz или ELF binary.`, 'warning');
      return;
    }
    if (!confirm(`Загрузить и установить Mihomo из файла "${file.name}" (${(file.size/1024/1024).toFixed(1)} MB)?\n\nMihomo будет ненадолго остановлен. В случае ошибки автоматически произойдёт откат.`)) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(api.base + '/api/mihomo/update-from-file', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('mp_token') || '') },
        body: fd,
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `HTTP ${r.status}`);
      }
      setUpdating(true);
      setStatus({ running: true, step: 'Загрузка...', progress: 10 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!info) return <div className="empty-state">Не удалось получить информацию</div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="arrowUp" size={14} /> Mihomo Core</div>
            <div className="card-subtitle">Обновление proxy core с GitHub releases</div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={checkUpdates} disabled={checking || updating}>
            {checking ? '⏳ Проверка...' : '🔍 Проверить обновления'}
          </button>
        </div>

        <div className="row">
          <span className="row-label">Бинарь</span>
          <span className="text-mono" style={{ fontSize: 11 }}>{info.binary_path}</span>
        </div>
        <div className="row">
          <span className="row-label">Архитектура</span>
          <span className="text-mono">{info.arch}</span>
        </div>
        <div className="row">
          <span className="row-label">Текущая версия</span>
          <span>
            {info.current
              ? <>
                  <span className="text-mono" style={{ fontSize: 14, fontWeight: 700 }}>
                    {info.current.match(/^\d/) ? `v${info.current}` : info.current}
                  </span>
                  {info.channel === 'prerelease' && (
                    <span className="badge badge-warning" style={{ marginLeft: 8 }}
                          title="Pre-release сборка (alpha/beta/dev)">
                      ⚠ {info.current.split('-')[0]}
                    </span>
                  )}
                  {info.channel === 'stable' && (
                    <span className="badge badge-success" style={{ marginLeft: 8 }}>
                      stable
                    </span>
                  )}
                </>
              : <span className="badge badge-error">не определено</span>}
          </span>
        </div>
        <div className="row">
          <span className="row-label">Последняя стабильная</span>
          <span>
            {info.latest
              ? <span className="text-mono" style={{ fontSize: 14, fontWeight: 700,
                       color: info.update_available ? 'var(--success)' : 'var(--text-2)' }}>
                  v{info.latest}
                </span>
              : info.checked
                ? <span className="text-muted">—</span>
                : <span className="text-muted" style={{ fontSize: 11 }}>
                    нажмите «🔍 Проверить обновления»
                  </span>}
            {info.release_notes_url && (
              <a href={info.release_notes_url} target="_blank" rel="noopener"
                 style={{ marginLeft: 10, fontSize: 11, color: 'var(--accent)' }}>
                📝 Release notes ↗
              </a>
            )}
          </span>
        </div>
        {info.latest_published && (
          <div className="row">
            <span className="row-label">Дата релиза</span>
            <span style={{ fontSize: 12 }}>
              {new Date(info.latest_published).toLocaleDateString('ru-RU', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </span>
          </div>
        )}
        {info.error && (
          <div className="row">
            <span className="row-label">⚠ Ошибка</span>
            <span style={{ color: 'var(--warning)', fontSize: 11 }}>{info.error}</span>
          </div>
        )}

        {info.note && (
          <div style={{
            marginTop: 12, padding: 10,
            background: 'rgba(234,179,8,.08)',
            border: '1px solid var(--warning)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text)'
          }}>
            ⚠️ {info.note}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {!info.update_available && info.current && info.latest && (
            <span className="badge badge-success" style={{ alignSelf: 'center', padding: '6px 12px' }}>
              ✓ Установлена последняя версия
            </span>
          )}
          {info.update_available && (
            <button className="btn btn-primary" onClick={startUpdate} disabled={updating || !info.latest_url}>
              {updating
                ? '⏳ Обновление...'
                : (info.downgrade_to_stable
                    ? `🔄 Перейти на stable v${info.latest}`
                    : `⬆️ Обновить до v${info.latest}`)}
            </button>
          )}
        </div>

        {/* Прогресс обновления */}
        {(updating || status) && status && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg)',
                         borderRadius: 8, border: '1px solid var(--border)' }}>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>{status.step}</strong>
              {status.running && <span className="text-mono" style={{ fontSize: 11 }}>{status.progress}%</span>}
            </div>
            <div className="progress-bar-container" style={{ marginBottom: 0 }}>
              <div className="progress-bar"
                   style={{
                     width: `${status.progress}%`,
                     background: status.error ? 'var(--error)'
                                : (status.progress === 100 ? 'var(--success)' : undefined)
                   }}></div>
            </div>
            {status.backup && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                Backup: <code>{status.backup}</code>
              </div>
            )}
          </div>
        )}
      </div>

      <Collapsible title="ℹ️ Как это работает">
        <ol style={{ padding: '4px 0 0 20px', lineHeight: 1.8, margin: 0 }}>
          <li>Скачивается <code>{info.latest_asset_name || `mihomo-${info.arch}-vX.Y.Z.gz`}</code> с GitHub</li>
          <li>Распаковывается во временный файл</li>
          <li>Проверяется работоспособность через <code>mihomo -v</code></li>
          <li>Текущий бинарь сохраняется как <code>{info.binary_path}.bak.YYYYMMDD_HHMMSS</code></li>
          <li>Mihomo останавливается → бинарь заменяется → запускается обратно</li>
          <li>Если запуск не удался — автоматический откат из backup</li>
        </ol>
      </Collapsible>

      {/* ручное обновление — свёрнуто, нужно редко */}
      <Collapsible title="🛠 Ручное обновление (URL или файл)" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
          Если auto-update не находит релиз (новая схема имён, прокси блокирует github, форк) —
          скачай бинарь руками или укажи URL.
        </div>

        <div>
          <label className="form-label">URL архива .gz или ELF binary</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 1 }}
                   placeholder="https://github.com/MetaCubeX/mihomo/releases/download/v1.19.25/mihomo-linux-amd64-v1-v1.19.25.gz"
                   value={customUrl}
                   onChange={e => setCustomUrl(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && startUpdateFromUrl()} />
            <button className="btn btn-primary" onClick={startUpdateFromUrl}
                    disabled={!customUrl.trim() || updating || uploading}>
              ⬇️ Скачать и установить
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            .gz архив или сырой ELF binary. Прямые ссылки: <code>v1</code> (любой amd64),
            <code>v2</code> (SSE4), <code>v3</code> (AVX2). Не знаешь — бери <code>v1</code>.
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label className="form-label">Загрузить файл с компьютера</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="file" ref={fileInputRef}
                   accept=".gz,application/gzip,application/x-gzip,application/octet-stream"
                   onChange={e => startUpdateFromFile(e.target.files?.[0])}
                   disabled={updating || uploading}
                   style={{ flex: 1 }} />
            {uploading && <span style={{ fontSize: 12, opacity: 0.7 }}>📤 Загрузка...</span>}
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            Скачай .gz или распакованный бинарь с github руками, выбери его здесь.
          </div>
        </div>
      </Collapsible>

      <GeoUpdater />

      <PanelUpdater />
    </div>
  );
}

// =========================================================
// GEO DATABASES UPDATER (v2.206)
// =========================================================
function GeoUpdater() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  const load = async () => {
    try { setInfo(await api.get('/api/mihomo/geo/info')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!updating) return;
    const poll = async () => {
      try {
        const s = await api.get('/api/mihomo/geo/update/status');
        setStatus(s);
        if (!s.running) {
          setUpdating(false);
          if (s.error) showToast(`Ошибка: ${s.error.slice(0, 100)}`, 'error');
          else showToast(`✓ Geo базы обновлены`, 'success');
          setTimeout(load, 1000);
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 1000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [updating]);

  const start = async () => {
    if (!confirm('Скачать свежие geosite.dat / geoip.dat / Country.mmdb с github MetaCubeX/meta-rules-dat?\n\nMihomo перезапускать не нужно — базы перечитываются автоматически при следующем reload.')) return;
    try {
      await api.post('/api/mihomo/geo/update');
      setUpdating(true);
      setStatus({ running: true, step: 'Запуск...', progress: 5 });
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!info) return null;

  const fmtAge = (mtime) => {
    if (!mtime) return '—';
    const ageSec = Math.floor(Date.now() / 1000) - mtime;
    const ageDays = Math.floor(ageSec / 86400);
    const ageHours = Math.floor(ageSec / 3600);
    if (ageDays > 1) return `${ageDays} дн. назад`;
    if (ageHours > 1) return `${ageHours} ч. назад`;
    return `${Math.floor(ageSec / 60)} мин. назад`;
  };

  const fmtDate = (mtime) => mtime ? new Date(mtime * 1000).toLocaleString() : '—';

  // Если хотя бы один файл старше 14 дней — рекомендуем обновить
  const ageThresholdSec = 14 * 86400;
  const now = Math.floor(Date.now() / 1000);
  const oldFile = info.files.find(f => f.exists && f.mtime && (now - f.mtime) > ageThresholdSec);
  const missingFile = info.files.find(f => !f.exists);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title"><Icon name="database" size={14} /> Geo databases</div>
          <div className="card-subtitle">{info.source}</div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={start} disabled={updating}>
          {updating ? '⏳ Обновление...' : '⬇️ Обновить базы'}
        </button>
      </div>

      <table style={{ width: '100%', marginTop: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ opacity: 0.65, fontSize: 11 }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Файл</th>
            <th style={{ padding: '4px 8px' }}>Размер</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Возраст</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Изменён</th>
          </tr>
        </thead>
        <tbody>
          {info.files.map(f => {
            const isOld = f.exists && f.mtime && (now - f.mtime) > ageThresholdSec;
            return (
              <tr key={f.name} style={{ borderTop: '1px solid rgba(115,115,115,0.15)' }}>
                <td style={{ padding: '8px', fontFamily: 'monospace' }}>{f.name}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  {f.exists ? `${f.size_mb} MB` : <span className="badge badge-danger">нет</span>}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: isOld ? 'var(--warning)' : undefined }}>
                  {f.exists ? fmtAge(f.mtime) : '—'}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontSize: 11, opacity: 0.7 }}>
                  {fmtDate(f.mtime)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {missingFile && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'rgba(239,68,68,.08)',
          border: '1px solid var(--error)',
          borderRadius: 6, fontSize: 12,
        }}>
          ⚠️ Отсутствуют некоторые geo-базы. Нажми «Обновить» чтобы их скачать.
        </div>
      )}

      {!missingFile && oldFile && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'rgba(234,179,8,.08)',
          border: '1px solid var(--warning)',
          borderRadius: 6, fontSize: 12,
        }}>
          💡 Базы старше 14 дней. Рекомендуется обновить для актуальных GEOSITE правил.
        </div>
      )}

      {/* Прогресс */}
      {(updating || status) && status && (
        <div style={{ marginTop: 16, padding: 14, background: 'var(--bg)',
                      borderRadius: 8, border: '1px solid var(--border)' }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>{status.step}</strong>
            {status.running && <span className="text-mono" style={{ fontSize: 11 }}>{status.progress}%</span>}
          </div>
          <div className="progress-bar-container" style={{ marginBottom: 0 }}>
            <div className="progress-bar"
                 style={{
                   width: `${status.progress}%`,
                   background: status.error ? 'var(--error)'
                              : (status.progress === 100 ? 'var(--success)' : undefined)
                 }}></div>
          </div>
          {status.result?.files && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
              Обновлено: {status.result.files.map(f => `${f.name} (${f.size_mb} MB)`).join(', ')}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, opacity: 0.6 }}>
        💡 Geo-базы определяют правила GEOSITE (например <code>facebook</code>, <code>openai</code>,
        <code>category-ru</code>). После обновления Mihomo сам перечитает их при следующем reload —
        перезапускать сервис не нужно.
      </div>
    </div>
  );
}

// =========================================================
// PANEL SELF-UPDATER (обновление самой панели через архив или GitHub)
// =========================================================
function PanelUpdater() {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  // Быстрая загрузка — без проверки GitHub
  const load = async () => {
    try { setInfo(await api.get('/api/panel/version')); }
    catch (e) { showToast(e.message, 'error'); }
  };
  // Полная проверка с GitHub (по кнопке)
  const checkUpdates = async () => {
    setChecking(true);
    try { setInfo(await api.get('/api/panel/version?check=true')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setChecking(false); }
  };
  useEffect(() => { load(); }, []);

  // Poll статуса при обновлении
  useEffect(() => {
    if (!updating) return;
    const poll = async () => {
      try {
        const s = await api.get('/api/panel/update/status');
        setStatus(s);
        if (!s.running) {
          setUpdating(false);
          if (s.error) showToast(`Ошибка: ${s.error.slice(0, 100)}`, 'error');
          else {
            showToast('✓ Vemitreya обновлена. Сервис перезапускается...', 'success');
            setTimeout(() => window.location.reload(), 4000);
          }
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 1500);
    poll();
    return () => clearInterval(pollRef.current);
  }, [updating]);

  const uploadZip = async (file) => {
    if (!file) return;
    if (!confirm(`Установить обновление из "${file.name}" (${(file.size / 1024).toFixed(0)} KB)?\n\nПанель будет перезагружена.`)) return;
    const fd = new FormData();
    fd.append('file', file);
    setUpdating(true);
    setStatus({ running: true, step: 'Загрузка...', progress: 5 });
    try {
      const r = await fetch('/api/panel/update/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}` },
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `HTTP ${r.status}`);
      }
    } catch (e) {
      setUpdating(false);
      showToast(e.message, 'error');
    }
  };

  const updateFromGithub = async () => {
    if (!confirm(`Обновить Vemitreya до v${info.latest} с GitHub?`)) return;
    try {
      await api.post('/api/panel/update/from-github');
      setUpdating(true);
      setStatus({ running: true, step: 'Скачивание...', progress: 5 });
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (!info) return null;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">🎨 Vemitreya панель</div>
          <div className="card-subtitle">Обновление самой панели управления</div>
        </div>
        {info.github_repo && (
          <button className="btn btn-sm btn-primary" onClick={checkUpdates} disabled={checking || updating}>
            {checking ? '⏳ Проверка...' : '🔍 Проверить обновления'}
          </button>
        )}
      </div>

      <div className="row">
        <span className="row-label">Текущая версия</span>
        <span className="text-mono" style={{ fontSize: 14, fontWeight: 700 }}>v{info.current}</span>
      </div>
      <div className="row">
        <span className="row-label">Расположение</span>
        <span className="text-mono" style={{ fontSize: 11 }}>{info.install_dir}</span>
      </div>
      {info.github_repo ? (
        <>
          <div className="row">
            <span className="row-label">GitHub репо</span>
            <span className="text-mono" style={{ fontSize: 11 }}>{info.github_repo}</span>
          </div>
          <div className="row">
            <span className="row-label">Последняя версия</span>
            <span>
              {info.latest
                ? <span className="text-mono" style={{ fontSize: 14, fontWeight: 700,
                         color: info.update_available ? 'var(--success)' : 'var(--text-2)' }}>
                    v{info.latest}
                  </span>
                : info.checked
                  ? <span className="text-muted">—</span>
                  : <span className="text-muted" style={{ fontSize: 11 }}>
                      нажмите «🔍 Проверить обновления»
                    </span>}
              {info.release_notes_url && (
                <a href={info.release_notes_url} target="_blank" rel="noopener"
                   style={{ marginLeft: 10, fontSize: 11, color: 'var(--accent)' }}>
                  📝 Release notes ↗
                </a>
              )}
            </span>
          </div>
          {info.error && (
            <div className="row">
              <span className="row-label">⚠ Ошибка</span>
              <span style={{ color: 'var(--warning)', fontSize: 11 }}>{info.error}</span>
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg)',
                       border: '1px dashed var(--border)', borderRadius: 6,
                       fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {info.note}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        {info.update_available && (
          <button className="btn btn-primary" onClick={updateFromGithub} disabled={updating}>
            {updating ? '⏳ Обновление...' : `⬆️ Обновить до v${info.latest}`}
          </button>
        )}

        {/* Загрузка архива */}
        <input type="file" ref={fileRef} accept=".zip" style={{ display: 'none' }}
               onChange={e => uploadZip(e.target.files?.[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={updating}>
          📦 Загрузить .zip архив
        </button>
      </div>

      {/* Прогресс */}
      {(updating || status) && status && (
        <div style={{ marginTop: 16, padding: 14, background: 'var(--bg)',
                       borderRadius: 8, border: '1px solid var(--border)' }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>{status.step}</strong>
            {status.running && <span className="text-mono" style={{ fontSize: 11 }}>{status.progress}%</span>}
          </div>
          <div className="progress-bar-container" style={{ marginBottom: 0 }}>
            <div className="progress-bar"
                 style={{
                   width: `${status.progress}%`,
                   background: status.error ? 'var(--error)'
                              : (status.progress === 100 ? 'var(--success)' : undefined)
                 }}></div>
          </div>
          {status.backup_dir && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
              Backup: <code>{status.backup_dir}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =========================================================
// BACKUP / RESTORE — экспорт и импорт конфигурации
// =========================================================
function BackupRestore() {
  const [exportType, setExportType] = useState('full');
  const [exporting, setExporting] = useState(false);

  const [stage, setStage] = useState('idle'); // idle | uploading | preview | applying | done
  const [preview, setPreview] = useState(null);
  const [importOpts, setImportOpts] = useState({
    do_backup: true,
    awg_mode: 'merge',
    tt_mode: 'merge',
    rules_mode: 'merge',
    apply_full_config: false,
    apply_providers: false,
  });
  const [applyResult, setApplyResult] = useState(null);

  const doExport = async () => {
    setExporting(true);
    try {
      const url = `${api.base}/api/config/export?type=${exportType}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${api.token}` }});
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status}: ${t}`);
      }
      const blob = await r.blob();
      // достаём имя файла из заголовка
      const cd = r.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const fname = m ? m[1] : `vemitreya-${exportType}-${Date.now()}.tar.gz`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fname;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast(`Экспортировано: ${fname}`, 'success');
    } catch (e) {
      showToast('Ошибка экспорта: ' + e.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage('uploading');
    setApplyResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${api.base}/api/config/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}` },
        body: fd
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try { msg = JSON.parse(t).detail || t; } catch {}
        throw new Error(msg);
      }
      const data = await r.json();
      setPreview(data);
      // Авто-настройка опций по содержимому
      setImportOpts(prev => ({
        ...prev,
        apply_full_config: data.items.has_full_config,
        apply_providers: (data.items.providers || []).length > 0,
      }));
      setStage('preview');
    } catch (e) {
      showToast('Ошибка: ' + e.message, 'error');
      setStage('idle');
    }
  };

  const cancelImport = async () => {
    if (preview?.staging_id) {
      try {
        await api.del(`/api/config/import/staging/${preview.staging_id}`);
      } catch {}
    }
    setPreview(null);
    setStage('idle');
  };

  const applyImport = async () => {
    if (!preview?.staging_id) return;
    if (!confirm('Применить импорт? Текущая конфигурация будет изменена.')) return;
    setStage('applying');
    try {
      const r = await api.post('/api/config/import/apply', {
        staging_id: preview.staging_id,
        ...importOpts
      });
      setApplyResult(r);
      setStage('done');
      showToast('Импорт применён', 'success');
    } catch (e) {
      showToast('Ошибка применения: ' + e.message, 'error');
      setStage('preview');
    }
  };

  return (
    <div>
      {/* === ЭКСПОРТ === */}
      <div className="card">
        <div className="card-title">
          <Icon name="upload" size={14} /> Экспорт конфигурации
        </div>
        <div className="card-subtitle">
          Скачать архив с настройками этой инсталляции для бэкапа или переноса на другую VM.
        </div>

        <div className="settings-radio-grid" style={{ marginTop: 14 }}>
          <label className={`settings-radio ${exportType === 'full' ? 'active' : ''}`}>
            <input type="radio" name="exptype" value="full"
                   checked={exportType === 'full'}
                   onChange={() => setExportType('full')} />
            <span className="settings-radio-label">Полная</span>
          </label>
          <label className={`settings-radio ${exportType === 'tunnels' ? 'active' : ''}`}>
            <input type="radio" name="exptype" value="tunnels"
                   checked={exportType === 'tunnels'}
                   onChange={() => setExportType('tunnels')} />
            <span className="settings-radio-label">Только туннели</span>
          </label>
          <label className={`settings-radio ${exportType === 'rules' ? 'active' : ''}`}>
            <input type="radio" name="exptype" value="rules"
                   checked={exportType === 'rules'}
                   onChange={() => setExportType('rules')} />
            <span className="settings-radio-label">Только правила</span>
          </label>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 12, lineHeight: 1.6 }}>
          {exportType === 'full' && (
            <>Включает: <strong>config.yaml</strong> (proxies, groups, rules) +
            подписки <strong>providers/*.yaml</strong> + все <strong>AWG</strong> и
            <strong>TrustTunnel</strong> конфиги.</>
          )}
          {exportType === 'tunnels' && (
            <>Только конфиги туннелей: <strong>AWG</strong> (.conf) и <strong>TrustTunnel</strong> (.toml).
            Без mihomo конфига и подписок.</>
          )}
          {exportType === 'rules' && (
            <>Только секция <code>rules:</code> из config.yaml. Можно слиться с правилами на другой VM.</>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={doExport} disabled={exporting}>
            {exporting
              ? <><Icon name="refresh" size={12} className="spin" /> Экспорт...</>
              : <><Icon name="download" size={12} /> Скачать архив</>}
          </button>
        </div>
      </div>

      {/* === ИМПОРТ === */}
      <div className="card">
        <div className="card-title">
          <Icon name="download" size={14} /> Импорт конфигурации
        </div>
        <div className="card-subtitle">
          Загрузите архив <code>.tar.gz</code> от другой инсталляции Vemitreya. Сначала покажем diff,
          затем спросим подтверждение.
        </div>

        {stage === 'idle' && (
          <div style={{ marginTop: 14 }}>
            <input id="importfile" type="file" accept=".tar.gz,.tgz"
                   onChange={handleFileSelect}
                   style={{ display: 'none' }} />
            <label htmlFor="importfile" className="btn btn-primary"
                   style={{ cursor: 'pointer', display: 'inline-flex' }}>
              <Icon name="upload" size={12} /> Выбрать архив
            </label>
          </div>
        )}

        {stage === 'uploading' && (
          <div className="empty-state" style={{ marginTop: 14 }}>
            <Icon name="refresh" size={24} className="spin muted-icon" />
            Загрузка и анализ...
          </div>
        )}

        {stage === 'preview' && preview && (
          <div style={{ marginTop: 14 }}>
            <div style={{
              padding: '12px 14px',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 14,
              lineHeight: 1.7
            }}>
              <strong><Icon name="check" size={12} /> Манифест архива</strong>
              <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
                Тип: <strong style={{ color: 'var(--text)' }}>{preview.manifest.type}</strong>
                {' · '}Источник: <strong style={{ color: 'var(--text)' }}>{preview.manifest.source_host}</strong>
                {' · '}Дата: {new Date(preview.manifest.exported_at).toLocaleString()}
                {' · '}Vemitreya v{preview.manifest.version}
              </div>
            </div>

            {/* AWG */}
            {preview.items.awg.length > 0 && (
              <div className="form-group">
                <label className="form-label">
                  <Icon name="shield" size={12} /> AWG туннели в архиве: {preview.items.awg.length}
                </label>
                <ul style={{ fontSize: 12, paddingLeft: 18, color: 'var(--text-2)', marginBottom: 8 }}>
                  {preview.items.awg.map(a => (
                    <li key={a.name}>
                      <code>{a.name}</code>
                      {a.exists && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>
                        (уже существует)</span>}
                    </li>
                  ))}
                </ul>
                <select className="form-select" value={importOpts.awg_mode}
                        onChange={e => setImportOpts(o => ({...o, awg_mode: e.target.value}))}>
                  <option value="merge">Слияние: добавить новые, дубликаты перезаписать</option>
                  <option value="skip_existing">Пропустить уже существующие</option>
                  <option value="replace">Полная замена: удалить все старые, импортировать новые</option>
                </select>
              </div>
            )}

            {/* TT */}
            {preview.items.tt.length > 0 && (
              <div className="form-group">
                <label className="form-label">
                  <Icon name="route" size={12} /> TrustTunnel в архиве: {preview.items.tt.length}
                </label>
                <ul style={{ fontSize: 12, paddingLeft: 18, color: 'var(--text-2)', marginBottom: 8 }}>
                  {preview.items.tt.map(t => (
                    <li key={t.name}>
                      <code>{t.name}</code>
                      {t.exists && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>
                        (уже существует)</span>}
                    </li>
                  ))}
                </ul>
                <select className="form-select" value={importOpts.tt_mode}
                        onChange={e => setImportOpts(o => ({...o, tt_mode: e.target.value}))}>
                  <option value="merge">Слияние: добавить новые, дубликаты перезаписать</option>
                  <option value="skip_existing">Пропустить уже существующие</option>
                  <option value="replace">Полная замена</option>
                </select>
              </div>
            )}

            {/* Rules */}
            {preview.items.has_rules_only && (
              <div className="form-group">
                <label className="form-label">
                  <Icon name="list" size={12} /> Правила Mihomo: {preview.items.new_rules_count} шт
                </label>
                <select className="form-select" value={importOpts.rules_mode}
                        onChange={e => setImportOpts(o => ({...o, rules_mode: e.target.value}))}>
                  <option value="merge">Добавить новые правила (дубликаты пропустить)</option>
                  <option value="replace">Заменить ВСЕ правила импортированными</option>
                </select>
              </div>
            )}

            {/* Full config */}
            {preview.items.has_full_config && (
              <div className="form-group">
                <label style={{ display: 'flex', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={importOpts.apply_full_config}
                         onChange={e => setImportOpts(o => ({...o, apply_full_config: e.target.checked}))} />
                  <div>
                    <strong>Заменить config.yaml целиком</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                      Прокси: {preview.items.new_config_summary?.proxies},
                      группы: {preview.items.new_config_summary?.groups},
                      правила: {preview.items.new_config_summary?.rules}.
                      Заменит весь mihomo конфиг (старый сохранится в backup).
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Providers */}
            {preview.items.providers.length > 0 && (
              <div className="form-group">
                <label style={{ display: 'flex', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={importOpts.apply_providers}
                         onChange={e => setImportOpts(o => ({...o, apply_providers: e.target.checked}))} />
                  <div>
                    <strong>Импортировать подписки ({preview.items.providers.length})</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                      {preview.items.providers.join(', ')}
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Backup */}
            <div className="form-group" style={{
              padding: 10, background: 'var(--bg-3)', borderRadius: 6,
              border: '1px solid var(--border)'
            }}>
              <label style={{ display: 'flex', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={importOpts.do_backup}
                       onChange={e => setImportOpts(o => ({...o, do_backup: e.target.checked}))} />
                <div>
                  <strong><Icon name="shield" size={11} /> Сделать бэкап перед применением</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                    В <code>/opt/vemitreya/backups/import-rollback-*.tar.gz</code>.
                    Рекомендуется оставить включённым.
                  </div>
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={applyImport}>
                <Icon name="check" size={12} /> Применить
              </button>
              <button className="btn" onClick={cancelImport}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {stage === 'applying' && (
          <div className="empty-state" style={{ marginTop: 14 }}>
            <Icon name="refresh" size={24} className="spin muted-icon" />
            Применение изменений...
          </div>
        )}

        {stage === 'done' && applyResult && (
          <div style={{ marginTop: 14 }}>
            <div style={{
              padding: '12px 14px',
              background: 'rgba(34, 197, 94, .08)',
              border: '1px solid rgba(34, 197, 94, .3)',
              borderLeft: '3px solid var(--success)',
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 14
            }}>
              <strong><Icon name="check" size={12} /> Импорт применён успешно</strong>
            </div>
            <div className="form-label">Лог операции:</div>
            <pre style={{
              fontSize: 11, background: 'var(--bg-3)', padding: 12,
              borderRadius: 6, maxHeight: 300, overflow: 'auto',
              fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap'
            }}>{applyResult.log.join('\n')}</pre>
            <button className="btn" onClick={() => { setStage('idle'); setPreview(null); setApplyResult(null); }}
                    style={{ marginTop: 10 }}>
              Готово
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// выпадающее меню экспорта списка для разных устройств.
// Копирование ссылки или скачивание файла прямо из карточки списка.
function ExportMenu({ list }) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const ref = useRef(null);

  const base = (localStorage.getItem('mp_url') || location.origin).replace(/\/$/, '');
  const srvIp = (() => {
    const saved = localStorage.getItem('mp_setup_serverip');
    if (saved) return saved;
    try { return new URL(base).hostname; } catch { return '192.168.1.1'; }
  })();
  const slug = list.name;

  // Закрытие при клике вне меню
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const targets = [
    { key: 'rsc',  label: 'MikroTik',          url: `${base}/rl/${slug}.rsc`, fname: `${slug}.rsc` },
    { key: 'keen', label: 'Keenetic (роутер)',  url: `${base}/rl/${slug}.keenetic?gateway=${srvIp}`, fname: `${slug}.keenetic` },
    { key: 'bat',  label: 'Keenetic/Windows',   url: `${base}/rl/${slug}.bat?gateway=${srvIp}`, fname: `${slug}.bat` },
    { key: 'txt',  label: 'Универсальный',       url: `${base}/rl/${slug}.txt`, fname: `${slug}.txt` },
  ];

  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1500);
  };

  const download = async (url, fname) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast(`Скачан ${fname}`, 'success'); setOpen(false);
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)}>
        📤 Экспорт {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
          background: 'var(--bg-card, var(--bg))', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)', minWidth: 240,
          padding: 6,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                        textTransform: 'uppercase', letterSpacing: '.05em',
                        padding: '6px 8px 4px' }}>
            Экспорт для устройства
          </div>
          {targets.map(t => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 4,
                                       padding: '4px 6px', borderRadius: 6 }}>
              <span style={{ flex: 1, fontSize: 12.5 }}>{t.label}</span>
              <button className={`btn btn-sm ${copiedKey === t.key ? 'btn-success' : ''}`}
                      title="Копировать ссылку"
                      onClick={() => copy(t.key, t.url)}>
                {copiedKey === t.key ? '✓' : '📋'}
              </button>
              <button className="btn btn-sm" title="Скачать файл"
                      onClick={() => download(t.url, t.fname)}>⬇️</button>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', padding: '6px 8px 2px',
                        borderTop: '1px solid var(--border)', marginTop: 4 }}>
            📋 — копировать ссылку для роутера · ⬇️ — скачать файл
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// ROUTER LISTS (v2.206) — списки доменов/IP для MikroTik/Keenetic
// =========================================================
function RouterLists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // объект списка или null
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try { setLists(await api.get('/api/router-lists')); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const del = async (id, name) => {
    if (!confirm(`Удалить список "${name}"?`)) return;
    try { await api.del(`/api/router-lists/${id}`); showToast('Удалён', 'success'); load(); }
    catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (creating) return <RouterListEdit onBack={() => { setCreating(false); load(); }} />;
  if (editing) return <RouterListEdit list={editing} onBack={() => { setEditing(null); load(); }} />;

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <strong style={{ fontSize: 15 }}>Списки для роутеров</strong>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
            Списки доменов/IP которые MikroTik и Keenetic забирают по HTTP. Отдаются в LAN без пароля.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Новый список</button>
      </div>

      {lists.length === 0 ? (
        <InfoBox kind="info" title="Пока нет списков">
          Создайте список, добавьте домены/IP — и роутер сможет забирать его по ссылке вида
          <code> /rl/имя.rsc</code> (MikroTik) или <code>/rl/имя.txt</code> (универсально).
        </InfoBox>
      ) : (
        lists.map(l => (
          <div key={l.id} className="card" style={{ marginBottom: 10 }}>
            <div className="flex-between">
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{l.title || l.name}</strong>
                  <span className="badge badge-info">{l.entry_count} записей</span>
                  <code style={{ fontSize: 11, opacity: .7 }}>/rl/{l.name}</code>
                </div>
                {l.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{l.description}</div>
                )}
              </div>
              <div className="btn-group">
                <ExportMenu list={l} />
                <button className="btn btn-sm" onClick={() => setEditing(l)}>✏️ Изменить</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(l.id, l.name)}>🗑</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function RouterListEdit({ list, onBack }) {
  const isNew = !list;
  const [title, setTitle] = useState(list?.title || '');
  const [name, setName] = useState(list?.name || '');
  const [description, setDescription] = useState(list?.description || '');
  const [listName, setListName] = useState(list?.list_name || 'vemitreya');
  const [entries, setEntries] = useState(list?.entries || '');
  const [copiedKey, setCopiedKey] = useState(null);

  const base = (localStorage.getItem('mp_url') || location.origin).replace(/\/$/, '');
  const slug = (name || title || 'list').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'list';

  const save = async () => {
    if (!title && !name) { showToast('Укажите имя списка', 'warning'); return; }
    try {
      if (isNew) {
        await api.post('/api/router-lists', { title, name: name || title, description, list_name: listName, entries });
        showToast('✓ Список создан', 'success');
      } else {
        await api.put(`/api/router-lists/${list.id}`, { title, description, list_name: listName, entries });
        showToast('✓ Сохранено', 'success');
      }
      onBack();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000);
  };

  // скачать файл напрямую (fetch + blob)
  const download = async (url, filename) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast(`Скачан ${filename}`, 'success');
    } catch (e) { showToast('Ошибка скачивания: ' + e.message, 'error'); }
  };

  const entryCount = entries.split('\n').filter(e => {
    const t = e.trim(); return t && !t.startsWith('#') && !t.startsWith('//');
  }).length;

  // Готовые команды
  const srvIp = (() => {
    const saved = localStorage.getItem('mp_setup_serverip');
    if (saved) return saved;
    try { return new URL(base).hostname; } catch { return '192.168.1.1'; }
  })();
  const urlRsc = `${base}/rl/${slug}.rsc`;
  const urlTxt = `${base}/rl/${slug}.txt`;
  const urlBat = `${base}/rl/${slug}.bat?gateway=${srvIp}`;
  const urlKeen = `${base}/rl/${slug}.keenetic?gateway=${srvIp}`;
  const mikrotikScript = `# MikroTik: загрузка списка в address-list "${listName}"
# Выполните один раз вручную, затем настройте scheduler ниже
/tool fetch url="${urlRsc}" mode=http dst-path=vemitreya-${slug}.rsc
/import file-name=vemitreya-${slug}.rsc`;
  const mikrotikScheduler = `# MikroTik scheduler — обновлять список каждый час
/system scheduler
add name="vemitreya-${slug}" interval=1h on-event="/tool fetch url=\\"${urlRsc}\\" mode=http dst-path=vemitreya-${slug}.rsc; /import file-name=vemitreya-${slug}.rsc"`;
  const keeneticScript = `REM Keenetic / Windows: скачать .bat с маршрутами и применить
REM Формат: route add <сеть> mask <маска> <шлюз>
REM Шлюз 0.0.0.0 — замените на IP вашего VPN-шлюза, или укажите ?gateway= в URL
curl -o ${slug}.bat "${urlBat}"
${slug}.bat`;

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <button className="btn btn-sm" onClick={onBack}>← Назад</button>
          <strong style={{ marginLeft: 12 }}>{isNew ? '+ Новый список' : `Список: ${list.name}`}</strong>
        </div>
        <button className="btn btn-primary" onClick={save}>{isNew ? 'Создать' : 'Сохранить'}</button>
      </div>

      <Field label="Название" required
             hint="Понятное имя для отображения. Например «VPN маршруты» или «Заблокированные».">
        <input className="form-input" value={title} onChange={e => setTitle(e.target.value)}
               placeholder="VPN маршруты" />
      </Field>

      {isNew && (
        <Field label="Slug (имя в URL)"
               hint={`Латиница, цифры, дефис. Если пусто — сгенерируется из названия. URL будет: /rl/${slug}.rsc`}>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                 placeholder={slug} />
        </Field>
      )}

      <Field label="Описание"
             hint="Необязательно — заметка для себя.">
        <input className="form-input" value={description} onChange={e => setDescription(e.target.value)}
               placeholder="Сайты которые идут через VPN" />
      </Field>

      <Collapsible title="⚙️ Дополнительно: имя address-list на роутере">
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>
          Имя address-list в который попадут IP на роутере. Если у вас уже есть готовый
          список (например <code>blocked_sites</code>) — впишите его сюда, чтобы записи
          добавлялись в него. По умолчанию <code>vemitreya</code>.
          <br /><br />
          Отдельные списки (Google, YouTube, kino-pub...) нужны чтобы <strong>точечно
          обновлять</strong> IP конкретного сервиса и <strong>загружать только нужные</strong> —
          при этом все они могут лежать в одном address-list. Обновление одного списка
          не трогает записи других (у каждого своя метка <code>vemitreya:имя</code>).
        </div>
        <input className="form-input" value={listName} onChange={e => setListName(e.target.value)}
               placeholder="vemitreya" />
      </Collapsible>

      <Field label={`Записи (${entryCount})`} required
             hint="По одной на строку: домен (youtube.com), IP (8.8.8.8) или подсеть (10.0.0.0/8). Строки с # игнорируются. https:// и / срезаются автоматически.">
        <textarea className="form-textarea" style={{ height: 220, fontFamily: 'var(--mono)', fontSize: 12 }}
                  value={entries} onChange={e => setEntries(e.target.value)} spellCheck="false"
                  placeholder={"youtube.com\ngooglevideo.com\n194.190.0.0/16\n# комментарий"} />
      </Field>

      {!isNew && (
        <>
          <InfoBox kind="tip" title="Ссылки для роутера (доступны в LAN без пароля)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {[
                ['MikroTik (.rsc)', urlRsc, 'rsc', `${slug}.rsc`],
                ['Keenetic/Windows (.bat)', urlBat, 'bat', `${slug}.bat`],
                ['Keenetic CLI (.keenetic)', urlKeen, 'kndmc', `${slug}.keenetic`],
                ['Универсальный (.txt)', urlTxt, 'txt', `${slug}.txt`],
                ['JSON', `${base}/rl/${slug}.json`, 'json', `${slug}.json`],
              ].map(([label, url, key, fname]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, minWidth: 150, color: 'var(--text-2)' }}>{label}</span>
                  <code style={{ flex: 1, fontSize: 11, border: '1px solid var(--border)', padding: '4px 8px',
                                 borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</code>
                  <button className={`btn btn-sm ${copiedKey === 'url-' + key ? 'btn-success' : ''}`}
                          title="Копировать ссылку"
                          onClick={() => copy('url-' + key, url)}>
                    {copiedKey === 'url-' + key ? '✓' : '📋'}
                  </button>
                  <button className="btn btn-sm" title="Скачать файл"
                          onClick={() => download(url, fname)}>⬇️</button>
                </div>
              ))}
            </div>
          </InfoBox>

          <TerminalBlock title="MikroTik — разовая загрузка"
                        text={mikrotikScript} copied={copiedKey === 'mt1'}
                        onCopy={() => copy('mt1', mikrotikScript)} />
          <TerminalBlock title="MikroTik — автообновление (scheduler, каждый час)"
                        text={mikrotikScheduler} copied={copiedKey === 'mt2'}
                        onCopy={() => copy('mt2', mikrotikScheduler)} />
          <TerminalBlock title="Keenetic / Windows — маршруты (route add)"
                        text={keeneticScript} copied={copiedKey === 'kn1'}
                        onCopy={() => copy('kn1', keeneticScript)} />

          <InfoBox kind="tip" title="Объединить несколько списков в одну выгрузку">
            Если у вас несколько списков (Google, YouTube, Telegram...) — роутер может забрать
            их одним запросом, каждая запись будет подписана своим списком:
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                ['Все списки MikroTik', `${base}/rl/_all.rsc`, 'allrsc'],
                ['Все списки Keenetic', `${base}/rl/_all.bat`, 'allbat'],
                ['Выбранные (пример)', `${base}/rl/_all.bat?lists=google,youtube`, 'allsel'],
              ].map(([label, url, key]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, minWidth: 140, color: 'var(--text-2)' }}>{label}</span>
                  <code style={{ flex: 1, fontSize: 11, border: '1px solid var(--border)', padding: '4px 8px',
                                 borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</code>
                  <button className={`btn btn-sm ${copiedKey === 'url-' + key ? 'btn-success' : ''}`}
                          onClick={() => copy('url-' + key, url)}>
                    {copiedKey === 'url-' + key ? '✓' : '📋'}
                  </button>
                </div>
              ))}
            </div>
          </InfoBox>
        </>
      )}

      {isNew && (
        <InfoBox kind="info" title="Сначала создайте список">
          После создания здесь появятся готовые ссылки и скрипты для MikroTik и Keenetic
          с подставленным адресом сервера.
        </InfoBox>
      )}
    </div>
  );
}

// Переиспользуемый блок кода со скриптом + кнопка копировать
// =========================================================
// ROUTERS PAGE (v2.206) — обёртка: Списки маршрутов + Настройка роутеров
// =========================================================
function RoutersPage() {
  const [tab, setTab] = useState(() => localStorage.getItem('mp_routers_tab') || 'lists');
  const setTabPersist = (t) => { setTab(t); localStorage.setItem('mp_routers_tab', t); };

  return (
    <div>
      <div className="subtabs" style={{ display: 'flex', gap: 6, marginBottom: 16,
                                        borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['lists', '📋 Списки маршрутов'], ['setup', '⚙️ Настройка роутеров']].map(([id, label]) => (
          <button key={id} onClick={() => setTabPersist(id)}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: tab === id ? 600 : 400,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === id ? 'var(--accent)' : 'var(--text-2)',
                    borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'lists' ? <RouterLists /> : <RouterSetup />}
    </div>
  );
}

// Полная инструкция настройки роутеров — подвкладки MikroTik / Keenetic
function RouterSetup() {
  const [sub, setSub] = useState(() => localStorage.getItem('mp_routers_setup') || 'mikrotik');
  const setSubPersist = (s) => { setSub(s); localStorage.setItem('mp_routers_setup', s); };
  const base = (localStorage.getItem('mp_url') || location.origin).replace(/\/$/, '');
  const autoIp = (() => { try { return new URL(base).hostname; } catch { return '192.168.1.1'; } })();

  const [serverIp, setServerIp] = useState(() => localStorage.getItem('mp_setup_serverip') || autoIp);
  const [listName, setListName] = useState(() => localStorage.getItem('mp_setup_listname') || 'vemitreya');
  const setServerIpP = (v) => { setServerIp(v); localStorage.setItem('mp_setup_serverip', v); };
  const setListNameP = (v) => { setListName(v); localStorage.setItem('mp_setup_listname', v); };

  // какой список выгружать — конкретный (slug) или _all (все)
  const [which, setWhich] = useState('_all');
  const [lists, setLists] = useState([]);
  useEffect(() => {
    api.get('/api/router-lists').then(r => setLists(r || [])).catch(() => {});
  }, []);

  // URL-фрагмент: _all или конкретный slug
  const listSlug = which;  // '_all' или name списка

  const params = { base, serverIp, listName, listSlug };

  return (
    <div>
      <InfoBox kind="info" title="Параметры — подставляются во все команды ниже">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              IP сервера Vemitreya (шлюз) <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input className="form-input" value={serverIp} onChange={e => setServerIpP(e.target.value)}
                   placeholder="192.168.1.1" style={{ fontSize: 13 }} />
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>
              IP этого сервера в вашей LAN. Роутер будет слать трафик сюда.
            </div>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Какой список выгружать
            </label>
            <select className="form-select" value={which} onChange={e => setWhich(e.target.value)}
                    style={{ fontSize: 13, width: '100%' }}>
              <option value="_all">Все списки (одним документом)</option>
              {lists.map(l => (
                <option key={l.id} value={l.name}>{l.title || l.name} ({l.entry_count})</option>
              ))}
            </select>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>
              Команды ниже обновятся под выбранный список.
            </div>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Имя address-list (MikroTik)
            </label>
            <input className="form-input" value={listName} onChange={e => setListNameP(e.target.value)}
                   placeholder="vemitreya" style={{ fontSize: 13 }} />
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>
              По умолчанию <code>vemitreya</code>.
            </div>
          </div>
        </div>
      </InfoBox>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['mikrotik', 'MikroTik'], ['keenetic', 'Keenetic']].map(([id, label]) => (
          <button key={id} onClick={() => setSubPersist(id)}
                  className={`btn btn-sm ${sub === id ? 'btn-primary' : ''}`}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'mikrotik' ? <MikrotikGuide {...params} /> : <KeeneticGuide {...params} />}
    </div>
  );
}

function MikrotikGuide({ base, serverIp, listName, listSlug = '_all' }) {
  const [copiedKey, setCopiedKey] = useState(null);
  // URL для fetch использует введённый IP сервера (подменяем хост в base)
  const serverBase = (() => {
    try { const u = new URL(base); u.hostname = serverIp; return u.origin; }
    catch { return `http://${serverIp}:8888`; }
  })();
  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000);
  };

  // ОДНОСТРОЧНЫЕ команды через ';' — RouterOS 7 ест их при вставке,
  const fname = `vemitreya-${listSlug}.rsc`;
  const fetchUrl = `${serverBase}/rl/${listSlug}.rsc`;
  const scriptName = `vemitreya-${listSlug}`;
  // единый подход — скрипт делает ВСЮ работу, запуск и планировщик
  // только вызывают его. Логика в одном месте, не дублируется.
  const createScript = `/system script add name=${scriptName} dont-require-permissions=yes source="/tool fetch url=\\"${fetchUrl}\\" mode=http dst-path=${fname}; :delay 3s; /import file-name=${fname}; /file remove [find name=${fname}]"`;
  const runScript = `/system script run ${scriptName}`;
  const schedScript = `/system scheduler add name=${scriptName} interval=1d on-event="/system script run ${scriptName}"`;

  return (
    <div>
      <InfoBox kind="info" title="Как это работает на MikroTik">
        Роутер направляет трафик к нужным сайтам не напрямую, а на <strong>сервер Vemitreya
        ({serverIp})</strong> в вашей сети. На сервере Mihomo заворачивает его в AWG/TrustTunnel/Hysteria2.
        Схема: список IP → <code>address-list</code> → mangle помечает пакеты → policy-route шлёт
        помеченное на шлюз {serverIp}. Список обновляется автоматически по расписанию.
      </InfoBox>

      <InfoBox kind="warning" title="Предусловия на сервере">
        Сервер {serverIp} должен принимать транзитный трафик (IP-форвардинг + Mihomo TPROXY/redirect).
        Если он уже работает шлюзом — дополнительно ничего не нужно.
      </InfoBox>

      <TerminalBlock title="Шаг 1. Mangle — помечать пакеты к адресам из списка"
        text={`/ip firewall mangle\nadd chain=prerouting action=mark-routing new-routing-mark=to-vpn \\\n  dst-address-list=${listName} passthrough=no comment="vemitreya routing"`}
        copied={copiedKey === 'm1'} onCopy={() => copy('m1', `/ip firewall mangle\nadd chain=prerouting action=mark-routing new-routing-mark=to-vpn dst-address-list=${listName} passthrough=no comment="vemitreya routing"`)} />

      <TerminalBlock title="Шаг 2. Маршрут помеченного трафика на сервер Vemitreya"
        text={`/ip route\nadd dst-address=0.0.0.0/0 gateway=${serverIp} routing-mark=to-vpn comment="vemitreya via server"`}
        copied={copiedKey === 'm2'} onCopy={() => copy('m2', `/ip route\nadd dst-address=0.0.0.0/0 gateway=${serverIp} routing-mark=to-vpn comment="vemitreya via server"`)} />

      <InfoBox kind="warning" title="Значения (подставлены из параметров выше)">
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          <li><code>{serverIp}</code> (gateway) — IP сервера Vemitreya в вашей LAN</li>
          <li><code>{listName}</code> (dst-address-list) — имя address-list вашего списка</li>
          <li><code>to-vpn</code> — имя routing-mark (произвольное, совпадает в шагах 1 и 2)</li>
        </ul>
      </InfoBox>

      <TerminalBlock title="Шаг 3. Создать скрипт обновления (делает всю работу)"
        text={createScript}
        copied={copiedKey === 'm3'} onCopy={() => copy('m3', createScript)} />

      <InfoBox kind="tip" title="Что делает скрипт">
        Скачивает свежий список с сервера → ждёт 3 сек → импортирует (внутри:
        <strong>удаляет старые IP этого списка</strong> по метке <code>vemitreya:{listSlug}</code>
        и добавляет новые) → удаляет временный файл. Создаётся один раз, дальше его
        вызывают Шаг 4 и планировщик.
      </InfoBox>

      <TerminalBlock title="Шаг 4. Запустить скрипт сейчас (первая загрузка)"
        text={runScript}
        copied={copiedKey === 'm4'} onCopy={() => copy('m4', runScript)} />

      <TerminalBlock title="Шаг 5. Планировщик — запускать скрипт раз в сутки"
        text={schedScript}
        copied={copiedKey === 'm5'} onCopy={() => copy('m5', schedScript)} />

      <InfoBox kind="tip" title="Проверка">
        <code>/ip firewall address-list print where list={listName}</code> — загруженные адреса.<br/>
        <code>/ip route print where routing-mark=to-vpn</code> — маршрут на {serverIp}.<br/>
        На клиенте LAN: <code>tracert youtube.com</code> — первый хоп должен быть {serverIp}.
      </InfoBox>
    </div>
  );
}


function KeeneticGuide({ base, serverIp, listSlug = '_all' }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000);
  };

  // URL берёт введённый IP сервера + выбранный список
  const serverBase = (() => {
    try { const u = new URL(base); u.hostname = serverIp; return u.origin; }
    catch { return `http://${serverIp}:8888`; }
  })();
  const urlKeen = `${serverBase}/rl/${listSlug}.keenetic?gateway=${serverIp}`;
  const cliExample = `ip route 142.250.0.0 255.255.0.0 ${serverIp}\nip route 157.240.0.0 255.240.0.0 ${serverIp}\nsystem configuration save`;
  const entwareScript = `cat > /opt/etc/vemitreya-routes.sh << 'EOF'
#!/bin/sh
# Vemitreya — маршруты через сервер ${serverIp} (там Mihomo завернёт в VPN)
SERVER="${serverIp}"
URL="${serverBase}/rl/${listSlug}.keenetic?gateway=\${SERVER}"
curl -fsS "\$URL" -o /opt/tmp/vroutes.txt || exit 1
while read -r line; do
  [ -n "\$line" ] && ndmc -c "\$line"
done < /opt/tmp/vroutes.txt
ndmc -c "system configuration save"
EOF
chmod +x /opt/etc/vemitreya-routes.sh
/opt/etc/vemitreya-routes.sh`;
  const cronScript = `echo "0 * * * * /opt/etc/vemitreya-routes.sh" >> /opt/etc/crontab\n/opt/etc/init.d/S10cron restart`;

  return (
    <div>
      <InfoBox kind="info" title="Как это работает на Keenetic">
        Так же как MikroTik у вас: роутер направляет трафик к нужным сайтам не напрямую, а на
        <strong> сервер Vemitreya ({serverIp})</strong> в вашей сети. На сервере Mihomo уже
        заворачивает этот трафик в AWG/TrustTunnel/Hysteria2. Keenetic <strong>не</strong> поднимает
        VPN сам — он лишь добавляет статические маршруты «эти подсети → шлюз {serverIp}».
      </InfoBox>

      <InfoBox kind="warning" title="Предусловия на сервере">
        На сервере Vemitreya ({serverIp}) должны быть включены: IP-форвардинг и приём
        транзитного трафика (Mihomo TPROXY/redirect). Если сервер уже работает шлюзом для
        MikroTik — для Keenetic ничего дополнительно настраивать не нужно, тот же шлюз.
      </InfoBox>

      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 8 }}>Шаг 1. Убедитесь что сервер доступен</h3>
        <p style={{ color: 'var(--text-2)', margin: '0 0 8px' }}>
          Сервер {serverIp} должен быть в одной сети с Keenetic и пинговаться. Проверьте с роутера:
          <code> ping {serverIp}</code>.
        </p>
      </div>

      <InfoBox kind="tip" title="Способ A — разово через CLI (по SSH/telnet на роутер)">
        Подключитесь к Keenetic и добавьте маршруты вручную. Шлюз — IP сервера {serverIp}.
      </InfoBox>

      <TerminalBlock title="Пример: маршруты через сервер (CLI Keenetic)"
        text={cliExample}
        copied={copiedKey === 'k1'} onCopy={() => copy('k1', cliExample)} />

      <InfoBox kind="tip" title="Способ B — автозагрузка с сервера (рекомендуется)">
        Как у MikroTik: роутер сам забирает свежий список с сервера по расписанию.
        Нужен <strong>Entware</strong> (OPKG) на Keenetic — «Управление» → «Приложения», либо
        через USB. Скрипт скачивает маршруты в формате CLI Keenetic (шлюз = {serverIp}) и применяет.
      </InfoBox>

      <TerminalBlock title="Шаг 1. Установить скрипт обновления (Entware, по SSH)"
        text={entwareScript}
        copied={copiedKey === 'k2'} onCopy={() => copy('k2', entwareScript)} />

      <TerminalBlock title="Шаг 2. Автообновление каждый час (cron Entware)"
        text={cronScript}
        copied={copiedKey === 'k3'} onCopy={() => copy('k3', cronScript)} />

      <InfoBox kind="warning" title="Замените на свои значения">
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          <li><code>{serverIp}</code> — IP сервера Vemitreya в LAN (подставлен автоматически из адреса панели)</li>
          <li>Сервер раздаёт <code>{urlKeen}</code> — готовые команды <code>ip route СЕТЬ МАСКА {serverIp}</code></li>
          <li><code>?lists=google,youtube</code> — забрать только выбранные списки</li>
        </ul>
      </InfoBox>

      <InfoBox kind="tip" title="Проверка">
        <code>ndmc -c "show ip route"</code> — увидеть маршруты со шлюзом {serverIp}.<br/>
        На клиенте: <code>tracert youtube.com</code> — первый хоп должен быть {serverIp}.
      </InfoBox>
    </div>
  );
}


function SnippetBlock({ title, text, copied, onCopy }) {
  return (
    <div style={{ marginBottom: 12, padding: '11px 14px', borderRadius: 8,
                  border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12.5 }}>{title}</strong>
        <button className={`btn btn-sm ${copied ? 'btn-success' : 'btn-primary'}`} onClick={onCopy}>
          {copied ? '✓ Скопировано' : '📋 Копировать'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 4,
                    border: '1px solid var(--border)',
                    fontSize: 11.5, lineHeight: 1.5, overflowX: 'auto',
                    fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap',
                    color: 'var(--text-2)' }}>{text}</pre>
    </div>
  );
}

// стильный «терминальный» блок кода с заголовком, нумерацией строк
// и кнопкой копировать. Для пошаговых команд (Настройка роутеров).
function TerminalBlock({ title, text, copied, onCopy }) {
  const lines = String(text).split('\n');
  const gutterW = String(lines.length).length;
  return (
    <div style={{
      marginBottom: 14, borderRadius: 10, overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      {/* Заголовок-бар */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        <button onClick={onCopy} className={`btn btn-sm ${copied ? 'btn-success' : ''}`}
                style={{ whiteSpace: 'nowrap' }}>
          {copied ? '✓ Скопировано' : 'Копировать'}
        </button>
      </div>
      {/* Тело с нумерацией */}
      <div style={{ overflowX: 'auto', padding: '12px 0', background: 'var(--bg)' }}>
        {lines.map((ln, i) => (
          <div key={i} style={{ display: 'flex', minWidth: 'max-content' }}>
            <span style={{
              flexShrink: 0, width: `${gutterW + 2}ch`, textAlign: 'right',
              paddingRight: 14, paddingLeft: 14,
              color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12.5,
              userSelect: 'none', lineHeight: 1.75,
              borderRight: '1px solid var(--border)', marginRight: 12,
            }}>{i + 1}</span>
            <code style={{
              flex: 1, paddingRight: 16, whiteSpace: 'pre',
              color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.75,
            }}>{ln || ' '}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// APP SHELL
// =========================================================
function App() {
  const [auth, setAuth] = useState(false);
  // Запоминаем активную вкладку — чтобы после reload не падать на dashboard.
  // миграция старых mp_tab значений в новую плоскую структуру.
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem('mp_tab') || 'dashboard';
    const TOP_LEVEL = ['dashboard', 'connections', 'switch', 'groups', 'providers',
                       'rules', 'speedtest', 'tunnels', 'system', 'router-lists', 'logs'];
    if (TOP_LEVEL.includes(saved)) return saved;
    // Health Matrix удалена окончательно, "Диагностика" заменена на Speedtest
    const MIGRATE = {
      'proxies': 'switch',
      'quick': 'rules',
      'diagnostics': 'speedtest',
      'health': 'speedtest',
      'awg': 'tunnels', 'tt': 'tunnels',
      'cfg-mihomo': 'system', 'services': 'system', 'updates': 'system',
      'backup': 'system', 'telegram': 'system',
    };
    return MIGRATE[saved] || 'dashboard';
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('mp_theme') || 'dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('mp_theme', theme);
  }, [theme]);

  // Сохраняем выбранную вкладку при каждом изменении
  useEffect(() => {
    localStorage.setItem('mp_tab', tab);
  }, [tab]);

  useEffect(() => {
    const url = localStorage.getItem('mp_url');
    const token = localStorage.getItem('mp_token');
    if (url && token) {
      api.configure(url, token);
      api.get('/api/auth/check').then(() => setAuth(true)).catch(() => {});
    }
  }, []);

  if (!auth) return <Login onAuth={() => setAuth(true)} />;

  // tabs-in-tabs структура
  // Каждый sidebar-пункт это либо одиночная страница, либо группа с табами.
  // плоская sidebar структура — каждая фича отдельным пунктом.
  // Только Туннели и Система остались группами с табами внутри.
  const sidebar = [
    { id: 'dashboard', icon: 'dashboard', label: 'Дашборд', kind: 'single', C: Dashboard },
    { id: 'connections', icon: 'activity', label: 'Соединения', kind: 'single', C: Connections },
    { id: 'switch', icon: 'shuffle', label: 'Переключение', kind: 'single', C: ProxySwitcher },
    { id: 'groups', icon: 'layers', label: 'Группы', kind: 'single', C: ProxyGroupsPage },
    { id: 'providers', icon: 'satellite', label: 'Подписки', kind: 'single', C: Providers },
    { id: 'rules', icon: 'list', label: 'Правила', kind: 'single', C: RulesPage },
    { id: 'speedtest', icon: 'gauge', label: 'Speedtest', kind: 'single', C: Speedtest },
    { id: 'tunnels', icon: 'shield', label: 'Туннели', kind: 'group', tabs: [
      { id: 'awg', label: 'AWG', C: AWGTunnels },
      { id: 'tt', label: 'TrustTunnel', C: TrustTunnels },
    ]},
    { id: 'system', icon: 'sliders', label: 'Система', kind: 'group', tabs: [
      { id: 'services', label: 'Сервисы', C: Services },
      { id: 'updates', label: 'Обновления', C: MihomoUpdater },
      { id: 'backup', label: 'Бэкап', C: BackupRestore },
      { id: 'telegram', label: 'Telegram', C: TelegramSettings },
      { id: 'cfg-mihomo', label: 'Mihomo YAML', C: MihomoConfigEditor },
    ]},
    { id: 'router-lists', icon: 'list', label: 'Настройка роутеров', kind: 'single', C: RoutersPage },
    { id: 'logs', icon: 'terminal', label: 'Логи', kind: 'single', C: LogsView },
  ];

  // Find current page
  const cur = sidebar.find(i => i.id === tab) || sidebar[0];

  const logout = () => {
    if (!confirm('Выйти?')) return;
    localStorage.removeItem('mp_token');
    setAuth(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="" className="logo-img" />
          <div className="sidebar-title">Vemitreya</div>
        </div>
        <nav className="sidebar-nav">
          {sidebar.map(it => (
            <div key={it.id} className={`nav-item ${tab === it.id ? 'active' : ''}`}
                 onClick={() => setTab(it.id)}>
              <Icon name={it.icon} size={18} className="nav-icon" />
              <span>{it.label}</span>
              {it.kind === 'group' && (
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>
                  {it.tabs.length}
                </span>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)' }}>
            Тема
          </div>
          <ThemeSelector theme={theme} onChange={setTheme} />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm btn-ghost" style={{ width: '100%' }} onClick={logout}>
              Выйти
            </button>
          </div>
          <div className="sidebar-version">v2.206</div>
          <div style={{ fontSize: 9.5, color: 'var(--text-3)', lineHeight: 1.4,
                        marginTop: 4, textAlign: 'center' }}>
            Open source · MIT License
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="header">
          <div>
            <div className="header-title">{cur.label}</div>
            <div className="header-subtitle">{api.base}</div>
          </div>
        </header>
        <div className="content">
          {cur.kind === 'single' ? (
            <cur.C />
          ) : (
            <TabbedPage pageId={cur.id} tabs={cur.tabs} />
          )}
        </div>
      </main>
      <Toasts />
    </div>
  );
}

// TabbedPage — общий компонент для страниц с табами
function TabbedPage({ pageId, tabs }) {
  // Запоминаем последний выбранный таб для каждой страницы отдельно
  // Также читаем URL hash вида #pageId/tabId на инициализации
  const storageKey = `mp_subtab_${pageId}`;

  const getInitialTab = () => {
    // 1. URL hash
    const hash = window.location.hash.replace('#', '');
    const [hPage, hTab] = hash.split('/');
    if (hPage === pageId && hTab && tabs.some(t => t.id === hTab)) return hTab;
    // 2. localStorage
    const saved = localStorage.getItem(storageKey);
    if (saved && tabs.some(t => t.id === saved)) return saved;
    // 3. первый таб
    return tabs[0].id;
  };

  const [active, setActive] = useState(getInitialTab);

  useEffect(() => {
    localStorage.setItem(storageKey, active);
    // Обновляем URL hash без перезагрузки страницы
    const newHash = `${pageId}/${active}`;
    if (window.location.hash !== '#' + newHash) {
      history.replaceState(null, '', '#' + newHash);
    }
  }, [active, pageId, storageKey]);

  // При изменении pageId (переход в другую секцию sidebar) — берём её сохранённый таб
  useEffect(() => {
    setActive(getInitialTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const activeTab = tabs.find(t => t.id === active) || tabs[0];
  const Comp = activeTab.C;

  return (
    <div>
      <div className="subtab-bar">
        {tabs.map(t => (
          <button key={t.id}
                  className={`subtab-btn ${active === t.id ? 'active' : ''}`}
                  onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="subtab-content">
        <Comp />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
