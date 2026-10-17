/* O lună: the scroll is the calendar.
   Page scroll is turned into a day of October 2026, and every panel on the surface is computed
   from that day and from the sample data below. Nothing here is a picture of an app: bills
   arrive, fall due and get paid because the arithmetic says so. Everything is a labelled example
   ("familia Marin" does not exist); no real household data is on this page.

   The engine (scrollcraft.js) pins, pans, reveals and fades. This file owns only what is specific
   to this page: the date, the panels, the strip, the report counts and the sign-in. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ sample data
  const MONTH = 9, YEAR = 2026, DAYS = 31;            // October 2026 (month index 9)
  const BUDGET = 7500;
  // bills paid out of the household: arrive (by email or as a standing order), fall due, get paid
  const BILLS = [
    { id: 'casa',    name: 'Rata la casă',              what: 'Credit ipotecar', amt: 2150.00, arrive: 1,  due: 15, paid: 15, how: 'automat' },
    { id: 'eon',     name: 'E.ON',                      what: 'Gaz',                   amt: 142.30,  arrive: 3,  due: 12, paid: 12, how: 'automat', mail: true },
    { id: 'orange',  name: 'Orange',                    what: 'Internet și mobil',     amt: 95.00,   arrive: 5,  due: 18, paid: 18, how: 'automat', mail: true },
    { id: 'hidro',   name: 'Hidroelectrica',            what: 'Curent',                amt: 247.99,  arrive: 8,  due: 20, paid: 20, how: 'automat', mail: true },
    { id: 'asoc',    name: 'Asociația de proprietari',  what: 'Întreținere',           amt: 386.40,  arrive: 23, due: 30, paid: 27, how: 'Ioana',   mail: true },
  ];
  const INCOME = [
    { day: 10, name: 'Salarii', amt: 11200.00 },
    { day: 19, name: 'Chiria de la apartamentul din Mehala', amt: 1800.00 },
  ];
  // everyday spending, one figure per day (groceries, pharmacy, fuel); index 0 is unused
  const DAILY = [0, 0, 186.40, 42.00, 312.75, 0, 58.30, 124.90, 0, 87.20, 215.60, 398.10, 36.00, 74.50, 0,
    168.20, 52.00, 241.30, 0, 96.40, 61.80, 133.70, 47.00, 289.90, 0, 118.60, 64.20, 176.80, 39.90, 142.30, 88.00, 203.50];

  // what each day leaves on the strip, and what the home view says about "today"
  const EVENTS = {
    1:  [['mail', 'Raportul pe septembrie a sosit pe email.'], ['mail', 'Chiria pe octombrie, 1.800,00 RON, a fost emisă chiriașului. Scadentă pe 20.']],
    3:  [['mail', 'Factură E.ON primită pe email: 142,30 RON, scadentă pe 12.']],
    5:  [['mail', 'Factură Orange primită pe email: 95,00 RON, scadentă pe 18.'], ['chore', 'Tura la gunoi: Andrei, săptămâna asta.']],
    8:  [['mail', 'Factură Hidroelectrica primită pe email: 247,99 RON, scadentă pe 20.']],
    10: [['money', 'Salarii încasate: 11.200,00 RON.']],
    12: [['pay', 'E.ON plătită automat: 142,30 RON.']],
    13: [['deadline', 'Memento: RCA-ul la Dacia Duster expiră peste 7 zile.']],
    15: [['pay', 'Rata la casă plătită automat: 2.150,00 RON.']],
    18: [['pay', 'Orange plătită automat: 95,00 RON.'], ['deadline', 'Memento trimis chiriașului: chiria e scadentă marți.']],
    19: [['deadline', 'RCA reînnoit: poliță nouă, valabilă până la 19.10.2027.'], ['money', 'Chiriașul a plătit chiria: 1.800,00 RON.']],
    20: [['pay', 'Hidroelectrica plătită automat: 247,99 RON.']],
    23: [['mail', 'Întreținerea primită pe email: 386,40 RON, scadentă pe 30.']],
    25: [['mail', 'Index la apometre cerut chiriașului.']],
    26: [['mail', 'Chiriașul a trimis indexul: 412 m³.']],
    27: [['pay', 'Întreținerea plătită de Ioana: 386,40 RON.']],
    28: [['deadline', 'Garanția la mașina de spălat a expirat azi. Bonul rămâne la Garanții.']],
    31: [['mail', 'Luna s-a închis. Raportul pleacă mâine dimineață.']],
  };
  // the week board, the peak: what falls on each day of 18 to 22 and when it got handled
  const WEEK = {
    18: [{ what: 'Orange', amt: 95.00, soon: 'Se plătește automat azi', done: 'Plătită automat', doneDay: 18 }],
    19: [],
    20: [
      { what: 'RCA · Dacia Duster', soon: 'Expiră pe 20', done: 'Reînnoit luni, valabil până în 2027', doneDay: 19 },
      { what: 'Hidroelectrica', amt: 247.99, soon: 'Se plătește automat pe 20', done: 'Plătită automat', doneDay: 20 },
      { what: 'Chiria · apartament Mehala', amt: 1800.00, soon: 'Memento trimis chiriașului', done: 'Chiriașul a plătit luni', doneDay: 19 },
    ],
    21: [],
    22: [],
  };
  const PEAK_DAY = 20;

  // ------------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ron = (n) => money.format(n) + ' RON';
  const date = (d) => new Date(YEAR, MONTH, d);
  const dow = (d) => date(d).toLocaleDateString('ro-RO', { weekday: 'long' });
  const dowShort = (d) => date(d).toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, one, many) => (n === 1 ? one : many);
  const inDays = (n) => (n === 0 ? 'azi' : n === 1 ? 'mâine' : `în ${n} zile`);

  const spentBy = (d) => {
    let s = 0;
    for (let i = 1; i <= d; i++) s += DAILY[i] || 0;
    for (const b of BILLS) if (b.paid <= d) s += b.amt;
    return s;
  };
  const MONTH_SPENT = spentBy(DAYS);
  const MONTH_INCOME = INCOME.reduce((s, x) => s + x.amt, 0);
  const BILLS_ON_TIME = BILLS.filter((b) => b.paid <= b.due).length;

  // ------------------------------------------------------------------ the day strip
  const strip = $('[data-strip]');
  for (let d = 1; d <= DAYS; d++) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d;
    b.dataset.day = d;
    const kinds = (EVENTS[d] || []).map((e) => e[0]);
    // the stamp shows the strongest thing the day did: a payment beats money in beats a deadline
    const kind = ['pay', 'money', 'deadline', 'mail'].find((k) => kinds.includes(k)) || '';
    if (kind) b.dataset.kind = kind;
    const wd = date(d).getDay();
    if (wd === 0 || wd === 6) b.classList.add('is-weekend');
    b.setAttribute('aria-label', `${dow(d)} ${d} octombrie${kinds.length ? ', ' + (EVENTS[d] || []).map((e) => e[1]).join(' ') : ''}`);
    b.addEventListener('click', () => goToDay(d));
    li.appendChild(b);
    strip.appendChild(li);
  }
  const cells = $$('button', strip);

  // ------------------------------------------------------------------ scroll → day
  // Each act owns a stretch of the month (data-days="from to"). Pinned acts spend it across their
  // pinned travel (optionally only the first `data-days-by` of it, so the act can hold on its last
  // day); the flow act spends it while its body passes the middle of the viewport.
  const acts = $$('[data-days]').map((el) => {
    const [d0, d1] = el.dataset.days.split(/\s+/).map(Number);
    return { el, d0, d1, by: Number(el.dataset.daysBy) || 1, pinned: el.hasAttribute('data-sc-act') && el.dataset.scAct !== 'flow' };
  });
  let ranges = [];
  function measure() {
    const vh = innerHeight;
    ranges = acts.map((a) => {
      const top = a.el.getBoundingClientRect().top + scrollY;
      const h = a.el.offsetHeight;
      let y0, y1;
      if (a.pinned) { y0 = top; y1 = top + Math.max(h - vh, 1) * a.by; }
      else { y0 = top - vh * 0.5; y1 = top + h - vh * 0.5; }
      return { ...a, y0, y1, top, h };
    });
  }
  function dayAt(y) {
    let d = 1;
    for (const r of ranges) {
      if (y < r.y0) break;
      const t = Math.min(1, (y - r.y0) / Math.max(r.y1 - r.y0, 1));
      d = r.d0 + (r.d1 - r.d0) * t;
    }
    return Math.max(1, Math.min(DAYS, Math.floor(d)));
  }
  function yForDay(d) {
    for (const r of ranges) {
      if (d >= r.d0 && d <= Math.floor(r.d1)) {
        const t = r.d1 === r.d0 ? 0 : (d + 0.5 - r.d0) / (r.d1 - r.d0);
        return r.y0 + (r.y1 - r.y0) * Math.min(1, t);
      }
    }
    return ranges.length ? ranges[ranges.length - 1].y0 : 0;
  }
  function goToDay(d) {
    measure();
    const y = Math.ceil(yForDay(d)) + 1;
    scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    // a long smooth scroll can land a few pixels off, which on the log is the next day over;
    // once it settles, put the reader exactly on the day they clicked
    if (!reduce) addEventListener('scrollend', () => { measure(); scrollTo({ top: Math.ceil(yForDay(d)) + 1, behavior: 'instant' }); }, { once: true });
  }

  // ------------------------------------------------------------------ renderers
  const el = {
    dow: $('[data-today-dow]'), date: $('[data-today-date]'),
    today: $('[data-home-today]'), spent: $('[data-home-spent]'), bar: $('[data-home-bar]'), barLabel: $('[data-home-bar-label]'),
    bills: $('[data-home-bills]'), inbox: $('[data-home-inbox]'), next: $('[data-home-next]'), nextWhen: $('[data-home-next-when]'),
    board: $('[data-week-board]'), weekStatus: $('[data-week-status]'),
    reportSub: $('[data-report-sub]'), reportBudget: $('[data-report-budget]'), billsOf: $('[data-report-bills-of]'),
  };
  let shownInbox = new Set();

  function renderTop(d) {
    el.dow.textContent = dow(d);
    el.date.innerHTML = `${d} octombrie<span class="top__year"> ${YEAR}</span>`;
    cells.forEach((c, i) => {
      const n = i + 1;
      c.classList.toggle('is-past', n < d);
      c.classList.toggle('is-today', n === d);
      if (n === d) c.setAttribute('aria-current', 'date'); else c.removeAttribute('aria-current');
    });
  }

  function renderHome(d) {
    const today = EVENTS[d] || [];
    el.today.innerHTML = today.length
      ? today.map((e) => `<li>${esc(e[1])}</li>`).join('')
      : '<li class="quiet">Nimic de făcut azi.</li>';

    const spent = spentBy(d);
    el.spent.textContent = money.format(spent);
    const pct = Math.min(1, spent / BUDGET);
    el.bar.style.transform = `scaleX(${pct.toFixed(4)})`;
    el.barLabel.setAttribute('aria-label', `${Math.round(pct * 100)}% din buget`);

    const open = BILLS.filter((b) => b.arrive <= d && b.paid > d).sort((a, b) => a.due - b.due);
    el.bills.innerHTML = open.length
      ? open.map((b) => {
        const left = b.due - d;
        const chip = left <= 3 ? `<span class="chip chip--soon">${inDays(left)}</span>` : `<span class="meta">scadentă pe ${b.due}</span>`;
        return `<li><span><span class="who">${esc(b.name)}</span><span class="meta">${esc(b.what)} · ${b.how === 'automat' ? 'plată automată' : 'de plătit'}</span></span><span><span class="amt">${ron(b.amt)}</span>${chip}</span></li>`;
      }).join('')
      : '<li class="empty">Nicio factură deschisă.</li>';

    const mail = BILLS.filter((b) => b.mail && b.arrive <= d).sort((a, b) => b.arrive - a.arrive).slice(0, 3);
    el.inbox.innerHTML = mail.length
      ? mail.map((b) => {
        const isNew = !shownInbox.has(b.id) && b.arrive === d;
        return `<li${isNew ? ' class="new"' : ''}><span><span class="who">${esc(b.name)}</span><span class="meta">primită pe ${b.arrive} oct · citită automat</span></span><span class="chip chip--ok">adăugată</span></li>`;
      }).join('')
      : '<li class="empty">Nimic nou. Facturile trimise la adresa casei apar aici.</li>';
    mail.forEach((b) => shownInbox.add(b.id));

    // the nearest thing still ahead: an unpaid bill's due day or the RCA
    const ahead = [
      ...BILLS.filter((b) => b.paid > d && b.due >= d).map((b) => ({ what: b.name, day: b.due })),
      ...(d < 19 ? [{ what: 'RCA · Dacia Duster', day: 20 }] : []),
    ].sort((a, b) => a.day - b.day)[0];
    if (ahead) { el.next.textContent = ahead.what; el.nextWhen.textContent = `${inDays(ahead.day - d)} · ${ahead.day} octombrie`; }
    else { el.next.textContent = 'ITP · Dacia Duster'; el.nextWhen.textContent = '3 noiembrie'; }
  }

  function renderWeek(d) {
    el.board.innerHTML = Object.keys(WEEK).map(Number).map((day) => {
      const tasks = WEEK[day];
      const cls = ['day', day === PEAK_DAY ? 'day--big' : '', tasks.length ? '' : 'day--empty', day === d ? 'is-today' : '', day < d ? 'is-past' : ''].join(' ');
      const body = tasks.length
        ? tasks.map((t) => {
          const done = d >= t.doneDay;
          return `<div class="task ${done ? 'is-done' : 'is-soon'}"><p class="task__what">${esc(t.what)}${t.amt ? ` · <span class="task__amt">${ron(t.amt)}</span>` : ''}</p><p class="task__state">${esc(done ? t.done : t.soon)}</p></div>`;
        }).join('')
        : '<p class="day__empty">Nimic programat.</p>';
      return `<section class="${cls}" aria-label="${dow(day)} ${day} octombrie"><div class="day__head"><span class="day__name">${dowShort(day)}</span><span class="day__num">${day}</span></div><div class="day__tasks">${body}</div></section>`;
    }).join('');

    const all = Object.values(WEEK).flat();
    const open = all.filter((t) => d < t.doneDay).length;
    const onPeak = WEEK[PEAK_DAY].filter((t) => d < t.doneDay).length;
    if (d < 18) el.weekStatus.textContent = `${all.length} lucruri săptămâna asta. Trei cad pe 20.`;
    else if (open === 0) el.weekStatus.textContent = 'Totul rezolvat. Nimic nu a trebuit amintit de două ori.';
    else if (onPeak) el.weekStatus.textContent = `${open === 1 ? 'Un lucru deschis' : `${open} lucruri deschise`}, ${onPeak === 1 ? 'pe 20' : `${onPeak} pe 20`}.`;
    else el.weekStatus.textContent = `${open} ${plural(open, 'lucru deschis', 'lucruri deschise')}.`;
  }

  // the modules on the rail: each one reads the same day
  const MODULES = {
    acte: (d) => ({ title: 'Acte', sum: 'Buletine, pașapoarte, certificate. Te anunță cu 90 de zile înainte.', rows: [
      ['Carte de identitate · Ana', `expiră 14.01.2027`, chipIn(daysTo(2027, 0, 14, d), 120)],
      ['Pașaport · Matei', 'expiră 03.2028', ''],
      ['Certificat energetic · casa', 'valabil până în 2031', ''],
    ] }),
    masini: (d) => ({ title: 'Dacia Duster', sum: 'TM 12 MRN. RCA, ITP și rovinietă, cu memento la 30, 7 și o zi.', rows: [
      ['RCA', d >= 19 ? 'valabil până la 19.10.2027' : 'expiră pe 20 octombrie', d >= 19 ? '<span class="chip chip--ok">reînnoit</span>' : chipIn(20 - d, 7)],
      ['ITP', 'pe 3 noiembrie', chipIn(daysTo(2026, 10, 3, d), 14)],
      ['Rovinietă', 'valabilă până în 02.2027', ''],
    ] }),
    garantii: (d) => ({ title: 'Garanții', sum: 'Bonul și certificatul, păstrate până la ultima zi.', rows: [
      ['Mașina de spălat · Bosch', d > 28 ? 'expirată pe 28.10.2026' : 'expiră pe 28.10.2026', d > 28 ? '<span class="meta">bonul păstrat</span>' : chipIn(28 - d, 7)],
      ['Laptop · Matei', 'până în 06.2027', ''],
      ['Frigider', 'până în 11.2028', ''],
    ] }),
    apartament: (d) => ({ title: 'Apartament · Mehala', sum: 'Închiriat. Chiria se emite singură, chiriașul trimite indexul din aplicație.', rows: [
      ['Chiria pe octombrie', d >= 19 ? `${ron(1800)} primită` : `${ron(1800)} scadentă pe 20`, d >= 19 ? '<span class="chip chip--ok">plătită</span>' : ''],
      ['Index apometre', d >= 26 ? 'primit pe 26: 412 m³' : d >= 25 ? 'cerut chiriașului pe 25' : 'se cere pe 25', d >= 26 ? '<span class="chip chip--ok">primit</span>' : ''],
      ['Contract', 'până la 31.08.2027', ''],
    ] }),
    treburi: (d) => ({ title: 'Treburi și liste', sum: 'Cine duce gunoiul săptămâna asta, ce lipsește din frigider.', rows: [
      // weeks start on Monday 5, 12, 19, 26; the rota runs Andrei, Ioana, Matei
      ['Gunoiul', `săptămâna asta: ${['Andrei', 'Ioana', 'Matei'][((Math.floor((d + 2) / 7) - 1) % 3 + 3) % 3]}`, ''],
      ['Cumpărături', d >= 27 ? '3 produse rămase' : '7 produse', ''],
      ['De reparat', 'robinetul din baie', ''],
    ] }),
  };
  function daysTo(y, m, day, d) { return Math.round((new Date(y, m, day) - date(d)) / 86400000); }
  function chipIn(n, warn) { return n <= warn ? `<span class="chip chip--soon">${inDays(n)}</span>` : `<span class="meta">${inDays(n)}</span>`; }
  const moduleEls = $$('[data-module]');
  moduleEls.forEach((m, i) => m.style.setProperty('--i', i));
  function renderModules(d) {
    moduleEls.forEach((m) => {
      const spec = MODULES[m.dataset.module](d);
      m.className = 'module panel';
      m.innerHTML = `<h3>${esc(spec.title)}</h3><p class="module__sum">${esc(spec.sum)}</p><ul class="rows">${spec.rows.map(([a, b, c]) =>
        `<li><span><span class="who">${esc(a)}</span><span class="meta">${esc(b)}</span></span><span>${c}</span></li>`).join('')}</ul>`;
    });
  }

  // the report: final figures are sums of the arrays above, counted up across the act's progress
  const counts = {
    spent: { el: $('[data-report-count="spent"]'), to: MONTH_SPENT, fmt: (n) => money.format(n) },
    income: { el: $('[data-report-count="income"]'), to: MONTH_INCOME, fmt: (n) => money.format(n) },
    bills: { el: $('[data-report-count="bills"]'), to: BILLS_ON_TIME, fmt: (n) => String(Math.round(n)) },
    auto: { el: $('[data-report-count="auto"]'), to: BILLS.filter((x) => x.how === 'automat').length, fmt: (n) => String(Math.round(n)) },
  };
  el.billsOf.textContent = `din ${BILLS.length}`;
  el.reportBudget.textContent = `${Math.round((MONTH_SPENT / BUDGET) * 100)}% din bugetul de ${ron(BUDGET)}. Rămân ${ron(BUDGET - MONTH_SPENT)}.`;
  const reportAct = $('#raport');
  function renderReport(d) {
    el.reportSub.textContent = d >= DAYS ? 'Luna e închisă. Raportul pleacă pe email pe 1 noiembrie.' : 'Se adună pe măsură ce trece luna.';
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function tickCounts() {
    const r = ranges.find((x) => x.el === reportAct);
    if (!r) return;
    const vh = innerHeight;
    // progress through the act's own pinned travel, started a little before the pin so the
    // figures are already moving as the stage slides into view
    const p = Math.max(0, Math.min(1, (scrollY - (r.top - vh * 0.35)) / Math.max(r.h - vh * 0.65, 1)));
    const t = reduce ? 1 : easeOut(Math.min(1, p / 0.7));
    for (const k in counts) counts[k].el.textContent = counts[k].fmt(counts[k].to * t);
  }

  // the sidebar follows the act on screen
  const navLinks = $$('[data-nav]');
  function renderNav() {
    const mid = scrollY + innerHeight * 0.45;
    let current = 'acasa';
    for (const r of ranges) if (mid >= r.top) current = r.el.id;
    navLinks.forEach((a) => a.setAttribute('aria-current', a.dataset.nav === current ? 'true' : 'false'));
  }

  // the log highlights the row for the current day
  const entries = $$('.entry');
  function renderLog(d) { entries.forEach((e) => e.classList.toggle('is-today', Number(e.dataset.day) === d)); }

  // ------------------------------------------------------------------ the loop
  let lastDay = 0, queued = false;
  function frame() {
    queued = false;
    const d = dayAt(scrollY);
    if (d !== lastDay) {
      lastDay = d;
      renderTop(d); renderHome(d); renderWeek(d); renderModules(d); renderReport(d); renderLog(d);
    }
    tickCounts();
    renderNav();
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };

  // ------------------------------------------------------------------ sign-in (the close)
  const form = $('[data-login]');
  const err = $('[data-login-error]');
  const MSG = {
    'Wrong email or password': 'Email sau parolă greșită.',
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const body = { email: form.email.value.trim(), password: form.password.value };
    if (!body.email || !body.password) { err.textContent = 'Scrie emailul și parola.'; err.hidden = false; return; }
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Se verifică';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { location.href = '/#dashboard'; return; }
      err.textContent = res.status === 429 ? 'Prea multe încercări. Mai încearcă peste câteva minute.' : (MSG[data.error] || data.error || 'Nu s-a putut intra.');
    } catch {
      err.textContent = 'Serverul nu răspunde acum. Încearcă din nou.';
    }
    err.hidden = false;
    btn.disabled = false; btn.textContent = 'Intră';
  });

  // ------------------------------------------------------------------ start
  ScrollCraft.mount(document.body);
  measure();
  frame();
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { measure(); lastDay = 0; queue(); });
  // the engine sets pinned heights on mount, and fonts change heights again: re-measure once both land
  requestAnimationFrame(() => { measure(); lastDay = 0; queue(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); lastDay = 0; queue(); });
})();
