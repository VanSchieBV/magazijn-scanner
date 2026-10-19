# PLAN: Simpele weergave (v1.16.0)

**Status: GEBOUWD op 2026-10-19 door Opus (v1.16.0, niet gecommit), nagekeken: nee.**
Afwijkingen van dit plan staan in `LOGBOEK.md` (sessie 2026-10-19, avond).
Opgesteld door Fable op 2026-10-19 na overleg met Timo. Bouwer: Opus (na `recap` en de Go).
Lees eerst `CLAUDE.md` (afspraken, test- en versieregels) en `LOGBOEK.md` (sessie 2026-10-19).

## 1. Wat en waarom

Timo's collega's moeten de app kunnen gebruiken zonder uitleg. Hun werk is eenvoudig: met de
scanner door de paden lopen en scannen wat bijna leeg is; daarna op de pc per leverancier de
bestellijst afwerken in de webshop van die leverancier. Alles wat daar niet voor nodig is
(tellen, telverschillen, opmerkingen, uitloop, rondje, instellingen, CSV, afronden) moet in een
**simpele weergave** verdwijnen. Een schuif zet de simpele weergave aan of uit, per apparaat.
Staat de schuif uit, dan ziet en werkt de app exact als nu (v1.15.0).

## 2. Beslissingen (al genomen, niet opnieuw afwegen)

| # | Beslissing |
|---|------------|
| B1 | Instelling per apparaat in localStorage `mgz_simpel` (`'1'` = aan), niet gesynct, net als de handscanner-stand. |
| B2 | "Pc" = schermbreedte **vanaf 900 px** (dezelfde grens als de media query in `style.css`). Alleen daar staat de schuif in de header op elke pagina. Op smallere schermen (de scanner/telefoon) staat de schuif alleen onder Instellingen. Het is één en dezelfde instelling. |
| B3 | Een scan in de simpele stand legt **geen aantal** vast maar een nieuw veld `bl` (bijna leeg, tijdstempel in ms). De bestellijst toont alles met een bestelaantal **óf** `bl`. Nooit stiekem `best = 1` opslaan. |
| B4 | Nieuw veld `vp` (aantal verpakkingen, geheel getal) op de registratie. In de simpele weergave staat dit veldje naast het vinkje Besteld in plaats van het inkoopnummer. In de normale weergave blijft het inkoopnummer (`ink`) en wordt `vp` als tekst getoond onder het vinkje. |
| B5 | Knoppen op het simpele artikelscherm: **"✓ Bestellen, terug naar scannen"** (zet het artikel op de bestellijst en sluit het scherm) en **"Annuleren"** (legt niets vast). Staat het artikel al op de bestellijst, dan toont de kop "staat al op de bestellijst" en heet de knop **"Terug naar scannen"** (sluit alleen). |
| B6 | De opschoonknoppen van v1.15.0 (bovenaan de bestellijst en per leverancier) blijven ook in de simpele weergave zichtbaar: zonder "Controle afronden" zijn ze de enige manier om de lijst leeg te maken. |
| B7 | Navigatie in de simpele stand: op de pc **Scannen, Gescand, Overzicht**; op de telefoon **Scannen, Gescand, Instellingen** (Instellingen toont daar alleen de schuif en het versienummer). |
| B8 | Schakelen terwijl een verborgen pagina (Rondje, Instellingen op de pc, Overzicht op de telefoon) open staat: naar Scannen met toast "Simpele weergave aan". Uitzetten geeft toast "Simpele weergave uit" en laat de pagina staan. |
| B9 | De uitleg bovenaan het simpele overzicht is **opgedeeld in korte stappen** (genummerde lijst), niet één lap tekst. Tekst staat in §4.1. |
| B10 | Wat doorloopt in de simpele stand: sync, besteldatum, wekelijks rondje (een scan telt mee als er een rondje actief is; onzichtbaar en onschadelijk), handscanner-stand (ingesteld vóór het omzetten; de schuif op het scanscherm is in de simpele stand verborgen maar de waarde blijft gelden), direct doorscannen. |
| B11 | Versie **1.16.0** in `app.js` (`VERSIE`) en `sw.js` (`VERSION = 'mgz-v1.16.0'`). |

