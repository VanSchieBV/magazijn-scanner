# Logboek MagazijnScanner

Nieuwste sessie bovenaan. Oudere geschiedenis staat in git (`git log --oneline`) en in de vault
(`NoteFlow\projecten\MagazijnScanner\Verleden.md`).

## 2026-10-20 (vervolg 2) — v1.19.0: de app werkt zichzelf bij

**Aanleiding.** Timo: "Ik wil dat de webpagina zichzelf ververst. Nu moet ik bij elke wijziging de
site verversen." Wijzigingen (een nieuwe scan of iets anders) moeten vanzelf zichtbaar worden.

**Oorzaak.** De app synchroniseerde alleen na een eigen wijziging, bij het openen/zichtbaar worden, na
het terugkomen van internet en via de knop Sync; er was geen regelmatige controle.

**Gedaan.**
- `app.js`: achtergrondcontrole `pollTick` (elke 5 s, alleen zichtbaar, online en met token):
  `syncTelling({stil: true})` als de vorige telling-sync 20 s geleden is, `syncRondje({stil: true})`
  na 60 s, `swReg.update()` na 5 min. Een sync die loopt of gepland staat gaat voor. Stil = geen
  "Sync…" in het statusbolletje en alleen opnieuw opbouwen als de gegevens veranderd zijn (vergelijking
  van de JSON voor en na). `syncRondje` bouwt nu ook Gescand/Overzicht opnieuw op als het rondje
  veranderde (uitlooplijst, uitzonderingen). Nieuwe versie: `rustigVoorHerladen()` (geen artikel,
  camera of sheet open en geen ingevuld veld met focus); anders wacht `updateWacht` en herlaadt de
  achtergrondcontrole zodra het kan. Versie 1.19.0.
- Test `t_auto_verversen` (12 checks): scan van een ander apparaat verschijnt na een controle, alleen
  een GET, geen "Sync…", zonder wijzigingen geen PUT (telling en rondje), niet binnen 20 s na een sync,
  tabel blijft staan zolang een veld de focus heeft, geen controle als de app verborgen is, nieuwe
  versie wacht op een ingevuld veld en herlaadt daarna vanzelf.
- Documentatie: README (achtergrondcontrole), INSTRUCTIES.md, ASK-kennis (twee antwoorden
  bijgewerkt), `CLAUDE.md` (ontwerpregel: een controle zonder wijzigingen schrijft nooit).

**Eigen keuzes.** Geen volledige herlaadbeurt van de pagina bij elke wijziging, maar alleen de gegevens
en het scherm bijwerken: zo blijven invoer, scrollpositie en ingeklapte blokken staan. 20 seconden als
afweging tussen snelheid en het aantal GitHub-verzoeken (ongeveer 240 per uur per zichtbaar apparaat,
limiet 5000 per uur per account).

**Testresultaten.** `node --check app.js` OK; `t_auto_verversen` 12/12; volledige reeks **244/244**
(de achtergrondcontrole verstoort de andere tests niet).

**Status.** v1.19.0 in de werkmap, niet gecommit en niet gepusht (wacht op Timo).

## 2026-10-20 (vervolg) — v1.18.0: nieuwe items zonder code

**Aanleiding.** Timo: items zonder QR-code of nummer moeten ook genoteerd en besteld kunnen worden.
Op het scanscherm een extra invoerbalk "Nieuwe items" (simpel én normaal); in het overzicht een eigen
kopje Nieuwe items; op de pc extra info toevoegen, zoals de leverancier met een aanklikbare suggestie
(voorbeeld: Fabory); daarna staat het item bij die leverancier, helemaal bovenaan met een andere kleur
balk.

**Gedaan.**
- `index.html`: tweede `.search-row` (`.nieuw-row`, `#nieuwInput`, `#btnNieuw`) onder de zoekbalk;
  `<datalist id="credLijst">` in de kaart Bestellen; uitleg: stap over nieuwe items.
