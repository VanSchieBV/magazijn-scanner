# Codereview Magazijn Scanner v1.13.5 — rapport voor de opschoonronde

> **Status (2026-10-08, later op de dag):** uitgevoerd in v1.14.0, secties A t/m E, met de keuzes van
> Timo (telkens de aanbevolen optie). Wat er per bevinding gedaan is, de keuzes en de testresultaten
> staan in `LOGBOEK.md`. Regelnummers hieronder verwijzen naar v1.13.5 en kloppen niet meer.

Datum: 2026-10-08. Opgesteld door Claude Fable 5.1 na het volledig lezen van `app.js` (2216 regels),
`index.html`, `style.css`, `sw.js`, `manifest.webmanifest`, `pc/Artikellijst-bijwerken.ps1`,
`pc/Artikellijst-bijwerken-taak.ps1`, `README.md`, `INSTRUCTIES.md` en de git-geschiedenis (43 commits).
Er is in deze ronde **niets gewijzigd** aan de app; dit rapport is de opdracht voor de uitvoerende sessie
(Opus 5.5). Regelnummers verwijzen naar de bestanden zoals ze op 2026-10-08 in de werkmap staan (commit
`93a1009` plus de niet-gecommitte wijzigingen in `pc/`).

Per bevinding staat de zekerheid:
- **Bevestigd** = gereproduceerd of één-op-één uit de code afleidbaar.
- **Waarschijnlijk** = uit de code afgeleid, niet in de browser nagespeeld; eerst reproduceren, dan fixen.

---

## 0. Werkafspraken voor de uitvoerende sessie

1. Lees eerst `CLAUDE.md` en `LOGBOEK.md` in de projectmap. De regels daar gelden (versienummers
   ophogen, geen `Get-Content`/`Set-Content` op broncode, committen alleen op verzoek van Timo).
2. Werk de secties in de volgorde A → B → C → D → E. Sectie A (fouten) heeft voorrang; sectie D en E
   zijn optioneel en pas na overleg met Timo.
3. **Gedrag mag niet veranderen** behalve waar een bevinding dat expliciet zegt. Een opschoonronde is
   geslaagd als de app er voor de gebruiker precies hetzelfde uitziet en werkt, minus de fouten.
4. Na elke sectie: `node --check app.js` (Node ontbreekt op de werkpc; dan `python -m http.server 8765`
   en de app in de browser openen) en de controlelijst in sectie G nalopen.
5. Eén versiebump voor de hele ronde is genoeg (`VERSIE` in `app.js` én `VERSION` in `sw.js`), tenzij Timo
   tussendoor wil uitrollen.
6. Beslissingen die Timo moet nemen staan gemarkeerd met **[keuze Timo]**. Niet zelf kiezen.

---

## A. Fouten

### A1. `hidden` werkt niet op twee flex-elementen — **Bevestigd (headless Chrome)**
- `style.css:309` `.blader-nav { display: flex }` en `style.css:562` `.filter-melding { display: flex }`.
  Een auteursregel `display: flex` wint van de browserregel `[hidden] { display: none }`.
  Gevolg: `$('bladerNav').hidden = true` (`app.js:625`) en `$('ovFilterMelding').hidden = !ovFilter`
  (`app.js:956`) hebben geen effect.
- Zichtbaar effect: in het artikelpaneel staan altijd de knoppen ‹ › (met de positie van de vorige keer);
  boven het Overzicht staat zonder filter een lege regel met de knop "Alles tonen".
- De auteur heeft hetzelfde probleem eerder al per element gerepareerd (`#scanIdle[hidden]` regel 105,
  `.btn-row[hidden]` regel 453). Dat zijn symptoomfixes.
- **Fix:** bovenaan `style.css` één regel `[hidden] { display: none !important; }` en de twee
  element-specifieke `[hidden]`-regels verwijderen. Testbestand: een html met de vier klassen en
  `getComputedStyle(...).display` (zo is het nu bevestigd: `.blader-nav` en `.filter-melding` gaven
  `flex`, `.rondje-hint` en `.btn-row` gaven `none`).