## 3. Datamodel (README §Datamodel bijwerken)

Registratie krijgt twee optionele velden:

- `bl` (ms): "bijna leeg", gezet door een scan in de simpele stand. Zonder `best`.
- `vp` (geheel getal ≥ 1): aantal bestelde verpakkingen, ingevuld op de pc.

Nieuwe helper in `app.js`, sectie overzicht (bij `credVan`):

```js
// staat deze regel op de bestellijst: een bestelaantal, of "bijna leeg" uit de simpele stand
function opBestellijst(it) { return (it.best != null && it.best > 0) || !!it.bl; }
```

Overal waar nu `it.best != null && it.best > 0` (of `it.best > 0` / `s.best`) bepaalt of iets
"te bestellen" is, `opBestellijst(it)` gebruiken: `renderOverzicht` (filter `bestellen`),
`maakLijstItem` (badge), de rondje-scanlijst (`toonHistScans`, badge `bestel`), en de CSV.
Badgetekst zonder aantal: `bestel` (zonder getal) als alleen `bl` gezet is.

`schoonBesteld(keys)` wist voortaan ook `bl` en `vp` (naast `best`, `bsd`, `ink`). De
grafsteenregel blijft: geen `g` en geen `opm` → `verwijderRegistraties`.

## 4. Wijzigingen per bestand

### 4.1 `index.html`

1. **Header**: tussen `<h1>` en `.status-chip` een schuif:
   ```html
   <label class="switch header-simpel" title="Simpele weergave">
     <span class="switch-lbl">Simpel</span>
     <input type="checkbox" id="swSimpelHeader"><span class="track"></span>
   </label>
   ```
2. **Artikelpaneel** (`#artPanel .card`): alles vanaf `<div class="telrij">` tot en met de laatste
   `.btn-row` (met `#btnVerwijder` en `#btnAnnuleer`) in een wrapper `<div id="artNormaal">`
   zetten (alleen verplaatsen, niets wijzigen). Daarna, nog binnen `.card`:
   ```html
   <div class="btn-row" id="artSimpelKnoppen" hidden>
     <button class="btn primair" id="btnSimpelBestellen">✓ Bestellen, terug naar scannen</button>
     <button class="btn stil" id="btnSimpelAnnuleer">Annuleren</button>
   </div>
   ```
3. **Overzicht**: de filterregel `#ovFilterMelding` bestaat al en wordt door JS met `hidden`
   gestuurd (niet via CSS verbergen, zie bug A1); de onderste `.btn-row` met `#btnCsv` krijgt
   `id="ovKnoppen"`.
   In `#kaartBestellen`, vóór `<div id="ovBestellen">`:
   ```html
   <div class="uitleg-simpel" id="ovUitleg" hidden>
     <div class="uitleg-titel">Zo bestel je</div>
     <ol>
       <li>Dit zijn de artikelen die in het magazijn gescand zijn omdat ze bijna op zijn, per leverancier.</li>
       <li>Klik op het kopieer-icoontje <b>⧉</b> achter een nummer. Het nummer staat dan op het klembord; je hoeft niets met de muis te selecteren.</li>
       <li>Ga naar de webshop van de leverancier en log daar in.</li>
       <li>Plak het nummer uit de kolom <b>Hun nummer</b> in de webshop en bestel het artikel.</li>
       <li>Besteld? Vink het vakje <b>Besteld</b> aan en vul in hoeveel <b>verpakkingen</b> je hebt besteld. Een doos van 200 boutjes is 1.</li>
     </ol>
   </div>
   ```
4. **Instellingen**: als eerste kaart in `#view-instellingen`:
   ```html
   <div class="card" id="kaartSimpel">
     <h2>Weergave</h2>
     <div class="switch-row">
       <div>
         <div class="switch-titel">Simpele weergave</div>
         <div class="bijschrift">Alleen scannen en de bestellijst, voor collega's. Geldt voor dit apparaat.</div>
       </div>
       <label class="switch"><input type="checkbox" id="swSimpel"><span class="track"></span></label>
     </div>
   </div>
   ```

### 4.2 `style.css`

