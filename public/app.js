/* Family Hub SPA */
// registered here rather than inline in index.html: the CSP forbids inline scripts
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
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
  // navigation: the phone tab bar + the "More" sheet
  'Money': 'Bani', 'More': 'Mai mult', 'Search': 'Căutare',
  // search page
  'Across expenses, income, bills, acte, credits, cars, properties and lists.': 'Prin cheltuieli, venituri, facturi, acte, credite, mașini, proprietăți și liste.',
  'Type at least 2 characters.': 'Scrie cel puțin 2 caractere.', 'Nothing found': 'Nimic găsit',
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
  'Savings goals': 'Obiective de economisire', 'Goal': 'Obiectiv', 'Add goal': 'Adaugă obiectiv',
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
  'Save profile': 'Salvează profilul', 'Birthday': 'Zi de naștere', 'Phone number': 'Număr de telefon',
  "Children's pictures": 'Pozele copiilor', 'Upload': 'Încarcă',
  // family
  'Invite someone': 'Invită pe cineva', 'Copy code': 'Copiază codul', 'Copy link': 'Copiază linkul', 'Generate new code': 'Generează cod nou',
  'Members': 'Membri', 'Add a child (no account)': 'Adaugă un copil (fără cont)', 'Add child': 'Adaugă copil',
  'Family settings': 'Setări familie', 'Currency': 'Monedă', 'Send invite': 'Trimite invitația', 'Role': 'Rol', 'no login': 'fără cont',
  // alerts
  'Alerts': 'Alerte', 'Mark all as read': 'Marchează toate ca citite', 'Browser notifications': 'Notificări în browser',
  // lists
  'Lists': 'Liste', 'Buy wishlist': 'De cumpărat', 'Travel wishlist': 'Călătorii', 'Grocery list': 'Cumpărături',
  'Personal targets': 'Obiective personale', 'Wishlists, groceries and personal goals for the whole family.': 'Liste de dorințe, cumpărături și obiective personale pentru toată familia.',
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
  // dashboard
  'Add bills, vehicle or property deadlines and they will line up here.': 'Adaugă facturi sau termene pentru vehicule și proprietăți și vor apărea aici.',
  'Nothing assigned to this person is coming up.': 'Nimic atribuit acestei persoane nu urmează.',
  'Spent': 'Cheltuit', 'Spending by category': 'Cheltuieli pe categorii', 'Budget vs actual': 'Buget vs realizat',
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
  '1 month in advance (principal + 1%)': 'O lună în avans (principal + 1%)', 'Balance today': 'Sold azi', 'Payoff': 'Achitare', 'mo left': 'luni rămase',
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
  'Rent (RON/mo, if rented out)': 'Chirie (RON/lună, dacă e închiriată)', 'Rent due day (1-28)': 'Ziua scadenței chiriei (1-28)', 'Rent (RON/mo)': 'Chirie (RON/lună)',
  'Meter reading day (1-28)': 'Ziua citirii contoarelor (1-28)', 'Meters to read monthly': 'Contoare de citit lunar',
  '— none —': '— niciunul —', 'Electricity + gas': 'Electricitate + gaz', 'Electricity + gas + water': 'Electricitate + gaz + apă',
  'Payment link (Revolut.me)': 'Link de plată (Revolut.me)', 'Mortgage': 'Ipotecă', 'on day': 'în ziua',
  'Maintenance': 'Întreținere', 'Renovation': 'Renovare', 'Utility': 'Utilitate', 'Rent (income)': 'Chirie (venit)', 'Other income': 'Alt venit',
  'Cost paid by': 'Cost plătit de', 'Owner / family': 'Proprietar / familie', 'Tenant — bill to': 'Chiriaș — facturează pe',
  'Costs (maintenance, utility…) are also logged as an expense for the chosen person; "Tenant" bills the tenant instead.':
    'Costurile (întreținere, utilități…) se înregistrează și ca cheltuială pentru persoana aleasă; „Chiriaș” îl facturează pe chiriaș.',
  'Money in this property:': 'Bani în această proprietate:', 'Net': 'Net',
  'No properties yet': 'Nicio proprietate încă', 'Add your home above to track its deadlines and costs.': 'Adaugă locuința mai sus pentru a urmări termenele și costurile.',
  // tenant & rent box
  'Rent:': 'Chirie:', '/ month, due day': '/ lună, scadentă pe', 'the rent charge is generated automatically once a tenant has joined.': 'chiria se generează automat după ce chiriașul s-a alăturat.',
  'No rent set — use': 'Nicio chirie setată — folosește', 'to set the monthly rent and due day.': 'pentru a seta chiria lunară și ziua scadenței.',
  'Tenant code:': 'Cod chiriaș:', 'No tenant code yet.': 'Niciun cod de chiriaș încă.', 'Generate code': 'Generează cod',
  'Your tenant registers with it on the sign-in screen →': 'Chiriașul se înregistrează cu el pe ecranul de autentificare →',
  'tab. They only see the charges below — nothing else.': 'tab. Vede doar costurile de mai jos — nimic altceva.',
  'Tenants': 'Chiriași', 'No tenant has joined yet.': 'Niciun chiriaș nu s-a alăturat încă.',
  'Rent (extra)': 'Chirie (suplimentar)', 'Title': 'Titlu', 'Invoice file (PDF/photo)': 'Fișier factură (PDF/poză)', 'Share with tenant': 'Trimite chiriașului',
  'What': 'Ce', 'pending — tenant marked paid': 'în așteptare — chiriașul a marcat plătit', 'Confirm paid': 'Confirmă plata', 'Reject': 'Respinge',
  'Nothing shared with the tenant yet.': 'Nimic trimis chiriașului încă.', 'Meter readings': 'Citiri contoare',
  'Scheduled:': 'Programat:', 'of every month (tenant gets an email).': 'a fiecărei luni (chiriașul primește email).',
  'No monthly schedule — set "Meter reading day" and the meters via': 'Fără program lunar — setează „Ziua citirii contoarelor” și contoarele din',
  ', or request one now.': 'sau cere una acum.', 'Request now:': 'Cere acum:',
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
  'Generated automatically when a bill or deadline gets within 30, 14, 7 or 1 days — or goes overdue. Shared by the whole family; read status is yours.':
    'Generate automat când o factură sau un termen ajunge la 30, 14, 7 sau 1 zile — sau întârzie. Comune întregii familii; starea de citit e a ta.',
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
let LANG = 'en';
function applyLang() { LANG = (ME && ME.lang) || 'en'; document.documentElement.lang = LANG; }
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

