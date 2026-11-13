# Facturi E.ON direct din Myline

Family Hub se conectează la contul tău E.ON Myline și aduce singur facturile neachitate în
**Facturi**. Când plătești (în aplicația E.ON, la bancă, oriunde), factura se marchează plătită aici
după ce E.ON vede plata, cu plata și cheltuiala înregistrate ca și cum ai fi apăsat tu **Plătește**.

Verifică la fiecare 6 ore. Din Settings → **E.ON Myline** → **Verifică acum** poți verifica oricând.

## De știut înainte

- **API-ul e neoficial.** E.ON nu are API public. Family Hub folosește același API privat ca
  aplicația Myline de pe telefon (`api2.eon.ro`). Dacă E.ON schimbă aplicația, sincronizarea se poate
  opri. Vezi asta în cardul din Settings, ca eroare cu roșu. Nu se pierde nimic, doar nu mai vin
  facturi noi până la o actualizare.
- **Parola stă doar pe server**, în variabilele de mediu. Nu ajunge în baza de date, nu trece prin
  browser și nu o poate citi nimeni din aplicație.
- **Facturile E.ON devin direct facturi, fără ciornă.** Spre deosebire de un email redirecționat,
  aici răspunsul vine de la E.ON printr-o conexiune autentificată, deci nu are cine să-l falsifice.
- **Sincronizarea atinge doar facturile pe care le-a creat ea.** Facturile scrise de mână rămân
  neatinse. Dacă ai deja o factură E.ON lunară scrisă de mână, șterge-o, altfel o vezi de două ori.
- O factură E.ON acceptată deja dintr-un email redirecționat este preluată, nu dublată.
- Dacă marchezi tu o factură ca plătită înainte să vadă E.ON plata, rămâne plătită. Nu se
  redeschide și plata nu se înregistrează de două ori.
- Dacă ștergi o factură care e încă neachitată la E.ON, revine la următoarea verificare.

## Instalare

### 1. Variabilele de mediu în cPanel

cPanel → **Setup Node.js App** → aplicația Family Hub → **Environment variables**. Adaugă:

| Variabilă | Valoare |
|---|---|
| `EON_EMAIL` | emailul cu care intri în Myline |
| `EON_PASSWORD` | parola Myline |

Apoi **Restart**. Opționale:

| Variabilă | Ce face | Implicit |
|---|---|---|
| `EON_REMIND_DAYS` | cu câte zile înainte de scadență primești notificare | `3` |
| `EON_FAMILY_ID` | în ce familie intră facturile, dacă sunt mai multe | prima familie |
| `EON_AUTO` | `0` oprește verificarea automată; rămâne doar butonul | pornit |

### 2. Prima verificare

Settings → **E.ON Myline** → **Verifică acum**. Cardul apare doar pentru admin și doar dacă
variabilele de mai sus sunt setate.

Dacă ai verificarea în doi pași pornită în Myline, E.ON îți trimite un cod pe email sau SMS. Îl
scrii în card și apeși **Confirmă**. Codul se cere o singură dată: după aceea Family Hub păstrează
sesiunea și o reînnoiește singur. Dacă E.ON închide sesiunea (de exemplu după ce îți schimbi
parola), cardul îți cere din nou un cod. Verificarea automată nu cere coduri noi singură, ca să nu
primești câte un email la fiecare 6 ore. Un cod nou se cere doar când apeși **Verifică acum**.

## Notificări

Fiecare factură E.ON vine cu notificare: cu `EON_REMIND_DAYS` zile înainte de scadență, în ziua
scadenței și zilnic cât e restantă. Le oprești din Settings → Notificări → „Facturi cu notificare
pornită”. Senzorii din Home Assistant („facturi restante”, „facturi 7 zile”) le numără automat.

## Când nu merge

| Ce vezi în card | Ce înseamnă |
|---|---|
| „E.ON a refuzat emailul sau parola” | verifică `EON_EMAIL` / `EON_PASSWORD`, apoi Restart |
| „E.ON cere codul de verificare” | scrie codul primit; dacă a expirat, apasă **Verifică acum** pentru unul nou |
| „E.ON a răspuns HTTP …” / „Autentificare E.ON eșuată (… cod 6075)” | E.ON a schimbat API-ul; trebuie actualizat `lib/eon-myline.js` |

Cheile aplicației Myline pot fi suprascrise fără cod nou dacă E.ON le schimbă:
`EON_SUBSCRIPTION_KEY`, `EON_SUBSCRIPTION_KEY_WEB`, `EON_VERIFY_SECRET`.
