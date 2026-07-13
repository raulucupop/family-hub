/* Family Hub SPA */
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
let ME = null, FAMILY = null;
const CATEGORIES = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Credit', 'Subscriptions', 'Other'];
const BILL_CATS = { electricity: 'Electricity', gas: 'Gas', internet: 'Internet', mobile: 'Mobile', water: 'Water', subscription: 'Subscription', property_tax: 'Property tax', other: 'Other' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- language (English default, Romanian overlay) ----------
   The UI is authored in English; when the user's language is Romanian, a post-render pass
   swaps matching text nodes and placeholders using this dictionary. Unmatched text stays English. */
const RO = {
  'Dashboard': 'Panou', 'Budget & expenses': 'Buget și cheltuieli', 'Bills': 'Facturi', 'Vehicles': 'Vehicule',
  'Properties': 'Proprietăți', 'Acte': 'Acte', 'Bank import': 'Import bancar', 'Family': 'Familie', 'Settings': 'Setări',
  '↩ Sign out': '↩ Deconectare', 'Sign out': 'Deconectare',
  'Sign in': 'Autentificare', 'Register': 'Înregistrare', 'New family': 'Familie nouă', 'Tenant': 'Chiriaș',
  'Forgot password?': 'Ai uitat parola?', 'Back to sign in': 'Înapoi la autentificare', 'Send reset link': 'Trimite linkul de resetare',
  'Email': 'Email', 'Password': 'Parolă', 'Your name': 'Numele tău', 'Family name': 'Numele familiei', 'Invite code': 'Cod de invitație',
  'Create family': 'Creează familia', 'Save new password': 'Salvează parola nouă', 'Choose a new password': 'Alege o parolă nouă',
  // money
  'Expenses': 'Cheltuieli', 'Income': 'Venituri', 'Budgets': 'Bugete', 'Credits': 'Credite', 'Savings': 'Economii',
  'Track what comes in, what goes out, and set monthly limits.': 'Urmărește ce intră, ce iese și setează limite lunare.',
  'Export expenses (CSV)': 'Exportă cheltuieli (CSV)',
  'Add expense': 'Adaugă cheltuială', 'Add income': 'Adaugă venit', 'Date': 'Data', 'Category': 'Categorie', 'Amount': 'Sumă',
  'Note': 'Notă', 'optional': 'opțional', 'Source': 'Sursă', 'All categories': 'Toate categoriile', 'All time': 'Tot timpul',
  'Search note…': 'Caută notă…', 'Whole family': 'Toată familia', 'No matching expenses': 'Nicio cheltuială găsită',
  'Adjust the filters or add one above.': 'Ajustează filtrele sau adaugă una mai sus.', 'By': 'De', 'Delete': 'Șterge',
  'Income history': 'Istoric venituri', 'Monthly budgets': 'Bugete lunare', 'Save budgets': 'Salvează bugetele',
  'Add or remove funds': 'Adaugă sau retrage fonduri', 'Economy account balance': 'Sold cont de economii',
  'Deposit (add)': 'Depunere (adaugă)', 'Withdraw (remove)': 'Retragere', 'History': 'Istoric', 'Save': 'Salvează',
  'Add credit (loan)': 'Adaugă credit', 'Add credit': 'Adaugă credit', 'Anticipated payments': 'Plăți anticipate', 'Add payment': 'Adaugă plată',
  // dashboard
  'This month': 'Luna aceasta', 'Last 3 months': 'Ultimele 3 luni', 'Last 6 months': 'Ultimele 6 luni', 'Last 12 months': 'Ultimele 12 luni',
  'Whole family (total)': 'Toată familia (total)', 'Left over': 'Rămas', 'Income vs spending': 'Venituri vs cheltuieli',
  'Coming up — next 60 days': 'Urmează — următoarele 60 de zile', 'Nothing due soon': 'Nimic scadent curând',
  // bills
  'Bills & invoices': 'Facturi', 'Add bill': 'Adaugă factură', 'Name': 'Nume', 'Provider': 'Furnizor', 'Due date': 'Scadență',
  'Repeats': 'Se repetă', 'Responsible person': 'Persoana responsabilă', 'Linked property': 'Proprietate asociată',
  'Auto-paid subscription': 'Abonament plătit automat', 'Owner': 'Proprietar', 'Due': 'Scadent', 'Status': 'Stare', 'Invoice': 'Factură',
  'Mark paid': 'Marchează plătit', 'Edit': 'Editează', 'Save changes': 'Salvează modificările',
  // vehicles/properties
  'Add vehicle': 'Adaugă vehicul', 'Add property': 'Adaugă proprietate', 'Add': 'Adaugă', 'Add record': 'Adaugă înregistrare',
  'History & costs': 'Istoric și costuri', 'History — costs & income': 'Istoric — costuri și venituri', 'Documents & scans': 'Documente și scanări',
  'Add document': 'Adaugă document', 'Tenant & rent': 'Chiriaș și chirie', 'Type': 'Tip', 'Address': 'Adresă',
  // acte
  'ID cards, passports, certificates, talon auto, contracts — linked to a person, vehicle or property, with expiry reminders and scans.':
    'Buletine, pașapoarte, certificate, talon auto, contracte — legate de o persoană, vehicul sau proprietate, cu memento de expirare și scanări.',
  'Document': 'Document', 'Belongs to': 'Aparține de', 'Family (general)': 'Familie (general)', 'Expiry date': 'Data expirării', 'Expires': 'Expiră',
  // settings
  'Appearance': 'Aspect', 'Choose how Family Hub looks on this account.': 'Alege cum arată Family Hub pentru acest cont.',
  '☀ Light': '☀ Luminos', '🌙 Dark': '🌙 Întunecat', 'Language': 'Limbă', 'Your profile': 'Profilul tău',
  'Upload picture': 'Încarcă poză', 'Remove': 'Elimină', 'Display name': 'Nume afișat', 'Save name': 'Salvează numele',
  "Children's pictures": 'Pozele copiilor', 'Upload': 'Încarcă',
  // family
  'Invite someone': 'Invită pe cineva', 'Copy code': 'Copiază codul', 'Copy link': 'Copiază linkul', 'Generate new code': 'Generează cod nou',
  'Members': 'Membri', 'Add a child (no account)': 'Adaugă un copil (fără cont)', 'Add child': 'Adaugă copil',
  'Family settings': 'Setări familie', 'Currency': 'Monedă', 'Send invite': 'Trimite invitația', 'Role': 'Rol', 'no login': 'fără cont',
  // alerts
  'Alerts': 'Alerte', 'Mark all as read': 'Marchează toate ca citite', 'Browser notifications': 'Notificări în browser',
};
let LANG = 'en';
function applyLang() { LANG = (ME && ME.lang) || 'en'; document.documentElement.lang = LANG; }
function translateSubtree(root) {
  if (LANG !== 'ro' || !root) return;
  // placeholders + option/input values via attributes
  const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [];
  for (const el of els) {
    const ph = el.getAttribute && el.getAttribute('placeholder');
    if (ph && RO[ph.trim()]) el.setAttribute('placeholder', RO[ph.trim()]);
  }
  // text nodes (exact-match whole phrase, whitespace preserved)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const raw = n.nodeValue; const key = raw.trim();
    if (key && RO[key]) n.nodeValue = raw.replace(key, RO[key]);
  }
}
const cur = () => (FAMILY?.currency || 'RON');
const money = (n) => n == null ? '—' : `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur()}`;
// dates: stored/handled as ISO (yyyy-mm-dd), shown to the user as dd/mm/yyyy
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const isoToDMY = (iso) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : ''; };
const fdate = (d) => isoToDMY(d) || '—';
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const canWrite = () => ME && ME.role !== 'child';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600);
}
const registerLink = (code) => `${location.origin}/#register=${encodeURIComponent(code)}`;
const inviteLink = () => registerLink(FAMILY.invite_code);
async function copyText(text) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('Copied: ' + text);
  } catch { toast('Copy failed — select it manually'); }
}
// turn any dd/mm/yyyy values in a request body back into the ISO the server expects
function normalizeBodyDates(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k in o) {
    const m = typeof o[k] === 'string' && DMY_RE.exec(o[k]);
    if (m) o[k] = `${m[3]}-${m[2]}-${m[1]}`;
  }
  return o;
}
async function api(path, opts = {}) {
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') normalizeBodyDates(opts.body);
  const res = await fetch('/api' + path, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function daysClass(d) { return d < 0 ? 'late' : d <= 14 ? 'warn' : ''; }
function daysLabel(d) { return d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`; }

/* ---------- router ---------- */
const routes = { dashboard: viewDashboard, money: viewMoney, bills: viewBills, vehicles: viewVehicles, properties: viewProperties, acte: viewActe, import: viewImport, alerts: viewAlerts, family: viewFamily, settings: viewSettings };
window.addEventListener('hashchange', render);

/* ---------- site notifications: polling, badge, browser notifications ---------- */
let NOTIF = { unread: 0, items: [] };
function browserNotifOn() { return localStorage.getItem('fh_notif') === '1' && 'Notification' in window && Notification.permission === 'granted'; }
async function pollNotifications() {
  if (!ME || ME.role === 'tenant') return;
  try {
    NOTIF = await api('/notifications');
    const badge = $('#notifbadge');
    if (badge) { badge.textContent = NOTIF.unread; badge.hidden = NOTIF.unread === 0; }
    // fire browser notifications for anything newer than the last one we showed
    const lastShown = Number(localStorage.getItem('fh_last_notif') || 0);
    const fresh = NOTIF.items.filter((n) => !n.read && n.id > lastShown);
    if (fresh.length) {
      localStorage.setItem('fh_last_notif', String(Math.max(...fresh.map((n) => n.id))));
      if (browserNotifOn()) for (const n of fresh.slice(0, 3)) new Notification(n.title, { body: n.body || '' });
    }
  } catch { /* signed out or offline; badge just stays */ }
}
setInterval(pollNotifications, 60000);

function applyTheme() { document.documentElement.dataset.theme = (ME && ME.theme) || 'light'; }
// profile picture: <img> if set, else a coloured circle with the initial
function avatarHtml(user, cls = 'avatar') {
  const size = cls === 'avatar-lg' ? 72 : 34;
  if (user && user.avatar) return `<img class="${cls}" src="/api/users/${user.id}/avatar?v=${encodeURIComponent(user.avatar)}" alt="">`;
  const initial = esc((user?.name || '?').trim().charAt(0).toUpperCase());
  return `<span class="${cls} avatar-fallback" style="font-size:${Math.round(size * 0.42)}px">${initial}</span>`;
}

async function boot() {
  try {
    const me = await api('/me');
    ME = me.user; FAMILY = me.family;
    applyTheme(); applyLang();
    render();
  } catch { renderAuth(); }
}
function render() {
  if (location.hash.startsWith('#reset=')) return renderReset();
  if (!ME) return renderAuth();
  applyTheme(); applyLang();
  if (ME.role === 'tenant') return renderTenantPortal();
  const page = (location.hash || '#dashboard').slice(1);
  const fn = routes[page] || viewDashboard;
  app.innerHTML = shell(page);
  $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); };
  fn($('#page'));
  pollNotifications();
}
function shell(active) {
  const links = [
    ['dashboard', '⌂', 'Dashboard'], ['money', '₤', 'Budget & expenses'], ['bills', '☰', 'Bills'],
    ['vehicles', '⛟', 'Vehicles'], ['properties', '⌂', 'Properties'], ['acte', '❏', 'Acte'], ['import', '⇪', 'Bank import'],
    ['alerts', '◉', `Alerts<span id="notifbadge" class="notifbadge" ${NOTIF.unread ? '' : 'hidden'}>${NOTIF.unread}</span>`],
    ['family', '☺', 'Family'], ['settings', '⚙', 'Settings'],
  ];
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${esc(FAMILY.name)}</small></div>
      ${links.map(([k, ic, l]) => `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}"><span aria-hidden="true">${ic}</span>${l}</a>`).join('')}
      <div class="spacer"></div>
      <a class="whoami row" href="#settings" style="text-decoration:none;color:inherit;gap:8px">${avatarHtml(ME)}<span><b>${esc(ME.name)}</b>${ME.role} · ${esc(ME.email || '')}</span></a>
      <button class="navlink" id="logout">↩ Sign out</button>
    </nav>
    <main class="main" id="page"></main>
  </div>`;
}

/* ---------- auth ---------- */
let AUTH_INFO = null, REG_PREFILL = '';
async function renderAuth(mode = 'login') {
  if (location.hash.startsWith('#reset=')) return renderReset();
  // shareable invite link: /#register=CODE opens Register with the code filled in
  if (location.hash.startsWith('#register=')) {
    REG_PREFILL = decodeURIComponent(location.hash.slice('#register='.length));
    history.replaceState(null, '', location.pathname + location.search);
    mode = 'register';
  }
  if (!AUTH_INFO) { try { AUTH_INFO = await api('/auth/bootstrap'); } catch { AUTH_INFO = { setup: false }; } }
  const tabs = [['login', 'Sign in'], ['register', 'Register'], ...(AUTH_INFO.setup ? [['create', 'New family']] : [])];
  const btnLabel = { login: 'Sign in', register: 'Register', create: 'Create family', forgot: 'Send reset link' }[mode];
  app.innerHTML = `<div class="authwrap"><div class="card authcard">
    <div class="brandmark">Family<span>Hub</span></div>
    <p class="muted">One place for the household: budget, bills, cars and property deadlines — RCA, rovinietă, ITP, PAD included.</p>
    ${mode === 'forgot' ? '' : `<div class="tabs">${tabs.map(([m, l]) => `<button data-m="${m}" class="${mode === m ? 'active' : ''}">${l}</button>`).join('')}</div>`}
    <form id="authform">
      ${mode === 'forgot' ? `<p class="muted">Tell us your account email and we'll send a link to choose a new password.</p>` : ''}
      ${mode === 'register' || mode === 'create' ? `<div class="field"><label>Your name</label><input name="name" required></div>` : ''}
      ${mode === 'create' ? `<div class="field"><label>Family name</label><input name="familyName" placeholder="Familia Popescu" required></div>` : ''}
      ${mode === 'register' ? `<div class="field"><label>Invite code</label><input name="code" value="${esc(REG_PREFILL)}" placeholder="from your family admin or landlord" required></div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" required></div>
      ${mode === 'forgot' ? '' : `<div class="field"><label>Password ${mode !== 'login' ? '(min. 8 characters)' : ''}</label><input name="password" type="password" required minlength="${mode === 'login' ? 1 : 8}"></div>`}
      <button class="btn" style="width:100%">${btnLabel}</button>
      ${mode === 'login' ? `<p class="muted" style="text-align:center;margin:12px 0 0"><a href="" data-forgot>Forgot password?</a></p>` : ''}
      ${mode === 'forgot' ? `<p class="muted" style="text-align:center;margin:12px 0 0"><a href="" data-back>Back to sign in</a></p>` : ''}
    </form>
  </div></div>`;
  app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  app.querySelector('[data-forgot]')?.addEventListener('click', (e) => { e.preventDefault(); renderAuth('forgot'); });
  app.querySelector('[data-back]')?.addEventListener('click', (e) => { e.preventDefault(); renderAuth('login'); });
  $('#authform').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot', { method: 'POST', body });
        toast('If that email has an account, the reset link is on its way');
        renderAuth('login');
        return;
      }
      const r = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body });
      ME = r.user;
      const me = await api('/me'); FAMILY = me.family;
      location.hash = '#dashboard'; render();
    } catch (err) { toast(err.message); }
  };
}
function renderReset() {
  const token = location.hash.slice('#reset='.length);
  app.innerHTML = `<div class="authwrap"><div class="card authcard">
    <div class="brandmark">Family<span>Hub</span></div>
    <h2 style="margin-top:14px">Choose a new password</h2>
    <form id="resetform">
      <div class="field"><label>New password (min. 8 characters)</label><input name="password" type="password" required minlength="8"></div>
      <button class="btn" style="width:100%">Save new password</button>
    </form>
    <p class="muted" style="text-align:center;margin:12px 0 0"><a href="" data-back>Back to sign in</a></p>
  </div></div>`;
  app.querySelector('[data-back]').addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; renderAuth('login'); });
  $('#resetform').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/reset', { method: 'POST', body: { token, password: new FormData(e.target).get('password') } });
      ME = r.user;
      const me = await api('/me'); FAMILY = me.family;
      toast('Password changed — you are signed in');
      location.hash = '#dashboard'; render();
    } catch (err) { toast(err.message); }
  };
}

