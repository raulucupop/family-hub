// Familiile, personajele și abilitățile lor.
// Copii: speed = viteza de alergare, awake = cât de treji pornesc (0-100),
// calm = cât de repede adorm în pat, escape = cât de des fug din pat.
const FAMILIES = [
  { id: 'pop', name: 'Familia Pop', members: [
    { id: 'raul', name: 'Raul', role: 'parent', age: 'IT-ist, 31 ani', color: '#6fb3ff',
      trait: 'Rezolvă orice criză cu un restart.', abilities: ['restart', 'wifi'] },
    { id: 'madalina', name: 'Mădălina', role: 'parent', age: 'Hardistă, 29 ani', color: '#ff9ec4',
      trait: 'Repară instant orice strică Mara.', abilities: ['repair', 'locks'] },
    { id: 'mara', name: 'Mara', role: 'kid', age: '1,8 ani', color: '#ffd36e',
      trait: 'Șiretlic. Iese din pat fără să fie văzută.', speed: 74, awake: 85, calm: 0.9, escape: 0.22, stamina: 0.9,
      abilities: ['hideRemote', 'sneak', 'water'] },
    { id: 'maria', name: 'Maria', role: 'kid', age: '4 luni', color: '#c9a7ff', baby: true, crib: true, still: true,
      trait: 'Nu merge încă. Nici nu are nevoie.', speed: 0, awake: 65, calm: 1, escape: 0,
      abilities: ['scream', 'smile'] },
  ] },
  { id: 'calimanu', name: 'Familia Pop-Călimanu', members: [
    { id: 'monica', name: 'Monica', role: 'parent', age: 'Doctor profesor universitar', color: '#ff9e7a',
      trait: 'Hardware. Scoate orice ecran din priză.', abilities: ['debug', 'exam'] },
    { id: 'marius', name: 'Marius', role: 'parent', age: 'Doctor profesor universitar', color: '#7fd1c7',
      trait: 'Mecanic. Montează un motoraș și la leagăn.', abilities: ['cradle', 'doorLock'] },
    { id: 'aida', name: 'Aida', role: 'kid', age: '13 ani', color: '#b4e07a',
      trait: 'Îi place să citească. Mai ales la 20:59.', speed: 84, awake: 90, calm: 0.75, escape: 0.16, stamina: 0.85,
      abilities: ['chapter', 'book'] },
    { id: 'amelia', name: 'Amelia', role: 'kid', age: '6 ani', color: '#ffb3e6',
      trait: 'Super energică și lingușitoare.', speed: 118, awake: 100, calm: 0.6, escape: 0.25, stamina: 0.6,
      abilities: ['flatter', 'energy'] },
  ] },
  { id: 'hrisca', name: 'Familia Hrișcă', members: [
    { id: 'raluca', name: 'Raluca', role: 'parent', age: 'Medic militar', color: '#9be08f',
      trait: 'Comandă stingerea. Toată lumea execută.', abilities: ['lightsOut', 'march'] },
    { id: 'marinel', name: 'Marinel', role: 'parent', age: 'Profesor', color: '#f2c27b',
      trait: 'O lecție de-a lui adoarme o clasă întreagă.', abilities: ['lecture', 'rollcall'] },
    { id: 'luiza', name: 'Luiza', role: 'kid', age: '11 ani', color: '#a8c8ff',
      trait: 'Calmă, dar sensibilă. Are mereu o întrebare serioasă.', speed: 90, awake: 70, calm: 1.35, escape: 0.07,
      abilities: ['talk', 'blanketRead'] },
    { id: 'andrei', name: 'Andrei', role: 'kid', age: '8 ani', color: '#ff7b7b',
      trait: 'Foarte neastâmpărat. Telefonul e prelungirea mâinii.', speed: 126, awake: 100, calm: 0.7, escape: 0.25, stamina: 0.8,
      abilities: ['phone', 'turbo'] },
    { id: 'matei', name: 'Matei', role: 'kid', age: '1 an', color: '#ffe3a3', baby: true, crib: true,
      trait: 'Merge de-a bușilea. Plânge strategic.', speed: 44, awake: 75, calm: 1.1, escape: 0.12,
      abilities: ['cry', 'pacifier'] },
  ] },
];