Nieuw blok "simpele weergave" (geen inline styles, geen bestaande regels wijzigen):

- `.header-simpel { display: none; align-items: center; gap: 8px; margin-left: auto; margin-right: 12px; }`
  en `.header-simpel .switch-lbl { font-size: 0.8rem; color: var(--muted); }`. In de bestaande
  `@media (min-width: 900px)`: `.header-simpel { display: flex; }`. Let op: `header` is nu
  waarschijnlijk `justify-content: space-between`; controleer dat h1, schuif en statuschip netjes
  op één regel staan (schuif rechts naast de statuschip).
- Verbergen in de simpele stand, via `body.simpel`:
  `body.simpel .handscanner-row, body.simpel #ovStats, body.simpel #ovKnoppen,
  body.simpel #view-instellingen .card:not(#kaartSimpel) { display: none; }`
  Niet via `display` op elementen die de app met het `hidden`-attribuut stuurt (dat was bug A1):
  `#rondjeHint`, `#ovFilterMelding`, `#kaartGeteld` e.d. worden in JS verborgen (`updateRondjeUI`
  zet de hint alleen als `!simpelAan()`; `pasOvFilterToe` houdt in de simpele stand
  `#ovFilterMelding` en alle kaarten behalve `#kaartBestellen` op `hidden`).
- Uitleg: `.uitleg-simpel { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-s); padding: 12px 16px; margin-bottom: 14px; font-size: 0.9rem; }`,
  `.uitleg-simpel .uitleg-titel { font-weight: 650; margin-bottom: 6px; }`,
  `.uitleg-simpel ol { margin: 0; padding-left: 1.3em; }`, `.uitleg-simpel li { margin: 4px 0; }`.
- Simpele besteltabel zonder kolom Aantal: `table.bestel-tabel.simpel th:nth-child(3) { width: 6rem; }`
  (Locatie), `table.bestel-tabel.simpel th:nth-child(4) { width: 11rem; text-align: right; }` (Besteld).
  De bestaande regels voor `th:nth-child(4)`/`(5)` gelden dan niet meer voor deze tabel; zet de
  nieuwe regels ná de bestaande.
- Verpakkingenveld: `input.ov-vp` dezelfde opmaak als `input.ov-ink` (voeg toe aan de bestaande
  selectorlijst `input.ov-aantal, input.ov-ink`) met `width: 4.5em; margin-left: 6px;`.
- Simpel artikelscherm: `.art-nr.groot { font-size: 1.35rem; font-weight: 700; margin-top: 4px; }` (blijft groen),
  `.art-grid.simpel { grid-template-columns: 1fr 1fr; }` (ook op ≥ 900 px: zet die regel ná de
  media query of met `body.simpel` ervoor), `.art-grid.simpel .art-field.vol { grid-column: 1 / -1; }`.
- Gescand in de simpele stand: `body.simpel .item .lijst-klaar { display: none; }` is NIET de weg;
  `maakLijstItem` zet het vinkje gewoon niet in de HTML (zie 4.3).

### 4.3 `app.js`

Volgorde volgens de secties in het bestand. Alle nieuwe identifiers en commentaar in het Nederlands.

**Constanten/state (bovenin):** niets nieuws nodig; de stand komt uit localStorage.

**Sectie "besteld-markering" (bij `wisselBesteld`/`schoonBesteld`):**

