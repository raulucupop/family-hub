/* Family Hub SPA */
// registered here rather than inline in index.html: the CSP forbids inline scripts
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
let ME = null, FAMILY = null;
const CATEGORIES = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Education', 'Taxes', 'Credit', 'Subscriptions', 'Other'];
const BILL_CATS = { electricity: 'Electricity', gas: 'Gas', internet: 'Internet', mobile: 'Mobile', water: 'Water', subscription: 'Subscription', property_tax: 'Property tax', other: 'Other' };

/* ---------- icons ----------
   The navigation used whatever unicode character came closest (⌂ € ☰ ⌕ ⛟ ⚷ ❏ ☑ ⇪ ◉ ☺ ⚙), which
   meant a dozen glyphs drawn by a dozen type designers at different weights, sizes and baselines —
   ☺ and ⇪ in particular read as clip-art next to the rest. These are one family: same 24px box,
   same stroke, inheriting colour, so they sit evenly and follow the theme. */
const ICON = {
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  check: '<path d="M20.5 6.5 9.5 17.5 4 12"/>',
  // a warranty is cover: a shield, with a tick for "still claimable"
  shield: '<path d="M12 3.2 5 6v5.4c0 4.2 2.8 7.6 7 9.4 4.2-1.8 7-5.2 7-9.4V6Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  radar: '<circle cx="12" cy="12" r="3"/><path d="M12 12 19 5"/><path d="M16.9 7.1a7 7 0 1 1-9.8 0"/><path d="M19.8 4.2a11 11 0 1 1-15.6 0"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M16.5 13.5h2.5"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/>',
  // a chore is a task that comes back, so: the repeat arc with a tick inside it
  chore: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.8 4.2v4.3h-4.3"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>',
  receipt: '<path d="M5 3.5h14v17l-2.3-1.6-2.35 1.6-2.35-1.6L9.65 20.5 7.3 18.9 5 20.5Z"/><path d="M8.5 8.5h7M8.5 12.5h7"/>',
  upload: '<path d="M12 15.5V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  home: '<path d="m3 10.6 9-7.1 9 7.1"/><path d="M5.5 9.2V20.5h13V9.2"/><path d="M10 20.5v-5.5h4v5.5"/>',
  key: '<circle cx="8" cy="8" r="4.5"/><path d="m11.5 11.5 8 8"/><path d="m17 17 2-2M14.5 14.5l2-2"/>',
  car: '<path d="M4.5 16.5v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2m19 0v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2"/><path d="M2.5 16.5v-4l2-5A2 2 0 0 1 6.4 6.2h11.2a2 2 0 0 1 1.9 1.3l2 5v4Z"/><path d="M5.5 13h2m9 0h2"/>',
  file: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><path d="M14 3.5v5h5"/><path d="M8.5 13.5h7M8.5 17h4.5"/>',
  checklist: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.2 1.2 1.2 2-2.2M3.5 11.7l1.2 1.2 2-2.2M3.5 17.2l1.2 1.2 2-2.2"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.8 6-1.8 6h15.6S18 13.5 18 9Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 4.8a3.6 3.6 0 0 1 0 6.9M17.5 14.4A5.2 5.2 0 0 1 21.2 20"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.4a1.6 1.6 0 0 0 .32 1.76l.06.06a1.94 1.94 0 1 1-2.74 2.74l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.94 1.94 0 1 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.94 1.94 0 1 1-2.74-2.74l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97h-.17a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.94 1.94 0 1 1 2.74-2.74l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.94 1.94 0 1 1 2.74 2.74l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.17a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.46.97Z"/>',
  wrench: '<path d="M14.4 6.6a3.9 3.9 0 0 0 5.1 5.1l-8 8a2.4 2.4 0 0 1-3.4-3.4Z"/><path d="M14.4 6.6 17 4a3.9 3.9 0 0 1 3 7.7"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  logout: '<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9"/>',
};
// 1.7 stroke reads crisply at the 18-20px these are used at, without going spindly on a phone
const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name] || ''}</svg>`;
// Only properties we own can be attached to household money (an expense, a bill, a credit): a
// managed one keeps its own books. The server refuses those links; leaving them out of the pickers
// means nobody has to discover that by hitting an error.
const ownProps = (list) => (list || []).filter((p) => !p.managed);
// one stable colour per category, keyed by position in CATEGORIES, so a category reads as the same
// colour everywhere — the dashboard donut and the expense-list dots. Two palettes: the donut/dots
// pick the theme-matched one at render time. (Same values the donut already used.)
/* Category colours, re-stepped against the palette validator (OKLab ΔE, CVD-simulated).
   The old set failed badly: Entertainment #b23a2e and Other #a0522d were ΔE 0.3 apart for a
   deuteranope — literally the same colour — and Transportation #5b7fa6 vs Subscriptions #4a8fb0
   were 4.5 apart for FULL colour vision, i.e. nobody could tell those two blues apart. These nine
   identity hues now clear both gates in light and dark (CVD 9.2/9.4 against a target of 8;
   normal-vision 19.6/19.3 against a floor of 15). Order is fixed and tied to the category, never to
   rank, so filtering a chart never repaints the survivors.
   'Other' is deliberately the neutral gray — it is a residual, not an identity, and a gray says so.
   Nine identities is past what any palette can separate for EVERY pair (measured: the best
   achievable worst-pair is ΔE ~5, well under the 15 floor — a hard ceiling, not a search failure),
   so the nine are at least drawn from nine different hue families, and the one chart where colour
   could carry meaning alone — the doughnut — folds to six slices and prints name, amount and share
   beside every swatch. Identity never rests on the colour.
   Three light-mode hues sit under 3:1 against the surface, which the validator allows only with a
   visible label; every swatch in this app is drawn beside its category name. */
const CAT_PALETTE_LIGHT = ['#e34948', '#2a78d6', '#8a5a2b', '#a63d8f', '#eda100', '#e87ba4', '#4a3aa7', '#1baf7a', '#eb6834', '#6f7772'];
const CAT_PALETTE_DARK = ['#e66767', '#3987e5', '#b98047', '#c760ad', '#c98500', '#d55181', '#9085e9', '#199e70', '#d95926', '#9aa39d'];
function catColor(category) {
  const pal = document.documentElement.dataset.theme === 'dark' ? CAT_PALETTE_DARK : CAT_PALETTE_LIGHT;
  const i = CATEGORIES.indexOf(category);
  return pal[(i < 0 ? CATEGORIES.length - 1 : i) % pal.length]; // unknown -> the 'Other' colour
}
// a small coloured initial + name, so "who paid" is scannable in a dense list
function whoChip(name) {
  const n = (name || '').trim();
  if (!n) return '<span class="muted">—</span>';
  return `<span class="who"><span class="who-av avatar-fallback" style="--avh:${avatarHue(n)}">${esc(n.charAt(0).toUpperCase())}</span>${esc(n)}</span>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- language (English default, Romanian overlay) ----------
   The UI is authored in English; when the user's language is Romanian, a post-render pass
   swaps matching text nodes and placeholders using this dictionary. Unmatched text stays English. */
const RO = {
  // navigation: the phone tab bar + the "More" sheet
  'Money': 'Bani', 'More': 'Mai mult', 'Search': 'Căutare',
  // search page
  'Across expenses, income, bills, acte, credits, cars, properties and lists.': 'Prin cheltuieli, venituri, facturi, acte, credite, mașini, proprietăți și liste.',
  'Type at least 2 characters.': 'Scrie cel puțin 2 caractere.', 'Nothing found': 'Nimic găsit',
  'Tip: press Ctrl+K (or /) anywhere to search without leaving the page.': 'Sfat: apasă Ctrl+K (sau /) oriunde pentru a căuta fără să părăsești pagina.',
  'result': 'rezultat', 'results': 'rezultate',
  // View, not Open — the word Open is already taken further down as the maintenance status
  // (Deschis, adjective), and a later duplicate key silently wins over this button (Deschide, verb)
  'View': 'Vezi',
  'Expense': 'Cheltuială', 'List': 'Listă',
  // first run
  'Welcome — start here': 'Bun venit — începe aici',
  'Nothing is set up yet. Add any one of these and this page fills in.': 'Nimic nu e configurat încă. Adaugă oricare dintre acestea și pagina se completează.',
  'Add a bill': 'Adaugă o factură', 'Add your car': 'Adaugă mașina', 'Add a property': 'Adaugă o proprietate',
  'Log an expense': 'Înregistrează o cheltuială', 'Invite the family': 'Invită familia',
  'Dashboard': 'Panou', 'Budget & expenses': 'Buget și cheltuieli', 'Bills': 'Facturi', 'Vehicles': 'Vehicule',
  'Properties': 'Proprietăți', 'Acte': 'Acte', 'Bank import': 'Import bancar', 'Family': 'Familie', 'Settings': 'Setări',
  'Sign out': 'Deconectare', // the arrow became an icon, so the label is just the word now
  'Sign in': 'Autentificare', 'Register': 'Înregistrare', 'New family': 'Familie nouă', 'Tenant': 'Chiriaș',
  'Forgot password?': 'Ai uitat parola?', 'Back to sign in': 'Înapoi la autentificare', 'Send reset link': 'Trimite linkul de resetare',
  'Email': 'Email', 'Password': 'Parolă', 'Your name': 'Numele tău', 'Family name': 'Numele familiei', 'Invite code': 'Cod de invitație',
  'Create family': 'Creează familia', 'Save new password': 'Salvează parola nouă', 'Choose a new password': 'Alege o parolă nouă',
  // money
  'Expenses': 'Cheltuieli', 'Income': 'Venituri', 'Budgets': 'Bugete', 'Credits': 'Credite', 'Savings': 'Economii',
  'Track what comes in, what goes out, and set monthly limits.': 'Urmărește ce intră, ce iese și setează limite lunare.',
  'Export expenses (CSV)': 'Exportă cheltuieli (CSV)',
  'Add expense': 'Adaugă cheltuială', 'Add income': 'Adaugă venit', 'Date': 'Data', 'Category': 'Categorie', 'Amount': 'Sumă',
  'Paid by credit card': 'Plătit cu cardul de credit', 'on card': 'pe card', 'On the credit card': 'Pe cardul de credit',
  'Not counted as spent — the money leaves the account when you pay the card bill.':
    'Nu intră la cheltuit — banii pleacă din cont când achiți factura cardului.',
  'Note': 'Notă', 'optional': 'opțional', 'Source': 'Sursă', 'All categories': 'Toate categoriile', 'All time': 'Tot timpul',
  'Search note…': 'Caută notă…', 'Whole family': 'Toată familia', 'No matching expenses': 'Nicio cheltuială găsită',
  'Adjust the filters or add one above.': 'Ajustează filtrele sau adaugă una mai sus.', 'By': 'De cine', 'Delete': 'Șterge',
  'Close': 'Închide', 'Retry': 'Reîncearcă', "Couldn't load this": 'Nu s-a putut încărca',
  'Charts are unavailable offline.': 'Graficele nu sunt disponibile offline.',
  'Income history': 'Istoric venituri', 'Monthly budgets': 'Bugete lunare', 'Save budgets': 'Salvează bugetele',
  'Add or remove funds': 'Adaugă sau retrage fonduri', 'Economy account balance': 'Sold cont de economii',
  'Deposit (add)': 'Depunere (adaugă)', 'Withdraw (remove)': 'Retragere', 'History': 'Istoric', 'Save': 'Salvează',
  'Savings goals': 'Obiective de economisire', 'Goal': 'Obiectiv', 'Add goal': 'Adaugă obiectiv',
  'New goal': 'Obiectiv nou',
  'Mark done': 'Finalizat', 'Reopen': 'Redeschide', 'reached!': 'atins!', '— general —': '— general —',
  'Add credit (loan)': 'Adaugă credit', 'Add credit': 'Adaugă credit', 'Anticipated payments': 'Plăți anticipate', 'Add payment': 'Adaugă plată',
  // dashboard
  'This month': 'Luna aceasta', 'Last 3 months': 'Ultimele 3 luni', 'Last 6 months': 'Ultimele 6 luni', 'Last 12 months': 'Ultimele 12 luni',
  'Whole family (total)': 'Toată familia (total)', 'Left over': 'Rămas', 'Income vs spending': 'Venituri vs cheltuieli',
  'Coming up — next 60 days': 'Urmează — următoarele 60 de zile', 'Nothing due soon': 'Nimic scadent curând',
  // (the KPI comparison sentence is written per language inside deltaHtml, not composed here)
  // rent on the dashboard
  'Rent this month': 'Chiria luna aceasta', 'due': 'scadentă', 'day late': 'zi întârziere', 'days late': 'zile întârziere',
  'Open Properties': 'Deschide Proprietăți',
  // bills
  'Bills & invoices': 'Facturi', 'Add bill': 'Adaugă factură', 'Name': 'Nume', 'Provider': 'Furnizor', 'Due date': 'Scadență',
  'Repeats': 'Se repetă', 'Responsible person': 'Persoana responsabilă', 'Linked property': 'Proprietate asociată',
  'Auto-paid subscription': 'Abonament plătit automat', 'Owner': 'Proprietar', 'Due': 'Scadent', 'Status': 'Stare', 'Invoice': 'Factură',
  'Mark paid': 'Marchează plătit', 'Edit': 'Editează', 'Save changes': 'Salvează modificările',
  'More actions': 'Mai multe acțiuni',
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
  '☀ Light': '☀ Luminos', '🌙 Dark': '🌙 Întunecat', '◑ System': '◑ Sistem', 'Language': 'Limbă', 'Your profile': 'Profilul tău',
  'Upload picture': 'Încarcă poză', 'Remove': 'Elimină', 'Display name': 'Nume afișat', 'Save name': 'Salvează numele',
  'Save profile': 'Salvează profilul', 'Birthday': 'Zi de naștere', 'Phone number': 'Număr de telefon',
  "Children's pictures": 'Pozele copiilor', 'Upload': 'Încarcă',
  // family
  'Invite someone': 'Invită pe cineva', 'Copy code': 'Copiază codul', 'Copy link': 'Copiază linkul', 'Generate new code': 'Generează cod nou',
  'Members': 'Membri', 'Add a child (no account)': 'Adaugă un copil (fără cont)', 'Add child': 'Adaugă copil',
  'Family settings': 'Setări familie', 'Currency': 'Monedă', 'Send invite': 'Trimite invitația', 'Role': 'Rol', 'no login': 'fără cont',
  // alerts
  'Alerts': 'Alerte', 'Mark all as read': 'Marchează toate ca citite', 'Browser notifications': 'Notificări în browser',
  'Handled': 'Rezolvat', 'Hidden for 7 days': 'Ascunsă 7 zile',
  'Alert hidden — it comes back if the deadline is renewed': 'Alertă ascunsă — reapare când reînnoiești termenul',
  // lists
  'Lists': 'Liste', 'Buy wishlist': 'De cumpărat', 'Travel wishlist': 'Călătorii', 'Grocery list': 'Cumpărături',
  'Personal targets': 'Obiective personale', 'Wishlists, groceries and personal goals for the whole family.': 'Liste de dorințe, cumpărături și obiective personale pentru toată familia.',
  // christening guest list
  'Christening guests': 'Invitații botez', 'Invitation': 'Invitație', 'Adults': 'Adulți', 'Children': 'Copii',
  'adults': 'adulți', 'children': 'copii', 'Coming': 'Confirmat', 'Declined': 'Refuzat', 'declined': 'refuzați',
  'Answer': 'Răspuns', 'Answers': 'Răspunsuri', 'Gift': 'Cadou', 'Gifts': 'Cadouri', 'recorded': 'înregistrate',
  'No invitations yet': 'Nicio invitație încă', 'leave empty to clear': 'lasă gol ca să ștergi',
  'No answer yet': 'Fără răspuns încă',
  'Seats': 'Scaun', 'Seats only, no menu': 'Doar scaun, fără meniu', 'seats only': 'doar scaun',
  // seating plan: who sits at which table
  'Invitations': 'Invitați', 'Seating': 'Așezare la mese', 'Confirmed': 'Confirmați',
  'invitation': 'invitație', 'invitations': 'invitații', 'table': 'masă', 'tables': 'mese',
  'Seats in the room': 'Locuri în sală', 'Still to seat': 'Rămași de așezat',
  'more than the room holds': 'peste cât încape în sală', 'spare': 'libere',
  'Not seated yet': 'Neașezați', 'Everyone has a chair.': 'Toată lumea are loc.',
  'Confirmed guests show up here.': 'Invitații confirmați apar aici.',
  'Table': 'Masa', 'empty': 'goală', 'over capacity': 'peste capacitate',
  'Add tables': 'Adaugă mese', 'How many': 'Câte', 'Seats each': 'Locuri la fiecare',
  'Rename this table': 'Redenumește masa', 'Name for this table': 'Numele mesei',
  'How many seats does it have?': 'Câte locuri are?', 'Cancel': 'Renunță',
  'seat': 'scaun', 'seats': 'scaune',
  'Drag a guest onto a table, or tap the guest and then the table.': 'Trage un invitat pe o masă, sau apasă invitatul și apoi masa.',
  // charts & insights
  'What you kept': 'Ce ai păstrat', 'Kept': 'Păstrat',
  // chores
  'Chores': 'Treburi', 'Chore': 'Treabă', 'New chore': 'Treabă nouă', 'Add chore': 'Adaugă treabă',
  'Recurring jobs around the house. Ticking one marks it done for today — it comes back tomorrow.':
    'Treburi care se repetă prin casă. Când bifezi una, e gata pe ziua de azi — mâine revine.',
  'Left for today': 'Rămase azi', 'Done today': 'Făcute azi', 'Done this week': 'Făcute săptămâna asta',
  'How often': 'Cât de des', 'Day': 'Ziua', 'Any day': 'Oricând', 'any day this week': 'oricând săptămâna asta',
  'Daily': 'Zilnic', 'Weekly': 'Săptămânal',
  // safe to spend + tenancy contract
  'Safe to spend today': 'Poți cheltui azi',
  'Charge': 'Taxă', 'Repair': 'Reparație', 'Deadline': 'Termen',
  'Contract & deposit': 'Contract și garanție', 'Lease start': 'Început contract', 'Lease end': 'Sfârșit contract',
  'Notice (days)': 'Preaviz (zile)', 'Notice by': 'Preaviz până la', 'Tenancy ends': 'Contractul expiră',
  'Deposit': 'Garanție', 'held': 'reținută', 'returned': 'returnată',
  'Mark deposit returned': 'Marchează garanția returnată', 'Deposit is held again': 'Garanția e reținută din nou',
  'No contract recorded yet. Add the end date and the notice period and both land in your deadlines.':
    'Niciun contract înregistrat. Adaugă data de expirare și preavizul, iar amândouă ajung în termenele tale.',
  'Give notice': 'Dă preaviz',
  'Changing this relabels existing amounts — it does not convert them.':
    'Schimbarea reetichetează sumele existente — nu le convertește.',
  'Chores today': 'Treburi azi', 'All chores done for today': 'Toate treburile pe azi sunt gata',
  'See all': 'Vezi toate',
  'Everyone': 'Toată lumea', 'Nobody in particular': 'Fără responsabil', 'Anyone': 'Oricine', 'anyone': 'oricine',
  'by the hourly job': 'de cron-ul orar', 'when you opened the app': 'la deschiderea aplicației',
  'by itself': 'singură', 'because you pressed check': 'fiindcă ai apăsat verifică',
  'by the daily round': 'la rondul zilnic',
  'Watch Comuna Bucovăț': 'Urmărește Comuna Bucovăț',
  'Adds comunabucovat.ro with licitatie, teren, concesiune and vanzare as keywords.': 'Adaugă comunabucovat.ro cu licitatie, teren, concesiune și vanzare drept cuvinte cheie.',
  'Set up. From now on you only have to look here.': 'Gata. De acum trebuie doar să te uiți aici.',
  'Not checked yet — it will look shortly.': 'Încă neverificat — se uită în scurt timp.',
  'checks itself, nothing for you to press': 'se verifică singură, nu ai ce apăsa',
  'just now': 'chiar acum', 'min ago': 'min în urmă', 'h ago': 'h în urmă', 'days ago': 'zile în urmă',
  // watched public pages
  'Watched pages': 'Pagini urmărite',
  'Public pages checked for you, so an announcement does not go by unnoticed.': 'Pagini publice verificate în locul tău, ca să nu-ți mai scape un anunț.',
  'Announcements': 'Anunțuri', 'Pages': 'Pagini', 'Check now': 'Verifică acum', 'Checking…': 'Verific…', 'Checked': 'Verificat',
  'Not able to check': 'Nu am putut verifica', 'Nothing new': 'Nimic nou', 'new': 'nou',
  'matches your keywords': 'se potrivește cu cuvintele tale', 'Open the notice': 'Deschide anunțul',
  'Nothing spotted yet': 'Nimic găsit încă',
  'The pages are being watched. Anything new will show up here and in your email.': 'Paginile sunt urmărite. Orice apare nou ajunge aici și pe email.',
  'Add the page of your commune below and anything new posted there lands here.': 'Adaugă mai jos pagina comunei, iar orice se publică acolo ajunge aici.',
  'No pages watched yet': 'Nicio pagină urmărită încă', 'Add one below.': 'Adaugă una mai jos.',
  'Page': 'Pagina', 'Seen': 'Văzute', 'not yet': 'încă niciodată', 'text of the page': 'textul paginii',
  'Watch a page': 'Urmărește o pagină', 'Watch it': 'Urmărește',
  'What to read': 'Ce să citească', 'The site feed (recommended)': 'Fluxul site-ului (recomandat)',
  'The text of the page': 'Textul paginii', 'Keywords': 'Cuvinte cheie',
  'licitatie, teren, concesiune': 'licitatie, teren, concesiune', 'Comuna Bucovăț': 'Comuna Bucovăț',
  'new notice': 'anunț nou', 'new notices': 'anunțuri noi',
  'Noted what is there now — you will hear about anything new.': 'Am notat ce e acum — o să afli despre orice apare nou.',
  'Watching. The first check records what is already there, quietly.': 'Urmăresc. Prima verificare notează în tăcere ce e deja acolo.',
  'Most councils run WordPress: add /feed/ to the address and every notice arrives with its own title and link. Keywords only highlight — everything new is reported either way.': 'Majoritatea primăriilor au WordPress: adaugă /feed/ la adresă și fiecare anunț vine cu titlu și link. Cuvintele cheie doar evidențiază — orice e nou apare oricum.',
  'done by': 'făcut de', 'Feed the dogs': 'Dat de mâncare la câini',
  // the to-do list: jobs with no cadence, done once and then done
  'To-do': 'De făcut', 'Still to do': 'Rămase de făcut', 'Ticked off': 'Bifate',
  'Nothing on the list': 'Nimic pe listă',
  'Add a one-off job below — it stays put until someone ticks it.': 'Adaugă mai jos un lucru de făcut o singură dată — rămâne acolo până îl bifează cineva.',
  'New task': 'Sarcină nouă', 'Task': 'Sarcină', 'Add task': 'Adaugă sarcina',
  'Change the front door lock': 'Schimbat yala de la intrare',
  'One-off jobs. Ticking one is the end of it — nothing comes back tomorrow.': 'Lucruri de făcut o singură dată. Când bifezi unul, s-a terminat — nu revine mâine.',
  'By when': 'Până când', 'by': 'până', 'no deadline': 'fără termen',
  'Add a chore below and it will show up every day.': 'Adaugă o treabă mai jos și va apărea în fiecare zi.',
  'Monday': 'Luni', 'Tuesday': 'Marți', 'Wednesday': 'Miercuri', 'Thursday': 'Joi',
  'Friday': 'Vineri', 'Saturday': 'Sâmbătă', 'Sunday': 'Duminică',
  'Income minus spending, month by month. Below the line means you spent more than came in.':
    'Venituri minus cheltuieli, lună de lună. Sub linie înseamnă că ai cheltuit mai mult decât ai încasat.',
  'the faint mark is the same month in': 'linia estompată e aceeași lună din',
  'Category trends': 'Cum evoluează categoriile',
  'Where the money is drifting, month by month.': 'Încotro se duc banii, lună de lună.',
  'since the start of the year': 'de la începutul anului', 'flat': 'constant',
  'not enough history': 'prea puțin istoric',
  'Add the first family above — adults and children are counted for you.': 'Adaugă prima familie mai sus — adulții și copiii se numără automat.',
  'Item': 'Articol', 'Target': 'Obiectiv', 'Person': 'Persoană', 'Nothing here yet': 'Nimic aici încă',
  'Add the first item above.': 'Adaugă primul articol mai sus.',
  // auth extras
  'One place for the household: budget, bills, cars and property deadlines — RCA, rovinietă, ITP, PAD included.':
    'Un singur loc pentru gospodărie: buget, facturi, mașini și termene pentru proprietăți — RCA, rovinietă, ITP, PAD incluse.',
  "Tell us your account email and we'll send a link to choose a new password.": 'Spune-ne emailul contului și îți trimitem un link pentru a alege o parolă nouă.',
  'Password (min. 8 characters)': 'Parolă (min. 8 caractere)', 'New password (min. 8 characters)': 'Parolă nouă (min. 8 caractere)',
  'from your family admin or landlord': 'de la adminul familiei sau de la proprietar',
  'If that email has an account, the reset link is on its way': 'Dacă emailul are un cont, linkul de resetare e pe drum',
  'Password changed — you are signed in': 'Parola a fost schimbată — ești autentificat',
  // roles & common words
  'adult': 'adult', 'child': 'copil', 'tenant': 'chiriaș', '(you)': '(tu)', '(me)': '(eu)',
  'Loading…': 'Se încarcă…', 'Loading calendar…': 'Se încarcă calendarul…', 'Loading history…': 'Se încarcă istoricul…',
  'Copied:': 'Copiat:', 'Copy failed — select it manually': 'Copierea a eșuat — selectează manual',
  'view': 'vezi', 'attach': 'atașează', 'photo': 'poză', 'Saved': 'Salvat', 'Added': 'Adăugat', 'Removed': 'Eliminat', 'Done': 'Gata',
  'paid': 'plătit', 'unpaid': 'neplătit', 'overdue': 'întârziat', 'waiting': 'în așteptare', 'Request failed': 'Cererea a eșuat',
  'whole family': 'toată familia', 'day': 'ziua', 'more': 'altele', 'None': 'Niciuna',
  // categories (display only — option values stay English)
  'Groceries': 'Alimente', 'Utilities': 'Utilități', 'Transportation': 'Transport', 'Entertainment': 'Divertisment',
  'Healthcare': 'Sănătate', 'Education': 'Educație', 'Taxes': 'Taxe', 'Subscriptions': 'Abonamente', 'Other': 'Altele',
  'Electricity': 'Electricitate', 'Gas': 'Gaz', 'Mobile': 'Mobil', 'Water': 'Apă', 'Subscription': 'Abonament',
  'electricity': 'electricitate', 'gas': 'gaz', 'water': 'apă', 'property_tax': 'impozit proprietate', 'other': 'altele',
  // server reminder labels
  'RCA insurance': 'Asigurare RCA', 'Casco insurance': 'Asigurare Casco', 'Rovinieta (vignette)': 'Rovinietă',
  'ITP inspection': 'Inspecție ITP', 'Vehicle tax': 'Taxă auto', 'Property insurance (PAD)': 'Asigurare locuință (PAD)',
  'Additional home insurance': 'Asigurare facultativă locuință', 'Property tax': 'Impozit proprietate',
  // the weekly two minutes
  'This week': 'Săptămâna asta', 'What changed': 'Ce s-a schimbat', 'What needs you': 'Ce are nevoie de tine',
  'Does the money hold': 'Ies banii', 'Done for this week': 'Gata pe săptămâna asta',
  'What changed since': 'Ce s-a schimbat de pe', 'See you next week': 'Pe săptămâna viitoare',
  'Nothing happened while you were away.': 'Nu s-a întâmplat nimic cât ai lipsit.',
  'Nothing is waiting on a decision.': 'Nimic nu așteaptă o decizie.',
  'Reading came in': 'A venit citirea', 'Reported broken': 'S-a raportat stricat', 'New notice': 'Anunț nou',
  'Bill paid': 'Factură plătită', 'Repairs still open': 'Reparații deschise', 'Readings still missing': 'Citiri lipsă',
  'Confirm': 'Confirmă', 'Marked as paid': 'Marcată ca plătită',
  'the balance is old — update it': 'soldul e vechi — actualizează-l',
  'Enter what is in the account on the dashboard and this answers itself.': 'Scrie pe dashboard cât ai în cont și răspunsul apare singur.',
  'Everything below is from the last seven days. Once you tick this off, next time shows only what is new since then.':
    'Tot ce e mai jos e din ultimele șapte zile. După ce bifezi, data viitoare vezi doar ce e nou de atunci.',
  // house dashboard feed
  'House dashboard': 'Panou în casă', 'New address': 'Adresă nouă', 'Create the address': 'Creează adresa',
  'Address ready': 'Adresă gata', 'Copy': 'Copiază',
  'A read-only address Home Assistant can read to show these numbers on a wall panel. It gives out figures only — no names, no notes, no addresses — and it cannot change anything here.':
    'O adresă doar-citire pe care Home Assistant o poate citi ca să arate cifrele astea pe un panou. Dă doar cifre — fără nume, fără notițe, fără adrese — și nu poate schimba nimic aici.',
  // balance forecast
  'How the month ends': 'Cum se termină luna', 'now': 'acum', 'Lowest point:': 'Cel mai jos:', 'on': 'pe',
  'Until': 'Până pe', 'What moves it': 'Ce îl mișcă', 'In the account': 'În cont', 'On': 'La data de',
  'Save balance': 'Salvează soldul', 'Balance saved': 'Sold salvat', 'Balance from': 'Sold din',
  'update it': 'actualizează-l', 'Not counted, another currency:': 'Necontorizat, altă monedă:',
  'Nothing due drops the balance below where it is now.': 'Nimic din ce urmează nu duce soldul sub cât e acum.',
  'Type in what is in the account and the app works out the rest — bills, rates, salary, rent.':
    'Scrie cât ai în cont și aplicația calculează restul — facturi, rate, salariu, chirie.',
  // warranties
  'Warranties': 'Garanții', 'Warranty': 'Garanție', 'Add warranty': 'Adaugă garanție', 'Warranty added': 'Garanție adăugată',
  'Thing': 'Obiect', 'Bought from': 'Cumpărat de la', 'Bought': 'Cumpărat', 'Cover ends': 'Garanția expiră',
  'Receipt': 'Bon', 'receipt': 'bon', 'Receipt attached': 'Bon atașat',
  'Serial number': 'Serie', 'Purchase date': 'Data cumpărării', 'Cover (months)': 'Garanție (luni)',
  'or, cover ends on': 'sau, expiră pe', 'Price': 'Preț', 'Running out soon': 'Expiră curând',
  'Cover already ended': 'Garanții expirate', 'Nothing under warranty yet': 'Nicio garanție încă',
  'Receipt (PDF or photo)': 'Bon (PDF sau poză)',
  'Appliances, electronics, tools — what is still under cover, who you claim from, and the receipt that proves it.':
    'Electrocasnice, electronice, scule — ce mai e în garanție, la cine reclami și bonul care o dovedește.',
  'Add the fridge, the phone, the drill — anything with a receipt worth keeping.':
    'Adaugă frigiderul, telefonul, bormașina — orice are un bon care merită păstrat.',
  'Warranty saved, but the receipt failed:': 'Garanția a fost salvată, dar bonul nu:',
  'Water meter reading': 'Citire contor apă', 'Gas meter reading': 'Citire contor gaz',
  'Electricity meter reading': 'Citire contor curent',
  // dashboard
  'Add bills, vehicle or property deadlines and they will line up here.': 'Adaugă facturi sau termene pentru vehicule și proprietăți și vor apărea aici.',
  'Nothing assigned to this person is coming up.': 'Nimic atribuit acestei persoane nu urmează.',
  'Spent': 'Cheltuit', 'Spending by category': 'Cheltuieli pe categorii', 'Budget vs actual': 'Buget vs realizat',
  'No budgets set for this month yet.': 'Niciun buget setat pentru luna aceasta.',
  'Set from my 3-month average': 'Setează din media pe 3 luni', 'You can fine-tune them afterwards.': 'Le poți ajusta după aceea.',
  'Set them in': 'Setează-le în',
  'No budgets set for this month yet — set them in': 'Niciun buget setat pentru luna aceasta — setează-le în',
  'No expenses this month yet.': 'Nicio cheltuială luna aceasta.', 'History appears once you log expenses.': 'Istoricul apare după ce înregistrezi cheltuieli.',
  // calendar
  'Today': 'Azi', "Subscribe from your phone's calendar": 'Abonează-te din calendarul telefonului',
  'Add this address in Google Calendar (Other calendars → From URL) or Apple Calendar (Add Subscription Calendar) — deadlines then show up in your normal calendar and update automatically.':
    'Adaugă această adresă în Google Calendar (Alte calendare → De la URL) sau Apple Calendar (Adaugă calendar cu abonament) — termenele apar în calendarul tău obișnuit și se actualizează automat.',
  'New link': 'Link nou', 'Generate a private link and subscribe from Google/Apple Calendar.': 'Generează un link privat și abonează-te din Google/Apple Calendar.',
  'Generate subscribe link': 'Generează link de abonare', 'Ask an adult to generate the subscribe link.': 'Roagă un adult să genereze linkul de abonare.',
  'Generate a new link? The old one stops working.': 'Generezi un link nou? Cel vechi nu va mai funcționa.', 'Subscribe link ready': 'Linkul de abonare e gata',
  // expenses
  'Link to (optional)': 'Asociază cu (opțional)', 'Nothing': 'Nimic', '● All time': '● Tot timpul',
  'Expense added': 'Cheltuială adăugată', 'Delete this expense?': 'Ștergi această cheltuială?',
  'Deleted': 'Șters', 'Undo': 'Anulează',
  'Expense updated': 'Cheltuială actualizată',
  'Recurring expenses': 'Cheltuieli recurente',
  "Fixed monthly costs that aren't bills — logged automatically every month on the chosen day.": 'Costuri lunare fixe care nu sunt facturi — înregistrate automat în fiecare lună în ziua aleasă.',
  'Recurring expense added': 'Cheltuială recurentă adăugată',
  'Delete this recurring expense? Already-logged months stay.': 'Ștergi această cheltuială recurentă? Lunile deja înregistrate rămân.',
  // password ('Password' itself is already in the auth block above)
  'Changing it signs you out on every other device.': 'Schimbarea ei te deconectează de pe toate celelalte dispozitive.',
  'Current password': 'Parola actuală', 'Change password': 'Schimbă parola',
  'Show password': 'Arată parola', 'Hide password': 'Ascunde parola',
  'Password changed — your other devices are signed out': 'Parolă schimbată — celelalte dispozitive au fost deconectate',
  'Your current password is not right': 'Parola actuală nu este corectă',
  'The new password must be at least 8 characters': 'Parola nouă trebuie să aibă cel puțin 8 caractere',
  'Password changed — sign in again': 'Parola a fost schimbată — autentifică-te din nou',
  'Confirm new password': 'Confirmă parola nouă',
  'The new passwords do not match': 'Parolele noi nu coincid',
  // income
  'Recurring income (salaries)': 'Venituri recurente (salarii)',
  'Logged automatically every month on the chosen day — no manual entry needed.': 'Înregistrate automat în fiecare lună în ziua aleasă — fără introducere manuală.',
  'paused': 'în pauză', 'Pause': 'Pauză', 'Resume': 'Reia', 'Add recurring': 'Adaugă recurent',
  'Amount (RON/mo)': 'Sumă (RON/lună)', 'Amount (RON)': 'Sumă (RON)', 'Day of month': 'Ziua din lună',
  'No income recorded yet': 'Niciun venit înregistrat încă', 'Log salaries and other income to see the monthly balance.': 'Înregistrează salarii și alte venituri pentru a vedea balanța lunară.',
  'Income added': 'Venit adăugat', 'Recurring income added': 'Venit recurent adăugat',
  'Delete this recurring income? Already-logged months stay.': 'Ștergi acest venit recurent? Lunile deja înregistrate rămân.',
  // budgets
  'Budget': 'Buget', 'Progress': 'Progres', 'no budget': 'fără buget', 'Budgets saved': 'Bugete salvate',
  // savings
  'No contributions yet.': 'Nicio contribuție încă.', 'No goals yet — set one below and tag deposits to it.': 'Niciun obiectiv încă — setează unul mai jos și leagă depunerile de el.',
  '· family': '· familie', 'Target (RON)': 'Țintă (RON)', 'Goal added': 'Obiectiv adăugat',
  'Delete this goal? Its deposits stay in the account.': 'Ștergi acest obiectiv? Depunerile rămân în cont.',
  'No savings entries yet': 'Nicio intrare în economii încă', 'Deposit funds above to start the family economy account.': 'Depune fonduri mai sus pentru a porni contul de economii al familiei.',
  'Delete this entry?': 'Ștergi această intrare?',
  // credits
  'Lender': 'Bancă / creditor', 'Principal (RON)': 'Principal (RON)', 'Dobândă (% / year)': 'Dobândă (% / an)',
  'Term (months)': 'Durată (luni)', 'Commission (RON/mo, fixed)': 'Comision (RON/lună, fix)', 'Start date': 'Data de început', 'Holder': 'Titular',
  'No credits yet': 'Niciun credit încă',
  'Add a loan above — the monthly payment is calculated from the dobândă, and anticipated payments show how much interest you save.':
    'Adaugă un credit mai sus — rata lunară e calculată din dobândă, iar plățile anticipate arată câtă dobândă economisești.',
  'Monthly total': 'Total lunar', 'principal': 'principal', 'interest': 'dobândă', 'com.': 'com.',
  // debt overview
  'Debt': 'Datorii', 'No debt': 'Nicio datorie', 'Owed today': 'Datorat azi', 'Every month': 'În fiecare lună',
  'Debt-free': 'Fără datorii din', 'loan': 'credit', 'loans': 'credite', 'Loans': 'Credite', 'Credit': 'Credit',
  'instalments + commission': 'rate + comision', 'Interest': 'Dobândă', 'Total cost of borrowing': 'Costul total al împrumutului',
  'paid so far': 'plătită până acum', 'still to pay': 'rămasă de plătit',
  'Nothing outstanding — add a loan under Credits, or record money you lent below.': 'Nimic de plată — adaugă un credit la Credite, sau notează mai jos banii pe care i-ai împrumutat altcuiva.',
  // money lent to people — the other direction of debt
  'Money lent': 'Bani împrumutați', 'Still out with people': 'Încă la alții', 'Settled': 'Închis',
  'is past its date': 'a trecut de termen', 'are past their date': 'au trecut de termen',
  'lent': 'dat', 'back': 'înapoi', 'due back': 'de returnat', 'no date agreed': 'fără termen stabilit',
  'Record repayment': 'Notează o restituire', 'Repayment recorded': 'Restituire notată', 'Loan recorded': 'Împrumut notat',
  'Nobody owes you anything': 'Nu-ți datorează nimeni nimic',
  'Record money you lend out and what comes back is tracked here.': 'Notează banii pe care îi dai cu împrumut, iar ce se întoarce se ține minte aici.',
  'Lend money': 'Împrumută bani', 'Who has it': 'La cine sunt', 'Due back': 'De returnat până',
  // year in review
  'Year': 'An', 'Monthly average': 'Media lunară',
  'months with spending': 'luni cu cheltuieli', 'month with spending': 'lună cu cheltuieli',
  'Month by month': 'Lună de lună', 'What moved': 'Ce s-a schimbat', 'Change': 'Diferență', 'Biggest expenses': 'Cele mai mari cheltuieli',
  // backup
  'Backup': 'Copie de siguranță', 'Download backup': 'Descarcă copia', 'Backup downloaded': 'Copie descărcată',
  'A compressed copy of the whole database, taken cleanly while the app keeps running. Scans and invoices are not in it — those live in the uploads folder.':
    'O copie comprimată a întregii baze de date, făcută curat în timp ce aplicația rulează. Scanările și facturile nu sunt incluse — ele stau în folderul uploads.',
  '1 month in advance (principal + 1%)': 'O lună în avans (principal + 1%)', 'Balance today': 'Sold azi', 'Payoff': 'Achitare', 'mo left': 'luni rămase',
  // paying a number of instalments ahead, rather than typing a sum
  'month': 'lună', 'Months paid off': 'Luni achitate în avans', 'Expected for': 'Estimat pentru',
  'enter what the bank actually charged.': 'introdu cât ți-a cerut banca de fapt.',
  'cleared!': 'achitat integral!', 'on schedule': 'conform planului', 'in advance': 'în avans',
  'What if you paid extra every month?': 'Dar dacă ai plăti în plus în fiecare lună?',
  'Money saved (interest)': 'Bani economisiți (dobândă)', 'Total interest projected': 'Dobândă totală estimată', 'vs': 'vs', 'without': 'fără',
  'saved': 'economisit',
  'Extra payments on top of the monthly one. The payment stays the same, the credit ends earlier — the interest you skip is your money saved.':
    'Plăți suplimentare peste rata lunară. Rata rămâne aceeași, creditul se termină mai devreme — dobânda evitată sunt banii tăi economisiți.',
  'Paying 1 month in advance now costs ≈': 'Plata unei luni în avans costă acum ≈', 'next principal': 'principalul următor',
  'No anticipated payments yet.': 'Nicio plată anticipată încă.', 'Anticipated payment recorded': 'Plată anticipată înregistrată',
  'Delete this credit and its payment history?': 'Ștergi acest credit și istoricul plăților?',
  'Credit added': 'Credit adăugat', 'Credit updated': 'Credit actualizat',
  'Monthly': 'Lunar', 'rate': 'rată', 'commission': 'comision', 'total interest over': 'dobândă totală pe', 'months': 'luni',
  // bills
  'Electricity, gas, internet, water, taxes — with due dates, owner, attachments and payment history. Auto-paid subscriptions are marked paid automatically once due.':
    'Electricitate, gaz, internet, apă, taxe — cu scadențe, responsabil, atașamente și istoric de plăți. Abonamentele cu plată automată sunt marcate plătite automat la scadență.',
  'One-off': 'O singură dată', 'Every 2 months': 'La 2 luni', 'Quarterly': 'Trimestrial', 'Every 6 months': 'La 6 luni', 'Yearly': 'Anual',
  'Every 30 days': 'La 30 de zile', 'Counts as expense': 'Se contează ca cheltuială', 'Automatic (from category)': 'Automat (după categorie)',
  'every': 'la fiecare', 'mo': 'luni', 'Bill': 'Factură',
  'No bills yet': 'Nicio factură încă',
  'Add recurring utilities once — Family Hub rolls the due date forward every time you mark them paid.': 'Adaugă utilitățile recurente o singură dată — Family Hub mută scadența înainte de fiecare dată când le marchezi plătite.',
  'Amount paid': 'Suma plătită', 'Payment recorded — expense logged too': 'Plată înregistrată — cheltuiala a fost logată și ea',
  'Bill added': 'Factură adăugată', 'Bill updated': 'Factură actualizată', 'Delete this bill and its history?': 'Ștergi această factură și istoricul ei?',
  'Payment history': 'Istoric plăți', 'No payments recorded yet.': 'Nicio plată înregistrată încă.', 'Invoice attached': 'Factură atașată',
  // vehicles
  'RCA, Casco, rovinietă, ITP and vehicle tax deadlines, plus service, tires and fuel logs.': 'Termene RCA, Casco, rovinietă, ITP și taxă auto, plus istoric service, anvelope și combustibil.',
  'RCA expires': 'RCA expiră', 'Casco expires': 'Casco expiră', 'Rovinietă expires': 'Rovinieta expiră', 'ITP expires': 'ITP expiră', 'Vehicle tax expires': 'Taxa auto expiră',
  'Plate': 'Număr de înmatriculare', 'Fuel': 'Combustibil', 'Tires': 'Anvelope', 'Odometer (km)': 'Kilometraj (km)',
  'No vehicles yet': 'Niciun vehicul încă', 'Add your car above to start getting deadline reminders.': 'Adaugă mașina mai sus pentru a primi memento-uri de termene.',
  'Not a specific deadline': 'Fără termen specific', 'No records yet.': 'Nicio înregistrare încă.', 'Paid by': 'Plătit de', 'and all its history?': 'și tot istoricul?',
  // properties
  'Insurance (PAD), property tax, mortgage and maintenance history for each home.': 'Asigurare (PAD), impozit, credit ipotecar și istoric de întreținere pentru fiecare locuință.',
  'Insurance (PAD)': 'Asigurare (PAD)', 'Additional insurance': 'Asigurare facultativă',
  'Insurance (PAD) due': 'Asigurarea (PAD) expiră', 'Additional insurance due': 'Asigurarea facultativă expiră', 'Property tax due': 'Impozitul scadent',
  'Mortgage lender': 'Banca ipotecii', 'Monthly payment (RON)': 'Rată lunară (RON)', 'Payment day of month': 'Ziua plății în lună',
  'Rent (RON/mo, if rented out)': 'Chirie (RON/lună, dacă e închiriată)', 'Rent due day (1-31)': 'Ziua scadenței chiriei (1-31)', 'Rent (RON/mo)': 'Chirie (RON/lună)',
  'Meter reading day (1-31)': 'Ziua citirii contoarelor (1-31)', 'Meters to read monthly': 'Contoare de citit lunar',
  '— none —': '— niciunul —', 'Electricity + gas': 'Electricitate + gaz', 'Electricity + gas + water': 'Electricitate + gaz + apă',
  'Payment link (Revolut.me)': 'Link de plată (Revolut.me)', 'Mortgage': 'Ipotecă', 'on day': 'în ziua',
  // properties we administer for someone else
  'Property & things': 'Proprietăți și bunuri', 'Household': 'Gospodărie',
  // one rental at a glance
  'Open dashboard': 'Deschide panoul', 'Full panel': 'Panoul complet', 'Outstanding': 'De încasat',
  'This property': 'Această proprietate', 'This property (not our money)': 'Această proprietate (nu banii noștri)',
  'Money in this property': 'Bani în această proprietate', 'Nothing recorded yet.': 'Nimic înregistrat încă.',
  'Property not found': 'Proprietatea nu a fost găsită', 'Unpaid': 'Neplătite',
  'Deadlines': 'Termene', 'records': 'înregistrări', 'No mortgage recorded': 'Fără credit ipotecar',
  'Ownership': 'Deținere', 'Ours': 'A noastră', 'Managed for someone else': 'Administrată pentru altcineva',
  'managed': 'administrată', 'not owned by us': 'nu e a noastră',
  'The property (not our money)': 'Proprietatea (nu banii noștri)',
  'This property is managed, not ours: its costs and rent stay here and never touch the household budget. "Tenant" still bills the tenant.':
    'Proprietatea e administrată, nu e a noastră: costurile și chiria rămân aici și nu intră în bugetul casei. „Chiriaș” îi facturează în continuare chiriașului.',
  'Maintenance': 'Întreținere', 'Renovation': 'Renovare', 'Utility': 'Utilitate', 'Rent (income)': 'Chirie (venit)', 'Other income': 'Alt venit',
  'Cost paid by': 'Cost plătit de', 'Owner / family': 'Proprietar / familie', 'Tenant — bill to': 'Chiriaș — facturează pe',
  'Costs (maintenance, utility…) are also logged as an expense for the chosen person; "Tenant" bills the tenant instead.':
    'Costurile (întreținere, utilități…) se înregistrează și ca cheltuială pentru persoana aleasă; „Chiriaș” îl facturează pe chiriaș.',
  'Money in this property:': 'Bani în această proprietate:', 'Net': 'Net',
  'No properties yet': 'Nicio proprietate încă', 'Add your home above to track its deadlines and costs.': 'Adaugă locuința mai sus pentru a urmări termenele și costurile.',
  // tenant & rent box
  'Rent:': 'Chirie:', '/ month, due day': '/ lună, scadentă pe', 'the rent charge is generated automatically once a tenant has joined.': 'chiria se generează automat după ce chiriașul s-a alăturat.',
  'No rent set yet — set it here and the monthly rent charge generates itself.': 'Nicio chirie setată încă — seteaz-o aici și chiria lunară se generează singură.',
  'Rent': 'Chirie',
  'Tenant code:': 'Cod chiriaș:', 'No tenant code yet.': 'Niciun cod de chiriaș încă.', 'Generate code': 'Generează cod',
  'Your tenant registers with it on the sign-in screen →': 'Chiriașul se înregistrează cu el pe ecranul de autentificare →',
  'tab. They only see the charges below — nothing else.': 'tab. Vede doar costurile de mai jos — nimic altceva.',
  'Tenants': 'Chiriași', 'No tenant has joined yet.': 'Niciun chiriaș nu s-a alăturat încă.',
  'Codes, rent, invoices, meter readings and maintenance for your rented properties — in one place.': 'Coduri, chirie, facturi, citiri contoare și reparații pentru proprietățile închiriate — într-un singur loc.',
  'No rented properties yet': 'Nicio proprietate închiriată încă',
  'Set a rent amount or generate a tenant code on a property, and it shows up here.': 'Setează o chirie sau generează un cod de chiriaș pe o proprietate și va apărea aici.',
  'code ready — no tenant yet': 'cod gata — încă niciun chiriaș', 'no tenant yet': 'încă niciun chiriaș',
  'Send reminder': 'Trimite memento', 'Remind the owner': 'Amintește proprietarului',
  'Waiting on the tenant:': 'Așteaptă chiriașul:',
  'unpaid charge': 'plată neachitată', 'unpaid charges': 'plăți neachitate', 'meter reading': 'citire contor', 'meter readings': 'citiri contoare',
  'Waiting for the owner to confirm your payment.': 'Se așteaptă confirmarea plății de către proprietar.',
  'Still waiting to be fixed? Give the owner a nudge.': 'Încă nu s-a rezolvat? Amintește-i proprietarului.',
  'Reminder sent to the tenant': 'Memento trimis chiriașului', 'Reminder sent to the owner': 'Memento trimis proprietarului',
  'Rent (extra)': 'Chirie (suplimentar)', 'Title': 'Titlu', 'Invoice file (PDF/photo)': 'Fișier factură (PDF/poză)', 'Share with tenant': 'Trimite chiriașului',
  'What': 'Ce', 'pending — tenant marked paid': 'în așteptare — chiriașul a marcat plătit', 'Confirm paid': 'Confirmă plata', 'Reject': 'Respinge',
  'Nothing shared with the tenant yet.': 'Nimic trimis chiriașului încă.', 'Meter readings': 'Citiri contoare',
  'Scheduled:': 'Programat:', 'of every month (tenant gets an email).': 'a fiecărei luni (chiriașul primește email).',
  'No monthly schedule yet — set the day and meters below, or request a reading now.': 'Fără program lunar încă — setează ziua și contoarele mai jos, sau cere o citire acum.',
  'day of month for each': 'ziua din lună pentru fiecare',
  'Give each ticked meter a day between 1 and 31': 'Dă fiecărui contor bifat o zi între 1 și 31',
  'Request now:': 'Cere acum:',
  'Requested': 'Cerut', 'Reading': 'Citire', 'received': 'primit', 'No reading requests yet.': 'Nicio cerere de citire încă.',
  'Tenant code generated': 'Cod de chiriaș generat', 'Remove this tenant? Their account will be deleted.': 'Elimini acest chiriaș? Contul lui va fi șters.',
  'Shared with tenant': 'Trimis chiriașului', 'Reading requested — tenant notified': 'Citire cerută — chiriașul a fost notificat',
  'Payment confirmed': 'Plată confirmată', 'Marked back as unpaid': 'Marcat înapoi ca neplătit', 'Delete this charge?': 'Ștergi această plată?',
  // tenant portal
  'Tenant portal ·': 'Portal chiriaș ·', 'Signed in as': 'Autentificat ca', '· rent': '· chirie', 'invoice': 'factură',
  'Invoices': 'Facturi de plată', 'Amount due': 'De plată', 'Open maintenance': 'Reparații deschise', 'Meter readings due': 'Citiri de trimis',
  'to pay': 'de plată', 'confirmation pending': 'confirmare în așteptare', 'Pay': 'Plătește', 'Mark as paid': 'Marchează plătit',
  'Pay with Revolut': 'Plătește cu Revolut', 'Pick a date': 'Alege data',
  // maintenance requests
  'Request maintenance': 'Cere reparație', 'Maintenance requests': 'Cereri de reparație',
  'Something broken or not working? Tell the owner, and add a photo if it helps.': 'S-a stricat ceva sau nu funcționează? Anunță proprietarul și adaugă o poză dacă ajută.',
  'What needs fixing?': 'Ce trebuie reparat?', 'Details (optional)': 'Detalii (opțional)', 'Photo (optional)': 'Poză (opțional)',
  'Send request': 'Trimite cererea', 'Sent': 'Trimis', 'Reported': 'Raportat', 'Photo': 'Poză',
  // distinct from the list/goal wording on purpose — RO keys are exact-match and must not collide
  'Open': 'Deschis', 'Fixed': 'Rezolvat', 'Mark fixed': 'Marchează rezolvat',
  'No maintenance requests yet.': 'Nicio cerere de reparație încă.', 'Nothing reported by the tenant.': 'Nimic raportat de chiriaș.',
  'Request sent — the owner has been notified': 'Cerere trimisă — proprietarul a fost anunțat',
  'Snooze 7 days': 'Amână 7 zile',
  'More details': 'Mai multe detalii', 'Fewer details': 'Mai puține detalii',
  'Expiring soon': 'Expiră curând',
  'Reopened': 'Redeschis', 'Not fixed — reopen': 'Nu e reparat — redeschide',
  'What is still not fixed?': 'Ce nu e reparat încă?',
  'Reopened — the owner has been notified': 'Redeschis — proprietarul a fost anunțat',
  'Delete this maintenance request?': 'Ștergi această cerere de reparație?',
  'Nothing to pay yet': 'Nimic de plată încă', 'Rent and shared invoices from your landlord will appear here.': 'Chiria și facturile trimise de proprietar vor apărea aici.',
  'Pay with Revolut:': 'Plătește cu Revolut:',
  'After you mark something as paid, the owner confirms it — until then it shows as "confirmation pending".': 'După ce marchezi ceva ca plătit, proprietarul confirmă — până atunci apare ca „confirmare în așteptare”.',
  'requested': 'cerut', 'meter value': 'valoare contor', 'Send reading': 'Trimite citirea', 'Upload photo': 'Încarcă poză', 'photo sent': 'poză trimisă',
  'Marked as paid — waiting for owner confirmation': 'Marcat ca plătit — se așteaptă confirmarea proprietarului',
  'Reading sent — thank you!': 'Citire trimisă — mulțumim!', 'Photo sent — thank you!': 'Poză trimisă — mulțumim!',
  // acte
  'Series / number': 'Serie / număr', 'Notes': 'Note', 'Scan (PDF or photo)': 'Scan (PDF sau poză)', 'Scan (PDF/photo)': 'Scan (PDF/poză)', 'Scan': 'Scan',
  'Vehicle': 'Vehicul', 'Property': 'Proprietate',
  'No acte yet': 'Niciun act încă', 'Add ID cards, passports and other documents — the ones with an expiry date show up in reminders and alerts.': 'Adaugă buletine, pașapoarte și alte documente — cele cu dată de expirare apar în memento-uri și alerte.',
  'Document added': 'Document adăugat', 'Scan attached': 'Scan atașat', 'Delete this document (and its scan)?': 'Ștergi acest document (și scanul lui)?',
  'Document saved, but the scan failed:': 'Documentul a fost salvat, dar scanul a eșuat:',
  'Pick a Type to tie it to that deadline — it then shows once (here and in Acte), not twice.': 'Alege un Tip pentru a-l lega de acel termen — apare o singură dată (aici și în Acte), nu de două ori.',
  'No documents yet.': 'Niciun document încă.',
  // lists
  'open': 'deschise', 'done': 'finalizate', 'Est. price (RON)': 'Preț estimat (RON)',
  // import
  'Export a CSV statement from your bank (BT, BCR, ING, Revolut…) and import it here. Already-imported transactions are skipped automatically, so re-uploading is safe.':
    'Exportă un extras CSV de la banca ta (BT, BCR, ING, Revolut…) și importă-l aici. Tranzacțiile deja importate sunt sărite automat, deci re-încărcarea e sigură.',
  '1 · Choose statement file': '1 · Alege fișierul extrasului',
  'Tip: in your banking app look for "Export" or "Extras de cont" → CSV.': 'Sfat: în aplicația băncii caută „Export” sau „Extras de cont” → CSV.',
  'View-only account': 'Cont doar cu vizualizare', 'Ask an adult or admin to import statements.': 'Roagă un adult sau un admin să importe extrase.',
  '2 · Map columns': '2 · Mapează coloanele', 'Date column': 'Coloana datei', 'Description column': 'Coloana descrierii', 'Amount layout': 'Formatul sumei',
  'One amount column (negative = expense)': 'O coloană de sumă (negativ = cheltuială)', 'Separate debit / credit columns': 'Coloane separate debit / credit',
  'Amount column': 'Coloana sumei', 'Debit (money out)': 'Debit (bani ieșiți)', 'Credit (money in)': 'Credit (bani intrați)', 'Preview': 'Previzualizare',
  '3 · Review & import': '3 · Verifică și importă',
  "transactions found. Untick anything you don't want; fix categories where the guess is wrong.": 'tranzacții găsite. Debifează ce nu vrei; corectează categoriile unde ghicirea e greșită.',
  'Description': 'Descriere', 'out': 'ieșire', 'in': 'intrare', 'income': 'venit', 'Import selected': 'Importă selectatele',
  'imported': 'importate', 'skipped (already imported before)': 'sărite (deja importate)', 'invalid.': 'invalide.',
  'See them in Budget & expenses →': 'Vezi-le în Buget și cheltuieli →',
  'Could not read any rows from this file': 'Nu s-au putut citi rânduri din acest fișier',
  'No valid transactions found — check the column mapping': 'Nicio tranzacție validă — verifică maparea coloanelor',
  // alerts
  'Generated automatically when a bill or deadline gets within 30, 14, 7 or 1 days — or goes overdue. Shared by the whole family; hiding one only affects you.':
    'Generate automat când o factură sau un termen ajunge la 30, 14, 7 sau 1 zile — sau întârzie. Comune întregii familii; dacă ascunzi una, dispare doar pentru tine.',
  'While Family Hub is open in a tab, new alerts also pop up as system notifications.': 'Cât timp Family Hub e deschis într-un tab, alertele noi apar și ca notificări de sistem.',
  'Not supported by this browser': 'Nesuportat de acest browser', 'Blocked in browser settings': 'Blocat din setările browserului',
  'Turn off': 'Oprește', 'Turn on': 'Pornește', 'No alerts yet': 'Nicio alertă încă',
  'They appear here as your bills and deadlines get close.': 'Apar aici pe măsură ce facturile și termenele se apropie.',
  'Permission was not granted': 'Permisiunea nu a fost acordată',
  // family
  'Everyone shares the same data. Admins manage members, adults can edit, children can only view.': 'Toți împart aceleași date. Adminii gestionează membrii, adulții pot edita, copiii pot doar vizualiza.',
  'Share this code — they choose': 'Trimite acest cod — persoana alege', 'on the sign-in screen:': 'pe ecranul de autentificare:',
  'Or send this link — it opens Register with the code filled in:': 'Sau trimite acest link — deschide Înregistrarea cu codul completat:',
  'New members join as adults. Change their role below after they join.': 'Membrii noi intră ca adulți. Schimbă-le rolul mai jos după ce se alătură.',
  'Or email an invite': 'Sau trimite invitația pe email',
  "For kids without an email — they show up in the family and can have acte and expenses linked to them, but can't sign in.":
    'Pentru copii fără email — apar în familie și pot avea acte și cheltuieli legate de ei, dar nu se pot autentifica.',
  'Invite sent to': 'Invitație trimisă către', 'Child added': 'Copil adăugat', 'Role updated': 'Rol actualizat',
  'Remove this member? Their account will be deleted.': 'Elimini acest membru? Contul lui va fi șters.',
  // settings
  'Your profile, theme and family pictures.': 'Profilul tău, tema și pozele familiei.',
  'Notifications on this device': 'Notificări pe acest dispozitiv',
  'Get alerts (RCA, ITP, acte, birthdays…) as push notifications on this phone/computer even when the site is closed. Tip: on a phone, first use "Add to Home Screen" to install the app.':
    'Primește alerte (RCA, ITP, acte, zile de naștere…) ca notificări push pe acest telefon/calculator chiar și când site-ul e închis. Sfat: pe telefon, folosește mai întâi „Adaugă pe ecranul principal” pentru a instala aplicația.',
  'Enable on this device': 'Activează pe acest dispozitiv', 'Disable on this device': 'Dezactivează pe acest dispozitiv', 'Send a test': 'Trimite un test',
  'Which alerts do you want?': 'Ce alerte vrei să primești?',
  'Vehicles (RCA, ITP, rovinietă…)': 'Vehicule (RCA, ITP, rovinietă…)', 'Property insurance': 'Asigurarea locuinței',
  'Documents (acte)': 'Documente (acte)', 'Birthdays': 'Zile de naștere',
  'Quiet hours (push notifications wait until morning)': 'Ore de liniște (notificările push așteaptă până dimineața)',
  'Off': 'Oprit', 'Save alert settings': 'Salvează setările de alerte',
  'Alert choices are yours alone — every family member picks their own.': 'Alegerile de alerte sunt doar ale tale — fiecare membru și le alege pe ale lui.',
  'Push notifications off on this device': 'Notificările push sunt oprite pe acest dispozitiv',
  'Push notifications on — alerts will reach this device': 'Notificări push pornite — alertele vor ajunge pe acest dispozitiv',
  'Test sent — check your notifications': 'Test trimis — verifică notificările', 'Picture updated': 'Poză actualizată',
};
// pattern rules for text that embeds a name/number and can't be a fixed dictionary key
// order matters: the first match wins, so the more specific patterns come first
const RO_RX = [
  [/^🎂 (.+)'s birthday$/, '🎂 Ziua de naștere: $1'],
  [/^Overdue: (.+) — unpaid by tenant$/, 'Restant: $1 — neplătit de chiriaș'],
  [/^(.+) — unpaid by tenant$/, '$1 — neplătit de chiriaș'],
  [/^To fix: (.+)$/, 'De reparat: $1'],
];
// before sign-in there is no account language yet: remember the last choice on this device,
// else follow the device language — a Romanian phone gets a Romanian sign-in screen
const deviceLang = () => localStorage.getItem('fh_lang') || ((navigator.language || '').toLowerCase().startsWith('ro') ? 'ro' : 'en');
let LANG = deviceLang();
function applyLang() {
  LANG = (ME && ME.lang) || deviceLang();
  if (ME && ME.lang) localStorage.setItem('fh_lang', ME.lang); // the sign-in screen matches next time
  document.documentElement.lang = LANG;
  // the browser tab and the app were speaking different languages
  document.title = LANG === 'ro'
    ? 'Family Hub — buget, facturi și termene'
    : 'Family Hub — household finance & assets';
}
// tr(): translate a string when building templates in JS (for text assembled with interpolation)
const tr = (s) => (LANG === 'ro' && RO[s]) || s;
// confirm/prompt shadow the natives so static messages get translated too
const nativeConfirm = window.confirm.bind(window), nativePrompt = window.prompt.bind(window);
const confirm = (m) => nativeConfirm(tr(m));
const prompt = (m, d) => nativePrompt(tr(m), d);
function translateSubtree(root) {
  if (LANG !== 'ro' || !root) return;
  // placeholders + titles via attributes
  const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [];
  for (const el of els) {
    const ph = el.getAttribute && el.getAttribute('placeholder');
    if (ph && RO[ph.trim()]) el.setAttribute('placeholder', RO[ph.trim()]);
    const ti = el.getAttribute && el.getAttribute('title');
    if (ti && RO[ti.trim()]) el.setAttribute('title', RO[ti.trim()]);
  }
  // text nodes (exact-match whole phrase, whitespace preserved)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    if (n.parentElement && n.parentElement.closest('.brandmark, .brand')) continue; // never translate the product name
    const raw = n.nodeValue; const key = raw.trim();
    if (!key) continue;
    if (RO[key]) { n.nodeValue = raw.replace(key, RO[key]); continue; }
    for (const [rx, rep] of RO_RX) if (rx.test(key)) { n.nodeValue = raw.replace(key, key.replace(rx, rep)); break; }
  }
}
/* The currencies a family can keep its books in. The code is what's stored; the label is what's
   shown. RON stays "RON" rather than the locale's "lei" so nothing already on screen shifts under
   anyone, while EUR and GBP get the symbol people actually expect.
   Grouping stays Romanian (1.234,56) for all three on purpose: the app is read in Romania whatever
   the currency, and it keeps the amount parser and the table sorter working unchanged. */
const CURRENCIES = { RON: 'RON', EUR: '€', GBP: '£' };
const cur = () => CURRENCIES[FAMILY?.currency] || FAMILY?.currency || 'RON';
// Same shape as money(), but for an amount that carries its own currency — a loan made in euro
// is euro, and printing it with the household symbol would be a plain lie about the sum.
const moneyIn = (n, code) => (n == null ? '—'
  : `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCIES[code] || code || cur()}`);
const money = (n) => n == null ? '—' : `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur()}`;
// Rounded, no currency — for places that repeat an amount many times in a tight space (the category
// subtotal pills). The exact figure is always on the row or in the header next to it.
const moneyShort = (n) => Number(n || 0).toLocaleString('ro-RO', { maximumFractionDigits: 0 });
/* "2026-01" is a database key, not a label. The Year view already spelled its months properly while
   the dashboard axis showed the raw key rotated 43° to fit — same data, two answers. `short` gives
   the axis form ("ian."), the long form names the year too, for titles that stand alone. */
function monthLabel(m, { short = true } = {}) {
  const d = new Date(m + '-01T00:00:00Z');
  if (isNaN(d)) return m;
  return d.toLocaleDateString(LANG === 'ro' ? 'ro-RO' : 'en-GB',
    short ? { month: 'short', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
/* Past about six slices a part-to-whole chart stops being readable, and a categorical palette runs
   out of separable hues long before the category list does. So the tail folds into one "Other"
   slice instead of being drawn in colours nobody can tell apart. */
function foldToTop(rows, n = 5, key = 'category', valueKey = 'total') {
  if (rows.length <= n + 1) return rows.map((r) => ({ ...r }));
  const head = rows.slice(0, n).map((r) => ({ ...r }));
  const tailTotal = rows.slice(n).reduce((s, r) => s + Number(r[valueKey] || 0), 0);
  return [...head, { [key]: 'Other', [valueKey]: tailTotal, folded: rows.length - n }];
}
// dates: stored/handled as ISO (yyyy-mm-dd), shown to the user as dd/mm/yyyy
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const isoToDMY = (iso) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : ''; };
const fdate = (d) => isoToDMY(d) || '—';
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const canWrite = () => ME && ME.role !== 'child';

// toast(msg) — neutral; toast(msg, 'success'|'error'|'info') — typed with an icon + accent;
// toast(msg, {label, onAction, duration, type}) — with an inline action button (Undo).
const TOAST_ICON = { success: '✓', error: '✕', info: 'ℹ' };
function toast(msg, opts) {
  const t = $('#toast');
  clearTimeout(t._h);
  const o = typeof opts === 'string' ? { type: opts } : (opts || {});
  t.className = 'toast' + (o.type ? ` ${o.type}` : '');
  t.textContent = '';
  if (o.type && TOAST_ICON[o.type]) {
    const ic = document.createElement('span'); ic.className = 'toastic'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = TOAST_ICON[o.type];
    t.append(ic);
  }
  const span = document.createElement('span'); span.textContent = tr(msg); t.append(span);
  if (o.onAction || o.label) {
    const btn = document.createElement('button'); btn.className = 'toastbtn'; btn.textContent = tr(o.label || 'Undo');
    btn.onclick = () => { t.hidden = true; clearTimeout(t._h); o.onAction && o.onAction(); };
    t.append(btn);
    t.hidden = false;
    t._h = setTimeout(() => (t.hidden = true), o.duration || 5000);
  } else {
    t.hidden = false;
    t._h = setTimeout(() => (t.hidden = true), o.type ? 3200 : 2600);
  }
}
// tap-feedback for an action button: briefly show "✓ Sent", then restore, so the click clearly landed
function flashSent(btn, label = 'Sent') {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.disabled = true; btn.classList.add('sent'); btn.textContent = `✓ ${tr(label)}`;
  setTimeout(() => { btn.disabled = false; btn.classList.remove('sent'); btn.innerHTML = original; }, 2200);
}
// KPI numbers roll up from zero on load — decorative, so reduced-motion skips straight to the value.
// Elements opt in with data-cu="<number>"; their text is already the formatted final value.
function countUpAll(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of root.querySelectorAll('[data-cu]')) {
    const target = Number(el.dataset.cu);
    if (!Number.isFinite(target) || target === 0) continue;
    el.textContent = money(0); // otherwise the final value flashes for one frame before the roll-up
    const t0 = performance.now(), D = 650;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / D);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = money(target * ease);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // rAF stalls in background tabs — make sure the real number is there regardless
    setTimeout(() => { el.textContent = money(target); }, D + 150);
  }
}
// what counts as focusable for autofocus and the focus trap
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function focusFirst(container) {
  // prefer the first real field so people can start typing; fall back to any control
  const el = container.querySelector('input:not([type=hidden]),select,textarea') || container.querySelector(FOCUSABLE) || container;
  el.focus?.();
}
// keep Tab inside the dialog: wrap from last back to first and vice-versa
function trapTab(e, container) {
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
let _modalPrevFocus = null, _modalKeydown = null;
// Generic modal: content is a full markup string appended inside #app (not document.body) so it
// still goes through the RO-translation MutationObserver and the date-input upgrade pass.
function openModal(innerHtml, cls = '') {
  closeModal();
  _modalPrevFocus = document.activeElement; // so focus returns here when the modal closes
  const wrap = document.createElement('div');
  wrap.className = 'modalwrap'; wrap.id = 'genmodal';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="modalbg"></div><div class="modalcard ${cls}">
    <button class="modalclose" aria-label="${tr('Close')}">✕</button>${innerHtml}</div>`;
  wrap.querySelector('.modalbg').onclick = closeModal;
  wrap.querySelector('.modalclose').onclick = closeModal;
  app.appendChild(wrap);
  const card = wrap.querySelector('.modalcard');
  _modalKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    else if (e.key === 'Tab') trapTab(e, card);
  };
  document.addEventListener('keydown', _modalKeydown);
  focusFirst(card);
  return wrap;
}
function closeModal() {
  const m = $('#genmodal');
  if (!m) return;
  if (_modalKeydown) { document.removeEventListener('keydown', _modalKeydown); _modalKeydown = null; }
  m.remove();
  _modalPrevFocus?.focus?.(); // hand focus back to whatever opened the modal
  _modalPrevFocus = null;
}
// Shared Current/New/Confirm password form, used by both the admin Settings page and the tenant portal.
function passwordChangeModal() {
  const wrap = openModal(`
    <h3>Change password</h3>
    <p class="muted" style="margin-top:0">Changing it signs you out on every other device.</p>
    <form id="modalpwform" class="formgrid" style="grid-template-columns:1fr">
      <div><label>Current password</label><input name="current" type="password" autocomplete="current-password" required></div>
      <div><label>New password (min. 8 characters)</label><input name="next" type="password" autocomplete="new-password" minlength="8" required></div>
      <div><label>Confirm new password</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn small">Change password</button></form>`);
  wrap.querySelector('#modalpwform').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (body.next !== body.confirm) return toast('The new passwords do not match');
    try {
      await api('/auth/change-password', { method: 'POST', body });
      closeModal();
      toast('Password changed — your other devices are signed out');
    } catch (err) { toast(err.message); }
  };
}
/* Quick search (Ctrl/⌘+K, or "/"): jump to any bill, car, document, credit or expense from wherever
   you are, without losing the page you're on. Same landing behaviour as the Search page, so an
   expense result opens Expenses already filtered to what you typed. */
function quickSearch() {
  const wrap = openModal(`
    <h3>${tr('Search')}</h3>
    <input id="qsinput" type="search" placeholder="Digi, pasaport, Kaufland…" autocomplete="off" style="font-size:16px">
    <div id="qsres" style="margin-top:10px;max-height:46vh;overflow:auto"></div>`, 'wide');
  const input = wrap.querySelector('#qsinput'), box = wrap.querySelector('#qsres');
  const hint = (msg) => { box.innerHTML = `<p class="muted" style="margin:10px 0 0">${tr(msg)}</p>`; };
  let items = [], sel = -1;
  const paint = () => {
    if (!items.length) return hint('Nothing found');
    box.innerHTML = items.map((r, i) => `<button type="button" class="qsitem${i === sel ? ' on' : ''}" data-i="${i}">
      <span class="badge role">${tr(SEARCH_KINDS[r.kind] || r.kind)}</span>
      <span class="qsmain"><b>${esc(r.title || '')}</b>${r.sub ? `<br><span class="muted">${esc(r.sub)}</span>` : ''}</span>
      <span class="muted qsmeta">${r.date ? fdate(r.date) : ''}${r.amount != null ? ` · ${moneyIn(r.amount, r.currency)}` : ''}</span></button>`).join('');
    box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => go(items[Number(b.dataset.i)])));
  };
  const go = (r) => {
    if (!r) return;
    // a money hit has to say which of the seven tabs it lives on, or "View" lands on the wrong one
    const MONEY_TAB = { expense: 'expenses', income: 'income', credit: 'credits', loan: 'debt', goal: 'savings' };
    if (MONEY_TAB[r.kind]) PENDING_MONEY_TAB = MONEY_TAB[r.kind];
    if (r.kind === 'expense') PENDING_EXPENSE_FILTER = { q: input.value.trim(), month: 'all', who: 'all', cat: 'all' };
    closeModal();
    if (location.hash === `#${r.tab}`) render(); else location.hash = `#${r.tab}`;
  };
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { items = []; return hint('Type at least 2 characters.'); }
    try { ({ results: items } = await api(`/search?q=${encodeURIComponent(q)}`)); } catch { items = []; }
    sel = items.length ? 0 : -1;
    paint();
  };
  input.oninput = () => { clearTimeout(input._h); input._h = setTimeout(run, 220); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
      box.querySelector('.qsitem.on')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); go(items[sel]); }
  };
  hint('Type at least 2 characters.');
}
document.addEventListener('keydown', (e) => {
  if (!ME || ME.role === 'tenant' || $('#genmodal')) return; // tenants have no search; never stack modals
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); quickSearch(); }
  else if (e.key === '/' && !typing) { e.preventDefault(); quickSearch(); }
});
// Undo-on-delete: hide the item now, delete on the server only after the Undo window closes.
// Clicking Undo cancels it — nothing was ever deleted, so no re-creation and no lost links.
// A second delete (or leaving the page) commits any still-pending one first.
let _pendingDelete = null;
function undoableDelete({ message = 'Deleted', hide, restore, commit }) {
  if (_pendingDelete) _pendingDelete.flush();
  hide();
  let settled = false;
  const timer = setTimeout(doCommit, 5000);
  function doCommit() {
    if (settled) return; settled = true; _pendingDelete = null; clearTimeout(timer);
    Promise.resolve().then(commit).catch((err) => { restore(); toast(err.message); });
  }
  _pendingDelete = { flush: doCommit };
  toast(message, { label: 'Undo', duration: 5000, onAction: () => {
    if (settled) return; settled = true; _pendingDelete = null; clearTimeout(timer); restore();
  } });
}
function flushPendingDelete() { if (_pendingDelete) _pendingDelete.flush(); }
// hide a table row (and its paired edit row, if any) for the undo window, with a way to bring it back
function rowHide(btn) {
  const row = btn.closest('tr');
  const next = row && row.nextElementSibling;
  const paired = next && /^(exprow-|row-)/.test(next.id || '') ? next : null;
  return {
    hide: () => { if (row) row.style.display = 'none'; if (paired) paired.style.display = 'none'; },
    restore: () => { if (row) row.style.display = ''; if (paired) paired.style.display = ''; },
  };
}
const registerLink = (code) => `${location.origin}/#register=${encodeURIComponent(code)}`;
const inviteLink = () => registerLink(FAMILY.invite_code);
async function copyText(text) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(tr('Copied:') + ' ' + text);
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
  if (!res.ok) {
    // Keep the whole body on the error, not just the sentence. A message with numbers in it cannot
    // go through the RO dictionary (which matches whole strings), so the caller needs the parts to
    // build that sentence in the reader's own language.
    const err = new Error(data.error || 'Request failed');
    err.data = data;
    throw err;
  }
  return data;
}
/* An "Add …" form sitting open at the top of a page pushes the actual data below the fold — on a
   phone by 1–2 screens, on a desktop still past the first card. Every page now opens on your data
   and the form is one tap away; forceOpen is for the "+" shortcut, which is asking for the form.
   The "+" is its own element so the label beside it still matches the RO dictionary exactly. */
/* Row actions: repeating three or four buttons on every row is a wall of noise and makes each row
   tall. The primary action (if any) stays visible; the rest tuck into a "⋯" menu. The buttons keep
   their original data-attributes, so the existing per-page handlers still find and wire them. */
function rowMenu(items) {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  return `<span class="rowmenu">
    <button type="button" class="btn ghost small rowmenu-btn" aria-label="${tr('More actions')}" aria-haspopup="true" aria-expanded="false">⋯</button>
    <span class="rowmenu-pop" hidden>${list.map(([label, attrs, danger]) =>
      `<button type="button" class="rowmenu-item${danger ? ' danger' : ''}" ${attrs}>${label}</button>`).join('')}</span>
  </span>`;
}
const closeRowMenu = (pop) => { pop.hidden = true; pop.previousElementSibling?.setAttribute('aria-expanded', 'false'); };
app.addEventListener('click', (e) => {
  const btn = e.target.closest('.rowmenu-btn');
  const inPop = e.target.closest('.rowmenu-pop');
  for (const p of app.querySelectorAll('.rowmenu-pop:not([hidden])')) {
    if (p !== inPop && !(btn && btn.nextElementSibling === p)) closeRowMenu(p);
  }
  if (inPop && e.target.closest('.rowmenu-item')) closeRowMenu(inPop); // acted on it — put the menu away
  if (!btn) return;
  const pop = btn.nextElementSibling;
  const open = pop.hidden;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
});
function addBox(title, inner, forceOpen) {
  return `<details class="card addbox" ${forceOpen ? 'open' : ''}>
    <summary><span class="plus" aria-hidden="true">+</span> ${title}</summary>
    <div class="addbody">${inner}</div></details>`;
}
// same breakpoint the stylesheet switches layouts at, so JS and CSS never disagree about "phone"
const isPhone = () => matchMedia('(max-width: 860px)').matches;
function daysClass(d) { return d < 0 ? 'late' : d <= 14 ? 'warn' : ''; }
// Whole days from today to an ISO date. Both ends are parsed as UTC midnight so a DST changeover
// cannot round the difference to the wrong day.
function daysUntil(iso) {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 86400000);
}
// an alert's item key is "kind:ref:YYYY-MM-DD" for dated things (and "maintenance:3:open" for the
// undated ones) — pull the days-left out of it so the alert list can show the same urgency colours
function alertDays(item) {
  const d = String(item || '').split(':')[2];
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? Math.ceil((new Date(d) - new Date(today())) / 86400000) : null;
}
// budget bar colour: green under, amber once you're near the limit (>=80%), red over it
function budgetClass(spent, limit) { return limit > 0 && spent > limit ? 'over' : limit > 0 && spent >= limit * 0.8 ? 'near' : ''; }
// a tiny inline-SVG trend line for the KPI cards; '' when there isn't enough history to be a line
function sparkline(values) {
  const v = (values || []).filter((n) => Number.isFinite(n));
  if (v.length < 2) return '';
  const w = 100, h = 24, max = Math.max(...v), min = Math.min(...v), span = (max - min) || 1;
  const pts = v.map((n, i) => `${(i / (v.length - 1)) * w},${(h - 2) - ((n - min) / span) * (h - 4)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
// auto-paid subscriptions take care of themselves — list them, but without the
// amber/red "this needs you" colour that every other deadline gets
function remClass(r) { return r.auto_pay ? '' : daysClass(r.days_left); }
function daysLabel(d) {
  if (LANG === 'ro') return d < 0 ? `întârziat ${-d}z` : d === 0 ? 'azi' : `în ${d}z`;
  return d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`;
}
// Where a "Coming up" card takes you. Seeing that the vignette is due in 5 days and then having to
// work out for yourself which page it lives on is the wrong way round — the card is the deadline,
// so it should be the way to it. Property deadlines land on that property's own dashboard rather
// than the list, and an unpaid charge lands where you confirm the payment.
// Reminder labels are translated as whole strings, which cannot work for one built around a name
// the family typed in. Only the prefix is ours to translate, so it is peeled off and put back.
const remLabel = (r) => {
  const m = /^Warranty: (.+)$/.exec(r.label || '');
  return m ? `${tr('Warranty')}: ${m[1]}` : r.label;
};
function reminderHref(r) {
  switch (r.kind) {
    case 'bill': return '#bills';
    case 'rca': case 'casco': case 'vignette': case 'itp': case 'road_tax': return '#vehicles';
    case 'property_insurance': case 'property_tax': case 'lease_end': case 'lease_notice':
      return r.ref_id ? `#property/${r.ref_id}` : '#properties';
    case 'tenant_unpaid': return r.property_id ? `#property/${r.property_id}` : '#tenants';
    case 'meter_pending': return r.property_id ? `#property/${r.property_id}` : '#properties';
    case 'document': return '#acte';
    case 'warranty': return '#garantii';
    case 'birthday': return '#family';
    default: return '';
  }
}
// heading for a day group in the expense list: today/yesterday read faster than a date
function dayLabel(iso) {
  const days = Math.round((new Date(today()) - new Date(iso)) / 86400000);
  if (days === 0) return LANG === 'ro' ? 'Azi' : 'Today';
  if (days === 1) return LANG === 'ro' ? 'Ieri' : 'Yesterday';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(LANG === 'ro' ? 'ro-RO' : 'en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/* ---------- router ---------- */
const routes = { dashboard: viewDashboard, review: viewReview, money: viewMoney, bills: viewBills, search: viewSearch, vehicles: viewVehicles, properties: viewProperties, tenants: viewTenants, property: viewProperty, acte: viewActe, garantii: viewWarranties, lists: viewLists, chores: viewChores, watch: viewWatch, import: viewImport, alerts: viewAlerts, family: viewFamily, settings: viewSettings };
// Page changes cross-fade where the browser supports it; plain render elsewhere.
//
// The cross-fade is decoration — the render is the point — so nothing about the transition may be
// allowed to swallow it. startViewTransition() throws InvalidStateError whenever the document is
// not active (a hidden or background tab, some automation harnesses), and because that throw was
// uncaught the callback never ran: the hash changed, the old page stayed on screen, and navigating
// by the sidebar looked dead while loading the same URL directly worked fine.
window.addEventListener('hashchange', () => {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return render();
  let t;
  try { t = document.startViewTransition(render); } catch { return render(); } // no animation, but never no page
  // a transition that is skipped or interrupted rejects these; that is normal, not an error.
  // `ready` is the one that actually carries the InvalidStateError — miss it and it surfaces as
  // an unhandled rejection on every navigation even though the page itself rendered fine.
  t?.ready?.catch(() => {});
  t?.updateCallbackDone?.catch(() => {});
  t?.finished?.catch(() => {});
});

/* ---------- site notifications: polling, badge, browser notifications ---------- */
let NOTIF = { unread: 0, items: [] };
function browserNotifOn() { return localStorage.getItem('fh_notif') === '1' && 'Notification' in window && Notification.permission === 'granted'; }
async function pollNotifications() {
  if (!ME || ME.role === 'tenant') return;
  try {
    NOTIF = await api('/notifications');
    // two of them now: the desktop sidebar and the phone tab bar
    document.querySelectorAll('.notifbadge').forEach((b) => { b.textContent = NOTIF.unread; b.hidden = NOTIF.unread === 0; });
    // fire browser notifications for anything newer than the last one we showed
    const lastShown = Number(localStorage.getItem('fh_last_notif') || 0);
    const fresh = NOTIF.items.filter((n) => !n.read && n.id > lastShown);
    if (fresh.length) {
      localStorage.setItem('fh_last_notif', String(Math.max(...fresh.map((n) => n.id))));
      // quiet hours also silence the pop-ups this open tab creates itself (device-local time —
      // the alert stays in the list, it just doesn't chime at night)
      const qs = ME?.quiet_start, qe = ME?.quiet_end, h = new Date().getHours();
      const quiet = qs != null && qe != null && qs !== qe && (qs < qe ? h >= qs && h < qe : h >= qs || h < qe);
      if (browserNotifOn() && !quiet) for (const n of fresh.slice(0, 3)) {
        const note = new Notification(n.title, { body: n.body || '' });
        // clicking it used to just focus the tab wherever it was — now it jumps to the page the alert is about
        note.onclick = () => { window.focus(); if (n.url) location.hash = n.url.replace(/^\/?#?/, ''); note.close(); };
      }
    }
  } catch { /* signed out or offline; badge just stays */ }
}
setInterval(pollNotifications, 60000);

// 'system' follows the device (and flips live when the device does); signed-out pages follow it too
const THEME_LABELS = { light: '☀ Light', dark: '🌙 Dark', system: '◑ System' };
const systemDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = ME ? ME.theme || 'light' : 'system';
  document.documentElement.dataset.theme = pref === 'system' ? (systemDark.matches ? 'dark' : 'light') : pref;
  // The phone paints its address bar and status bar with theme-color. It was a fixed #1c2b33, so
  // that strip looked identical whichever theme you picked — on a phone, where the app fills the
  // screen, that top band is a good part of what "dark mode" is supposed to change. Read the value
  // back from the stylesheet so it always matches the header actually being drawn underneath it.
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--sidebar').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bar) meta.content = bar;
}
systemDark.addEventListener('change', applyTheme);
// a stable hue per name, so different people get distinct avatar colours (the CSS turns the
// hue into a light/dark-aware tint). Same name always lands on the same colour.
function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
// profile picture: <img> if set, else a coloured circle with the initial
function avatarHtml(user, cls = 'avatar') {
  const size = cls === 'avatar-lg' ? 72 : 34;
  if (user && user.avatar) return `<img class="${cls}" src="/api/users/${user.id}/avatar?v=${encodeURIComponent(user.avatar)}" alt="">`;
  const name = (user?.name || '?').trim();
  const initial = esc(name.charAt(0).toUpperCase());
  return `<span class="${cls} avatar-fallback" style="--avh:${avatarHue(name)};font-size:${Math.round(size * 0.42)}px">${initial}</span>`;
}

async function boot() {
  try {
    const me = await api('/me');
    ME = me.user; FAMILY = me.family;
    applyTheme(); applyLang();
    render();
  } catch { renderAuth(); }
}
// Every render gets a ticket. A view that fetches before it paints can finish after a newer render
// has already replaced #page — it must then stay quiet instead of writing into a detached node.
let RENDER_SEQ = 0;
function render() {
  RENDER_SEQ++;
  flushPendingDelete(); // a pending undo-delete commits before the page it lived on is torn down
  if (location.hash.startsWith('#reset=')) return renderReset();
  if (!ME) return renderAuth();
  applyTheme(); applyLang();
  if (ME.role === 'tenant') return renderTenantPortal();
  // "#property/7" — a page plus one argument, so a single property's dashboard is a real place you
  // can link to, land on, and leave with the back button
  const [page, arg] = (location.hash || '#dashboard').slice(1).split('/');
  if (page !== 'money') EXP_FORM_OPEN = false; // leaving Money → next visit shows data first, not a form
  const fn = routes[page] || viewDashboard;
  app.innerHTML = shell(page);
  app.querySelectorAll('[data-logout]').forEach((b) => (b.onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); }));
  const sheet = $('#moresheet');
  const moretab = $('#moretab');
  const closeSheet = () => { sheet.hidden = true; moretab.setAttribute('aria-expanded', 'false'); };
  moretab.onclick = () => { sheet.hidden = !sheet.hidden; moretab.setAttribute('aria-expanded', String(!sheet.hidden)); };
  sheet.querySelectorAll('[data-close], .sheetlink').forEach((x) => x.addEventListener('click', closeSheet));
  // floating +: one tap to log an expense from anywhere, straight into a focused Amount
  $('#fab')?.addEventListener('click', () => {
    EXP_FORM_OPEN = true; FOCUS_AMOUNT = true; PENDING_MONEY_TAB = 'expenses';
    if (page === 'money') viewMoney($('#page'), 'expenses'); else location.hash = '#money';
  });
  runView((el) => fn(el, arg), $('#page'), RENDER_SEQ);
  pollNotifications();
}
// error boundary around a page render: one failed fetch shouldn't leave a blank/broken page.
// Shows the reason and a Retry instead, and surfaces a toast. The view runs SYNCHRONOUSLY (not on
// a microtask): its opening innerHTML must land inside the document during a view-transition
// callback, and before the next render can replace #page — deferring it raced both.
function pageError(fn, el, err) {
  console.error(err);
  el.innerHTML = `<div class="card" style="text-align:center;padding:34px 16px">
    <b style="display:block;font-family:var(--display);font-size:1.05rem">${tr("Couldn't load this")}</b>
    <p class="muted" style="margin:8px 0 14px">${esc(err.message || '')}</p>
    <button class="btn small" id="pageretry">${tr('Retry')}</button></div>`;
  el.querySelector('#pageretry').onclick = () => runView(fn, el);
  toast(err.message || 'Request failed', 'error');
}
function runView(fn, el, seq = RENDER_SEQ) {
  // a superseded render is not a failure — its page is already gone, so say nothing
  const report = (err) => { if (seq === RENDER_SEQ) pageError(fn, el, err); else console.debug('stale render discarded:', err.message); };
  let ret;
  try { ret = fn(el); } catch (err) { report(err); return; } // synchronous throw
  if (ret && typeof ret.catch === 'function') ret.catch(report); // async rejection
}
// Thirteen flat links read as one long undifferentiated list; grouped, the sidebar answers "where
// would that live?" at a glance. `null` starts a new group under the given heading.
const NAV = [
  ['dashboard', 'grid', 'Dashboard'], ['review', 'check', 'This week'], ['search', 'search', 'Search'],
  [null, 'Money'],
  ['money', 'wallet', 'Budget & expenses'], ['bills', 'receipt', 'Bills'], ['import', 'upload', 'Bank import'],
  [null, 'Property & things'],
  ['properties', 'home', 'Properties'], ['tenants', 'key', 'Tenants'], ['vehicles', 'car', 'Vehicles'], ['acte', 'file', 'Acte'],
  ['garantii', 'shield', 'Warranties'],
  [null, 'Household'],
  ['chores', 'chore', 'Chores'], ['lists', 'checklist', 'Lists'], ['watch', 'radar', 'Watched pages'], ['alerts', 'bell', 'Alerts'], ['family', 'users', 'Family'], ['settings', 'gear', 'Settings'],
];
// the four that earn a permanent spot on a phone; everything else lives behind "More".
// Alerts is here on purpose: its badge used to sit ~680px off-screen in the old scrolling strip,
// which made the whole alerts feature invisible on a phone.
const TABS = [['dashboard', 'grid', 'Dashboard'], ['money', 'wallet', 'Money'], ['bills', 'receipt', 'Bills'], ['alerts', 'bell', 'Alerts']];
const badgeHtml = () => `<span class="notifbadge" ${NOTIF.unread ? '' : 'hidden'}>${NOTIF.unread}</span>`;
function shell(active) {
  const inTabs = (k) => TABS.some(([t]) => t === k);
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${esc(FAMILY.name)}</small></div>
      ${NAV.map(([k, ic, l]) => k === null
        ? `<div class="navgroup">${tr(ic)}</div>`
        : `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}">${icon(ic)}<span>${l}</span>${k === 'alerts' ? badgeHtml() : ''}</a>`).join('')}
      <div class="spacer"></div>
      <a class="whoami row" href="#settings" style="text-decoration:none;color:inherit;gap:8px">${avatarHtml(ME)}<span><b>${esc(ME.name)}</b>${tr(ME.role)} · ${esc(ME.email || '')}</span></a>
      <button class="navlink" data-logout>${icon('logout')}<span>Sign out</span></button>
    </nav>
    <main class="main" id="page"></main>
    ${canWrite() && active !== 'money' ? `<button class="fab" id="fab" aria-label="Add expense" title="Add expense">+</button>` : ''}
    <nav class="tabbar">
      ${TABS.map(([k, ic, l]) => `<a class="tab ${k === active ? 'active' : ''}" href="#${k}">
        <span class="ic">${icon(ic)}${k === 'alerts' ? badgeHtml() : ''}</span><span class="tl">${l}</span></a>`).join('')}
      <button class="tab ${inTabs(active) ? '' : 'active'}" id="moretab"><span class="ic">${icon('dots')}</span><span class="tl">More</span></button>
    </nav>
    <div class="sheet" id="moresheet" hidden>
      <div class="sheetbg" data-close></div>
      <div class="sheetbody">
        ${(() => {
          // Group headings carry the same shape as links ([null, title]) so this list has to read
          // them as headings too — mapped blindly they rendered as a link labelled "undefined".
          // A heading is only emitted once something under it survives the bottom-bar filter.
          let pending = null, out = '', open = false;
          for (const [k, ic, l] of NAV) {
            if (k === null) { if (open) { out += '</div>'; open = false; } pending = ic; continue; }
            if (inTabs(k)) continue;
            if (pending) { out += `<div class="sheetgroup">${tr(pending)}</div><div class="sheetgrid">`; pending = null; open = true; }
            else if (!open) { out += '<div class="sheetgrid">'; open = true; }
            out += `<a class="sheetlink ${k === active ? 'active' : ''}" href="#${k}"><span class="ic">${icon(ic)}</span>${l}</a>`;
          }
          return out + (open ? '</div>' : '');
        })()}
        <button class="btn ghost btn-ic" style="width:100%;margin-top:12px" data-logout>${icon('logout')}Sign out</button>
      </div>
    </div>
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
    <div class="row" style="justify-content:center;margin-top:16px">
      ${[['en', '🇬🇧 English'], ['ro', '🇷🇴 Română']].map(([lg, lb]) => `<button type="button" class="btn ${LANG === lg ? '' : 'ghost'} small" data-authlang="${lg}">${lb}</button>`).join('')}
    </div>
  </div></div>`;
  // sign-in screen language: a device-level choice — it becomes the account language after login
  app.querySelectorAll('[data-authlang]').forEach((b) => (b.onclick = () => {
    localStorage.setItem('fh_lang', b.dataset.authlang);
    applyLang(); renderAuth(mode);
  }));
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
      // setting the hash already fires hashchange -> render; calling render() as well started a
      // second one that tore the first render's #page out from under it mid-fetch
      if (location.hash === '#dashboard') render(); else location.hash = '#dashboard';
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
      // setting the hash already fires hashchange -> render; calling render() as well started a
      // second one that tore the first render's #page out from under it mid-fetch
      if (location.hash === '#dashboard') render(); else location.hash = '#dashboard';
    } catch (err) { toast(err.message); }
  };
}

/* ---------- tenant portal ---------- */
const CHARGE_STATUS = { unpaid: 'to pay', pending: 'confirmation pending', paid: 'paid' };
// Revolut's badge next to the Pay action, so it is obvious where the link goes.
// Drawn inline rather than hotlinking an asset — the page stays self-contained, and
// the brand blue reads on both the light and the dark theme.
const REVOLUT_MARK = `<svg class="rmark" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
    <rect width="24" height="24" rx="6" fill="#0666EB"></rect>
    <text x="12" y="17.6" text-anchor="middle" font-size="15" font-weight="700" font-family="system-ui, sans-serif" fill="#fff">R</text>
  </svg>`;
// the tenant gets a slimmed-down version of the same sidebar/tab-bar shell the family uses,
// with only the four areas that apply to them.
const TENANT_NAV = [
  ['dashboard', 'grid', 'Dashboard'],
  ['invoices', 'wallet', 'Invoices'],
  ['maintenance', 'wrench', 'Maintenance'],
  ['account', 'gear', 'Settings'],
];
function tenantShell(active, prop) {
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${tr('Tenant')} · ${esc(prop.name)}</small></div>
      ${TENANT_NAV.map(([k, ic, l]) => `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}">${icon(ic)}<span>${tr(l)}</span></a>`).join('')}
      <div class="spacer"></div>
      <a class="whoami row" href="#account" style="text-decoration:none;color:inherit;gap:8px">${avatarHtml(ME)}<span><b>${esc(ME.name)}</b>${tr('Tenant')} · ${esc(ME.email || '')}</span></a>
      <button class="navlink" data-logout>${icon('logout')}<span>Sign out</span></button>
    </nav>
    <main class="main" id="page"></main>
    <nav class="tabbar">
      ${TENANT_NAV.map(([k, ic, l]) => `<a class="tab ${k === active ? 'active' : ''}" href="#${k}">
        <span class="ic">${icon(ic)}</span><span class="tl">${tr(l)}</span></a>`).join('')}
    </nav>
  </div>`;
}
async function tenantLogout() { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); }
// re-pull the account after a profile/lang/avatar change, then rerender the current section
const tenantRefreshMe = async () => { const me = await api('/me'); ME = me.user; applyLang(); renderTenantPortal(); };
async function renderTenantPortal() {
  let data;
  try { data = await api('/tenant/charges'); }
  catch (err) {
    app.innerHTML = `<div class="authwrap"><div class="card authcard"><div class="brandmark">Family<span>Hub</span></div>
      <p class="muted">${esc(err.message)}</p><button class="btn" id="tlogout">Sign out</button></div></div>`;
    $('#tlogout').onclick = tenantLogout;
    return;
  }
  const page = (location.hash || '#dashboard').slice(1);
  const active = TENANT_NAV.some(([k]) => k === page) ? page : 'dashboard';
  app.innerHTML = tenantShell(active, data.property);
  const views = { dashboard: tenantDashboardView, invoices: tenantInvoicesView, maintenance: tenantMaintenanceView, account: tenantAccountView };
  (views[active] || tenantDashboardView)($('#page'), data);
  // wire logout after the section renders — the account page has its own sign-out button too
  app.querySelectorAll('[data-logout]').forEach((b) => (b.onclick = tenantLogout));
}
function tenantDashboardView(el, data) {
  const t = today();
  const unpaid = data.charges.filter((c) => c.status === 'unpaid');
  // Per currency, like everywhere else money is owed: this is the figure a tenant reads before
  // paying, so a euro invoice added to a lei one would be a number they cannot act on.
  const unpaidTotal = owedText(unpaid);
  const owesAnything = unpaid.reduce((n, c) => n + Number(c.amount || 0), 0) > 0;
  const overdue = unpaid.filter((c) => c.due_date < t).length;
  const pendingMeters = (data.meters || []).filter((m) => m.status === 'pending');
  const doneMeters = (data.meters || []).filter((m) => m.status === 'done').slice(0, 5);
  const openMaint = (data.maintenance || []).filter((m) => m.status !== 'done').length;
  el.innerHTML = `<div class="pagehead"><div><h1>Dashboard</h1>
      <p>${esc(data.property.name)}${data.property.address ? ' — ' + esc(data.property.address) : ''}</p></div></div>
    <section class="kpi">
      <a class="card clickcard" href="#invoices"><div class="label">${tr('Amount due')}</div><div class="value ${owesAnything ? 'neg' : ''}">${unpaidTotal}</div>
        <div class="muted" style="font-size:12px">${unpaid.length} ${tr('unpaid')}${overdue ? ` · ${overdue} ${tr('overdue')}` : ''}</div></a>
      <a class="card clickcard" href="#maintenance"><div class="label">${tr('Open maintenance')}</div><div class="value">${openMaint}</div></a>
      <div class="card"><div class="label">${tr('Meter readings due')}</div><div class="value">${pendingMeters.length}</div></div>
    </section>
    ${(pendingMeters.length || doneMeters.length) ? `<section class="card" style="margin-top:18px"><h3 style="margin-top:0">${tr('Meter readings')}</h3>
      ${pendingMeters.map((m) => `
        <div class="row" style="flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px">
          <b style="text-transform:capitalize">${esc(tr(m.utility))}</b><span class="muted">${tr('requested')} ${fdate(m.requested_at?.slice(0, 10))}</span>
          <input data-mval="${m.id}" inputmode="decimal" placeholder="meter value" style="max-width:140px">
          <button class="btn small" data-msend="${m.id}">Send reading</button>
          <label class="btn ghost small" style="display:inline-block">Upload photo<input type="file" data-mphoto="${m.id}" accept="image/*" hidden></label>
        </div>`).join('')}
      ${doneMeters.map((m) => `<p class="muted" style="margin:4px 0">✓ <span style="text-transform:capitalize">${esc(tr(m.utility))}</span>: ${m.reading ? esc(m.reading) : tr('photo sent')} · ${fdate(m.provided_at)}</p>`).join('')}
    </section>` : ''}`;
  countUpAll(el);
  app.querySelectorAll('[data-msend]').forEach((b) => (b.onclick = async () => {
    const val = app.querySelector(`[data-mval="${b.dataset.msend}"]`).value;
    try { await api(`/tenant/meter/${b.dataset.msend}`, { method: 'POST', body: { reading: val } }); toast('Reading sent — thank you!'); renderTenantPortal(); }
    catch (err) { toast(err.message); }
  }));
  app.querySelectorAll('[data-mphoto]').forEach((inp) => (inp.onchange = async () => {
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { await api(`/tenant/meter/${inp.dataset.mphoto}/photo`, { method: 'POST', body: fd }); toast('Photo sent — thank you!'); renderTenantPortal(); }
    catch (err) { toast(err.message); }
  }));
}
function tenantInvoicesView(el, data) {
  const t = today();
  const payLink = data.property.payment_link ? data.property.payment_link.replace(/\/+$/, '') : null;
  const unpaidCharges = data.charges.filter((c) => c.status === 'unpaid');
  const unpaidTotal = owedText(unpaidCharges);
  const owesAnything = unpaidCharges.reduce((n, c) => n + Number(c.amount || 0), 0) > 0;
  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Invoices')}</h1><p>${esc(data.property.name)}</p></div>
      ${owesAnything ? `<div class="row" style="gap:8px;align-items:baseline"><span class="muted">${tr('Amount due')}</span><b class="amount" style="font-size:18px">${unpaidTotal}</b></div>` : ''}</div>
    <div class="card">
    ${data.charges.length ? `<table><thead><tr><th>Due</th><th>What</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${data.charges.map((c) => {
        const late = c.status === 'unpaid' && c.due_date < t;
        return `<tr>
          <td>${fdate(c.due_date)}${late ? ' <span class="badge late">overdue</span>' : ''}</td>
          <td><b>${esc(c.title)}</b>${c.type === 'rent' ? ' <span class="muted">· rent</span>' : ''}${c.attachment ? ` · <a href="/api/tenant/charges/${c.id}/attachment" target="_blank">invoice</a>` : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}</td>
          <td class="right amount">${moneyIn(c.amount, chargeCur(c))}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">${tr('paid')}${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">confirmation pending</span>`
            : `<span class="badge unpaid">to pay</span>`}</td>
          <td class="right">${c.status === 'unpaid' ? `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap;white-space:nowrap">${payLink ? `<a class="btn ghost small revolut" href="${esc(payLink)}" target="_blank" rel="noopener" title="Pay with Revolut">Pay ${REVOLUT_MARK}</a>` : ''}<button class="btn small" data-pay="${c.id}">Mark as paid</button></span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`
    : `<div class="empty"><b>Nothing to pay yet</b>Rent and shared invoices from your landlord will appear here.</div>`}
    <p class="muted">After you mark something as paid, the owner confirms it — until then it shows as "confirmation pending".</p>
    ${data.charges.some((c) => c.status === 'pending') ? `<div class="row" style="align-items:center;margin-bottom:0">
      <button class="btn ghost small" data-remindowner>${tr('Remind the owner')}</button>
      <span class="muted">${tr('Waiting for the owner to confirm your payment.')}</span></div>` : ''}
    </div>`;
  app.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
    try { await api(`/tenant/charges/${b.dataset.pay}/pay`, { method: 'POST' }); toast('Marked as paid — waiting for owner confirmation', 'success'); renderTenantPortal(); }
    catch (err) { toast(err.message, 'error'); }
  }));
  wireRemindOwner(el);
}
// tenant's "Remind the owner" button (shared by Invoices + Maintenance) → one nudge covering
// everything on the owner's plate
function wireRemindOwner(el) {
  el.querySelector('[data-remindowner]')?.addEventListener('click', async (e) => {
    try { await api('/tenant/remind', { method: 'POST' }); flashSent(e.target); toast('Reminder sent to the owner', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  });
}
function tenantMaintenanceView(el, data) {
  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Maintenance')}</h1><p>${esc(data.property.name)}</p></div></div>
    <div class="card"><h3 style="margin-top:0">${tr('Request maintenance')}</h3>
      <p class="muted">Something broken or not working? Tell the owner, and add a photo if it helps.</p>
      <form id="mreqform" class="formgrid">
        <div><label>What needs fixing?</label><input name="title" placeholder="Robinet care picură…" required></div>
        <div><label>Details (optional)</label><input name="note" placeholder="Where it is, since when…"></div>
        <div><label>Photo (optional)</label><input name="file" type="file" accept="image/*"></div>
        <button class="btn small">Send request</button></form></div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">${tr('Maintenance requests')}</h3>
    ${(data.maintenance || []).length ? `<table><thead><tr><th>Sent</th><th>What</th><th>Photo</th><th>Status</th></tr></thead><tbody>
      ${data.maintenance.map((m) => `<tr>
        <td>${fdate(m.created_at?.slice(0, 10))}</td>
        <td><b>${esc(m.title)}</b>${m.note ? `<br><span class="muted">${esc(m.note)}</span>` : ''}${
          m.reopen_note ? `<br><span class="muted">↻ ${tr('Reopened')}: ${esc(m.reopen_note)}</span>` : ''}</td>
        <td>${m.photo ? `<a href="/api/tenant/maintenance/${m.id}/photo" target="_blank">photo</a>` : '<span class="muted">—</span>'}</td>
        <td>${m.status === 'done'
          ? `<span class="badge paid">${tr('Fixed')}${m.resolved_at ? ' ' + fdate(m.resolved_at) : ''}</span>
             <div style="margin-top:6px"><button class="btn ghost tiny" data-mreopen="${m.id}" data-title="${esc(m.title)}">${tr('Not fixed — reopen')}</button></div>`
          : `<span class="badge unpaid">${tr('Open')}</span>`}</td>
      </tr>`).join('')}</tbody></table>` : `<p class="muted" style="margin-bottom:0">No maintenance requests yet.</p>`}
    ${(data.maintenance || []).some((m) => m.status !== 'done') ? `<div class="row" style="align-items:center;margin-top:12px">
      <button class="btn ghost small" data-remindowner>${tr('Remind the owner')}</button>
      <span class="muted">${tr('Still waiting to be fixed? Give the owner a nudge.')}</span></div>` : ''}
    </div>`;
  wireRemindOwner(el);
  el.querySelectorAll('[data-mreopen]').forEach((b) => (b.onclick = async () => {
    // an optional line telling the owner what is still wrong; blank is fine, Cancel aborts
    const note = prompt(tr('What is still not fixed?') + '\n(' + tr('optional') + ')', '');
    if (note === null) return; // cancelled
    try {
      await api(`/tenant/maintenance/${b.dataset.mreopen}/reopen`, { method: 'POST', body: { note: note.trim() } });
      toast(tr('Reopened — the owner has been notified'), 'success'); renderTenantPortal();
    } catch (err) { toast(err.message, 'error'); }
  }));
  $('#mreqform').onsubmit = async (e) => {
    e.preventDefault();
    const fd0 = new FormData(e.target);
    const file = fd0.get('file'); fd0.delete('file');
    try {
      const r = await api('/tenant/maintenance', { method: 'POST', body: Object.fromEntries(fd0) });
      if (file && file.size > 0) {
        const fd = new FormData(); fd.append('file', file);
        await api(`/tenant/maintenance/${r.id}/photo`, { method: 'POST', body: fd });
      }
      toast('Request sent — the owner has been notified', 'success'); renderTenantPortal();
    } catch (err) { toast(err.message, 'error'); }
  };
}
function tenantAccountView(el, data) {
  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Settings')}</h1><p>${esc(ME.name)} · ${esc(ME.email || '')}</p></div></div>
    <div class="card"><h3 style="margin-top:0">${tr('Your profile')}</h3>
      <div class="row" style="gap:16px;align-items:center">${avatarHtml(ME, 'avatar-lg')}
        <span class="row">
          <label class="btn ghost small" style="display:inline-block">Upload picture<input type="file" id="tavatar" accept="image/*" hidden></label>
          ${ME.avatar ? `<button class="btn danger small" id="tavadel">Remove</button>` : ''}
        </span></div>
      <form id="tprofile" class="formgrid" style="margin-top:12px;max-width:560px">
        <div><label>Display name</label><input name="name" value="${esc(ME.name)}" required></div>
        <div><label>Birthday</label><input name="birthday" type="date" value="${esc(ME.birthday || '')}"></div>
        <div><label>Phone number</label><input name="phone" type="tel" value="${esc(ME.phone || '')}" placeholder="07xx xxx xxx"></div>
        <button class="btn small">Save profile</button></form></div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">Appearance</h3>
      <p class="muted" style="margin-top:0">Choose how Family Hub looks on this account.</p>
      <div class="row">${['light', 'dark', 'system'].map((tm) => `<button class="btn ${(ME.theme || 'light') === tm ? '' : 'ghost'} small" data-ttheme="${tm}">${THEME_LABELS[tm]}</button>`).join('')}</div>
      <p class="muted" style="margin:14px 0 6px">Language</p>
      <div class="row">${[['en', '🇬🇧 English'], ['ro', '🇷🇴 Română']].map(([lg, lb]) => `<button class="btn ${(ME.lang || 'en') === lg ? '' : 'ghost'} small" data-tlang="${lg}">${lb}</button>`).join('')}</div></div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">Password</h3>
      <p class="muted" style="margin-top:0">Changing it signs you out on every other device.</p>
      <button class="btn small" id="tpwbtn">Change password</button></div>
    <button class="btn ghost small btn-ic" data-logout style="margin-top:16px">${icon('logout')}Sign out</button>`;
  $('#tavatar').onchange = async () => {
    if (!$('#tavatar').files[0]) return;
    const fd = new FormData(); fd.append('file', $('#tavatar').files[0]);
    try { await api(`/users/${ME.id}/avatar`, { method: 'POST', body: fd }); toast('Picture updated'); tenantRefreshMe(); }
    catch (err) { toast(err.message); }
  };
  $('#tavadel')?.addEventListener('click', async () => {
    try { await api(`/users/${ME.id}/avatar`, { method: 'DELETE' }); toast('Removed'); tenantRefreshMe(); }
    catch (err) { toast(err.message); }
  });
  $('#tprofile').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); tenantRefreshMe(); }
    catch (err) { toast(err.message); }
  };
  app.querySelectorAll('[data-tlang]').forEach((b) => (b.onclick = async () => {
    try { await api('/settings', { method: 'POST', body: { lang: b.dataset.tlang } }); tenantRefreshMe(); }
    catch (err) { toast(err.message); }
  }));
  app.querySelectorAll('[data-ttheme]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { theme: b.dataset.ttheme } }); ME = { ...ME, ...u }; applyTheme(); renderTenantPortal(); }
    catch (err) { toast(err.message); }
  }));
  $('#tpwbtn').onclick = () => passwordChangeModal();
}

/* ---------- dashboard ---------- */
let DASH_VIEW = 'all'; // 'all' or a member id (person view)
let DASH_MONTHS = 1;   // 1 / 3 / 6 / 12 month window
const PERIOD_LABELS = { 1: 'This month', 3: 'Last 3 months', 6: 'Last 6 months', 12: 'Last 12 months' };
// shimmering placeholder that mirrors the dashboard's real layout, shown while data loads
function dashSkeleton() {
  const tile = `<div class="card"><div class="skel skel-line" style="width:55%"></div><div class="skel skel-line" style="width:40%;height:22px;margin-top:10px"></div></div>`;
  return `<div class="skel skel-line" style="width:200px;height:20px;margin:2px 0 12px"></div>
    <div class="ribbon" style="overflow:hidden">${[0, 1, 2, 3].map(() => `<div class="skel" style="min-width:168px;height:70px;border-radius:10px"></div>`).join('')}</div>
    <section class="kpi" style="margin-top:18px">${tile + tile + tile}</section>
    <section class="grid2" style="margin-top:18px"><div class="card"><div class="skel" style="height:220px"></div></div><div class="card"><div class="skel" style="height:220px"></div></div></section>`;
}
/* One plain sentence under the tiles: where this month lands if nothing changes, and whichever
   category is most out of step with its usual self. Whole sentences per language — the RO
   dictionary matches exact strings, so a sentence glued from translated words would not survive.
   Only shown for the current month, and only once enough days have passed to mean anything. */
// Categories that arrive as a single fixed charge rather than day-by-day spending, so they must be
// kept out of the run-rate when forecasting the month (see dashInsight).
const PROJECTION_FIXED = new Set(['Credit']);
/* What you can spend today without breaking the month.
   Everything here was already being computed for the month-end projection; nobody had ever turned
   it around into the question people actually ask. What came in, minus what has gone out, minus
   what is committed but not yet posted (instalments, auto-paid bills, recurring costs) — spread
   over the days left, today included. The committed part is what makes it honest: without it the
   number reads generously all month and then the rent lands. */
function safeToSpendHtml(stats, months, upcoming) {
  if (months !== 1) return '';
  const income = Number(stats.income) || 0;
  if (income <= 0) return ''; // nothing came in to divide up — no basis for a number
  const now = new Date();
  const day = now.getUTCDate();
  const inMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = Math.max(1, inMonth - day + 1); // today counts
  const committed = Number(upcoming?.total) || 0;
  const available = income - (Number(stats.spent) || 0) - committed;
  const perDay = available / daysLeft;
  const ro = LANG === 'ro';
  const over = available <= 0;
  const note = over
    ? (ro ? `Ai depășit ce a intrat luna asta cu ${money(-available)}${committed > 0 ? `, incluzând ${money(committed)} deja programați` : ''}.`
          : `You're ${money(-available)} past what came in this month${committed > 0 ? `, including ${money(committed)} already committed` : ''}.`)
    : (ro ? `${money(available)} rămași pentru ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}${committed > 0 ? `, după ce am scăzut ${money(committed)} deja programați` : ''}.`
          : `${money(available)} left for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}${committed > 0 ? `, after setting aside ${money(committed)} already committed` : ''}.`);
  return `<section class="card safespend${over ? ' over' : ''}" style="margin-top:18px">
    <div class="muted" style="font-size:12.5px">${tr('Safe to spend today')}</div>
    <div class="safeamt">${money(Math.max(0, perDay))}</div>
    <div class="muted" style="font-size:13px">${note}</div>
  </section>`;
}
function dashInsight(stats, suggest, months, upcoming) {
  if (months !== 1) return '';
  const ro = LANG === 'ro';
  const now = new Date();
  const day = now.getUTCDate();
  const inMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const bits = [];
  if (day >= 4 && stats.spent > 0 && day < inMonth) {
    // A credit instalment is one fixed posting for the month, not a daily habit. Left inside the
    // run-rate it gets multiplied across every remaining day — pay 1.005 on the 10th and the
    // forecast behaves as if you paid it daily. So: hold the one-off amounts aside, project only
    // what actually varies day to day, then add the fixed part back once.
    const oneOff = (stats.byCategory || [])
      .filter((c) => PROJECTION_FIXED.has(c.category)).reduce((s, c) => s + c.total, 0);
    const variable = Math.max(0, stats.spent - oneOff);
    // ...and the fixed charges still ahead of you this month (instalments, auto-paid bills,
    // recurring costs) are added at face value: they are committed, and they are not daily habits
    // either. Without them the forecast read low all month and only came true on the last day.
    const committed = Number(upcoming?.total) || 0;
    const projected = oneOff + committed + (variable / day) * inMonth;
    const monthName = now.toLocaleDateString(ro ? 'ro-RO' : 'en-GB', { month: 'long', timeZone: 'UTC' });
    bits.push(ro
      ? `În ritmul ăsta, ${monthName} se închide pe la <b class="amount">${money(projected)}</b>${committed > 0 ? ` (include <b class="amount">${money(committed)}</b> deja programați)` : ''}.`
      : `At this pace, ${monthName} closes around <b class="amount">${money(projected)}</b>${committed > 0 ? ` (including <b class="amount">${money(committed)}</b> already scheduled)` : ''}.`);
    if (stats.income > 0) {
      const diff = stats.income - projected;
      bits.push(diff >= 0
        ? (ro ? `Îți rămân aproximativ <b class="amount" style="color:var(--ok)">${money(diff)}</b> din venituri.`
          : `That leaves about <b class="amount" style="color:var(--ok)">${money(diff)}</b> of your income.`)
        : (ro ? `Ai depăși veniturile cu circa <b class="amount" style="color:var(--red)">${money(-diff)}</b>.`
          : `That is about <b class="amount" style="color:var(--red)">${money(-diff)}</b> more than you earn.`));
    }
  }
  // the category most above its own 3-month average (needs a real gap, not rounding noise)
  const avg = Object.fromEntries((suggest?.categories || []).map((c) => [c.category, c.avg]));
  let worst = null;
  for (const c of stats.byCategory || []) {
    const a = avg[c.category];
    if (!a || a < 50 || c.total < a * 1.25 || c.total - a < 50) continue;
    const over = (c.total / a - 1) * 100;
    if (!worst || over > worst.over) worst = { category: c.category, over };
  }
  if (worst) {
    bits.push(ro
      ? `<b>${esc(tr(worst.category))}</b> este cu ${Math.round(worst.over)}% peste media ultimelor 3 luni.`
      : `<b>${esc(tr(worst.category))}</b> is ${Math.round(worst.over)}% above its 3-month average.`);
  }
  if (!bits.length) return '';
  return `<section class="card insight" style="margin-top:18px"><span class="insight-ic" aria-hidden="true">◆</span>
    <p>${bits.join(' ')}</p></section>`;
}
async function viewDashboard(el) {
  const members = await api('/family/members');
  el.innerHTML = `<div class="pagehead">
    <div><h1>Dashboard</h1><p>${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div class="row" style="gap:8px">
      <select id="dashperiod" style="width:150px">${[1, 3, 6, 12].map((m) => `<option value="${m}" ${DASH_MONTHS === m ? 'selected' : ''}>${PERIOD_LABELS[m]}</option>`).join('')}</select>
      <select id="dashview" style="width:190px">
        <option value="all" ${DASH_VIEW === 'all' ? 'selected' : ''}>Whole family (total)</option>
        ${members.map((m) => `<option value="${m.id}" ${String(DASH_VIEW) === String(m.id) ? 'selected' : ''}>${esc(m.name)}${m.id === ME.id ? ' ' + tr('(me)') : ''}</option>`).join('')}
      </select></div></div><div id="dash">${dashSkeleton()}</div>`;
  el.querySelector('#dashview').onchange = (e) => { DASH_VIEW = e.target.value; viewDashboard(el); };
  el.querySelector('#dashperiod').onchange = (e) => { DASH_MONTHS = Number(e.target.value); viewDashboard(el); };
  const userQ = DASH_VIEW === 'all' ? '' : `&user=${DASH_VIEW}`;
  // the KPI tiles follow the period selector, but a trend chart of ONE bar teaches nothing —
  // so the history chart always pulls a rolling 12 months, whatever the tiles are showing
  const [reminders, stats, trend12, budgets, rent, savings, suggest, upcoming, chores, forecast] = await Promise.all([
    api(`/reminders?days=60${userQ}`), api(`/stats?months=${DASH_MONTHS}${userQ}`),
    DASH_MONTHS >= 12 ? null : api(`/stats?months=12${userQ}`).catch(() => null), api('/budgets'),
    api('/rent-status').catch(() => []), api('/savings').catch(() => ({ goals: [] })),
    api('/budgets/suggest').catch(() => null),
    // charges committed but not yet posted; a whole-family, single-month idea, so only fetched then
    (DASH_MONTHS === 1 && DASH_VIEW === 'all') ? api('/upcoming-month').catch(() => null) : null,
    api('/chores').catch(() => []),
    // the forecast is one balance on one timeline: it has no per-person or multi-month reading
    (DASH_MONTHS === 1 && DASH_VIEW === 'all') ? api('/forecast').catch(() => null) : null,
  ]);
  const trendStats = trend12 || stats;
  // monthly series behind each KPI, for the sparklines under the numbers
  const sparkMonths = [...new Set([...trendStats.trend.map((x) => x.m), ...trendStats.incomeTrend.map((x) => x.m)])].sort();
  const spendSeries = sparkMonths.map((m) => trendStats.trend.find((x) => x.m === m)?.total || 0);
  const incomeSeries = sparkMonths.map((m) => trendStats.incomeTrend.find((x) => x.m === m)?.total || 0);
  const netSeries = sparkMonths.map((m, i) => incomeSeries[i] - spendSeries[i]);
  const net = stats.income - stats.spent;
  const spentMap = Object.fromEntries(budgets.spent.map((s) => [s.category, s.spent]));
  const scopeNote = DASH_VIEW === 'all' ? '' : ` <span class="muted">· ${esc((members.find((m) => String(m.id) === String(DASH_VIEW)) || {}).name || '')}</span>`;
  const periodLabel = PERIOD_LABELS[DASH_MONTHS];
  // a brand-new family lands on a dashboard of zeroes with nothing telling them where to begin
  const blank = !reminders.length && !stats.byCategory.length && !stats.income && !stats.spent && !budgets.budgets.length;
  el.querySelector('#dash').innerHTML = `
    ${blank ? `<section class="card" style="margin-bottom:18px">
      <h3>Welcome — start here</h3>
      <p class="muted" style="margin-top:0">Nothing is set up yet. Add any one of these and this page fills in.</p>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <a class="btn small" href="#bills">Add a bill</a>
        <a class="btn ghost small" href="#vehicles">Add your car</a>
        <a class="btn ghost small" href="#properties">Add a property</a>
        <a class="btn ghost small" href="#money">Log an expense</a>
        <a class="btn ghost small" href="#family">Invite the family</a>
      </div></section>` : ''}
    <section>
      <h2>Coming up — next 60 days${scopeNote}</h2>
      ${reminders.length ? `<div class="ribbon">${reminders.map((r) => `
        ${(() => { const href = reminderHref(r); const T = href ? 'a' : 'div';
          return `<${T} class="stub ${remClass(r)}"${href ? ` href="${href}"` : ''}>
          <div class="days">${daysLabel(r.days_left)}</div>
          <div class="what">${esc(remLabel(r))}</div>
          <div class="who">${esc(r.entity || '')} · ${fdate(r.date)}${r.amount ? ` · <span class="amount">${money(r.amount)}</span>` : ''}</div>
        </${T}>`; })()}`).join('')}</div>`
      : `<div class="card empty"><b>Nothing due soon</b>${DASH_VIEW === 'all' ? 'Add bills, vehicle or property deadlines and they will line up here.' : 'Nothing assigned to this person is coming up.'}</div>`}
    </section>
    ${choresCard(chores)}
    <section class="kpi" style="margin-top:18px">
      <a class="card clickcard" href="#money" data-tab="income"><div class="label"><span class="kpi-ic">${icon('wallet')}</span>${tr('Income')}</div>${pctPill(stats.income, stats.prev?.income, 'up-good')}<div class="value" data-cu="${stats.income}">${money(stats.income)}</div>${deltaAmountHtml(stats.income, stats.prev?.income)}<span class="spark-pos">${sparkline(incomeSeries)}</span></a>
      <a class="card clickcard" href="#money" data-tab="expenses"><div class="label"><span class="kpi-ic">${icon('receipt')}</span>${tr('Spent')}</div>${pctPill(stats.spent, stats.prev?.spent, 'up-bad')}<div class="value" data-cu="${stats.spent}">${money(stats.spent)}</div>${deltaAmountHtml(stats.spent, stats.prev?.spent)}${stats.card?.total > 0 ? `<div class="muted" style="font-size:12px;margin-top:2px">+ ${money(stats.card.total)} ${tr('on card')}</div>` : ''}<span class="spark-neg">${sparkline(spendSeries)}</span></a>
      <div class="card"><div class="label"><span class="kpi-ic">${icon('coins')}</span>Left over</div>${pctPill(net, (stats.prev?.income ?? 0) - (stats.prev?.spent ?? 0), 'up-good')}<div class="value ${net < 0 ? 'neg' : ''}" data-cu="${net}">${money(net)}</div>${deltaAmountHtml(net, (stats.prev?.income ?? 0) - (stats.prev?.spent ?? 0))}${savingsRateHtml(stats.income, net)}<span class="spark-pos">${sparkline(netSeries)}</span></div>
    </section>
    ${safeToSpendHtml(stats, DASH_MONTHS, upcoming)}
    ${(DASH_MONTHS === 1 && DASH_VIEW === 'all') ? forecastCard(forecast) : ''}
    ${dashInsight(stats, suggest, DASH_MONTHS, upcoming)}
    ${rentHtml(rent)}
    <section class="grid2" style="margin-top:18px">
      <div class="card"><h3>${tr('Spending by category')} · ${esc(tr(periodLabel))}</h3>
        <div class="chartbox"><canvas id="catChart"></canvas></div>
        <ul class="catlegend" id="catLegend"></ul></div>
      <div class="card"><h3>Income vs spending</h3><div class="chartbox"><canvas id="trendChart"></canvas></div></div>
    </section>
    <section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('What you kept')}</h3>
      <p class="muted" style="margin:-4px 0 8px;font-size:13px">${tr('Income minus spending, month by month. Below the line means you spent more than came in.')}</p>
      <div class="chartbox"><canvas id="netChart"></canvas></div>
    </section>
    <section class="card" style="margin-top:18px">
      <h3>${tr('Budget vs actual')} · ${budgets.month}</h3>
      ${budgets.budgets.length ? budgets.budgets.map((b) => {
        const s = spentMap[b.category] || 0; const pct = Math.min(100, (s / b.amount) * 100 || 0);
        const truePct = b.amount > 0 ? Math.round((s / b.amount) * 100) : 0;
        return `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between">
          <span>${esc(b.category)}</span><span class="amount muted">${money(s)} / ${money(b.amount)} · ${truePct}%</span></div>
          <div class="bar"><i class="${budgetClass(s, b.amount)}" style="width:${pct}%"></i></div></div>`;
      }).join('') : `<p class="muted" style="margin-top:0">No budgets set for this month yet.</p>
        ${canWrite() && suggest?.categories?.length ? `<button class="btn small" id="budgetkick">${tr('Set from my 3-month average')}</button>
          <span class="muted" style="margin-left:8px">${tr('You can fine-tune them afterwards.')}</span>`
        : `<p class="muted">${tr('Set them in')} <a href="#money">Budget & expenses</a>.</p>`}`}
    </section>
    ${goalsHtml(savings.goals)}
    <details class="card foldcard" style="margin-top:18px"><summary>${tr('Calendar')}</summary>
      <div id="dashcal" style="padding-top:12px"><div class="skel" style="height:220px"></div></div></details>`;
  wireBalance(el, () => viewDashboard(el));
  el.querySelector('#dash').querySelectorAll('[data-tab]').forEach((a) => a.addEventListener('click', () => { PENDING_MONEY_TAB = a.dataset.tab; }));
  el.querySelector('#budgetkick')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('/budgets/bulk', { method: 'POST', body: { month: budgets.month, items: suggest.categories } });
      toast(LANG === 'ro' ? `${r.saved} bugete setate din media ultimelor 3 luni` : `${r.saved} budgets set from your 3-month average`, 'success');
      viewDashboard(el);
    } catch (err) { e.target.disabled = false; toast(err.message, 'error'); }
  });
  // ticking a chore from the dashboard re-renders it, so the count and the list stay honest
  el.querySelectorAll('[data-dashchore]').forEach((cb) => (cb.onchange = async () => {
    cb.closest('.chorerow').classList.add('is-done');
    try { await api(`/chores/${cb.dataset.dashchore}/toggle`, { method: 'POST' }); viewDashboard(el); }
    catch (err) { toast(err.message, 'error'); viewDashboard(el); }
  }));
  countUpAll(el.querySelector('#dash'));
  drawCharts(stats, DASH_VIEW, DASH_MONTHS, trendStats);
  renderCalendar(el.querySelector('#dashcal'), true);
}
/* A number on its own says little: 5.589 spent is only meaningful next to what it usually is.
   `sense` says which direction is good, so spending more reads amber and earning more reads green.
   The sentence is written out per language rather than glued together from single words — the
   dictionary is exact-match, and "more" already means "altele" ("+2 more" on the calendar). */
/* The percentage move, as a pill in the card's corner. It says the same thing as the sentence
   underneath, in the shape you can read without reading — so on a phone, where the sentence is
   already there and space is not, the pill is hidden rather than repeated. */
function pctPill(now, before, sense) {
  if (before == null || !isFinite(before) || Math.abs(before) < 0.005) return '';
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return '';
  const up = pct > 0;
  const good = sense === 'up-good' ? up : !up;
  return `<span class="kpi-pill ${good ? 'good' : 'bad'}">${up ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
}
/* The absolute move in money. A percentage tells you the shape of the change and a sum tells you
   what it cost — the tiles carry both, the way the mock-up does. */
function deltaAmountHtml(now, before) {
  if (before == null || !isFinite(before) || Math.abs(before) < 0.005) return '';
  const diff = now - before;
  if (Math.abs(diff) < 0.005) return '';
  const ro = LANG === 'ro';
  const period = DASH_MONTHS === 1
    ? (ro ? 'luna trecută' : 'last month')
    : (ro ? `precedentele ${DASH_MONTHS} luni` : `the previous ${DASH_MONTHS} months`);
  return `<div class="delta"><b>${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}</b> ${ro ? 'față de' : 'than'} ${period}</div>`;
}
function deltaHtml(now, before, sense) {
  if (before == null || !isFinite(before) || Math.abs(before) < 0.005) return ''; // no baseline, no claim
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  const ro = LANG === 'ro';
  const period = DASH_MONTHS === 1
    ? (ro ? 'luna trecută' : 'last month')
    : (ro ? `precedentele ${DASH_MONTHS} luni` : `the previous ${DASH_MONTHS} months`);
  if (pct === 0) return `<div class="delta">${ro ? 'la fel ca' : 'same as'} ${period}</div>`;
  const up = pct > 0;
  const good = sense === 'up-good' ? up : !up;
  const word = ro ? (up ? 'mai mult' : 'mai puțin') : (up ? 'more' : 'less');
  return `<div class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pct)}% ${word} ${ro ? 'decât' : 'than'} ${period}</div>`;
}
/* the landlord's first question of the month, answered without opening the property */
function rentHtml(rent) {
  if (!rent || !rent.length || DASH_VIEW !== 'all') return '';
  return `<section class="card" style="margin-top:18px"><h3>Rent this month</h3>
    ${rent.map((r) => `<div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap;padding:5px 0">
      <span><b>${esc(r.property)}</b> <span class="muted">· ${tr('due')} ${fdate(r.due_date)}</span></span>
      <span class="row" style="gap:8px"><span class="amount">${money(r.amount)}</span>
        ${r.status === 'paid' ? `<span class="badge paid">${tr('paid')}</span>`
          : r.status === 'pending' ? `<span class="badge role">${tr('confirmation pending')}</span>`
          : r.days_late ? `<span class="badge late">${r.days_late} ${tr(r.days_late === 1 ? 'day late' : 'days late')}</span>`
          : `<span class="badge unpaid">${tr('to pay')}</span>`}</span>
    </div>`).join('')}
    <p class="muted" style="margin:6px 0 0"><a href="#properties">${tr('Open Properties')} →</a></p></section>`;
}
/* The share of what came in that you still have. A leftover of 5.000 means nothing on its own —
   it's excellent on an income of 6.000 and poor on 20.000 — and unlike the absolute figure it stays
   comparable when income changes, which is what makes it the one number worth watching. */
function savingsRateHtml(income, net) {
  const inc = Number(income) || 0;
  if (inc <= 0) return '';
  const pct = Math.round((net / inc) * 100);
  const txt = LANG === 'ro'
    ? (pct < 0 ? `ai cheltuit cu ${-pct}% mai mult decât ai încasat` : `ai păstrat ${pct}% din venituri`)
    : (pct < 0 ? `spent ${-pct}% more than came in` : `kept ${pct}% of income`);
  return `<div class="muted" style="font-size:12.5px">${txt}</div>`;
}
/* Today's chores, on the page you open first. A chore list that lives one nav click away is a chore
   list nobody reads, so the open ones surface here and can be ticked without leaving. Weekly jobs
   only appear on the day they are pinned to (or every day, if pinned to none). */
function choresCard(chores) {
  const all = chores || [];
  if (!all.length) return '';
  const dow = (new Date().getDay() + 6) % 7;
  const today = all.filter((c) => c.cadence === 'daily' || c.weekday == null || Number(c.weekday) === dow);
  const open = today.filter((c) => !c.done);
  if (!today.length) return '';
  if (!open.length) {
    return `<section class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between;gap:10px;align-items:center">
      <b>${tr('All chores done for today')}</b><a class="btn ghost small" href="#chores">${tr('Chores')}</a></div></section>`;
  }
  return `<section class="card" style="margin-top:18px">
    <div class="row" style="justify-content:space-between;gap:10px;align-items:baseline">
      <h3 style="margin:0">${tr('Chores today')}</h3>
      <span class="muted">${open.length} ${LANG === 'ro' ? (open.length === 1 ? 'rămasă' : 'rămase') : 'left'}</span></div>
    <ul class="chorelist">${open.slice(0, 5).map((c) => `<li class="chorerow">
      <label class="chorecheck">
        <input type="checkbox" data-dashchore="${c.id}" ${canWrite() ? '' : 'disabled'} style="width:auto">
        <span class="chorebody"><span class="choretitle">${esc(c.title)}</span>
          <span class="muted choremeta">${c.user_name ? esc(c.user_name) : tr('anyone')}</span></span>
      </label></li>`).join('')}</ul>
    ${open.length > 5 ? `<p class="muted" style="margin:8px 0 0"><a href="#chores">${tr('See all')} ${open.length} →</a></p>`
      : `<p class="muted" style="margin:8px 0 0"><a href="#chores">${tr('Chores')} →</a></p>`}</section>`;
}
/* goals only nudge you if you see them; they lived two clicks away under Money → Savings */
function goalsHtml(goals) {
  const open = (goals || []).filter((g) => !g.done
    && (DASH_VIEW === 'all' || g.user_id == null || String(g.user_id) === String(DASH_VIEW)));
  if (!open.length) return '';
  return `<section class="card" style="margin-top:18px"><h3>${tr('Savings goals')}</h3>
    ${open.slice(0, 4).map((g) => {
      const pct = Math.min(100, Math.max(0, (g.saved / g.target) * 100));
      return `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between;gap:8px">
        <span>${esc(g.title)}${g.user_name ? ` <span class="muted">· ${esc(g.user_name)}</span>` : ''}${g.saved >= g.target ? ` <span class="badge paid">${tr('reached!')}</span>` : ''}</span>
        <span class="amount muted">${money(g.saved)} / ${money(g.target)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('')}
    ${open.length > 4 ? `<p class="muted" style="margin:0"><a href="#money">+${open.length - 4} ${tr('more')} →</a></p>` : ''}</section>`;
}
let PENDING_MONEY_TAB = null, PENDING_EXPENSE_FILTER = null;
// rapid expense entry: remember the last category for the session, keep the add form open after a
// save (reset when you leave the page, so a fresh visit still shows your data first), and let the
// floating + jump straight to a focused amount field.
let LAST_EXP_CAT = null, EXP_FORM_OPEN = false, FOCUS_AMOUNT = false;
// Chart.js is a ~200 KB dependency that only the dashboard needs, so it is fetched the first time a
// chart is actually drawn instead of on every page load. The promise is cached, so later renders
// (changing the period, switching person) reuse the already-loaded library.
const CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
let chartLibPromise = null;
function loadChartLib() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartLibPromise) {
    chartLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHART_SRC;
      s.onload = () => resolve(window.Chart);
      s.onerror = () => { chartLibPromise = null; reject(new Error('Chart.js failed to load')); };
      document.head.appendChild(s);
    });
  }
  return chartLibPromise;
}
async function drawCharts(stats, scopeView = 'all', scopeMonths = 1, trendStats = stats) {
  const css = getComputedStyle(document.documentElement);
  const val = (v, f) => css.getPropertyValue(v).trim() || f;
  const inkSoft = val('--ink-soft', '#666'), line = val('--line', '#ddd');
  const cardBg = val('--card', '#fff'), accent = val('--accent', '#2f6b5a'), red = val('--red', '#b23a2e');
  const dark = document.documentElement.dataset.theme === 'dark';
  // offline (or the CDN is down): say so in the chart boxes rather than throwing
  try { await loadChartLib(); } catch {
    for (const id of ['#catChart', '#trendChart']) {
      $(id)?.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: tr('Charts are unavailable offline.') }));
    }
    return;
  }
  {
    Chart.defaults.color = inkSoft;
    Chart.defaults.borderColor = line;
    Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
  }
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  // Chart.js formats its own numbers, and its default locale is not ours: the axis read "14,000"
  // beside a card reading "12.200,00 RON" on the same screen. Axis ticks drop the decimals (a
  // gridline does not need them); tooltips show the full amount with the currency.
  const axisNum = (v) => Number(v).toLocaleString('ro-RO', { maximumFractionDigits: 0 });
  const moneyTooltip = { callbacks: { label: (c) => ` ${c.dataset.label || c.label}: ${money(c.parsed.y ?? c.parsed)}` } };
  // legend chips as small dots, matching the pill/badge language elsewhere
  const legendDots = { labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 } };
  // clicking a category slice opens Expenses filtered to that category, keeping the dashboard's scope
  const drillTo = (cat) => {
    PENDING_MONEY_TAB = 'expenses';
    PENDING_EXPENSE_FILTER = { cat, who: scopeView === 'all' ? 'all' : String(scopeView), month: scopeMonths === 1 ? thisMonth() : 'all' };
    location.hash = '#money';
  };
  const cc = $('#catChart'); let catChart;
  // folded to six slices: past that a doughnut stops being readable and the palette runs out of
  // separable hues. The tail is not lost — it becomes "Other (+3)" and still drills through.
  const catRows = foldToTop(stats.byCategory, 5);
  const cats = catRows.map((c) => c.category); // untranslated keys for the drill-down filter
  const catTotal = catRows.reduce((s, c) => s + Number(c.total || 0), 0);
  if (cc && catRows.length) {
    catChart = new Chart(cc, {
      type: 'doughnut',
      data: { labels: cats.map(tr), datasets: [{ data: catRows.map((c) => c.total), backgroundColor: cats.map(catColor), borderColor: cardBg, borderWidth: 2, hoverOffset: 6 }] },
      options: {
        maintainAspectRatio: false, cutout: '62%',
        // the legend below carries name + amount + share, so the built-in one is redundant chrome
        plugins: { legend: { display: false }, tooltip: moneyTooltip },
        onClick: (e, els) => { if (els.length && !catRows[els[0].index].folded) drillTo(cats[els[0].index]); },
      },
    });
    cc.style.cursor = 'pointer';
    // A ring of six colours and six words told you Credit was biggest but not by how much, and
    // hovering was the only way to find out — which on a phone means never. The legend now carries
    // the numbers, and doubles as the chart's table view.
    const legend = $('#catLegend');
    if (legend) {
      legend.innerHTML = catRows.map((c, i) => {
        const pct = catTotal > 0 ? Math.round((c.total / catTotal) * 100) : 0;
        const name = c.folded ? `${tr('Other')} <span class="muted">(+${c.folded})</span>` : esc(tr(c.category));
        return `<li><button type="button" class="catleg" ${c.folded ? 'disabled' : `data-catjump="${esc(c.category)}"`}>
          <span class="catdot" style="--cat:${catColor(c.category)}"></span>
          <span class="catleg-name">${name}</span>
          <b class="catleg-amt">${money(c.total)}</b>
          <span class="muted catleg-pct">${pct}%</span></button></li>`;
      }).join('');
      legend.querySelectorAll('[data-catjump]').forEach((b) => (b.onclick = () => drillTo(b.dataset.catjump)));
    }
  } else if (cc) cc.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', innerHTML: `<b>${tr('No expenses this month yet.')}</b>` }));
  const months = [...new Set([...trendStats.trend.map((t) => t.m), ...trendStats.incomeTrend.map((t) => t.m)])].sort();
  const spentBy = (m) => trendStats.trend.find((t) => t.m === m)?.total || 0;
  const incomeBy = (m) => trendStats.incomeTrend.find((t) => t.m === m)?.total || 0;
  // "2026-01" rotated 43° to fit; "ian." fits flat, and matches how the Year view already writes it
  const monthLabels = months.map((m) => monthLabel(m));
  /* Cashflow as two smooth filled areas rather than sixteen bars: the shape of a month-over-month
     trend is the point, and a bar chart makes you read heights one pair at a time. A crosshair plus
     a tooltip carrying the value and the month replaces the grid-squinting. Colours stay green for
     money in and red for money out — the semantic is worth more than a monochrome pair. */
  const areaFill = (ctx, hex) => {
    const { chart } = ctx;
    if (!chart.chartArea) return 'transparent'; // first pass, before layout is known
    const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
    g.addColorStop(0, hex + '4d'); // ~30% at the top of the plot
    g.addColorStop(1, hex + '00');
    return g;
  };
  const series = (label, data, hex) => ({
    label, data, borderColor: hex, borderWidth: 2, tension: 0.4,
    fill: true, backgroundColor: (ctx) => areaFill(ctx, hex),
    pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: hex,
    pointHoverBorderColor: cardBg, pointHoverBorderWidth: 2,
  });
  // the dashed vertical line under the hovered point, drawn behind the datasets
  const crosshair = {
    id: 'fhCrosshair',
    beforeDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements?.() || [];
      if (!active.length) return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const c = chart.ctx;
      c.save();
      c.beginPath(); c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = inkSoft;
      c.moveTo(x, top); c.lineTo(x, bottom); c.stroke();
      c.restore();
    },
  };
  const tc = $('#trendChart'); if (tc && months.length) new Chart(tc, {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [series(tr('Income'), months.map(incomeBy), accent), series(tr('Spent'), months.map(spentBy), red)],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false }, // anywhere on the column, not on the 2px line
      plugins: {
        legend: legendDots,
        tooltip: {
          ...moneyTooltip, displayColors: true, usePointStyle: true,
          padding: 10, cornerRadius: 8, caretSize: 0,
          backgroundColor: cardBg, titleColor: inkSoft, bodyColor: val('--ink', '#000'),
          borderColor: line, borderWidth: 1,
          titleFont: { weight: '600' }, bodyFont: { family: mono, size: 13 },
        },
      },
      scales: {
        y: { beginAtZero: true, border: { display: false }, grid: { color: line }, ticks: { font: { family: mono }, callback: axisNum } },
        // flat labels: short month names fit, and Chart.js otherwise tilts them 43° on a narrow card
        x: { border: { display: false }, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
      },
    },
    plugins: [crosshair],
  });
  else if (tc) tc.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', innerHTML: `<b>${tr('History appears once you log expenses.')}</b>` }));

  /* What you kept, month by month.
     Income vs spending answers "what came in and what went out", but with a steady salary that is
     eight identical tall bars setting the scale while the spending variation — the part that is
     actually yours to change — gets squashed into the bottom third. This chart plots the difference
     instead, around a zero baseline, so a month you overspent drops below the line and is
     unmissable. Surplus/deficit is genuine polarity, so it earns a diverging pair (the app's own
     accent green and red) rather than two arbitrary series colours; the midpoint is the axis. */
  const nc = $('#netChart');
  if (nc && months.length) {
    const netData = months.map((m) => incomeBy(m) - spentBy(m));
    new Chart(nc, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: tr('Kept'),
          data: netData,
          backgroundColor: netData.map((v) => (v < 0 ? red : accent)),
          borderRadius: 5, maxBarThickness: 34,
        }],
      },
      options: {
        maintainAspectRatio: false,
        // one series: the title names it, so a legend box would just be chrome
        plugins: { legend: { display: false }, tooltip: moneyTooltip },
        scales: {
          y: { border: { display: false }, grid: { color: line }, ticks: { font: { family: mono }, callback: axisNum } },
          // flat labels: short month names fit, and Chart.js otherwise tilts them 43° on a narrow card
        x: { border: { display: false }, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
        },
      },
    });
  } else if (nc) nc.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', innerHTML: `<b>${tr('History appears once you log expenses.')}</b>` }));
}

/* ---------- calendar ---------- */
let CAL_MONTH = null; // 'YYYY-MM'
// rendered as a box inside the dashboard (embedded = the containing card is provided by the caller)
async function renderCalendar(el, embedded) {
  if (!CAL_MONTH) CAL_MONTH = thisMonth();
  const [reminders, info] = await Promise.all([api('/reminders?days=365'), api('/calendar/info')]);
  const byDate = {};
  for (const r of reminders) (byDate[r.date] = byDate[r.date] || []).push(r);
  const [Y, M] = CAL_MONTH.split('-').map(Number);
  const first = new Date(Date.UTC(Y, M - 1, 1));
  const daysIn = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const monthLabel = first.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const t = today();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysIn; d++) {
    const date = `${CAL_MONTH}-${String(d).padStart(2, '0')}`;
    const evs = byDate[date] || [];
    cells.push(`<div class="day${date === t ? ' today' : ''}"><div class="n">${d}</div>
      ${evs.slice(0, 3).map((r) => `<div class="ev ${remClass(r)}" title="${esc(remLabel(r) + (r.entity ? ' — ' + r.entity : ''))}">${esc(remLabel(r))}</div>`).join('')}
      ${evs.length > 3 ? `<div class="muted" style="font-size:11px">+${evs.length - 3} ${tr('more')}</div>` : ''}</div>`);
  }
  const controls = `<div class="row"><button class="btn ghost small" id="calprev">←</button>
    <b style="min-width:130px;text-align:center;text-transform:capitalize">${esc(monthLabel)}</b>
    <button class="btn ghost small" id="calnext">→</button>
    <button class="btn ghost small" id="caltoday">Today</button></div>`;
  const subscribeInner = info.url
    ? `<p class="muted">Add this address in Google Calendar (Other calendars → From URL) or Apple Calendar (Add Subscription Calendar) — deadlines then show up in your normal calendar and update automatically.</p>
       <div class="row"><input readonly value="${esc(info.url)}" class="selectall" style="flex:1;min-width:220px;font-size:13px">
       <button class="btn ghost small" data-copy="${esc(info.url)}">Copy link</button>
       ${canWrite() ? `<button class="btn ghost small" id="calrotate">New link</button>` : ''}</div>`
    : canWrite() ? `<p class="muted">Generate a private link and subscribe from Google/Apple Calendar.</p><button class="btn small" id="calgen">Generate subscribe link</button>`
    : `<p class="muted">Ask an adult to generate the subscribe link.</p>`;
  const grid = `<div class="cal">${['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'].map((d) => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div>`;
  el.innerHTML = embedded
    ? `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px"><h3 style="margin:0">Calendar</h3>${controls}</div>
       ${grid}
       <details style="margin-top:12px"><summary style="cursor:pointer;color:var(--ink-soft);font-size:13px">Subscribe from your phone's calendar</summary><div style="padding-top:8px">${subscribeInner}</div></details>`
    : `<div class="pagehead"><div><h1>Calendar</h1><p>Every deadline, bill and birthday on one calendar.</p></div>${controls}</div>
       ${grid}
       <div class="card" style="margin-top:18px"><h3>Subscribe from your phone's calendar</h3>${subscribeInner}</div>`;
  const shift = (n) => { const d = new Date(Date.UTC(Y, M - 1 + n, 1)); CAL_MONTH = d.toISOString().slice(0, 7); renderCalendar(el, embedded); };
  $('#calprev').onclick = () => shift(-1);
  $('#calnext').onclick = () => shift(1);
  $('#caltoday').onclick = () => { CAL_MONTH = thisMonth(); renderCalendar(el, embedded); };
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  const gen = async () => { await api('/calendar/token', { method: 'POST' }); toast('Subscribe link ready'); renderCalendar(el, embedded); };
  $('#calgen')?.addEventListener('click', gen);
  $('#calrotate')?.addEventListener('click', async () => { if (confirm('Generate a new link? The old one stops working.')) await gen(); });
}

/* ---------- money: expenses / income / budgets ---------- */
async function viewMoney(el, tab) {
  if (tab == null) { tab = PENDING_MONEY_TAB || 'expenses'; PENDING_MONEY_TAB = null; }
  el.innerHTML = `<div class="pagehead"><div><h1>Budget & expenses</h1><p>Track what comes in, what goes out, and set monthly limits.</p></div>
    <a class="btn ghost small" href="/api/export/expenses.csv">Export expenses (CSV)</a></div>
    <div class="tabs" style="max-width:680px">
      ${[['expenses', 'Expenses'], ['income', 'Income'], ['budgets', 'Budgets'], ['credits', 'Credits'], ['savings', 'Savings'], ['debt', 'Debt'], ['year', 'Year']].map(([t, l]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${tr(l)}</button>`).join('')}
    </div><div id="moneybody">Loading…</div>`;
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewMoney(el, b.dataset.t)));
  const body = $('#moneybody');
  if (tab === 'expenses') { const f = PENDING_EXPENSE_FILTER || {}; PENDING_EXPENSE_FILTER = null; return moneyExpenses(body, f); }
  if (tab === 'income') return moneyIncome(body);
  if (tab === 'credits') return moneyCredits(body);
  if (tab === 'savings') return moneySavings(body);
  if (tab === 'debt') return moneyDebt(body);
  if (tab === 'year') return moneyYear(body);
  return moneyBudgets(body);
}
/* ---------- debt overview ----------
   Each credit card already shows its own progress, but nothing ever added them up: what the
   household owes today, what it pays every month, and — the number worth seeing — when it is
   finally clear. creditStats hands us base_total_interest (what the loan costs run to term) and
   total_interest (what it costs given the overpayments actually made), so their difference is
   exactly the interest those overpayments have saved. That was already computed and never shown. */
async function moneyDebt(body) {
  const [credits, loans, members] = await Promise.all([api('/credits'), api('/loans'), api('/family/members')]);
  const live = credits.filter((c) => Number(c.months_left) > 0 || Number(c.balance) > 0.005);
  if (!live.length && !loans.length) {
    body.innerHTML = `<div class="card empty"><b>${tr('No debt')}</b>${tr('Nothing outstanding — add a loan under Credits, or record money you lent below.')}</div>
      <div id="lentwrap"></div>`;
    renderLent(body.querySelector('#lentwrap'), loans, members, () => moneyDebt(body));
    return;
  }
  if (!live.length) {
    body.innerHTML = '<div id="lentwrap"></div>';
    renderLent(body.querySelector('#lentwrap'), loans, members, () => moneyDebt(body));
    return;
  }
  const owed = live.reduce((s, c) => s + Number(c.balance || 0), 0);
  const perMonth = live.reduce((s, c) => s + Number(c.monthly_total || 0), 0);
  const totalInterest = credits.reduce((s, c) => s + Number(c.total_interest || 0), 0);
  const saved = credits.reduce((s, c) => s + Number(c.interest_saved || 0), 0);
  // Interest still ahead of you is what the remaining instalments add up to beyond the remaining
  // principal; what's behind you is the rest. Derived rather than stored, but from real figures.
  const interestLeft = live.reduce((s, c) =>
    s + Math.max(0, (Number(c.monthly_payment || 0) * Math.round(Number(c.months_left) || 0)) - Number(c.balance || 0)), 0);
  const paidInterest = Math.max(0, totalInterest - interestLeft);
  const maxLeft = Math.max(...live.map((c) => Math.round(Number(c.months_left) || 0)));
  const free = new Date(); free.setUTCDate(1); free.setUTCMonth(free.getUTCMonth() + maxLeft);
  const freeLabel = free.toLocaleDateString(LANG === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  body.innerHTML = `
    <section class="kpi">
      <div class="card"><div class="label">${tr('Owed today')}</div><div class="value neg">${money(owed)}</div>
        <div class="muted" style="font-size:12.5px">${live.length} ${tr(live.length === 1 ? 'loan' : 'loans')}</div></div>
      <div class="card"><div class="label">${tr('Every month')}</div><div class="value">${money(perMonth)}</div>
        <div class="muted" style="font-size:12.5px">${tr('instalments + commission')}</div></div>
      <div class="card"><div class="label">${tr('Debt-free')}</div><div class="value" style="font-size:20px">${esc(freeLabel)}</div>
        <div class="muted" style="font-size:12.5px">${maxLeft} ${tr('mo left')}</div></div>
    </section>

    ${saved > 0.5 ? `<section class="card insight" style="margin-top:18px"><span class="insight-ic" aria-hidden="true">◆</span>
      <p>${LANG === 'ro'
        ? `Plățile anticipate ți-au economisit <b class="amount" style="color:var(--ok)">${money(saved)}</b> din dobândă.`
        : `Your overpayments have saved <b class="amount" style="color:var(--ok)">${money(saved)}</b> of interest.`}</p></section>` : ''}

    <section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Interest')}</h3>
      <div class="row" style="justify-content:space-between"><span>${tr('Total cost of borrowing')}</span>
        <span class="amount">${money(totalInterest)}</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${totalInterest > 0 ? Math.min(100, (paidInterest / totalInterest) * 100) : 0}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:4px">
        <span class="muted" style="font-size:12.5px">${tr('paid so far')} ${money(paidInterest)}</span>
        <span class="muted" style="font-size:12.5px">${tr('still to pay')} ${money(Math.max(0, totalInterest - paidInterest))}</span></div>
    </section>

    <section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Loans')}</h3>
      <table class="cards"><thead><tr><th>${tr('Credit')}</th><th class="right">${tr('Balance today')}</th><th class="right">${tr('Monthly total')}</th><th class="right">${tr('mo left')}</th></tr></thead><tbody>
      ${live.slice().sort((a, b) => Number(b.balance) - Number(a.balance)).map((c) => `<tr>
        <td data-label="${tr('Credit')}"><b>${esc(c.name)}</b>${c.lender ? ` <span class="muted">· ${esc(c.lender)}</span>` : ''}</td>
        <td class="right amount" data-label="${tr('Balance today')}">${money(c.balance)}</td>
        <td class="right amount" data-label="${tr('Monthly total')}">${money(Number(c.monthly_payment || 0) + (Number(c.commission) || 0))}</td>
        <td class="right" data-label="${tr('mo left')}">${Math.round(Number(c.months_left) || 0)}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <div id="lentwrap"></div>`;
  renderLent(body.querySelector('#lentwrap'), loans, members, () => moneyDebt(body));
}

/* ---------- the other direction: money lent to people ----------
   A bank loan has a schedule; lending your brother 2.000 lei has a name and whatever comes back. The
   outstanding figure is recomputed from the repayments on every render rather than kept anywhere, so
   it cannot drift from the rows underneath it. */
function renderLent(el, loans, members, refresh) {
  if (!el) return;
  const open = loans.filter((l) => !l.settled);
  const outstanding = open.reduce((m, l) => {
    const c = l.currency || FAMILY?.currency || 'RON';
    m[c] = (m[c] || 0) + Number(l.balance || 0);
    return m;
  }, {});
  const outstandingText = Object.entries(outstanding).map(([c, v]) => moneyIn(v, c)).join(' · ');
  const iso = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((l) => l.due_date && l.due_date < iso);

  el.innerHTML = `<section class="card" style="margin-top:18px">
    <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
      <h3 style="margin:0">${tr('Money lent')}</h3>
      ${open.length ? `<div style="text-align:right"><div class="muted" style="font-size:12.5px">${tr('Still out with people')}</div>
        <div class="amount"><b>${outstandingText}</b></div></div>` : ''}
    </div>
    ${overdue.length ? `<p class="badge warn" style="margin:10px 0 0">${overdue.length} ${tr(overdue.length === 1 ? 'is past its date' : 'are past their date')}</p>` : ''}

    ${loans.length ? `<ul class="chorelist" style="margin-top:12px">${loans.map((l) => {
    const pct = Number(l.amount) > 0 ? Math.min(100, (Number(l.repaid) / Number(l.amount)) * 100) : 0;
    const late = !l.settled && l.due_date && l.due_date < iso;
    return `<li class="chorerow${l.settled ? ' is-done' : ''}" style="display:block">
      <div class="row" style="justify-content:space-between;gap:10px;align-items:baseline">
        <span class="choretitle">${esc(l.person)}</span>
        <span class="amount"${late ? ' style="color:var(--red)"' : ''}>${l.settled ? tr('Settled') : moneyIn(l.balance, l.currency)}</span>
      </div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:4px;gap:8px;flex-wrap:wrap">
        <span class="muted" style="font-size:12.5px">${[
      `${tr('lent')} ${moneyIn(l.amount, l.currency)}`,
      Number(l.repaid) > 0 ? `${tr('back')} ${moneyIn(l.repaid, l.currency)}` : null,
      l.due_date ? `${tr('due back')} ${fdate(l.due_date)}` : tr('no date agreed'),
      l.user_name ? esc(l.user_name) : null,
      l.note ? esc(l.note) : null,
    ].filter(Boolean).join(' · ')}</span>
        ${canWrite() ? `<span class="row" style="gap:6px">
          ${l.settled ? '' : `<button class="btn ghost small" data-lenpay="${l.id}">${tr('Record repayment')}</button>`}
          <button class="btn danger small" data-lendel="${l.id}" aria-label="${tr('Delete')}">✕</button></span>` : ''}
      </div>
      <form class="formgrid" data-lenform="${l.id}" hidden style="margin-top:10px">
        <div><label>${tr('Amount')} <span class="muted">${CURRENCIES[l.currency] || l.currency || cur()}</span></label><input name="amount" type="number" step="0.01" min="0.01" max="${l.balance}" required></div>
        <div><label>${tr('Date')}</label><input name="date" type="date" value="${iso}" required></div>
        <button class="btn small">${tr('Save')}</button>
      </form>
    </li>`;
  }).join('')}</ul>`
    : `<div class="empty" style="margin-top:12px"><b>${tr('Nobody owes you anything')}</b>${tr('Record money you lend out and what comes back is tracked here.')}</div>`}

    ${canWrite() ? `<div class="subform">
      <h4>${tr('Lend money')}</h4>
      <form id="lentform" class="formgrid">
        <div><label>${tr('Who has it')}</label><input name="person" placeholder="Andrei" required></div>
        <div><label>${tr('Amount')}</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <div><label>${tr('Currency')}</label><select name="currency">${Object.entries(CURRENCIES).map(([code, sym]) =>
    `<option value="${code}" ${code === FAMILY?.currency ? 'selected' : ''}>${code}${code === sym ? '' : ` (${sym})`}</option>`).join('')}</select></div>
        <div><label>${tr('Date')}</label><input name="date" type="date" value="${iso}" required></div>
        <div><label>${tr('Due back')} <span class="muted">${tr('optional')}</span></label><input name="due_date" type="date"></div>
        <div><label>${tr('Person')}</label><select name="user_id"><option value="">${tr('Anyone')}</option>
          ${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
        <div><label>${tr('Note')} <span class="muted">${tr('optional')}</span></label><input name="note"></div>
        <button class="btn small">${tr('Save')}</button>
      </form></div>` : ''}
  </section>`;

  el.querySelectorAll('[data-lenpay]').forEach((b) => (b.onclick = () => {
    const f = el.querySelector(`[data-lenform="${b.dataset.lenpay}"]`);
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector('input')?.focus();
  }));
  el.querySelectorAll('[data-lenform]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/loans/${f.dataset.lenform}/payments`, { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      toast(tr('Repayment recorded'), 'success'); refresh();
    } catch (err) { toast(err.message, 'error'); }
  }));
  el.querySelectorAll('[data-lendel]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/loans/' + b.dataset.lendel, { method: 'DELETE' }).then(refresh) });
  }));
  el.querySelector('#lentform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/loans', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(tr('Loan recorded'), 'success'); refresh(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
/* ---------- year in review ----------
   The dashboard answers "how is this month going"; this answers "how was the year". Same stats
   endpoint, twelve months of it, plus the year before for comparison — the point is which
   categories moved, not just what the total was. */
async function moneyYear(body) {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const [cur, prev, all] = await Promise.all([
    api('/stats?months=12'), api('/stats?months=24').catch(() => null), api('/expenses'),
  ]);
  const inYear = (d, y) => String(d).startsWith(String(y));
  const thisYear = all.filter((e) => inYear(e.date, yr));
  const lastYear = all.filter((e) => inYear(e.date, yr - 1));
  const sum = (rows) => rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const byCat = (rows) => rows.reduce((m, e) => ((m[e.category] = (m[e.category] || 0) + Number(e.amount || 0)), m), {});
  const curCat = byCat(thisYear), prevCat = byCat(lastYear);
  const spentY = sum(thisYear), spentPrev = sum(lastYear);

  // month-by-month bars, drawn from the same numbers rather than a chart library
  const months = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`);
  const perMonth = months.map((m) => thisYear.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + Number(e.amount || 0), 0));
  // the same months a year earlier, so each bar can be read against its own season rather than
  // against the month before it — January heating never did compare fairly to December
  const perMonthPrev = months.map((m) => {
    const lm = `${yr - 1}-${m.slice(5)}`;
    return lastYear.filter((e) => e.date.startsWith(lm)).reduce((s, e) => s + Number(e.amount || 0), 0);
  });
  const peak = Math.max(...perMonth, ...perMonthPrev, 1);
  const hasPrevMonths = perMonthPrev.some((v) => v > 0);
  const thisMonthIdx = now.getUTCMonth();

  /* Category drift — the actionable view the year page never had. The doughnut says what this month
     looked like and the bars say what every month totalled, but neither answers "is this creeping
     up?", which is the only question that changes behaviour. One mini-chart per category, sharing a
     scale within each row so the shapes are comparable. */
  const catSeries = Object.keys(curCat)
    .map((c) => ({
      c,
      total: curCat[c],
      series: months.map((m) => thisYear.filter((e) => e.category === c && e.date.startsWith(m))
        .reduce((s, e) => s + Number(e.amount || 0), 0)),
    }))
    .filter((x) => x.series.filter((v) => v > 0).length >= 2) // one month is not a trend
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  // First vs last COMPLETED month. The current month is only part-spent — on the 9th it holds nine
  // days against a full January — so including it made every category read as falling sharply.
  // It still gets a bar; it just doesn't get a vote on the trend.
  const drift = (s) => {
    const active = s.slice(0, thisMonthIdx).map((v, i) => [v, i]).filter(([v]) => v > 0);
    if (active.length < 2) return null;
    const first = active[0][0], last = active[active.length - 1][0];
    if (!(first > 0)) return null;
    return Math.round(((last - first) / first) * 100);
  };

  const moves = Object.keys({ ...curCat, ...prevCat })
    .map((c) => ({ c, now: curCat[c] || 0, then: prevCat[c] || 0, diff: (curCat[c] || 0) - (prevCat[c] || 0) }))
    .filter((x) => Math.abs(x.diff) >= 50 && x.then > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6);
  const biggest = thisYear.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 8);

  body.innerHTML = `
    <section class="kpi">
      <div class="card"><div class="label">${tr('Spent')} · ${yr}</div><div class="value">${money(spentY)}</div>
        ${spentPrev > 0 ? `<div class="muted" style="font-size:12.5px">${spentPrev > 0 ? `${spentY >= spentPrev ? '▲' : '▼'} ${Math.abs(Math.round(((spentY - spentPrev) / spentPrev) * 100))}% ${tr('vs')} ${yr - 1}` : ''}</div>` : ''}</div>
      <div class="card"><div class="label">${tr('Monthly average')}</div>
        <div class="value">${money(spentY / Math.max(1, perMonth.filter((v) => v > 0).length))}</div>
        <div class="muted" style="font-size:12.5px">${(() => { const n = perMonth.filter((v) => v > 0).length;
          return `${n} ${tr(n === 1 ? 'month with spending' : 'months with spending')}`; })()}</div></div>
      <div class="card"><div class="label">${yr - 1}</div><div class="value">${money(spentPrev)}</div>
        <div class="muted" style="font-size:12.5px">${lastYear.length} ${tr('records')}</div></div>
    </section>

    <section class="card" style="margin-top:18px"><h3 style="margin-top:0">${tr('Month by month')} · ${yr}</h3>
      ${hasPrevMonths ? `<p class="muted" style="margin:-4px 0 10px;font-size:13px">
        <span class="ghostkey"></span> ${tr('the faint mark is the same month in')} ${yr - 1}</p>` : ''}
      <div class="yearbars">${months.map((m, i) => {
        // The value used to live only in a native `title`, which never fires on a phone — so on the
        // device this app is actually used on, the chart could not be read at all. Now the current
        // month and the year's peak are labelled outright, and every bar answers to a tap.
        const isPeak = perMonth[i] === peak && peak > 0;
        const isNow = i === thisMonthIdx;
        const show = (isPeak || isNow) && perMonth[i] > 0;
        return `<button type="button" class="yearbar${perMonth[i] > 0 ? '' : ' yb-zero'}" data-ybar="${m}"
          aria-label="${esc(monthLabel(m, { short: false }))}: ${esc(money(perMonth[i]))}">
          <div class="yb-val${show ? '' : ' hid'}">${show ? moneyShort(perMonth[i]) : ''}</div>
          <div class="yb-track">
            ${hasPrevMonths && perMonthPrev[i] > 0 ? `<span class="yb-prev" style="bottom:${(perMonthPrev[i] / peak) * 100}%"></span>` : ''}
            <div class="yb-fill${isNow ? ' now' : ''}" style="height:${(perMonth[i] / peak) * 100}%"></div>
          </div>
          <div class="yb-label">${monthLabel(m)}</div>
        </button>`;
      }).join('')}</div>
      <p class="muted yb-readout" id="ybReadout" aria-live="polite"></p>
    </section>

    ${catSeries.length ? `<section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Category trends')} · ${yr}</h3>
      <p class="muted" style="margin:-4px 0 10px;font-size:13px">${tr('Where the money is drifting, month by month.')}</p>
      <div class="sparkgrid">${catSeries.map((x) => {
        const d = drift(x.series);
        const peakC = Math.max(...x.series, 1);
        return `<div class="sparkcell">
          <div class="row" style="justify-content:space-between;gap:8px;align-items:baseline">
            <span class="catcell"><span class="catdot" style="--cat:${catColor(x.c)}"></span>${esc(tr(x.c))}</span>
            <b class="amount" style="font-size:13px">${money(x.total)}</b></div>
          <div class="minibars">${x.series.map((v, i) => `<span class="mb${i === thisMonthIdx ? ' now' : ''}" style="height:${Math.max(v > 0 ? 6 : 2, (v / peakC) * 100)}%;--cat:${catColor(x.c)}" title="${esc(monthLabel(months[i], { short: false }))}: ${esc(money(v))}"></span>`).join('')}</div>
          <div class="muted" style="font-size:12px">${d == null ? tr('not enough history')
            : d === 0 ? tr('flat')
            : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}% ${tr('since the start of the year')}`}</div>
        </div>`;
      }).join('')}</div>
    </section>` : ''}

    ${moves.length ? `<section class="card" style="margin-top:18px"><h3 style="margin-top:0">${tr('What moved')} · ${yr} ${tr('vs')} ${yr - 1}</h3>
      <table class="cards"><thead><tr><th>${tr('Category')}</th><th class="right">${yr - 1}</th><th class="right">${yr}</th><th class="right">${tr('Change')}</th></tr></thead><tbody>
      ${moves.map((x) => `<tr>
        <td data-label="${tr('Category')}"><span class="catcell"><span class="catdot" style="--cat:${catColor(x.c)}"></span>${esc(tr(x.c))}</span></td>
        <td class="right amount" data-label="${yr - 1}">${money(x.then)}</td>
        <td class="right amount" data-label="${yr}">${money(x.now)}</td>
        <td class="right amount" data-label="${tr('Change')}" style="color:${x.diff > 0 ? 'var(--red)' : 'var(--ok)'}">${x.diff > 0 ? '+' : ''}${money(x.diff)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}

    ${biggest.length ? `<section class="card" style="margin-top:18px"><h3 style="margin-top:0">${tr('Biggest expenses')} · ${yr}</h3>
      <table class="cards"><thead><tr><th>${tr('Date')}</th><th>${tr('Category')}</th><th>${tr('Note')}</th><th class="right">${tr('Amount')}</th></tr></thead><tbody>
      ${biggest.map((e) => `<tr>
        <td data-label="${tr('Date')}">${fdate(e.date)}</td>
        <td data-label="${tr('Category')}"><span class="catcell"><span class="catdot" style="--cat:${catColor(e.category)}"></span>${esc(tr(e.category))}</span></td>
        <td data-label="${tr('Note')}">${esc(e.note || '')}</td>
        <td class="right amount" data-label="${tr('Amount')}">${money(e.amount)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}`;

  // Tap (or focus) a bar to read its month — the readout is a real element rather than a native
  // `title`, so it works on a touch screen and is announced to a screen reader.
  const readout = body.querySelector('#ybReadout');
  body.querySelectorAll('[data-ybar]').forEach((b) => {
    const say = () => {
      const m = b.dataset.ybar, i = months.indexOf(m);
      const prevPart = hasPrevMonths && perMonthPrev[i] > 0
        ? ` · ${yr - 1}: ${money(perMonthPrev[i])}` : '';
      readout.textContent = `${monthLabel(m, { short: false })}: ${money(perMonth[i])}${prevPart}`;
      body.querySelectorAll('[data-ybar]').forEach((o) => o.classList.toggle('sel', o === b));
    };
    b.addEventListener('click', say);
    b.addEventListener('focus', say);
    b.addEventListener('mouseenter', say);
  });
}
function whoFilter(id, members, who) {
  return `<select id="${id}" style="width:160px">
    <option value="all" ${who === 'all' ? 'selected' : ''}>Whole family</option>
    ${members.map((m) => `<option value="${m.id}" ${String(m.id) === String(who) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
  </select>`;
}
// shared by "Add expense" and the inline edit row, so the two can never drift apart
function expenseFormFields(members, properties, vehicles, e = {}) {
  const link = e.property_id ? `property:${e.property_id}` : e.vehicle_id ? `vehicle:${e.vehicle_id}` : '';
  return `
    <div><label>Date</label><input name="date" type="date" value="${e.date || today()}" required></div>
    <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option value="${c}" ${(e.category ?? LAST_EXP_CAT) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" value="${e.amount ?? ''}" required></div>
    <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${String(e.user_id ?? ME.id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    ${properties.length || vehicles.length ? `<div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
      ${ownProps(properties).map((p) => `<option value="property:${p.id}" ${link === `property:${p.id}` ? 'selected' : ''}>⌂ ${esc(p.name)}</option>`).join('')}
      ${vehicles.map((v) => `<option value="vehicle:${v.id}" ${link === `vehicle:${v.id}` ? 'selected' : ''}>⛟ ${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    <div><label>Note</label><input name="note" placeholder="optional" value="${esc(e.note || '')}"></div>
    <div style="align-self:center"><label class="cardtick"><input type="checkbox" name="on_card" value="1" ${e.on_card ? 'checked' : ''} style="width:auto"> ${tr('Paid by credit card')}</label></div>`;
}
// the combined link select unpacks into real columns; both keys are always written so
// clearing the link on edit actually clears it server-side
function unpackExpenseBody(b) {
  // an unticked checkbox is not in FormData at all, and the edit route falls back to the stored
  // row for anything the body does not mention — so unticking has to be said out loud
  b.on_card = b.on_card ? 1 : 0;
  const l = String(b.link || ''); delete b.link;
  b.property_id = null; b.vehicle_id = null;
  if (l) { const [kind, id] = l.split(':'); b[kind + '_id'] = Number(id); }
  return b;
}
async function moneyExpenses(body, f = {}) {
  const flt = { month: thisMonth(), who: 'all', cat: 'all', q: '', ...f };
  const [all, members, properties, vehicles, recurring] = await Promise.all([
    api('/expenses'), api('/family/members'), api('/properties'), api('/vehicles'), api('/recurring-expenses')]);
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const q = flt.q.trim().toLowerCase();
  // every filter EXCEPT category — the subtotals strip is built from this, so picking a category
  // narrows the table without collapsing the strip to the one pill you just clicked (which would
  // leave no way to click it again and clear)
  const inScope = all.filter((e) =>
    (flt.month === 'all' || e.date.startsWith(flt.month)) &&
    (flt.who === 'all' || String(e.user_id) === String(flt.who)) &&
    (!q || (e.note || '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q)));
  const rows = inScope.filter((e) => flt.cat === 'all' || e.category === flt.cat);
  // Card purchases sit in the same list — hiding them would make an expense you entered vanish —
  // but they are not money out of the account yet, so no total here counts them. The card figure
  // is stated next to the account one instead of folded into it.
  const fromAccount = (list) => list.filter((e) => !e.on_card);
  const sum = (list) => list.reduce((s, e) => s + e.amount, 0);
  const total = sum(fromAccount(rows));
  const cardRows = inScope.filter((e) => e.on_card);
  const cardTotal = sum(cardRows);
  const cardByPerson = Object.entries(cardRows.reduce((m, e) => ((m[e.user_id] = (m[e.user_id] || 0) + e.amount), m), {}))
    .sort((a, b) => b[1] - a[1]);
  // top categories in the current view — the breakdown that otherwise only lives in the dashboard donut
  const scopeTotal = sum(fromAccount(inScope));
  const byCat = Object.entries(fromAccount(inScope).reduce((m, e) => ((m[e.category] = (m[e.category] || 0) + e.amount), m), {}))
    .sort((a, b) => b[1] - a[1]);
  // who put what on the card, for the same month and person the filters are showing
  const cardPanel = cardTotal > 0 ? `<div class="card cardpanel" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;gap:10px;align-items:baseline">
        <h3 style="margin:0">${tr('On the credit card')}</h3><span class="amount"><b>${money(cardTotal)}</b></span></div>
      <p class="muted" style="margin:4px 0 10px">${tr('Not counted as spent — the money leaves the account when you pay the card bill.')}</p>
      <table class="cards"><tbody>${cardByPerson.map(([uid, amt]) => `<tr>
        <td>${whoChip(mname[uid])}</td>
        <td class="right amount">${money(amt)}</td></tr>`).join('')}</tbody></table>
    </div>` : '';
  const subtotals = (byCat.length > 1 && scopeTotal > 0) ? `<div class="catstrip">${byCat.slice(0, 6).map(([c, amt]) =>
    // The name is its own element so it can be the part that truncates when a pill is squeezed to
    // half a phone row — a bare text node has nothing to hang text-overflow on. Both amounts are
    // rendered and CSS picks one: a phone pill has no room for "1.250,00 RON" six times over, a
    // desktop one does and there's no reason to make it read worse.
    `<button class="catpill${flt.cat === c ? ' on' : ''}" data-catjump="${esc(c)}" style="--cat:${catColor(c)}" aria-pressed="${flt.cat === c}"><span class="catdot"></span><span class="catname">${esc(tr(c))}</span><b title="${money(amt)}"><span class="amt-full">${money(amt)}</span><span class="amt-short">${moneyShort(amt)}</span></b><span class="muted">${Math.round((amt / scopeTotal) * 100)}%</span></button>`).join('')}</div>` : '';
  const reload = (patch) => moneyExpenses(body, { ...flt, ...patch });
  body.innerHTML = `
    ${canWrite() ? (isPhone()
      // phone: the original collapsed form with every field laid out, as it was
      ? addBox('Add expense', `<form id="expform" class="formgrid">
        ${expenseFormFields(members, properties, vehicles)}
        <button class="btn">Add expense</button></form>`, EXP_FORM_OPEN)
      // desktop: one wide row is enough for amount + category, the rest folds away
      : `<div class="card quickadd"><form id="expform">
      <div class="qrow">
        <span class="qamt-wrap">
          <input name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal"
            class="qamt" placeholder="0,00" aria-label="${tr('Amount')} (${cur()})">
          <span class="qcur" aria-hidden="true">${cur()}</span>
        </span>
        <select name="category" class="qcat" aria-label="${tr('Category')}">
          ${CATEGORIES.map((c) => `<option value="${c}" ${LAST_EXP_CAT === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <button class="btn qgo">${tr('Add')}</button>
      </div>
      <button type="button" class="btn ghost small qmore-btn" data-more aria-expanded="false">${tr('More details')}</button>
      <div class="formgrid qmore" hidden>
        <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
        <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        ${properties.length || vehicles.length ? `<div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
          ${ownProps(properties).map((p) => `<option value="property:${p.id}">⌂ ${esc(p.name)}</option>`).join('')}
          ${vehicles.map((v) => `<option value="vehicle:${v.id}">⛟ ${esc(v.name)}</option>`).join('')}</select></div>` : ''}
        <div><label>Note</label><input name="note" placeholder="optional"></div>
        <div style="align-self:center"><label class="cardtick"><input type="checkbox" name="on_card" value="1" '' style="width:auto"> ${tr('Paid by credit card')}</label></div>
      </div></form></div>`) : ''}
    <details class="card addbox" style="margin-top:16px"><summary><span class="plus" aria-hidden="true">+</span> Recurring expenses</summary><div class="addbody">
      <p class="muted" style="margin-top:0">Fixed monthly costs that aren't bills — logged automatically every month on the chosen day.</p>
      ${recurring.length ? `<table><tbody>${recurring.map((r) => `<tr style="${r.active ? '' : 'opacity:.55'}">
        <td><b>${esc(r.note || tr(r.category))}</b> <span class="muted">· ${tr(r.category)} · ${esc(r.user_name || tr('whole family'))} · ${tr('day')} ${r.day}${r.on_card ? ' · ' + tr('on card') : ''}${r.property_name ? ` · ⌂ ${esc(r.property_name)}` : ''}${r.vehicle_name ? ` · ⛟ ${esc(r.vehicle_name)}` : ''}</span>${r.active ? '' : ' <span class="badge role">paused</span>'}</td>
        <td class="right amount">${money(r.amount)}<span class="muted">/${tr('mo')}</span></td>
        <td class="right">${canWrite() ? `<span class="rowacts"><button class="btn ghost small" data-rxtog="${r.id}">${r.active ? 'Pause' : 'Resume'}</button>
          <button class="btn danger small" data-rxdel="${r.id}">✕</button></span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${canWrite() ? `<form id="recxform" class="formgrid" style="margin-top:10px">
        <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
        <div><label>Note</label><input name="note" placeholder="Grădiniță, asigurare…"></div>
        <div><label>Amount (${cur()}/mo)</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <div><label>Day of month</label><input name="day" type="number" min="1" max="31" value="1" required></div>
        <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        ${properties.length || vehicles.length ? `<div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
          ${ownProps(properties).map((p) => `<option value="property:${p.id}">⌂ ${esc(p.name)}</option>`).join('')}
          ${vehicles.map((v) => `<option value="vehicle:${v.id}">⛟ ${esc(v.name)}</option>`).join('')}</select></div>` : ''}
        <div style="align-self:center"><label class="cardtick"><input type="checkbox" name="on_card" value="1" '' style="width:auto"> ${tr('Paid by credit card')}</label></div>
        <button class="btn small">Add recurring</button></form>` : ''}
    </div></details>
    ${cardPanel}
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;gap:10px"><h3 style="margin:0">Expenses</h3><span class="amount"><b>${money(total)}</b>${cardTotal > 0 ? ` <span class="muted" style="font-weight:400">+ ${money(cardTotal)} ${tr('on card')}</span>` : ''}</span></div>
      <div class="row filterrow">
        ${whoFilter('wfilter', members, flt.who)}
        <select id="cfilter"><option value="all" ${flt.cat === 'all' ? 'selected' : ''}>All categories</option>${CATEGORIES.map((c) => `<option value="${c}" ${flt.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input id="mfilter" type="month" value="${flt.month === 'all' ? '' : flt.month}">
        <button class="btn ghost small" id="allmonths">${flt.month === 'all' ? '● All time' : 'All time'}</button>
        <input id="qfilter" type="search" placeholder="Search note…" value="${esc(flt.q)}">
      </div>
      ${subtotals}
      ${rows.length ? `<table class="cards"><thead><tr><th>${tr('Date')}</th><th>${tr('Category')}</th><th>${tr('By')}</th><th>${tr('Note')}</th><th class="right">${tr('Amount')}</th><th></th></tr></thead><tbody>
        ${rows.map((e, i) => { const link = e.property_name ? `⌂ ${esc(e.property_name)}` : e.vehicle_name ? `⛟ ${esc(e.vehicle_name)}` : '';
          // a light header each time the date changes, with that day's total — the rows arrive in
          // date order, so this just breaks a long month into scannable days
          const sep = (i === 0 || rows[i - 1].date !== e.date)
            ? `<tr class="daysep"><td colspan="6"><div class="daysep-in"><span>${dayLabel(e.date)}</span><span class="amount">${money(sum(fromAccount(rows.filter((r) => r.date === e.date))))}${sum(rows.filter((r) => r.date === e.date && r.on_card)) > 0 ? ` <span class="muted">+ ${money(sum(rows.filter((r) => r.date === e.date && r.on_card)))} ${tr('on card')}</span>` : ''}</span></div></td></tr>`
            : '';
          return `${sep}<tr>
          <td data-label="${tr('Date')}">${fdate(e.date)}</td>
          <td data-label="${tr('Category')}"><span class="catcell"><span class="catdot" style="--cat:${catColor(e.category)}"></span>${esc(e.category)}</span></td>
          <td data-label="${tr('By')}">${whoChip(mname[e.user_id])}</td>
          <td data-label="${tr('Note')}">${esc(e.note || '')}${link ? `${e.note ? ' · ' : ''}<span class="muted">${link}</span>` : ''}</td>
          <td class="right amount" data-label="${tr('Amount')}">${money(e.amount)}${e.on_card ? `<br><span class="badge cardbadge">${tr('on card')}</span>` : ''}</td>
          <td class="right">${canWrite() ? rowMenu([
            [tr('Edit'), `data-edit="${e.id}"`],
            [tr('Delete'), `data-del="${e.id}"`, true],
          ]) : ''}</td></tr>
          <tr id="exprow-${e.id}" hidden><td colspan="6"></td></tr>`; }).join('')}
      </tbody></table>` : `<div class="empty"><b>No matching expenses</b>Adjust the filters or add one above.</div>`}
    </div>`;
  $('#mfilter').onchange = (e) => reload({ month: e.target.value || thisMonth() });
  $('#allmonths').onclick = () => reload({ month: flt.month === 'all' ? thisMonth() : 'all' });
  $('#wfilter').onchange = (e) => reload({ who: e.target.value });
  $('#cfilter').onchange = (e) => reload({ cat: e.target.value });
  // a subtotal pill toggles that category filter (click again to clear)
  body.querySelectorAll('[data-catjump]').forEach((b) => (b.onclick = () => reload({ cat: flt.cat === b.dataset.catjump ? 'all' : b.dataset.catjump })));
  const qEl = $('#qfilter');
  qEl.oninput = () => { clearTimeout(qEl._h); qEl._h = setTimeout(() => reload({ q: qEl.value }), 250); };
  $('#expform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = unpackExpenseBody(Object.fromEntries(new FormData(e.target)));
    try {
      await api('/expenses', { method: 'POST', body: payload });
      LAST_EXP_CAT = payload.category;   // next entry defaults to the same category
      EXP_FORM_OPEN = true;              // stay open for the next one instead of collapsing
      FOCUS_AMOUNT = true;               // ...with the cursor already in Amount
      toast('Expense added'); reload();
    } catch (err) { toast(err.message); }
  });
  // the rarely-needed fields (date, person, link, note) stay folded until asked for
  body.querySelector('[data-more]')?.addEventListener('click', (e) => {
    const more = body.querySelector('.qmore');
    more.hidden = !more.hidden;
    e.target.setAttribute('aria-expanded', String(!more.hidden));
    e.target.textContent = more.hidden ? tr('More details') : tr('Fewer details');
  });
  // one-shot: only jump into Amount right after an add or the floating +, never on a filter reload
  if (FOCUS_AMOUNT) { FOCUS_AMOUNT = false; $('#expform')?.querySelector('[name=amount]')?.focus(); }
  $('#recxform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/recurring-expenses', { method: 'POST', body: unpackExpenseBody(Object.fromEntries(new FormData(e.target))) }); toast('Recurring expense added'); reload(); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-rxtog]').forEach((b) => (b.onclick = async () => {
    await api(`/recurring-expenses/${b.dataset.rxtog}/toggle`, { method: 'POST' }); reload();
  }));
  body.querySelectorAll('[data-rxdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this recurring expense? Already-logged months stay.')) return;
    await api('/recurring-expenses/' + b.dataset.rxdel, { method: 'DELETE' }); reload();
  }));
  const byId = Object.fromEntries(rows.map((e) => [e.id, e]));
  body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const row = $('#exprow-' + b.dataset.edit);
    if (!row.hidden) { row.hidden = true; return; }
    row.firstElementChild.innerHTML = `<form class="formgrid" style="padding:6px 0">${expenseFormFields(members, properties, vehicles, byId[b.dataset.edit])}<button class="btn small">Save changes</button></form>`;
    row.hidden = false;
    row.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api('/expenses/' + b.dataset.edit, { method: 'PUT', body: unpackExpenseBody(Object.fromEntries(new FormData(ev.target))) }); toast('Expense updated'); reload(); }
      catch (err) { toast(err.message); }
    };
  }));
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/expenses/' + b.dataset.del, { method: 'DELETE' }).then(() => reload()) });
  }));
}
async function moneyIncome(body, who = 'all') {
  const [all, members, recurring] = await Promise.all([api('/incomes'), api('/family/members'), api('/recurring-incomes')]);
  const mname = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const rows = all.filter((r) => who === 'all' || String(r.user_id) === String(who));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  body.innerHTML = `
    ${canWrite() ? `<div class="card"><h3>Add income</h3><form id="incform" class="formgrid">
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Source</label><input name="source" placeholder="Salary, freelance…" required></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <button class="btn">Add income</button></form></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>Recurring income (salaries)</h3>
      <p class="muted" style="margin-top:0">Logged automatically every month on the chosen day — no manual entry needed.</p>
      ${recurring.length ? `<table><tbody>${recurring.map((r) => `<tr style="${r.active ? '' : 'opacity:.55'}">
        <td><b>${esc(r.source)}</b> <span class="muted">· ${esc(r.user_name || '')} · ${tr('day')} ${r.day}</span>${r.active ? '' : ' <span class="badge role">paused</span>'}</td>
        <td class="right amount">${money(r.amount)}<span class="muted">/mo</span></td>
        <td class="right">${canWrite() ? `<button class="btn ghost small" data-rtog="${r.id}">${r.active ? 'Pause' : 'Resume'}</button>
          <button class="btn danger small" data-rdel="${r.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${canWrite() ? `<form id="recform" class="formgrid" style="margin-top:10px">
        <div><label>Source</label><input name="source" placeholder="Salariu Raul" required></div>
        <div><label>Amount (${cur()}/mo)</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <div><label>Day of month</label><input name="day" type="number" min="1" max="31" value="1" required></div>
        <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        <button class="btn small">Add recurring</button></form>` : ''}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Income history</h3>
        <div class="row">${whoFilter('wfilter', members, who)}<span class="amount"><b>${money(total)}</b></span></div></div>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Source</th><th>By</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.source)}</td><td>${esc(mname[r.user_id] || '—')}</td><td class="right amount">${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>${tr('No income recorded yet')}${who === 'all' ? '' : ` — ${esc(mname[who] || '')}`}</b>Log salaries and other income to see the monthly balance.</div>`}
    </div>`;
  $('#wfilter').onchange = (e) => moneyIncome(body, e.target.value);
  $('#incform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/incomes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Income added'); moneyIncome(body, who); }
    catch (err) { toast(err.message); }
  });
  $('#recform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/recurring-incomes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Recurring income added'); moneyIncome(body, who); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-rtog]').forEach((b) => (b.onclick = async () => {
    await api(`/recurring-incomes/${b.dataset.rtog}/toggle`, { method: 'POST' }); moneyIncome(body, who);
  }));
  body.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this recurring income? Already-logged months stay.')) return;
    await api('/recurring-incomes/' + b.dataset.rdel, { method: 'DELETE' }); moneyIncome(body, who);
  }));
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/incomes/' + b.dataset.del, { method: 'DELETE' }).then(() => moneyIncome(body, who)) });
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
          <td>${b ? `<div class="bar"><i class="${budgetClass(s, b.amount)}" style="width:${pct}%"></i></div>
            <span class="muted" style="font-size:12px">${b.amount > 0 ? Math.round((s / b.amount) * 100) : 0}%</span>` : `<span class="muted">${tr('no budget')}</span>`}</td></tr>`;
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

/* ---------- savings / economy account & goals ---------- */
// "At this pace, March 2027." A goal with a target but no sense of when you reach it is just a
// number; the honest way to date it is the rate you have actually saved into it, so the estimate
// only appears once there is enough history to mean something (two deposits, spanning a month).
function goalEta(g, entries) {
  if (g.done || g.saved >= g.target) return '';
  const mine = (entries || []).filter((e) => String(e.goal_id) === String(g.id) && e.kind === 'deposit');
  if (mine.length < 2) return '';
  const sorted = mine.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const months = (new Date(sorted[sorted.length - 1].date) - new Date(sorted[0].date)) / (30.44 * 86400000);
  if (months < 1) return ''; // a fortnight of history says nothing about next year
  // The window starts AT the first deposit, so only what came after it accumulated during the
  // window. Counting it too would divide three deposits by two months and overstate the pace by half.
  const inWindow = sorted.slice(1).reduce((s, e) => s + Number(e.amount || 0), 0);
  const perMonth = inWindow / months;
  if (!(perMonth > 0)) return '';
  const need = Math.ceil((g.target - g.saved) / perMonth);
  if (!Number.isFinite(need) || need > 600) return ''; // beyond 50 years it is not a forecast
  const when = new Date();
  when.setUTCDate(1);
  when.setUTCMonth(when.getUTCMonth() + need);
  const label = when.toLocaleDateString(LANG === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return LANG === 'ro'
    ? `La ritmul ăsta (${money(perMonth)}/lună), ajungi acolo în <b>${label}</b>.`
    : `At this pace (${money(perMonth)}/mo), you get there in <b>${label}</b>.`;
}
async function moneySavings(body) {
  const [data, members] = await Promise.all([api('/savings'), api('/family/members')]);
  const openGoals = data.goals.filter((g) => !g.done);
  body.innerHTML = `
    <div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <div><div class="label" style="text-transform:uppercase;font-size:12px;color:var(--ink-soft);font-weight:600">Economy account balance</div>
        <div class="value" style="font-family:var(--mono);font-size:28px;${data.balance < 0 ? 'color:var(--red)' : ''}">${money(data.balance)}</div></div>
      <div class="muted">${Object.entries(data.byUser).map(([n, v]) => `${esc(n)}: <b class="amount">${money(v)}</b>`).join(' · ') || 'No contributions yet.'}</div>
    </div></div>
    <div class="card" style="margin-top:16px"><h3>Savings goals</h3>
      ${data.goals.length ? data.goals.map((g) => {
        const pct = Math.min(100, Math.max(0, (g.saved / g.target) * 100));
        const reached = g.saved >= g.target;
        const eta = goalEta(g, data.entries);
        return `<div style="margin-bottom:14px;${g.done ? 'opacity:.55' : ''}">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap">
            <span><b style="${g.done ? 'text-decoration:line-through' : ''}">${esc(g.title)}</b> <span class="muted">${g.user_name ? '· ' + esc(g.user_name) : '· family'}</span>
              ${reached && !g.done ? ' <span class="badge paid">reached!</span>' : ''}</span>
            <span class="row"><span class="amount muted">${money(g.saved)} / ${money(g.target)} (${Math.round(pct)}%)</span>
              ${canWrite() ? `<button class="btn ghost small" data-gtog="${g.id}">${g.done ? 'Reopen' : 'Mark done'}</button>
              <button class="btn danger small" data-gdel="${g.id}">✕</button>` : ''}</span></div>
          <div class="bar"><i style="width:${pct}%;${reached ? '' : ''}"></i></div>
          ${eta ? `<div class="muted" style="font-size:12.5px;margin-top:4px">${eta}</div>` : ''}
        </div>`;
      }).join('') : `<p class="muted">No goals yet — set one below and tag deposits to it.</p>`}
      ${canWrite() ? `<div class="subform">
        <h4>${tr('New goal')}</h4>
        <form id="goalform" class="formgrid">
        <div><label>Goal</label><input name="title" placeholder="Vacanță 2027" required></div>
        <div><label>Target (${cur()})</label><input name="target" type="number" step="0.01" min="0.01" required></div>
        <div><label>Person</label><select name="user_id"><option value="">Whole family</option>${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
        <button class="btn small">Add goal</button></form></div>` : ''}
    </div>
    ${canWrite() ? `<div class="card" style="margin-top:16px"><h3>Add or remove funds</h3><form id="savform" class="formgrid">
      <div><label>Type</label><select name="kind"><option value="deposit">Deposit (add)</option><option value="withdrawal">Withdraw (remove)</option></select></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Goal</label><select name="goal_id"><option value="">— general —</option>${openGoals.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select></div>
      <div><label>Note</label><input name="note" placeholder="optional"></div>
      <button class="btn">Save</button></form></div>` : ''}
    <div class="card" style="margin-top:16px"><h3>History</h3>
      ${data.entries.length ? `<table><thead><tr><th>Date</th><th>By</th><th>Goal</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${data.entries.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.user_name || '—')}</td><td>${esc(r.goal_title || '—')}</td><td>${esc(r.note || '')}</td>
          <td class="right amount" style="color:${r.kind === 'deposit' ? '#2f6b5a' : 'var(--red)'}">${r.kind === 'deposit' ? '+' : '−'}${money(r.amount)}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>No savings entries yet</b>Deposit funds above to start the family economy account.</div>`}
    </div>`;
  $('#goalform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/savings-goals', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Goal added'); moneySavings(body); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-gtog]').forEach((b) => (b.onclick = async () => {
    await api(`/savings-goals/${b.dataset.gtog}/toggle`, { method: 'POST' }); moneySavings(body);
  }));
  body.querySelectorAll('[data-gdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this goal? Its deposits stay in the account.')) return;
    await api('/savings-goals/' + b.dataset.gdel, { method: 'DELETE' }); moneySavings(body);
  }));
  $('#savform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/savings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); moneySavings(body); }
    catch (err) { toast(err.message); }
  });
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/savings/' + b.dataset.del, { method: 'DELETE' }).then(() => moneySavings(body)) });
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
        ${ownProps(properties).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
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
        $('#credpreview').textContent = `${tr('Monthly')}: ${money(pay + com)}${com ? ` (${tr('rate')} ${money(pay)} + ${tr('commission')} ${money(com)})` : ''} · ${tr('total interest over')} ${n} ${tr('months')}: ${money(pay * n - P)}`;
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
    <div><label>Linked property</label><select name="property_id"><option value="">None</option>${ownProps(properties).map((p) => `<option value="${p.id}" ${String(c.property_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
}
function creditCard(c, members, properties, refresh) {
  const wrap = document.createElement('details');
  wrap.className = 'entity';
  const saved = c.interest_saved > 0.005;
  // progress by TIME, over the original term: months already behind you (on schedule) + months the
  // anticipated (in-advance) payments have cut off the end. What is left is months_left. The
  // in-advance part gets its own colour so you can see how much sooner you'll finish.
  const term = Math.max(1, Math.round(Number(c.term_months) || 0));
  const [sy, sm] = String(c.start_date || '').split('-').map(Number);
  const now = new Date();
  let elapsed = (sy && sm) ? (now.getUTCFullYear() - sy) * 12 + (now.getUTCMonth() + 1 - sm) : 0;
  elapsed = Math.max(0, Math.min(term, elapsed));
  const left = Math.max(0, Math.min(term - elapsed, Math.round(Number(c.months_left) || 0)));
  const savedMo = Math.max(0, term - elapsed - left); // months the prepayments cut off the tail
  const monthsDone = elapsed + savedMo;               // months you no longer owe
  const pctOf = (n) => Math.min(100, Math.max(0, (n / term) * 100));
  const donePct = pctOf(monthsDone), schedPct = pctOf(elapsed), advPct = pctOf(savedMo);
  const done = left <= 0;
  wrap.innerHTML = `<summary><span><b>${esc(c.name)}</b> <span class="muted">${[c.lender, c.user_name || 'Whole family', c.property_name, `${money(c.monthly_total)}/mo`, `${monthsDone}/${term} ${tr('mo')}`].filter(Boolean).map(esc).join(' · ')}</span>
      ${saved ? `<span class="badge paid">${tr('saved')} ${money(c.interest_saved)}</span>` : ''}</span>
    ${canWrite() ? `<span class="row"><button class="btn ghost small" data-edit>Edit</button><button class="btn danger small" data-del>Delete</button></span>` : ''}</summary>
    <div class="body">
      <div data-editbox hidden style="margin-bottom:14px"></div>
      <div style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;gap:8px">
          <span>${tr('Progress')}${done ? ` <span class="badge paid">${tr('cleared!')}</span>` : ''}</span>
          <span class="amount muted">${monthsDone} / ${term} ${tr('months')} (${Math.round(donePct)}%)</span></div>
        <div class="bar split"><i style="width:${schedPct}%"></i><i class="advance" style="width:${advPct}%"></i></div>
        ${savedMo > 0 ? `<div class="barkey"><span><i class="k-sched"></i>${tr('on schedule')} ${elapsed} ${tr('mo')}</span><span><i class="k-adv"></i>${tr('in advance')} ${savedMo} ${tr('mo')}</span></div>` : ''}
      </div>
      <div class="deadgrid">
        <div class="dead"><span class="muted">Holder</span><div class="d">${esc(c.user_name || 'Whole family')}</div></div>
        <div class="dead"><span class="muted">Property</span><div class="d">${esc(c.property_name || '—')}</div></div>
        <div class="dead"><span class="muted">${tr('Monthly total')} · dobândă ${c.interest_rate}%</span><div class="d">${money(c.monthly_total)}<br><span class="muted">${tr('principal')} ${money(c.next_principal)} + ${tr('interest')} ${money(c.next_interest)}${c.commission ? ` + com. ${money(c.commission)}` : ''}</span></div></div>
        <div class="dead"><span class="muted">1 month in advance (principal + 1%)</span><div class="d">${money(c.advance_month_cost)}</div></div>
        <div class="dead"><span class="muted">Balance today</span><div class="d">${money(c.balance)}</div></div>
        <div class="dead"><span class="muted">Payoff</span><div class="d">${fdate(c.payoff_date)} · ${c.months_left} ${tr('mo left')}</div></div>
        <div class="dead"><span class="muted">Anticipated payments</span><div class="d">${money(c.prepaid_total)}</div></div>
        <div class="dead"><span class="muted">Money saved (interest)</span><div class="d" style="color:#2f6b5a">${money(c.interest_saved)}</div></div>
        <div class="dead"><span class="muted">Total interest projected</span><div class="d">${money(c.total_interest)} <span class="muted">${tr('vs')} ${money(c.base_total_interest)} ${tr('without')}</span></div></div>
      </div>
      <h3 style="margin-top:16px">Anticipated payments</h3>
      <p class="muted">Extra payments on top of the monthly one. The payment stays the same, the credit ends earlier — the interest you skip is your money saved.
      <br>${tr('Paying 1 month in advance now costs ≈')} <b class="amount">${money(c.advance_month_cost)}</b> (${tr('next principal')} ${money(c.next_principal)} + 1%).</p>
      ${left > 0 ? `<div class="whatif">
        <label>${tr('What if you paid extra every month?')}</label>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">
          <input data-whatif type="number" min="0" step="10" placeholder="500" inputmode="decimal" style="max-width:130px">
          ${[100, 250, 500, 1000].map((v) => `<button type="button" class="btn ghost small" data-wq="${v}">+${v}</button>`).join('')}
        </div>
        <p data-whatifout class="muted" style="margin:8px 0 0"></p>
      </div>` : ''}
      ${canWrite() ? `<form data-payform class="formgrid">
        <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
        <div><label>${tr('Months paid off')}</label><input name="months" type="number" min="1" max="${Math.max(1, left)}" step="1" inputmode="numeric" placeholder="${tr('optional')}"></div>
        <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <button class="btn small">Add payment</button></form>
        <p data-advout class="muted" style="margin:6px 0 0;font-size:12.5px"></p>` : ''}
      <div data-pays class="muted">Loading…</div>
    </div>`;
  const loadPays = async () => {
    const pays = await api(`/credits/${c.id}/payments`);
    const box = wrap.querySelector('[data-pays]');
    box.className = '';
    box.innerHTML = pays.length ? `<table><thead><tr><th>Date</th><th>By</th><th class="right">Amount</th><th></th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td>${fdate(p.date)}</td><td>${esc(p.paid_by_name || '')}${
        p.months ? ` <span class="badge role">−${p.months} ${tr(p.months === 1 ? 'month' : 'months')}</span>` : ''}</td><td class="right amount">${money(p.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-paydel="${p.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">No anticipated payments yet.</p>`;
    box.querySelectorAll('[data-paydel]').forEach((b) => (b.onclick = () => {
      const { hide, restore } = rowHide(b);
      undoableDelete({ hide, restore, commit: () => api(`/credits/${c.id}/payments/${b.dataset.paydel}`, { method: 'DELETE' }).then(() => refresh()) });
    }));
  };
  // what-if: same amortization the server uses, run from today's balance with the payment
  // bumped by the extra — the delta to the current plan is months cut and dobândă skipped
  const wfInput = wrap.querySelector('[data-whatif]');
  if (wfInput) {
    const r = Number(c.interest_rate) / 100 / 12;
    const simulate = (pay) => {
      let bal = Number(c.balance), interest = 0, months = 0;
      while (bal > 0.005 && months < 2400) {
        const i = bal * r; interest += i;
        if (pay <= i) return null; // this payment never pays it off
        bal = bal + i - pay; months++;
      }
      return { months, interest };
    };
    const out = wrap.querySelector('[data-whatifout]');
    const show = () => {
      const extra = Number(wfInput.value);
      if (!(extra > 0)) { out.textContent = ''; return; }
      const base = simulate(Number(c.monthly_payment));
      const boosted = simulate(Number(c.monthly_payment) + extra);
      if (!base || !boosted) { out.textContent = ''; return; }
      const cut = Math.max(0, base.months - boosted.months);
      const saved = Math.max(0, base.interest - boosted.interest);
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() + boosted.months);
      const when = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
      // whole sentences per language — the dictionary is exact-match, gluing words does not survive RO
      out.innerHTML = LANG === 'ro'
        ? `Cu <b>+${money(extra)}</b> pe lună ai termina cu <b>${cut} ${cut === 1 ? 'lună' : 'luni'}</b> mai devreme (${when}) și ai economisi <b class="amount" style="color:#2f6b5a">${money(saved)}</b> dobândă.`
        : `With <b>+${money(extra)}</b> a month you would finish <b>${cut} month${cut === 1 ? '' : 's'}</b> earlier (${when}) and save <b class="amount" style="color:#2f6b5a">${money(saved)}</b> in dobândă.`;
    };
    wfInput.addEventListener('input', show);
    wrap.querySelectorAll('[data-wq]').forEach((b) => (b.onclick = () => { wfInput.value = b.dataset.wq; show(); }));
  }
  // You pay at the counter and the bank names the figure, so the amount recorded is always yours.
  // Typing how many instalments it cleared shows what this app expects that to cost — handy for
  // checking the paperwork, and it pre-fills the amount only while you have not typed one.
  const monthsIn = wrap.querySelector('[data-payform] [name=months]');
  if (monthsIn) {
    const amountIn = wrap.querySelector('[data-payform] [name=amount]');
    const out = wrap.querySelector('[data-advout]');
    let seq = 0;
    monthsIn.addEventListener('input', async () => {
      const n = Math.round(Number(monthsIn.value));
      if (!(n >= 1)) { out.textContent = ''; return; }
      const mine = ++seq;
      try {
        const q = await api(`/credits/${c.id}/advance?months=${n}`);
        if (mine !== seq) return; // a newer keystroke already asked
        out.innerHTML = q.total > 0
          ? `${tr('Expected for')} ${q.months} ${tr(q.months === 1 ? 'month' : 'months')}: <b class="amount">${money(q.total)}</b>
             <span class="muted">(${money(q.principal)} ${tr('principal')} + 1%)</span> — ${tr('enter what the bank actually charged.')}`
          : `<span class="muted">${tr('cleared!')}</span>`;
        if (!amountIn.value && q.total > 0) amountIn.value = q.total.toFixed(2);
      } catch { if (mine === seq) out.textContent = ''; }
    });
  }
  wrap.addEventListener('toggle', () => { if (wrap.open && !wrap._loaded) { wrap._loaded = true; loadPays(); } });
  wrap.querySelector('[data-payform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/credits/${c.id}/payments`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Anticipated payment recorded'); refresh(); }
    catch (err) { toast(err.message); }
  });
  wrap.querySelector('[data-del]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Delete this credit and its payment history?')) return;
    await api('/credits/' + c.id, { method: 'DELETE' }); refresh();
  });
  wrap.querySelector('[data-edit]')?.addEventListener('click', (e) => {
    e.preventDefault(); wrap.open = true;
    const box = wrap.querySelector('[data-editbox]');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<form class="formgrid">${creditFormFields(members, properties, c)}<button class="btn small">Save changes</button></form>`;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // otherwise the form opens off-screen below the stats
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(ev.target));
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null; // "Whole family"/"None" clear the link
      try { await api('/credits/' + c.id, { method: 'PUT', body }); toast('Credit updated', 'success'); refresh(); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
  return wrap;
}

/* ---------- bills ---------- */
// repeat cycles: day-based ones are stored in recur_days, month-based ones in recur_months
const RECUR_OPTS = [['0', 'One-off'], ['d30', 'Every 30 days'], ['m1', 'Monthly'], ['m2', 'Every 2 months'], ['m3', 'Quarterly'], ['m6', 'Every 6 months'], ['m12', 'Yearly']];
const recurValue = (b) => (b.recur_days > 0 ? `d${b.recur_days}` : b.recur_months > 0 ? `m${b.recur_months}` : b.recur_months === 0 ? '0' : 'm1');
// the two combined <select>s (repeat cycle, property-or-vehicle link) unpack into real columns.
// both keys are always written so clearing a link on edit actually clears it server-side.
function unpackBillBody(body) {
  const r = String(body.recur || '0'); delete body.recur;
  body.recur_days = r.startsWith('d') ? Number(r.slice(1)) : 0;
  body.recur_months = r.startsWith('m') ? Number(r.slice(1)) : 0;
  const l = String(body.link || ''); delete body.link;
  body.property_id = null; body.vehicle_id = null;
  if (l) { const [kind, id] = l.split(':'); body[kind + '_id'] = Number(id); }
  return body;
}
function billFormFields(members, properties, vehicles, b = {}) {
  const link = b.property_id ? `property:${b.property_id}` : b.vehicle_id ? `vehicle:${b.vehicle_id}` : '';
  return `
    <div><label>Name</label><input name="name" placeholder="Electricity — apartment" value="${esc(b.name || '')}" required></div>
    <div><label>Provider</label><input name="provider" placeholder="PPC, Engie, Digi…" value="${esc(b.provider || '')}"></div>
    <div><label>Category</label><select name="category">${Object.entries(BILL_CATS).map(([k, v]) => `<option value="${k}" ${b.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0" value="${b.amount ?? ''}"></div>
    <div><label>Due date</label><input name="due_date" type="date" value="${b.due_date || ''}" required></div>
    <div><label>Repeats</label><select name="recur">${RECUR_OPTS.map(([v, l]) => `<option value="${v}" ${recurValue(b) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Counts as expense</label><select name="expense_category"><option value="">Automatic (from category)</option>
      ${CATEGORIES.map((c) => `<option value="${c}" ${b.expense_category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div><label>Responsible person</label><select name="owner_id"><option value="">Whole family</option>${members.map((m) => `<option value="${m.id}" ${String(b.owner_id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
      ${ownProps(properties).map((p) => `<option value="property:${p.id}" ${link === `property:${p.id}` ? 'selected' : ''}>⌂ ${esc(p.name)}</option>`).join('')}
      ${vehicles.map((v) => `<option value="vehicle:${v.id}" ${link === `vehicle:${v.id}` ? 'selected' : ''}>⛟ ${esc(v.name)}</option>`).join('')}</select></div>
    <div style="align-self:center"><label style="display:inline-flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" name="auto_pay" value="1" ${b.auto_pay ? 'checked' : ''} style="width:auto"> Auto-paid subscription</label></div>`;
}
// Recurring bills run on different clocks — one every 30 days, one quarterly, one yearly — so their
// face amounts aren't comparable. Normalising each to a month puts them side by side and makes the
// question "what do the subscriptions actually cost us?" answerable.
function monthlyCost(b) {
  const amt = Number(b.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  if (b.recur_days > 0) return (amt * (365 / b.recur_days)) / 12;
  if (b.recur_months > 0) return amt / b.recur_months;
  return 0; // one-off: not a subscription
}
function subsCard(bills, recurLabel) {
  const subs = bills.map((b) => ({ b, m: monthlyCost(b) })).filter((s) => s.m > 0).sort((x, y) => y.m - x.m);
  if (!subs.length) return '';
  const perMonth = subs.reduce((s, x) => s + x.m, 0);
  const ro = LANG === 'ro';
  const rows = subs.map(({ b, m }) => {
    // a price change only means something once it's been paid at least once at the old amount
    const was = Number(b.last_paid_amount);
    const pct = Number.isFinite(was) && was > 0 ? Math.round(((Number(b.amount) - was) / was) * 100) : 0;
    const changed = Math.abs(pct) >= 1;
    return `<tr>
      <td><b>${esc(b.name)}</b>${b.auto_pay ? ` <span class="muted">· ${ro ? 'plată automată' : 'auto-pay'}</span>` : ''}
        ${changed ? `<span class="dchip ${pct > 0 ? 'warn' : 'ok'}" title="${ro ? `Ultima plată: ${money(was)}` : `Last paid: ${money(was)}`}">${pct > 0 ? '+' : ''}${pct}%</span>` : ''}</td>
      <td class="muted" data-label="${ro ? 'Ciclu' : 'Cycle'}">${tr(recurLabel(b))}</td>
      <td class="right amount" data-label="${ro ? 'Pe ciclu' : 'Per cycle'}">${money(b.amount)}</td>
      <td class="right amount" data-label="${ro ? 'Pe lună' : 'Per month'}">${money(m)}</td>
    </tr>`;
  }).join('');
  return `<div class="card subs" style="margin-top:16px">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
      <div><h3 style="margin:0">${ro ? 'Abonamente' : 'Subscriptions'}</h3>
        <p class="muted" style="margin:4px 0 0">${ro
          ? `${subs.length} facturi recurente, aduse toate la echivalentul lunar.`
          : `${subs.length} recurring bills, each brought to its monthly equivalent.`}</p></div>
      <div class="right"><div class="amount" style="font-size:22px">${money(perMonth)}</div>
        <div class="muted" style="font-size:12.5px">${ro ? `pe lună · ${money(perMonth * 12)} pe an` : `per month · ${money(perMonth * 12)} a year`}</div></div>
    </div>
    <details style="margin-top:10px"><summary>${ro ? 'Vezi defalcarea' : 'See the breakdown'}</summary>
      <table class="cards" style="margin-top:8px"><tbody>${rows}</tbody></table>
    </details>
  </div>`;
}
async function viewBills(el) {
  const [bills, members, properties, vehicles] = await Promise.all([api('/bills'), api('/family/members'), api('/properties'), api('/vehicles')]);
  const t = today();
  const recurLabel = (b) => (RECUR_OPTS.find(([v]) => v === recurValue(b)) || [])[1];
  el.innerHTML = `<div class="pagehead"><div><h1>Bills & invoices</h1><p>Electricity, gas, internet, water, taxes — with due dates, owner, attachments and payment history. Auto-paid subscriptions are marked paid automatically once due.</p></div></div>
    ${subsCard(bills, recurLabel)}
    ${canWrite() ? addBox('Add bill', `<form id="billform" class="formgrid">
      ${billFormFields(members, properties, vehicles)}
      <button class="btn">Add bill</button></form>`) : ''}
    <div class="card" style="margin-top:16px" id="billlist">
      ${bills.length ? `<table class="cards"><thead><tr><th>Bill</th><th>Owner</th><th>Due</th><th class="right">Amount</th><th>Status</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${bills.map((b) => {
        const late = b.status === 'unpaid' && b.due_date < t;
        const dLeft = daysUntil(b.due_date);
        return `<tr>
          <td><b>${esc(b.name)}</b><br><span class="muted">${esc(b.provider || tr(BILL_CATS[b.category]) || '')}${recurValue(b) === '0' ? '' : ` · ${tr(recurLabel(b))}`}${b.auto_pay ? (LANG === 'ro' ? ' · plată automată' : ' · auto-pay') : ''}${b.expense_category ? ` · ${tr(b.expense_category)}` : ''}${b.property_name ? ` · ⌂ ${esc(b.property_name)}` : ''}${b.vehicle_name ? ` · ⛟ ${esc(b.vehicle_name)}` : ''}</span></td>
          <td class="lowpri" data-label="${tr('Owner')}">${esc(b.owner_name || 'Family')}</td>
          <td data-label="${tr('Due')}">${fdate(b.due_date)}${b.status === 'unpaid'
            // "11/08/2026" needs a mental subtraction before it means anything; "în 2z" doesn't.
            // Only colour it once it's close — a badge on every far-off bill is just noise.
            ? (daysClass(dLeft)
              ? ` <span class="badge ${daysClass(dLeft)}">${daysLabel(dLeft)}</span>`
              : ` <span class="muted">${daysLabel(dLeft)}</span>`) : ''}</td>
          <td class="right amount" data-label="${tr('Amount')}">${money(b.amount)}</td>
          <td data-label="${tr('Status')}"><span class="badge ${late ? 'late' : b.status}">${tr(late ? 'overdue' : b.status)}</span></td>
          <td class="lowpri" data-label="${tr('Invoice')}">${b.attachment ? `<a href="/api/bills/${b.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-attach="${b.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td class="right"><span class="rowacts">${canWrite() ? `
            ${b.status === 'unpaid' ? `<button class="btn small" data-pay="${b.id}" data-amt="${b.amount ?? ''}">Mark paid</button>` : ''}
            ${rowMenu([
              [tr('Edit'), `data-edit="${b.id}"`],
              [tr('History'), `data-hist="${b.id}"`],
              [tr('Delete'), `data-del="${b.id}"`, true],
            ])}` : `<button class="btn ghost small" data-hist="${b.id}">History</button>`}</span></td>
        </tr><tr id="row-${b.id}" hidden><td colspan="7"></td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty"><b>No bills yet</b>Add recurring utilities once — Family Hub rolls the due date forward every time you mark them paid.</div>`}
    </div>`;
  const billsById = Object.fromEntries(bills.map((b) => [b.id, b]));
  $('#billform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/bills', { method: 'POST', body: unpackBillBody(Object.fromEntries(new FormData(e.target))) }); toast('Bill added'); viewBills(el); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
    const amt = prompt(tr('Amount paid') + ' (' + cur() + '):', b.dataset.amt || '');
    if (amt === null) return;
    try { await api(`/bills/${b.dataset.pay}/pay`, { method: 'POST', body: { amount: Number(amt) } }); toast('Payment recorded — expense logged too'); viewBills(el); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const row = $('#row-' + b.dataset.edit);
    if (!row.hidden) { row.hidden = true; return; }
    const bill = billsById[b.dataset.edit];
    row.firstElementChild.innerHTML = `<form class="formgrid" style="padding:6px 0">${billFormFields(members, properties, vehicles, bill)}<button class="btn small">Save changes</button></form>`;
    row.hidden = false;
    row.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const body = unpackBillBody(Object.fromEntries(new FormData(e.target)));
      body.auto_pay = e.target.auto_pay.checked ? 1 : 0;
      try { await api('/bills/' + b.dataset.edit, { method: 'PUT', body }); toast('Bill updated'); viewBills(el); }
      catch (err) { toast(err.message); }
    };
  }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/bills/' + b.dataset.del, { method: 'DELETE' }).then(() => viewBills(el)) });
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
    icon: 'car', subtitle: [v.plate, `${tr('Owner')}: ${mname[v.owner_id] || tr('whole family')}`].filter(Boolean).join(' · '),
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
// a managed property is administered for someone else: same tenants, rent and invoices, but its
// money is its own and never lands in the household's expenses, income, budgets or charts
const MANAGED_OPTS = [['0', 'Ours'], ['1', 'Managed for someone else']];
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
      ['rent_amount', `Rent (${cur()}/mo, if rented out)`, 'number', ''], ['rent_due_day', 'Rent due day (1-31)', 'number', '1'],
      ['payment_link', 'Payment link (Revolut.me)', 'text', 'https://revolut.me/...'],
      ['managed', 'Ownership', 'select', MANAGED_OPTS],
    ]) : ''}
    <div id="proplist" style="margin-top:16px">${props.length ? '' : `<div class="card empty"><b>No properties yet</b>Add your home above to track its deadlines and costs.</div>`}</div>`;
  bindEntityForm('propform', '/properties', () => viewProperties(el));
  const list = $('#proplist');
  for (const p of props) {
    const tenants = tenantsByProp[p.id] || [];
    // who a cost record is attributed to: owner by default, any member, or (if rented) bill the tenant.
    // On a managed property there is no "family member pays" option — the cost stays on the property.
    const attributeOpts = p.managed
      ? [['', tr('The property (not our money)')],
        ...(tenants.length ? [['tenant', `${tr('Tenant — bill to')} ${esc(tenants[0].name)}`]] : [])]
      : [['', p.owner_id ? `${tr('Owner')} (${esc(mname[p.owner_id] || '')})` : tr('Owner / family')],
        ...members.map((m) => [m.id, m.name]),
        ...(tenants.length ? [['tenant', `${tr('Tenant — bill to')} ${esc(tenants[0].name)}`]] : [])];
    list.appendChild(entityCard(p, {
      // every property gets its dashboard from the row itself — owner-occupied ones had it buried
      // in the tenant panel, which is both hidden until you expand and the wrong place to look
      icon: 'home', badge: p.managed ? tr('managed') : '',
      headLink: `#property/${p.id}`, headLinkLabel: tr('Dashboard'),
      subtitle: [p.address, p.managed ? tr('not owned by us') : `${tr('Owner')}: ${mname[p.owner_id] || tr('whole family')}`, p.mortgage_lender ? `${tr('Mortgage')}: ${p.mortgage_lender}, ${money(p.mortgage_payment)} ${tr('on day')} ${p.mortgage_due_day ?? '—'}` : null].filter(Boolean).join(' · '),
      deadlines: P_DEADLINES, route: 'properties',
      // rent + meter schedule live in the always-visible Tenant panel below (renderTenantBox), not
      // here — a second editor would let a stray save wipe the per-meter reading days
      editExtra: [['owner_id', 'Owner', 'select', ownerOpts], ['payment_link', 'Payment link (Revolut.me)', 'text'],
        ['managed', 'Ownership', 'select', MANAGED_OPTS]],
      extra: (box, it) => { const d1 = document.createElement('div'), d2 = document.createElement('div'); box.append(d1, d2); renderTenantBox(d1, it); renderEntityDocs(d2, 'property', it, pSlots, () => viewProperties(el)); },
      recordTypes: { maintenance: 'Maintenance', renovation: 'Renovation', utility: 'Utility', rent: 'Rent (income)', other_income: 'Other income', other: 'Other' },
      incomeTypes: ['rent', 'other_income'],
      recordFields: [['date', 'Date', 'date'], ['amount', `Amount (${cur()})`, 'number'], ['note', 'Note', 'text']],
      recordExtra: [['attribute', 'Cost paid by', 'select', attributeOpts]],
      recordExtraNote: p.managed
        ? tr('This property is managed, not ours: its costs and rent stay here and never touch the household budget. "Tenant" still bills the tenant.')
        : 'Costs (maintenance, utility…) are also logged as an expense for the chosen person; "Tenant" bills the tenant instead.',
      showRecordUser: true,
      refresh: () => viewProperties(el),
    }));
  }
}
/* ---------- one property at a glance (#property/<id>) ----------
   Every property asks the same few questions: what has it cost, what has it earned, and what is
   coming up on it. A let one adds the tenant's side — is this month's rent in, what is owed, what
   is the tenant waiting on me for — and those blocks simply don't render when nobody rents it.
   For a managed property the money figure is the whole point, since it is deliberately absent
   from the household totals. Reachable from Proprietăți and from Chiriași. */
async function viewProperty(el, id) {
  const pid = Number(id);
  const [props, tinfo, charges, records, meters, maint] = await Promise.all([
    api('/properties'), api(`/properties/${pid}/tenant`), api(`/properties/${pid}/charges`),
    api(`/properties/${pid}/records`), api(`/properties/${pid}/meter-requests`), api(`/properties/${pid}/maintenance`)]);
  const p = props.find((x) => x.id === pid);
  if (!p) { el.innerHTML = `<div class="empty"><b>${tr('Property not found')}</b></div>`; return; }
  const t = today();
  const period = t.slice(0, 7);
  const ro = LANG === 'ro';

  const unpaid = charges.filter((c) => c.status !== 'paid');
  const owed = owedText(unpaid);
  // owed is a sentence now ("1.200,00 € · 350,00 RON"), so whether anything is outstanding at all
  // has to be asked separately — comparing that string to 0 is always false.
  const owesAnything = unpaid.reduce((n, c) => n + Number(c.amount || 0), 0) > 0;
  const rent = charges.find((c) => c.type === 'rent' && String(c.period || c.due_date).startsWith(period));
  const rentLate = rent && rent.status !== 'paid' && rent.due_date < t
    ? Math.round((new Date(t) - new Date(rent.due_date)) / 86400000) : 0;
  const rentState = !rent ? { cls: '', txt: ro ? 'Nicio chirie luna aceasta' : 'No rent this month' }
    : rent.status === 'paid' ? { cls: 'paid', txt: ro ? 'Încasată' : 'Received' }
    : rent.status === 'pending' ? { cls: 'role', txt: ro ? 'Marcată de chiriaș' : 'Marked by tenant' }
    : rentLate ? { cls: 'late', txt: `${ro ? 'Întârziată' : 'Overdue'} ${rentLate}${ro ? 'z' : 'd'}` }
    : { cls: 'unpaid', txt: ro ? 'Neplătită' : 'Unpaid' };

  const isIncome = (r) => ['rent', 'other_income'].includes(r.type);
  const income = records.filter(isIncome).reduce((s, r) => s + Number(r.amount || 0), 0);
  const costs = records.filter((r) => !isIncome(r)).reduce((s, r) => s + Number(r.amount || 0), 0);
  const openMaint = maint.filter((m) => m.status !== 'done');
  const waitingMeters = meters.filter((m) => m.status !== 'done');
  const let_ = (tinfo.tenants?.length || 0) > 0; // is anyone actually renting it

  // deadlines that are set on this property, as the same countdown chips used everywhere else
  const chips = P_DEADLINES.filter(([k]) => p[k]).map(([k, l]) => {
    const days = Math.ceil((new Date(p[k]) - new Date(t)) / 86400000);
    return `<span class="dchip ${daysClass(days)}">${esc(tr(l))} <b>${daysLabel(days)}</b> <span class="dchip-d">${fdate(p[k])}</span></span>`;
  }).join('');

  el.innerHTML = `<div class="pagehead"><div>
      <h1>${esc(p.name)}${p.managed ? ` <span class="badge role">${tr('managed')}</span>` : ''}</h1>
      <p>${esc(p.address || '')}${let_ ? `${p.address ? ' · ' : ''}${tr('Tenant')}: ${esc(tinfo.tenants.map((x) => x.name).join(', '))}` : ''}</p></div>
      <a class="btn ghost small" href="#${let_ ? 'tenants' : 'properties'}">${tr('Full panel')} →</a></div>

    <section class="kpi">
      ${let_ ? `<div class="card"><div class="label">${tr('Rent this month')}</div>
        <div class="value">${rent ? money(rent.amount) : '—'}</div>
        <div style="margin-top:6px"><span class="badge ${rentState.cls}">${rentState.txt}</span></div></div>
      <div class="card"><div class="label">${tr('Outstanding')}</div>
        <div class="value ${owesAnything ? 'neg' : ''}">${owed}</div>
        <div class="muted" style="font-size:12.5px">${unpaid.length} ${tr(unpaid.length === 1 ? 'unpaid charge' : 'unpaid charges')}</div></div>`
      // not let: the mortgage is the number that matters month to month
      : `<div class="card"><div class="label">${tr('Spent')}</div>
        <div class="value">${money(costs)}</div>
        <div class="muted" style="font-size:12.5px">${records.filter((r) => !isIncome(r)).length} ${tr('records')}</div></div>
      <div class="card"><div class="label">${tr('Mortgage')}</div>
        <div class="value">${p.mortgage_payment ? money(p.mortgage_payment) : '—'}</div>
        <div class="muted" style="font-size:12.5px">${p.mortgage_lender ? `${esc(p.mortgage_lender)} · ${tr('on day')} ${p.mortgage_due_day ?? '—'}` : tr('No mortgage recorded')}</div></div>`}
      <div class="card"><div class="label">${p.managed ? tr('This property (not our money)') : tr('This property')}</div>
        <div class="value ${income - costs < 0 ? 'neg' : ''}">${money(income - costs)}</div>
        <div class="muted" style="font-size:12.5px">${tr('Income')} ${money(income)} · ${tr('Spent')} ${money(costs)}</div></div>
    </section>

    ${chips ? `<section class="card" style="margin-top:18px"><h3 style="margin-top:0">${tr('Deadlines')}</h3>
      <div class="dchips">${chips}</div></section>` : ''}

    ${(() => {
      const jobs = [];
      if (unpaid.length) jobs.push(`${unpaid.length} ${tr(unpaid.length === 1 ? 'unpaid charge' : 'unpaid charges')}`);
      if (waitingMeters.length) jobs.push(`${waitingMeters.length} ${tr(waitingMeters.length === 1 ? 'meter reading' : 'meter readings')}`);
      if (!jobs.length) return '';
      return `<section class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <span><b>${tr('Waiting on the tenant:')}</b> ${jobs.join(' · ')}</span>
        ${canWrite() && tinfo.tenants?.length ? `<button class="btn small" data-remind>${tr('Send reminder')}</button>` : ''}</div></section>`;
    })()}

    ${openMaint.length ? `<section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Open maintenance')} · ${openMaint.length}</h3>
      ${openMaint.map((m) => `<div class="row" style="justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)">
        <span><b>${esc(m.title)}</b>${m.reopened_at ? ` <span class="badge late">↻ ${tr('Reopened')}</span>` : ''}
          <span class="muted">· ${esc(m.reported_by || '')} · ${fdate(m.created_at?.slice(0, 10))}</span></span>
        ${canWrite() ? `<button class="btn ghost small" data-fix="${m.id}">${tr('Mark fixed')}</button>` : ''}</div>`).join('')}
    </section>` : ''}

    ${unpaid.length ? `<section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Unpaid')}</h3>
      <table class="cards"><thead><tr><th>${tr('Due')}</th><th>${tr('What')}</th><th class="right">${tr('Amount')}</th><th>${tr('Status')}</th><th></th></tr></thead><tbody>
      ${unpaid.map((c) => { const late = c.status === 'unpaid' && c.due_date < t; return `<tr>
        <td data-label="${tr('Due')}">${fdate(c.due_date)}${late ? ` <span class="badge late">${tr('overdue')}</span>` : ''}</td>
        <td data-label="${tr('What')}"><b>${esc(c.title)}</b></td>
        <td class="right amount" data-label="${tr('Amount')}">${moneyIn(c.amount, chargeCur(c))}</td>
        <td data-label="${tr('Status')}">${c.status === 'pending' ? `<span class="badge role">${tr('pending — tenant marked paid')}</span>` : `<span class="badge unpaid">${tr('unpaid')}</span>`}</td>
        <td class="right">${canWrite() ? `<button class="btn small" data-confirm="${c.id}">${tr('Confirm paid')}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></section>` : ''}

    <section class="card" style="margin-top:18px">
      <h3 style="margin-top:0">${tr('Money in this property')}</h3>
      ${records.length ? `<table class="cards"><thead><tr><th>${tr('Date')}</th><th>${tr('Type')}</th><th>${tr('Note')}</th><th class="right">${tr('Amount')}</th></tr></thead><tbody>
      ${records.slice(0, 12).map((r) => `<tr>
        <td data-label="${tr('Date')}">${fdate(r.date)}</td>
        <td data-label="${tr('Type')}">${tr(({ maintenance: 'Maintenance', renovation: 'Renovation', utility: 'Utility', rent: 'Rent (income)', other_income: 'Other income', other: 'Other' })[r.type] || r.type)}</td>
        <td data-label="${tr('Note')}">${esc(r.note || '')}</td>
        <td class="right amount" data-label="${tr('Amount')}" style="color:${isIncome(r) ? 'var(--ok)' : 'inherit'}">${isIncome(r) ? '+' : ''}${money(r.amount)}</td></tr>`).join('')}
      </tbody></table>` : `<p class="muted" style="margin-bottom:0">${tr('Nothing recorded yet.')}</p>`}
    </section>`;

  const reload = () => viewProperty(el, id);
  el.querySelector('[data-remind]')?.addEventListener('click', async (e) => {
    try { await api(`/properties/${pid}/tenant/remind`, { method: 'POST' }); flashSent(e.target); toast(tr('Reminder sent to the tenant'), 'success'); }
    catch (err) { toast(err.message, 'error'); }
  });
  el.querySelectorAll('[data-confirm]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${pid}/charges/${b.dataset.confirm}/confirm`, { method: 'POST' }); toast(tr('Payment confirmed'), 'success'); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }));
  el.querySelectorAll('[data-fix]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${pid}/maintenance/${b.dataset.fix}/resolve`, { method: 'POST' }); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }));
}

/* ---------- tenants: every rented property's tenant admin in one place ---------- */
async function viewTenants(el) {
  const props = await api('/properties');
  const info = await Promise.all(props.map((p) => api(`/properties/${p.id}/tenant`).catch(() => ({ tenants: [], invite_code: null }))));
  // a property belongs here once it's in play as a rental: it has tenants, a code waiting, or a rent set
  const rows = props.map((p, i) => ({ p, info: info[i] || { tenants: [] } }))
    .filter(({ p, info }) => (info.tenants && info.tenants.length) || info.invite_code || p.rent_amount);
  el.innerHTML = `<div class="pagehead"><div><h1>Tenants</h1>
    <p>Codes, rent, invoices, meter readings and maintenance for your rented properties — in one place.</p></div></div>
    ${rows.length ? '<div id="tenlist"></div>'
      : `<div class="card empty"><b>No rented properties yet</b>Set a rent amount or generate a tenant code on a property, and it shows up here.</div>`}`;
  const list = $('#tenlist');
  for (const { p, info } of rows) {
    const names = (info.tenants || []).map((x) => x.name).join(', ');
    const status = names ? esc(names) : (info.invite_code ? tr('code ready — no tenant yet') : tr('no tenant yet'));
    const card = document.createElement('details');
    card.className = 'entity';
    card.open = rows.length === 1;
    card.innerHTML = `<summary>
      <span><b>${esc(p.name)}</b>${p.managed ? ` <span class="badge role">${tr('managed')}</span>` : ''}${p.address ? ` <span class="muted">${esc(p.address)}</span>` : ''}</span>
      <span class="row"><span class="muted">${status}</span>
        <a class="btn small" data-nav href="#property/${p.id}">${tr('Dashboard')} →</a></span></summary><div class="body"></div>`;
    card.querySelector('[data-nav]').addEventListener('click', (e) => e.stopPropagation());
    list.appendChild(card);
    // reuse the exact panel from the property card: code, tenants, invoices, meters, maintenance
    renderTenantBox(card.querySelector('.body'), p);
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
        if (d.expiry_date) { const days = Math.ceil((new Date(d.expiry_date) - new Date(t)) / 86400000); exp = `<span class="${days < 0 ? 'badge late' : days <= 14 ? 'badge unpaid' : ''}">${fdate(d.expiry_date)}</span>`; }
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
// reading_utilities is a comma list where each entry is "utility:day" (e.g. "electricity:10,gas:15").
// A bare "electricity" (older data) falls back to the property's single reading_day. -> { util: day }.
function parseSchedule(p) {
  const def = Number(p.reading_day) || null;
  const out = {};
  String(p.reading_utilities || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((entry) => {
    const [u, d] = entry.split(':');
    const day = Number(d) || def;
    if (['electricity', 'gas', 'water'].includes(u) && day) out[u] = day;
  });
  return out;
}
async function renderTenantBox(box, p) {
  /* The contract itself, which the app tracked the money for but never the paperwork. The notice
     date is derived, never stored — storing it would let it drift out of step with the lease end. */
  function leaseBlock(prop) {
    const end = prop.lease_end;
    const days = Number(prop.notice_days) || 0;
    let noticeOn = null;
    if (end && days > 0) {
      const n = new Date(end + 'T00:00:00Z');
      n.setUTCDate(n.getUTCDate() - days);
      noticeOn = n.toISOString().slice(0, 10);
    }
    const dep = Number(prop.deposit_amount) || 0;
    const held = dep > 0 && !prop.deposit_returned_at;
    const chip = (iso, label) => {
      const d = daysUntil(iso), c = daysClass(d);
      return `<span class="dchip ${c}"><span>${label}</span> <b>${fdate(iso)}</b> <span class="muted">${daysLabel(d)}</span></span>`;
    };
    return `<h3 style="margin-top:18px">${tr('Contract & deposit')}</h3>
      ${end || dep ? `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        ${end ? chip(end, tr('Tenancy ends')) : ''}
        ${noticeOn ? chip(noticeOn, tr('Notice by')) : ''}
        ${dep ? `<span class="dchip"><span>${tr('Deposit')}</span> <b>${money(dep)}</b>
          <span class="muted">${held ? tr('held') : `${tr('returned')} ${fdate(prop.deposit_returned_at)}`}</span></span>` : ''}
      </div>` : `<p class="muted">${tr('No contract recorded yet. Add the end date and the notice period and both land in your deadlines.')}</p>`}
      ${canWrite() ? `<form data-leaseform class="row" style="flex-wrap:wrap;align-items:flex-end;gap:8px">
        <div><label>${tr('Lease start')}</label><input name="lease_start" type="date" value="${prop.lease_start || ''}"></div>
        <div><label>${tr('Lease end')}</label><input name="lease_end" type="date" value="${prop.lease_end || ''}"></div>
        <div><label>${tr('Notice (days)')}</label><input name="notice_days" type="number" min="0" max="365" value="${prop.notice_days ?? ''}" style="max-width:110px"></div>
        <div><label>${tr('Deposit')} (${cur()})</label><input name="deposit_amount" type="number" step="0.01" min="0" value="${prop.deposit_amount ?? ''}" style="max-width:130px"></div>
        <button class="btn small">${tr('Save')}</button>
        ${held ? `<button type="button" class="btn ghost small" data-depret>${tr('Mark deposit returned')}</button>` : ''}
        ${dep && !held ? `<button type="button" class="btn ghost small" data-depheld>${tr('Deposit is held again')}</button>` : ''}
      </form>` : ''}`;
  }
  const [tinfo, charges, meters, maint] = await Promise.all([
    api(`/properties/${p.id}/tenant`), api(`/properties/${p.id}/charges`), api(`/properties/${p.id}/meter-requests`),
    api(`/properties/${p.id}/maintenance`)]);
  const t = today();
  box.innerHTML = `<h3 style="margin-top:16px">Tenant & rent</h3>
    <p class="muted">${p.rent_amount ? `${tr('Rent:')} <b>${moneyIn(p.rent_amount, p.rent_currency)}</b> ${tr('/ month, due day')} ${p.rent_due_day || 1} — ${tr('the rent charge is generated automatically once a tenant has joined.')}` : tr('No rent set yet — set it here and the monthly rent charge generates itself.')}</p>
    ${canWrite() ? `<form data-rentform class="row" style="flex-wrap:wrap;align-items:flex-end;gap:8px">
      <div><label>${tr('Rent')}</label><input name="rent_amount" type="number" step="0.01" min="0" value="${p.rent_amount ?? ''}" style="max-width:130px"></div>
      <div><label>${tr('Currency')}</label><select name="rent_currency" style="max-width:110px">${Object.entries(CURRENCIES).map(([code, sym]) =>
    `<option value="${code}" ${code === (p.rent_currency || FAMILY?.currency) ? 'selected' : ''}>${code}${code === sym ? '' : ` (${sym})`}</option>`).join('')}</select></div>
      <div><label>${tr('Rent due day (1-31)')}</label><input name="rent_due_day" type="number" min="1" max="31" value="${p.rent_due_day ?? 1}" style="max-width:120px"></div>
      <button class="btn small">${tr('Save')}</button></form>` : ''}
    ${leaseBlock(p)}
    ${canWrite() ? `<p class="row" style="flex-wrap:wrap">
      ${tinfo.invite_code ? `<span>Tenant code: <b class="amount" style="font-size:18px;letter-spacing:.12em">${esc(tinfo.invite_code)}</b></span>
      <button class="btn ghost small" data-copy="${esc(tinfo.invite_code)}">Copy code</button>
      <button class="btn ghost small" data-copy="${esc(registerLink(tinfo.invite_code))}">Copy link</button>` : `<span class="muted">No tenant code yet.</span>`}
      <button class="btn ghost small" data-tcode>${tinfo.invite_code ? 'Generate new code' : 'Generate code'}</button>
      <span class="muted">Your tenant registers with it on the sign-in screen → <b>Register</b> tab. They only see the charges below — nothing else.</span></p>` : ''}
    ${tinfo.tenants.length ? `<p>${tr(tinfo.tenants.length > 1 ? 'Tenants' : 'Tenant')}: ${tinfo.tenants.map((x) => `<b>${esc(x.name)}</b> <span class="muted">(${esc(x.email)})</span>${canWrite() ? ` <button class="btn danger small" data-tdel="${x.id}">Remove</button>` : ''}`).join(' · ')}</p>`
      : `<p class="muted">No tenant has joined yet.</p>`}
    ${(() => {
      // a nudge is only offered when the tenant actually has something to do
      const owedN = charges.filter((c) => c.status === 'unpaid').length;
      const meterN = meters.filter((m) => m.status === 'pending').length;
      if (!canWrite() || !tinfo.tenants.length || (!owedN && !meterN)) return '';
      const bits = [owedN ? `${owedN} ${tr(owedN === 1 ? 'unpaid charge' : 'unpaid charges')}` : '', meterN ? `${meterN} ${tr(meterN === 1 ? 'meter reading' : 'meter readings')}` : ''].filter(Boolean);
      return `<p class="row" style="flex-wrap:wrap;align-items:center">
        <button class="btn small" data-tremind>${tr('Send reminder')}</button>
        <span class="muted">${tr('Waiting on the tenant:')} ${bits.join(' · ')}</span></p>`;
    })()}
    ${canWrite() ? `<form data-chform class="formgrid">
      <div><label>Type</label><select name="type"><option value="invoice">Invoice</option><option value="rent">Rent (extra)</option></select></div>
      <div><label>Title</label><input name="title" placeholder="Electricity — June" required></div>
      <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
      <div><label>Due date</label><input name="due_date" type="date" value="${t}" required></div>
      <div><label>Invoice file (PDF/photo)</label><input name="file" type="file" accept=".pdf,image/*"></div>
      <button class="btn small">Share with tenant</button></form>` : ''}
    ${charges.length ? `<table><thead><tr><th>Due</th><th>What</th><th class="right">Amount</th><th>Invoice</th><th>Status</th><th></th></tr></thead><tbody>
      ${charges.map((c) => {
        const late = c.status === 'unpaid' && c.due_date < t;
        return `<tr>
          <td>${fdate(c.due_date)}${late ? ' <span class="badge late">overdue</span>' : ''}</td>
          <td><b>${esc(c.title)}</b>${c.type === 'rent' ? ' <span class="muted">· rent</span>' : ''}</td>
          <td class="right amount">${moneyIn(c.amount, chargeCur(c))}</td>
          <td>${c.attachment ? `<a href="/api/properties/${p.id}/charges/${c.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-chattach="${c.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">${tr('paid')}${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">${tr('pending — tenant marked paid')} ${c.marked_paid_at ? fdate(c.marked_paid_at) : ''}</span>`
            : `<span class="badge unpaid">unpaid</span>`}</td>
          <td class="right">${canWrite() ? `<span class="rowacts">
            ${c.status !== 'paid' ? `<button class="btn small" data-chconfirm="${c.id}">Confirm paid</button>` : ''}
            ${c.status === 'pending' ? `<button class="btn ghost small" data-chreject="${c.id}">Reject</button>` : ''}
            <button class="btn danger small" data-chdel="${c.id}">✕</button></span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>` : `<p class="muted">Nothing shared with the tenant yet.</p>`}
    <h3 style="margin-top:16px">Meter readings</h3>
    <p class="muted">${Object.keys(parseSchedule(p)).length
      ? `${tr('Scheduled:')} ${Object.entries(parseSchedule(p)).map(([u, d]) => `${esc(tr(u[0].toUpperCase() + u.slice(1)))} ${tr('on day')} ${d}`).join(', ')} ${tr('of every month (tenant gets an email).')}`
      : tr('No monthly schedule yet — set the day and meters below, or request a reading now.')}</p>
    ${canWrite() ? (() => { const sched = parseSchedule(p); return `<form data-schedform style="margin-bottom:6px">
      <label>${tr('Meters to read monthly')} <span class="muted" style="font-weight:400">(${tr('day of month for each')})</span></label>
      <div class="meterlist">${[['electricity', 'Electricity'], ['gas', 'Gas'], ['water', 'Water']].map(([v, l]) => {
        const day = sched[v];
        return `<label class="meterrow"><input type="checkbox" data-meter="${v}" ${day != null ? 'checked' : ''}>
          <span class="mname">${tr(l)}</span>
          <input type="number" min="1" max="31" data-day="${v}" value="${day ?? ''}" placeholder="${tr('day')}" ${day != null ? '' : 'disabled'}></label>`;
      }).join('')}</div>
      <button class="btn small" style="margin-top:8px">${tr('Save')}</button></form>`; })() : ''}
    ${canWrite() && tinfo.tenants.length ? `<p class="row">Request now:
      ${['electricity', 'gas', 'water'].map((u) => `<button class="btn ghost small" data-meterreq="${u}">${u[0].toUpperCase() + u.slice(1)}</button>`).join('')}</p>` : ''}
    ${meters.length ? `<table><thead><tr><th>Requested</th><th>Utility</th><th>Status</th><th>Reading</th><th></th></tr></thead><tbody>
      ${meters.map((m) => `<tr style="${m.status === 'done' ? '' : ''}">
        <td>${fdate(m.requested_at?.slice(0, 10))}</td>
        <td>${esc(tr(m.utility))}</td>
        <td>${m.status === 'done' ? `<span class="badge paid">${tr('received')} ${m.provided_at ? fdate(m.provided_at) : ''}</span>` : '<span class="badge unpaid">waiting</span>'}</td>
        <td>${m.reading ? `<b class="amount">${esc(m.reading)}</b>` : ''}${m.photo ? ` <a href="/api/properties/${p.id}/meter-requests/${m.id}/photo" target="_blank">photo</a>` : ''}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-meterdel="${m.id}">✕</button>` : ''}</td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">No reading requests yet.</p>`}
    <h3 style="margin-top:16px">Maintenance requests</h3>
    ${maint.length ? `<table><thead><tr><th>Reported</th><th>What</th><th>Photo</th><th>Status</th><th></th></tr></thead><tbody>
      ${maint.map((m) => `<tr style="${m.status === 'done' ? 'opacity:.6' : ''}">
        <td>${fdate(m.created_at?.slice(0, 10))}<br><span class="muted">${esc(m.reported_by || '')}</span></td>
        <td><b>${esc(m.title)}</b>${m.note ? `<br><span class="muted">${esc(m.note)}</span>` : ''}${
          m.reopened_at ? `<br><span class="badge late" style="margin-top:4px">↻ ${tr('Reopened')} ${fdate(m.reopened_at)}</span>${m.reopen_note ? ` <span class="muted">${esc(m.reopen_note)}</span>` : ''}` : ''}</td>
        <td>${m.photo ? `<a href="/api/properties/${p.id}/maintenance/${m.id}/photo" target="_blank">photo</a>` : '<span class="muted">—</span>'}</td>
        <td>${m.status === 'done' ? `<span class="badge paid">${tr('Fixed')}${m.resolved_at ? ' ' + fdate(m.resolved_at) : ''}</span>` : `<span class="badge unpaid">${tr('Open')}</span>`}</td>
        <td class="right"><span class="rowacts">${canWrite() ? `<button class="btn ${m.status === 'done' ? 'ghost ' : ''}small" data-mdone="${m.id}">${m.status === 'done' ? 'Reopen' : tr('Mark fixed')}</button>
          <button class="btn danger small" data-mdel="${m.id}">✕</button>` : ''}</span></td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">Nothing reported by the tenant.</p>`}`;
  const reload = () => renderTenantBox(box, p);
  box.querySelector('[data-rentform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const updated = await api(`/properties/${p.id}`, { method: 'PUT', body: {
        rent_amount: f.rent_amount === '' ? null : Number(f.rent_amount),
        rent_currency: f.rent_currency || null,
        rent_due_day: Number(f.rent_due_day) || 1,
      } });
      Object.assign(p, updated); // keep the card's copy in step so the reload shows the new rent
      toast('Saved', 'success'); reload();
    } catch (err) { toast(err.message, 'error'); }
  });
  const saveLease = async (body) => {
    try {
      const updated = await api(`/properties/${p.id}`, { method: 'PUT', body });
      Object.assign(p, updated);
      toast('Saved', 'success'); reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  box.querySelector('[data-leaseform]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    saveLease({
      lease_start: f.lease_start || null,
      lease_end: f.lease_end || null,
      notice_days: f.notice_days === '' ? null : Number(f.notice_days),
      deposit_amount: f.deposit_amount === '' ? null : Number(f.deposit_amount),
    });
  });
  box.querySelector('[data-depret]')?.addEventListener('click', () => saveLease({ deposit_returned_at: today() }));
  box.querySelector('[data-depheld]')?.addEventListener('click', () => saveLease({ deposit_returned_at: null }));
  // the meter schedule used to be editable only from the property's Edit form; the Tenants page
  // reuses this panel without that button, so it's set here directly
  // a meter's day input is only live while its box is ticked
  box.querySelectorAll('[data-schedform] [data-meter]').forEach((cb) => (cb.onchange = () => {
    const day = box.querySelector(`[data-schedform] [data-day="${cb.dataset.meter}"]`);
    day.disabled = !cb.checked;
    if (cb.checked && !day.value) day.focus();
  }));
  box.querySelector('[data-schedform]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parts = [];
    for (const cb of box.querySelectorAll('[data-schedform] [data-meter]')) {
      if (!cb.checked) continue;
      const day = Math.round(Number(box.querySelector(`[data-schedform] [data-day="${cb.dataset.meter}"]`).value));
      if (!(day >= 1 && day <= 31)) return toast(tr('Give each ticked meter a day between 1 and 31'), 'error');
      parts.push(`${cb.dataset.meter}:${day}`);
    }
    try {
      const updated = await api(`/properties/${p.id}`, { method: 'PUT', body: {
        reading_utilities: parts.join(',') || null,
        reading_day: parts.length ? Number(parts[0].split(':')[1]) : null, // legacy default = first meter's day
      } });
      Object.assign(p, updated);
      toast('Saved', 'success'); reload();
    } catch (err) { toast(err.message, 'error'); }
  });
  box.querySelector('[data-tremind]')?.addEventListener('click', async (e) => {
    try {
      await api(`/properties/${p.id}/tenant/remind`, { method: 'POST' });
      flashSent(e.target); toast('Reminder sent to the tenant', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  box.querySelectorAll('[data-mdone]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${p.id}/maintenance/${b.dataset.mdone}/resolve`, { method: 'POST' }); reload(); }
    catch (err) { toast(err.message); }
  }));
  box.querySelectorAll('[data-mdel]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this maintenance request?')) return;
    await api(`/properties/${p.id}/maintenance/${b.dataset.mdel}`, { method: 'DELETE' }); reload();
  }));
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
    const fd0 = new FormData(e.target);
    const file = fd0.get('file'); fd0.delete('file');
    try {
      const ch = await api(`/properties/${p.id}/charges`, { method: 'POST', body: Object.fromEntries(fd0) });
      if (file && file.size > 0) {
        const fd = new FormData(); fd.append('file', file);
        await api(`/properties/${p.id}/charges/${ch.id}/attachment`, { method: 'POST', body: fd });
      }
      toast('Shared with tenant'); reload();
    } catch (err) { toast(err.message); }
  });
  box.querySelectorAll('[data-chattach]').forEach((inp) => (inp.onchange = async () => {
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { await api(`/properties/${p.id}/charges/${inp.dataset.chattach}/attachment`, { method: 'POST', body: fd }); toast('Invoice attached'); reload(); }
    catch (err) { toast(err.message); }
  }));
  box.querySelectorAll('[data-meterreq]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${p.id}/meter-request`, { method: 'POST', body: { utility: b.dataset.meterreq } }); toast('Reading requested — tenant notified', 'success'); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }));
  box.querySelectorAll('[data-meterdel]').forEach((b) => (b.onclick = async () => {
    await api(`/properties/${p.id}/meter-requests/${b.dataset.meterdel}`, { method: 'DELETE' }); reload();
  }));
  box.querySelectorAll('[data-chconfirm]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${p.id}/charges/${b.dataset.chconfirm}/confirm`, { method: 'POST' }); toast('Payment confirmed', 'success'); reload(); }
    catch (err) { toast(err.message, 'error'); }
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
  return addBox(title, `<form id="${id}" class="formgrid">
    ${fields.map(([n, l, t, ph]) => t === 'select'
      ? `<div><label>${l}</label><select name="${n}">${ph.map(([v, lab]) => `<option value="${v}">${esc(lab)}</option>`).join('')}</select></div>`
      : `<div><label>${l}</label><input name="${n}" type="${t}" step="${t === 'number' ? 'any' : ''}" placeholder="${ph}" ${n === 'name' ? 'required' : ''}></div>`).join('')}
    <button class="btn">Add</button></form>`);
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
  // the deadlines that are actually set, as compact chips on the closed row — this page exists to
  // track them, so you shouldn't have to expand every card to see where you stand
  const chips = cfg.deadlines
    .filter(([k]) => item[k])
    .map(([k, l]) => {
      const days = Math.ceil((new Date(item[k]) - new Date(t)) / 86400000);
      // relative countdown up front (matches the dashboard), exact date kept alongside
      return `<span class="dchip ${daysClass(days)}">${esc(tr(l))} <b>${daysLabel(days)}</b> <span class="dchip-d">${fdate(item[k])}</span></span>`;
    }).join('');
  wrap.innerHTML = `<summary><span>${cfg.icon ? `<span class="entity-ic" aria-hidden="true">${cfg.icon}</span>` : ''}<b>${esc(item.name)}</b>${cfg.badge ? ` <span class="badge role">${esc(cfg.badge)}</span>` : ''} <span class="muted">${esc(cfg.subtitle || '')}</span>
      ${chips ? `<span class="dchips">${chips}</span>` : ''}</span>
    <span class="row">${cfg.headLink ? `<a class="btn small" data-nav href="${cfg.headLink}">${esc(cfg.headLinkLabel || '')} →</a>` : ''}
    ${canWrite() ? `<button class="btn ghost small" data-edit>Edit</button><button class="btn danger small" data-del>Delete</button>` : ''}</span></summary>
    <div class="body">
      <div data-editbox hidden style="margin-bottom:12px"></div>
      <div class="deadgrid">${dl}</div>
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
      ${recs.map((r) => `<tr><td>${fdate(r.date)}</td><td>${tr(cfg.recordTypes[r.type] || r.type)}${r.odometer ? ` <span class="muted">(${r.odometer.toLocaleString('ro-RO')} km)</span>` : ''}</td>
        <td>${esc(r.note || '')}</td>${cfg.showRecordUser ? `<td>${esc(r.user_name || (isIncome(r) ? '—' : ''))}</td>` : ''}<td class="right amount" ${isIncome(r) ? 'style="color:#2f6b5a"' : ''}>${isIncome(r) ? '+' : ''}${money(r.amount)}</td>
        <td class="right">${canWrite() ? `<button class="btn danger small" data-recdel="${r.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">No records yet.</p>`;
    box.querySelectorAll('[data-recdel]').forEach((b) => (b.onclick = () => {
      const { hide, restore } = rowHide(b);
      undoableDelete({ hide, restore, commit: () => api(`/${cfg.route}/${item.id}/records/${b.dataset.recdel}`, { method: 'DELETE' }).then(() => loadRecords()) });
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
    if (!confirm(`${tr('Delete')} „${item.name}” ${tr('and all its history?')}`)) return;
    await api(`/${cfg.route}/${item.id}`, { method: 'DELETE' }); cfg.refresh();
  });
  // a link inside <summary> would otherwise expand the card on its way out
  wrap.querySelector('[data-nav]')?.addEventListener('click', (e) => e.stopPropagation());
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
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // keep the form in view on a phone
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(ev.target));
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      try { await api(`/${cfg.route}/${item.id}`, { method: 'PUT', body }); toast('Saved', 'success'); cfg.refresh(); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
  return wrap;
}

/* ---------- acte (documents) ---------- */
async function viewActe(el) {
  const [docs, members, vehicles, properties] = await Promise.all([api('/documents'), api('/family/members'), api('/vehicles'), api('/properties')]);
  const t = today();
  const linkOpts = [['', tr('Family (general)')],
    ...members.map((m) => ['user:' + m.id, tr('Person') + ': ' + m.name]),
    ...vehicles.map((v) => ['vehicle:' + v.id, tr('Vehicle') + ': ' + v.name]),
    ...properties.map((p) => ['property:' + p.id, tr('Property') + ': ' + p.name])];
  const belongsTo = (d) => d.person_name ? `${tr('Person')}: ${esc(d.person_name)}` : d.vehicle_name ? `${tr('Vehicle')}: ${esc(d.vehicle_name)}` : d.property_name ? `${tr('Property')}: ${esc(d.property_name)}` : tr('Family');
  // what's about to lapse, up front — the same question the vehicle and property pages answer
  const soon = docs.filter((d) => d.expiry_date)
    .map((d) => ({ d, days: Math.ceil((new Date(d.expiry_date) - new Date(t)) / 86400000) }))
    .filter((x) => x.days <= 60).sort((a, b) => a.days - b.days);
  el.innerHTML = `<div class="pagehead"><div><h1>Acte</h1><p>ID cards, passports, certificates, talon auto, contracts — linked to a person, vehicle or property, with expiry reminders and scans.</p></div></div>
    ${soon.length ? `<div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">${tr('Expiring soon')}</h3>
      <div class="dchips">${soon.map(({ d, days }) => `<span class="dchip ${daysClass(days)}">${esc(d.name)} <b>${daysLabel(days)}</b> <span class="dchip-d">${fdate(d.expiry_date)}</span></span>`).join('')}</div></div>` : ''}
    ${canWrite() ? addBox('Add document', `<form id="docform" class="formgrid">
      <div><label>Name</label><input name="name" placeholder="Carte de identitate, Pasaport…" required></div>
      <div><label>Series / number</label><input name="number" placeholder="optional"></div>
      <div><label>Belongs to</label><select name="link">${linkOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div><label>Expiry date</label><input name="expiry_date" type="date"></div>
      <div><label>Notes</label><input name="notes" placeholder="optional"></div>
      <div><label>Scan (PDF or photo)</label><input name="file" type="file" accept=".pdf,image/*"></div>
      <button class="btn">Add document</button></form>`) : ''}
    <div class="card" style="margin-top:16px">
      ${docs.length ? `<table><thead><tr><th>Document</th><th>Belongs to</th><th>Expires</th><th>Scan</th><th></th></tr></thead><tbody>
        ${docs.map((d) => {
          let exp = '<span class="muted">—</span>';
          if (d.expiry_date) {
            const days = Math.ceil((new Date(d.expiry_date) - new Date(t)) / 86400000);
            exp = `<span class="${days < 0 ? 'badge late' : days <= 14 ? 'badge unpaid' : ''}">${fdate(d.expiry_date)} · ${daysLabel(days)}</span>`;
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
        catch (err) { toast(tr('Document saved, but the scan failed:') + ' ' + err.message); viewActe(el); return; }
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

/* ---------- the weekly two minutes ----------
   Sixteen tabs is a lot to open when you only want to know whether anything needs you. This page
   asks three questions in the order somebody actually wants them, puts the button next to the
   thing it acts on, and ends with a way to say "done" — which is also what makes "since you last
   looked" mean anything the next time. */
async function viewReview(el) {
  const r = await api('/review');
  const cash = r.money || {};
  const decideRow = (d) => {
    const when = d.date ? `<span class="muted">${fdate(d.date)}</span>` : '';
    // the server sends the symbol already, because a tenant charge can be in a currency that is
    // not the household one and converting it needs a rate this app has no source for
    const amount = d.amount != null
      ? `<span class="amount">${Number(d.amount).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(d.currency || cur())}</span>`
      : '';
    const act = {
      confirm_charge: `<button class="btn small" data-confirm="${d.id}" data-prop="${d.property_id}">${tr('Confirm')}</button>`,
      pay_bill: `<button class="btn small" data-paybill="${d.id}">${tr('Mark as paid')}</button>`,
      todo: `<button class="btn small" data-todo="${d.id}">${tr('Done')}</button>`,
    }[d.kind] || '';
    return `<tr>
      <td><b>${esc(d.label)}</b>${d.entity ? `<br><span class="muted">${esc(d.entity)}</span>` : ''}</td>
      <td>${when}</td><td class="right">${amount}</td>
      <td class="right">${canWrite() ? act : ''}</td></tr>`;
  };
  const changedLine = (c) => ({
    reading_in: `${tr('Reading came in')}: ${esc(tr(c.label))}${c.value ? ` — ${esc(c.value)}` : ''}`,
    maintenance_new: `${tr('Reported broken')}: ${esc(c.label)}`,
    watch_new: `${tr('New notice')}: ${esc(c.label)}`,
    bill_paid: `${tr('Bill paid')}: ${esc(c.label)}`,
  }[c.kind] || esc(c.label));

  el.innerHTML = `<div class="pagehead"><div><h1>${tr('This week')}</h1>
      <p>${r.first_time ? tr('Everything below is from the last seven days. Once you tick this off, next time shows only what is new since then.')
        : `${tr('What changed since')} ${fdate(String(r.since).slice(0, 10))}`}</p></div></div>

    <section class="card"><h3 style="margin-top:0">1 · ${tr('What changed')}</h3>
    ${r.changed.length
      ? `<ul class="revlist">${r.changed.map((c) => `<li>${changedLine(c)}</li>`).join('')}</ul>`
      : `<p class="muted" style="margin:0">${tr('Nothing happened while you were away.')}</p>`}</section>

    <section class="card" style="margin-top:16px"><h3 style="margin-top:0">2 · ${tr('What needs you')}</h3>
    ${r.decide.length
      ? `<table class="cards"><tbody>${r.decide.map(decideRow).join('')}</tbody></table>`
      : `<p class="muted" style="margin:0">${tr('Nothing is waiting on a decision.')}</p>`}
    ${r.open_maintenance || r.meters_pending ? `<p class="muted" style="margin:10px 0 0">
      ${r.open_maintenance ? `<a href="#properties">${tr('Repairs still open')}: ${r.open_maintenance}</a>` : ''}
      ${r.open_maintenance && r.meters_pending ? ' · ' : ''}
      ${r.meters_pending ? `<a href="#properties">${tr('Readings still missing')}: ${r.meters_pending}</a>` : ''}</p>` : ''}</section>

    <section class="card" style="margin-top:16px"><h3 style="margin-top:0">3 · ${tr('Does the money hold')}</h3>
    ${cash.needs_balance
      ? `<p class="muted" style="margin:0">${tr('Enter what is in the account on the dashboard and this answers itself.')}</p>`
      : `<p class="revmoney ${cash.low < 0 ? 'neg' : ''}" style="margin:0">
          ${cash.low < cash.now
            ? `${tr('Lowest point:')} <b>${money(cash.low)}</b> ${tr('on')} ${fdate(cash.low_date)}`
            : tr('Nothing due drops the balance below where it is now.')}</p>
        <p class="muted" style="margin:6px 0 0">${tr('now')} ${money(cash.now)}${cash.stale_days > 7
          ? ` · <a href="#dashboard">${tr('the balance is old — update it')}</a>` : ''}</p>`}</section>

    ${canWrite() ? `<div class="row" style="justify-content:center;margin-top:20px">
      <button class="btn" id="revdone" style="min-width:220px">${tr('Done for this week')}</button></div>` : ''}`;

  const reload = () => viewReview(el);
  el.querySelectorAll('[data-confirm]').forEach((b) => (b.onclick = async () => {
    try { await api(`/properties/${b.dataset.prop}/charges/${b.dataset.confirm}/confirm`, { method: 'POST' }); toast(tr('Payment confirmed'), 'success'); reload(); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-paybill]').forEach((b) => (b.onclick = async () => {
    try { await api(`/bills/${b.dataset.paybill}/pay`, { method: 'POST' }); toast(tr('Marked as paid'), 'success'); reload(); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-todo]').forEach((b) => (b.onclick = async () => {
    try { await api(`/todos/${b.dataset.todo}/toggle`, { method: 'POST' }); reload(); }
    catch (err) { toast(err.message); }
  }));
  $('#revdone')?.addEventListener('click', async () => {
    try {
      await api('/review/done', { method: 'POST' });
      toast(tr('See you next week'), 'success');
      location.hash = '#dashboard';
    } catch (err) { toast(err.message); }
  });
}

/* ---------- balance forecast ----------
   The dashboard already says what was spent. This says what is left, and when it gets tight —
   which is the question people actually open a money app to ask. It is drawn from one number the
   household types in, so the card leads with that number and how old it is: a forecast built on a
   three-week-old balance is a guess, and it should look like one. */
function forecastCard(f) {
  if (!f || f.needs_balance) return `<section class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between;gap:10px;align-items:baseline">
      <h3 style="margin:0">${tr('How the month ends')}</h3></div>
    <p class="muted" style="margin:6px 0 10px">${tr('Type in what is in the account and the app works out the rest — bills, rates, salary, rent.')}</p>
    ${balanceForm(null)}</section>`;
  const dip = f.low.amount < f.today;
  const tight = f.low.amount < 0;
  // the line is drawn from the series, scaled to its own range; zero gets a rule of its own so
  // "goes below zero" is something you see rather than something you read
  const vals = f.series.map((p) => p.amount);
  const hi = Math.max(...vals, 0), lo = Math.min(...vals, 0);
  const span = (hi - lo) || 1;
  const W = 320, H = 54;
  const x = (i) => (i / Math.max(1, f.series.length - 1)) * W;
  const y = (v) => H - ((v - lo) / span) * H;
  const path = f.series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.amount).toFixed(1)}`).join(' ');
  const zeroY = y(0).toFixed(1);
  return `<section class="card fccard" style="margin-top:18px">
    <div class="row" style="justify-content:space-between;gap:10px;align-items:baseline">
      <h3 style="margin:0">${tr('How the month ends')}</h3>
      <span class="muted">${tr('now')} <b class="amount">${money(f.today)}</b></span>
    </div>
    <p class="fclow ${tight ? 'neg' : ''}">${dip
      ? `${tr('Lowest point:')} <b>${money(f.low.amount)}</b> ${tr('on')} ${fdate(f.low.date)}`
      : tr('Nothing due drops the balance below where it is now.')}</p>
    <svg class="fcline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${lo < 0 ? `<line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" class="fczero"/>` : ''}
      <path d="${path}"/>
    </svg>
    <p class="muted fcend">${tr('Until')} ${fdate(f.horizon)}: <b class="amount">${money(f.end.amount)}</b></p>
    ${f.items.length ? `<details class="fcitems"><summary>${tr('What moves it')} (${f.items.length})</summary>
      <table class="cards"><tbody>${f.items.map((i) => `<tr>
        <td>${fdate(i.date)}</td><td>${esc(i.label)}</td>
        <td class="right amount" style="color:${i.amount < 0 ? 'var(--red)' : '#2f6b5a'}">${i.amount > 0 ? '+' : ''}${money(i.amount)}</td>
      </tr>`).join('')}</tbody></table></details>` : ''}
    ${f.skipped.length ? `<p class="muted" style="font-size:12.5px">${tr('Not counted, another currency:')} ${f.skipped.map((x2) => `${esc(x2.label)} ${Number(x2.amount).toFixed(2)} ${esc(x2.currency)}`).join(' · ')}</p>` : ''}
    ${balanceForm(f)}</section>`;
}
// One number, one date, one button. Kept inside a <details> once a balance exists so the card
// leads with the answer rather than with a form.
// How old the reading is, in words. daysLabel() speaks in deadlines ("3d overdue"), and a balance
// from Tuesday is not overdue — it is just from Tuesday.
const balanceAge = (d) => (LANG === 'ro'
  ? (d === 1 ? 'de ieri' : 'de acum ' + d + ' zile')
  : (d === 1 ? '1 day old' : d + ' days old'));
function balanceForm(f) {
  if (!canWrite()) return '';
  const inner = `<form id="balform" class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
    <div><label>${tr('In the account')} (${cur()})</label><input name="balance" type="number" step="0.01" required style="max-width:150px" value="${f && f.balance != null ? f.balance : ''}"></div>
    <div><label>${tr('On')}</label><input name="date" type="date" value="${today()}" max="${today()}"></div>
    <button class="btn small">${tr('Save balance')}</button></form>`;
  if (!f || f.needs_balance) return inner;
  const stale = f.stale_days > 7;
  return `<details class="fcbal"><summary class="${stale ? 'stale' : ''}">${tr('Balance from')} ${fdate(f.balance_date)}${f.stale_days > 0 ? ' · ' + balanceAge(f.stale_days) : ''}${stale ? ` — ${tr('update it')}` : ''}</summary>${inner}</details>`;
}
function wireBalance(root, reload) {
  root.querySelector('#balform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/balance', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast(tr('Balance saved'), 'success'); reload();
    } catch (err) { toast(err.message); }
  });
}

/* ---------- warranties ----------
   The question this page answers is "can I still claim this, and who from" — which is why the
   receipt and the seller are as prominent as the date. An expired one is kept rather than hidden:
   it is the record of what the thing cost and when it was bought. */
async function viewWarranties(el) {
  const [rows, members, properties] = await Promise.all([api('/warranties'), api('/family/members'), api('/properties')]);
  const t = today();
  const daysTo = (d) => Math.ceil((new Date(d) - new Date(t)) / 86400000);
  const live = rows.filter((w) => w.expires_at >= t);
  const expired = rows.filter((w) => w.expires_at < t);
  const owner = (w) => [w.user_name, w.property_name].filter(Boolean).join(' · ');
  const soon = live.filter((w) => daysTo(w.expires_at) <= 60);
  const row = (w) => {
    const days = daysTo(w.expires_at);
    const dead = days < 0;
    return `<tr${dead ? ' style="opacity:.6"' : ''}>
      <td><b>${esc(w.name)}</b>${w.serial ? ` <span class="muted">${esc(w.serial)}</span>` : ''}${w.note ? `<br><span class="muted">${esc(w.note)}</span>` : ''}</td>
      <td>${w.seller ? esc(w.seller) : '<span class="muted">—</span>'}${owner(w) ? `<br><span class="muted">${esc(owner(w))}</span>` : ''}</td>
      <td>${w.purchased_at ? fdate(w.purchased_at) : '<span class="muted">—</span>'}${w.price != null ? `<br><span class="muted">${money(w.price)}</span>` : ''}</td>
      <td><span class="${dead ? 'badge late' : days <= 30 ? 'badge unpaid' : ''}">${fdate(w.expires_at)}${dead ? '' : ` · ${daysLabel(days)}`}</span></td>
      <td>${w.attachment ? `<a href="/api/warranties/${w.id}/attachment" target="_blank">${tr('receipt')}</a>`
        : canWrite() ? `<label class="btn ghost small" style="display:inline-block">${tr('attach')}<input type="file" data-attach="${w.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
      <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${w.id}">✕</button>` : ''}</td></tr>`;
  };
  const table = (list) => `<table class="cards"><thead><tr><th>${tr('Thing')}</th><th>${tr('Bought from')}</th><th>${tr('Bought')}</th><th>${tr('Cover ends')}</th><th>${tr('Receipt')}</th><th></th></tr></thead>
    <tbody>${list.map(row).join('')}</tbody></table>`;
  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Warranties')}</h1>
      <p>${tr('Appliances, electronics, tools — what is still under cover, who you claim from, and the receipt that proves it.')}</p></div></div>
    ${soon.length ? `<div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">${tr('Running out soon')}</h3>
      <div class="dchips">${soon.map((w) => { const d = daysTo(w.expires_at);
        return `<span class="dchip ${daysClass(d)}">${esc(w.name)} <b>${daysLabel(d)}</b> <span class="dchip-d">${fdate(w.expires_at)}</span></span>`; }).join('')}</div></div>` : ''}
    ${canWrite() ? addBox('Add warranty', `<form id="warform" class="formgrid">
      <div><label>${tr('Thing')}</label><input name="name" placeholder="Mașină de spălat Bosch" required></div>
      <div><label>${tr('Bought from')}</label><input name="seller" placeholder="eMAG, Altex…"></div>
      <div><label>${tr('Serial number')}</label><input name="serial" placeholder="optional"></div>
      <div><label>${tr('Purchase date')}</label><input name="purchased_at" type="date" value="${today()}"></div>
      <div><label>${tr('Cover (months)')}</label><input name="months" type="number" min="1" max="600" value="24"></div>
      <div><label>${tr('or, cover ends on')}</label><input name="expires_at" type="date"></div>
      <div><label>${tr('Price')} (${cur()})</label><input name="price" type="number" step="0.01" min="0" placeholder="optional"></div>
      <div><label>${tr('Person')}</label><select name="user_id"><option value="">${tr('Family (general)')}</option>
        ${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      ${ownProps(properties).length ? `<div><label>${tr('Property')}</label><select name="property_id"><option value="">—</option>
        ${ownProps(properties).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      <div><label>${tr('Note')}</label><input name="note" placeholder="optional"></div>
      <div><label>${tr('Receipt (PDF or photo)')}</label><input name="file" type="file" accept=".pdf,image/*"></div>
      <button class="btn">${tr('Add warranty')}</button></form>`) : ''}
    <div class="card" style="margin-top:16px">
      ${live.length ? table(live) : `<div class="empty"><b>${tr('Nothing under warranty yet')}</b>${tr('Add the fridge, the phone, the drill — anything with a receipt worth keeping.')}</div>`}
    </div>
    ${expired.length ? `<details class="card" style="margin-top:16px"><summary>${tr('Cover already ended')} (${expired.length})</summary>
      <div style="margin-top:10px">${table(expired)}</div></details>` : ''}`;

  $('#warform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const raw = Object.fromEntries(new FormData(form));
    const file = form.querySelector('input[name="file"]')?.files?.[0];
    try {
      const w = await api('/warranties', { method: 'POST', body: raw });
      if (file) {
        const fd = new FormData(); fd.append('file', file);
        try { await api(`/warranties/${w.id}/attachment`, { method: 'POST', body: fd }); }
        catch (err) { toast(tr('Warranty saved, but the receipt failed:') + ' ' + err.message); viewWarranties(el); return; }
      }
      toast(tr('Warranty added'), 'success'); viewWarranties(el);
    } catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this warranty (and its receipt)?')) return;
    await api('/warranties/' + b.dataset.del, { method: 'DELETE' }); viewWarranties(el);
  }));
  el.querySelectorAll('[data-attach]').forEach((inp) => (inp.onchange = async () => {
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { await api(`/warranties/${inp.dataset.attach}/attachment`, { method: 'POST', body: fd }); toast(tr('Receipt attached'), 'success'); viewWarranties(el); }
    catch (err) { toast(err.message); }
  }));
}

/* ---------- family lists ---------- */
const LIST_DEFS = [
  ['buy', 'Buy wishlist', 'PlayStation 5, canapea nouă…'],
  ['travel', 'Travel wishlist', 'Roma, Maramureș…'],
  ['grocery', 'Grocery list', 'Lapte, pâine, ouă…'],
  ['targets', 'Personal targets', 'Learn to swim, read 12 books…'],
  ['baptism', 'Christening guests', 'Familia Popescu, Nașii…'],
];
/* ---------- christening guest list ----------
   An invitation is not a checklist item: it covers a number of adults and children, it is either
   answered or not, and afterwards it carries a gift. The counts are what you actually need — the
   caterer wants heads, not names — so they are totalled at the top, and only confirmed guests are
   counted there. Everything else on the Lists page stays a plain checklist. */
function guestList(rows) {
  if (!rows.length) {
    return `<div class="empty" style="margin-top:10px"><b>${tr('No invitations yet')}</b>${tr('Add the first family above — adults and children are counted for you.')}</div>`;
  }
  const n = (v) => Number(v) || 0;
  const yes = rows.filter((r) => r.rsvp === 'yes'), no = rows.filter((r) => r.rsvp === 'no');
  const waiting = rows.filter((r) => !r.rsvp);
  const sum = (list, f) => list.reduce((s, r) => s + n(r[f]), 0);
  const goingA = sum(yes, 'adults'), goingK = sum(yes, 'kids'), goingS = sum(yes, 'seats');
  const gifts = rows.reduce((s, r) => s + n(r.amount), 0);
  const cell = (r) => `<span class="rsvpset">
      <button class="btn ${r.rsvp === 'yes' ? '' : 'ghost'} tiny" data-rsvp="${r.id}" data-val="yes">${tr('Coming')}</button>
      <button class="btn ${r.rsvp === 'no' ? 'danger' : 'ghost'} tiny" data-rsvp="${r.id}" data-val="no">${tr('Declined')}</button>
    </span>`;
  return `<section class="kpi" style="margin:14px 0 4px">
      <div class="card"><div class="label">${tr('Coming')}</div>
        <div class="value">${goingA + goingK + goingS}</div>
        <div class="muted" style="font-size:12.5px">${goingA} ${tr(goingA === 1 ? 'adult' : 'adults')} · ${goingK} ${tr(goingK === 1 ? 'child' : 'children')}${
          goingS ? ` · ${goingS} ${tr('seats only')}` : ''}</div></div>
      <div class="card"><div class="label">${tr('Answers')}</div>
        <div class="value">${yes.length}/${rows.length}</div>
        <div class="muted" style="font-size:12.5px">${no.length} ${tr('declined')} · ${waiting.length} ${tr('waiting')}</div></div>
      <div class="card"><div class="label">${tr('Gifts')}</div>
        <div class="value">${money(gifts)}</div>
        <div class="muted" style="font-size:12.5px">${rows.filter((r) => n(r.amount) > 0).length} ${tr('recorded')}</div></div>
    </section>
    <table class="cards"><thead><tr>
      <th>${tr('Invitation')}</th><th class="right">${tr('Adults')}</th><th class="right">${tr('Children')}</th>
      <th class="right">${tr('Seats')}</th>
      <th>${tr('Answer')}</th><th class="right">${tr('Gift')}</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.rsvp === 'no' ? 'guest-no' : ''}">
      <td data-label="${tr('Invitation')}"><b>${esc(r.title)}</b>${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td>
      <td class="right amount" data-label="${tr('Adults')}">${canWrite()
        ? `<input class="headin" type="number" min="0" step="1" value="${n(r.adults)}" data-heads="${r.id}" data-field="adults" aria-label="${tr('Adults')}">`
        : n(r.adults)}</td>
      <td class="right amount" data-label="${tr('Children')}">${canWrite()
        ? `<input class="headin" type="number" min="0" step="1" value="${n(r.kids)}" data-heads="${r.id}" data-field="kids" aria-label="${tr('Children')}">`
        : n(r.kids)}</td>
      <td class="right amount" data-label="${tr('Seats')}">${canWrite()
        ? `<input class="headin" type="number" min="0" step="1" value="${n(r.seats)}" data-heads="${r.id}" data-field="seats" aria-label="${tr('Seats only, no menu')}">`
        : n(r.seats)}</td>
      <td data-label="${tr('Answer')}">${canWrite() ? cell(r) : (r.rsvp === 'yes' ? tr('Coming') : r.rsvp === 'no' ? tr('Declined') : '—')}</td>
      <td class="right amount" data-label="${tr('Gift')}">${canWrite()
        ? `<button class="btn ghost tiny" data-gift="${r.id}" data-cur="${n(r.amount)}">${n(r.amount) ? money(r.amount) : '+'}</button>`
        : (n(r.amount) ? money(r.amount) : '')}</td>
      <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${r.id}">✕</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
}
/* ---------- watched pages ----------
   Built after a land auction was posted, held and finished without anybody in the house hearing
   about it. So the page leads with the notices themselves, newest first, and the plumbing — which
   addresses are watched, when each was last checked, what broke — sits underneath. What you want on
   opening it is "what have I missed", not "is the watcher healthy". */
/* When it last looked. The one question a self-checking thing has to answer on sight, because
   silence otherwise reads the same whether nothing has happened or nothing is running. */
function lastLook(sites) {
  const stamps = sites.map((s) => s.last_checked_at).filter(Boolean).sort();
  if (!stamps.length) return tr('Not checked yet — it will look shortly.');
  const mins = Math.max(0, Math.round((Date.now() - new Date(stamps[stamps.length - 1].replace(' ', 'T') + 'Z')) / 60000));
  const ago = mins < 2 ? tr('just now') : mins < 60 ? `${mins} ${tr('min ago')}`
    : mins < 1500 ? `${Math.round(mins / 60)} ${tr('h ago')}` : `${Math.round(mins / 1440)} ${tr('days ago')}`;
  const by = sites.map((x) => x.last_check_by).filter(Boolean).pop();
  return `${tr('Checked')} ${ago}${by ? ` · ${tr(WATCH_BY[by] || by)}` : ''}`;
}
/* Who did the looking. The first thing anybody wants to know after setting a cron up is whether
   it is the cron doing this or their own visit, and there was no way at all to tell them apart. */
const WATCH_BY = {
  cron: 'by the hourly job', app: 'when you opened the app', timer: 'by itself',
  manual: 'because you pressed check', daily: 'by the daily round',
};
let WATCH_TAB = 'news';
async function viewWatch(el, tab = WATCH_TAB) {
  WATCH_TAB = tab;
  const state = await api('/watch');
  renderWatch(el, state);
}
function renderWatch(el, state) {
  const { sites, items } = state;
  const broken = sites.filter((s) => s.fail_count > 0);
  const isNew = (i) => new Date(i.seen_at + 'Z') > new Date(Date.now() - 7 * 864e5);
  const when = (i) => (i.published_at ? fdate(String(i.published_at).slice(0, 10)) : fdate(String(i.seen_at).slice(0, 10)));

  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Watched pages')}</h1>
      <p>${tr('Public pages checked for you, so an announcement does not go by unnoticed.')}</p>
      ${sites.length ? `<p class="muted" style="font-size:12.5px;margin-top:4px">${lastLook(sites)}</p>` : ''}</div>
      ${canWrite() ? `<button class="btn ghost small" id="wcheck">${tr('Check now')}</button>` : ''}</div>

    ${broken.length ? `<div class="card warn" style="margin-bottom:14px">
      <b>${tr('Not able to check')}</b>
      ${broken.map((s) => `<div class="muted" style="font-size:13px">${esc(s.label)} — ${esc(s.last_error || '')}</div>`).join('')}
    </div>` : ''}

    <div class="tabs" style="max-width:420px">
      ${[['news', 'Announcements'], ['sites', 'Pages']].map(([k, l]) =>
    `<button data-w="${k}" class="${k === WATCH_TAB ? 'active' : ''}">${tr(l)}</button>`).join('')}
    </div>

    ${WATCH_TAB === 'news' ? `<div class="card">
      ${items.length ? `<ul class="newslist">${items.map((i) => `<li class="newsrow${i.hit ? ' is-hit' : ''}">
        <div class="row" style="justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <b class="newstitle">${esc(i.title)}</b>
          <span class="muted" style="font-size:12.5px;white-space:nowrap">${when(i)}</span>
        </div>
        <div class="muted newsmeta">${[
    esc(i.source),
    i.hit ? `<span class="badge warn">${tr('matches your keywords')}</span>` : '',
    isNew(i) ? `<span class="badge">${tr('new')}</span>` : '',
  ].filter(Boolean).join(' · ')}</div>
        ${i.summary ? `<p class="muted newssum">${esc(String(i.summary).slice(0, 220))}${String(i.summary).length > 220 ? '…' : ''}</p>` : ''}
        ${i.link ? `<a class="btn ghost small" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${tr('Open the notice')}</a>` : ''}
      </li>`).join('')}</ul>`
    : `<div class="empty"><b>${tr('Nothing spotted yet')}</b>${sites.length
      ? tr('The pages are being watched. Anything new will show up here and in your email.')
      : tr('Add the page of your commune below and anything new posted there lands here.')}
      ${!sites.length && canWrite() ? `<div style="margin-top:12px">
        <button class="btn" id="wquick">${tr('Watch Comuna Bucovăț')}</button>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">${tr('Adds comunabucovat.ro with licitatie, teren, concesiune and vanzare as keywords.')}</p>
      </div>` : ''}</div>`}
    </div>` : `<div class="card">
      ${sites.length ? `<table class="cards"><thead><tr>
        <th>${tr('Page')}</th><th>${tr('Checked')}</th><th class="right">${tr('Seen')}</th><th></th></tr></thead><tbody>
        ${sites.map((s) => `<tr>
          <td data-label="${tr('Page')}"><b>${esc(s.label)}</b>
            <br><span class="muted" style="font-size:12.5px;word-break:break-all">${esc(s.url)}</span>
            ${s.keywords ? `<br><span class="muted" style="font-size:12.5px">${tr('Keywords')}: ${esc(s.keywords)}</span>` : ''}
            ${s.kind === 'page' ? `<br><span class="badge">${tr('text of the page')}</span>` : ''}</td>
          <td data-label="${tr('Checked')}">${s.last_checked_at ? fdate(String(s.last_checked_at).slice(0, 10)) : tr('not yet')}
            ${s.last_check_by ? `<br><span class="muted" style="font-size:12.5px">${tr(WATCH_BY[s.last_check_by] || s.last_check_by)}</span>` : ''}
            ${s.last_error ? `<br><span class="muted" style="color:var(--red);font-size:12.5px">${esc(s.last_error)}</span>` : ''}</td>
          <td class="right" data-label="${tr('Seen')}">${s.items_total}</td>
          <td class="right">${canWrite() ? `<button class="btn ghost small" data-wcheck="${s.id}">${tr('Check now')}</button>
            <button class="btn danger small" data-wdel="${s.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><b>${tr('No pages watched yet')}</b>${tr('Add one below.')}</div>`}

      ${canWrite() ? `<div class="subform">
        <h4>${tr('Watch a page')}</h4>
        <form id="wform" class="formgrid">
          <div><label>${tr('Name')}</label><input name="label" placeholder="${tr('Comuna Bucovăț')}"></div>
          <div style="grid-column:1/-1"><label>${tr('Address')}</label>
            <input name="url" type="url" placeholder="https://www.comunabucovat.ro/feed/" required></div>
          <div><label>${tr('What to read')}</label><select name="kind">
            <option value="feed">${tr('The site feed (recommended)')}</option>
            <option value="page">${tr('The text of the page')}</option></select></div>
          <div><label>${tr('Keywords')} <span class="muted">${tr('optional')}</span></label>
            <input name="keywords" placeholder="${tr('licitatie, teren, concesiune')}"></div>
          <button class="btn small">${tr('Watch it')}</button>
        </form>
        <p class="muted" style="margin:10px 0 0;font-size:12.5px">${tr('Most councils run WordPress: add /feed/ to the address and every notice arrives with its own title and link. Keywords only highlight — everything new is reported either way.')}</p>
      </div>` : ''}
    </div>`}`;

  el.querySelectorAll('.tabs button[data-w]').forEach((b) => (b.onclick = () => { WATCH_TAB = b.dataset.w; renderWatch(el, state); }));
  el.querySelector('#wcheck') && (el.querySelector('#wcheck').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = tr('Checking…');
    try { renderWatch(el, await api('/watch/check-all', { method: 'POST' })); toast(tr('Checked'), 'success'); }
    catch (err) { toast(err.message, 'error'); viewWatch(el); }
  });
  el.querySelectorAll('[data-wcheck]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const next = await api(`/watch/${b.dataset.wcheck}/check`, { method: 'POST' });
      renderWatch(el, next);
      const c = next.checked;
      toast(c.error ? c.error : c.seeded ? tr('Noted what is there now — you will hear about anything new.')
        : c.found ? `${c.found} ${tr(c.found === 1 ? 'new notice' : 'new notices')}` : tr('Nothing new'),
      c.error ? 'error' : 'success');
    } catch (err) { toast(err.message, 'error'); }
  }));
  el.querySelectorAll('[data-wdel]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/watch/' + b.dataset.wdel, { method: 'DELETE' }).then(() => viewWatch(el)) });
  }));
  el.querySelector('#wquick') && (el.querySelector('#wquick').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = tr('Checking…');
    try {
      await api('/watch', { method: 'POST', body: {
        label: 'Comuna Bucovăț', url: 'https://www.comunabucovat.ro/feed/', kind: 'feed',
        keywords: 'licitatie, teren, concesiune, vanzare, achizitie, concurs',
      } });
      // check straight away so the baseline is taken now rather than at some later visit
      renderWatch(el, await api('/watch/check-all', { method: 'POST' }));
      toast(tr('Set up. From now on you only have to look here.'), 'success');
    } catch (err) { toast(err.message, 'error'); viewWatch(el); }
  });
  el.querySelector('#wform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      renderWatch(el, await api('/watch', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }));
      toast(tr('Watching. The first check records what is already there, quietly.'), 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

/* ---------- recurring chores ----------
   The list you actually look at every morning. Two things make it different from the checklists on
   the Lists page: a chore comes back (ticking it means "done for today", not "gone"), and it is
   usually somebody's job. So the tick is stored against today's date server-side and the list resets
   by itself, and every chore can name a person. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let CHORE_WHO = 'all';
async function viewChores(el, tab = 'daily') {
  // A chore and a task differ by whether they come back, so the third tab reads a different table —
  // not a cadence of "never", which would have to invent a period that means nothing.
  const isTodo = tab === 'todo';
  const [chores, todos, members] = await Promise.all([api('/chores'), api('/todos'), api('/family/members')]);
  const byWho = (r) => CHORE_WHO === 'all' || String(r.user_id ?? '') === String(CHORE_WHO);
  const mine = chores.filter(byWho);
  const rows = isTodo ? todos.filter(byWho) : mine.filter((c) => c.cadence === tab);
  const done = rows.filter((c) => c.done).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  // "today" is the daily list plus whatever weekly jobs are pinned to this weekday (or to no day)
  const todayDow = (new Date().getDay() + 6) % 7;
  const todayOpen = mine.filter((c) => !c.done
    && (c.cadence === 'daily' || c.weekday == null || Number(c.weekday) === todayDow)).length;

  el.innerHTML = `<div class="pagehead"><div><h1>Chores</h1><p>${tr(isTodo
    ? 'One-off jobs. Ticking one is the end of it — nothing comes back tomorrow.'
    : 'Recurring jobs around the house. Ticking one marks it done for today — it comes back tomorrow.')}</p></div></div>
    <section class="card chorehead">
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
        <div><div class="muted" style="font-size:12.5px">${tr(isTodo ? 'Still to do' : 'Left for today')}</div>
          <div class="chorecount">${isTodo ? rows.length - done : todayOpen}</div></div>
        <div style="text-align:right"><div class="muted" style="font-size:12.5px">${tr(isTodo ? 'Ticked off' : tab === 'weekly' ? 'Done this week' : 'Done today')}</div>
          <div class="amount"><b>${done}/${rows.length}</b></div></div>
      </div>
      <div class="scorebar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    </section>

    <div class="tabs" style="max-width:520px">
      ${[['daily', 'Daily'], ['weekly', 'Weekly'], ['todo', 'To-do']].map(([k, l]) =>
        `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${tr(l)}</button>`).join('')}
    </div>
    <div class="card">
      <div class="row filterrow" style="margin-top:0">
        <select id="chorewho">
          <option value="all" ${CHORE_WHO === 'all' ? 'selected' : ''}>${tr('Everyone')}</option>
          <option value="" ${CHORE_WHO === '' ? 'selected' : ''}>${tr('Nobody in particular')}</option>
          ${members.map((m) => `<option value="${m.id}" ${String(CHORE_WHO) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      ${rows.length ? `<ul class="chorelist">${rows.map((c) => `<li class="chorerow${c.done ? ' is-done' : ''}">
        <label class="chorecheck">
          <input type="checkbox" data-${isTodo ? 'todo' : 'chore'}="${c.id}" ${c.done ? 'checked' : ''} ${canWrite() ? '' : 'disabled'} style="width:auto">
          <span class="chorebody">
            <span class="choretitle">${esc(c.title)}</span>
            <span class="muted choremeta">${(isTodo ? [
    c.user_name ? esc(c.user_name) : tr('anyone'),
    c.due_date ? `${tr('by')} ${fdate(c.due_date)}` : tr('no deadline'),
    c.done && c.done_by_name ? `${tr('done by')} ${esc(c.done_by_name)}` : '',
    c.note ? esc(c.note) : '',
  ] : [
    c.user_name ? esc(c.user_name) : tr('anyone'),
    c.cadence === 'weekly' ? (c.weekday == null ? tr('any day this week') : tr(WEEKDAYS[c.weekday])) : '',
    c.done && c.done_by_name ? `${tr('done by')} ${esc(c.done_by_name)}` : '',
    c.note ? esc(c.note) : '',
  ]).filter(Boolean).join(' · ')}</span>
          </span>
        </label>
        ${canWrite() ? `<button class="btn danger small" data-${isTodo ? 'tddel' : 'chdel'}="${c.id}" aria-label="${tr('Delete')}">✕</button>` : ''}
      </li>`).join('')}</ul>`
      : `<div class="empty"><b>${tr(isTodo ? 'Nothing on the list' : 'Nothing here yet')}</b>${tr(isTodo ? 'Add a one-off job below — it stays put until someone ticks it.' : 'Add a chore below and it will show up every day.')}</div>`}

      ${canWrite() && isTodo ? `<div class="subform">
        <h4>${tr('New task')}</h4>
        <form id="todoform" class="formgrid">
          <div><label>${tr('Task')}</label><input name="title" placeholder="${tr('Change the front door lock')}" required></div>
          <div><label>${tr('By when')} <span class="muted">${tr('optional')}</span></label><input name="due_date" type="date"></div>
          <div><label>${tr('Person')}</label><select name="user_id"><option value="">${tr('Anyone')}</option>
            ${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <div><label>${tr('Note')} <span class="muted">${tr('optional')}</span></label><input name="note"></div>
          <button class="btn small">${tr('Add task')}</button>
        </form></div>` : ''}

      ${canWrite() && !isTodo ? `<div class="subform">
        <h4>${tr('New chore')}</h4>
        <form id="choreform" class="formgrid">
          <div><label>${tr('Chore')}</label><input name="title" placeholder="${tr('Feed the dogs')}" required></div>
          <div><label>${tr('How often')}</label><select name="cadence" id="chcad">
            <option value="daily" ${tab === 'daily' ? 'selected' : ''}>${tr('Daily')}</option>
            <option value="weekly" ${tab === 'weekly' ? 'selected' : ''}>${tr('Weekly')}</option></select></div>
          <div id="chdaywrap" ${tab === 'weekly' ? '' : 'hidden'}><label>${tr('Day')}</label><select name="weekday">
            <option value="">${tr('Any day')}</option>
            ${WEEKDAYS.map((d, i) => `<option value="${i}">${tr(d)}</option>`).join('')}</select></div>
          <div><label>${tr('Person')}</label><select name="user_id"><option value="">${tr('Anyone')}</option>
            ${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <button class="btn small">${tr('Add chore')}</button>
        </form></div>` : ''}
    </div>`;

  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewChores(el, b.dataset.t)));
  el.querySelector('#chorewho').onchange = (e) => { CHORE_WHO = e.target.value; viewChores(el, tab); };
  // the weekday picker only means something for a weekly chore
  const cad = el.querySelector('#chcad');
  if (cad) cad.onchange = () => { el.querySelector('#chdaywrap').hidden = cad.value !== 'weekly'; };
  el.querySelectorAll('[data-chore]').forEach((cb) => (cb.onchange = async () => {
    // flip the row immediately, then reconcile — a chore tick should feel instant
    cb.closest('.chorerow').classList.toggle('is-done', cb.checked);
    try { await api(`/chores/${cb.dataset.chore}/toggle`, { method: 'POST' }); viewChores(el, tab); }
    catch (err) { toast(err.message, 'error'); viewChores(el, tab); }
  }));
  el.querySelectorAll('[data-todo]').forEach((cb) => (cb.onchange = async () => {
    cb.closest('.chorerow').classList.toggle('is-done', cb.checked);
    try { await api(`/todos/${cb.dataset.todo}/toggle`, { method: 'POST' }); viewChores(el, tab); }
    catch (err) { toast(err.message, 'error'); viewChores(el, tab); }
  }));
  el.querySelectorAll('[data-chdel]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/chores/' + b.dataset.chdel, { method: 'DELETE' }).then(() => viewChores(el, tab)) });
  }));
  el.querySelectorAll('[data-tddel]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/todos/' + b.dataset.tddel, { method: 'DELETE' }).then(() => viewChores(el, tab)) });
  }));
  el.querySelector('#choreform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { await api('/chores', { method: 'POST', body }); viewChores(el, body.cadence || tab); }
    catch (err) { toast(err.message, 'error'); }
  });
  el.querySelector('#todoform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/todos', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); viewChores(el, 'todo'); }
    catch (err) { toast(err.message, 'error'); }
  });
}
/* ---------- seating plan ----------
   Built on Pointer Events rather than HTML5 drag-and-drop, which does not fire on touch at all —
   this app is used mostly on a phone, so a desktop-only drag would have been a decoration. Every
   drag is also a tap: press a guest to pick them up, press a table to put them down. That is not
   only a fallback for accessibility, it is the easier gesture on a small screen with a long list,
   and it is what keyboard users get for free since the chips are buttons. */
let SEAT_PICKED = null; // guest id held by the tap-to-place path, across re-renders

/* "Table" belongs in front of a number, not in front of a name somebody chose: table 4 reads right,
   "Table Top table" does not. So the word is added only when the name is bare digits. */
/* A charge carries the currency it was raised in; an older one predates the column and was
   household currency. Totals are per currency because adding them needs a rate the app has no
   source for — the tenant portal is a document somebody pays against, so one invented number is
   worse than two true ones. */
const chargeCur = (c) => c.currency || FAMILY?.currency || 'RON';
function owedPerCurrency(charges) {
  const totals = {};
  for (const c of charges) totals[chargeCur(c)] = (totals[chargeCur(c)] || 0) + Number(c.amount || 0);
  return totals;
}
const owedText = (charges) => Object.entries(owedPerCurrency(charges))
  .map(([code, v]) => moneyIn(v, code)).join(' · ') || moneyIn(0, FAMILY?.currency);
const tableLabel = (name) => (/^\d+$/.test(String(name)) ? `${tr('Table')} ${name}` : String(name));

/* "6/6" says the table is full; it does not say what the kitchen has to cook. A child and a
   seat-only guest are billed differently from an adult with a menu, so the same six chairs are
   listed by what is actually sitting in them. Zeroes are dropped — "2 adults · 0 children · 0 seats"
   is noise on a table that is simply two adults. */
function headLine(h) {
  if (!h) return '';
  return [
    h.adults ? `${h.adults} ${tr(h.adults === 1 ? 'adult' : 'adults')}` : null,
    h.kids ? `${h.kids} ${tr(h.kids === 1 ? 'child' : 'children')}` : null,
    h.seats ? `${h.seats} ${tr(h.seats === 1 ? 'seat' : 'seats')}` : null,
  ].filter(Boolean).join(' · ');
}

function seatingPlan(host, state) {
  const t = state.totals;
  const short = t.capacity - t.confirmed;
  const chip = (g) => `<button type="button" class="seatchip${SEAT_PICKED === g.id ? ' is-picked' : ''}"
      data-guest="${g.id}" data-size="${g.size}" aria-pressed="${SEAT_PICKED === g.id}">
      <span class="seatname">${esc(g.title)}</span><span class="seatnum">${g.size}</span></button>`;

  host.innerHTML = `
    <section class="kpi" style="margin:14px 0 4px">
      <div class="card"><div class="label">${tr('Confirmed')}</div><div class="value">${t.confirmed}</div>
        <div class="muted" style="font-size:12.5px">${headLine(t.heads) || `${t.parties} ${tr(t.parties === 1 ? 'invitation' : 'invitations')}`}</div></div>
      <div class="card"><div class="label">${tr('Seats in the room')}</div><div class="value">${t.capacity}</div>
        <div class="muted" style="font-size:12.5px">${state.tables.length} ${tr(state.tables.length === 1 ? 'table' : 'tables')}</div></div>
      <div class="card"><div class="label">${tr('Still to seat')}</div>
        <div class="value${state.unseated.length ? ' neg' : ''}">${state.unseated.reduce((s, g) => s + g.size, 0)}</div>
        <div class="muted" style="font-size:12.5px">${short < 0
          ? `<span style="color:var(--red)">${-short} ${tr('more than the room holds')}</span>`
          : `${short} ${tr('spare')}`}</div></div>
    </section>

    <div class="seatzone pool" data-zone="" ${canWrite() ? '' : 'data-locked="1"'}>
      <div class="seathead"><b>${tr('Not seated yet')}</b><span class="muted">${state.unseated.length}</span></div>
      <div class="seatchips">${state.unseated.map(chip).join('')
    || `<span class="muted seatempty">${t.parties ? tr('Everyone has a chair.') : tr('Confirmed guests show up here.')}</span>`}</div>
    </div>

    <div class="seatgrid">
      ${state.tables.map((tb) => `<div class="seatzone${tb.over ? ' is-over' : ''}${tb.free === 0 && !tb.over ? ' is-full' : ''}" data-zone="${tb.id}" data-free="${tb.free}">
        <div class="seathead">
          ${canWrite()
    ? `<button type="button" class="seatrename" data-trename="${tb.id}" title="${tr('Rename this table')}"><b>${esc(tableLabel(tb.name))}</b></button>`
    : `<b>${esc(tableLabel(tb.name))}</b>`}
          <span class="seatcount${tb.over ? ' over' : ''}">${tb.taken}/${tb.capacity}</span>
          ${canWrite() ? `<button class="btn danger tiny" data-tdel="${tb.id}" aria-label="${tr('Delete')}">✕</button>` : ''}
        </div>
        ${tb.taken ? `<div class="seatheads">${headLine(tb.heads)}</div>` : ''}
        ${canWrite() ? `<form class="seatedit" data-tedit="${tb.id}" hidden>
          <input name="name" value="${esc(tb.name)}" aria-label="${tr('Name for this table')}" required>
          <input name="capacity" type="number" min="1" step="1" value="${tb.capacity}" aria-label="${tr('How many seats does it have?')}">
          <button class="btn small" type="submit">${tr('Save')}</button>
          <button class="btn ghost small" type="button" data-tcancel="${tb.id}">${tr('Cancel')}</button>
        </form>` : ''}
        <div class="seatchips">${tb.guests.map(chip).join('') || `<span class="muted seatempty">${tr('empty')}</span>`}</div>
        ${tb.over ? `<div class="badge warn" style="margin:8px 10px 10px">${tb.taken - tb.capacity} ${tr('over capacity')}</div>` : ''}
      </div>`).join('')}
    </div>

    ${canWrite() ? `<div class="card" style="margin-top:14px">
      <div class="subform" style="margin-top:0;padding-top:0;border-top:0">
        <h4>${tr('Add tables')}</h4>
        <form id="seatform" class="formgrid">
          <div><label>${tr('How many')}</label><input name="count" type="number" min="1" max="50" step="1" value="1" required></div>
          <div><label>${tr('Seats each')}</label><input name="capacity" type="number" min="1" step="1" required></div>
          <button class="btn small">${tr('Add tables')}</button>
        </form>
        <p class="muted" style="margin:10px 0 0;font-size:12.5px">${tr('Drag a guest onto a table, or tap the guest and then the table.')}</p>
      </div>
    </div>` : ''}`;

  if (!canWrite()) return;
  wireSeating(host, () => refreshSeating(host));
  host.querySelector('#seatform').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const next = await api('/seating/tables', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      seatingPlan(host, next);
    } catch (err) { toast(err.message, 'error'); }
  });
  host.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = async () => {
    try { seatingPlan(host, await api('/seating/tables/' + b.dataset.tdel, { method: 'DELETE' })); }
    catch (err) { toast(err.message, 'error'); }
  }));
  /* Rename and resize together: both are corrections to the same thing — what the venue actually
     gave you — and they get noticed at the same moment. Edited in place rather than through a
     native prompt(): this is a surface you manipulate directly, and a modal dialog interrupting it
     reads as a different application, most of all on a phone. */
  const closeEdits = () => host.querySelectorAll('.seatedit').forEach((f) => { f.hidden = true; f.reset(); });
  host.querySelectorAll('[data-trename]').forEach((b) => (b.onclick = () => {
    const form = host.querySelector(`[data-tedit="${b.dataset.trename}"]`);
    const wasOpen = !form.hidden;
    closeEdits();
    if (wasOpen) return;
    form.hidden = false;
    const input = form.querySelector('[name=name]');
    input.focus();
    input.select();
  }));
  host.querySelectorAll('[data-tcancel]').forEach((b) => (b.onclick = closeEdits));
  host.querySelectorAll('[data-tedit]').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      try { seatingPlan(host, await api('/seating/tables/' + f.dataset.tedit, { method: 'PUT', body })); }
      catch (err) { toast(err.message, 'error'); }
    });
    // Escape backs out without saving, which is the only way out people try first
    f.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeEdits(); } });
  });
}
async function refreshSeating(host) {
  try { seatingPlan(host, await api('/seating')); } catch (err) { toast(err.message, 'error'); }
}
// Assign, then redraw from what the server says rather than from what we hoped — a rejected move
// (the table is full) has to leave the guest visibly where they were.
async function seatAssign(host, itemId, zone) {
  try {
    SEAT_PICKED = null;
    seatingPlan(host, await api('/seating/assign', { method: 'POST', body: { item_id: itemId, table_id: zone === '' ? null : zone } }));
  } catch (err) {
    const d = err.data || {};
    // "does not fit" is the one refusal a user will actually hit, and it is only useful with the
    // numbers in it — so it is written here, per language, rather than translated from the server.
    toast(d.capacity != null
      ? (LANG === 'ro'
        ? `Nu încap la ${tableLabel(d.table).toLowerCase()}: are ${d.capacity} locuri, ${d.taken} ocupate, iar invitația asta cere ${d.needs}.`
        : `They do not fit at ${tableLabel(d.table).toLowerCase()}: ${d.capacity} seats, ${d.taken} taken, this invitation needs ${d.needs}.`)
      : err.message, 'error');
    refreshSeating(host);
  }
}
/* The pointer listeners go on the container, which survives every re-render — so they are attached
   exactly once. Binding them per render instead stacked a fresh set on each redraw: one tap then ran
   the handler N times, and since a tap toggles the selection, an even N picked the guest up and put
   them straight back down. It looked like the tap simply stopped working after a few moves. The zone
   clicks are re-bound every render because those elements are rebuilt, and `onclick =` replaces
   rather than accumulates. */
function wireSeating(host, _refresh) {
  const DRAG_SLOP = 6; // below this a press is a tap, not a drag — thumbs are never still
  const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest('.seatzone');
  const clearHover = () => host.querySelectorAll('.seatzone').forEach((z) => z.classList.remove('is-hover', 'is-reject'));
  // the second half of tap-to-place, re-bound each render
  host.querySelectorAll('.seatzone').forEach((z) => (z.onclick = (e) => {
    if (SEAT_PICKED == null || e.target.closest('[data-guest]') || e.target.closest('button.btn')) return;
    seatAssign(host, SEAT_PICKED, z.dataset.zone);
  }));
  if (host._seatWired) return;
  host._seatWired = true;
  let drag = null;

  host.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-guest]');
    if (!el || e.button > 0) return;
    e.preventDefault();
    drag = { el, id: Number(el.dataset.guest), size: Number(el.dataset.size), x: e.clientX, y: e.clientY, moved: false, ghost: null };
    el.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      const r = drag.el.getBoundingClientRect();
      drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.className = 'seatchip seatghost';
      drag.ghost.style.width = `${r.width}px`;
      document.body.appendChild(drag.ghost);
      drag.el.classList.add('is-dragging');
      document.body.classList.add('seat-dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    clearHover();
    const z = zoneAt(e.clientX, e.clientY);
    // free is absent on the pool, which always has room
    if (z) z.classList.add(z.dataset.free !== undefined && Number(z.dataset.free) < drag.size ? 'is-reject' : 'is-hover');
  });
  const finish = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    document.body.classList.remove('seat-dragging');
    d.ghost?.remove();
    d.el.classList.remove('is-dragging');
    clearHover();
    if (!d.moved) { // a tap: pick up, or put down where it already is
      SEAT_PICKED = SEAT_PICKED === d.id ? null : d.id;
      host.querySelectorAll('[data-guest]').forEach((c) => {
        const on = Number(c.dataset.guest) === SEAT_PICKED;
        c.classList.toggle('is-picked', on);
        c.setAttribute('aria-pressed', on);
      });
      return;
    }
    const z = zoneAt(e.clientX, e.clientY);
    if (!z) return;                                   // dropped outside: nothing moves
    if (z.dataset.zone === String(d.el.closest('.seatzone')?.dataset.zone)) return; // same place
    seatAssign(host, d.id, z.dataset.zone);
  };
  host.addEventListener('pointerup', finish);
  host.addEventListener('pointercancel', () => {
    if (!drag) return;
    document.body.classList.remove('seat-dragging');
    drag.ghost?.remove();
    drag.el.classList.remove('is-dragging');
    clearHover();
    drag = null;
  });
}

let BAPTISM_VIEW = 'guests';
async function viewLists(el, tab = 'buy') {
  const [items, members] = await Promise.all([api('/lists'), api('/family/members')]);
  const def = LIST_DEFS.find((d) => d[0] === tab);
  const rows = items.filter((i) => i.list === tab);
  const openCount = rows.filter((i) => !i.done).length;
  el.innerHTML = `<div class="pagehead"><div><h1>Lists</h1><p>Wishlists, groceries and personal goals for the whole family.</p></div></div>
    <div class="tabs" style="max-width:680px">${LIST_DEFS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
    ${tab === 'baptism' ? `<div class="tabs" style="max-width:360px;margin-top:-4px">
      ${[['guests', 'Invitations'], ['seating', 'Seating']].map(([k, l]) =>
    `<button data-sub="${k}" class="${k === BAPTISM_VIEW ? 'active' : ''}">${tr(l)}</button>`).join('')}
    </div>` : ''}
    ${tab === 'baptism' && BAPTISM_VIEW === 'seating' ? '<div id="seatplan">…</div>' : `
    <div class="card">
      ${canWrite() ? `<form id="listform" class="formgrid">
        <div><label>${tab === 'baptism' ? tr('Invitation') : tab === 'targets' ? 'Target' : 'Item'}</label><input name="title" placeholder="${esc(def[2])}" required></div>
        ${tab === 'baptism' ? `<div><label>${tr('Adults')}</label><input name="adults" type="number" min="0" step="1" value="2"></div>
        <div><label>${tr('Children')}</label><input name="kids" type="number" min="0" step="1" value="0"></div>
        <div><label>${tr('Seats only, no menu')}</label><input name="seats" type="number" min="0" step="1" value="0"></div>
        <div><label>${tr('Answer')}</label><select name="rsvp">
          <option value="">${tr('No answer yet')}</option>
          <option value="yes">${tr('Coming')}</option>
          <option value="no">${tr('Declined')}</option></select></div>` : ''}
        ${tab === 'buy' ? `<div><label>Est. price (${cur()})</label><input name="amount" type="number" step="0.01" min="0"></div>` : ''}
        ${tab === 'targets' ? `<div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>` : ''}
        <div><label>Note</label><input name="note" placeholder="optional"></div>
        <button class="btn">Add</button></form>` : ''}
      ${tab === 'baptism' ? guestList(rows) : rows.length ? `<p class="muted" style="margin:12px 0 4px">${openCount} ${tr('open')} · ${rows.length - openCount} ${tr('done')}</p>
      <table><tbody>
        ${rows.map((i) => `<tr style="${i.done ? 'opacity:.55' : ''}">
          <td style="width:30px">${canWrite() ? `<input type="checkbox" data-tog="${i.id}" ${i.done ? 'checked' : ''} style="width:auto">` : (i.done ? '✓' : '')}</td>
          <td><b style="${i.done ? 'text-decoration:line-through' : ''}">${esc(i.title)}</b>${i.note ? `<br><span class="muted">${esc(i.note)}</span>` : ''}</td>
          <td class="muted">${esc(i.user_name || '')}</td>
          <td class="right amount">${i.amount ? money(i.amount) : ''}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${i.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty" style="margin-top:10px"><b>Nothing here yet</b>Add the first item above.</div>`}
    </div>`}`;
  el.querySelectorAll('.tabs button[data-t]').forEach((b) => (b.onclick = () => viewLists(el, b.dataset.t)));
  el.querySelectorAll('.tabs button[data-sub]').forEach((b) => (b.onclick = () => {
    BAPTISM_VIEW = b.dataset.sub; SEAT_PICKED = null; viewLists(el, tab);
  }));
  const plan = el.querySelector('#seatplan');
  if (plan) { refreshSeating(plan); return; }
  $('#listform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/lists', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), list: tab } }); viewLists(el, tab); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-tog]').forEach((c) => (c.onchange = async () => {
    await api(`/lists/${c.dataset.tog}/toggle`, { method: 'POST' }); viewLists(el, tab);
  }));
  // Saved on blur/commit rather than on every keystroke, and the whole list is only redrawn once
  // the value has landed — re-rendering mid-edit would yank the field out from under the cursor.
  el.querySelectorAll('[data-heads]').forEach((inp) => (inp.onchange = async () => {
    try {
      await api(`/lists/${inp.dataset.heads}/heads`, { method: 'POST', body: { [inp.dataset.field]: inp.value } });
      viewLists(el, tab);
    } catch (err) { toast(err.message, 'error'); viewLists(el, tab); }
  }));
  el.querySelectorAll('[data-rsvp]').forEach((b) => (b.onclick = async () => {
    try { await api(`/lists/${b.dataset.rsvp}/rsvp`, { method: 'POST', body: { rsvp: b.dataset.val } }); viewLists(el, tab); }
    catch (err) { toast(err.message, 'error'); }
  }));
  el.querySelectorAll('[data-gift]').forEach((b) => (b.onclick = async () => {
    const cur0 = Number(b.dataset.cur) || '';
    const v = prompt(`${tr('Gift')} (${cur()}) — ${tr('leave empty to clear')}`, cur0 === '' ? '' : String(cur0));
    if (v === null) return;
    try { await api(`/lists/${b.dataset.gift}/gift`, { method: 'POST', body: { amount: v.trim() } }); viewLists(el, tab); }
    catch (err) { toast(err.message, 'error'); }
  }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const { hide, restore } = rowHide(b);
    undoableDelete({ hide, restore, commit: () => api('/lists/' + b.dataset.del, { method: 'DELETE' }).then(() => viewLists(el, tab)) });
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
      <p class="muted">${txs.length} ${tr("transactions found. Untick anything you don't want; fix categories where the guess is wrong.")}</p>
      <div style="max-height:420px;overflow:auto"><table><thead><tr><th></th><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th class="right">Amount</th></tr></thead><tbody>
      ${txs.map((t, i) => `<tr>
        <td><input type="checkbox" data-inc="${i}" checked style="width:auto"></td>
        <td>${fdate(t.date)}</td><td>${esc(t.description.slice(0, 60))}</td>
        <td>${t.type === 'expense' ? '<span class="badge unpaid">out</span>' : '<span class="badge paid">in</span>'}</td>
        <td>${t.type === 'expense' ? `<select data-cat="${i}" style="width:150px">${CATEGORIES.map((c) => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select>` : '<span class="muted">income</span>'}</td>
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
          <p><b>${r.imported}</b> ${tr('imported')} · <b>${r.skipped}</b> ${tr('skipped (already imported before)')} · <b>${r.errors}</b> ${tr('invalid.')}</p>
          <p><a href="#money">See them in Budget & expenses →</a></p></div>`;
      } catch (err) { toast(err.message); }
    };
  }
}

/* ---------- search ---------- */
let SEARCH_Q = '';
const SEARCH_KINDS = { expense: 'Expense', income: 'Income', bill: 'Bill', document: 'Document', credit: 'Credit', vehicle: 'Vehicle', property: 'Property', list: 'List', chore: 'Chore', todo: 'Task', loan: 'Money lent', goal: 'Goal', charge: 'Charge', maintenance: 'Repair', deadline: 'Deadline' };
async function viewSearch(el) {
  el.innerHTML = `<div class="pagehead"><div><h1>Search</h1><p>Across expenses, income, bills, acte, credits, cars, properties and lists.</p></div></div>
    <div class="card">
      <input id="sq" type="search" placeholder="Digi, pasaport, Kaufland…" value="${esc(SEARCH_Q)}" autocomplete="off" style="font-size:16px">
      <p class="muted" style="margin:8px 0 0">${tr('Tip: press Ctrl+K (or /) anywhere to search without leaving the page.')}</p>
      <div id="sres" style="margin-top:12px"></div>
    </div>`;
  const box = $('#sres'), input = $('#sq');
  const run = async () => {
    const q = input.value.trim();
    SEARCH_Q = q;
    if (q.length < 2) { box.innerHTML = `<p class="muted">Type at least 2 characters.</p>`; return; }
    const { results } = await api('/search?q=' + encodeURIComponent(q));
    if (!results.length) { box.innerHTML = `<div class="empty"><b>Nothing found</b>No match for "${esc(q)}".</div>`; return; }
    box.innerHTML = `<p class="muted">${results.length} ${tr(results.length === 1 ? 'result' : 'results')}</p>
      <table class="cards"><tbody>${results.map((r) => `<tr>
        <td data-label="${tr('Type')}"><span class="badge role">${tr(SEARCH_KINDS[r.kind] || r.kind)}</span></td>
        <td><b>${esc(r.title || '')}</b>${r.sub ? `<br><span class="muted">${esc(r.sub)}</span>` : ''}</td>
        <td data-label="${tr('Date')}">${r.date ? fdate(r.date) : ''}</td>
        <td class="right amount" data-label="${tr('Amount')}">${r.amount != null ? moneyIn(r.amount, r.currency) : ''}</td>
        <td class="right"><a class="btn ghost small" href="#${r.tab}" data-go="${r.kind}">${tr('View')}</a></td>
      </tr>`).join('')}</tbody></table>`;
    // an expense result lands on the Expenses tab already filtered to what was searched
    box.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => {
      const k = a.dataset.go;
      const MONEY_TAB = { expense: 'expenses', income: 'income', credit: 'credits', loan: 'debt', goal: 'savings' };
      if (MONEY_TAB[k]) PENDING_MONEY_TAB = MONEY_TAB[k];
      if (k === 'expense') PENDING_EXPENSE_FILTER = { q: SEARCH_Q, month: 'all', who: 'all', cat: 'all' };
    }));
  };
  input.oninput = () => { clearTimeout(input._h); input._h = setTimeout(run, 250); };
  input.focus();
  if (SEARCH_Q) run(); else box.innerHTML = `<p class="muted">Type at least 2 characters.</p>`;
}

/* ---------- alerts (site notifications) ---------- */
async function viewAlerts(el) {
  const data = await api('/notifications');
  NOTIF = data;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const enabled = browserNotifOn();
  el.innerHTML = `<div class="pagehead"><div><h1>Alerts</h1>
    <p>Generated automatically when a bill or deadline gets within 30, 14, 7 or 1 days — or goes overdue. Shared by the whole family; hiding one only affects you.</p></div>
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
      ${data.items.length ? `<table class="alerts"><tbody>${data.items.map((n) => {
        // the item key carries the deadline (kind:ref:YYYY-MM-DD), so the row can carry the same
        // amber/red urgency the dashboard and the entity chips use. Undated kinds stay neutral.
        const d = alertDays(n.item);
        return `<tr class="alertrow ${d === null ? '' : daysClass(d)}" style="${n.read ? 'opacity:.55' : ''}"><td style="width:20px">${n.read ? '' : '<span class="dot"></span>'}</td>
        <td><b>${esc(n.title)}</b><br><span class="muted">${esc(n.body || '')}</span>
          ${n.item ? `<div class="snoozerow">
            <button class="btn ghost tiny" data-snooze="${esc(n.item)}">Snooze 7 days</button>
            <button class="btn ghost tiny" data-handled="${esc(n.item)}">Handled</button>
          </div>` : ''}</td>
        <td class="right muted" style="white-space:nowrap">${new Date(n.created_at + 'Z').toLocaleDateString('ro-RO')}</td></tr>`;
      }).join('')}
      </tbody></table>` : `<div class="empty"><b>No alerts yet</b>They appear here as your bills and deadlines get close.</div>`}
    </div>`;
  // Quieting is per person: it hides the alert for you, the rest of the family still sees it.
  el.querySelectorAll('[data-snooze],[data-handled]').forEach((b) => b.addEventListener('click', async () => {
    const dismiss = b.hasAttribute('data-handled');
    const item = b.getAttribute(dismiss ? 'data-handled' : 'data-snooze');
    b.disabled = true;
    try {
      await api('/notifications/snooze', { method: 'POST', body: dismiss ? { item, dismiss: true } : { item, days: 7 } });
      toast(dismiss ? 'Alert hidden — it comes back if the deadline is renewed' : 'Hidden for 7 days', 'ok');
      viewAlerts(el); pollNotifications();
    } catch (err) { b.disabled = false; toast(err.message, 'err'); }
  }));
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
      <span class="row"><input readonly value="${esc(inviteLink())}" class="selectall" style="flex:1;min-width:200px;font-size:13px">
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
        <td>${isAdmin && m.id !== ME.id && m.email ? `<select data-role="${m.id}">${['admin', 'adult', 'child'].map((r) => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : `<span class="badge role">${tr(m.role)}</span>`}</td>
        ${isAdmin ? `<td class="right">${m.id !== ME.id ? `<button class="btn danger small" data-del="${m.id}">Remove</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
    ${isAdmin ? `<div class="card" style="margin-top:16px"><h3>Family settings</h3>
      <form id="famform" class="formgrid">
        <div><label>Family name</label><input name="name" value="${esc(FAMILY.name)}"></div>
        <div><label>Currency</label><select name="currency">${Object.entries(CURRENCIES).map(([code, sym]) =>
          `<option value="${code}" ${code === FAMILY.currency ? 'selected' : ''}>${code}${code === sym ? '' : ` (${sym})`}</option>`).join('')}</select></div>
        <button class="btn">Save</button></form>
        <p class="muted" style="margin:10px 0 0;font-size:12.5px">${tr('Changing this relabels existing amounts — it does not convert them.')}</p></div>` : ''}`;
  $('#rotate')?.addEventListener('click', async () => {
    const r = await api('/family/invite/rotate', { method: 'POST' });
    FAMILY.invite_code = r.invite_code; viewFamily(el);
  });
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  $('#inviteform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email');
    try { await api('/family/invite/email', { method: 'POST', body: { email } }); toast(tr('Invite sent to') + ' ' + email); e.target.reset(); }
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
  const [members, haInfo] = await Promise.all([api('/family/members'), api('/ha/info').catch(() => ({ url: null }))]);
  const kids = members.filter((m) => m.role === 'child');
  const canEditKids = ME.role === 'admin' || ME.role === 'adult';
  el.innerHTML = `<div class="pagehead"><div><h1>Settings</h1><p>Your profile, theme and family pictures.</p></div></div>
    <div class="card"><h3>Appearance</h3>
      <p class="muted" style="margin-top:0">Choose how Family Hub looks on this account.</p>
      <div class="row">${['light', 'dark', 'system'].map((tm) => `<button class="btn ${(ME.theme || 'light') === tm ? '' : 'ghost'} small" data-theme="${tm}">${THEME_LABELS[tm]}</button>`).join('')}</div>
      <p class="muted" style="margin:14px 0 6px">Language</p>
      <div class="row">${[['en', '🇬🇧 English'], ['ro', '🇷🇴 Română']].map(([lg, lb]) => `<button class="btn ${(ME.lang || 'en') === lg ? '' : 'ghost'} small" data-lang="${lg}">${lb}</button>`).join('')}</div>
    </div>
    <details class="card foldcard" style="margin-top:16px"><summary>Notifications on this device</summary><div style="padding-top:12px">
      <p class="muted" style="margin-top:0">Get alerts (RCA, ITP, acte, birthdays…) as push notifications on this phone/computer even when the site is closed. Tip: on a phone, first use "Add to Home Screen" to install the app.</p>
      <div class="row"><button class="btn small" id="pushbtn">…</button><button class="btn ghost small" id="pushtest" hidden>Send a test</button></div>
      <p class="muted" style="margin:16px 0 6px">Which alerts do you want?</p>
      <div class="row" style="flex-wrap:wrap;gap:6px 16px">
        ${[['vehicles', 'Vehicles (RCA, ITP, rovinietă…)'], ['property', 'Property insurance'], ['tenant', 'Tenant & rent'], ['documents', 'Documents (acte)'], ['birthdays', 'Birthdays']]
          .map(([g, lb]) => `<label style="display:inline-flex;align-items:center;gap:7px;margin:0;font-size:13.5px;font-weight:500;color:var(--ink)"><input type="checkbox" data-ngroup="${g}" ${String(ME.notif_muted || '').split(',').includes(g) ? '' : 'checked'} style="width:auto"> ${lb}</label>`).join('')}
      </div>
      <p class="muted" style="margin:14px 0 6px">Quiet hours (push notifications wait until morning)</p>
      <div class="row">
        <select id="qstart" style="width:110px"><option value="">Off</option>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${ME.quiet_start === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
        <span class="muted">–</span>
        <select id="qend" style="width:110px"><option value="">Off</option>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${ME.quiet_end === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
        <button class="btn small" id="notifsave">Save alert settings</button>
      </div>
      <p class="muted" style="margin:8px 0 0">Alert choices are yours alone — every family member picks their own.</p>
    </div></details>
    <div class="card" style="margin-top:16px"><h3>Your profile</h3>
      <div class="row" style="gap:16px;align-items:center">${avatarHtml(ME, 'avatar-lg')}
        <div class="row">
          ${ME.role !== 'child' ? `<label class="btn ghost small" style="display:inline-block">Upload picture<input type="file" data-avatar="${ME.id}" data-self accept="image/*" hidden></label>` : ''}
          ${ME.avatar ? `<button class="btn danger small" data-avadel="${ME.id}" data-self>Remove</button>` : ''}
        </div></div>
      ${ME.role !== 'child' ? `<form id="nameform" class="formgrid" style="margin-top:12px;max-width:560px">
        <div><label>Display name</label><input name="name" value="${esc(ME.name)}" required></div>
        <div><label>Birthday</label><input name="birthday" type="date" value="${esc(ME.birthday || '')}"></div>
        <div><label>Phone number</label><input name="phone" type="tel" value="${esc(ME.phone || '')}" placeholder="07xx xxx xxx"></div>
        <button class="btn small">Save profile</button></form>` : ''}
    </div>
    ${ME.email ? `<div class="card" style="margin-top:16px"><h3>Password</h3>
      <p class="muted" style="margin-top:0">Changing it signs you out on every other device.</p>
      <button class="btn small" id="pwbtn">Change password</button>
    </div>` : ''}
    ${canEditKids && kids.length ? `<div class="card" style="margin-top:16px"><h3>Children's pictures</h3>
      <div class="row" style="gap:22px;flex-wrap:wrap">${kids.map((k) => `<div style="text-align:center">${avatarHtml(k, 'avatar-lg')}
        <div style="margin-top:6px"><b>${esc(k.name)}</b></div>
        <div class="row" style="justify-content:center;margin-top:4px">
          <label class="btn ghost small" style="display:inline-block">Upload<input type="file" data-avatar="${k.id}" accept="image/*" hidden></label>
          ${k.avatar ? `<button class="btn danger small" data-avadel="${k.id}">✕</button>` : ''}</div></div>`).join('')}</div></div>` : ''}
    ${ME.role === 'admin' ? `<div class="card" style="margin-top:16px"><h3>${tr('House dashboard')}</h3>
      <p class="muted" style="margin-top:0">${tr('A read-only address Home Assistant can read to show these numbers on a wall panel. It gives out figures only — no names, no notes, no addresses — and it cannot change anything here.')}</p>
      ${haInfo.url
        ? `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <code class="tokenline">${esc(haInfo.url)}</code>
            <button class="btn ghost small" data-copy="${esc(haInfo.url)}">${tr('Copy')}</button>
            <button class="btn ghost small" id="harotate">${tr('New address')}</button></div>`
        : `<button class="btn small" id="hagen">${tr('Create the address')}</button>`}</div>
    <div class="card" style="margin-top:16px"><h3>${tr('Backup')}</h3>
      <p class="muted" style="margin-top:0">${tr('A compressed copy of the whole database, taken cleanly while the app keeps running. Scans and invoices are not in it — those live in the uploads folder.')}</p>
      <button class="btn small" id="dlbackup">${tr('Download backup')}</button></div>` : ''}`;
  el.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { theme: b.dataset.theme } }); ME = { ...ME, ...u }; applyTheme(); render(); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { lang: b.dataset.lang } }); ME = { ...ME, ...u }; applyLang(); render(); }
    catch (err) { toast(err.message); }
  }));
  const haGen = async () => {
    try { await api('/ha/token', { method: 'POST' }); toast(tr('Address ready'), 'success'); viewSettings(el); }
    catch (err) { toast(err.message); }
  };
  $('#hagen')?.addEventListener('click', haGen);
  $('#harotate')?.addEventListener('click', async () => {
    if (confirm('Generate a new address? The old one stops working.')) await haGen();
  });
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  setupPushCard();
  $('#notifsave')?.addEventListener('click', async () => {
    // muted = groups left unchecked; quiet hours only count when both edges are set
    const muted = [...el.querySelectorAll('[data-ngroup]')].filter((c) => !c.checked).map((c) => c.dataset.ngroup);
    const qs = $('#qstart').value, qe = $('#qend').value;
    const body = { notif_muted: muted, quiet_start: qs === '' || qe === '' ? null : Number(qs), quiet_end: qs === '' || qe === '' ? null : Number(qe) };
    try { const u = await api('/settings', { method: 'POST', body }); ME = { ...ME, ...u }; toast('Saved'); pollNotifications(); }
    catch (err) { toast(err.message); }
  });
  $('#dlbackup')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
      // fetched rather than linked so a failure surfaces as a toast instead of a page full of JSON
      const r = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed');
      const blob = await r.blob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `familyhub-${today()}.db.gz`,
      });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(tr('Backup downloaded'), 'success');
    } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
  });
  $('#pwbtn')?.addEventListener('click', () => passwordChangeModal());
  $('#nameform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const u = await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); ME = { ...ME, ...u }; toast('Saved'); render(); }
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

/* ---------- push notifications setup (Settings card) ---------- */
function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function setupPushCard() {
  const btn = $('#pushbtn'), testBtn = $('#pushtest');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = tr('Not supported by this browser'); btn.disabled = true; return;
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const paint = () => {
    btn.textContent = tr(sub ? 'Disable on this device' : 'Enable on this device');
    btn.classList.toggle('ghost', !!sub);
    testBtn.hidden = !sub;
  };
  paint();
  btn.onclick = async () => {
    try {
      if (sub) {
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe(); sub = null; toast('Push notifications off on this device');
      } else {
        const { key } = await api('/push/key');
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
        await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
        toast('Push notifications on — alerts will reach this device');
      }
      paint();
    } catch (err) { toast(err.message || 'Permission was not granted'); }
  };
  testBtn.onclick = async () => {
    try { await api('/push/test', { method: 'POST' }); toast('Test sent — check your notifications'); }
    catch (err) { toast(err.message); }
  };
}

/* ---------- date inputs: show dd/mm/yyyy instead of the browser's locale format ----------
   Native <input type="date"> is locked to the browser locale, so we turn every date field
   into a numeric text field (numeric keypad on mobile, auto slashes). Values are converted
   back to ISO centrally in api(); displayed dates use fdate(). */
function upgradeDateInput(inp) {
  if (inp.classList.contains('dateinput') || inp.classList.contains('dpnative')) return; // already done / our own helper
  const iso = inp.value; // browser normalized a type=date value to yyyy-mm-dd
  inp.type = 'text';
  inp.setAttribute('inputmode', 'numeric');
  inp.setAttribute('maxlength', '10');
  inp.setAttribute('placeholder', 'dd/mm/yyyy');
  inp.setAttribute('pattern', '\\d{2}/\\d{2}/\\d{4}');
  inp.title = 'Format: dd/mm/yyyy';
  inp.classList.add('dateinput');
  inp.value = ISO_RE.test(iso) ? isoToDMY(iso) : '';
  addDatePicker(inp);
}
/* Typing dd/mm/yyyy on a phone keypad is fiddly, so each date field also gets a 📅 button.
   A real (invisible) type=date input sits on top of it: tapping that opens the device's own
   calendar — no showPicker() support needed. It carries no name, so forms never submit it. */
function addDatePicker(inp) {
  if (inp.parentElement?.classList.contains('datefield')) return;
  const wrap = document.createElement('span');
  wrap.className = 'datefield';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const btn = document.createElement('span');
  btn.className = 'dpbtn';
  btn.textContent = '📅';
  const native = document.createElement('input');
  native.className = 'dpnative';       // checked by upgradeDateInput/sweepDates so it stays a real date input
  native.type = 'date';
  native.tabIndex = -1;
  native.setAttribute('aria-label', 'Pick a date');
  native.title = 'Pick a date';
  wrap.append(btn, native);
  // seed the picker with whatever is typed, so it opens on that month
  native.addEventListener('focus', () => { const m = DMY_RE.exec(inp.value); native.value = m ? `${m[3]}-${m[2]}-${m[1]}` : ''; });
  native.addEventListener('change', () => {
    if (!native.value) return;
    inp.value = isoToDMY(native.value);
    inp.dispatchEvent(new Event('input', { bubbles: true }));  // live previews (e.g. credit preview) react
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function sweepDates(root) { root.querySelectorAll && root.querySelectorAll('input[type="date"]:not(.dpnative)').forEach(upgradeDateInput); }
// icon-only buttons (the ✕ deletes scattered across the app) have no text for a screen reader —
// give any that are just a glyph an aria-label, app-wide, without touching every call site
const ICON_LABELS = { '✕': 'Delete', '×': 'Delete', '✓': 'Done' };
function labelIconButtons(root) {
  const btns = root.matches?.('button') ? [root, ...root.querySelectorAll('button')] : [...(root.querySelectorAll?.('button') || [])];
  for (const b of btns) {
    if (b.getAttribute('aria-label') || b.querySelector('*')) continue; // already labelled, or not glyph-only
    const lbl = ICON_LABELS[b.textContent.trim()];
    if (lbl) b.setAttribute('aria-label', tr(lbl));
  }
}
// any data-table header with text becomes click-to-sort (arrow + pointer come from CSS)
function markSortableHeaders(root) {
  if (!root.querySelectorAll) return;
  for (const th of root.querySelectorAll('th')) if (th.textContent.trim()) th.dataset.sortable = '';
}
// eye icons for the password reveal toggle (currentColor so they follow the theme)
const EYE_SHOW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_HIDE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.6 6.6A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
// add a show/hide "eye" to every password field, app-wide, so anyone can check what they typed
function addPasswordEye(input) {
  if (input.dataset.pweye) return;
  input.dataset.pweye = '1';
  const wrap = document.createElement('span');
  wrap.className = 'pweye-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pweye';
  btn.setAttribute('aria-label', tr('Show password'));
  btn.innerHTML = EYE_SHOW;
  btn.onclick = () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.innerHTML = reveal ? EYE_HIDE : EYE_SHOW;
    btn.setAttribute('aria-label', tr(reveal ? 'Hide password' : 'Show password'));
  };
  wrap.appendChild(btn);
}
function addPasswordEyes(root) {
  if (root.matches && root.matches('input[type="password"]')) addPasswordEye(root);
  root.querySelectorAll?.('input[type="password"]').forEach(addPasswordEye);
}
/* The page description is clamped to two lines on a phone. Where that actually hides something,
   mark it so it gets the "more" chevron and opens on tap; where the text already fits, leave it
   alone rather than promising more than there is. */
function upgradeClampedText(root) {
  if (!isPhone()) return;
  const ps = [];
  if (root.matches?.('.pagehead p')) ps.push(root);
  root.querySelectorAll?.('.pagehead p').forEach((p) => ps.push(p));
  for (const p of ps) {
    if (p.dataset.clampchecked) continue;
    p.dataset.clampchecked = '1';
    if (p.scrollHeight <= p.clientHeight + 1) continue; // nothing hidden — no affordance needed
    p.classList.add('clampable');
    p.setAttribute('role', 'button');
    p.setAttribute('tabindex', '0');
    const toggle = () => p.classList.toggle('open');
    p.addEventListener('click', toggle);
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
}
/* A tab strip that scrolls has to say so. Seven money tabs on a phone showed three, with the rest
   241px off-screen and nothing to suggest they existed — so Debt and Year may as well not have been
   built. Two things fix that: the active tab scrolls itself into view (arrive on #money/debt and you
   see where you are), and the edge with tabs behind it gets a fade via [data-more]. */
function upgradeTabStrips(root) {
  const strips = [];
  if (root.matches?.('.tabs')) strips.push(root);
  root.querySelectorAll?.('.tabs').forEach((s) => strips.push(s));
  for (const strip of strips) {
    if (strip.dataset.scrollhint) continue; // a re-render replaces the node, so this never leaks
    strip.dataset.scrollhint = '1';
    const sync = () => {
      // 2px of slack: sub-pixel widths otherwise leave a permanent fade on a strip that fits
      const more = strip.scrollWidth - strip.clientWidth > 2;
      const left = more && strip.scrollLeft > 2;
      const right = more && strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 2;
      strip.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : '';
    };
    strip.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
    // Switching tabs usually moves the .active class without rebuilding the strip, so scrolling
    // only on creation left a half-cut "Credite" as the selected tab. Do it on click as well —
    // after a frame, so it measures the layout the re-render actually produced.
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      requestAnimationFrame(() => { b.scrollIntoView({ block: 'nearest', inline: 'center' }); sync(); });
    });
    // Deferred a frame so the strip is laid out before it is measured. `inline: 'center'` rather
    // than 'nearest': the strip is scroll-snapped, and a tab hanging 5px off the edge asks for a
    // 5px correction that proximity-snapping immediately undoes — centring clears the snap point.
    requestAnimationFrame(() => {
      strip.querySelector('button.active, button[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'center' });
      sync();
    });
    sync();
  }
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches && n.matches('input[type="date"]:not(.dpnative)')) upgradeDateInput(n);
    sweepDates(n);
    translateSubtree(n);
    labelIconButtons(n);
    markSortableHeaders(n);
    addPasswordEyes(n);
    upgradeTabStrips(n);
    upgradeClampedText(n);
  }
}).observe(app, { childList: true, subtree: true });
// click a column header to sort its table: dates (dd/mm/yyyy), RO-formatted amounts
// (1.234,56) and plain text all order correctly; clicking again flips the direction.
// A detail row — the inline edit form or an opened payment history — always travels with the data
// row above it. They are the full-width `<td colspan>` rows, whether currently shown or hidden;
// testing for `hidden` alone let an OPEN history panel sort itself away from its bill.
const isDetailRow = (tr) => !tr.classList.contains('daysep')
  && (tr.hidden || (tr.cells.length === 1 && tr.cells[0].hasAttribute('colspan')));
app.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sortable]');
  if (!th) return;
  const table = th.closest('table'); const tbody = table?.tBodies[0];
  if (!tbody) return;
  // day headers only mean something in date order — sorting by amount or category retires them
  tbody.querySelectorAll('tr.daysep').forEach((r) => r.remove());
  const idx = [...th.parentNode.children].indexOf(th);
  const dir = th.dataset.sort === 'asc' ? 'desc' : 'asc';
  table.querySelectorAll('th').forEach((h) => { delete h.dataset.sort; h.removeAttribute('aria-sort'); });
  th.dataset.sort = dir;
  th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
  const groups = [];
  for (const tr of [...tbody.rows]) {
    if (groups.length && isDetailRow(tr)) groups[groups.length - 1].push(tr);
    else groups.push([tr]);
  }
  const key = (g) => {
    const t = g[0].cells[idx]?.textContent.trim() || '';
    const dm = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) return Number(`${dm[3]}${dm[2]}${dm[1]}`);
    if (/\d/.test(t)) {
      const num = parseFloat(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (!Number.isNaN(num)) return num;
    }
    return t.toLowerCase();
  };
  const sign = dir === 'asc' ? 1 : -1;
  groups
    .map((g) => [key(g), g])
    .sort(([a], [b]) => {
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
      return String(a).localeCompare(String(b)) * sign; // mixed columns fall back to text order
    })
    .forEach(([, g]) => g.forEach((tr) => tbody.appendChild(tr)));
});
// Esc closes the mobile "More" sheet when it's open (installed once, reads the live element)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const sheet = $('#moresheet');
  if (sheet && !sheet.hidden) { sheet.hidden = true; $('#moretab')?.setAttribute('aria-expanded', 'false'); }
  app.querySelectorAll('.rowmenu-pop:not([hidden])').forEach(closeRowMenu);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.classList || !t.classList.contains('dateinput')) return;
  const d = t.value.replace(/\D/g, '').slice(0, 8);
  t.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
});

/* read-only share links (invite, calendar) select themselves on tap for easy copying —
   a delegated listener because inline onclick attributes are blocked by the CSP */
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('selectall')) e.target.select();
});

/* money fields: a number input can't carry thousands separators, so echo the grouped value under
   it. 247500 and 24750 are one keystroke and one glance apart otherwise. */
const AMOUNT_FIELDS = 'input[type="number"][name="amount"], input[type="number"][name="principal"], input[type="number"][name="target"], input[type="number"][name="mortgage_payment"], input[type="number"][name="rent_amount"]';
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches(AMOUNT_FIELDS) || !t.parentElement) return;
  let hint = t.parentElement.querySelector(':scope > .amounthint');
  const v = Number(t.value);
  if (!t.value || !isFinite(v) || v === 0) { if (hint) hint.remove(); return; }
  if (!hint) { hint = document.createElement('small'); hint.className = 'amounthint'; t.parentElement.appendChild(hint); }
  hint.textContent = money(v);
});

/* double-submit guard: on a slow phone connection a double-tap on "Add" fires the handler twice
   before the first request returns, creating duplicate expenses/bills. The second submit is
   swallowed while the first is still in flight (capture phase, before any handler runs), and the
   button is greyed out. Handlers re-render and replace the form; the timeout clears the flag if a
   request fails without re-rendering, so a form is never left permanently dead. */
const submitting = new WeakSet();
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (submitting.has(f)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  submitting.add(f);
  const btn = f.querySelector('button:not([type="button"])') || f.querySelector('.btn');
  if (btn) btn.disabled = true;
  setTimeout(() => { submitting.delete(f); if (btn) btn.disabled = false; }, 4000);
}, true);

/* pull-to-refresh, installed app only: standalone mode has no browser reload button, so stale
   data would have no escape hatch. Pull down from the very top past the threshold and release. */
(() => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!standalone || !('ontouchstart' in window)) return;
  const THRESHOLD = 70;
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<span class="ptr-spin" aria-hidden="true"></span>';
  document.body.appendChild(ind);
  let startY = null;
  document.addEventListener('touchstart', (e) => {
    // only arm when the page is at the very top and no overlay is open
    startY = document.scrollingElement.scrollTop <= 0 && !$('#genmodal') ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const d = e.touches[0].clientY - startY;
    if (d <= 0) { ind.style.transform = ''; ind.classList.remove('armed'); return; }
    const pull = Math.min(d / 2, THRESHOLD + 20); // resistance: indicator moves half the finger
    ind.style.transform = `translateX(-50%) translateY(${pull}px) rotate(${pull * 3}deg)`;
    ind.classList.toggle('armed', pull >= THRESHOLD);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (startY != null && ind.classList.contains('armed')) {
      ind.classList.add('go');
      location.reload();
    } else {
      ind.style.transform = ''; ind.classList.remove('armed');
    }
    startY = null;
  }, { passive: true });
})();

boot();
