# Magazijn Scanner

PWA voor magazijncontrole met barcode/QR-scanner via de telefooncamera of een handscanner.

- **App:** https://vanschiebv.github.io/magazijn-scanner/ (GitHub Pages, repo `VanSchieBV/magazijn-scanner`)
- **Data:** privé-repo `VanSchieBV/magazijn-data` (`artikelen.json`, `telling.json`, `rondje.json`,
  `archief/`) via de GitHub Contents API met een fine-grained PAT (alleen Contents read/write op die repo).
- **Handleiding voor gebruikers:** `INSTRUCTIES.md` (installatie, token per apparaat, dagelijks gebruik,
  wekelijks rondje, uitloop, de pc-kant met de geplande taak).
- **Afspraken voor Claude Code:** `CLAUDE.md`. **Sessiegeschiedenis:** `LOGBOEK.md`.
  **Codereview met de opschoonronde:** `RAPPORT-CODEREVIEW-2026-10-08.md`.

## Gebruik in het kort

Scannen → artikelpaneel (geteld / bestellen / opmerking / besteld / uitloop) → opslaan. Tabblad
**Gescand** toont de lopende controle, **Rondje** de wekelijkse controleroute, **Overzicht** (pc)
telverschillen en bestellingen per crediteur, **Instellingen** token, artikellijst en werkwijze.
"Controle afronden" archiveert de controle in de cloud en maakt de lijst leeg, op alle apparaten.

## Bouwen en testen

Geen build-stap. Lokaal: `python -m http.server 8765` in de projectmap, dan `http://localhost:8765/`.
Bij elke wijziging aan de app **`VERSIE` in `app.js` én `VERSION` in `sw.js` ophogen**, anders blijven
de apparaten de oude versie uit de cache gebruiken. Scanner: native `BarcodeDetector` waar beschikbaar,
anders ZXing (`zxing.min.js`, lokaal gebundeld en pas geladen als hij nodig is).

**Testreeks** (sinds v1.14.0): `python tests/draai.py` start de app-server en een nep-GitHub, draait de
echte app in headless Chrome (geen venster, eigen tijdelijk profiel) en loopt ruim 120 checks na: sync
tussen twee apparaten, afronden, conflicten, dubbele barcodes, handscanner, rondje, uitloop, CSV,
overzicht en instellingen. Alleen een deel: `python tests/draai.py t_a4` (filter op testnaam). Nodig:
Python 3, Chrome of Edge en `pip install websocket-client`; Node is niet nodig. De testdata is verzonnen
(`tests/testdata.py`), het token is een nep-token. `tests/visueel.py` vergelijkt de berekende opmaak van
een oude en de huidige versie (uitleg bovenin dat bestand). Let op: `tests/` staat ook op GitHub Pages;
er hoort dus nooit echte data of een echt token in.

## Artikellijst bijwerken (pc)

`pc/Artikellijst-bijwerken.ps1` leest `Bron\Artikelen.xlsx` (tabblad *Artikellijst*, rechtstreeks uit
de ZIP/XML, Excel wordt niet gestart), zet de crediteurcode om naar de naam uit `Bron\Crediteuren.xlsx`,
schoont rijen zonder barcode op en pusht `artikelen.json` naar de data-repo. Het token komt uit de
Windows Credential Manager (`git credential fill`, de login van GitHub Desktop), niet het fine-grained
token van de app. `pc/Artikellijst-bijwerken-taak.ps1` is de wrapper voor de geplande taak "Magazijn
Scanner - Artikellijst bijwerken" (werkdagen 09:15 en 12:45; draait alleen als de export is gewijzigd;
log in `pc/bijwerken-taak.log`). De taakregistratie zelf staat niet in git.

## Bestanden

