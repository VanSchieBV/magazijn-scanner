# Logboek MagazijnScanner

Nieuwste sessie bovenaan. Oudere geschiedenis staat in git (`git log --oneline`) en in de vault
(`NoteFlow\projecten\MagazijnScanner\Verleden.md`).

## 2026-10-19 — v1.15.0: bestellijst opschonen en besteldatum

**Aanleiding.** Timo: "controleer NoteFlow voor plannen, ideeën en bugs", daarna "ik wil dat je 1
oppakt" = het vault-idee "Bestel lijst opschonen". Gebouwd door Fable (klein genoeg, ruim onder de
bouwgrens).

**Keuze van Timo.** Opschonen haalt alleen de *bestelde* regels (vinkje Besteld) uit de bestellijst.
Eén knop bovenaan voor alle leveranciers en in elke leverancierskop een knop voor alleen die leverancier.

**Gedaan.**
- `app.js`: `schoonBesteld(keys)` (sectie besteld-markering): wist `best`, `bsd` en `ink`, houdt `g`,
  `opm` en `kl`; blijft er niets over, dan een grafsteen via `verwijderRegistraties`. In
  `renderOverzicht` de knop `#btnSchoonBesteld` bovenaan (alleen zichtbaar als er iets besteld is) en
  per crediteurblok `.cred-schoon` met het aantal bestelde regels (stopPropagation, zodat de kop niet
  inklapt). Beide met een confirm.
- Besteldatum: `bsd` was al een tijdstempel, alleen de weergave ontbrak. Nu via `fmtDatum` onder het
  vinkje in de besteltabel (`.besteld-datum`), in de badge in Gescand, in de kop van het artikelscherm
  en in de knop "Besteld ✓". In de CSV (scanlijst en rondje) staat in de kolom Besteld nu de datum
  `jjjj-mm-dd` (`datumIso`) in plaats van `ja`.
- `style.css`: `.opschoon-rij`, `.cred-kop .cred-schoon`, `td.besteld-cel .besteld-datum`.
- Versie 1.15.0 in `app.js` en `sw.js`.
- Test `t_bestel_opschonen` in `tests/tests.py` (15 checks: knoppen afwezig zonder bestelde regels,
  datum op vier plekken en in de CSV, per leverancier, grafsteen voor een lege regel, geteld blijft,
  andere leverancier ongemoeid, blok klapt niet in, knop bovenaan, sync). Testreeks: **144/144**.
- Documentatie: README, INSTRUCTIES.md, ASK-kennis (`ASK\kennis\magazijnscanner.md`, kopje
  "Het overzicht op de pc").
- Tijdens het werk: `tests/tests.py` stond in de werkmap op CRLF (vóór `.gitattributes`); nu op LF.

**Uitrol.** Timo: "het staat nog niet online?" → gecommit als `2861108` (samen met het logboek van
9 oktober en het ASK-kopje in `CLAUDE.md`) en gepusht. Pages-run geslaagd; live melden `sw.js` en
`app.js` 1.15.0.

**Status.** v1.15.0 live en in git. Werkmap schoon op `.claude/` na.

**Open punten.**
- Op de pc en de telefoon bekijken: knop bovenaan, bezemknop in de kop, datum onder het vinkje.
- Nog open uit de vault: v1.14.0 nalopen op de telefoon, vastgelopen Pages-run afbreken, `git stash drop`.

## 2026-10-09 — v1.14.0 gecommit en uitgerold

**Aanleiding.** Timo: "oke, commit en push maar". Uitgevoerd door Opus 5.5.

**Gedaan.**
- Nieuwe bestanden vooraf nagelopen op tokens en bedrijfsdata: niets gevonden. De testdata in
  `tests/testdata.py` is verzonnen. `.claude/settings.json` (leeg) bewust niet meegenomen.
- Twee commits zoals gepland, maar zonder de werkmap te overschrijven: de auto-modus blokkeerde
  `git checkout stash@{0} -- app.js`. De A–D-versie van `app.js` ging daarom rechtstreeks uit de stash
  in de index (`git update-index --cacheinfo`); de werkmap bleef op de stand na E1.
  - `98f4db5 v1.14.0: opschoonronde A-D volgens de codereview`: alles, met de A–D-`app.js`. Getest op
    een export van precies die stand (`git checkout-index` naar een tijdelijke map): 129/129.
  - `09880de v1.14.0: app.js herordend, alleen verplaatsingen (E1)`: testreeks 129/129.
- Gepusht naar `main`. Pages-run 37903834977 geslaagd; live `sw.js` en `app.js` melden 1.14.0.
- Gecontroleerd dat `stash@{0}` identiek is aan `98f4db5`. `git stash drop` werd door de auto-modus
  geblokkeerd; de stash staat er nog en is overbodig.