```js
// ---------- simpele weergave ----------
// per apparaat (mgz_simpel): alleen scannen en de bestellijst, voor collega's.
// "pc" = breed scherm (zelfde grens als de media query in style.css)
function simpelAan() { return localStorage.getItem('mgz_simpel') === '1'; }
function isPc() { return window.innerWidth >= 900; }
function simpelViews() { return isPc() ? ['scan', 'lijst', 'overzicht'] : ['scan', 'lijst', 'instellingen']; }

function pasSimpelToe() {
  const aan = simpelAan();
  document.body.classList.toggle('simpel', aan);
  $('swSimpelHeader').checked = aan;
  $('swSimpel').checked = aan;
  const toegestaan = simpelViews();
  document.querySelectorAll('nav button[data-view]').forEach(b => {
    b.hidden = aan && !toegestaan.includes(b.dataset.view);
  });
}

function zetSimpel(aan) {
  localStorage.setItem('mgz_simpel', aan ? '1' : '0');
  pasSimpelToe();
  if (!$('artPanel').hidden) sluitPaneel();
  const actief = document.querySelector('.view.active').id.replace('view-', '');
  if (aan && !simpelViews().includes(actief)) toonView('scan');
  else renderAlles();
  toast(aan ? 'Simpele weergave aan' : 'Simpele weergave uit');
}

// scan in de simpele stand: het artikel op de bestellijst zetten (bl = bijna leeg,
// zonder aantal) en terug naar de scanner. Bestaande velden van de registratie blijven.
function simpelBestellen() {
  if (!huidigArt) return;
  const art = huidigArt;
  const nu = Date.now();
  const oud = levend(telling.items[huidigeKey]);
  if (oud && opBestellijst(oud)) { sluitPaneel(); naSimpelScan(); return; }
  const entry = Object.assign(
    { b: art.b, a: art.a, o: art.o, c: art.c, f: art.f, h: art.h, l: art.l, v: art.v },
    oud || {}, { bl: nu, ts: nu });
  if (art.onb) entry.onb = true;
  telling.items[huidigeKey] = entry;
  bewaarTelling();
  planSync();
  const rondjeNieuw = rondjeRegistreerScan(huidigeKey, entry);
  toast('🛒 ' + (art.a || art.b) + ' op de bestellijst' + (rondjeNieuw.length ? ' · 📍 ' + rondjeNieuw.join(', ') + ' ✓' : ''));
  sluitPaneel();
  renderAlles();
  naSimpelScan();
}
function naSimpelScan() { if ($('swDoorscannen').checked && !handscannerAan()) startScanner(); }
```

`sluitPaneel` roept bij `updateWacht` `location.reload()` aan; dat blijft zo.

**`openPaneel(art, behoudBlader, key)`:** na het bepalen van `bestaand` een simpele tak:

```js
  const simpel = simpelAan();
  $('artNormaal').hidden = simpel;
  $('artSimpelKnoppen').hidden = !simpel;
  $('artGrid').classList.toggle('simpel', simpel);
  if (simpel) {
    bladerKeys = []; bladerIdx = -1;      // geen bladerpijlen in de simpele stand
    const opLijst = bestaand && opBestellijst(bestaand);
    const lijstBadge = opLijst ? ' <span class="badge geel">🛒 staat al op de bestellijst</span>' : '';
    $('artKop').innerHTML = art.onb
      ? '<div class="art-title">Onbekende code</div><div class="art-nr groot">' + esc(art.b) + lijstBadge + '</div>'
      : '<div class="art-title">' + esc(art.o) + '</div><div class="art-nr groot">' + esc(art.a) + lijstBadge + '</div>';
    $('artGrid').innerHTML = art.onb
      ? veld('Gescand', esc(art.b), '', true)
      : veld('Crediteur', esc(art.c || '–'), '', true) +
        veld('Fabrikantnummer', art.f ? '<span class="kopieer-waarde" data-copy="' + esc(art.f) + '">' + esc(art.f) + '</span>' : '–') +
        veld('Hun nummer', art.h ? '<span class="kopieer-waarde" data-copy="' + esc(art.h) + '">' + esc(art.h) + '</span>' : '–') +
        veld('Locatie', esc(art.l || '–')) +
        veld('Voorraad', esc(art.v || '0'), 'groen');
    bindKopieKnoppen($('artGrid'));
    $('btnSimpelBestellen').textContent = opLijst ? 'Terug naar scannen' : '✓ Bestellen, terug naar scannen';
    $('scanIdle').hidden = true;
    $('artPanel').hidden = false;
    $('bladerNav').hidden = true;
    $('uitloopBanner').hidden = true;
    toonView('scan');
    window.scrollTo(0, 0);
    return;
  }
```