### A2. Afgeronde controle komt terug via een ander apparaat — **Waarschijnlijk (hoog)**
- `rondAf()` (`app.js:1186-1212`) archiveert en schrijft `telling.json` als `{items:{}}`; alleen het
  eigen apparaat leegt zijn lokale `telling`. `telling.json` heeft geen markering "afgerond op".
- `syncTelling()` (`app.js:215-224`) voegt lokale items toe die remote ontbreken en pusht dan. Apparaat B
  (bijv. de pc, die bij `init` altijd `syncTelling()` draait, regel 2205) heeft de oude controle nog
  lokaal staan en zet daarmee de hele gearchiveerde controle terug in de cloud.
- Reproductie: telefoon en pc beide gesynct met een paar regels → telefoon "Controle afronden" → pc
  openen (of tab weer zichtbaar maken) → Gescand-lijst is op beide apparaten weer gevuld.
- **Fix:** `telling.json` krijgt `afgerond: <ts>` (laatste afrondmoment). In `syncTelling` worden lokale
  items met `ts <= remote.afgerond` weggegooid vóór het samenvoegen, en `afgerond` wordt mee
  teruggeschreven. `rondAf` schrijft `{ items: {}, afgerond: Date.now() }`. Hetzelfde patroon staat al
  in `mergeRondje` (`app.js:1330-1334`: een actief rondje van vóór de laatste afronding vervalt).
- Let op bij het testen: bestaande `telling.json` zonder `afgerond` moet gewoon blijven werken.

### A3. Afronden gaat door als de sync ervoor mislukt — **Bevestigd (code)**
- `syncTelling()` vangt al zijn fouten zelf af (`app.js:226-230`) en geeft niets terug.
  `syncTellingDirect()` (`app.js:1214-1220`) wacht alleen tot `syncBezig` false is en kan niet zien of
  het gelukt is. `rondAf` archiveert daarna de lokale `telling` en leegt de cloud.
- Gevolg bij een mislukte ophaalactie (409/5xx/netwerk): registraties die alleen op andere apparaten
  stonden komen niet in het archief en worden gewist.
- **Fix:** `syncTelling` laat `return true/false` (of gooit) en `rondAf` stopt met een toast
  "Afronden afgebroken: sync mislukt" als het false is.

### A4. Registratiesleutel is de barcode; artikelen met dezelfde barcode overschrijven elkaar — **Bevestigd (code)** **[keuze Timo]**
- `openPaneel` (`app.js:541`): `huidigeKey = art.b`. De kiezer `toonKiezer` (`app.js:525`) bestaat
  juist omdat één barcode meerdere artikelen kan hebben. Twee registraties op dezelfde barcode delen
  dus één `telling.items[b]`; de tweede overschrijft de eerste (artikelnummer, omschrijving, aantallen).
- `openViaKey` (`app.js:638-643`), `maakLijstItem` (`app.js:858-861`), overzicht-rijen en uitloop
  (`app.js:1154`) openen altijd `artIndex.get(b)[0]`, dus altijd het eerste artikel, ook als de
  gebruiker het tweede had gekozen.
- Ook de uitlooplijst is per barcode (`rondje.uitloop[b]`, `app.js:700-705`).
- **Opties:** (a) sleutel wordt `b` als de barcode uniek is, anders `b + '|' + a`; bij het openen
  vanuit een lijst het artikel op `a` terugzoeken; migratie: bestaande sleutels blijven geldig.
  (b) Niets doen en documenteren dat dubbele barcodes één registratie delen.
  Hoeveel barcodes dubbel zijn is te zien met `[...artIndex.values()].filter(l => l.length > 1).length`
  in de browserconsole. Eerst dat getal aan Timo melden, dan kiezen.

### A5. Race in de sync: inhoud en sha komen uit twee losse verzoeken — **Bevestigd (code)**
- `syncTelling` (`app.js:208-211`) en `syncRondje` (`app.js:1362-1366`) halen eerst de ruwe inhoud
  (`ghGetRaw`) en daarna de sha via de mapindex (`ghDirInfo`). Pusht een ander apparaat daartussen, dan
  is de sha nieuw maar de inhoud oud: de PUT slaagt en de wijziging van het andere apparaat is weg.