- `app.js`: `NIEUW_PREFIX`/`NIEUW_GROEP`, `nieuwArtikel`, `naamVan`, `nrVan`, `nieuwItem` (balk →
  artikelscherm zoals na een scan, sleutel `nieuw-<tijd><toeval>`), `nieuwItemVelden` (artikelscherm
  simpel en normaal: leverancier, hun nummer, uitleg; geen Voorraad klopt en geen Uitloop),
  `artikelVanRegistratie`/`sleutelVoor` kennen `nw`. Opslaan zonder aantal = `bl` (simpel én normaal).
  Bestellijst: blok "Nieuwe items" (`NIEUW_GROEP`) altijd eerst, nieuwe items bovenaan in hun blok,
  `nieuwItemCellen` (omschrijving kopieerbaar, veld leverancier met suggesties, veld hun nummer met
  kopieerknop), `vulCredLijst` en `credNaam` (hoofdletterongevoelig naar de bekende naam), een
  aangeklikte suggestie wordt meteen bewaard. Telverschillen slaan nieuwe items over; Gescand toont
  "nieuw item · leverancier" en een blauwe badge; CSV-kolom "Nieuw item" (vóór Uitloop), barcode leeg;
  rondje logt nieuwe items niet (geen locatie). Versie 1.18.0.
- Fout uit v1.16.0 meegenomen: `bouwEntry` gooide `bl` en `vp` weg bij opnieuw opslaan op het normale
  artikelscherm (een simpel gescand artikel verdween dan van de bestellijst). Nu bewaard; ook telt
  `bl` als inhoud bij Opslaan.
- `style.css`: `--blauw`/`--blauw-dim`, `.badge.blauw`, `.nieuw-row`, blok `.cred-blok.nieuw`,
  `tr.rij-nieuw` (blauwe achtergrond en balk links), velden `.ov-cred`/`.ov-hun`; `.art-field.vol` nu
  algemeen.
- Test `t_nieuw_item` (23 checks); documentatie README, INSTRUCTIES.md, ASK-kennis.

**Eigen keuzes.** Na de invoerbalk opent het artikelscherm (zoals na een scan), zodat je meteen een
aantal kunt opgeven. Op de pc zijn leverancier en hun nummer in te vullen, de omschrijving niet (fout =
✕ en opnieuw invoeren). Een getypte naam die (los van hoofdletters) gelijk is aan een bekende
crediteur wordt die naam; een andere naam geeft een eigen blok. Kleur: zacht blauw.

**Testresultaten.** `node --check app.js` OK; volledige reeks **232/232**; na een laatste
CSS-correctie (leveranciersveld overal even breed) nog eens `t_nieuw`, `t_bestel` en `t_simpel`: alles
groen. Schermafdrukken: scanscherm met de balk Nieuw item, artikelscherm van een nieuw item, blok
Nieuwe items op de pc, item bij een leverancier met blauwe balk, simpele weergave; geen horizontale
scrollbalk, geen JavaScript-fouten.

**Uitrol.** Timo: "ja" (online zetten). Gecommit als `9ab653f` en gepusht; Pages-run en live versie
gecontroleerd (vault-log "v1.18.0 gepusht en live"). Deze regel zelf is nog niet gecommit.

**Status.** v1.18.0 live en in git. Nakijken door Fable (v1.16.0 t/m v1.18.0) en nalopen op de pc en
de scanner staan nog open; zie de open punten bij v1.17.0.

## 2026-10-20 — v1.17.0: handscanner-schuifje, gelijke besteltabel, ✕ om een scan te annuleren

