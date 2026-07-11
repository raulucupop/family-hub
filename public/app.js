/* Family Hub SPA */
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
let ME = null, FAMILY = null;
const CATEGORIES = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Other'];
const BILL_CATS = { electricity: 'Electricity', gas: 'Gas', internet: 'Internet', mobile: 'Mobile', water: 'Water', property_tax: 'Property tax', other: 'Other' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => (FAMILY?.currency || 'RON');
const money = (n) => n == null ? '—' : `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur()}`;
const fdate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const canWrite = () => ME && ME.role !== 'child';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600);
}
async function api(path, opts = {}) {
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
const routes = { dashboard: viewDashboard, money: viewMoney, bills: viewBills, vehicles: viewVehicles, properties: viewProperties, family: viewFamily };
window.addEventListener('hashchange', render);

async function boot() {
  try {
    const me = await api('/me');
    ME = me.user; FAMILY = me.family;
    render();
  } catch { renderAuth(); }
}
function render() {
  if (!ME) return renderAuth();
  const page = (location.hash || '#dashboard').slice(1);
  const fn = routes[page] || viewDashboard;
  app.innerHTML = shell(page);
  $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); };
  fn($('#page'));
}
function shell(active) {
  const links = [
    ['dashboard', '⌂', 'Dashboard'], ['money', '₤', 'Budget & expenses'], ['bills', '☰', 'Bills'],
    ['vehicles', '⛟', 'Vehicles'], ['properties', '⌂', 'Properties'], ['family', '☺', 'Family'],
  ];
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${esc(FAMILY.name)}</small></div>
      ${links.map(([k, ic, l]) => `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}"><span aria-hidden="true">${ic}</span>${l}</a>`).join('')}
      <div class="spacer"></div>
      <div class="whoami"><b>${esc(ME.name)}</b>${ME.role} · ${esc(ME.email)}</div>
      <button class="navlink" id="logout">↩ Sign out</button>
    </nav>
    <main class="main" id="page"></main>
  </div>`;
}

/* ---------- auth ---------- */
function renderAuth(mode = 'login') {
  app.innerHTML = `<div class="authwrap"><div class="card authcard">
    <div class="brandmark">Family<span>Hub</span></div>
    <p class="muted">One place for the household: budget, bills, cars and property deadlines — RCA, rovinietă, ITP, PAD included.</p>
    <div class="tabs">
      <button data-m="login" class="${mode === 'login' ? 'active' : ''}">Sign in</button>
      <button data-m="create" class="${mode === 'create' ? 'active' : ''}">New family</button>
      <button data-m="join" class="${mode === 'join' ? 'active' : ''}">Join family</button>
    </div>
    <form id="authform">
      ${mode !== 'login' ? `<div class="field"><label>Your name</label><input name="name" required></div>` : ''}
      ${mode === 'create' ? `<div class="field"><label>Family name</label><input name="familyName" placeholder="Familia Popescu" required></div>` : ''}
      ${mode === 'join' ? `<div class="field"><label>Invite code</label><input name="inviteCode" placeholder="8-character code from your admin" required></div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" required></div>
      <div class="field"><label>Password ${mode !== 'login' ? '(min. 8 characters)' : ''}</label><input name="password" type="password" required minlength="${mode === 'login' ? 1 : 8}"></div>
      <button class="btn" style="width:100%">${mode === 'login' ? 'Sign in' : mode === 'create' ? 'Create family' : 'Join family'}</button>
    </form>
  </div></div>`;
  app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  $('#authform').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body });
      ME = r.user;
      const me = await api('/me'); FAMILY = me.family;
      location.hash = '#dashboard'; render();
    } catch (err) { toast(err.message); }
  };
}