- **Fix:** voor `telling.json` en `rondje.json` (klein, ver onder 1 MB) één GET op
  `API_BASE + bestand` met `Accept: application/vnd.github+json`: het antwoord bevat `sha` én `content`
  (base64) uit dezelfde commit. Decoderen met `TextDecoder` op
  `Uint8Array.from(atob(content.replace(/\n/g, '')), ch => ch.charCodeAt(0))`.
  `ghGetRaw` + `ghDirInfo` blijven alleen voor `artikelen.json` (kan groter dan 1 MB zijn).
- Bijvangst: één API-verzoek minder per sync (zie D1).

### A6. Scan gaat verloren als er een update klaarstaat — **Bevestigd (code)**
- `pasUpdateToe` (`app.js:2153-2161`) zet `updateWacht` als de camera open staat.
  `verwerkScan` (`app.js:422-428`) roept `stopScanner()` aan, en die herlaadt de pagina als
  `updateWacht && $('artPanel').hidden` (`app.js:409`). Op dat moment is het paneel nog verborgen, dus
  de pagina herlaadt vóórdat `zoekEnOpen` het artikel opent. De gescande code is kwijt.
- **Fix:** `stopScanner(geenReload)`; `verwerkScan` roept `stopScanner(true)` aan en laat de
  herlaad-controle aan `sluitPaneel` over (die doet dat al, regel 750).

### A7. Locaties sorteren op twee manieren — **Bevestigd (code)**
- Zonder `numeric: true`: Geteld (`app.js:999`), Telverschillen (`1015`), `downloadCsv` (`1162`):
  daar komt `11.2` vóór `2.1`.
- Mét `numeric: true`: `routeItems` (`1279`), uitloop (`1140`), `downloadLocFouten` (`175`).
- **Fix:** één helper `vergelijkLoc(a, b)` met `localeCompare(..., undefined, { numeric: true,
  sensitivity: 'base' })` en overal gebruiken. Dit verandert bewust de volgorde in het overzicht en de
  CSV (natuurlijk oplopend, zoals de route).

### A8. Catch-tak plant een sync die de finally-tak meteen overschrijft — **Bevestigd (code)**
- `syncTelling` regel 227: bij 409/422 `planSync()` (timer 1,5 s), maar regel 234 wist die timer en zet
  8 s. Zelfde in `syncRondje` (regel 1390 vs 1397). De 1,5 s-herkansing is dode logica.
- **Fix:** in de catch alleen `syncNodig = true` (resp. `rondjeSyncNodig = true`) zetten; de
  finally-tak doet de planning. Of andersom, als een snelle herkansing bij 409 de bedoeling is: de
  finally-tak alleen plannen als er nog geen timer loopt. **[keuze Timo: 1,5 s of 8 s na conflict]**

### A9. Statusbolletje: "Offline" terwijl er geen token is — **Bevestigd (code)**
- `syncTelling` regel 199: `if (!getToken() || !navigator.onLine) zetStatus('err', 'Offline')`.
  Zonder token is "Geen token" juist (zoals `init`, regel 2210). Twee aparte controles maken.

### A10. Historie-scans kunnen in het verkeerde sheet landen — **Waarschijnlijk**
- `laadHistScans` (`app.js:1854-1880`) controleert alleen of het histOverlay open is, niet of het nog
  om hetzelfde rondje gaat. Snel twee rondjes na elkaar openen → scans van rondje 1 onder rondje 2.
- **Fix:** `histOverlay` krijgt `dataset.id = hs.id`; na het ophalen alleen renderen als die nog gelijk is.

### A11. Zoeken breekt op een artikel zonder veld — **Waarschijnlijk (laag)**
- `handmatigZoeken` (`app.js:816-819`): `art.o.toUpperCase()`, `art.f...`, `art.h...`, `art.l...`
  zonder nullcheck. Het pc-script levert nu altijd alle velden, maar één oudere of handmatig
  bewerkte `artikelen.json` geeft een TypeError en een lege zoekactie zonder melding.