| Bestand | Rol |
|---------|-----|
| `index.html` | vijf views (scan, lijst, rondje, overzicht, instellingen), camera-overlay, sheets |
| `style.css` | donker thema, CSS-variabelen in `:root`, tekst- en hulpklassen (geen inline styles) |
| `app.js` | alle logica, in deze volgorde: constanten en state, locaties, opslag, GitHub-API, samenvoegen, sync (telling + afronden, rondje), artikellijst, CSV, scanner, handscanner, paneel, lijst, overzicht, rondje, UI/events, start |
| `sw.js` | service worker: shell-cache per `VERSION`, API-verkeer nooit cachen, auto-update |
| `zxing.min.js` | fallback-decoder voor toestellen zonder `BarcodeDetector` |
| `manifest.webmanifest`, `icon-*.png` | PWA |
| `tests/` | testreeks: `draai.py` (start alles), `tests.py`, `cdp.py` (Chrome-driver), `mockgh.py` (nep-GitHub), `testdata.py`, `visueel.py` |
| `pc/` | PowerShell-scripts en (niet in git) de runtime-bestanden van de geplande taak |
| `Bron/` | Excel-exports met bedrijfsdata (niet in git; `*.xlsx` en `*.csv` worden overal genegeerd) |
| `.gitattributes` | LF voor alle broncode, CRLF voor `.ps1` |

## Datamodel

Artikel (`artikelen.json`, veld `artikelen[]`): `b` barcode, `a` artikelnummer, `o` omschrijving,
`c` crediteur, `f` fabrikantcode, `h` hun nummer, `l` locatie, `v` technische voorraad (string).
Bestand heeft ook `bijgewerkt` (datum van de export). In het geheugen krijgt elk artikel ook `_zoek`
(zoekstring), die niet wordt opgeslagen.

Registratie (`telling.json`, `items[sleutel]`): de artikelvelden plus `g` geteld, `best` bestellen,
`opm` opmerking, `ts` tijdstempel (ms), `onb` onbekende code, `bsd` besteld-tijdstempel, `ink`
inkoopnummer, `kl` klaar-tijdstempel, `del` grafsteen. Het bestand heeft daarnaast `afgerond` (ms):
het laatste moment van "Controle afronden"; elk apparaat gooit zijn lokale registraties van vóór dat
moment weg, zodat een afgeronde controle niet terugkomt.

**Sleutel** (`sleutelVoor` in `app.js`): de barcode, of `barcode|artikelnummer` als meerdere artikelen
dezelfde barcode hebben (in de export van september 13 barcodes). Registraties van vóór v1.14.0 onder de
kale barcode blijven geldig voor het artikel waarvan ze zijn. Dezelfde regel geldt voor `rondje.uitloop`
en voor `rondje.actief.scans`.

Samenvoegen: per sleutel wint de nieuwste `ts` (`mergeOpTs`). Verwijderen gaat via een grafsteen
(`del: true` + `ts`); grafstenen ouder dan 30 dagen worden bij de sync opgeruimd. Lezen en schrijven van
`telling.json` en `rondje.json` gaat met inhoud én sha uit één verzoek; schreef een ander apparaat
tussendoor, dan weigert GitHub (409) en probeert de app het na 1,5 s opnieuw (na een netwerkfout 8 s).

Rondje (`rondje.json`): `route{id:{loc,label,gebied,ts,del}}`, `actief{gestart,checks{id:{ts,w,n,opm}},scans{sleutel:{…}}}`
met `w` = scan | hand | skip | reset, `historie[]` (samenvattingen), `archiefWacht[]` (rapporten die nog
naar `archief/rondje-<id>.json` moeten), `locUitz{ts,lijst}`, `gebieden{ts,lijst}`,
`uitloop{sleutel:{b,a,o,l,ts,del}}` (`b` ontbreekt bij regels van vóór v1.14.0; daar is de sleutel de barcode).

Per apparaat in localStorage (`mgz_*`): token, artikellijst-cache (`mgz_art`, ca. 1,2 MB van de ca. 5 MB
die de browser toestaat; bij een volle opslag meldt de app dat), telling, rondje, handscanner,
doorscannen, scanpositie, knop-boven, rondjesdag, ingeklapte crediteurblokken.
