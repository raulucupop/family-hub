# Facturi trimise pe email

Trimiți factura de la furnizor pe o adresă dedicată și apare în **Facturi** ca **ciornă**, cu suma
citită din ea. Primești și o notificare care spune direct cât e.

**Nimic nu devine factură până nu apeși tu.** Asta nu e o formalitate — e proiectul întreg:

- Un antet `From` poate fi falsificat de oricine. Lista de furnizori recunoscuți e o comoditate, nu o
  protecție. Protecția reală e că tot ce poate face un email fals e să pună în fața ta o ciornă pe
  care o refuzi.
- O sumă citită greșit și înregistrată tăcut e mai rău decât să nu existe funcția deloc.

## Ce citește din email

Tiparele sunt scrise pe emailurile reale ale furnizorilor, nu ghicite:

| Furnizor | Expeditor | Ce caută |
|---|---|---|
| **E.ON** | `…@eon-romania.ro` | `Rest de plată: 57,22 lei` · `Număr factură:` · `Data scadentă:` |
| **Orange** | `…@notifications.orange.ro` | `Valoarea totala de plata este: 230.82 lei` · `plati pana pe 21 August` |
| **Hidroelectrica** | `…@hidroelectrica.ro` | `Total de plată` · `Data scadentă` |
| **Digi** | `…@digi.ro`, `…@rcs-rds.ro` | idem |
| oricare altul | — | ciorna apare cu subiectul și PDF-ul; suma o scrii tu |

Două lucruri care par mărunte și nu sunt:

- **Ambele convenții de zecimale.** Orange scrie `230.82`, E.ON scrie `57,22`. Care separator vine
  ultimul decide; ce e înainte e separator de mii. Deci `1.234,56` și `1,234.56` dau aceiași bani.
- **„Rest de plată" bate „Total factură".** Când ai sold vechi, cele două diferă, iar cel de plătit
  acum e primul. Plata totalului ar însemna să plătești de două ori soldul vechi.
- **Luna fără an.** Orange scrie „până pe 21 August". Se citește ca următoarea astfel de dată — o
  factură din decembrie deschisă în ianuarie nu se datează cu unsprezece luni în urmă.

## Instalare — o singură dată

### 1. Ia adresa din aplicație

Settings → **Facturi pe email** → **Creează adresa**. Iese un link de forma:

```
https://lafamiliapop.ro/api/mail/inbound/<token>
```

**Adresă nouă** îl schimbă și îl scoate imediat din uz pe cel vechi.

### 2. Pune adresa pe server, în afara repo-ului

Scriptul citește adresa dintr-un fișier care **nu** e în git — altfel următorul `git pull` ar
suprascrie-o, iar tokenul ar rămâne în istoricul repository-ului.

```bash
echo 'https://lafamiliapop.ro/api/mail/inbound/<token>' > ~/.family-hub-mail
chmod 600 ~/.family-hub-mail
chmod +x ~/repos/family-hub/scripts/mail-pipe.js
```

### 3. Fă legătura în cPanel

cPanel → **Forwarders** → *Add Forwarder* → adresa `facturi@lafamiliapop.ro` → **Pipe to a
Program**, iar în câmp calea relativă la home:

```
repos/family-hub/scripts/mail-pipe.js
```

**Nu ai nevoie de cont de email** pentru asta — un forwarder cu pipe funcționează pe o adresă fără
căsuță, deci nu creezi nicio parolă nouă.

> **Capcana cu `node`.** Prima linie din script e `#!/usr/bin/env node`. Exim rulează pipe-ul cu un
> PATH sărac, în care `node` s-ar putea să nu existe — și atunci nu se întâmplă nimic, tăcut.
> Află calea absolută și pune-o în locul liniei, dacă e cazul:
>
> ```bash
> which node       # ex.: /opt/alt/alt-nodejs20/root/usr/bin/node
> ```
>
> Apoi prima linie devine `#!/opt/alt/alt-nodejs20/root/usr/bin/node`. Asta e singura modificare
> care merită făcută în fișierul urmărit de git — și e nevoie de refăcut după un pull.
### 4. Probează

Trimite orice email pe `facturi@lafamiliapop.ro`. În câteva secunde:

- apare o ciornă în **Facturi → Facturi de confirmat**
- primești notificarea cu suma

Dacă nu apare, jurnalul scriptului spune de ce:

```bash
tail -20 ~/mail-pipe.log
```

Liniile arată `200 {"ok":true,...}` la reușită, sau motivul la eșec.

## De ce scriptul nu dă niciodată eroare către Exim

Iese cu cod 0 orice ar păți. Exim tratează orice altceva ca refuz și **trimite emailul înapoi
expeditorului** — adică i-ar bounce-ui factura lui E.ON pentru că aplicația ta era jos două minute.
Problemele de livrare se scriu în jurnal, nu se întorc la furnizor.

## Redirectare automată, dacă vrei

Manual merge din prima: apeși *Forward* pe email. Dacă vrei automat:

- **Gmail** → Settings → Forwarding → adaugi `facturi@lafamiliapop.ro`, apoi confirmi codul primit
  acolo, apoi un filtru `from:(orange.ro)` → *Forward to*.
- **Proton** → Settings → Filters → regulă după expeditor, cu acțiune *Forward*.

Confirmarea de la Gmail cere un click în emailul de verificare — ăla ajunge în ciorne, nu în facturi.