- **Fix:** zie D4 (vooraf één zoekstring per artikel bouwen, met `|| ''`).

### A12. Grafstenen worden nooit opgeruimd — **Bevestigd (code)**
- `telling`-grafstenen (`{del:true}`) verdwijnen pas bij afronden. Route-, uitloop- en check-grafstenen
  (`del`, `w:'reset'`) in `rondje.json` blijven voor altijd (`app.js:1316-1322`, `1337-1340`, `1755`,
  `1803`). Geen fout nu, wel groei.
- **Fix:** in `mergeRondje` en `syncTelling` grafstenen ouder dan 30 dagen weglaten (beide kanten
  hebben ze dan allang verwerkt). Constante `GRAFSTEEN_BEWAAR_MS` bovenin.

### A13. Repo-hygiëne — **Bevestigd**
- `pc/Artikellijst-bijwerken-taak.ps1` (het script van de geplande taak) is **niet gecommit**;
  bij een nieuwe pc is het weg. Wijzigingen in `pc/Artikellijst-bijwerken.ps1` en `INSTRUCTIES.md`
  van 7 augustus staan ook nog niet in git. (Vault-issue "Wijzigingen van 7 augustus staan nog niet in git".)
- `pc/_laatst-verwerkt.txt` en `pc/bijwerken-taak.log` zijn runtime-bestanden → in `.gitignore`.
- `Artikelen kopie.xlsx` (1,1 MB bedrijfsdata) staat in de **projectroot**, buiten `Bron/`. Niet
  gecommit, maar één `git add .` en het staat in de publieke Pages-repo. Verplaatsen naar `Bron/` of
  verwijderen. **[keuze Timo]**
- `.claude/settings.local.json` (permissielijst) hoort niet in de repo → `.claude/settings.local.json`
  in `.gitignore`; `.claude/settings.json` is leeg (`{}`) en mag mee of weg.
- Waarschuwing `LF will be replaced by CRLF`: voeg `.gitattributes` toe met `* text=auto eol=lf`
  zodat de broncode altijd LF heeft (PowerShell-scripts mogen CRLF: `*.ps1 text eol=crlf`).

### A14. Pc-script gebruikt een ander token dan de instructie beschrijft — **Bevestigd (informatief)**
- `pc/Artikellijst-bijwerken.ps1:249-260` haalt het wachtwoord via `git credential fill` uit de
  Windows Credential Manager (de GitHub Desktop-login van Timo), niet de fine-grained PAT uit
  `INSTRUCTIES.md`. Werkt, maar is een breder token. Alleen documenteren in `INSTRUCTIES.md`
  (hoofdstuk "Op de PC"), geen codewijziging.

---

## B. Dode code en restanten

| # | Waar | Wat | Actie |
|---|------|-----|-------|
| B1 | `style.css:669` | `.set-row input[type="password"]` — er is geen password-veld meer (token is `type=text` + `.masked`) | selector weghalen |
| B2 | `app.js:436-511` + `2075` | Twee handscanner-paden: de toetsaanslag-buffer (`hsBuffer`, `hsTimer`, `hsVerwerk`, `hsKeydown`, v1.13.0) en het veld-pad (`hsVerwerkVeld`, `hsVeldTimer`, `input`-listener regel 1973, v1.13.2). De buffer draait alleen nog als de zoekbalk de focus kwijt is | buffer-pad houden als vangnet, maar `hsVerwerk` en `hsVerwerkVeld` samenvoegen tot één `hsOpen(code)`; commentaar erbij dat het pad een vangnet is |
| B3 | `app.js:337` en `318` | `audioCtx` wordt op twee plekken aangemaakt | één `zorgAudio()`; de aanmaak in `startScanner` is de nuttige (binnen een klik), `piep` houdt het als vangnet |
| B4 | `app.js:2172` en `2098` | Twee `visibilitychange`-listeners (`registreerSw` en `bindEvents`) | samenvoegen; `reg` in een module-variabele |
| B5 | `app.js:65, 1230, 2151, 932, 935, 1924` | State-variabelen staan onder hun eerste gebruik (`artMeta` gebruikt op 55, `rondje` op 39, `updateWacht` op 409, `renderUitgesteld` op 1091). Werkt door volgorde van aanroep, leest verwarrend | alle `let`-state naar het blok `// ---------- state ----------` bovenin |
| B6 | `README.md` | Noemt het taakscript en de map `pc/` niet; `INSTRUCTIES.md` is actueler | README actualiseren (zie E4) |
| B7 | `index.html:5` | `maximum-scale=1` blokkeert zoomen. Bewust voor een scan-app; geen actie, alleen vastleggen in `CLAUDE.md` | — |
| B8 | projectroot | `Artikelen kopie.xlsx` | zie A13 |