function toast(msg, action) {
  const t = $('#toast');
  clearTimeout(t._h);
  if (action) {
    // toast with an inline button (used for Undo)
    t.textContent = '';
    const span = document.createElement('span'); span.textContent = tr(msg);
    const btn = document.createElement('button'); btn.className = 'toastbtn'; btn.textContent = tr(action.label || 'Undo');
    btn.onclick = () => { t.hidden = true; clearTimeout(t._h); action.onAction(); };
    t.append(span, btn);
    t.hidden = false;
    t._h = setTimeout(() => (t.hidden = true), action.duration || 5000);
  } else {
    t.textContent = tr(msg); t.hidden = false;
    t._h = setTimeout(() => (t.hidden = true), 2600);
  }
}
// Generic modal: content is a full markup string appended inside #app (not document.body) so it
// still goes through the RO-translation MutationObserver and the date-input upgrade pass.
function openModal(innerHtml) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modalwrap'; wrap.id = 'genmodal';
  wrap.innerHTML = `<div class="modalbg"></div><div class="modalcard">
    <button class="modalclose" aria-label="Close">✕</button>${innerHtml}</div>`;
  wrap.querySelector('.modalbg').onclick = closeModal;
  wrap.querySelector('.modalclose').onclick = closeModal;
  app.appendChild(wrap);
  return wrap;
}
function closeModal() { $('#genmodal')?.remove(); }
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
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
/* An "Add …" form sitting open at the top of a page pushed the actual data 1–2 screens down on a
   phone. Collapse it there; a desktop has room for it to stay open. The "+" is its own element so
   the label beside it still matches the RO dictionary exactly. */