`veld(lbl, val, klasse, vol)` krijgt een vierde parameter: `vol` → `class="art-field vol"`. De
bestaande aanroepen blijven ongewijzigd. Regels op het simpele scherm, conform Timo:
1 omschrijving, 2 artikelcode (groter), 3 crediteur (volle breedte), 4 fabrikantnummer + hun nummer,
5 locatie + voorraad, 6 de twee knoppen. "Tech. voorraad" heet hier "Voorraad". Geen ⚠-notatiebadge,
geen uitloopbanner, geen "al geteld"-badge.

**`maakLijstItem(it)` en `renderLijst()`:** in de simpele stand geen klaar-vinkje, geen
verwijderknop en geen blok Klaar; alle regels op scanvolgorde (nieuwste bovenaan, zoals nu).
Badges in de simpele stand: alleen `🛒 besteld · <datum>` (groen) als `it.bsd`, anders `bestel`
(geel, met aantal als `it.best > 0`) als `opBestellijst(it)`; geen geteld-, verschil- of uitloopbadge.
Klik op een regel opent gewoon het (simpele) paneel.

**`renderOverzicht()`:**
- `const bestellen = items.filter(opBestellijst);`
- `$('ovUitleg').hidden = !simpelAan();`
- In de simpele stand `ovStats` niet vullen (`innerHTML = ''`) en de tegelhandlers overslaan.
- `pasOvFilterToe()`: in de simpele stand alle kaarten `hidden` behalve `#kaartBestellen`
  (`#kaartUitloop` ook verborgen) en `#ovFilterMelding` op `hidden`. Buiten de simpele stand ongewijzigd.
- Besteltabel: in de simpele stand `class="bestel-tabel simpel"`, kolommen
  `Artikel | Hun nummer | Locatie | Besteld` (geen Aantal). De cel Besteld bevat dan het vinkje,
  `<input type="text" class="ov-vp" data-key=… inputmode="numeric" maxlength="4" placeholder="verp." value="…">`
  en daaronder de bestaande `.besteld-datum`. Normale stand: tabel als nu, en in `.besteld-datum`
  achter de datum ` · <vp> verp.` als `it.vp`.
- Aantalveld (normale stand): `value` leeg als `it.best == null` (regel met alleen `bl`), met
  `placeholder="–"`. `onchange`: leeg of < 1 → als `it.bl` dan `delete it.best` via `zetItem`,
  anders de bestaande foutmelding.
- Vinkje Besteld: na het aanvinken in de simpele stand het verpakkingenveld van die regel focussen
  (`querySelector('.ov-vp[data-key="…"]')` ná `renderAlles`). Let op `renderAlles` stelt uit zolang
  een veldje focus heeft; voeg `.ov-vp` toe aan de selector `'.ov-aantal, .ov-ink'` in `renderAlles`
  én aan de `onblur`-afhandeling zoals bij `.ov-ink`.
- Verpakkingenveld `onchange`: geheel getal ≥ 1 → `it.vp = n`; leeg → `delete it.vp`; anders toast
  "Aantal verpakkingen moet een getal zijn" en herstellen.
- Opschoonknoppen: ongewijzigd (B6).

**`toonView(naam)`:** ongewijzigd; verborgen navigatieknoppen betekenen niet dat de view niet
geopend mag worden (de setupbanner opent Instellingen ook in de simpele stand op de pc).

**CSV (`downloadScanlijst`):** kolommen `Bijna leeg` (`datumIso(it.bl)`) en `Verpakkingen`
(`it.vp`) toevoegen, na `Inkoopnummer`. Rondje-CSV ongewijzigd.

**`bindEvents()`:** `$('swSimpelHeader')` en `$('swSimpel')` → `change` → `zetSimpel(checked)`;
`$('btnSimpelBestellen')` → `simpelBestellen`; `$('btnSimpelAnnuleer')` → `sluitPaneel` plus
`naSimpelScan()` niet aanroepen (annuleren opent de camera niet opnieuw).

**`init()`:** na `pasHandscannerToe()`: `pasSimpelToe()`. De regel "op een pc direct het overzicht
tonen" blijft (ook in de simpele stand is dat de bestellijst).

**`renderAlles()`:** selector uitbreiden met `.ov-vp`.

**`schoonBesteld`:** `delete it.bl; delete it.vp;` toevoegen (zie §3).