Ongebruikte functies, variabelen, CSS-klassen of html-id's zijn er verder **niet** (gecontroleerd met een
script over alle definities). Dat is netjes voor een app van deze omvang.

---

## C. Duplicatie → helpers (gedrag blijft gelijk)

| # | Nu | Voorstel |
|---|----|----------|
| C1 | CSV-cel `cel()` 3× (`app.js:177, 1165, 1883`) en blob + `<a download>` 3× (`183-188, 1176-1182, 1902-1907`) | `csvCel(v)` en `downloadTekst(naam, regels, 'text/csv;charset=utf-8')` (BOM erin) |
| C2 | `parseInt(it.v, 10) \|\| 0` 7× (`765, 842, 845, 972, 1000, 1016` …) en twee verschillende verschil-tests (`842` vergelijkt strings, `972` getallen) | `systeemVoorraad(it)` en `heeftVerschil(it)`; beide op getallen |
| C3 | `openPaneel` en `openPaneelOnbekend` (`540-601`) delen ±15 regels | één `toonPaneel(art, behoudBlader)`; onbekend = `art.onb` (kop en grid verschillen, de rest niet) |
| C4 | Tijdstempel-id `jjjj-mm-dd_uumm` 2× (`1195-1197`, `1489-1491`) | `stempelId(d)` |
| C5 | Grafsteen `{ b, ts, del: true }` 3× (`729, 878, 912`) | `verwijderRegistratieKey(key)` die ook `bewaarTelling(); planSync();` doet |
| C6 | Klembord 2× (`603-612`, `1071-1078`) | `kopieer(tekst)` met de toast erin |
| C7 | "nieuwste ts wint"-merge 4× (`217-219, 1316-1318, 1320-1322, 1338-1344`) | `mergeOpTs(lokaal, remote)` → `{ samen, veranderd }` |
| C8 | Artikelcel `<td><b>…</b><br><span style="color:var(--muted)">…</span></td>` 4× (`1002, 1018, 1049, 1130`) | `artikelCel(it)` + CSS-klasse `.oms` i.p.v. inline style |
| C9 | 25+ `style="…"` in `index.html` en in JS-strings (`font-size:.83rem;color:var(--muted)` enz.) | klassen `.sub`, `.muted`, `.klein-tekst` in `style.css`; `.set-row .sub` bestaat al |
| C10 | `$('xOverlay').classList.add/remove('open')` 12× | `openSheet(id)` / `sluitSheet(id)` |
| C11 | `bewaarRondje(); planRondjeSync(); renderRondje(); updateRondjeUI();` 8× achter elkaar | `rondjeGewijzigd()` |

Vuistregel: alleen samenvoegen wat écht hetzelfde doet. Een helper met drie vlaggen is slechter dan twee
korte functies.

---

## D. Efficiëntie

