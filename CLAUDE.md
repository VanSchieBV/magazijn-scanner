# MagazijnScanner — afspraken voor Claude Code

PWA (vanilla JS, geen build-stap) voor magazijncontrole met barcode/QR-scanner, live op GitHub Pages
(`https://vanschiebv.github.io/magazijn-scanner/`), geïnstalleerd op Timo's werktelefoon (werkprofiel,
uitzondering van IT; updates komen vanzelf via de service worker). Data in de privé-repo
`VanSchieBV/magazijn-data`. Antwoord in het Nederlands; identifiers en commentaar in code ook.

## Leesvolgorde bij een nieuwe sessie

1. `LOGBOEK.md` lezen en kort samenvatten waar we gebleven waren.
2. De projectlog uit de vault staat al in de context (SessionStart-hook "Projectlog magazijnscanner").
3. Bij een opschoon- of reviewronde: `RAPPORT-CODEREVIEW-2026-10-08.md`.

## Bouwen, testen, uitrollen

- Geen build. Syntaxcheck: `node --check app.js` (Node ontbreekt op de werkpc; dan overslaan, de
  testreeks laadt de app toch in Chrome en meldt elke JavaScript-fout).
- **Testreeks na elke wijziging:** `python tests/draai.py` (ruim 120 checks, ca. 3 minuten; headless
  Chrome met eigen tijdelijk profiel en een nep-GitHub, dus geen venster, geen echt token, geen echte
  data). Alleen een deel: `python tests/draai.py t_a4`. Nieuwe functionaliteit krijgt een test in
  `tests/tests.py`. Bij een opschoonronde waarin het uiterlijk gelijk moet blijven: `tests/visueel.py`.
- Lokaal met de hand testen: `python -m http.server 8765` in de projectmap en `http://localhost:8765/`
  in de browser (dat opent een venster: eerst vragen). Testdata (token, registraties) achteraf uit
  localStorage opruimen. Het token van de localhost-kopie is een eigen token; de telefoon en de
  pc-bladwijzer hebben hun eigen token.
- **Bij elke wijziging aan de app beide versienummers ophogen:** `VERSIE` in `app.js` (bovenin, blok constanten) en
  `VERSION` in `sw.js` (`mgz-vX.Y.Z`). Zonder sw-bump krijgen de apparaten de nieuwe code niet.
  Controle: `Select-String -Path app.js,sw.js -Pattern "VERSIE = |VERSION = "`.
- Commits in het Nederlands, versie voorop: `v1.13.6: korte beschrijving`.
  **Committen en pushen alleen op Timo's verzoek.** Push naar `main` = uitrol (GitHub Pages cachet
  ±10 minuten).
- Broncode **nooit** met `Get-Content`/`Set-Content` bewerken (PowerShell 5.1 sloopt UTF-8); gebruik de
  Edit/Write-tools (of Python met `encoding='utf-8', newline=''`). Ook geen `sed -i` uit Git Bash:
  dat zet CRLF stilletjes om. Geen dubbele aanhalingstekens in commit-here-strings.
- Regeleinden: `.gitattributes` houdt alle broncode op LF en de `.ps1`-scripts op CRLF.
- `Bron/` (Excel-exports met bedrijfsdata) staat in `.gitignore` en blijft daar. Nooit bedrijfsdata,
  tokens of de data-repo-inhoud in de publieke repo of in vault-items zetten.

## Wat mag zonder vragen