const wideScreen = () => window.innerWidth > 860;
function addBox(title, inner, forceOpen) {
  return `<details class="card addbox" ${(wideScreen() || forceOpen) ? 'open' : ''}>
    <summary><span class="plus" aria-hidden="true">+</span> ${title}</summary>
    <div class="addbody">${inner}</div></details>`;
}
function daysClass(d) { return d < 0 ? 'late' : d <= 14 ? 'warn' : ''; }
// auto-paid subscriptions take care of themselves — list them, but without the
// amber/red "this needs you" colour that every other deadline gets
function remClass(r) { return r.auto_pay ? '' : daysClass(r.days_left); }
function daysLabel(d) {
  if (LANG === 'ro') return d < 0 ? `întârziat ${-d}z` : d === 0 ? 'azi' : `în ${d}z`;
  return d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`;
}

/* ---------- router ---------- */
const routes = { dashboard: viewDashboard, money: viewMoney, bills: viewBills, search: viewSearch, vehicles: viewVehicles, properties: viewProperties, acte: viewActe, lists: viewLists, import: viewImport, alerts: viewAlerts, family: viewFamily, settings: viewSettings };
window.addEventListener('hashchange', render);

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
      if (browserNotifOn()) for (const n of fresh.slice(0, 3)) {
        const note = new Notification(n.title, { body: n.body || '' });
        // clicking it used to just focus the tab wherever it was — now it jumps to the page the alert is about
        note.onclick = () => { window.focus(); if (n.url) location.hash = n.url.replace(/^\/?#?/, ''); note.close(); };
      }
    }
  } catch { /* signed out or offline; badge just stays */ }
}
setInterval(pollNotifications, 60000);

function applyTheme() { document.documentElement.dataset.theme = (ME && ME.theme) || 'light'; }
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
function render() {
  flushPendingDelete(); // a pending undo-delete commits before the page it lived on is torn down
  if (location.hash.startsWith('#reset=')) return renderReset();
  if (!ME) return renderAuth();
  applyTheme(); applyLang();
  if (ME.role === 'tenant') return renderTenantPortal();
  const page = (location.hash || '#dashboard').slice(1);
  if (page !== 'money') EXP_FORM_OPEN = false; // leaving Money → next visit shows data first, not a form
  const fn = routes[page] || viewDashboard;
  app.innerHTML = shell(page);
  app.querySelectorAll('[data-logout]').forEach((b) => (b.onclick = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; renderAuth(); }));
  const sheet = $('#moresheet');
  const closeSheet = () => (sheet.hidden = true);
  $('#moretab').onclick = () => (sheet.hidden = !sheet.hidden);
  sheet.querySelectorAll('[data-close], .sheetlink').forEach((x) => x.addEventListener('click', closeSheet));
  // floating +: one tap to log an expense from anywhere, straight into a focused Amount
  $('#fab')?.addEventListener('click', () => {
    EXP_FORM_OPEN = true; FOCUS_AMOUNT = true; PENDING_MONEY_TAB = 'expenses';
    if (page === 'money') viewMoney($('#page'), 'expenses'); else location.hash = '#money';
  });
  fn($('#page'));
  pollNotifications();
}
const NAV = [
  ['dashboard', '⌂', 'Dashboard'], ['money', '₤', 'Budget & expenses'], ['bills', '☰', 'Bills'],
  ['search', '⌕', 'Search'],
  ['vehicles', '⛟', 'Vehicles'], ['properties', '⌂', 'Properties'], ['acte', '❏', 'Acte'], ['lists', '☑', 'Lists'],
  ['import', '⇪', 'Bank import'], ['alerts', '◉', 'Alerts'], ['family', '☺', 'Family'], ['settings', '⚙', 'Settings'],
];
// the four that earn a permanent spot on a phone; everything else lives behind "More".
// Alerts is here on purpose: its badge used to sit ~680px off-screen in the old scrolling strip,
// which made the whole alerts feature invisible on a phone.
const TABS = [['dashboard', '⌂', 'Dashboard'], ['money', '₤', 'Money'], ['bills', '☰', 'Bills'], ['alerts', '◉', 'Alerts']];
const badgeHtml = () => `<span class="notifbadge" ${NOTIF.unread ? '' : 'hidden'}>${NOTIF.unread}</span>`;
function shell(active) {
  const inTabs = (k) => TABS.some(([t]) => t === k);
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${esc(FAMILY.name)}</small></div>
      ${NAV.map(([k, ic, l]) => `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}"><span aria-hidden="true">${ic}</span>${l}${k === 'alerts' ? badgeHtml() : ''}</a>`).join('')}
      <div class="spacer"></div>
      <a class="whoami row" href="#settings" style="text-decoration:none;color:inherit;gap:8px">${avatarHtml(ME)}<span><b>${esc(ME.name)}</b>${tr(ME.role)} · ${esc(ME.email || '')}</span></a>
      <button class="navlink" data-logout>↩ Sign out</button>
    </nav>
    <main class="main" id="page"></main>
    ${canWrite() && active !== 'money' ? `<button class="fab" id="fab" aria-label="Add expense" title="Add expense">+</button>` : ''}
    <nav class="tabbar">
      ${TABS.map(([k, ic, l]) => `<a class="tab ${k === active ? 'active' : ''}" href="#${k}">
        <span class="ic" aria-hidden="true">${ic}${k === 'alerts' ? badgeHtml() : ''}</span><span class="tl">${l}</span></a>`).join('')}
      <button class="tab ${inTabs(active) ? '' : 'active'}" id="moretab"><span class="ic" aria-hidden="true">⋯</span><span class="tl">More</span></button>
    </nav>
    <div class="sheet" id="moresheet" hidden>
      <div class="sheetbg" data-close></div>
      <div class="sheetbody">
        <div class="sheetgrid">
          ${NAV.filter(([k]) => !inTabs(k)).map(([k, ic, l]) => `<a class="sheetlink ${k === active ? 'active' : ''}" href="#${k}"><span class="ic" aria-hidden="true">${ic}</span>${l}</a>`).join('')}
        </div>
        <button class="btn ghost" style="width:100%;margin-top:12px" data-logout>↩ Sign out</button>
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
  ['dashboard', '⌂', 'Dashboard'],
  ['invoices', '₤', 'Invoices'],
  ['maintenance', '⚒', 'Maintenance'],
  ['account', '⚙', 'Settings'],
];
function tenantShell(active, prop) {
  return `<div class="shell">
    <nav class="sidebar">
      <div class="brand">Family Hub<small>${tr('Tenant')} · ${esc(prop.name)}</small></div>
      ${TENANT_NAV.map(([k, ic, l]) => `<a class="navlink ${k === active ? 'active' : ''}" href="#${k}"><span aria-hidden="true">${ic}</span>${tr(l)}</a>`).join('')}
      <div class="spacer"></div>
      <a class="whoami row" href="#account" style="text-decoration:none;color:inherit;gap:8px">${avatarHtml(ME)}<span><b>${esc(ME.name)}</b>${tr('Tenant')} · ${esc(ME.email || '')}</span></a>
      <button class="navlink" data-logout>↩ Sign out</button>
    </nav>
    <main class="main" id="page"></main>
    <nav class="tabbar">
      ${TENANT_NAV.map(([k, ic, l]) => `<a class="tab ${k === active ? 'active' : ''}" href="#${k}">
        <span class="ic" aria-hidden="true">${ic}</span><span class="tl">${tr(l)}</span></a>`).join('')}
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
  const unpaidTotal = unpaid.reduce((s, c) => s + c.amount, 0);
  const overdue = unpaid.filter((c) => c.due_date < t).length;
  const pendingMeters = (data.meters || []).filter((m) => m.status === 'pending');
  const doneMeters = (data.meters || []).filter((m) => m.status === 'done').slice(0, 5);
  const openMaint = (data.maintenance || []).filter((m) => m.status !== 'done').length;
  el.innerHTML = `<div class="pagehead"><div><h1>Dashboard</h1>
      <p>${esc(data.property.name)}${data.property.address ? ' — ' + esc(data.property.address) : ''}</p></div></div>
    <section class="kpi">
      <a class="card clickcard" href="#invoices"><div class="label">${tr('Amount due')}</div><div class="value ${unpaidTotal > 0 ? 'neg' : ''}">${money(unpaidTotal)}</div>
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
  const unpaidTotal = data.charges.filter((c) => c.status === 'unpaid').reduce((s, c) => s + c.amount, 0);
  el.innerHTML = `<div class="pagehead"><div><h1>${tr('Invoices')}</h1><p>${esc(data.property.name)}</p></div>
      ${unpaidTotal > 0 ? `<div class="row" style="gap:8px;align-items:baseline"><span class="muted">${tr('Amount due')}</span><b class="amount" style="font-size:18px">${money(unpaidTotal)}</b></div>` : ''}</div>
    <div class="card">
    ${data.charges.length ? `<table><thead><tr><th>Due</th><th>What</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${data.charges.map((c) => {
        const late = c.status === 'unpaid' && c.due_date < t;
        return `<tr>
          <td>${fdate(c.due_date)}${late ? ' <span class="badge late">overdue</span>' : ''}</td>
          <td><b>${esc(c.title)}</b>${c.type === 'rent' ? ' <span class="muted">· rent</span>' : ''}${c.attachment ? ` · <a href="/api/tenant/charges/${c.id}/attachment" target="_blank">invoice</a>` : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}</td>
          <td class="right amount">${money(c.amount)}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">${tr('paid')}${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">confirmation pending</span>`
            : `<span class="badge unpaid">to pay</span>`}</td>
          <td class="right">${c.status === 'unpaid' ? `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap;white-space:nowrap">${payLink ? `<a class="btn ghost small revolut" href="${esc(payLink)}" target="_blank" rel="noopener" title="Pay with Revolut">Pay ${REVOLUT_MARK}</a>` : ''}<button class="btn small" data-pay="${c.id}">Mark as paid</button></span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`
    : `<div class="empty"><b>Nothing to pay yet</b>Rent and shared invoices from your landlord will appear here.</div>`}
    <p class="muted" style="margin-bottom:0">After you mark something as paid, the owner confirms it — until then it shows as "confirmation pending".</p>
    </div>`;
  app.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
    try { await api(`/tenant/charges/${b.dataset.pay}/pay`, { method: 'POST' }); toast('Marked as paid — waiting for owner confirmation'); renderTenantPortal(); }
    catch (err) { toast(err.message); }
  }));
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
        <td><b>${esc(m.title)}</b>${m.note ? `<br><span class="muted">${esc(m.note)}</span>` : ''}</td>
        <td>${m.photo ? `<a href="/api/tenant/maintenance/${m.id}/photo" target="_blank">photo</a>` : '<span class="muted">—</span>'}</td>
        <td>${m.status === 'done' ? `<span class="badge paid">${tr('Fixed')}${m.resolved_at ? ' ' + fdate(m.resolved_at) : ''}</span>` : `<span class="badge unpaid">${tr('Open')}</span>`}</td>
      </tr>`).join('')}</tbody></table>` : `<p class="muted" style="margin-bottom:0">No maintenance requests yet.</p>`}
    </div>`;
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
      toast('Request sent — the owner has been notified'); renderTenantPortal();
    } catch (err) { toast(err.message); }
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
      <div class="row">${['light', 'dark'].map((tm) => `<button class="btn ${(ME.theme || 'light') === tm ? '' : 'ghost'} small" data-ttheme="${tm}">${tm === 'light' ? '☀ Light' : '🌙 Dark'}</button>`).join('')}</div>
      <p class="muted" style="margin:14px 0 6px">Language</p>
      <div class="row">${[['en', '🇬🇧 English'], ['ro', '🇷🇴 Română']].map(([lg, lb]) => `<button class="btn ${(ME.lang || 'en') === lg ? '' : 'ghost'} small" data-tlang="${lg}">${lb}</button>`).join('')}</div></div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">Password</h3>
      <p class="muted" style="margin-top:0">Changing it signs you out on every other device.</p>
      <button class="btn small" id="tpwbtn">Change password</button></div>
    <button class="btn ghost small" data-logout style="margin-top:16px">↩ Sign out</button>`;
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
  $('#dashview').onchange = (e) => { DASH_VIEW = e.target.value; viewDashboard(el); };
  $('#dashperiod').onchange = (e) => { DASH_MONTHS = Number(e.target.value); viewDashboard(el); };
  const userQ = DASH_VIEW === 'all' ? '' : `&user=${DASH_VIEW}`;
  const [reminders, stats, budgets, rent, savings] = await Promise.all([
    api(`/reminders?days=60${userQ}`), api(`/stats?months=${DASH_MONTHS}${userQ}`), api('/budgets'),
    api('/rent-status').catch(() => []), api('/savings').catch(() => ({ goals: [] })),
  ]);
  const net = stats.income - stats.spent;
  const spentMap = Object.fromEntries(budgets.spent.map((s) => [s.category, s.spent]));
  const scopeNote = DASH_VIEW === 'all' ? '' : ` <span class="muted">· ${esc((members.find((m) => String(m.id) === String(DASH_VIEW)) || {}).name || '')}</span>`;
  const periodLabel = PERIOD_LABELS[DASH_MONTHS];
  // a brand-new family lands on a dashboard of zeroes with nothing telling them where to begin
  const blank = !reminders.length && !stats.byCategory.length && !stats.income && !stats.spent && !budgets.budgets.length;
  $('#dash').innerHTML = `
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
        <div class="stub ${remClass(r)}">
          <div class="days">${daysLabel(r.days_left)}</div>
          <div class="what">${esc(r.label)}</div>
          <div class="who">${esc(r.entity || '')} · ${fdate(r.date)}${r.amount ? ` · <span class="amount">${money(r.amount)}</span>` : ''}</div>
        </div>`).join('')}</div>`
      : `<div class="card empty"><b>Nothing due soon</b>${DASH_VIEW === 'all' ? 'Add bills, vehicle or property deadlines and they will line up here.' : 'Nothing assigned to this person is coming up.'}</div>`}
    </section>
    <section class="kpi" style="margin-top:18px">
      <a class="card clickcard" href="#money" data-tab="income"><div class="label">${tr('Income')} · ${esc(tr(periodLabel))}</div><div class="value">${money(stats.income)}</div>${deltaHtml(stats.income, stats.prev?.income, 'up-good')}</a>
      <a class="card clickcard" href="#money" data-tab="expenses"><div class="label">${tr('Spent')} · ${esc(tr(periodLabel))}</div><div class="value">${money(stats.spent)}</div>${deltaHtml(stats.spent, stats.prev?.spent, 'up-bad')}</a>
      <div class="card"><div class="label">Left over</div><div class="value ${net < 0 ? 'neg' : ''}">${money(net)}</div>${deltaHtml(net, (stats.prev?.income ?? 0) - (stats.prev?.spent ?? 0), 'up-good')}</div>
    </section>
    ${rentHtml(rent)}
    <section class="grid2" style="margin-top:18px">
      <div class="card"><h3>${tr('Spending by category')} · ${esc(tr(periodLabel))}</h3><div class="chartbox"><canvas id="catChart"></canvas></div></div>
      <div class="card"><h3>Income vs spending</h3><div class="chartbox"><canvas id="trendChart"></canvas></div></div>
    </section>
    <section class="card" style="margin-top:18px">
      <h3>${tr('Budget vs actual')} · ${budgets.month}</h3>
      ${budgets.budgets.length ? budgets.budgets.map((b) => {
        const s = spentMap[b.category] || 0; const pct = Math.min(100, (s / b.amount) * 100 || 0);
        return `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between">
          <span>${esc(b.category)}</span><span class="amount muted">${money(s)} / ${money(b.amount)}</span></div>
          <div class="bar"><i class="${s > b.amount ? 'over' : ''}" style="width:${pct}%"></i></div></div>`;
      }).join('') : `<p class="muted">No budgets set for this month yet — set them in <a href="#money">Budget & expenses</a>.</p>`}
    </section>
    ${goalsHtml(savings.goals)}
    <section class="card" id="dashcal" style="margin-top:18px"><div class="skel" style="height:260px"></div></section>`;
  $('#dash').querySelectorAll('[data-tab]').forEach((a) => a.addEventListener('click', () => { PENDING_MONEY_TAB = a.dataset.tab; }));
  drawCharts(stats, DASH_VIEW, DASH_MONTHS);
  renderCalendar($('#dashcal'), true);
}
/* A number on its own says little: 5.589 spent is only meaningful next to what it usually is.
   `sense` says which direction is good, so spending more reads amber and earning more reads green.
   The sentence is written out per language rather than glued together from single words — the
   dictionary is exact-match, and "more" already means "altele" ("+2 more" on the calendar). */
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
function drawCharts(stats, scopeView = 'all', scopeMonths = 1) {
  const css = getComputedStyle(document.documentElement);
  const val = (v, f) => css.getPropertyValue(v).trim() || f;
  const inkSoft = val('--ink-soft', '#666'), line = val('--line', '#ddd');
  const cardBg = val('--card', '#fff'), accent = val('--accent', '#2f6b5a'), red = val('--red', '#b23a2e');
  const dark = document.documentElement.dataset.theme === 'dark';
  if (window.Chart) {
    Chart.defaults.color = inkSoft;
    Chart.defaults.borderColor = line;
    Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
  }
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  // legend chips as small dots, matching the pill/badge language elsewhere
  const legendDots = { labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 } };
  // brighter category palette on the dark card so the slices don't go muddy
  const colors = dark
    ? ['#57b394', '#e0a13d', '#7ea6cf', '#e06a5c', '#a98fce', '#5fae6f', '#c3a06a', '#9db0a9', '#cf8a5f', '#79b3cf']
    : ['#2f6b5a', '#c98a2d', '#5b7fa6', '#b23a2e', '#7c5ba6', '#3e7c4f', '#8a6d3b', '#45565f', '#a0522d', '#4a8fb0'];
  // clicking a category slice opens Expenses filtered to that category, keeping the dashboard's scope
  const drillTo = (cat) => {
    PENDING_MONEY_TAB = 'expenses';
    PENDING_EXPENSE_FILTER = { cat, who: scopeView === 'all' ? 'all' : String(scopeView), month: scopeMonths === 1 ? thisMonth() : 'all' };
    location.hash = '#money';
  };
  const cc = $('#catChart'); let catChart;
  const cats = stats.byCategory.map((c) => c.category); // untranslated keys for the drill-down filter
  if (cc && stats.byCategory.length) { catChart = new Chart(cc, {
    type: 'doughnut',
    data: { labels: cats.map(tr), datasets: [{ data: stats.byCategory.map((c) => c.total), backgroundColor: colors, borderColor: cardBg, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'right', ...legendDots, onClick: (e, item) => drillTo(cats[item.index]) } },
      onClick: (e, els) => { if (els.length) drillTo(cats[els[0].index]); },
    },
  }); cc.style.cursor = 'pointer'; }
  else if (cc) cc.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: tr('No expenses this month yet.') }));
  const months = [...new Set([...stats.trend.map((t) => t.m), ...stats.incomeTrend.map((t) => t.m)])].sort();
  const tc = $('#trendChart'); if (tc && months.length) new Chart(tc, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: tr('Spent'), data: months.map((m) => stats.trend.find((t) => t.m === m)?.total || 0), backgroundColor: red, borderRadius: 5, maxBarThickness: 30 },
        { label: tr('Income'), data: months.map((m) => stats.incomeTrend.find((t) => t.m === m)?.total || 0), backgroundColor: accent, borderRadius: 5, maxBarThickness: 30 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: legendDots },
      scales: {
        y: { beginAtZero: true, border: { display: false }, grid: { color: line }, ticks: { font: { family: mono } } },
        x: { border: { display: false }, grid: { display: false } },
      },
    },
  });
  else if (tc) tc.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: tr('History appears once you log expenses.') }));
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
      ${evs.slice(0, 3).map((r) => `<div class="ev ${remClass(r)}" title="${esc(r.label + (r.entity ? ' — ' + r.entity : ''))}">${esc(r.label)}</div>`).join('')}
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
      ${[['expenses', 'Expenses'], ['income', 'Income'], ['budgets', 'Budgets'], ['credits', 'Credits'], ['savings', 'Savings']].map(([t, l]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${l}</button>`).join('')}
    </div><div id="moneybody">Loading…</div>`;
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewMoney(el, b.dataset.t)));
  const body = $('#moneybody');
  if (tab === 'expenses') { const f = PENDING_EXPENSE_FILTER || {}; PENDING_EXPENSE_FILTER = null; return moneyExpenses(body, f); }
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
// shared by "Add expense" and the inline edit row, so the two can never drift apart
function expenseFormFields(members, properties, vehicles, e = {}) {
  const link = e.property_id ? `property:${e.property_id}` : e.vehicle_id ? `vehicle:${e.vehicle_id}` : '';
  return `
    <div><label>Date</label><input name="date" type="date" value="${e.date || today()}" required></div>
    <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option value="${c}" ${(e.category ?? LAST_EXP_CAT) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div><label>Amount (${cur()})</label><input name="amount" type="number" step="0.01" min="0.01" value="${e.amount ?? ''}" required></div>
    <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${String(e.user_id ?? ME.id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    ${properties.length || vehicles.length ? `<div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
      ${properties.map((p) => `<option value="property:${p.id}" ${link === `property:${p.id}` ? 'selected' : ''}>⌂ ${esc(p.name)}</option>`).join('')}
      ${vehicles.map((v) => `<option value="vehicle:${v.id}" ${link === `vehicle:${v.id}` ? 'selected' : ''}>⛟ ${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    <div><label>Note</label><input name="note" placeholder="optional" value="${esc(e.note || '')}"></div>`;
}
// the combined link select unpacks into real columns; both keys are always written so
// clearing the link on edit actually clears it server-side
function unpackExpenseBody(b) {
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
  const rows = all.filter((e) =>
    (flt.month === 'all' || e.date.startsWith(flt.month)) &&
    (flt.who === 'all' || String(e.user_id) === String(flt.who)) &&
    (flt.cat === 'all' || e.category === flt.cat) &&
    (!q || (e.note || '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q)));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const reload = (patch) => moneyExpenses(body, { ...flt, ...patch });
  body.innerHTML = `
    ${canWrite() ? addBox('Add expense', `<form id="expform" class="formgrid">
      ${expenseFormFields(members, properties, vehicles)}
      <button class="btn">Add expense</button></form>`, EXP_FORM_OPEN) : ''}
    <details class="card addbox" style="margin-top:16px" ${wideScreen() ? 'open' : ''}><summary><span class="plus" aria-hidden="true">+</span> Recurring expenses</summary><div class="addbody">
      <p class="muted" style="margin-top:0">Fixed monthly costs that aren't bills — logged automatically every month on the chosen day.</p>
      ${recurring.length ? `<table><tbody>${recurring.map((r) => `<tr style="${r.active ? '' : 'opacity:.55'}">
        <td><b>${esc(r.note || tr(r.category))}</b> <span class="muted">· ${tr(r.category)} · ${esc(r.user_name || tr('whole family'))} · ${tr('day')} ${r.day}${r.property_name ? ` · ⌂ ${esc(r.property_name)}` : ''}${r.vehicle_name ? ` · ⛟ ${esc(r.vehicle_name)}` : ''}</span>${r.active ? '' : ' <span class="badge role">paused</span>'}</td>
        <td class="right amount">${money(r.amount)}<span class="muted">/${tr('mo')}</span></td>
        <td class="right">${canWrite() ? `<span class="rowacts"><button class="btn ghost small" data-rxtog="${r.id}">${r.active ? 'Pause' : 'Resume'}</button>
          <button class="btn danger small" data-rxdel="${r.id}">✕</button></span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${canWrite() ? `<form id="recxform" class="formgrid" style="margin-top:10px">
        <div><label>Category</label><select name="category">${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
        <div><label>Note</label><input name="note" placeholder="Grădiniță, asigurare…"></div>
        <div><label>Amount (${cur()}/mo)</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
        <div><label>Day of month</label><input name="day" type="number" min="1" max="28" value="1" required></div>
        <div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        ${properties.length || vehicles.length ? `<div><label>Link to (optional)</label><select name="link"><option value="">Nothing</option>
          ${properties.map((p) => `<option value="property:${p.id}">⌂ ${esc(p.name)}</option>`).join('')}
          ${vehicles.map((v) => `<option value="vehicle:${v.id}">⛟ ${esc(v.name)}</option>`).join('')}</select></div>` : ''}
        <button class="btn small">Add recurring</button></form>` : ''}
    </div></details>
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;gap:10px"><h3 style="margin:0">Expenses</h3><span class="amount"><b>${money(total)}</b></span></div>
      <div class="row" style="gap:8px;margin:10px 0;flex-wrap:wrap">
        ${whoFilter('wfilter', members, flt.who)}
        <select id="cfilter" style="width:150px"><option value="all" ${flt.cat === 'all' ? 'selected' : ''}>All categories</option>${CATEGORIES.map((c) => `<option value="${c}" ${flt.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input id="mfilter" type="month" value="${flt.month === 'all' ? '' : flt.month}" style="width:150px">
        <button class="btn ghost small" id="allmonths">${flt.month === 'all' ? '● All time' : 'All time'}</button>
        <input id="qfilter" type="search" placeholder="Search note…" value="${esc(flt.q)}" style="width:180px">
      </div>
      ${rows.length ? `<table class="cards"><thead><tr><th>Date</th><th>Category</th><th>By</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((e) => { const link = e.property_name ? `⌂ ${esc(e.property_name)}` : e.vehicle_name ? `⛟ ${esc(e.vehicle_name)}` : ''; return `<tr>
          <td data-label="Date">${fdate(e.date)}</td><td data-label="Category">${esc(e.category)}</td><td data-label="By">${esc(mname[e.user_id] || '—')}</td>
          <td data-label="Note">${esc(e.note || '')}${link ? `${e.note ? ' · ' : ''}<span class="muted">${link}</span>` : ''}</td>
          <td class="right amount" data-label="Amount">${money(e.amount)}</td>
          <td class="right"><span class="rowacts">${canWrite() ? `<button class="btn ghost small" data-edit="${e.id}">Edit</button>
            <button class="btn danger small" data-del="${e.id}">Delete</button>` : ''}</span></td></tr>
          <tr id="exprow-${e.id}" hidden><td colspan="6"></td></tr>`; }).join('')}
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
    const payload = unpackExpenseBody(Object.fromEntries(new FormData(e.target)));
    try {
      await api('/expenses', { method: 'POST', body: payload });
      LAST_EXP_CAT = payload.category;   // next entry defaults to the same category
      EXP_FORM_OPEN = true;              // stay open for the next one instead of collapsing
      FOCUS_AMOUNT = true;               // ...with the cursor already in Amount
      toast('Expense added'); reload();
    } catch (err) { toast(err.message); }
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
        <div><label>Day of month</label><input name="day" type="number" min="1" max="28" value="1" required></div>
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

/* ---------- savings / economy account & goals ---------- */
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
        return `<div style="margin-bottom:14px;${g.done ? 'opacity:.55' : ''}">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap">
            <span><b style="${g.done ? 'text-decoration:line-through' : ''}">${esc(g.title)}</b> <span class="muted">${g.user_name ? '· ' + esc(g.user_name) : '· family'}</span>
              ${reached && !g.done ? ' <span class="badge paid">reached!</span>' : ''}</span>
            <span class="row"><span class="amount muted">${money(g.saved)} / ${money(g.target)} (${Math.round(pct)}%)</span>
              ${canWrite() ? `<button class="btn ghost small" data-gtog="${g.id}">${g.done ? 'Reopen' : 'Mark done'}</button>
              <button class="btn danger small" data-gdel="${g.id}">✕</button>` : ''}</span></div>
          <div class="bar"><i style="width:${pct}%;${reached ? '' : ''}"></i></div>
        </div>`;
      }).join('') : `<p class="muted">No goals yet — set one below and tag deposits to it.</p>`}
      ${canWrite() ? `<form id="goalform" class="formgrid" style="margin-top:10px">
        <div><label>Goal</label><input name="title" placeholder="Vacanță 2027" required></div>
        <div><label>Target (${cur()})</label><input name="target" type="number" step="0.01" min="0.01" required></div>
        <div><label>Person</label><select name="user_id"><option value="">Whole family</option>${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
        <button class="btn small">Add goal</button></form>` : ''}
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
    <div><label>Linked property</label><select name="property_id"><option value="">None</option>${properties.map((p) => `<option value="${p.id}" ${String(c.property_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
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
      <div data-editbox hidden style="margin-top:12px"></div>
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
    box.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await api('/credits/' + c.id, { method: 'PUT', body: Object.fromEntries(new FormData(ev.target)) }); toast('Credit updated'); refresh(); }
      catch (err) { toast(err.message); }
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
      ${properties.map((p) => `<option value="property:${p.id}" ${link === `property:${p.id}` ? 'selected' : ''}>⌂ ${esc(p.name)}</option>`).join('')}
      ${vehicles.map((v) => `<option value="vehicle:${v.id}" ${link === `vehicle:${v.id}` ? 'selected' : ''}>⛟ ${esc(v.name)}</option>`).join('')}</select></div>
    <div style="align-self:center"><label style="display:inline-flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" name="auto_pay" value="1" ${b.auto_pay ? 'checked' : ''} style="width:auto"> Auto-paid subscription</label></div>`;
}
async function viewBills(el) {
  const [bills, members, properties, vehicles] = await Promise.all([api('/bills'), api('/family/members'), api('/properties'), api('/vehicles')]);
  const t = today();
  const recurLabel = (b) => (RECUR_OPTS.find(([v]) => v === recurValue(b)) || [])[1];
  el.innerHTML = `<div class="pagehead"><div><h1>Bills & invoices</h1><p>Electricity, gas, internet, water, taxes — with due dates, owner, attachments and payment history. Auto-paid subscriptions are marked paid automatically once due.</p></div></div>
    ${canWrite() ? addBox('Add bill', `<form id="billform" class="formgrid">
      ${billFormFields(members, properties, vehicles)}
      <button class="btn">Add bill</button></form>`) : ''}
    <div class="card" style="margin-top:16px" id="billlist">
      ${bills.length ? `<table class="cards"><thead><tr><th>Bill</th><th>Owner</th><th>Due</th><th class="right">Amount</th><th>Status</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${bills.map((b) => {
        const late = b.status === 'unpaid' && b.due_date < t;
        return `<tr>
          <td><b>${esc(b.name)}</b><br><span class="muted">${esc(b.provider || tr(BILL_CATS[b.category]) || '')}${recurValue(b) === '0' ? '' : ` · ${tr(recurLabel(b))}`}${b.auto_pay ? ' · auto-pay' : ''}${b.expense_category ? ` · ${tr(b.expense_category)}` : ''}${b.property_name ? ` · ⌂ ${esc(b.property_name)}` : ''}${b.vehicle_name ? ` · ⛟ ${esc(b.vehicle_name)}` : ''}</span></td>
          <td data-label="Owner">${esc(b.owner_name || 'Family')}</td>
          <td data-label="Due">${fdate(b.due_date)}</td>
          <td class="right amount" data-label="Amount">${money(b.amount)}</td>
          <td data-label="Status"><span class="badge ${late ? 'late' : b.status}">${tr(late ? 'overdue' : b.status)}</span></td>
          <td data-label="Invoice">${b.attachment ? `<a href="/api/bills/${b.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-attach="${b.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td class="right"><span class="rowacts">${canWrite() ? `
            ${b.status === 'unpaid' ? `<button class="btn small" data-pay="${b.id}" data-amt="${b.amount ?? ''}">Mark paid</button>` : ''}
            <button class="btn ghost small" data-edit="${b.id}">Edit</button>
            <button class="btn ghost small" data-hist="${b.id}">History</button>
            <button class="btn danger small" data-del="${b.id}">Delete</button>` : `<button class="btn ghost small" data-hist="${b.id}">History</button>`}</span></td>
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
    subtitle: [v.plate, `${tr('Owner')}: ${mname[v.owner_id] || tr('whole family')}`].filter(Boolean).join(' · '),
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
      ['payment_link', 'Payment link (Revolut.me)', 'text', 'https://revolut.me/...'],
    ]) : ''}
    <div id="proplist" style="margin-top:16px">${props.length ? '' : `<div class="card empty"><b>No properties yet</b>Add your home above to track its deadlines and costs.</div>`}</div>`;
  bindEntityForm('propform', '/properties', () => viewProperties(el));
  const list = $('#proplist');
  for (const p of props) {
    const tenants = tenantsByProp[p.id] || [];
    // who a cost record is attributed to: owner by default, any member, or (if rented) bill the tenant
    const attributeOpts = [['', p.owner_id ? `${tr('Owner')} (${esc(mname[p.owner_id] || '')})` : tr('Owner / family')],
      ...members.map((m) => [m.id, m.name]),
      ...(tenants.length ? [['tenant', `${tr('Tenant — bill to')} ${esc(tenants[0].name)}`]] : [])];
    list.appendChild(entityCard(p, {
      subtitle: [p.address, `${tr('Owner')}: ${mname[p.owner_id] || tr('whole family')}`, p.mortgage_lender ? `${tr('Mortgage')}: ${p.mortgage_lender}, ${money(p.mortgage_payment)} ${tr('on day')} ${p.mortgage_due_day ?? '—'}` : null].filter(Boolean).join(' · '),
      deadlines: P_DEADLINES, route: 'properties',
      editExtra: [['owner_id', 'Owner', 'select', ownerOpts], ['rent_amount', `Rent (${cur()}/mo)`, 'number'], ['rent_due_day', 'Rent due day (1-28)', 'number'],
        ['reading_day', 'Meter reading day (1-28)', 'number'],
        ['reading_utilities', 'Meters to read monthly', 'select', [['', '— none —'], ['electricity', 'Electricity'], ['gas', 'Gas'], ['water', 'Water'], ['electricity,gas', 'Electricity + gas'], ['electricity,gas,water', 'Electricity + gas + water']]],
        ['payment_link', 'Payment link (Revolut.me)', 'text']],
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
  const [tinfo, charges, meters, maint] = await Promise.all([
    api(`/properties/${p.id}/tenant`), api(`/properties/${p.id}/charges`), api(`/properties/${p.id}/meter-requests`),
    api(`/properties/${p.id}/maintenance`)]);
  const t = today();
  box.innerHTML = `<h3 style="margin-top:16px">Tenant & rent</h3>
    <p class="muted">${p.rent_amount ? `${tr('Rent:')} <b>${money(p.rent_amount)}</b> ${tr('/ month, due day')} ${p.rent_due_day || 1} — ${tr('the rent charge is generated automatically once a tenant has joined.')}` : 'No rent set — use <b>Edit</b> to set the monthly rent and due day.'}</p>
    ${canWrite() ? `<p class="row" style="flex-wrap:wrap">
      ${tinfo.invite_code ? `<span>Tenant code: <b class="amount" style="font-size:18px;letter-spacing:.12em">${esc(tinfo.invite_code)}</b></span>
      <button class="btn ghost small" data-copy="${esc(tinfo.invite_code)}">Copy code</button>
      <button class="btn ghost small" data-copy="${esc(registerLink(tinfo.invite_code))}">Copy link</button>` : `<span class="muted">No tenant code yet.</span>`}
      <button class="btn ghost small" data-tcode>${tinfo.invite_code ? 'Generate new code' : 'Generate code'}</button>
      <span class="muted">Your tenant registers with it on the sign-in screen → <b>Register</b> tab. They only see the charges below — nothing else.</span></p>` : ''}
    ${tinfo.tenants.length ? `<p>${tr(tinfo.tenants.length > 1 ? 'Tenants' : 'Tenant')}: ${tinfo.tenants.map((x) => `<b>${esc(x.name)}</b> <span class="muted">(${esc(x.email)})</span>${canWrite() ? ` <button class="btn danger small" data-tdel="${x.id}">Remove</button>` : ''}`).join(' · ')}</p>`
      : `<p class="muted">No tenant has joined yet.</p>`}
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
          <td class="right amount">${money(c.amount)}</td>
          <td>${c.attachment ? `<a href="/api/properties/${p.id}/charges/${c.id}/attachment" target="_blank">view</a>` : canWrite() ? `<label class="btn ghost small" style="display:inline-block">attach<input type="file" data-chattach="${c.id}" accept=".pdf,image/*" hidden></label>` : '—'}</td>
          <td>${c.status === 'paid' ? `<span class="badge paid">${tr('paid')}${c.confirmed_at ? ' ' + fdate(c.confirmed_at) : ''}</span>`
            : c.status === 'pending' ? `<span class="badge role">${tr('pending — tenant marked paid')} ${c.marked_paid_at ? fdate(c.marked_paid_at) : ''}</span>`
            : `<span class="badge unpaid">unpaid</span>`}</td>
          <td class="right">${canWrite() ? `
            ${c.status !== 'paid' ? `<button class="btn small" data-chconfirm="${c.id}">Confirm paid</button>` : ''}
            ${c.status === 'pending' ? `<button class="btn ghost small" data-chreject="${c.id}">Reject</button>` : ''}
            <button class="btn danger small" data-chdel="${c.id}">✕</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>` : `<p class="muted">Nothing shared with the tenant yet.</p>`}
    <h3 style="margin-top:16px">Meter readings</h3>
    <p class="muted">${p.reading_day && p.reading_utilities ? `${tr('Scheduled:')} ${esc(p.reading_utilities)} ${tr('on day')} ${p.reading_day} ${tr('of every month (tenant gets an email).')}` : 'No monthly schedule — set "Meter reading day" and the meters via <b>Edit</b>, or request one now.'}</p>
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
        <td><b>${esc(m.title)}</b>${m.note ? `<br><span class="muted">${esc(m.note)}</span>` : ''}</td>
        <td>${m.photo ? `<a href="/api/properties/${p.id}/maintenance/${m.id}/photo" target="_blank">photo</a>` : '<span class="muted">—</span>'}</td>
        <td>${m.status === 'done' ? `<span class="badge paid">${tr('Fixed')}${m.resolved_at ? ' ' + fdate(m.resolved_at) : ''}</span>` : `<span class="badge unpaid">${tr('Open')}</span>`}</td>
        <td class="right"><span class="rowacts">${canWrite() ? `<button class="btn ${m.status === 'done' ? 'ghost ' : ''}small" data-mdone="${m.id}">${m.status === 'done' ? 'Reopen' : tr('Mark fixed')}</button>
          <button class="btn danger small" data-mdel="${m.id}">✕</button>` : ''}</span></td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">Nothing reported by the tenant.</p>`}`;
  const reload = () => renderTenantBox(box, p);
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
    try { await api(`/properties/${p.id}/meter-request`, { method: 'POST', body: { utility: b.dataset.meterreq } }); toast('Reading requested — tenant notified'); reload(); }
    catch (err) { toast(err.message); }
  }));
  box.querySelectorAll('[data-meterdel]').forEach((b) => (b.onclick = async () => {
    await api(`/properties/${p.id}/meter-requests/${b.dataset.meterdel}`, { method: 'DELETE' }); reload();
  }));
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
  const linkOpts = [['', tr('Family (general)')],
    ...members.map((m) => ['user:' + m.id, tr('Person') + ': ' + m.name]),
    ...vehicles.map((v) => ['vehicle:' + v.id, tr('Vehicle') + ': ' + v.name]),
    ...properties.map((p) => ['property:' + p.id, tr('Property') + ': ' + p.name])];
  const belongsTo = (d) => d.person_name ? `${tr('Person')}: ${esc(d.person_name)}` : d.vehicle_name ? `${tr('Vehicle')}: ${esc(d.vehicle_name)}` : d.property_name ? `${tr('Property')}: ${esc(d.property_name)}` : tr('Family');
  el.innerHTML = `<div class="pagehead"><div><h1>Acte</h1><p>ID cards, passports, certificates, talon auto, contracts — linked to a person, vehicle or property, with expiry reminders and scans.</p></div></div>
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

/* ---------- family lists ---------- */
const LIST_DEFS = [
  ['buy', 'Buy wishlist', 'PlayStation 5, canapea nouă…'],
  ['travel', 'Travel wishlist', 'Roma, Maramureș…'],
  ['grocery', 'Grocery list', 'Lapte, pâine, ouă…'],
  ['targets', 'Personal targets', 'Learn to swim, read 12 books…'],
];
async function viewLists(el, tab = 'buy') {
  const [items, members] = await Promise.all([api('/lists'), api('/family/members')]);
  const def = LIST_DEFS.find((d) => d[0] === tab);
  const rows = items.filter((i) => i.list === tab);
  const openCount = rows.filter((i) => !i.done).length;
  el.innerHTML = `<div class="pagehead"><div><h1>Lists</h1><p>Wishlists, groceries and personal goals for the whole family.</p></div></div>
    <div class="tabs" style="max-width:680px">${LIST_DEFS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="card">
      ${canWrite() ? `<form id="listform" class="formgrid">
        <div><label>${tab === 'targets' ? 'Target' : 'Item'}</label><input name="title" placeholder="${esc(def[2])}" required></div>
        ${tab === 'buy' ? `<div><label>Est. price (${cur()})</label><input name="amount" type="number" step="0.01" min="0"></div>` : ''}
        ${tab === 'targets' ? `<div><label>Person</label><select name="user_id">${members.map((m) => `<option value="${m.id}" ${m.id === ME.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>` : ''}
        <div><label>Note</label><input name="note" placeholder="optional"></div>
        <button class="btn">Add</button></form>` : ''}
      ${rows.length ? `<p class="muted" style="margin:12px 0 4px">${openCount} ${tr('open')} · ${rows.length - openCount} ${tr('done')}</p>
      <table><tbody>
        ${rows.map((i) => `<tr style="${i.done ? 'opacity:.55' : ''}">
          <td style="width:30px">${canWrite() ? `<input type="checkbox" data-tog="${i.id}" ${i.done ? 'checked' : ''} style="width:auto">` : (i.done ? '✓' : '')}</td>
          <td><b style="${i.done ? 'text-decoration:line-through' : ''}">${esc(i.title)}</b>${i.note ? `<br><span class="muted">${esc(i.note)}</span>` : ''}</td>
          <td class="muted">${esc(i.user_name || '')}</td>
          <td class="right amount">${i.amount ? money(i.amount) : ''}</td>
          <td class="right">${canWrite() ? `<button class="btn danger small" data-del="${i.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty" style="margin-top:10px"><b>Nothing here yet</b>Add the first item above.</div>`}
    </div>`;
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => viewLists(el, b.dataset.t)));
  $('#listform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/lists', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), list: tab } }); viewLists(el, tab); }
    catch (err) { toast(err.message); }
  });
  el.querySelectorAll('[data-tog]').forEach((c) => (c.onchange = async () => {
    await api(`/lists/${c.dataset.tog}/toggle`, { method: 'POST' }); viewLists(el, tab);
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
const SEARCH_KINDS = { expense: 'Expense', income: 'Income', bill: 'Bill', document: 'Document', credit: 'Credit', vehicle: 'Vehicle', property: 'Property', list: 'List' };
async function viewSearch(el) {
  el.innerHTML = `<div class="pagehead"><div><h1>Search</h1><p>Across expenses, income, bills, acte, credits, cars, properties and lists.</p></div></div>
    <div class="card">
      <input id="sq" type="search" placeholder="Digi, pasaport, Kaufland…" value="${esc(SEARCH_Q)}" autocomplete="off" style="font-size:16px">
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
        <td data-label="Type"><span class="badge role">${tr(SEARCH_KINDS[r.kind] || r.kind)}</span></td>
        <td><b>${esc(r.title || '')}</b>${r.sub ? `<br><span class="muted">${esc(r.sub)}</span>` : ''}</td>
        <td data-label="Date">${r.date ? fdate(r.date) : ''}</td>
        <td class="right amount" data-label="Amount">${r.amount != null ? money(r.amount) : ''}</td>
        <td class="right"><a class="btn ghost small" href="#${r.tab}" data-go="${r.kind}">${tr('View')}</a></td>
      </tr>`).join('')}</tbody></table>`;
    // an expense result lands on the Expenses tab already filtered to what was searched
    box.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => {
      const k = a.dataset.go;
      if (k === 'expense' || k === 'income' || k === 'credit') PENDING_MONEY_TAB = k === 'expense' ? 'expenses' : k === 'income' ? 'income' : 'credits';
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
    <details class="card foldcard" style="margin-top:16px"><summary>Notifications on this device</summary><div style="padding-top:12px">
      <p class="muted" style="margin-top:0">Get alerts (RCA, ITP, acte, birthdays…) as push notifications on this phone/computer even when the site is closed. Tip: on a phone, first use "Add to Home Screen" to install the app.</p>
      <div class="row"><button class="btn small" id="pushbtn">…</button><button class="btn ghost small" id="pushtest" hidden>Send a test</button></div>
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
          ${k.avatar ? `<button class="btn danger small" data-avadel="${k.id}">✕</button>` : ''}</div></div>`).join('')}</div></div>` : ''}`;
  el.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { theme: b.dataset.theme } }); ME = { ...ME, ...u }; applyTheme(); render(); }
    catch (err) { toast(err.message); }
  }));
  el.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = async () => {
    try { const u = await api('/settings', { method: 'POST', body: { lang: b.dataset.lang } }); ME = { ...ME, ...u }; applyLang(); render(); }
    catch (err) { toast(err.message); }
  }));
  setupPushCard();
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
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches && n.matches('input[type="date"]:not(.dpnative)')) upgradeDateInput(n);
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

boot();
