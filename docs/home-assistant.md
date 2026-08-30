# Panoul din casă (Home Assistant)

Family Hub expune un **feed doar-citire**, pe o adresă cu token, pe care Home Assistant îl citește
la fiecare 15 minute. Direcția contează: **casa citește aplicația**, aplicația nu primește nicio
cheie către casă. Un token de Home Assistant păstrat pe hosting partajat ar pune luminile și
încuietorile la un fișier scurs distanță — de aceea nu există aici.

Feed-ul dă **doar cifre**. Nu conține nume de facturi, notițe, adrese sau nume de persoane: dacă
adresa ajunge unde nu trebuie, ce se vede e „trei facturi de plată, 525 lei", nu cine ce datorează.

## 1. Ia adresa din aplicație

Settings → **Panou în casă** → **Creează adresa** → copiază linkul. Arată așa:

```
https://lafamiliapop.ro/ha/3f9a…c21b.json
```

Butonul **Adresă nouă** o schimbă și o scoate imediat din uz pe cea veche. E singurul lucru de
făcut dacă bănuiești că linkul a ajuns unde nu trebuie.

## 2. Pune senzorii în `configuration.yaml`

Lipește blocul de mai jos, **cu adresa ta în loc de `PUNE-ADRESA-AICI`**.

> Dacă în `configuration.yaml` există deja o cheie `rest:`, **nu adăuga a doua** — YAML nu acceptă
> chei duplicate și configurația nu va mai porni. Adaugă în schimb elementele de mai jos în lista
> care există deja (sub `rest:` există o listă de resurse, deci mai adaugi un `- resource: …`).

> Cele doua senzoare de sold folosesc `availability` in loc sa scrie `unknown` in `value_template`.
> Un senzor cu `device_class: monetary` refuza o stare text: Home Assistant arunca eroare si nu mai
> creeaza deloc entitatea. Cu `availability`, cand nu e introdus niciun sold in Family Hub senzorul
> apare `unavailable`, ceea ce e adevarat si vizibil.

```yaml
rest:
  - resource: "PUNE-ADRESA-AICI"
    scan_interval: 900
    timeout: 20
    sensor:
      - name: "Family Hub sold"
        availability: "{{ value_json.balance_now is not none }}"
        value_template: "{{ value_json.balance_now }}"
        unit_of_measurement: "RON"
        device_class: monetary
        state_class: total

      - name: "Family Hub sold minim"
        availability: "{{ value_json.balance_low is not none }}"
        value_template: "{{ value_json.balance_low }}"
        unit_of_measurement: "RON"
        device_class: monetary
        state_class: total
        json_attributes:
          - balance_low_date

      - name: "Family Hub facturi 7 zile"
        value_template: "{{ value_json.bills_due_7d }}"
        state_class: measurement
        icon: mdi:file-document-alert

      - name: "Family Hub facturi suma"
        value_template: "{{ value_json.bills_due_7d_amount }}"
        unit_of_measurement: "RON"
        device_class: monetary
        state_class: total

      - name: "Family Hub facturi restante"
        value_template: "{{ value_json.bills_overdue }}"
        state_class: measurement
        icon: mdi:alert-circle

      - name: "Family Hub cheltuit luna"
        value_template: "{{ value_json.month_spent }}"
        unit_of_measurement: "RON"
        device_class: monetary
        state_class: total

      - name: "Family Hub pe card"
        value_template: "{{ value_json.month_on_card }}"
        unit_of_measurement: "RON"
        device_class: monetary
        state_class: total
        icon: mdi:credit-card

      - name: "Family Hub chirie neincasata"
        value_template: "{{ value_json.tenant_owed }}"
        icon: mdi:key-chain
        json_attributes:
          - tenant_unpaid

      - name: "Family Hub citiri lipsa"
        value_template: "{{ value_json.meter_readings_pending }}"
        state_class: measurement
        icon: mdi:gauge

      - name: "Family Hub termen urmator"
        value_template: "{{ value_json.next_deadline if value_json.next_deadline is not none else 'nimic' }}"
        icon: mdi:calendar-clock
        json_attributes:
          - next_deadline_days
          - next_deadline_date
          - deadlines_overdue
```

## 3. Repornește Home Assistant

Developer Tools → YAML → **Check configuration**, apoi **Restart**. (`rest.reload` nu ajunge la
prima instalare, fiindcă platforma nu era încărcată înainte.)

Entitățile care apar:

| Entitate | Ce arată |
|---|---|
| `sensor.family_hub_sold` | soldul de acum, calculat din ultimul sold introdus |
| `sensor.family_hub_sold_minim` | cel mai jos punct din următoarele 60 de zile |
| `sensor.family_hub_facturi_7_zile` | câte facturi sunt scadente în 7 zile |
| `sensor.family_hub_facturi_suma` | cât fac la un loc |
| `sensor.family_hub_facturi_restante` | câte au trecut de scadență |
| `sensor.family_hub_cheltuit_luna` | cheltuit luna asta, din cont |
| `sensor.family_hub_pe_card` | pus pe cardul de credit luna asta |
| `sensor.family_hub_chirie_neincasata` | cât datorează chiriașul, pe monede |
| `sensor.family_hub_citiri_lipsa` | citiri de contor cerute și netrimise |
| `sensor.family_hub_termen_urmator` | ce fel de termen urmează și în câte zile |

## 4. Dashboard-ul

Există deja, în bara laterală: **Family Hub**. Se populează singur după restart.

## Dacă senzorii rămân `unavailable`

1. Deschide adresa în browser — trebuie să întoarcă JSON. Dacă dă 404, tokenul a fost rotit.
2. Verifică din Home Assistant că are ieșire la internet către `lafamiliapop.ro`.
3. Developer Tools → Template, și testează:
   `{{ states('sensor.family_hub_sold') }}`
4. Settings → System → Logs, caută `rest`.