Code lezen en schrijven, de testserver starten, de testreeks (`tests/draai.py`) en ander headless
Chrome-werk, mits altijd met `--headless=new` en een eigen `--user-data-dir` (zonder die twee koppelt
`chrome.exe` aan Timo's open browser en opent een venster), `git status`/`diff`/`log`/`stash list`. Niet zonder vragen: committen, pushen, een browservenster
openen, ADB naar de telefoon, de geplande taak of Credential Manager aanraken.

## Ontwerpregels (vastgelegd in de vault als beslissingen)

- Verwijderen gaat altijd via een grafsteen (`del: true` + `ts`), nooit echt wissen; overal filteren
  met `levend()`. Samenvoegen: nieuwste `ts` wint per sleutel (`mergeOpTs`). Grafstenen ouder dan
  30 dagen ruimt de sync op (`GRAFSTEEN_BEWAAR_MS`).
- Registratiesleutel (`sleutelVoor`): de barcode, of `barcode|artikelnummer` als meerdere artikelen die
  barcode delen; oude sleutels blijven geldig. Nooit meer `it.b` als sleutel gebruiken; lijsten werken
  met `registraties()` (kopie met `it.key`) en het artikel bij een regel komt uit
  `artikelVanRegistratie(it)`. Zelfde regel voor de uitlooplijst en de scans van een rondje.
- `telling.json` draagt `afgerond` (ms); lokale registraties van vóór dat moment vervallen bij de sync.
  Afronden breekt af als de sync ervoor mislukt. Syncbestanden lezen met inhoud én sha uit één
  verzoek (`ghGetMetSha`); herkansing 1,5 s na een conflict, 8 s na een netwerkfout.
- Statusbolletje via `zetStatus(taak, soort, tekst)` met taak `'art'` of `'telling'`: bezig wint,
  daarna een fout, anders de laatste melding.
- Locaties tolerant matchen (`locSegmenten` splitst op `.` én `-`), maar afwijkende notaties met ⚠
  zichtbaar maken (`locNotatieOk`); bewust vrije locaties staan op de uitzonderingenlijst (`locUitz`).
- Terminologie: "controle" (niet telling), tabblad "Gescand", Bestellen vóór Geteld, waarden met één
  tik kopieerbaar, vaste kolomposities in de besteltabel, alles in beeld zonder scrollbalk.
- Viewport `maximum-scale=1` en `interactive-widget=overlays-content` zijn bewust (scan-app, scherm
  verspringt niet bij het toetsenbord).
- Scanner: native `BarcodeDetector` waar beschikbaar, anders ZXing (lokaal gebundeld); alleen codes
  binnen het scanvlak.
- Per apparaat (niet gesynct, localStorage `mgz_*`): token, handscanner-stand, doorscannen,
  scanpositie, knop-boven, rondjesdag, ingeklapte crediteurblokken. Gesynct via de data-repo:
  `telling.json`, `rondje.json` (route, actief rondje, historie, uitzonderingen, gebieden, uitloop),
  `archief/`.

## Vault (NoteFlow-projecten)

Projectmap `SecondBrain\NoteFlow\projecten\MagazijnScanner\`. Na elk afgerond onderdeel:
`python C:\Users\td\ClaudeBeheer\projecten\item.py log MagazijnScanner "<onderwerp>"` met de tekst via
stdin; nieuwe ideeën/issues/beslissingen meteen als item. Zie de algemene regels in
`C:\Users\td\.claude\CLAUDE.md`.

## Bestanden

| Bestand | Rol |
|---------|-----|
| `index.html`, `style.css`, `app.js` | de app (één bestand JS, ±2400 regels, secties met `// ----------`; alle state bovenin; geen inline styles, klassen in `style.css`) |
| `sw.js` | service worker: shell-cache per `VERSION`, API-verkeer nooit cachen |
| `zxing.min.js` | fallback-decoder, pas geladen als er geen `BarcodeDetector` is (wel in de sw-cache) |
| `tests/` | testreeks (`draai.py` start alles; zie README) |
| `manifest.webmanifest`, `icon-*.png` | PWA-installatie |
| `pc/Artikellijst-bijwerken.ps1` | Excel-export → `artikelen.json` → data-repo (handmatig of via de taak) |
| `pc/Artikellijst-bijwerken-taak.ps1` | wrapper voor de geplande taak (werkdagen 09:15 en 12:45) |
| `pc/_laatst-verwerkt.txt`, `pc/bijwerken-taak.log` | runtime-bestanden van de taak (niet in git) |
| `Bron/` | `Artikelen.xlsx`, `Crediteuren.xlsx`, oude kopie `Artikelen kopie.xlsx` (niet in git; `*.xlsx`/`*.csv` overal genegeerd) |
| `INSTRUCTIES.md` | gebruikershandleiding (installatie, token, dagelijks gebruik, rondje) |
| `RAPPORT-CODEREVIEW-2026-10-08.md` | review met opdracht voor de opschoonronde |
