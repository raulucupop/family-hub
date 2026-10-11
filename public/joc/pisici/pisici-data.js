// Vânătoare de pisici la bunici: pisicile, adulții care păzesc și ce poate fiecare copil.
// Copiii (nume, vârstă, culoare) vin din FAMILIES (data.js, comun cu Operațiunea Somnul).

// shy = cât de ușor fug când dai buzna peste ele; trust = de câte ori trebuie mângâiate.
const CATS = [
  { id: 'miti', name: 'Miți', color: '#f0a04b', shy: 0.4, trust: 3 },
  { id: 'tom', name: 'Tom', color: '#8d8f9a', shy: 0.15, trust: 2 },
  { id: 'pufi', name: 'Pufi', color: '#f2efe9', shy: 0.85, trust: 4 },
  { id: 'ghemotoc', name: 'Ghemotoc', color: '#2b2730', shy: 0.6, trust: 3 },
  { id: 'tigrisor', name: 'Tigrișor', color: '#d9822b', shy: 0.5, trust: 3 },
  { id: 'fulg', name: 'Fulg', color: '#c9ccd6', shy: 0.7, trust: 4 },
  { id: 'mustacioara', name: 'Mustăcioara', color: '#5b4a42', shy: 0.3, trust: 2 },
  { id: 'zmeu', name: 'Zmeu', color: '#b5653a', shy: 0.55, trust: 3 },
];

// range = cât de departe văd, fov = jumătate din unghiul conului (grade).
const ADULTS = [
  { id: 'bunicul', name: 'Bunicul', color: '#6f7f5c', speed: 62, chase: 106, range: 210, fov: 35, area: 'yard',
    trait: 'Păzește curtea și șopronul. Vede departe, dar mai ațipește pe bancă.',
    spot: ['Ce faci acolo, măi?', 'Lasă pisica-n pace!', 'Stai, că te prind!'],
    caught: ['Hai, gata cu fuga!', 'Te-am prins, ștrengarule!'], lost: ['Unde a dispărut?', 'Of, copiii ăștia...'] },
  { id: 'irina', name: 'Irina', color: '#c76b8e', speed: 76, chase: 122, range: 160, fov: 55, area: 'house', hears: true,
    trait: 'Păzește casa. E iute și aude când alergi pe lângă ea.',
    spot: ['Hei! Unde fugi cu pisica?', 'Pisicile nu intră în casă!', 'Te-am văzut!'],
    caught: ['Gata, înapoi în curte!', 'Prins!'], lost: ['Unde s-a ascuns?', 'Lasă, că te găsesc eu.'] },
];

// Ce poate fiecare copil în jocul ăsta. calm = pisicile nu se sperie de el; small = adulții îl văd mai greu.
const CAT_KIDS = {
  mara:   { speed: 84,  carry: 1, calm: true, abilities: ['sneak', 'bigEyes'], note: 'Mică și șireată: pisicile nu se sperie de ea.' },
  maria:  { speed: 60,  carry: 2, calm: true, abilities: ['coo', 'smile'], note: 'Merge în premergător. Pisicile o adoră și se urcă singure în coșuleț.' },
  aida:   { speed: 100, carry: 2, abilities: ['catBook', 'quietRead'], note: 'A citit tot despre pisici. Știe unde se ascund.' },
  amelia: { speed: 116, carry: 2, abilities: ['flatter', 'energy'], note: 'Super energică. Îi topește pe adulți cu complimente.' },
  luiza:  { speed: 100, carry: 3, petBonus: 1, abilities: ['gentle', 'talk'], note: 'Calmă și blândă: pisicile au încredere în ea mai repede.' },
  andrei: { speed: 128, carry: 2, abilities: ['meowPhone', 'turbo'], note: 'Cel mai rapid. Are pe telefon un mieunat care cheamă pisicile.' },
  matei:  { speed: 58,  carry: 1, calm: true, small: true, abilities: ['crawl', 'toothless'], note: 'Merge de-a bușilea, așa că adulții îl observă greu.' },
};

const CAT_ABILITIES = {
  sneak:     { name: 'Strecurare', desc: 'Nevăzută 6 s.', cd: 18, type: 'invisible', dur: 6 },
  bigEyes:   { name: 'Ochii mari', desc: 'Cel mai apropiat adult se înmoaie 5 s.', cd: 16, type: 'charm', dur: 5, adultSay: 'Ooo, ce ochi mari...' },
  coo:       { name: 'Gângurit', desc: 'Pisicile din jur vin singure la tine 6 s.', cd: 16, type: 'lure', dur: 6, range: 240, say: 'Gâ-gâ!' },
  smile:     { name: 'Zâmbetul fermecat', desc: 'Bunicul și Irina se opresc 5 s.', cd: 22, type: 'charm', all: true, dur: 5, adultSay: 'Ce zâmbet...' },
  catBook:   { name: 'Cartea despre pisici', desc: 'Vezi toate pisicile și nu fug de tine 8 s.', cd: 20, type: 'reveal', dur: 8, say: 'Pagina 12: unde dorm pisicile.' },
  quietRead: { name: 'Citit în colț', desc: 'Adulții te observă mult mai greu 8 s.', cd: 18, type: 'stealth', dur: 8, say: 'Eu doar citesc...' },
  flatter:   { name: 'Lingușeala', desc: 'Cel mai apropiat adult se topește 5 s.', cd: 17, type: 'charm', dur: 5, say: 'Ești cel mai bun!', adultSay: 'Ooo, ce scumpă ești...' },
  energy:    { name: 'Energie infinită', desc: 'Alergi de două ori mai repede 6 s.', cd: 16, type: 'speed', dur: 6, mult: 1.8, say: 'Wiiii!' },
  gentle:    { name: 'Mână blândă', desc: 'Următoarea pisică vine la tine din prima.', cd: 12, type: 'gentle', say: 'Pis-pis-pis...' },
  talk:      { name: 'Discuție serioasă', desc: 'Un adult stă de vorbă cu tine 7 s.', cd: 18, type: 'charm', dur: 7, say: 'Pot să te întreb ceva?', adultSay: 'Sigur, puiule...' },
  meowPhone: { name: 'Mieunat pe telefon', desc: 'Pisicile din jur vin la tine 6 s.', cd: 16, type: 'lure', dur: 6, range: 280, say: 'Miau! (de pe telefon)' },
  turbo:     { name: 'Turbo', desc: 'Alergi de două ori mai repede 6 s.', cd: 14, type: 'speed', dur: 6, mult: 1.9, say: 'Prinde-mă!' },
  crawl:     { name: 'De-a bușilea', desc: 'Nevăzut 6 s, dar mai încet.', cd: 16, type: 'invisible', dur: 6, slow: 0.7, say: 'Șșșt...' },
  toothless: { name: 'Zâmbet știrb', desc: 'Cel mai apropiat adult se topește 5 s.', cd: 14, type: 'charm', dur: 5, adultSay: 'Vai, ce dințișori!' },
};

const HUNT_SECONDS = 150; // 17:00 → 18:30, când e gata masa
const HEARTS = 3;