/* ---------- tenant portal ---------- */
const CHARGE_STATUS = { unpaid: 'to pay', pending: 'confirmation pending', paid: 'paid' };
async function renderTenantPortal() {
  let data;
  try { data = await api('/tenant/charges'); }
  catch (err) {
    app.innerHTML = `<div class="authwrap"><div class="card authcard"><div class="brandmark">Family<span>Hub</span></div>
      <p class="muted">${esc(err.message)}</p><button class="btn" id="tlogout">Sign out</button></div></div>`;
    $('#tlogout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); };
    return;
  }
  const t = today();
  app.innerHTML = `<div class="authwrap"><div class="card" style="max-width:720px;width:100%">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><div class="brandmark">Family<span>Hub</span></div>
        <p class="muted" style="margin:4px 0 0">Tenant portal · <b>${esc(data.property.name)}</b>${data.property.address ? ' — ' + esc(data.property.address) : ''}</p>
        <p class="muted" style="margin:4px 0 0">Signed in as ${esc(ME.name)} (${esc(ME.email)})</p></div>
      <button class="btn ghost small" id="tlogout">Sign out</button></div>
    ${data.charges.length ? `<table style="margin-top:14px"><thead><tr><th>Due</th><th>What</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${data.charges.map((c) => {
        const late = c.status === 'unpaid' && c.due_date < t;
        return `<tr>
          <td>${fdate(c.due_date)}${late ? ' <span class="badge late">overdue</span>' : ''}</td>
          <td><b>${esc(c.title)}</b>${c.type === 'rent' ? ' <span class="muted">· rent</span>' : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}</td>
          <td class="right amount">${money(c.amount)}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">paid${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">confirmation pending</span>`
            : `<span class="badge unpaid">to pay</span>`}</td>
          <td class="right">${c.status === 'unpaid' ? `<button class="btn small" data-pay="${c.id}">Mark as paid</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`
    : `<div class="empty" style="margin-top:14px"><b>Nothing to pay yet</b>Rent and shared invoices from your landlord will appear here.</div>`}
    <p class="muted" style="margin-bottom:0">After you mark something as paid, the owner confirms it — until then it shows as "confirmation pending".</p>
  </div></div>`;
  $('#tlogout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); };
  app.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
    try { await api(`/tenant/charges/${b.dataset.pay}/pay`, { method: 'POST' }); toast('Marked as paid — waiting for owner confirmation'); renderTenantPortal(); }
    catch (err) { toast(err.message); }
  }));
}

/* ---------- dashboard ---------- */
let DASH_VIEW = 'all'; // 'all' or a member id (person view)
let DASH_MONTHS = 1;   // 1 / 3 / 6 / 12 month window
const PERIOD_LABELS = { 1: 'This month', 3: 'Last 3 months', 6: 'Last 6 months', 12: 'Last 12 months' };
async function viewDashboard(el) {
  const members = await api('/family/members');
  el.innerHTML = `<div class="pagehead">
    <div><h1>Dashboard</h1><p>${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div class="row" style="gap:8px">
      <select id="dashperiod" style="width:150px">${[1, 3, 6, 12].map((m) => `<option value="${m}" ${DASH_MONTHS === m ? 'selected' : ''}>${PERIOD_LABELS[m]}</option>`).join('')}</select>
      <select id="dashview" style="width:190px">
        <option value="all" ${DASH_VIEW === 'all' ? 'selected' : ''}>Whole family (total)</option>
        ${members.map((m) => `<option value="${m.id}" ${String(DASH_VIEW) === String(m.id) ? 'selected' : ''}>${esc(m.name)}${m.id === ME.id ? ' (me)' : ''}</option>`).join('')}
      </select></div></div><div id="dash">Loading…</div>`;
  $('#dashview').onchange = (e) => { DASH_VIEW = e.target.value; viewDashboard(el); };
  $('#dashperiod').onchange = (e) => { DASH_MONTHS = Number(e.target.value); viewDashboard(el); };
  const userQ = DASH_VIEW === 'all' ? '' : `&user=${DASH_VIEW}`;
  const [reminders, stats, budgets] = await Promise.all([api(`/reminders?days=60${userQ}`), api(`/stats?months=${DASH_MONTHS}${userQ}`), api('/budgets')]);
  const net = stats.income - stats.spent;
  const spentMap = Object.fromEntries(budgets.spent.map((s) => [s.category, s.spent]));
  const scopeNote = DASH_VIEW === 'all' ? '' : ` <span class="muted">· ${esc((members.find((m) => String(m.id) === String(DASH_VIEW)) || {}).name || '')}</span>`;
  const periodLabel = PERIOD_LABELS[DASH_MONTHS];
  $('#dash').innerHTML = `
    <section>
      <h2>Coming up — next 60 days${scopeNote}</h2>
      ${reminders.length ? `<div class="ribbon">${reminders.map((r) => `
        <div class="stub ${daysClass(r.days_left)}">
          <div class="days">${daysLabel(r.days_left)}</div>
          <div class="what">${esc(r.label)}</div>
          <div class="who">${esc(r.entity || '')} · ${fdate(r.date)}${r.amount ? ` · <span class="amount">${money(r.amount)}</span>` : ''}</div>
        </div>`).join('')}</div>`
      : `<div class="card empty"><b>Nothing due soon</b>${DASH_VIEW === 'all' ? 'Add bills, vehicle or property deadlines and they will line up here.' : 'Nothing assigned to this person is coming up.'}</div>`}
    </section>
    <section class="kpi" style="margin-top:18px">
      <a class="card clickcard" href="#money" data-tab="income"><div class="label">Income · ${esc(periodLabel)}</div><div class="value">${money(stats.income)}</div></a>
      <a class="card clickcard" href="#money" data-tab="expenses"><div class="label">Spent · ${esc(periodLabel)}</div><div class="value">${money(stats.spent)}</div></a>
      <div class="card"><div class="label">Left over</div><div class="value ${net < 0 ? 'neg' : ''}">${money(net)}</div></div>
    </section>
    <section class="grid2" style="margin-top:18px">
      <div class="card"><h3>Spending by category · ${esc(periodLabel)}</h3><div class="chartbox"><canvas id="catChart"></canvas></div></div>
      <div class="card"><h3>Income vs spending</h3><div class="chartbox"><canvas id="trendChart"></canvas></div></div>
    </section>
    <section class="card" style="margin-top:18px">
      <h3>Budget vs actual · ${budgets.month}</h3>
      ${budgets.budgets.length ? budgets.budgets.map((b) => {
        const s = spentMap[b.category] || 0; const pct = Math.min(100, (s / b.amount) * 100 || 0);
        return `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between">
          <span>${esc(b.category)}</span><span class="amount muted">${money(s)} / ${money(b.amount)}</span></div>
          <div class="bar"><i class="${s > b.amount ? 'over' : ''}" style="width:${pct}%"></i></div></div>`;
      }).join('') : `<p class="muted">No budgets set for this month yet — set them in <a href="#money">Budget & expenses</a>.</p>`}
    </section>`;
  $('#dash').querySelectorAll('[data-tab]').forEach((a) => a.addEventListener('click', () => { PENDING_MONEY_TAB = a.dataset.tab; }));
  drawCharts(stats);
}
let PENDING_MONEY_TAB = null;
function drawCharts(stats) {
  const c0 = getComputedStyle(document.documentElement).getPropertyValue('--ink-soft').trim();
  if (window.Chart) { Chart.defaults.color = c0 || '#666'; Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#ddd'; }
  const colors = ['#2f6b5a', '#c98a2d', '#5b7fa6', '#b23a2e', '#7c5ba6', '#3e7c4f', '#8a6d3b', '#45565f', '#a0522d', '#4a8fb0'];
  const cc = $('#catChart'); if (cc && stats.byCategory.length) new Chart(cc, {
    type: 'doughnut',
    data: { labels: stats.byCategory.map((c) => c.category), datasets: [{ data: stats.byCategory.map((c) => c.total), backgroundColor: colors }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
  });
  else if (cc) cc.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No expenses this month yet.' }));
  const months = [...new Set([...stats.trend.map((t) => t.m), ...stats.incomeTrend.map((t) => t.m)])].sort();
  const tc = $('#trendChart'); if (tc && months.length) new Chart(tc, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Spent', data: months.map((m) => stats.trend.find((t) => t.m === m)?.total || 0), backgroundColor: '#b23a2e' },
        { label: 'Income', data: months.map((m) => stats.incomeTrend.find((t) => t.m === m)?.total || 0), backgroundColor: '#2f6b5a' },
      ],
    },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
  else if (tc) tc.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'History appears once you log expenses.' }));
}

/* ---------- money: expenses / income / budgets ---------- */
async function viewMoney(el, tab) {
  if (tab == null) { tab = PENDING_MONEY_TAB || 'expenses'; PENDING_MONEY_TAB = null; }
  el.innerHTML = `<div class="pagehead"><div><h1>Budget & expenses</h1><p>Track what comes in, what goes out, and set monthly limits.</p></div>
    <a class="btn ghost small" href="/api/export/expenses.csv">Export expenses (CSV)</a></div>
    <div class="tabs" style="max-width:680px">
      ${[['expenses', 'Expenses'], ['income', 'Income'], ['budgets', 'Budgets'], ['credits', 'Credits'], ['savings', 'Savings']].map(([t, l]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${l}</button>`).join('')}
    </div><div id="moneybody">Loading…</div>`;
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewMoney(el, b.dataset.t)));
  const body = $('#moneybody');
  if (tab === 'expenses') return moneyExpenses(body);
  if (tab === 'income') return moneyIncome(body);
  if (tab === 'credits') return moneyCredits(body);
  if (tab === 'savings') return moneySavings(body);
  return moneyBudgets(body);
}
function whoFilter(id, members, who) {
  return `<select id="${id}" style="width:160px">
    <option value="all" ${who === 'all' ? 'selected' : ''}>Whole family</option>
    ${members.map((m) => `<option value="${m.id}" ${String(m.id) === String(who) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
  </select>`;
}
async function moneyExpenses(body, f = {}) {
  const flt = { month: thisMonth(), who: 'all', cat: 'all', q: '', ...f };
  const [all, members] = await Promise.all([api('/expenses'), api('/family/members')]);
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const q = flt.q.trim().toLowerCase();
  const rows = all.filter((e) =>
    (flt.month === 'all' || e.date.startsWith(flt.month)) &&
    (flt.who === 'all' || String(e.user_id) === String(flt.who)) &&
    (flt.cat === 'all' || e.category === flt.cat) &&
    (!q || (e.note || '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q)));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const reload = (patch) => moneyExpenses(body, { ...flt, ...patch });
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add expense</h3><form id="expform" class="formgrid">
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Note</label><input name="note" placeholder="optional"></div>
      <button class="btn">Add expense</button></form></div>` : ''}
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;gap:10px"><h3 style="margin:0">Expenses</h3><span class="amount"><b>${money(total)}</b></span></div>
      <div class="row" style="gap:8px;margin:10px 0;flex-wrap:wrap">
        ${whoFilter('wfilter', members, flt.who)}
        <select id="cfilter" style="width:150px"><option value="all" ${flt.cat === 'all' ? 'selected' : ''}>All categories</option>${CATEGORIES.map((c) => `<option ${flt.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input id="mfilter" type="month" value="${flt.month === 'all' ? '' : flt.month}" style="width:150px">
        <button class="btn ghost small" id="allmonths">${flt.month === 'all' ? '● All time' : 'All time'}</button>
        <input id="qfilter" type="search" placeholder="Search note…" value="${esc(flt.q)}" style="width:180px">
      </div>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Category</th><th>By</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((e) => `<tr><td>${fdate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(mname[e.user_id] || '—')}</td><td>${esc(e.note || '')}</td>
          <td class="right amount">${money(e.amount)}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${e.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No matching expenses</b>Adjust the filters or add one above.</div>`}
    </div>`;
  $('#mfilter').onchange = (e) => reload({ month: e.target.value || thisMonth() });
  $('#allmonths').onclick = () => reload({ month: flt.month === 'all' ? thisMonth() : 'all' });
  $('#wfilter').onchange = (e) => reload({ who: e.target.value });
  $('#cfilter').onchange = (e) => reload({ cat: e.target.value });
  const qEl = $('#qfilter');
  qEl.oninput = () => { clearTimeout(qEl._h); qEl._h = setTimeout(() => reload({ q: qEl.value }), 250); };
  $('#expform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/expenses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Expense added'); reload(); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    await api('/expenses/' + b.dataset.del, { method: 'DELETE' }); reload();
  }));
}
async function moneyIncome(body, who = 'all') {
  const [all, members] = await Promise.all([api('/incomes'), api('/family/members')]);
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const rows = all.filter((r) => who === 'all' || String(r.user_id) === String(who));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add income</h3><form id="incform" class="formgrid">
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Source</label><input name="source" placeholder="Salary, freelance…" required></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <button class="btn">Add income</button></form></div>` : ''}
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Income history</h3>
        <div class="row">${whoFilter('wfilter', members, who)}<span class="amount"><b>${money(total)}</b></span></div></div>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Source</th><th>By</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.source)}</td><td>${esc(mname[r.user_id] || '—')}</td><td class="right amount">${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No income recorded yet${who === 'all' ? '' : ` for ${esc(mname[who] || '')}`}</b>Log salaries and other income to see the monthly balance.</div>`}
    </div>`;
  $('#wfilter').onchange = (e) => moneyIncome(body, e.target.value);
  $('#incform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/incomes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Income added'); moneyIncome(body, who); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api('/incomes/' + b.dataset.del, { method: 'DELETE' }); moneyIncome(body, who);
  }));
}
async function moneyBudgets(body, month = thisMonth()) {
  const { budgets, spent } = await api('/budgets?month=' + month);
  const spentMap = Object.fromEntries(spent.map((s) => [s.category, s.spent]));
  body.innerHTML = `
    <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Monthly budgets</h3>
      <input id="bmonth" type="month" value="${month}" style="width:160px"></div>
      <table><thead><tr><th>Category</th><th class="right">Budget</th><th class="right">Spent</th><th style="width:34%">Progress</th></tr></thead><tbody>
      ${CATEGORIES.map((c) => {
        const b = budgets.find((x) => x.category === c); const s = spentMap[c] || 0;
        const pct = b ? Math.min(100, (s / b.amount) * 100) : 0;
        return `<tr><td>${c}</td>
          <td class="right">${canWrite() ? `<input data-cat="${c}" class="amount" type="number" step="1" min="0" value="${b ? b.amount : ''}" placeholder="—" style="width:110px;text-align:right">` : `<span class="amount">${b ? money(b.amount) : '—'}</span>`}</td>
          <td class="right amount">${money(s)}</td>
          <td>${b ? `<div class="bar"><i class="${s > b.amount ? 'over' : ''}" style="width:${pct}%"></i></div>` : '<span class="muted">no budget</span>'}</td></tr>`;
      }).join('')}</tbody></table>
      ${canWrite() ? `<div style="margin-top:12px"><button class="btn" id="saveb">Save budgets</button></div>` : ''}
    </div>`;
  $('#bmonth').onchange = (e) => moneyBudgets(body, e.target.value);
  $('#saveb')?.addEventListener('click', async () => {
    for (const inp of body.querySelectorAll('[data-cat]')) {
      if (inp.value !== '') await api('/budgets', { method: 'POST', body: { category: inp.dataset.cat, month, amount: Number(inp.value) } });
    }
    toast('Budgets saved'); moneyBudgets(body, month);
  });
}

/* ---------- savings / economy account ---------- */
async function moneySavings(body) {
  const data = await api('/savings');
  body.innerHTML = `
    <div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <div><div class="label" style="text-transform:uppercase;font-size:12px;color:var(--ink-soft);font-weight:600">Economy account balance</div>
        <div class="value" style="font-family:var(--mono);font-size:28px;${data.balance < 0 ? 'color:var(--red)' : ''}">${money(data.balance)}</div></div>
      <div class="muted">${Object.entries(data.byUser).map(([n, v]) => `${esc(n)}: <b class="amount">${money(v)}</b>`).join(' · ') || 'No contributions yet.'}</div>
    </div></div>
    ${canWrite() ? `<div class="card" style="margin-top:16px"><h3>Add or remove funds</h3><form id="savform" class="formgrid">
      <div><label>Type</label><select name="kind"><option value="deposit">Deposit (add)</option><option value="withdrawal">Withdraw (remove)</option></select></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Note</label><input name="note" placeholder="optional"></div>
      <button class="btn">Save</button></form></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>History</h3>
      ${data.entries.length ? `<table><thead><tr><th>Date</th><th>By</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${data.entries.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.user_name || '—')}</td><td>${esc(r.note || '')}</td>
          <td class="right amount" style="color:${r.kind === 'deposit' ? '#2f6b5a' : 'var(--red)'}">${r.kind === 'deposit' ? '+' : '−'}${money(r.amount)}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No savings entries yet</b>Deposit funds above to start the family economy account.</div>`}
    </div>`;
  $('#savform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/savings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); moneySavings(body); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this entry?')) return;
    await api('/savings/' + b.dataset.del, { method: 'DELETE' }); moneySavings(body);
  }));
}