**Versie:** `VERSIE = '1.16.0'`.

### 4.4 `sw.js`

`VERSION = 'mgz-v1.16.0'`. Geen andere wijziging (geen nieuwe bestanden in de shell-cache).

### 4.5 `tests/tests.py`

- `t_laden`: versiecheck naar `1.16.0`.
- Nieuwe test **`t_simpel_pc`** (apparaat 1280 breed, starten met `extra={'mgz_simpel': '1'}`):
  1. `document.body.classList.contains('simpel')`; navigatieknoppen `rondje` en `instellingen`
     `hidden`, `overzicht` zichtbaar; `$('swSimpelHeader').offsetParent !== null` (schuif in de header
     zichtbaar) en `$('swSimpelHeader').checked`.
  2. `zoekEnOpen('222')`: `$('artNormaal').hidden` is True, `$('artSimpelKnoppen').hidden` is False,
     `$('bladerNav').hidden`, tekst van `#artGrid` bevat `Voorraad` en niet `Tech.`, `#artKop` bevat
     `O1002` en geen "al geteld".
  3. `$('btnSimpelBestellen').click()`: `telling.items['222'].bl` is een getal, `best` afwezig/null,
     paneel dicht, toast bevat "op de bestellijst".
  4. Nog eens `zoekEnOpen('222')`: kop bevat "staat al op de bestellijst", knoptekst
     `Terug naar scannen`; klik → paneel dicht, `ts` ongewijzigd.
  5. `reg(pc, '111', bestel=2, geteld=7)` werkt niet in de simpele stand (paneel verborgen) → gebruik
     `telling.items['111'] = {...}` direct of zet simpel eerst uit. Eenvoudiger: zet `mgz_simpel`
     pas aan ná twee gewone registraties (111 met bestel 2 + geteld 7, 444 met opm) via
     `zetSimpel(true)` en controleer de toast "Simpele weergave aan".
  6. Overzicht: `$('ovUitleg').hidden` False; `$('kaartVerschillen').hidden` True; `#ovStats` leeg;
     koptekst van de besteltabel bevat geen `Aantal`; 222 én 111 staan in `#ovBestellen`;
     `.ov-vp` aanwezig, `.ov-ink` afwezig.
  7. Vinkje 222 aan → `document.activeElement.classList.contains('ov-vp')`; `.ov-vp` op 2 zetten +
     `change` → `telling.items['222'].vp == 2`.
  8. `toonView('instellingen'); zetSimpel(true)` (via de schuif: `$('swSimpel').checked = true;
     dispatchEvent(change)`) → `view-scan` actief, toast "Simpele weergave aan".
  9. Uitzetten via `$('swSimpelHeader')`: body zonder `simpel`, alle navigatieknoppen zichtbaar,
     tabelkop bevat `Aantal`, aantalveld van 222 leeg, `.besteld-datum` van 222 bevat `2 verp.`,
     `.ov-ink` terug.
  10. CSV via `PATCH_CSV` + `downloadScanlijst()`: kop bevat `Bijna leeg` en `Verpakkingen`; de
      regel van 222 heeft daar een datum en `2`.
  11. `schoonBesteld(['222'])` → regel is een grafsteen (geen g, geen opm).
  12. Geen JS-fouten.
- Nieuwe test **`t_simpel_telefoon`** (apparaat 412, `extra={'mgz_simpel': '1'}`):
  1. `$('swSimpelHeader').offsetParent === null` (header-schuif verborgen);
     navigatie: alleen `scan`, `lijst`, `instellingen` zichtbaar.
  2. `$('swSimpel').checked`; in `#view-instellingen` alleen `#kaartSimpel` zichtbaar
     (`getComputedStyle(kaart).display === 'none'` voor de andere kaarten); `.handscanner-row`
     op het scanscherm `display: none`.
  3. Scan 333 (dubbele barcode): de kiezer werkt nog; kies het tweede artikel → simpel paneel
     met `Ring 10 mm`.
  4. `btnSimpelBestellen` → regel in Gescand zonder `.lijst-klaar`, badge `bestel`.
  5. `zetSimpel(false)` → Gescand weer met klaar-vinkje; paneel van 333 toont weer `#artNormaal`.
  6. Geen JS-fouten.