**Ontdekt.** De uitrol van 6 augustus is nooit gelukt. De Pages-runs van v1.13.4 (`6509714`) en
v1.13.5 (`02f526e`) faalden, en de run van de lege herstartcommit `93a1009` staat sinds 6 augustus als
"queued" vast. Live stond daardoor tot vandaag v1.13.3, niet v1.13.5. Die vastgelopen run bestaat nog
steeds; afbreken kan alleen ingelogd (Actions-tabblad, of `gh` na `gh auth login`). `gh` is op deze pc
niet ingelogd; de status van een uitrol is ook zonder login te zien via
`https://api.github.com/repos/VanSchieBV/magazijn-scanner/actions/runs?per_page=3`.

**Gemeld na de uitrol.** Timo zag een tokenfout. Die bleek op zijn privételefoon te staan, die nog
geen geldig token heeft; de werktelefoon heeft het juiste token. Geen fout in de app: "Geen token"
betekent dat er niets is ingevoerd, "Token?" dat GitHub het token weigert (401/403). Dat gedrag was in
v1.13.3 al hetzelfde.

**Status.** v1.14.0 live en in git. Werkmap schoon op `.claude/` na.

**Open punten.**
- Telefoon en pc één keer openen voordat er een controle wordt afgerond (zie hieronder, "Bij de uitrol").
- Op de telefoon nalopen: camera-scan, handscanner, een dubbele barcode, afronden met twee apparaten
  (controlelijst G in het rapport). Ook de wijzigingen van v1.13.4 en v1.13.5 komen nu pas op de
  apparaten (geen inzoomen bij terugkeer naar het scanscherm, Uitloop-tegel bovenin het Overzicht).
- `git stash drop` (de momentopname is overbodig).
- De vastgelopen Pages-run van `93a1009` afbreken op GitHub.
- Vault-idee "Bestel lijst opschonen" en vault-plan "Nieuwe artikelbron: dagelijkse CSV-export op de
  share" staan nog open.

## 2026-10-08 (middag) — Opschoonronde uitgevoerd: v1.14.0, niet gecommit

**Aanleiding.** Timo: "voer de opschoonronde uit, sectie A tot en met E, zonder te committen"
(`RAPPORT-CODEREVIEW-2026-10-08.md`). Uitgevoerd door Opus 5.5.

**Keuzes van Timo** (telkens de aanbevolen optie; ook als beslissing in de vault):
A4 aparte registratie per artikel bij dubbele barcodes · A8 herkansing 1,5 s na conflict, 8 s na
netwerkfout · A13 `Artikelen kopie.xlsx` naar `Bron/` · D6 volle cache apart melden (geen IndexedDB) ·
E2 twee versienummers houden · E3 testreeks in `tests/` · E1 nu, met momentopname voor twee commits.

**Gemeten vooraf.** Export van september: 9.579 artikelen, 13 barcodes gedeeld door 2 artikelen
(26 artikelen, 9 op een andere locatie). `artikelen.json` is 1,2 MB; de localStorage-limiet is ca. 5 MB.

**Gedaan, per sectie.**
- **A (fouten).** A1 `[hidden]` wint altijd (één CSS-regel). A2 `telling.json` krijgt `afgerond`;
  na een review aangescherpt: elk apparaat onthoudt wat het bij de vorige sync in de cloud zag
  (`telling.cloud`) en laat na een afronding alleen dát vallen, zodat nog niet gesynct werk van een
  ander apparaat niet verloren gaat en klokverschillen geen rol spelen. A3 afronden stopt als de sync
  ervoor mislukt; tijdens het afronden draait geen andere sync; geen leeg archief als een ander apparaat
  net afrondde; archiefnaam met seconden. A4 sleutel `barcode|artikelnummer` bij dubbele barcodes
  (`sleutelVoor`, ook voor uitloop en rondje-scans; oude sleutels blijven geldig). A5 inhoud en sha uit
  één verzoek (`ghGetMetSha`). A6 een scan gaat niet meer verloren als er een update klaarstaat.
  A7 overal natuurlijk sorteren op locatie (`vergelijkLoc`). A8 zie keuze. A9 "Geen token" i.p.v.
  "Offline". A10 historie-sheet onthoudt welk rondje open staat. A11 via D4. A12 grafstenen ouder dan
  30 dagen opgeruimd. A13 `.gitignore` (runtime-bestanden taak, `.claude/settings.local.json`, `*.xlsx`,
  `*.csv`, `__pycache__/`) en `.gitattributes` (LF, `.ps1` CRLF). A14 token van het pc-script in
  `INSTRUCTIES.md`.
- **B (restanten).** Dode CSS-selector weg, één ingang `hsOpen` voor de handscanner, `zorgAudio`,
  één `visibilitychange`-listener, alle `let`-state bovenin.