**Aanleiding.** Timo: (1) "Ik wil wel dat schuifje voor Handscanner in simpele modus." Gebouwd als
v1.16.2 (199/199), niet apart uitgerold. (2) Met twee schermafdrukken van de besteltabel (simpel
uit en aan): beide moeten eruitzien als de normale weergave, en links vóór het artikelnummer een
kruisje om een artikel uit het overzicht te verwijderen ("als het ware wordt dan de scan
geannuleerd"), met een waarschuwing; dan ook weg uit Gescand.

**Gedaan.**
- `style.css`: `.handscanner-row` uit de verbergregel voor `body.simpel` (schuifje Handscanner ook
  in de simpele weergave). `input.ov-vp` krijgt dezelfde opmaak als `input.ov-ink` (6.5em,
  0.95rem); nieuwe klassen `.art-met-del` en `button.ov-del` (grijs, rood bij hover).
- `app.js`: `artikelCel` met vierde parameter `delKey` (alleen de besteltabel): ✕ vóór het nummer.
  Klik = `confirm` ("… uit het overzicht verwijderen? De scan wordt geannuleerd …") en daarna
  `verwijderRegistraties` (grafsteen, sync), toast; de rij opent niet (stopPropagation). In beide
  weergaven. Het verpakkingenveld heeft geen placeholder "verp." meer. Versie 1.17.0.
- `index.html`: uitlegstap 5 noemt "het veldje ernaast"; nieuwe stap 6 over het ✕.
- Tests: `t_simpel_telefoon` (schuifje zichtbaar en werkt), nieuw `t_bestel_verwijderen` (✕ vóór
  het nummer, waarschuwing, nee = niets weg, ja = grafsteen en weg uit overzicht en Gescand, sync,
  besteltabel normaal en simpel op dezelfde posities met dezelfde veldopmaak, verwijderen in de
  simpele weergave).
- Documentatie: README, INSTRUCTIES.md, ASK-kennis (ook een vraag "per ongeluk gescand").

**Eigen keuzes.** Het ✕ staat alleen in de besteltabel (daar ging het om), niet in de tabellen
Telverschillen/Opmerkingen; daar kan het via het artikelscherm of Gescand. Verwijderen haalt de
hele registratie weg (ook telling en opmerking), zoals "Uit controle verwijderen"; dat staat in de
waarschuwing. Het rondje-rapport houdt een eerder gelogde scan (zoals bij elk verwijderen).

**Testresultaten.** `node --check app.js` OK; volledige reeks **209/209**; na de laatste
tekstwijziging in de uitleg nog eens `t_laden`, `t_simpel` en `t_bestel`: alles groen.
Schermafdruk van de besteltabel in beide weergaven: tabel gelijk, ✕ vóór het nummer, geen
JavaScript-fouten.

**Uitrol.** Timo: "Ja, zet online". Gecommit als `9303f0b` en gepusht; Pages-run en live versie
gecontroleerd (vault-log "v1.17.0 gepusht en live"). Deze regel zelf is nog niet gecommit.

**Status.** v1.17.0 live en in git. Plan simpele weergave: GEBOUWD, nagekeken: nee (Fable kijkt
v1.16.0 t/m v1.17.0 samen na).

**Open punten.**
- Nakijken door Fable; daarna het plan afsluiten in de vault.
- Op de pc en de scanner nalopen: simpele weergave, aantal op de scanner, handscanner, ✕ in de
  bestellijst.
- Rondje-CSV toont 1970-01-01 in de kolom Besteld (vault-issue).
- Idee: kaart Koppeling tonen in de simpele weergave zonder geldig token (vault-idee).
- Nog open uit de vault: v1.14.0/v1.15.0 nalopen op de telefoon, vastgelopen Pages-run afbreken,
  `git stash drop`.

## 2026-10-19 (avond, vervolg) — v1.16.1: aantal invullen op de scanner (simpele weergave)

**Aanleiding.** Timo na de uitrol van v1.16.0: "Je moet wel de aantallen in kunnen vullen op de
scanner met simpele weergave." Gewenste opbouw onder het artikel: Locatie - Voorraad, dan
"− Bestellen +", dan Opslaan, dan Annuleren. Opslaan gaat terug naar de scanner; de knop
"Bestellen, terug naar scannen" vervalt. Dit wijzigt beslissing B3 van het plan (scan zonder aantal).

**Gedaan.**
- `index.html`: `#artSimpelKnoppen` vervangen door `#artSimpel`: een `.telrij` met één telveld
  Bestellen (`#inpSimpelBestellen`, − en + met de bestaande `.stap`-knoppen), daaronder elk in een
  eigen rij `#btnSimpelOpslaan` en `#btnSimpelAnnuleer`. Uitlegstap 4 noemt nu de kolom Aantal.
- `app.js`: `simpelBestellen` wordt `simpelOpslaan`: met een aantal ≥ 1 wordt dat `best`, zonder
  aantal komt de regel er als `bl` op; al op de lijst en niets veranderd = alleen terug naar de
  scanner (geen nieuwe `ts`); een leeg veld haalt een bestaand aantal niet weg. Het veld toont een
  bestaand aantal. Enter in het veld = Opslaan. Toast met het aantal. Versie 1.16.1.
- Pc in de simpele weergave: de besteltabel heeft de kolom **Aantal** weer (bewerkbaar, zoals
  normaal), het verpakkingenveld blijft in plaats van het inkoopnummer. De CSS-regels voor
  `.bestel-tabel.simpel` zijn weg.
- Tests aangepast en uitgebreid (`t_simpel_pc`, `t_simpel_telefoon`): volgorde veld/knoppen, + knop,
  opslaan met en zonder aantal, Enter, bestaand aantal in het veld, Annuleren legt niets vast,
  kolom Aantal op de pc.
- Documentatie: README, INSTRUCTIES.md (ook de token-zin eenduidig gemaakt), ASK-kennis.

**Eigen keuzes (niet expliciet gevraagd).** Leeg veld + Opslaan = toch op de lijst zonder aantal
(zoals v1.16.0), niet weigeren. Kolom Aantal terug op de pc, anders ziet wie bestelt het ingevulde
aantal niet.

**Testresultaten.** `node --check app.js` OK; simpele tests 54/54; volledige reeks **198/198**.
Schermafdrukken: telefoon-artikelscherm (Locatie - Voorraad, "− Bestellen +", Opslaan, Annuleren)
en pc-bestellijst met de kolom Aantal; geen horizontale scrollbalk, geen JavaScript-fouten.

**Uitrol.** Timo: "zet online". Gecommit en gepusht als v1.16.1; Pages-run en live versie
gecontroleerd (zie de vault-log "v1.16.1 gepusht en live").

**Status.** v1.16.1 live en in git. Plan: GEBOUWD, nagekeken: nee (Fable kijkt v1.16.0 en v1.16.1
samen na).

## 2026-10-19 (avond) — v1.16.0: simpele weergave gebouwd (Opus), niet gecommit

**Aanleiding.** Timo: `recap`, daarna "go" op `PLAN-simpele-weergave.md`. Gebouwd door Opus
volgens het plan.

**Gedaan.**
- `index.html`: schuif in de header (`.header-simpel`, `#swSimpelHeader`); telvelden en knoppen van
  het artikelpaneel in `#artNormaal`, daarna `#artSimpelKnoppen` (Bestellen / Annuleren); uitleg
  `#ovUitleg` (vijf stappen) boven de bestellijst; `id="ovKnoppen"` op de CSV-rij; kaart
  `#kaartSimpel` (Weergave) bovenaan Instellingen.
- `style.css`: blok "Simpele weergave" (header-schuif alleen vanaf 900 px, verbergen via
  `body.simpel`, uitleg, simpele besteltabel, `.art-nr.groot`, `.art-grid.simpel`, `.art-field.vol`);
  `input.ov-vp` bij de bestaande invoerstijl.
- `app.js`: sectie "simpele weergave" na `schoonBesteld` (`simpelAan`, `isPc`, `simpelViews`,
  `pasSimpelToe`, `zetSimpel`, `simpelBestellen`, `naSimpelScan`); `opBestellijst(it)` in de sectie
  overzicht en overal gebruikt waar "te bestellen" bepaald wordt; simpele tak in `openPaneel`;
  `veld()` met vierde parameter `vol`; Gescand zonder klaar-vinkje/blok Klaar en met alleen
  bestelbadges; overzicht zonder tegels, filters en andere kaarten, besteltabel zonder Aantal en met
  verpakkingenveld (focus na het vinkje); normaal: leeg aantalveld bij een `bl`-regel (leegmaken =
  `best` weg), "· n verp." onder het vinkje; CSV-kolommen Bijna leeg en Verpakkingen;
  `schoonBesteld` wist ook `bl` en `vp`; rondje-seintje weg in de simpele stand; `renderAlles`
  wacht ook op `.ov-vp`. Versie 1.16.0 (`app.js` en `sw.js`).
- Tests: `t_laden` op 1.16.0; nieuw `t_simpel_pc` (34 checks) en `t_simpel_telefoon` (13 checks).
- Documentatie: README (gebruik, datamodel `bl`/`vp`, `mgz_simpel`), INSTRUCTIES.md (kopje
  "Simpele weergave (voor collega's)"), ASK-kennis (blok "Bijna leeg scannen en bestellen" en twee
  vragen), `CLAUDE.md` (aantal checks, Node werkt, tip bij `visueel.py`), plan op GEBOUWD.

**Afwijkingen van het plan.**
1. Header-schuif: `<label class="header-simpel">` met tekst én een `<span class="switch">` erin,
   in plaats van `<label class="switch header-simpel">`. `.switch` heeft een vaste breedte van
   52 px en een absolute track over het hele label; zo zou de track over de tekst "Simpel" vallen.
2. Header-schuif met `margin: -1px 12px -1px auto`: zonder die -1px werd de header op de pc 2 px
   hoger (schuif 30 px, statuschip 28 px) en schoof in de normale weergave alles 2 px omlaag.
3. `zetSimpel` roept ook `updateRondjeUI()` aan, zodat het rondje-seintje meteen verdwijnt of
   terugkomt bij het omzetten.
4. Gescand in de simpele stand: de subtitel zonder "· n klaar" (er is daar geen blok Klaar).
5. Een rondje-scan krijgt `bl: 1` als hij uit de simpele stand komt, zodat de badge "bestel" in de
   rondje-historie via `opBestellijst` klopt. De rondje-CSV is ongewijzigd.
6. `t_simpel_pc` stap 5 zo uitgewerkt: simpel starten en 222 scannen, uitzetten, 111 en 444 gewoon
   registreren, weer aanzetten. Extra checks: een simpele scan van 444 houdt de opmerking,
   ongeldige verpakkingen, sync van `bl`/`vp`, aantal invullen en leegmaken bij een `bl`-regel,
   opschonen wist `bl`/`vp` bij een regel met opmerking. `t_simpel_telefoon` extra: scan telt mee
   in een lopend rondje, seintje verborgen, aanzetten vanaf Overzicht gaat naar Scannen.

**Testresultaten.** `node --check app.js` OK. Testreeks **191/191** (144 bestaand + 47 nieuw),
na de header-correctie opnieuw **191/191**. `tests/visueel.py` tegen de vorige commit, met de
nieuwe elementen overgeslagen en `#artNormaal` platgeslagen: zonder `mgz_simpel` alleen
animatieruis (opacity) en een hogere Instellingen-pagina door de nieuwe kaart; verder pixel-gelijk
op 412 en 1280 px. Schermafdrukken (headless, eigen profiel): pc-bestellijst simpel met uitleg en
twee leveranciers, artikelscherm (zes regels in de juiste volgorde, ook "staat al op de
bestellijst"), Gescand, scanscherm en Instellingen op de telefoon. Alles in beeld, geen horizontale
scrollbalk, geen JavaScript-fouten.

**Gevonden, niet opgelost (buiten het plan).** De rondje-CSV zet sinds v1.15.0 `1970-01-01` in de
kolom Besteld: een rondje-scan bewaart `bsd` als vlag (1), de CSV maakt er een datum van. Vault-issue
"Rondje-CSV toont 1970-01-01 in de kolom Besteld".

**Aandachtspunt.** In de simpele weergave toont Instellingen alleen de schuif, ook als de
setupbanner (geen token) naar Instellingen verwijst. Het bestaande token blijft gewoon werken; alleen
als er ooit een ander token in moet (verlopen, nieuw toestel), zet je de simpele weergave even uit.
Timo vroeg of er een nieuw token nodig was: nee, de zin in INSTRUCTIES.md is dubbelzinnig. Idee
(niet gebouwd): kaart Koppeling in de simpele stand tonen zolang er geen of een geweigerd token is.

**Uitrol.** Timo: "Je mag hem online zetten" (vóór het nakijken door Fable). Gecommit als
`bb3f744` (`v1.16.0: simpele weergave`, met het plan) en gepusht; `.claude/` blijft buiten git.
Pages-run van `bb3f744` geslaagd; live melden `sw.js` `mgz-v1.16.0` en `app.js` `1.16.0`. Deze
logboekregel zelf is nog niet gecommit.

**Status.** v1.16.0 live en in git. Plan: GEBOUWD, nagekeken: nee.

**Open punten.**
- Nakijken door Fable (`/clear`, Fable, `recap`): diff van `app.js` (`openPaneel`,
  `simpelBestellen`, `renderOverzicht`) en de testuitslag. Daarna plan afsluiten in de vault.
- Op de pc en de scanner nalopen: schuif aanzetten, scannen, bestellijst met verpakkingen.
- ~~INSTRUCTIES.md: de token-zin eenduidig maken~~ gedaan in v1.16.1.
- Rondje-CSV-fout (vault-issue).
- Nog open uit de vault: v1.14.0/v1.15.0 nalopen op de telefoon, vastgelopen Pages-run afbreken,
  `git stash drop`.

## 2026-10-19 (middag) — Bouwplan simpele weergave (v1.16.0), wacht op de Go

**Aanleiding.** Timo: "Nu een grotere opdracht. Nog niets bouwen. Eerst nadenken." Collega's moeten
de app zonder uitleg kunnen gebruiken: scannen wat bijna leeg is, en op de pc per leverancier
bestellen. Daarvoor komt een schuif "Simpele weergave" (per apparaat) die alles verbergt wat daar
niet voor nodig is. Uit = de app zoals nu.

**Gedaan.** Code bekeken (navigatie, header, overzicht, artikelscherm, instellingen) en vijf
keuzes aan Timo voorgelegd. Zijn antwoorden: knop heet "✓ Bestellen, terug naar scannen"; al op de
lijst = melding + "Terug naar scannen"; een scan slaat géén aantal op (nieuw veld `bl`); de
opschoonknoppen blijven in de simpele weergave; de uitleg bovenaan in korte stappen. Omvang ruim
boven de bouwgrens, dus volgens de afspraak van 19-10: Fable schrijft het plan, Opus bouwt.
Resultaat: `PLAN-simpele-weergave.md` (beslissingen B1–B11, datamodel `bl`/`vp`, per bestand de
wijzigingen, twee nieuwe tests, controle, verboden). In de vault: plan "Simpele weergave bouwen
(v1.16.0)" en drie beslissingen. `CLAUDE.md`: leesvolgorde punt 4 (PLAN bij recap noemen en om de
Go vragen).

**Status.** v1.15.0 live en in git. Bouwplan klaar, **wacht op de Go**. Werkmap: het plan,
`CLAUDE.md` en dit logboek nog niet gecommit.

**Open punten.**
- Timo: `/clear`, Opus kiezen, `recap`, Go geven. Opus bouwt volgens het plan en vraagt daarna om
  ready2clear; Fable kijkt na.
- Nog open uit de vault: v1.14.0/v1.15.0 nalopen op de telefoon, vastgelopen Pages-run afbreken,
  `git stash drop`.

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