- Bestaande tests moeten ongewijzigd slagen (zonder `mgz_simpel` is niets anders).
- `TESTS`-lijst aanvullen.

### 4.6 Documentatie

- `README.md`: datamodel (`bl`, `vp`), korte alinea "Simpele weergave" bij de beschrijving van de
  tabbladen, bestandentabel ongewijzigd.
- `INSTRUCTIES.md`: nieuw kopje **"Simpele weergave (voor collega's)"**: wat het is, waar de schuif
  staat (header op de pc, Instellingen op de scanner), wat de scanner doet (scannen = op de
  bestellijst), wat de pc doet (uitleg in de app, Besteld + verpakkingen), dat het per apparaat
  geldt en dat Timo de handscanner-stand vooraf instelt.
- `C:\Users\td\Projecten_AI\ASK\kennis\magazijnscanner.md`: onder "Zo gebruik je het" een blok
  **"Bijna leeg scannen en bestellen (simpele weergave)"** in de taal van de collega's: scanner
  pakken, scannen wat bijna leeg is, "Bestellen, terug naar scannen"; op de pc de bestellijst per
  leverancier, kopieer-icoontje, webshop, Besteld aanvinken, aantal verpakkingen. En onder "Vragen
  en antwoorden": "Ik zie geen tabblad Rondje/Instellingen" → simpele weergave staat aan.
- `LOGBOEK.md`: sessie-entry met wat gebouwd is, testuitslag, afwijkingen van dit plan.
- Dit plan: bovenaan "GEBOUWD op <datum>, nagekeken: nee".
- Vault: `item.py log MagazijnScanner "v1.16.0: simpele weergave gebouwd (niet gecommit)"`.

## 5. Controle (door Opus na het bouwen, door Fable bij het nakijken)

1. `node --check app.js` (als Node er is) en `python tests/draai.py`: alles groen, inclusief de twee
   nieuwe tests. Aantal checks noteren in het logboek.
2. Headless schermafdruk (zoals in de sessie van 19 oktober: `Page.captureScreenshot` via `cdp.py`,
   `--headless=new`, eigen profiel) van: pc-overzicht simpel met uitleg en twee leveranciers;
   telefoon-artikelscherm simpel; telefoon-instellingen simpel. Beoordelen op: alles in beeld, geen
   horizontale scrollbalk, zes regels op het artikelscherm in de juiste volgorde.
3. Zonder `mgz_simpel` ziet alles er exact uit als v1.15.0 (de bestaande tests dekken dit; bij
   twijfel `tests/visueel.py` tegen de vorige commit).
4. Versienummers: `Select-String -Path app.js,sw.js -Pattern "VERSIE = |VERSION = "`.

## 6. Wat Opus NIET mag doen

- Niet committen of pushen; geen browservenster openen; geen ADB; geen Chrome zonder
  `--headless=new` en eigen `--user-data-dir` (zie `CLAUDE.md`).
- Geen bestaand gedrag wijzigen buiten de simpele stand. Zonder `mgz_simpel` moet alles pixel-gelijk
  blijven, op de nieuwe schuifkaart in Instellingen, de (verborgen) header-schuif en de tekst
  "· n verp." onder een vinkje na.
- Geen `best = 1` of ander kunstmatig aantal opslaan (B3). Geen echte verwijdering van registraties
  (altijd grafstenen). Geen nieuwe sleutels; `sleutelVoor`/`registraties()`/`artikelVanRegistratie`
  blijven de basis.
- Geen inline styles; klassen in `style.css`. Geen `display` via CSS op elementen die de app met
  `hidden` stuurt (bug A1 uit de review).
- Broncode niet met `Get-Content`/`Set-Content` of `sed -i` bewerken (UTF-8 en LF).
- Geen bedrijfsdata, tokens of data-repo-inhoud in tests, docs of vault.
- Ontwerpkeuzes die hier niet staan: de keuze nemen die het dichtst bij dit plan blijft en die in het
  logboek vermelden; niet aan Timo vragen tenzij bouwen anders onmogelijk is.