- **C (duplicatie).** Helpers `csvCel`/`csvRegel`/`downloadCsv`, `systeemVoorraad`/`heeftVerschil`,
  één `openPaneel` (ook voor onbekende codes), `stempelId`, `verwijderRegistraties`, `kopieer`,
  `mergeOpTs`, `artikelCel`, `openSheet`/`sluitSheet`, `rondjeGewijzigd`. Alle inline styles vervangen
  door klassen in `style.css` met exact dezelfde waarden (alleen de breedte van de voortgangsbalk blijft
  inline).
- **D (efficiëntie).** D1 3 API-verzoeken bij de start, 2 per wijziging (gemeten). D2 statusbolletje per
  taak (bezig > fout > ok); een mislukte artikellijst wordt bij zichtbaar worden, online komen of de
  Sync-knop opnieuw geprobeerd. D3 uitzonderingen als Set, ⚠-teller gecachet. D4 één zoekstring per
  artikel. D5 alleen het zichtbare tabblad renderen. D6 zie keuze. D7 ZXing pas laden als het nodig is
  (wel in de sw-cache). D8 niets.
- **E.** E1 `app.js` herordend (constanten/state → locaties → opslag → API → sync → artikellijst/CSV →
  scanner → handscanner → paneel → lijst → overzicht → rondje → UI/events → start); met een script
  gecontroleerd dat er alleen regels verplaatst zijn (op 3 nieuwe en 2 hernoemde kopregels na).
  E2 ongewijzigd. E3 testreeks in `tests/`. E4 README, CLAUDE.md, INSTRUCTIES.md bijgewerkt.
- Kleine extra's: getallen in innerHTML ook door `esc()` (rapport F1); fouten bij het ophalen geven nu
  ook de HTTP-status mee, zodat 401 bij ophalen "Token?" toont; INSTRUCTIES gebruikt de knopnamen en
  termen van de app ("Gescand", "Controle afronden", "📉 Uitloop").
- Versie 1.14.0 (`VERSIE` en `VERSION`).

**Testen.** `python tests/draai.py`: 129/129 geslaagd (na E1). De reeks draait de echte app in headless
Chrome tegen een nep-GitHub met twee "apparaten", en speelt o.a. A2, A3 en A5 eerst na op de oude
code (alle drie bevestigd) en daarna op de nieuwe. `tests/visueel.py` tegen v1.13.5: opmaak gelijk,
op de bedoelde verschillen na (A1, en de Gescand-lijst wordt pas bij openen opgebouwd). Een aparte
review-agent las de A–D-wijzigingen na; zijn vijf punten zijn verwerkt (zie A2, A3, D2 en
`artikelVanRegistratie`, die nu eerst op artikelnummer zoekt). Niet getest: camera en handscanner op
een echt toestel, en de echte GitHub-API.