| # | Bevinding | Voorstel | Winst |
|---|-----------|----------|-------|
| D1 | Bij de start 5 API-verzoeken (`verversArtikelen`: mapindex; `syncTelling`: raw + mapindex; `syncRondje`: raw + mapindex), waarvan 3× dezelfde mapindex. Per wijziging 3 verzoeken | met A5 (contents-JSON voor telling/rondje) → 3 bij start, 2 per wijziging | minder wachten op trage werk-wifi, minder rate-limit |
| D2 | Drie parallelle processen schrijven elkaars status over via `zetStatus` (bijv. "Actueel" terwijl de sync nog loopt) | `busy`-teller: status pas op "ok" als alle drie klaar zijn; of één `zetStatus` na `Promise.allSettled` in `init` | juistere statusweergave |
| D3 | `updateArtInfo()` (`162-169`) loopt bij elke `updateRondjeUI` (`1641`), dus na elke sync en elk vinkje, over alle artikelen met regex; `locUitzondering` (`37-40`) is daarbinnen lineair over de uitzonderingenlijst | uitzonderingen als `Set` (lowercase) bijhouden; teller alleen herberekenen als `artikelen` of `locUitz` wijzigt | enkele ms per keer nu; schaalt bij 20k+ artikelen |
| D4 | `handmatigZoeken` (`816-819`): 6× `toUpperCase()` per artikel per zoekactie | in `bouwIndex` per artikel één veld `art._zoek = [o,a,f,h,b,l].join(' ').toUpperCase()`; niet opslaan in localStorage (`bewaarArt` filtert het eruit) | sneller zoeken, lost A11 op |
| D5 | `renderAlles` (`1925-1931`) rendert de Gescand-lijst altijd, ook als dat tabblad niet actief is | alleen renderen als `view-lijst` actief is; `navBadge` apart bijwerken via `updateNavBadge()`; `toonView('lijst')` rendert al (regel 1917) | minder DOM-werk na elke sync |
| D6 | `mgz_art` in localStorage: de hele artikellijst als JSON (bij ~10k artikelen 1–3 MB; limiet ±5 MB, effectief soms 2,5 MB). Niet gemeten (de data-repo is vanuit deze sessie niet gelezen) | nu: `QuotaExceededError` apart afvangen en melden ("Artikellijst te groot voor de cache"); later: IndexedDB. **[keuze Timo]** | duidelijke fout i.p.v. "Verversen mislukt" |
| D7 | `zxing.min.js` (332 kB) wordt altijd geladen, ook als `BarcodeDetector` bestaat (alle moderne Android-Chrome) | script dynamisch laden in de fallback-tak van `startScanner`; wel in de SW-shell houden voor offline | snellere start, minder geheugen |
| D8 | Scanner: `detect` elke 140 ms op een canvasuitsnede; `getContext` per frame | niets doen (getContext geeft dezelfde context terug) | — |

---

## E. Structuur en onderhoud

- **E1. Indeling `app.js`.** De secties staan er, maar niet in logische volgorde en de state is verspreid.
  Voorstel (zonder modules, zodat er geen build-stap nodig is): constanten en state → opslag → GitHub-API
  → sync (telling + rondje) → scanner → handscanner → paneel → lijst → overzicht → rondje → UI/events →
  init. Pas na A–D doen, in één aparte commit "alleen verplaatsingen" zodat de diff controleerbaar blijft.
- **E2. Twee versienummers.** `VERSIE` (`app.js:7`) en `VERSION` (`sw.js:2`) moeten samen omhoog.
  Houden (geen build-stap), maar vastleggen in `CLAUDE.md` (gedaan) met een PowerShell-eenregelige die
  beide nummers toont. Alternatief: `sw.js` stuurt zijn versie via `postMessage` en `versieInfo` toont
  beide. **[keuze Timo]**
- **E3. Geen tests.** De pure logica is goed testbaar: `locValtBinnen`, `locSegmenten`, `isoWeekKey`,
  `rondjeDue`, `mergeRondje`, de telling-merge (na C7 als `mergeOpTs`), `LOC_NOTATIE`. Voorstel: een
  `tests/test.html` die `app.js` niet laadt maar de pure functies uit een nieuw `logica.js` (ES-module,
  ook door `app.js` geladen via `<script type="module">`). Draait in de browser via `python -m http.server`;
  geen Node nodig. Pas doen als Timo het wil. **[keuze Timo]**