/* ---------- dashboard ---------- */
async function viewDashboard(el) {
  el.innerHTML = `<div class="pagehead"><div><h1>Dashboard</h1><p>${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div></div><div id="dash">Loading…</div>`;
  const [reminders, stats, budgets] = await Promise.all([api('/reminders?days=60'), api('/stats'), api('/budgets')]);
  const net = stats.income - stats.spent;
  const spentMap = Object.fromEntries(budgets.spent.map((s) => [s.category, s.spent]));
  $('#dash').innerHTML = `
    <section>
      <h2>Coming up — next 60 days</h2>
      ${reminders.length ? `<div class="ribbon">${reminders.map((r) => `
        <div class="stub ${daysClass(r.days_left)}">
          <div class="days">${daysLabel(r.days_left)}</div>
          <div class="what">${esc(r.label)}</div>
          <div class="who">${esc(r.entity || '')} · ${fdate(r.date)}${r.amount ? ` · <span class="amount">${money(r.amount)}</span>` : ''}</div>
        </div>`).join('')}</div>`
      : `<div class="card empty"><b>Nothing due soon</b>Add bills, vehicle or property deadlines and they will line up here.</div>`}
    </section>
    <section class="kpi" style="margin-top:18px">
      <div class="card"><div class="label">Income · ${stats.month}</div><div class="value">${money(stats.income)}</div></div>
      <div class="card"><div class="label">Spent · ${stats.month}</div><div class="value">${money(stats.spent)}</div></div>
      <div class="card"><div class="label">Left over</div><div class="value ${net < 0 ? 'neg' : ''}">${money(net)}</div></div>
    </section>
    <section class="grid2" style="margin-top:18px">
      <div class="card"><h3>Spending by category</h3><div class="chartbox"><canvas id="catChart"></canvas></div></div>
      <div class="card"><h3>Last 6 months</h3><div class="chartbox"><canvas id="trendChart"></canvas></div></div>
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
  drawCharts(stats);
}
function drawCharts(stats) {
  const colors = ['#2f6b5a', '#c98a2d', '#5b7fa6', '#b23a2e', '#7c5ba6', '#3e7c4f', '#8a6d3b', '#45565f'];
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
async function viewMoney(el, tab = 'expenses') {
  el.innerHTML = `<div class="pagehead"><div><h1>Budget & expenses</h1><p>Track what comes in, what goes out, and set monthly limits.</p></div>
    <a class="btn ghost small" href="/api/export/expenses.csv">Export expenses (CSV)</a></div>
    <div class="tabs" style="max-width:420px">
      ${['expenses', 'income', 'budgets'].map((t) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div><div id="moneybody">Loading…</div>`;
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewMoney(el, b.dataset.t)));
  const body = $('#moneybody');
  if (tab === 'expenses') return moneyExpenses(body);
  if (tab === 'income') return moneyIncome(body);
  return moneyBudgets(body);
}
async function moneyExpenses(body, month = thisMonth()) {
  const all = await api('/expenses');
  const rows = all.filter((e) => e.date.startsWith(month));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add expense</h3><form id="expform" class="formgrid">
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Note</label><input name="note" placeholder="optional"></div>
      <button class="btn">Add expense</button></form></div>` : ''}
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Expenses</h3>
        <div class="row"><input id="mfilter" type="month" value="${month}" style="width:160px">
        <span class="amount"><b>${money(total)}</b></span></div></div>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((e) => `<tr><td>${fdate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.note || '')}</td>
          <td class="right amount">${money(e.amount)}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${e.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No expenses in ${month}</b>Add one above to start tracking.</div>`}
    </div>`;
  $('#mfilter').onchange = (e) => moneyExpenses(body, e.target.value);
  $('#expform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/expenses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Expense added'); moneyExpenses(body, month); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    await api('/expenses/' + b.dataset.del, { method: 'DELETE' }); moneyExpenses(body, month);
  }));
}
async function moneyIncome(body) {
  const rows = await api('/incomes');
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add income</h3><form id="incform" class="formgrid">
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Source</label><input name="source" placeholder="Salary, freelance…" required></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <button class="btn">Add income</button></form></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>Income history</h3>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Source</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.source)}</td><td class="right amount">${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No income recorded yet</b>Log salaries and other income to see the monthly balance.</div>`}
    </div>`;
  $('#incform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/incomes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Income added'); moneyIncome(body); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api('/incomes/' + b.dataset.del, { method: 'DELETE' }); moneyIncome(body);
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

/* ---------- bills ---------- */
async function viewBills(el) {
  const bills = await api('/bills');
  const t = today();
  el.innerHTML = `<div class="pagehead"><div><h1>Bills & invoices</h1><p>Electricity, gas, internet, water, taxes — with due dates, attachments and payment history.</p></div></div>
    ${canWrite() ? `<div class="card"><h3>Add bill</h3><form id="billform" class="formgrid">
      <div><label>Name</label><input name="name" placeholder="Electricity — apartment" required></div>
      <div><label>Provider</label><input name="provider" placeholder="PPC, Engie, Digi…"></div>
      <div><label>Category</label><select name="category">${Object.entries(BILL_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0"></div>
      <div><label>Due date</label><input name="due_date" type="date" required></div>
      <div><label>Repeats</label><select name="recur_months"><option value="0">One-off</option><option value="1" selected>Monthly</option><option value="2">Every 2 months</option><option value="3">Quarterly</option><option value="6">Every 6 months</option><option value="12">Yearly</option></select></div>
      <button class="btn">Add bill</button></form></div>` : ''}
    <div class="card" style="margin-top:16px" id="billlist">
      ${bills.length ? `<table><thead><tr><th>Bill</th><th>Due</th><th class="right">Amount</th><th>Status</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${bills.map((b) => {
        const late = b.status === 'unpaid' && b.due_date < t;
        return `<tr>
          <td><b>${esc(b.name)}</b><br><span class="muted">${esc(b.provider || BILL_CATS[b.category] || '')}${b.recur_months ? ` · repeats every ${b.recur_months} mo` : ''}</span></td>
          <td>${fdate(b.due_date)}</td>
          <td class="right amount">${money(b.amount)}</td>
          <td><span class="badge ${late ? 'late' : b.status}">${late ? 'overdue' : b.status}</span></td>
          <td>${b.attachment ? `<a href="/api/bills/${b.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-attach="${b.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td class="right">${canWrite() ? `
            ${b.status === 'unpaid' ? `<button class="btn small" data-pay="${b.id}" data-amt="${b.amount ?? ''}">Mark paid</button>` : ''}
            <button class="btn ghost small" data-hist="${b.id}">History</button>
            <button class="btn danger small" data-del="${b.id}">Delete</button>` : `<button class="btn ghost small" data-hist="${b.id}">History</button>`}</td>
        </tr><tr id="hist-${b.id}" hidden><td colspan="6"></td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty"><b>No bills yet</b>Add recurring utilities once — Family Hub rolls the due date forward every time you mark them paid.</div>`}
    </div>`;
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
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this bill and its history?')) return;
    await api('/bills/' + b.dataset.del, { method: 'DELETE' }); viewBills(el);
  }));
  el.querySelectorAll('[data-hist]').forEach((b) => (b.onclick = async () => {
    const row = $('#hist-' + b.dataset.hist);
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
  const vehicles = await api('/vehicles');
  el.innerHTML = `<div class="pagehead"><div><h1>Vehicles</h1><p>RCA, Casco, rovinietă, ITP and vehicle tax deadlines, plus service, tires and fuel logs.</p></div></div>
    ${canWrite() ? entityForm('vehform', 'Add vehicle', [
      ['name', 'Name', 'text', 'Dacia Duster'], ['plate', 'Plate', 'text', 'B 123 ABC'],
      ...V_DEADLINES.map(([k, l]) => [k, l + ' expires', 'date', '']),
    ]) : ''}
    <div id="vehlist" style="margin-top:16px">${vehicles.length ? '' : `<div class="card empty"><b>No vehicles yet</b>Add your car above to start getting deadline reminders.</div>`}</div>`;
  bindEntityForm('vehform', '/vehicles', () => viewVehicles(el));
  const list = $('#vehlist');
  for (const v of vehicles) list.appendChild(entityCard(v, {
    subtitle: v.plate, deadlines: V_DEADLINES, route: 'vehicles',
    recordTypes: { fuel: 'Fuel', service: 'Service', tires: 'Tires', other: 'Other' },
    recordFields: [['date', 'Date', 'date'], ['amount', `Amount (${cur()})`, 'number'], ['odometer', 'Odometer (km)', 'number'], ['note', 'Note', 'text']],
    refresh: () => viewVehicles(el),
  }));
}

/* ---------- properties ---------- */
const P_DEADLINES = [['insurance_expiry', 'Insurance (PAD)'], ['property_tax_due', 'Property tax']];
async function viewProperties(el) {
  const props = await api('/properties');
  el.innerHTML = `<div class="pagehead"><div><h1>Properties</h1><p>Insurance (PAD), property tax, mortgage and maintenance history for each home.</p></div></div>
    ${canWrite() ? entityForm('propform', 'Add property', [
      ['name', 'Name', 'text', 'Apartment — Bucharest'], ['address', 'Address', 'text', ''],
      ...P_DEADLINES.map(([k, l]) => [k, l + ' due', 'date', '']),
      ['mortgage_lender', 'Mortgage lender', 'text', 'optional'], ['mortgage_payment', `Monthly payment (${cur()})`, 'number', ''], ['mortgage_due_day', 'Payment day of month', 'number', '15'],
    ]) : ''}
    <div id="proplist" style="margin-top:16px">${props.length ? '' : `<div class="card empty"><b>No properties yet</b>Add your home above to track its deadlines and costs.</div>`}</div>`;
  bindEntityForm('propform', '/properties', () => viewProperties(el));
  const list = $('#proplist');
  for (const p of props) list.appendChild(entityCard(p, {
    subtitle: [p.address, p.mortgage_lender ? `Mortgage: ${p.mortgage_lender}, ${money(p.mortgage_payment)} on day ${p.mortgage_due_day ?? '—'}` : null].filter(Boolean).join(' · '),
    deadlines: P_DEADLINES, route: 'properties',
    recordTypes: { maintenance: 'Maintenance', renovation: 'Renovation', utility: 'Utility', other: 'Other' },
    recordFields: [['date', 'Date', 'date'], ['amount', `Amount (${cur()})`, 'number'], ['note', 'Note', 'text']],
    refresh: () => viewProperties(el),
  }));
}

/* shared entity helpers */
function entityForm(id, title, fields) {
  return `<div class="card"><h3>${title}</h3><form id="${id}" class="formgrid">
    ${fields.map(([n, l, t, ph]) => `<div><label>${l}</label><input name="${n}" type="${t}" step="${t === 'number' ? 'any' : ''}" placeholder="${ph}" ${n === 'name' ? 'required' : ''}></div>`).join('')}
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
    ${canWrite() ? `<span class="row"><button class="btn ghost small" data-edit>Edit dates</button><button class="btn danger small" data-del>Delete</button></span>` : ''}</summary>
    <div class="body">
      <div class="deadgrid">${dl}</div>
      <div data-editbox hidden style="margin-top:12px"></div>
      <h3 style="margin-top:16px">History & costs</h3>
      ${canWrite() ? `<form data-recform class="formgrid">
        <div><label>Type</label><select name="type">${Object.entries(cfg.recordTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        ${cfg.recordFields.map(([n, l, ty]) => `<div><label>${l}</label><input name="${n}" type="${ty}" step="any" ${n === 'date' ? `value="${t}" required` : ''}></div>`).join('')}
        <button class="btn small">Add record</button></form>` : ''}
      <div data-records class="muted">Loading history…</div>
    </div>`;
  const loadRecords = async () => {
    const recs = await api(`/${cfg.route}/${item.id}/records`);
    const box = wrap.querySelector('[data-records]');
    box.className = '';
    box.innerHTML = recs.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
      ${recs.map((r) => `<tr><td>${fdate(r.date)}</td><td>${cfg.recordTypes[r.type] || r.type}${r.odometer ? ` <span class="muted">(${r.odometer.toLocaleString('ro-RO')} km)</span>` : ''}</td>
        <td>${esc(r.note || '')}</td><td class="right amount">${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-recdel="${r.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">No records yet.</p>`;
    box.querySelectorAll('[data-recdel]').forEach((b) => (b.onclick = async () => {
      await api(`/${cfg.route}/${item.id}/records/${b.dataset.recdel}`, { method: 'DELETE' }); loadRecords();
    }));
  };
  wrap.addEventListener('toggle', () => { if (wrap.open && !wrap._loaded) { wrap._loaded = true; loadRecords(); } });
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
    box.innerHTML = `<form class="formgrid">${cfg.deadlines.map(([k, l]) => `<div><label>${l}</label><input name="${k}" type="date" value="${item[k] || ''}"></div>`).join('')}
      <button class="btn small">Save dates</button></form>`;
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(ev.target));
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      try { await api(`/${cfg.route}/${item.id}`, { method: 'PUT', body }); toast('Dates updated'); cfg.refresh(); }
      catch (err) { toast(err.message); }
    };
  });
  return wrap;
}

/* ---------- family ---------- */
async function viewFamily(el) {
  const members = await api('/family/members');
  const isAdmin = ME.role === 'admin';
  el.innerHTML = `<div class="pagehead"><div><h1>Family</h1><p>Everyone shares the same data. Admins manage members, adults can edit, children can only view.</p></div></div>
    ${isAdmin ? `<div class="card"><h3>Invite someone</h3>
      <p>Share this code — they choose <b>Join family</b> on the sign-in screen:</p>
      <p class="row"><span class="amount" style="font-size:22px;letter-spacing:.12em">${esc(FAMILY.invite_code)}</span>
      <button class="btn ghost small" id="rotate">Generate new code</button></p>
      <p class="muted">New members join as adults. Change their role below after they join.</p></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>Members</h3>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
      ${members.map((m) => `<tr><td>${esc(m.name)}${m.id === ME.id ? ' <span class="muted">(you)</span>' : ''}</td><td>${esc(m.email)}</td>
        <td>${isAdmin && m.id !== ME.id ? `<select data-role="${m.id}">${['admin', 'adult', 'child'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : `<span class="badge role">${m.role}</span>`}</td>
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

boot();