**Momentopname voor twee commits.** De stand ná A–D en vóór E1 staat als `stash@{0}` ("opschoonronde
A-D v1.14.0 (stand voor E1, ...)"). Het verschil tussen die stand en de werkmap zit alleen in
`app.js`. Committen in twee stappen:
1. De huidige `app.js` (ná E1) apart zetten, bijv. naar `%TEMP%\app.na-E1.js`.
2. `git checkout stash@{0} -- app.js` (de A–D-stand) en alles committen als
   `v1.14.0: opschoonronde A-D volgens de codereview`.
3. `%TEMP%\app.na-E1.js` terugzetten als `app.js` en committen als
   `v1.14.0: app.js herordend, alleen verplaatsingen (E1)`.
4. `git stash drop` (de momentopname is dan niet meer nodig).
Testreeks na stap 2 en na stap 3: `python tests/draai.py`.

**Bij de uitrol** (punt uit de review): na het pushen telefoon én pc eerst één keer openen (dan draait
v1.14.0 overal) en pas daarna een controle afronden. Een apparaat met v1.13.5 schrijft `afgerond` niet
terug en zet een afgeronde controle nog één keer terug.

**Let op tijdens deze sessie.** Eén keer is `chrome.exe --version` aangeroepen; op Windows opent dat
Chrome in Timo's bestaande sessie in plaats van een versienummer te tonen. Daarna is Chrome alleen
nog headless met een eigen profiel gestart (staat nu in CLAUDE.md). Ook zet Git Bash `sed -i` CRLF om
naar LF; `app.js` staat daardoor nu op LF, wat met de nieuwe `.gitattributes` ook de norm is.

**Status.** v1.14.0 in de werkmap, alles getest, **niets gecommit**. Live staat nog v1.13.5.

**Open punten.**
- Committen (twee commits, zie hierboven) en pushen: op Timo's teken. Neem daarbij ook de wijzigingen
  van 7 augustus mee (`pc/`, `INSTRUCTIES.md`), het taakscript, `tests/`, `.gitattributes`,
  `CLAUDE.md`, `LOGBOEK.md` en het rapport.
- Na de uitrol op de telefoon nalopen: camera-scan, handscanner, een dubbele barcode, afronden met
  twee apparaten (controlelijst G in het rapport).
- Vault-idee "Bestel lijst opschonen" en vault-plan "Nieuwe artikelbron: dagelijkse CSV-export op de
  share" staan nog open.

## 2026-10-08 — Codereview en projectbeheer op orde

**Aanleiding.** Timo wil de app met de kennis van nu laten doorlichten en op basis van een rapport
door Opus 5.5 laten opschonen. Daarnaast moet het project meelopen in de nieuwe werkwijze
(NoteFlow-projecten in de vault, drie projectbestanden in de map).

**Gedaan.**
- Volledige review van `app.js`, `index.html`, `style.css`, `sw.js`, de twee PowerShell-scripts en de
  documentatie. Niets aan de app gewijzigd. Resultaat: `RAPPORT-CODEREVIEW-2026-10-08.md` met
  14 fouten (A), restanten (B), duplicatie (C), efficiëntie (D), structuur (E), beveiliging (F), een
  controlelijst (G) en een samenvatting (H).
- Belangrijkste bevindingen: afgeronde controle komt via een ander apparaat terug (A2); afronden gaat
  door als de sync mislukt (A3); race tussen inhoud en sha in de sync (A5); `hidden` werkt niet op
  `.blader-nav` en `.filter-melding` (A1, bevestigd met headless Chrome); dubbele barcodes delen één
  registratie (A4, keuze voor Timo); taakscript niet in git en bedrijfsdata buiten `Bron/` (A13).
- Ongebruikte functies, variabelen, CSS-klassen en html-id's gezocht met een script: geen gevonden,
  op één dode CSS-selector na (`input[type="password"]`).
- `CLAUDE.md` en dit `LOGBOEK.md` aangemaakt; `README.md` uitgebreid met bestandsoverzicht en datamodel.
- Vault: log en issues aangemaakt via `item.py` (zie onder).
- SessionStart-hook: de projectlog-hook crashte op Windows omdat de uitvoer een ⚠ bevat en Python
  stdout in cp1252 schrijft. Oplossing: `python -X utf8` in de hookregel in
  `C:\Users\td\.claude\settings.json`; de robuuste fix in `item.py` zelf
  (`sys.stdout.reconfigure(encoding="utf-8")`) is als issue bij het NoteFlow-project gemeld, omdat de
  bron van `item.py` op de Linux-pc staat.

**Status.** v1.13.5 live, werkboom ongewijzigd op de nieuwe documenten na. Niets gecommit.

**Open punten en ideeën.**
- Opschoonronde uitvoeren volgens het rapport (Opus 5.5); eerst de keuzes in het rapport (A4, A8, A13,
  D6, E2, E3) aan Timo voorleggen.
- Wijzigingen van 7 augustus en het taakscript committen (op Timo's teken).
- `Artikelen kopie.xlsx` uit de projectroot (naar `Bron/` of weg).
- Vault-idee "Bestel lijst opschonen" (knop om de bestellijst leeg te maken; datum tonen bij Besteld).
- Vault-plan "Nieuwe artikelbron: dagelijkse CSV-export op de share" (geparkeerd tot de export de
  ontbrekende kolommen heeft).

## Tot 2026-08-07 — samenvatting

- 24–28 jul 2026: eerste versie (scanner, telling, sync via GitHub Contents API), bronbestand naar
  `Bron\`, v1.2–v1.4 (scanknop onderaan, bestel-workflow, klikbaar overzicht, migratie naar de
  organisatie VanSchieBV, registratie verwijderen).
- 29–30 jul: v1.4.1–v1.9.1 in korte iteraties: tik-om-te-kopiëren, bestellen vanuit het overzicht,
  Gescand-tabblad, instelbaar scanscherm, scroll-fix Android, "controle" i.p.v. telling, crediteurblokken,
  tegels als filters, crediteurcode → naam.
- 3–6 aug: v1.9.2–v1.13.5: scannen alleen binnen het scanvlak, wekelijks rondje met route, rapport en
  historie, markering afwijkende locatienotaties + uitzonderingenlijst, gebiedslabels, inklapbare
  leveranciersblokken, uitlooplijst, handscanner-modus.
- 7 aug: geplande taak "Magazijn Scanner - Artikellijst bijwerken" (werkdagen 09:15 en 12:45),
  bronbestand hernoemd naar `Artikelen.xlsx`, script schoont rijen zonder barcode op. Niet gecommit.
- 30 sep: project ingeladen in het vault-projectbeheer (projectkaart, Verleden, beslissingen, issues).