/* ---------- credits (loans) ---------- */
async function moneyCredits(body) {
  const [credits, members, properties] = await Promise.all([api('/credits'), api('/family/members'), api('/properties')]);
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add credit (loan)</h3><form id="credform" class="formgrid">
      <div><label>Name</label><input name="name" placeholder="Credit ipotecar" required></div>
      <div><label>Lender</label><input name="lender" placeholder="BT, BCR, ING…"></div>
      <div><label>Principal (${cur()})</label><input name="principal" type="number" step="0.01" min="0.01" required></div>
      <div><label>Dobândă (% / year)</label><input name="interest_rate" type="number" step="0.01" min="0" required></div>
      <div><label>Term (months)</label><input name="term_months" type="number" step="1" min="1" required></div>
      <div><label>Commission (${cur()}/mo, fixed)</label><input name="commission" type="number" step="0.01" min="0" value="0"></div>
      <div><label>Start date</label><input name="start_date" type="date" value="${today()}" required></div>
      <div><label>Holder</label><select name="user_id"><option value="">Whole family</option>
        ${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div><label>Linked property</label><select name="property_id"><option value="">None</option>
        ${properties.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <button class="btn">Add credit</button></form>
      <p class="muted" id="credpreview" style="margin:10px 0 0"></p></div>` : ''}
    <div id="credlist" style="margin-top:16px">${credits.length ? '' : `<div class="card empty"><b>No credits yet</b>Add a loan above — the monthly payment is calculated from the dobândă, and anticipated payments show how much interest you save.</div>`}</div>`;
  const f = $('#credform');
  if (f) {
    const preview = () => {
      const P = Number(f.principal.value), rate = f.interest_rate.value, n = Number(f.term_months.value), com = Number(f.commission.value) || 0;
      if (P > 0 && n >= 1 && rate !== '' && Number(rate) >= 0) {
        const r = Number(rate) / 100 / 12;
        const pay = r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
        $('#credpreview').textContent = `Monthly: ${money(pay + com)}${com ? ` (rate ${money(pay)} + commission ${money(com)})` : ''} · total interest over ${n} months: ${money(pay * n - P)}`;
      } else $('#credpreview').textContent = '';
    };
    f.addEventListener('input', preview);
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/credits', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Credit added'); moneyCredits(body); }
      catch (err) { toast(err.message); }
    };
  }
  const list = $('#credlist');
  for (const c of credits) list.appendChild(creditCard(c, members, properties, () => moneyCredits(body)));
}
function creditFormFields(members, properties, c = {}) {
  return `
    <div><label>Name</label><input name="name" placeholder="Credit ipotecar" value="${esc(c.name || '')}" required></div>
    <div><label>Lender</label><input name="lender" placeholder="BT, BCR, ING…" value="${esc(c.lender || '')}"></div>
    <div><label>Principal (${cur()})</label><input name="principal" type="number" step="0.01" min="0.01" value="${c.principal ?? ''}" required></div>
    <div><label>Dobândă (% / year)</label><input name="interest_rate" type="number" step="0.01" min="0" value="${c.interest_rate ?? ''}" required></div>
    <div><label>Term (months)</label><input name="term_months" type="number" step="1" min="1" value="${c.term_months ?? ''}" required></div>
    <div><label>Commission (${cur()}/mo, fixed)</label><input name="commission" type="number" step="0.01" min="0" value="${c.commission ?? 0}"></div>
    <div><label>Start date</label><input name="start_date" type="date" value="${c.start_date || today()}" required></div>
    <div><label>Holder</label><select name="user_id"><option value="">Whole family</option>${members.map((m) => `<option value="${m.id}" ${String(c.user_id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div><label>Linked property</label><select name="property_id"><option value="">None</option>${properties.map((p) => `<option value="${p.id}" ${String(c.property_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
}
function creditCard(c, members, properties, refresh) {
  const wrap = document.createElement('details');
  wrap.className = 'entity';
  const saved = c.interest_saved > 0.005;
  wrap.innerHTML = `<summary><span><b>${esc(c.name)}</b> <span class="muted">${[c.lender, c.user_name || 'Whole family', c.property_name, `${money(c.monthly_total)}/mo`].filter(Boolean).map(esc).join(' · ')}</span>
      ${saved ? `<span class="badge paid">saved ${money(c.interest_saved)}</span>` : ''}</span>
    ${canWrite() ? `<span class="row"><button class="btn ghost small" data-edit>Edit</button><button class="btn danger small" data-del>Delete</button></span>` : ''}</summary>
    <div class="body">
      <div class="deadgrid">
        <div class="dead"><span class="muted">Holder</span><div class="d">${esc(c.user_name || 'Whole family')}</div></div>
        <div class="dead"><span class="muted">Property</span><div class="d">${esc(c.property_name || '—')}</div></div>
        <div class="dead"><span class="muted">Monthly total · dobândă ${c.interest_rate}%</span><div class="d">${money(c.monthly_total)}${c.commission ? ` <span class="muted">(${money(c.monthly_payment)} + ${money(c.commission)} com.)</span>` : ''}</div></div>
        <div class="dead"><span class="muted">Balance today</span><div class="d">${money(c.balance)}</div></div>
        <div class="dead"><span class="muted">Payoff</span><div class="d">${fdate(c.payoff_date)} · ${c.months_left} mo left</div></div>
        <div class="dead"><span class="muted">Anticipated payments</span><div class="d">${money(c.prepaid_total)}</div></div>
        <div class="dead"><span class="muted">Money saved (interest)</span><div class="d" style="color:#2f6b5a">${money(c.interest_saved)}</div></div>
        <div class="dead"><span class="muted">Total interest projected</span><div class="d">${money(c.total_interest)} <span class="muted">vs ${money(c.base_total_interest)} without</span></div></div>
      </div>
      <div data-editbox hidden style="margin-top:12px"></div>
      <h3 style="margin-top:16px">Anticipated payments</h3>
      <p class="muted">Extra payments on top of the monthly one. The payment stays the same, the credit ends earlier — the interest you skip is your money saved.</p>
      ${canWrite() ? `<form data-payform class="formgrid">
        <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
        <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <button class="btn small">Add payment</button></form>` : ''}
      <div data-pays class="muted">Loading…</div>
    </div>`;
  const loadPays = async () => {
    const pays = await api(`/credits/${c.id}/payments`);
    const box = wrap.querySelector('[data-pays]');
    box.className = '';
    box.innerHTML = pays.length ? `<table><thead><tr><th>Date</th><th>By</th><th class="right">Amount</th><th></th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td>${fdate(p.date)}</td><td>${esc(p.paid_by_name || '')}</td><td class="right amount">${money(p.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-paydel="${p.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">No anticipated payments yet.</p>`;
    box.querySelectorAll('[data-paydel]').forEach((b) => (b.onclick = async () => {
      await api(`/credits/${c.id}/payments/${b.dataset.paydel}`, { method: 'DELETE' }); refresh();
    }));
  };
  wrap.addEventListener('toggle', () => { if (wrap.open && !wrap._loaded) { wrap._loaded = true; loadPays(); } });
  wrap.querySelector('[data-payform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/credits/${c.id}/payments`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Anticipated payment recorded'); refresh(); }
    catch (err) { toast(err.message); }
  });
  wrap.querySelector('[data-del]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm(`Delete ${c.name} and its payment history?`)) return;
    await api('/credits/' + c.id, { method: 'DELETE' }); refresh();
  });
  wrap.querySelector('[data-edit]')?.addEventListener('click', (e) => {
    e.preventDefault(); wrap.open = true;
    const box = wrap.querySelector('[data-editbox]');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<form class="formgrid">${creditFormFields(members, properties, c)}<button class="btn small">Save changes</button></form>`;
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api('/credits/' + c.id, { method: 'PUT', body: Object.fromEntries(new FormData(ev.target)) }); toast('Credit updated'); refresh(); }
      catch (err) { toast(err.message); }
    };
  });
  return wrap;
}

/* ---------- bills ---------- */
function billFormFields(members, properties, b = {}) {
  return `
    <div><label>Name</label><input name="name" placeholder="Electricity — apartment" value="${esc(b.name || '')}" required></div>
    <div><label>Provider</label><input name="provider" placeholder="PPC, Engie, Digi…" value="${esc(b.provider || '')}"></div>
    <div><label>Category</label><select name="category">${Object.entries(BILL_CATS).map(([k, v]) => `<option value="${k}" ${b.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0" value="${b.amount ?? ''}"></div>
    <div><label>Due date</label><input name="due_date" type="date" value="${b.due_date || ''}" required></div>
    <div><label>Repeats</label><select name="recur_months">${[[0, 'One-off'], [1, 'Monthly'], [2, 'Every 2 months'], [3, 'Quarterly'], [6, 'Every 6 months'], [12, 'Yearly']].map(([v, l]) => `<option value="${v}" ${Number(b.recur_months ?? 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Responsible person</label><select name="owner_id"><option value="">Whole family</option>${members.map((m) => `<option value="${m.id}" ${String(b.owner_id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div><label>Linked property</label><select name="property_id"><option value="">None</option>${properties.map((p) => `<option value="${p.id}" ${String(b.property_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div style="align-self:center"><label style="display:inline-flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" name="auto_pay" value="1" ${b.auto_pay ? 'checked' : ''} style="width:auto"> Auto-paid subscription</label></div>`;
}
async function viewBills(el) {
  const [bills, members, properties] = await Promise.all([api('/bills'), api('/family/members'), api('/properties')]);
  const t = today();
  el.innerHTML = `<div class="pagehead"><div><h1>Bills & invoices</h1><p>Electricity, gas, internet, water, taxes — with due dates, owner, attachments and payment history. Auto-paid subscriptions are marked paid automatically once due.</p></div></div>
    ${canWrite() ? `<div class="card"><h3>Add bill</h3><form id="billform" class="formgrid">
      ${billFormFields(members, properties)}
      <button class="btn">Add bill</button></form></div>` : ''}
    <div class="card" style="margin-top:16px" id="billlist">
      ${bills.length ? `<table><thead><tr><th>Bill</th><th>Owner</th><th>Due</th><th class="right">Amount</th><th>Status</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${bills.map((b) => {
        const late = b.status === 'unpaid' && b.due_date < t;
        return `<tr>
          <td><b>${esc(b.name)}</b><br><span class="muted">${esc(b.provider || BILL_CATS[b.category] || '')}${b.recur_months ? ` · every ${b.recur_months} mo` : ''}${b.auto_pay ? ' · auto-pay' : ''}${b.property_name ? ` · ${esc(b.property_name)}` : ''}</span></td>
          <td>${esc(b.owner_name || 'Family')}</td>
          <td>${fdate(b.due_date)}</td>
          <td class="right amount">${money(b.amount)}</td>
          <td><span class="badge ${late ? 'late' : b.status}">${late ? 'overdue' : b.status}</span>${b.auto_pay && b.status === 'unpaid' ? '' : ''}</td>
          <td>${b.attachment ? `<a href="/api/bills/${b.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-attach="${b.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td class="right">${canWrite() ? `
            ${b.status === 'unpaid' ? `<button class="btn small" data-pay="${b.id}" data-amt="${b.amount ?? ''}">Mark paid</button>` : ''}
            <button class="btn ghost small" data-edit="${b.id}">Edit</button>
            <button class="btn ghost small" data-hist="${b.id}">History</button>
            <button class="btn danger small" data-del="${b.id}">Delete</button>` : `<button class="btn ghost small" data-hist="${b.id}">History</button>`}</td>
        </tr><tr id="row-${b.id}" hidden><td colspan="7"></td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty"><b>No bills yet</b>Add recurring utilities once — Family Hub rolls the due date forward every time you mark them paid.</div>`}
    </div>`;
  const billsById = Object.fromEntries(bills.map((b) => [b.id, b]));
  $('#billform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/bills', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Bill added'); viewBills(el); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
    const amt = prompt('Amount paid (' + cur() + '):', b.dataset.amt || '');
    if (amt === null) return;
    try { await api(`/bills/${b.dataset.pay}/pay`, { method: 'POST', body: { amount: Number(amt) } }); toast('Payment recorded — expense logged too'); viewBills(el); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const row = $('#row-' + b.dataset.edit);
    if (!row.hidden) { row.hidden = true; return; }
    const bill = billsById[b.dataset.edit];
    row.firstElementChild.innerHTML = `<form class="formgrid" style="padding:6px 0">${billFormFields(members, properties, bill)}<button class="btn small">Save changes</button></form>`;
    row.hidden = false;
    row.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.auto_pay = e.target.auto_pay.checked ? 1 : 0;
      try { await api('/bills/' + b.dataset.edit, { method: 'PUT', body }); toast('Bill updated'); viewBills(el); }
      catch (err) { toast(err.message); }
    };
  }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this bill and its history?')) return;
    await api('/bills/' + b.dataset.del, { method: 'DELETE' }); viewBills(el);
  }));
  el.querySelectorAll('[data-hist]').forEach((b) => (b.onclick = async () => {
    const row = $('#row-' + b.dataset.hist);
    if (!row.hidden) { row.hidden = true; return; }
    const pays = await api(`/bills/${b.dataset.hist}/payments`);
    row.firstElementChild.innerHTML = pays.length
      ? `<b>Payment history</b><table>${pays.map((p) => `<tr><td>${fdate(p.paid_at)}</td><td>${esc(p.paid_by_name || '')}</td><td class="right amount">${money(p.amount)}</td></tr>`).join('')}</table>`
      : `<span class="muted">No payments recorded yet.</span>`;
    row.hidden = false;
  }));
  el.querySelectorAll('[data-attach]').forEach((inp) => (inp.onchange = async () => {
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { await api(`/bills/${inp.dataset.attach}/attachment`, { method: 'POST', body: fd }); toast('Invoice attached'); viewBills(el); }
    catch (err) { toast(err.message); }
  }));
}

/* ---------- vehicles ---------- */
const V_DEADLINES = [['rca_expiry', 'RCA'], ['casco_expiry', 'Casco'], ['vignette_expiry', 'Rovinietă'], ['itp_expiry', 'ITP'], ['road_tax_due', 'Vehicle tax']];
async function viewVehicles(el) {
  const [vehicles, members] = await Promise.all([api('/vehicles'), api('/family/members')]);
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const ownerOpts = [['', 'Whole family'], ...members.map((m) => [m.id, m.name])];
  el.innerHTML = `<div class="pagehead"><div><h1>Vehicles</h1><p>RCA, Casco, rovinietă, ITP and vehicle tax deadlines, plus service, tires and fuel logs.</p></div></div>
    ${canWrite() ? entityForm('vehform', 'Add vehicle', [
      ['name', 'Name', 'text', 'Dacia Duster'], ['plate', 'Plate', 'text', 'B 123 ABC'],
      ['owner_id', 'Owner', 'select', ownerOpts],
      ...V_DEADLINES.map(([k, l]) => [k, l + ' expires', 'date', '']),
    ]) : ''}
    <div id="vehlist" style="margin-top:16px">${vehicles.length ? '' : `<div class="card empty"><b>No vehicles yet</b>Add your car above to start getting deadline reminders.</div>`}</div>`;
  bindEntityForm('vehform', '/vehicles', () => viewVehicles(el));
  const list = $('#vehlist');
  const vSlots = [['', 'Not a specific deadline'], ...V_DEADLINES.map(([k, l]) => [k, l])];
  for (const v of vehicles) list.appendChild(entityCard(v, {
    subtitle: [v.plate, `Owner: ${mname[v.owner_id] || 'whole family'}`].filter(Boolean).join(' · '),
    deadlines: V_DEADLINES, route: 'vehicles',
    editExtra: [['owner_id', 'Owner', 'select', ownerOpts]],
    extra: (box, it) => renderEntityDocs(box, 'vehicle', it, vSlots, () => viewVehicles(el)),
    recordTypes: { fuel: 'Fuel', service: 'Service', tires: 'Tires', other: 'Other' },
    recordFields: [['date', 'Date', 'date'], ['amount', `Amount (${cur()})`, 'number'], ['odometer', 'Odometer (km)', 'number'], ['note', 'Note', 'text']],
    refresh: () => viewVehicles(el),
  }));
}

/* ---------- properties ---------- */
const P_DEADLINES = [['insurance_expiry', 'Insurance (PAD)'], ['insurance2_expiry', 'Additional insurance'], ['property_tax_due', 'Property tax']];
async function viewProperties(el) {
  const [props, members] = await Promise.all([api('/properties'), api('/family/members')]);
  const tenantInfo = await Promise.all(props.map((p) => api(`/properties/${p.id}/tenant`).catch(() => ({ tenants: [] }))));
  const tenantsByProp = Object.fromEntries(props.map((p, i) => [p.id, tenantInfo[i].tenants || []]));
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const ownerOpts = [['', 'Whole family'], ...members.map((m) => [m.id, m.name])];
  const pSlots = [['', 'Not a specific deadline'], ...P_DEADLINES.map(([k, l]) => [k, l])];
  el.innerHTML = `<div class="pagehead"><div><h1>Properties</h1><p>Insurance (PAD), property tax, mortgage and maintenance history for each home.</p></div></div>
    ${canWrite() ? entityForm('propform', 'Add property', [
      ['name', 'Name', 'text', 'Apartment — Bucharest'], ['address', 'Address', 'text', ''],
      ['owner_id', 'Owner', 'select', ownerOpts],
      ...P_DEADLINES.map(([k, l]) => [k, l + ' due', 'date', '']),
      ['mortgage_lender', 'Mortgage lender', 'text', 'optional'], ['mortgage_payment', `Monthly payment (${cur()})`, 'number', ''], ['mortgage_due_day', 'Payment day of month', 'number', '15'],
      ['rent_amount', `Rent (${cur()}/mo, if rented out)`, 'number', ''], ['rent_due_day', 'Rent due day (1-28)', 'number', '1'],
    ]) : ''}
    <div id="proplist" style="margin-top:16px">${props.length ? '' : `<div class="card empty"><b>No properties yet</b>Add your home above to track its deadlines and costs.</div>`}</div>`;
  bindEntityForm('propform', '/properties', () => viewProperties(el));
  const list = $('#proplist');
  for (const p of props) {
    const tenants = tenantsByProp[p.id] || [];
    // who a cost record is attributed to: owner by default, any member, or (if rented) bill the tenant
    const attributeOpts = [['', `Owner${p.owner_id ? ' (' + esc(mname[p.owner_id] || '') + ')' : ' / family'}`],
      ...members.map((m) => [m.id, m.name]),
      ...(tenants.length ? [['tenant', `Tenant (bill ${esc(tenants[0].name)})`]] : [])];
    list.appendChild(entityCard(p, {
      subtitle: [p.address, `Owner: ${mname[p.owner_id] || 'whole family'}`, p.mortgage_lender ? `Mortgage: ${p.mortgage_lender}, ${money(p.mortgage_payment)} on day ${p.mortgage_due_day ?? '—'}` : null].filter(Boolean).join(' · '),
      deadlines: P_DEADLINES, route: 'properties',
      editExtra: [['owner_id', 'Owner', 'select', ownerOpts], ['rent_amount', `Rent (${cur()}/mo)`, 'number'], ['rent_due_day', 'Rent due day (1-28)', 'number']],
      extra: (box, it) => { const d1 = document.createElement('div'), d2 = document.createElement('div'); box.append(d1, d2); renderTenantBox(d1, it); renderEntityDocs(d2, 'property', it, pSlots, () => viewProperties(el)); },
      recordTypes: { maintenance: 'Maintenance', renovation: 'Renovation', utility: 'Utility', rent: 'Rent (income)', other_income: 'Other income', other: 'Other' },
      incomeTypes: ['rent', 'other_income'],
      recordFields: [['date', 'Date', 'date'], ['amount', `Amount (${cur()})`, 'number'], ['note', 'Note', 'text']],
      recordExtra: [['attribute', 'Cost paid by', 'select', attributeOpts]],
      recordExtraNote: 'Costs (maintenance, utility…) are also logged as an expense for the chosen person; "Tenant" bills the tenant instead.',
      showRecordUser: true,
      refresh: () => viewProperties(el),
    }));
  }
}
/* documents & scans linked to a property or vehicle (upload from the entity, auto-linked) */
async function renderEntityDocs(box, kind, item, slots, refresh) {
  const key = kind === 'vehicle' ? 'vehicle_id' : 'property_id';
  const all = await api('/documents');
  const docs = all.filter((d) => String(d[key]) === String(item.id));
  const t = today();
  box.innerHTML = `<h3 style="margin-top:16px">Documents & scans</h3>
    ${canWrite() ? `<form data-docform class="formgrid">
      <div><label>Name</label><input name="name" placeholder="PAD, talon, contract…" required></div>
      <div><label>Type</label><select name="slot">${slots.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div><label>Expiry date</label><input name="expiry_date" type="date"></div>
      <div><label>Scan (PDF/photo)</label><input name="file" type="file" accept=".pdf,image/*"></div>
      <button class="btn small">Add document</button></form>
      <p class="muted" style="margin:2px 0 0">Pick a Type to tie it to that deadline — it then shows once (here and in Acte), not twice.</p>` : ''}
    ${docs.length ? `<table style="margin-top:8px"><thead><tr><th>Document</th><th>Type</th><th>Expires</th><th>Scan</th><th></th></tr></thead><tbody>
      ${docs.map((d) => {
        const slotLabel = (slots.find(([v]) => v === d.slot) || [])[1];
        let exp = '<span class="muted">—</span>';
        if (d.expiry_date) { const days = Math.ceil((new Date(d.expiry_date) - new Date(t)) / 86400000); exp = `<span class="${days < 0 ? 'badge late' : days <= 30 ? 'badge unpaid' : ''}">${fdate(d.expiry_date)}</span>`; }
        return `<tr><td><b>${esc(d.name)}</b>${d.number ? ` <span class="muted">${esc(d.number)}</span>` : ''}</td>
          <td>${d.slot ? esc(slotLabel || d.slot) : '<span class="muted">—</span>'}</td><td>${exp}</td>
          <td>${d.attachment ? `<a href="/api/documents/${d.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-docattach="${d.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-docdel="${d.id}">✕</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">No documents yet.</p>'}`;
  box.querySelector('[data-docform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target));
    const body = { name: raw.name, expiry_date: raw.expiry_date, slot: raw.slot || null, [key]: item.id };
    const file = e.target.querySelector('input[name=file]').files[0];
    try {
      const doc = await api('/documents', { method: 'POST', body });
      if (file) { const fd = new FormData(); fd.append('file', file); await api(`/documents/${doc.id}/attachment`, { method: 'POST', body: fd }); }
      toast('Document added'); refresh();
    } catch (err) { toast(err.message); }
  });
  box.querySelectorAll('[data-docdel]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this document?')) return; await api('/documents/' + b.dataset.docdel, { method: 'DELETE' }); refresh(); }));
  box.querySelectorAll('[data-docattach]').forEach((inp) => (inp.onchange = async () => { const fd = new FormData(); fd.append('file', inp.files[0]); try { await api(`/documents/${inp.dataset.docattach}/attachment`, { method: 'POST', body: fd }); toast('Scan attached'); refresh(); } catch (err) { toast(err.message); } }));
}

/* tenant & rent section inside a property card (owner view) */
async function renderTenantBox(box, p) {
  const [tinfo, charges] = await Promise.all([api(`/properties/${p.id}/tenant`), api(`/properties/${p.id}/charges`)]);
  const t = today();
  box.innerHTML = `<h3 style="margin-top:16px">Tenant & rent</h3>
    <p class="muted">${p.rent_amount ? `Rent: <b>${money(p.rent_amount)}</b> / month, due day ${p.rent_due_day || 1} — this month's rent charge is generated automatically once a tenant has joined.` : 'No rent set — use <b>Edit</b> to set the monthly rent and due day.'}</p>
    ${canWrite() ? `<p class="row" style="flex-wrap:wrap">
      ${tinfo.invite_code ? `<span>Tenant code: <b class="amount" style="font-size:18px;letter-spacing:.12em">${esc(tinfo.invite_code)}</b></span>
      <button class="btn ghost small" data-copy="${esc(tinfo.invite_code)}">Copy code</button>
      <button class="btn ghost small" data-copy="${esc(registerLink(tinfo.invite_code))}">Copy link</button>` : `<span class="muted">No tenant code yet.</span>`}
      <button class="btn ghost small" data-tcode>${tinfo.invite_code ? 'Generate new code' : 'Generate code'}</button>
      <span class="muted">Your tenant registers with it on the sign-in screen → <b>Register</b> tab. They only see the charges below — nothing else.</span></p>` : ''}
    ${tinfo.tenants.length ? `<p>Tenant${tinfo.tenants.length > 1 ? 's' : ''}: ${tinfo.tenants.map((x) => `<b>${esc(x.name)}</b> <span class="muted">(${esc(x.email)})</span>${canWrite() ? ` <button class="btn danger small" data-tdel="${x.id}">Remove</button>` : ''}`).join(' · ')}</p>`
      : `<p class="muted">No tenant has joined yet.</p>`}
    ${canWrite() ? `<form data-chform class="formgrid">
      <div><label>Type</label><select name="type"><option value="invoice">Invoice</option><option value="rent">Rent (extra)</option></select></div>
      <div><label>Title</label><input name="title" placeholder="Electricity — June" required></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Due date</label><input name="due_date" type="date" value="${t}" required></div>
      <button class="btn small">Share with tenant</button></form>` : ''}
    ${charges.length ? `<table><thead><tr><th>Due</th><th>What</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${charges.map((c) => {
        const late = c.status === 'unpaid' && c.due_date < t;
        return `<tr>
          <td>${fdate(c.due_date)}${late ? ' <span class="badge late">overdue</span>' : ''}</td>
          <td><b>${esc(c.title)}</b>${c.type === 'rent' ? ' <span class="muted">· rent</span>' : ''}</td>
          <td class="right amount">${money(c.amount)}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">paid${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">pending — tenant marked paid ${c.marked_paid_at ? fdate(c.marked_paid_at) : ''}</span>`
            : `<span class="badge unpaid">unpaid</span>`}</td>
          <td class="right">${canWrite() ? `
            ${c.status !== 'paid' ? `<button class="btn small" data-chconfirm="${c.id}">Confirm paid</button>` : ''}
            ${c.status === 'pending' ? `<button class="btn ghost small" data-chreject="${c.id}">Reject</button>` : ''}
            <button class="btn danger small" data-chdel="${c.id}">✕</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>` : `<p class="muted">Nothing shared with the tenant yet.</p>`}`;
  const reload = () => renderTenantBox(box, p);
  box.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  box.querySelector('[data-tcode]')?.addEventListener('click', async () => {
    await api(`/properties/${p.id}/tenant/invite`, { method: 'POST' }); toast('Tenant code generated'); reload();
  });
  box.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this tenant? Their account will be deleted.')) return;
    await api(`/properties/${p.id}/tenant/${b.dataset.tdel}`, { method: 'DELETE' }); reload();
  }));
  box.querySelector('[data-chform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/properties/${p.id}/charges`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Shared with tenant'); reload(); }
    catch (err) { toast(err.message); }
  });
  box.querySelectorAll('[data-chconfirm]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${p.id}/charges/${b.dataset.chconfirm}/confirm`, { method: 'POST' }); toast('Payment confirmed'); reload(); }
    catch (err) { toast(err.message); }
  }));
  box.querySelectorAll('[data-chreject]').forEach((b) => (b.onclick = async () => {
    await api(`/properties/${p.id}/charges/${b.dataset.chreject}/reject`, { method: 'POST' }); toast('Marked back as unpaid'); reload();
  }));
  box.querySelectorAll('[data-chdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this charge?')) return;
    await api(`/properties/${p.id}/charges/${b.dataset.chdel}`, { method: 'DELETE' }); reload();
  }));
}