// type = efectul din sim.js. cd = reîncărcare (s), dur = durată (s).
const ABILITIES = {
  // Părinți
  restart:   { name: 'Restart', desc: 'Copilul cel mai apropiat se calmează 10 s: merge încet și nu iese din pat.', cd: 14, type: 'calmKid', dur: 10, say: 'Ctrl+Alt+Del!' },
  wifi:      { name: 'Oprește Wi-Fi-ul', desc: 'Fără desene și telefon 20 s.', cd: 30, type: 'screensOff', dur: 20, say: 'Wi-Fi oprit.' },
  repair:    { name: 'Reparație', desc: 'Repară instant tot ce s-a stricat.', cd: 12, type: 'fixAll', say: 'Gata, reparat.' },
  locks:     { name: 'Siguranțe', desc: 'Ușile camerei copiilor și sertarele blocate 15 s.', cd: 28, type: 'lockRoom', dur: 15, say: 'Clic! Blocat.' },
  debug:     { name: 'Depanare', desc: 'Repară tot și scoate ecranele din priză 8 s.', cd: 26, type: 'fixAll', screens: 8, say: 'Am scos din priză.' },
  exam:      { name: 'Examen oral', desc: 'Cel mai apropiat copil răspunde la întrebări 6 s și obosește.', cd: 12, type: 'calmKid', dur: 6, drop: 8, say: 'Spune-mi tu...' },
  cradle:    { name: 'Leagăn mecanic', desc: 'Paturile se leagănă singure 15 s.', cd: 30, type: 'cradle', dur: 15, say: 'Am montat un motoraș.' },
  doorLock:  { name: 'Zăvor', desc: 'Ușile camerei copiilor blocate 15 s.', cd: 26, type: 'lockRoom', dur: 15, say: 'Am reglat zăvorul.' },
  lightsOut: { name: 'Stingerea!', desc: 'Cine e în pat nu mai iese 12 s.', cd: 22, type: 'lockBeds', dur: 12, say: 'Stingerea! Nimeni nu mișcă!' },
  march:     { name: 'Marș forțat', desc: 'Alergi mult mai repede 8 s.', cd: 16, type: 'speed', dur: 8, mult: 1.6, say: 'La pas alergător!' },
  lecture:   { name: 'Lecție plictisitoare', desc: 'Copiii din aceeași cameră pică de somn.', cd: 16, type: 'lecture', amount: 35, say: 'Azi vorbim despre...' },
  rollcall:  { name: 'Strigă catalogul', desc: 'Toți copiii care umblă îngheață 4 s.', cd: 18, type: 'freezeFree', dur: 4, say: 'Catalogul! Fiecare la locul lui!' },
  // Copii
  hideRemote:{ name: 'Ascunde telecomanda', desc: 'Părinții o caută 6 s în sufragerie.', cd: 20, type: 'distract', room: 'living', dur: 6, say: 'Hi-hi.', parentSay: 'Unde e telecomanda?' },
  sneak:     { name: 'Strecurare', desc: 'Nevăzută 7 s. Poți ieși din pat.', cd: 18, type: 'invisible', dur: 7, say: 'Șșșt...' },
  water:     { name: 'Încă o dată apă', desc: 'Un părinte te lasă jos și pleacă după apă.', cd: 16, type: 'distract', room: 'kitchen', nearest: true, dur: 2, say: 'Apăăă!', parentSay: 'Încă o dată apă...' },
  scream:    { name: 'Țipăt sonic', desc: 'Trezește pe toată lumea și amețește părinții.', cd: 14, type: 'scream', say: 'UAAAAA!' },
  smile:     { name: 'Zâmbetul fermecat', desc: 'Părinții uită ce aveau de făcut 6 s.', cd: 18, type: 'charm', all: true, dur: 6, say: '(zâmbet)', parentSay: 'Ce voiam să fac?' },
  chapter:   { name: 'Încă un capitol', desc: 'Citești în pat 10 s și nu adormi.', cd: 16, type: 'stayUp', dur: 10, gain: 0.6, say: 'Încă un capitol...' },
  book:      { name: 'Bibliotecă ambulantă', desc: 'Un părinte primește o carte și citește 7 s.', cd: 18, type: 'charm', dur: 7, say: 'Uite ce carte!', parentSay: 'Hm, interesant capitol...' },
  flatter:   { name: 'Lingușeala', desc: 'Cel mai apropiat părinte se topește 6 s.', cd: 14, type: 'charm', dur: 6, say: 'Ești cel mai bun părinte!', parentSay: 'Ooo, puiul meu...' },
  energy:    { name: 'Energie infinită', desc: 'Alergi de două ori mai repede 6 s.', cd: 16, type: 'speed', dur: 6, mult: 1.8, say: 'Wiiii!' },
  talk:      { name: 'Discuție serioasă', desc: 'Un părinte rămâne să vorbiți 8 s.', cd: 18, type: 'charm', dur: 8, say: 'Pot să te întreb ceva?', parentSay: 'Sigur, puiule...' },
  blanketRead:{ name: 'Lanternă sub pătură', desc: 'Citești în pat 10 s și nu adormi.', cd: 16, type: 'stayUp', dur: 10, gain: 0.8, say: 'Doar o pagină.' },
  phone:     { name: 'Telefon sub pătură', desc: 'Joci în pat 10 s. Nu merge fără Wi-Fi.', cd: 16, type: 'stayUp', dur: 10, gain: 1, screen: true, say: 'Încă un nivel!' },
  turbo:     { name: 'Turbo', desc: 'Alergi de două ori mai repede 6 s.', cd: 14, type: 'speed', dur: 6, mult: 1.9, say: 'Prinde-mă!' },
  cry:       { name: 'Plânset', desc: 'Trezește frații și amețește părinții.', cd: 14, type: 'scream', say: 'Buaaaa!' },
  pacifier:  { name: 'Aruncă suzeta', desc: 'Un părinte caută suzeta 6 s.', cd: 16, type: 'distract', room: 'random', nearest: true, dur: 6, say: 'Pac!', parentSay: 'Unde e suzeta?' },
};

const GAME_SECONDS = 150; // 19:30 → 21:00 în 2 minute și jumătate
