# Control casă (Home Assistant, de pe site)

Pagina **Control casă** din Family Hub arată luminile, clima, jaluzelele și celelalte dispozitive alese
de tine și le poate comanda de oriunde. Regula de la [panoul din casă](home-assistant.md) rămâne în
picioare: **site-ul nu ține nicio cheie către casă**. Direcția e tot de la casă spre site:

1. Home Assistant întreabă site-ul la fiecare 3 secunde: „s-a apăsat ceva?” (`GET /home/<token>/commands`).
2. Dacă da, execută comanda **doar** dacă dispozitivul are eticheta `Family Hub` și acțiunea e pe lista fixă de mai jos.
3. Apoi trimite înapoi starea dispozitivelor etichetate (`POST /home/<token>/states`).

Ce circulă de la site spre casă e doar un nume de acțiune dintr-o listă fixă (`turn_on`, `open`,
`temperature`…) și un număr. Niciodată un nume de serviciu Home Assistant. Dacă adresa ar ajunge
unde nu trebuie, cineva ar putea apăsa doar butoanele pe care le-ai pus pe pagină. Nu ar putea citi
alți senzori și nu ar putea porni altceva din casă. **Adresă nouă** o scoate din uz pe cea veche imediat.

O apăsare pe care casa nu o preia în 30 de secunde (de exemplu dacă internetul de acasă a căzut)
se anulează. Nu se execută mai târziu, pe neașteptate.

## 1. Creează adresa

În Family Hub: **Control casă** → **Creează adresa** (doar adminul vede butonul). Pagina arată
apoi blocul de configurare cu adresa ta deja completată.

## 2. Lipește blocul în `configuration.yaml`

Copiază-l de pe pagină (butonul **Configurare**). Arată așa:

```yaml
rest:
  - resource: "https://lafamiliapop.ro/home/<token>/commands"
    scan_interval: 3
    timeout: 10
    sensor:
      - name: "Family Hub comenzi"
        unique_id: family_hub_comenzi
        value_template: "{{ value_json.seq }}-{{ value_json.req }}"
        json_attributes:
          - commands

rest_command:
  family_hub_states:
    url: "https://lafamiliapop.ro/home/<token>/states"
    method: post
    content_type: "application/json"
    payload: "{{ payload if payload is string else payload | to_json }}"
    timeout: 15
```

> Ai deja o cheie `rest:` pentru panoul din casă. **Nu adăuga a doua.** Pune doar elementul care
> începe cu `- resource:` în lista existentă. La fel pentru `rest_command:` dacă există deja.

Senzorul își schimbă starea doar când apare o comandă nouă sau când site-ul cere stările din nou.
Comenzile vin în atributul `commands`. Pentru că starea nu se schimbă la fiecare interogare,
baza de date a Home Assistant nu se umple.

## 3. Etichetele

Settings → Areas, labels & zones → **Labels**:

- `Family Hub`: pune-o pe fiecare **entitate** care trebuie să apară pe site (Settings → Entities → entitatea → ⚙ → Labels). Eticheta pusă pe un dispozitiv întreg nu ajunge la entitățile lui.
- `Family Hub confirmare`: pune-o în plus pe cele care trebuie să ceară „Ești sigur?” înainte (poarta, de exemplu).

Ce poate face site-ul cu fiecare tip:

| Tip | Acțiuni |
|---|---|
| `light` | aprinde, stinge, luminozitate 1–100% |
| `switch`, `input_boolean`, `fan`, `humidifier` | pornește, oprește |
| `cover` | deschide, stop, închide, poziție 0–100% |
| `climate` | pornește, oprește, temperatura 5–35° |
| `lock` | încuie, descuie (cere mereu confirmare) |
| `vacuum` | pornește, trimite la bază |
| `script`, `scene` | rulează |
| `button` | apasă |
| `sensor`, `binary_sensor` | doar afișare |

## 4. Scriptul care trimite stările

Settings → Automations & scenes → Scripts → Add script → ⋮ → Edit in YAML. Salvează-l cu ID-ul `family_hub_trimite_starile`.

### Cu tab-urile unui dashboard (recomandat)

Pagina poate arăta aceleași tab-uri, titluri de secțiuni și entități, în aceeași ordine, ca un dashboard din Home Assistant. Structura stă în scriptul din casă, deci o generezi din configurația dashboard-ului:

```bash
# config/.storage/lovelace.<id_dashboard> din Home Assistant (de ex. lovelace.dashboard_test)
node scripts/ha-dashboard-layout.js lovelace.dashboard_test > script.yaml
```

Lipește conținutul lui `script.yaml` ca script. Rulează din nou comanda când schimbi dashboard-ul.

Pe site ajung **stările tuturor entităților din dashboard** (doar afișare) plus ale celor cu eticheta `Family Hub`. Doar cele cu eticheta pot fi **comandate**. Cardurile care desenează ceva al lor (planul casei, fluxul de energie, grafice) și camerele nu se copiază: site-ul nu le poate desena, iar imaginile din casă nu trebuie să treacă prin hosting.

### Fără dashboard

Doar entitățile cu eticheta `Family Hub`, grupate pe camere:

```yaml
alias: Family Hub - trimite stările
description: Trimite către Family Hub starea entităților din dashboard și a celor cu eticheta Family Hub.
mode: queued
max: 3
variables:
  layout: []
sequence:
  - action: rest_command.family_hub_states
    data:
      payload: >-
        {% set ctl = label_entities('family_hub') %}
        {% set confirm = label_entities('family_hub_confirmare') %}
        {% set ns = namespace(ids=[], items=[]) %}
        {% for v in layout | default([]) %}{% for sec in v.s %}{% for it in sec['items'] %}{% set ns.ids = ns.ids + [it.e] %}{% endfor %}{% endfor %}{% endfor %}
        {% for e in (ns.ids + ctl) | unique | sort %}
        {% set s = states[e] %}
        {% if s is not none %}
        {% set a = s.attributes %}
        {% set d = e.split('.')[0] %}
        {% if d == 'weather' %}{% set t = a.temperature %}{% else %}{% set t = a.current_temperature %}{% endif %}
        {% if d == 'climate' %}{% set g = a.temperature %}{% else %}{% set g = none %}{% endif %}
        {% set ns.items = ns.items + [{
          'id': e, 'name': s.name, 'state': s.state,
          'area': area_name(e) or '',
          'unit': a.unit_of_measurement | default(none),
          'dc': a.device_class | default(none),
          'title': a.media_title | default(none),
          'brightness': ((a.brightness / 2.55) | round(0)) if a.brightness is number else none,
          'temp': t | default(none),
          'target': g | default(none),
          'position': a.current_position | default(none),
          'ctl': e in ctl,
          'confirm': e in confirm }] %}
        {% endif %}
        {% endfor %}
        {{ {'layout': layout | default([]), 'entities': ns.items} | to_json }}
```

## 5. Automatizarea care execută comenzile

Settings → Automations & scenes → Create automation → ⋮ → Edit in YAML:

```yaml
alias: Family Hub - comenzi de pe site
description: Execută ce s-a apăsat pe lafamiliapop.ro, doar pentru dispozitivele cu eticheta Family Hub.
mode: queued
max: 10
triggers:
  - trigger: state
    entity_id: sensor.family_hub_comenzi
    not_to: [unknown, unavailable]
actions:
  - variables:
      allowed: "{{ label_entities('family_hub') }}"
      commands: "{{ trigger.to_state.attributes.commands | default([]) }}"
      services:
        light: { turn_on: light.turn_on, turn_off: light.turn_off, brightness: light.turn_on }
        switch: { turn_on: switch.turn_on, turn_off: switch.turn_off }
        input_boolean: { turn_on: input_boolean.turn_on, turn_off: input_boolean.turn_off }
        fan: { turn_on: fan.turn_on, turn_off: fan.turn_off }
        humidifier: { turn_on: humidifier.turn_on, turn_off: humidifier.turn_off }
        cover: { open: cover.open_cover, close: cover.close_cover, stop: cover.stop_cover, position: cover.set_cover_position }
        climate: { turn_on: climate.turn_on, turn_off: climate.turn_off, temperature: climate.set_temperature }
        lock: { lock: lock.lock, unlock: lock.unlock }
        vacuum: { start: vacuum.start, dock: vacuum.return_to_base }
        script: { run: script.turn_on }
        scene: { run: scene.turn_on }
        button: { press: button.press }
  - repeat:
      for_each: "{{ commands }}"
      sequence:
        - variables:
            target_id: "{{ repeat.item.entity_id }}"
            service: "{{ services.get(target_id.split('.')[0], {}).get(repeat.item.action, '') }}"
            value: "{{ repeat.item.value | float(0) }}"
        # a doua verificare, aici în casă: doar dispozitive etichetate, doar acțiuni din listă
        - if:
            - condition: template
              value_template: "{{ target_id in allowed and service != '' }}"
          then:
            - choose:
                - conditions: "{{ repeat.item.action == 'brightness' }}"
                  sequence:
                    - action: light.turn_on
                      target: { entity_id: "{{ target_id }}" }
                      data: { brightness_pct: "{{ [[value, 1] | max, 100] | min | int }}" }
                      continue_on_error: true
                - conditions: "{{ repeat.item.action == 'position' }}"
                  sequence:
                    - action: cover.set_cover_position
                      target: { entity_id: "{{ target_id }}" }
                      data: { position: "{{ [[value, 0] | max, 100] | min | int }}" }
                      continue_on_error: true
                - conditions: "{{ repeat.item.action == 'temperature' }}"
                  sequence:
                    - action: climate.set_temperature
                      target: { entity_id: "{{ target_id }}" }
                      data: { temperature: "{{ [[value, 5] | max, 35] | min }}" }
                      continue_on_error: true
              default:
                - action: "{{ service }}"
                  target: { entity_id: "{{ target_id }}" }
                  continue_on_error: true
  - if:
      - condition: template
        value_template: "{{ commands | count > 0 }}"
    then:
      - delay: 2
  - action: script.family_hub_trimite_starile
```

O comandă refuzată de verificare e sărită, iar celelalte din aceeași tură merg mai departe.

## 6. Repornește Home Assistant

Developer Tools → YAML → **Check configuration**, apoi **Restart**. În câteva secunde pagina
**Control casă** arată „Casa e conectată” și dispozitivele etichetate.

## Cât de repede merge

- O apăsare ajunge în casă în cel mult 3 secunde.
- Cât timp cineva are pagina deschisă, stările se reîmprospătează la ~5 secunde.
- Când nu se uită nimeni, Home Assistant trimite stările o dată la 5 minute.

## Dacă nu merge

1. Pagina zice „Casa nu răspunde”: verifică `sensor.family_hub_comenzi` în Developer Tools → States. Dacă e `unavailable`, Home Assistant nu ajunge la site (sau tokenul a fost schimbat: copiază blocul din nou).
2. Dispozitivele nu apar: verifică eticheta (`{{ label_entities('family_hub') }}` în Developer Tools → Template) și rulează manual scriptul **Family Hub - trimite stările**.
3. Butoanele nu fac nimic: Settings → Automations → **Family Hub - comenzi de pe site** → Traces.