/* shared entity helpers */
function entityForm(id, title, fields) {
  return `<div class="card"><h3>${title}</h3><form id="${id}" class="formgrid">
    ${fields.map(([n, l, t, ph]) => t === 'select'
      ? `<div><label>${l}</label><select name="${n}">${ph.map(([v, lab]) => `<option value="${v}">${esc(lab)}</option>`).join('')}</select></div>`
      : `<div><label>${l}</label><input name="${n}" type="${t}" step="${t === 'number' ? 'any' : ''}" placeholder="${ph}" ${n === 'name' ? 'required' : ''}></div>`).join('')}
    <button class="btn">Add</button></form></div>`;
}
function bindEntityForm(id, route, refresh) {
  const f = document.getElementById(id);
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries([...new FormData(f)].filter(([, v]) => v !== ''));
    try { await api(route, { method: 'POST', body }); toast('Added'); refresh(); }
    catch (err) { toast(err.message); }
  };
}
function entityCard(item, cfg) {
  const wrap = document.createElement('details');
  wrap.className = 'entity';
  const t = today();
  const dl = cfg.deadlines.map(([k, l]) => {
    const d = item[k];
    if (!d) return `<div class="dead"><span class="muted">${l}</span><div class="d">—</div></div>`;
    const days = Math.ceil((new Date(d) - new Date(t)) / 86400000);
    return `<div class="dead ${daysClass(days)}"><span class="muted">${l}</span><div class="d">${fdate(d)} · ${daysLabel(days)}</div></div>`;
  }).join('');
  wrap.innerHTML = `<summary><span><b>${esc(item.name)}</b> <span class="muted">${esc(cfg.subtitle || '')}</span></span>
    ${canWrite() ? `<span class="row"><button class="btn ghost small" data-edit>Edit</button><button class="btn danger small" data-del>Delete</button></span>` : ''}</summary>
    <div class="body">
      <div class="deadgrid">${dl}</div>
      <div data-editbox hidden style="margin-top:12px"></div>
      <div data-extra></div>
      <h3 style="margin-top:16px">${cfg.incomeTypes ? 'History — costs & income' : 'History & costs'}</h3>
      ${canWrite() ? `<form data-recform class="formgrid">
        <div><label>Type</label><select name="type">${Object.entries(cfg.recordTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        ${cfg.recordFields.map(([n, l, ty]) => `<div><label>${l}</label><input name="${n}" type="${ty}" step="any" ${n === 'date' ? `value="${t}" required` : ''}></div>`).join('')}
        ${(cfg.recordExtra || []).map(([n, l, , opts]) => `<div><label>${l}</label><select name="${n}">${opts.map(([v, lab]) => `<option value="${v}">${esc(lab)}</option>`).join('')}</select></div>`).join('')}
        <button class="btn small">Add record</button></form>${cfg.recordExtraNote ? `<p class="muted" style="margin:2px 0 0">${cfg.recordExtraNote}</p>` : ''}` : ''}
      <div data-records class="muted">Loading history…</div>
    </div>`;
  const loadRecords = async () => {
    const recs = await api(`/${cfg.route}/${item.id}/records`);
    const box = wrap.querySelector('[data-records]');
    box.className = '';
    const isIncome = (r) => (cfg.incomeTypes || []).includes(r.type);
    let summary = '';
    if (cfg.incomeTypes && recs.length) {
      const spent = recs.filter((r) => !isIncome(r)).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const income = recs.filter(isIncome).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const net = income - spent;
      summary = `<div class="row" style="gap:18px;flex-wrap:wrap;margin-bottom:10px">
        <span class="muted">Money in this property:</span>
        <span>Spent <b class="amount">${money(spent)}</b></span>
        <span>Income <b class="amount" style="color:#2f6b5a">${money(income)}</b></span>
        <span>Net <b class="amount" style="color:${net < 0 ? '#b23a2e' : '#2f6b5a'}">${money(net)}</b></span></div>`;
    }
    box.innerHTML = recs.length ? `${summary}<table><thead><tr><th>Date</th><th>Type</th><th>Note</th>${cfg.showRecordUser ? '<th>Paid by</th>' : ''}<th class="right">Amount</th><th></th></tr></thead><tbody>
      ${recs.map((r) => `<tr><td>${fdate(r.date)}</td><td>${cfg.recordTypes[r.type] || r.type}${r.odometer ? ` <span class="muted">(${r.odometer.toLocaleString('ro-RO')} km)</span>` : ''}</td>
        <td>${esc(r.note || '')}</td>${cfg.showRecordUser ? `<td>${esc(r.user_name || (isIncome(r) ? '—' : ''))}</td>` : ''}<td class="right amount" ${isIncome(r) ? 'style="color:#2f6b5a"' : ''}>${isIncome(r) ? '+' : ''}${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-recdel="${r.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">No records yet.</p>`;
    box.querySelectorAll('[data-recdel]').forEach((b) => (b.onclick = async () => {
      await api(`/${cfg.route}/${item.id}/records/${b.dataset.recdel}`, { method: 'DELETE' }); loadRecords();
    }));
  };
  wrap.addEventListener('toggle', () => {
    if (wrap.open && !wrap._loaded) {
      wrap._loaded = true;
      loadRecords();
      if (cfg.extra) cfg.extra(wrap.querySelector('[data-extra]'), item);
    }
  });
  wrap.querySelector('[data-recform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v !== ''));
    try { await api(`/${cfg.route}/${item.id}/records`, { method: 'POST', body }); e.target.reset(); e.target.date && (e.target.date.value = t); loadRecords(); }
    catch (err) { toast(err.message); }
  });
  wrap.querySelector('[data-del]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm(`Delete ${item.name} and all its history?`)) return;
    await api(`/${cfg.route}/${item.id}`, { method: 'DELETE' }); cfg.refresh();
  });
  wrap.querySelector('[data-edit]')?.addEventListener('click', (e) => {
    e.preventDefault(); wrap.open = true;
    const box = wrap.querySelector('[data-editbox]');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    const editFields = [
      ...cfg.deadlines.map(([k, l]) => [k, l, 'date']),
      ...(cfg.editExtra || []),
    ];
    box.innerHTML = `<form class="formgrid">${editFields.map(([k, l, ty, opts]) => ty === 'select'
      ? `<div><label>${l}</label><select name="${k}">${opts.map(([v, lab]) => `<option value="${v}" ${String(item[k] ?? '') === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select></div>`
      : `<div><label>${l}</label><input name="${k}" type="${ty}" step="${ty === 'number' ? 'any' : ''}" value="${item[k] ?? ''}"></div>`).join('')}
      <button class="btn small">Save</button></form>`;
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(ev.target));
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      try { await api(`/${cfg.route}/${item.id}`, { method: 'PUT', body }); toast('Saved'); cfg.refresh(); }
      catch (err) { toast(err.message); }
    };
  });
  return wrap;
}

/* ---------- acte (documents) ---------- */
async function viewActe(el) {
  const [docs, members, vehicles, properties] = await Promise.all([api('/documents'), api('/family/members'), api('/vehicles'), api('/properties')]);
  const t = today();
  const linkOpts = [['', 'Family (general)'],
    ...members.map((m) => ['user:' + m.id, 'Person: ' + m.name]),
    ...vehicles.map((v) => ['vehicle:' + v.id, 'Vehicle: ' + v.name]),
    ...properties.map((p) => ['property:' + p.id, 'Property: ' + p.name])];
  const belongsTo = (d) => d.person_name ? `Person: ${esc(d.person_name)}` : d.vehicle_name ? `Vehicle: ${esc(d.vehicle_name)}` : d.property_name ? `Property: ${esc(d.property_name)}` : 'Family';
  el.innerHTML = `<div class="pagehead"><div><h1>Acte</h1><p>ID cards, passports, certificates, talon auto, contracts — linked to a person, vehicle or property, with expiry reminders and scans.</p></div></div>
    ${canWrite() ? `<div class="card"><h3>Add document</h3><form id="docform" class="formgrid">
      <div><label>Name</label><input name="name" placeholder="Carte de identitate, Pasaport…" required></div>
      <div><label>Series / number</label><input name="number" placeholder="optional"></div>
      <div><label>Belongs to</label><select name="link">${linkOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div><label>Expiry date</label><input name="expiry_date" type="date"></div>
      <div><label>Notes</label><input name="notes" placeholder="optional"></div>
      <div><label>Scan (PDF or photo)</label><input name="file" type="file" accept=".pdf,image/*"></div>
      <button class="btn">Add document</button></form></div>` : ''}
    <div class="card" style="margin-top:16px">
      ${docs.length ? `<table><thead><tr><th>Document</th><th>Belongs to</th><th>Expires</th><th>Scan</th><th></th></tr></thead><tbody>
        ${docs.map((d) => {
          let exp = '<span class="muted">—</span>';
          if (d.expiry_date) {
            const days = Math.ceil((new Date(d.expiry_date) - new Date(t)) / 86400000);
            exp = `<span class="${days < 0 ? 'badge late' : days <= 30 ? 'badge unpaid' : ''}">${fdate(d.expiry_date)} · ${daysLabel(days)}</span>`;
          }
          return `<tr>
            <td><b>${esc(d.name)}</b>${d.number ? ` <span class="muted">${esc(d.number)}</span>` : ''}${d.notes ? `<br><span class="muted">${esc(d.notes)}</span>` : ''}</td>
            <td>${belongsTo(d)}</td>
            <td>${exp}</td>
            <td>${d.attachment ? `<a href="/api/documents/${d.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-attach="${d.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
            <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${d.id}">Delete</button>` : ''}</td>
          </tr>`;
        }).join('')}</tbody></table>`
      : `<div class="empty"><b>No acte yet</b>Add ID cards, passports and other documents — the ones with an expiry date show up in reminders and alerts.</div>`}
    </div>`;
  $('#docform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const raw = Object.fromEntries(new FormData(form));
    const body = { name: raw.name, number: raw.number, expiry_date: raw.expiry_date, notes: raw.notes };
    if (raw.link) { const [kind, id] = raw.link.split(':'); body[kind + '_id'] = Number(id); }
    const fileInput = form.querySelector('input[name="file"]');
    const file = fileInput?.files?.[0];
    try {
      const doc = await api('/documents', { method: 'POST', body });
      if (file) {
        const fd = new FormData(); fd.append('file', file);
        try { await api(`/documents/${doc.id}/attachment`, { method: 'POST', body: fd }); }
        catch (err) { toast('Document saved, but the scan failed: ' + err.message); viewActe(el); return; }
      }
      toast('Document added'); viewActe(el);
    } catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this document (and its scan)?')) return;
    await api('/documents/' + b.dataset.del, { method: 'DELETE' }); viewActe(el);
  }));
  el.querySelectorAll('[data-attach]').forEach((inp) => (inp.onchange = async () => {
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { await api(`/documents/${inp.dataset.attach}/attachment`, { method: 'POST', body: fd }); toast('Scan attached'); viewActe(el); }
    catch (err) { toast(err.message); }
  }));
}

/* ---------- bank import ---------- */
const CAT_RULES = [
  [/kaufland|lidl|carrefour|mega image|profi|auchan|penny|selgros|piata|market/i, 'Groceries'],
  [/omv|petrom|mol |rompetrol|lukoil|socar|uber|bolt|autostrad|cfr|stb|metrorex|parcare|parking/i, 'Transportation'],
  [/enel|ppc|engie|e-on|eon|electrica|digi|rcs|rds|orange|vodafone|telekom|apa nova|hidroelectrica|nuclearelectrica/i, 'Utilities'],
  [/farmacie|catena|helpnet|sensiblu|dr\.?max|medlife|regina maria|sanador|clinic|dent/i, 'Healthcare'],
  [/netflix|hbo|spotify|disney|cinema|steam|playstation|xbox|restaurant|glovo|tazz|foodpanda|mcdonald|kfc/i, 'Entertainment'],
  [/anaf|impozit|taxa|trezorer/i, 'Taxes'],
  [/scoala|gradinita|kids|curs|udemy|carte|librari/i, 'Education'],
];
const guessCategory = (desc) => (CAT_RULES.find(([re]) => re.test(desc)) || [null, 'Other'])[1];

function parseCSV(text) {
  // detect delimiter on first non-empty line
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  const delim = [';', ',', '\t'].map((d) => [d, (firstLine.match(new RegExp('\\' + d, 'g')) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); }
  return rows;
}
function parseAmount(s) {
  if (s == null) return NaN;
  let t = String(s).replace(/[^\d.,\-]/g, '');
  if (!t) return NaN;
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56 → 1234.56
  else t = t.replace(/,/g, '');                                          // 1,234.56 → 1234.56
  return Number(t);
}
function parseDateAny(s) {
  const t = String(s || '').trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
let IMPORT_STATE = null;

async function viewImport(el) {
  el.innerHTML = `<div class="pagehead"><div><h1>Bank import</h1>
    <p>Export a CSV statement from your bank (BT, BCR, ING, Revolut…) and import it here. Already-imported transactions are skipped automatically, so re-uploading is safe.</p></div></div>
    ${canWrite() ? `
    <div class="card"><h3>1 · Choose statement file</h3>
      <input type="file" id="csvfile" accept=".csv,text/csv" style="max-width:340px">
      <p class="muted" style="margin-bottom:0">Tip: in your banking app look for "Export" or "Extras de cont" → CSV.</p></div>
    <div id="mapbox"></div><div id="prevbox"></div>` : `<div class="card empty"><b>View-only account</b>Ask an adult or admin to import statements.</div>`}`;
  const file = $('#csvfile'); if (!file) return;
  file.onchange = async () => {
    const text = await file.files[0].text();
    const rows = parseCSV(text);
    if (rows.length < 2) return toast('Could not read any rows from this file');
    const header = rows[0].map((h) => h.trim());
    const find = (re) => { const i = header.findIndex((h) => re.test(h)); return i === -1 ? 0 : i; };
    IMPORT_STATE = { header, rows: rows.slice(1) };
    const opts = (sel) => header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h) || 'column ' + (i + 1)}</option>`).join('');
    const hasDebitCredit = header.some((h) => /debit/i.test(h)) && header.some((h) => /credit/i.test(h));
    $('#mapbox').innerHTML = `<div class="card" style="margin-top:16px"><h3>2 · Map columns</h3>
      <div class="formgrid">
        <div><label>Date column</label><select id="c_date">${opts(find(/dat[aă]|date|booking/i))}</select></div>
        <div><label>Description column</label><select id="c_desc">${opts(find(/descriere|detalii|description|details|beneficiar|payee|merchant/i))}</select></div>
        <div><label>Amount layout</label><select id="c_mode">
          <option value="single" ${hasDebitCredit ? '' : 'selected'}>One amount column (negative = expense)</option>
          <option value="split" ${hasDebitCredit ? 'selected' : ''}>Separate debit / credit columns</option></select></div>
        <div id="c_single"><label>Amount column</label><select id="c_amt">${opts(find(/sum[aă]|amount|valoare/i))}</select></div>
        <div id="c_split1" hidden><label>Debit (money out)</label><select id="c_deb">${opts(find(/debit/i))}</select></div>
        <div id="c_split2" hidden><label>Credit (money in)</label><select id="c_cred">${opts(find(/credit/i))}</select></div>
        <button class="btn" id="preview">Preview</button>
      </div></div>`;
    const syncMode = () => {
      const split = $('#c_mode').value === 'split';
      $('#c_single').hidden = split; $('#c_split1').hidden = !split; $('#c_split2').hidden = !split;
    };
    $('#c_mode').onchange = syncMode; syncMode();
    $('#preview').onclick = buildPreview;
  };
  function buildPreview() {
    const gi = (id) => Number($(id).value);
    const split = $('#c_mode').value === 'split';
    const txs = [];
    for (const r of IMPORT_STATE.rows) {
      const date = parseDateAny(r[gi('#c_date')]);
      const description = String(r[gi('#c_desc')] || '').trim();
      let amount, type;
      if (split) {
        const deb = parseAmount(r[gi('#c_deb')]), cred = parseAmount(r[gi('#c_cred')]);
        if (deb > 0) { amount = deb; type = 'expense'; }
        else if (cred > 0) { amount = cred; type = 'income'; }
      } else {
        const a = parseAmount(r[gi('#c_amt')]);
        if (!isNaN(a) && a !== 0) { amount = Math.abs(a); type = a < 0 ? 'expense' : 'income'; }
      }
      if (date && amount > 0) txs.push({ date, description, amount, type, category: guessCategory(description), include: true });
    }
    if (!txs.length) return toast('No valid transactions found — check the column mapping');
    IMPORT_STATE.txs = txs;
    $('#prevbox').innerHTML = `<div class="card" style="margin-top:16px"><h3>3 · Review & import</h3>
      <p class="muted">${txs.length} transactions found. Untick anything you don't want; fix categories where the guess is wrong.</p>
      <div style="max-height:420px;overflow:auto"><table><thead><tr><th></th><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th class="right">Amount</th></tr></thead><tbody>
      ${txs.map((t, i) => `<tr>
        <td><input type="checkbox" data-inc="${i}" checked style="width:auto"></td>
        <td>${fdate(t.date)}</td><td>${esc(t.description.slice(0, 60))}</td>
        <td>${t.type === 'expense' ? '<span class="badge unpaid">out</span>' : '<span class="badge paid">in</span>'}</td>
        <td>${t.type === 'expense' ? `<select data-cat="${i}" style="width:150px">${CATEGORIES.map((c) => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select>` : '<span class="muted">income</span>'}</td>
        <td class="right amount">${money(t.amount)}</td></tr>`).join('')}
      </tbody></table></div>
      <div style="margin-top:12px"><button class="btn" id="doimport">Import selected</button></div></div>`;
    $('#prevbox').querySelectorAll('[data-inc]').forEach((c) => (c.onchange = () => (IMPORT_STATE.txs[c.dataset.inc].include = c.checked)));
    $('#prevbox').querySelectorAll('[data-cat]').forEach((s) => (s.onchange = () => (IMPORT_STATE.txs[s.dataset.cat].category = s.value)));
    $('#doimport').onclick = async () => {
      const rows = IMPORT_STATE.txs.filter((t) => t.include).map(({ include, ...t }) => t);
      try {
        const r = await api('/import/transactions', { method: 'POST', body: { rows } });
        $('#prevbox').innerHTML = `<div class="card" style="margin-top:16px"><h3>Done</h3>
          <p><b>${r.imported}</b> imported · <b>${r.skipped}</b> skipped (already imported before) · <b>${r.errors}</b> invalid.</p>
          <p><a href="#money">See them in Budget & expenses →</a></p></div>`;
      } catch (err) { toast(err.message); }
    };
  }
}

/* ---------- alerts (site notifications) ---------- */
async function viewAlerts(el) {
  const data = await api('/notifications');
  NOTIF = data;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const enabled = browserNotifOn();
  el.innerHTML = `<div class="pagehead"><div><h1>Alerts</h1>
    <p>Generated automatically when a bill or deadline gets within 30, 14, 7 or 1 days — or goes overdue. Shared by the whole family; read status is yours.</p></div>
    ${data.items.some((n) => !n.read) ? `<button class="btn ghost small" id="readall">Mark all as read</button>` : ''}</div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div><h3 style="margin:0">Browser notifications</h3>
        <p class="muted" style="margin:4px 0 0">While Family Hub is open in a tab, new alerts also pop up as system notifications.</p></div>
        ${perm === 'unsupported' ? `<span class="muted">Not supported by this browser</span>`
          : perm === 'denied' ? `<span class="muted">Blocked in browser settings</span>`
          : `<button class="btn ${enabled ? 'ghost' : ''} small" id="togglenotif">${enabled ? 'Turn off' : 'Turn on'}</button>`}
      </div></div>
    <div class="card" style="margin-top:16px">
      ${data.items.length ? `<table><tbody>${data.items.map((n) => `
        <tr style="${n.read ? 'opacity:.55' : ''}"><td style="width:20px">${n.read ? '' : '<span class="dot"></span>'}</td>
        <td><b>${esc(n.title)}</b><br><span class="muted">${esc(n.body || '')}</span></td>
        <td class="right muted" style="white-space:nowrap">${new Date(n.created_at + 'Z').toLocaleDateString('ro-RO')}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No alerts yet</b>They appear here as your bills and deadlines get close.</div>`}
    </div>`;
  $('#readall')?.addEventListener('click', async () => {
    await api('/notifications/read', { method: 'POST', body: {} }); viewAlerts(el); pollNotifications();
  });
  $('#togglenotif')?.addEventListener('click', async () => {
    if (enabled) { localStorage.setItem('fh_notif', '0'); }
    else {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return toast('Permission was not granted');
      localStorage.setItem('fh_notif', '1');
      new Notification('Family Hub', { body: 'Browser notifications are on.' });
    }
    viewAlerts(el);
  });
}

/* ---------- family ---------- */
async function viewFamily(el) {
  const members = await api('/family/members');
  const isAdmin = ME.role === 'admin';
  el.innerHTML = `<div class="pagehead"><div><h1>Family</h1><p>Everyone shares the same data. Admins manage members, adults can edit, children can only view.</p></div></div>
    ${isAdmin ? `<div class="card"><h3>Invite someone</h3>
      <p>Share this code — they choose <b>Register</b> on the sign-in screen:</p>
      <p class="row"><span class="amount" id="invcode" style="font-size:22px;letter-spacing:.12em">${esc(FAMILY.invite_code)}</span>
      <button class="btn ghost small" data-copy="${esc(FAMILY.invite_code)}">Copy code</button>
      <button class="btn ghost small" id="rotate">Generate new code</button></p>
      <p style="margin:6px 0"><label>Or send this link — it opens Register with the code filled in:</label>
      <span class="row"><input readonly value="${esc(inviteLink())}" onclick="this.select()" style="flex:1;min-width:200px;font-size:13px">
      <button class="btn ghost small" data-copy="${esc(inviteLink())}">Copy link</button></span></p>
      <p class="muted">New members join as adults. Change their role below after they join.</p>
      <form id="inviteform" class="row" style="margin-top:12px;align-items:flex-end">
        <div style="flex:1;min-width:180px"><label>Or email an invite</label><input name="email" type="email" placeholder="person@email.com" required></div>
        <button class="btn small">Send invite</button></form></div>` : ''}
    ${isAdmin ? `<div class="card" style="margin-top:16px"><h3>Add a child (no account)</h3>
      <p class="muted">For kids without an email — they show up in the family and can have acte and expenses linked to them, but can't sign in.</p>
      <form id="childform" class="formgrid"><div><label>Name</label><input name="name" required></div>
      <button class="btn">Add child</button></form></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>Members</h3>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
      ${members.map((m) => `<tr><td><span class="row" style="gap:8px">${avatarHtml(m)}<span>${esc(m.name)}${m.id === ME.id ? ' <span class="muted">(you)</span>' : ''}</span></span></td><td>${m.email ? esc(m.email) : '<span class="muted">no login</span>'}</td>
        <td>${isAdmin && m.id !== ME.id && m.email ? `<select data-role="${m.id}">${['admin', 'adult', 'child'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : `<span class="badge role">${m.role}</span>`}</td>
        ${isAdmin ? `<td class="right">${m.id !== ME.id ? `<button class="btn danger small" data-del="${m.id}">Remove</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
    ${isAdmin ? `<div class="card" style="margin-top:16px"><h3>Family settings</h3>
      <form id="famform" class="formgrid">
        <div><label>Family name</label><input name="name" value="${esc(FAMILY.name)}"></div>
        <div><label>Currency</label><input name="currency" value="${esc(FAMILY.currency)}" maxlength="4"></div>
        <button class="btn">Save</button></form></div>` : ''}`;
  $('#rotate')?.addEventListener('click', async () => {
    const r = await api('/family/invite/rotate', { method: 'POST' });
    FAMILY.invite_code = r.invite_code; viewFamily(el);
  });
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  $('#inviteform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email');
    try { await api('/family/invite/email', { method: 'POST', body: { email } }); toast('Invite sent to ' + email); e.target.reset(); }
    catch (err) { toast(err.message); }
  });
  $('#childform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/family/members', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Child added'); viewFamily(el); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-role]').forEach((s) => (s.onchange = async () => {
    try { await api('/family/members/' + s.dataset.role, { method: 'PATCH', body: { role: s.value } }); toast('Role updated'); }
    catch (err) { toast(err.message); viewFamily(el); }
  }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this member? Their account will be deleted.')) return;
    await api('/family/members/' + b.dataset.del, { method: 'DELETE' }); viewFamily(el);
  }));
  $('#famform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    await api('/family', { method: 'PATCH', body });
    const me = await api('/me'); FAMILY = me.family;
    toast('Saved'); render();
  });
}

/* ---------- settings: profile picture, theme, name ---------- */
async function viewSettings(el) {
  const members = await api('/family/members');
  const kids = members.filter((m) => m.role === 'child');
  const canEditKids = ME.role === 'admin' || ME.role === 'adult';
  el.innerHTML = `<div class="pagehead"><div><h1>Settings</h1><p>Your profile, theme and family pictures.</p></div></div>
    <div class="card"><h3>Appearance</h3>
      <p class="muted" style="margin-top:0">Choose how Family Hub looks on this account.</p>
      <div class="row">${['light', 'dark'].map((tm) => `<button class="btn ${ME.theme === tm ? '' : 'ghost'} small" data-theme="${tm}">${tm === 'light' ? '☀ Light' : '🌙 Dark'}</button>`).join('')}</div>
      <p class="muted" style="margin:14px 0 6px">Language</p>
      <div class="row">${[['en', '🇬🇧 English'], ['ro', '🇷🇴 Română']].map(([lg, lb]) => `<button class="btn ${(ME.lang || 'en') === lg ? '' : 'ghost'} small" data-lang="${lg}">${lb}</button>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Your profile</h3>
      <div class="row" style="gap:16px;align-items:center">${avatarHtml(ME, 'avatar-lg')}
        <div class="row">
          ${ME.role !== 'child' ? `<label class="btn ghost small" style="display:inline-block">Upload picture<input type="file" data-avatar="${ME.id}" data-self accept="image/*" hidden></label>` : ''}
          ${ME.avatar ? `<button class="btn danger small" data-avadel="${ME.id}" data-self>Remove</button>` : ''}
        </div></div>
      ${ME.role !== 'child' ? `<form id="nameform" class="formgrid" style="margin-top:12px;max-width:380px">
        <div><label>Display name</label><input name="name" value="${esc(ME.name)}" required></div>
        <button class="btn small">Save name</button></form>` : ''}
    </div>
    ${canEditKids && kids.length ? `<div class="card" style="margin-top:16px"><h3>Children's pictures</h3>
      <div class="row" style="gap:22px;flex-wrap:wrap">${kids.map((k) => `<div style="text-align:center">${avatarHtml(k, 'avatar-lg')}
        <div style="margin-top:6px"><b>${esc(k.name)}</b></div>
        <div class="row" style="justify-content:center;margin-top:4px">
          <label class="btn ghost small" style="display:inline-block">Upload<input type="file" data-avatar="${k.id}" accept="image/*" hidden></label>
          ${k.avatar ? `<button class="btn danger small" data-avadel="${k.id}">✕</button>` : ''}</div></div>`).join('')}</div></div>` : ''}`;
  el.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { theme: b.dataset.theme } }); ME = { ...ME, ...u }; applyTheme(); render(); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { lang: b.dataset.lang } }); ME = { ...ME, ...u }; applyLang(); render(); }
    catch (err) { toast(err.message); }
  }));
  $('#nameform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const u = await api('/settings', { method: 'POST', body: { name: new FormData(e.target).get('name') } }); ME = { ...ME, ...u }; toast('Saved'); render(); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-avatar]').forEach((inp) => (inp.onchange = async () => {
    if (!inp.files[0]) return;
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try {
      await api(`/users/${inp.dataset.avatar}/avatar`, { method: 'POST', body: fd });
      if (inp.dataset.self !== undefined) { const me = await api('/me'); ME = me.user; render(); } else viewSettings(el);
      toast('Picture updated');
    } catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-avadel]').forEach((b) => (b.onclick = async () => {
    try {
      await api(`/users/${b.dataset.avadel}/avatar`, { method: 'DELETE' });
      if (b.dataset.self !== undefined) { const me = await api('/me'); ME = me.user; render(); } else viewSettings(el);
      toast('Removed');
    } catch (err) { toast(err.message); }
  }));
}

/* ---------- date inputs: show dd/mm/yyyy instead of the browser's locale format ----------
   Native <input type="date"> is locked to the browser locale, so we turn every date field
   into a numeric text field (numeric keypad on mobile, auto slashes). Values are converted
   back to ISO centrally in api(); displayed dates use fdate(). */
function upgradeDateInput(inp) {
  const iso = inp.value; // browser normalized a type=date value to yyyy-mm-dd
  inp.type = 'text';
  inp.setAttribute('inputmode', 'numeric');
  inp.setAttribute('maxlength', '10');
  inp.setAttribute('placeholder', 'dd/mm/yyyy');
  inp.setAttribute('pattern', '\\d{2}/\\d{2}/\\d{4}');
  inp.title = 'Format: dd/mm/yyyy';
  inp.classList.add('dateinput');
  inp.value = ISO_RE.test(iso) ? isoToDMY(iso) : '';
}
function sweepDates(root) { root.querySelectorAll && root.querySelectorAll('input[type="date"]').forEach(upgradeDateInput); }
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches && n.matches('input[type="date"]')) upgradeDateInput(n);
    sweepDates(n);
    translateSubtree(n);
  }
}).observe(app, { childList: true, subtree: true });
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.classList || !t.classList.contains('dateinput')) return;
  const d = t.value.replace(/\D/g, '').slice(0, 8);
  t.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
});

boot();