- **E4. Documentatie.** `README.md` actualiseren: bestandsoverzicht (incl. `pc/` en de geplande taak),
  verwijzing naar `INSTRUCTIES.md`, datamodel van `telling.json`/`rondje.json` (sleutels `b a o c f h l v g
  best opm ts onb bsd ink kl del`) zodat een volgende sessie niet de code hoeft te lezen om de velden te
  kennen. `LOGBOEK.md` en `CLAUDE.md` zijn op 2026-10-08 aangemaakt.
- **E5. `.gitignore` / `.gitattributes`.** Zie A13.

---

## F. Beveiliging (informatief, geen actie nodig tenzij aangegeven)

- **F1.** Het token staat in localStorage; het XSS-oppervlak is klein omdat elke data-invoeging in
  `innerHTML` door `esc()` gaat. Gecontroleerd: alle tekstvelden zijn ge-escaped. Niet ge-escaped zijn
  getallen (`it.g`, `it.best`, `n`, `s.g`). Die komen uit `parseInt`, maar `telling.json` kan ook door
  een ander apparaat of met de hand bewerkt zijn. Aanbeveling: bij het samenvoegen `g`/`best` met
  `Number()` forceren of ook door `esc()` halen (goedkoop).
- **F2.** `confirm()` (8×) blokkeert de UI; prima voor deze app.
- **F3.** `Bron/` staat in `.gitignore`; goed. Zie A13 voor het bestand buiten `Bron/`.

---

## G. Controlelijst na de opschoonronde

Doorlopen in de browser (pc, `python -m http.server 8765`) en op de telefoon na uitrol:

1. Artikel scannen/zoeken → paneel opent; **geen** ‹ › knoppen als er maar één registratie is (A1).
2. Overzicht zonder filter → **geen** lege filterregel met "Alles tonen"; met filter wél (A1).
3. Twee apparaten: registratie op A → verschijnt op B; afronden op A → B blijft leeg na sync (A2).
4. Afronden met wifi uit → melding, niets gewist (A3).
5. Camera open, update klaar (versie bumpen, pagina elders verversen) → scan → artikel opent, daarna pas herladen (A6).
6. Overzicht Geteld: locaties in natuurlijke volgorde (2.1 vóór 11.2) (A7).
7. Handscanner-schuifje aan: scannen zonder toetsenbord werkt; ⌨-knop opent het toetsenbord (B2).
8. CSV-downloads (Scanlijst, Afwijkende locaties, Rondje) openen in Excel met de juiste kolommen (C1).
9. Besteloverzicht: aantal/besteld/inkoopnummer inline bewerken, in- en uitklappen (C8/C9).
10. Rondje: starten, scan vinkt locatie af, handmatig afvinken, overslaan, afronden, historie + CSV.
11. Uitloop: markeren, melding bij scan, lijst in Overzicht, weer verwijderen.
12. Instellingen: token opslaan en testen, uitzonderingenlijst opslaan, scanpositie-schuif, rondjesdag.
13. Offline openen (vliegtuigmodus): app start uit de cache, status "Offline", na online weer sync.

---

## H. Samenvatting voor Timo

- **Drie echte fouten met gevolgen voor data:** een afgeronde controle komt via een ander apparaat terug
  (A2), afronden gaat door als de sync mislukt (A3), en een race in de sync kan een wijziging van het
  andere apparaat overschrijven (A5). Alle drie zitten in dezelfde ±60 regels synclogica.
- **Eén zichtbare UI-fout** die al sinds v1.3 bestaat (A1): knoppen ‹ › en de regel "Alles tonen" zijn
  altijd zichtbaar. Eén CSS-regel lost het op.
- **Eén ontwerpkeuze** om te maken (A4): dubbele barcodes delen nu één registratie.
- **Dode code is er nauwelijks**; wel veel duplicatie (sectie C) die zonder gedragsverandering in
  helpers kan. De app is voor een eerste project netjes gebouwd.
- **Efficiëntie** is voor de huidige omvang geen probleem; D1 (minder API-verzoeken) en D4 (zoeken) zijn
  de twee die merkbaar zijn.
- **Repo-hygiëne** (A13) is het dringendst: het taakscript staat niet in git en er ligt bedrijfsdata
  buiten `Bron/`.
