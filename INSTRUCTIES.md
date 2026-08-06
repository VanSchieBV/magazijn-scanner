# Magazijn Scanner — eenmalige installatie

De app staat op: **https://vanschiebv.github.io/magazijn-scanner/**

De artikeldata staat in de privé-repo `VanSchieBV/magazijn-data`. Elk apparaat
(telefoon, PC) heeft eenmalig een GitHub-token nodig om daarbij te kunnen.

## 1. GitHub-token (PAT) aanmaken — eenmalig

1. Log in op github.com met een account dat lid is van de **VanSchieBV**-organisatie.
2. Ga naar **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
   (rechtstreeks: https://github.com/settings/personal-access-tokens/new).
3. Vul in:
   - **Token name:** `magazijn-scanner`
   - **Resource owner:** kies **VanSchieBV** (niet je eigen account!).
     Staat VanSchieBV er niet bij, dan moet een org-beheerder eerst fine-grained
     tokens toestaan: org **Settings → Third-party Access → Personal access tokens**.
   - **Expiration:** kies bv. 1 jaar (na afloop maak je gewoon een nieuwe en voer je die opnieuw in).
   - **Repository access:** *Only select repositories* → kies **magazijn-data**.
   - **Permissions → Repository permissions → Contents:** **Read and write**.
     (Verder niets aanzetten.)
4. Klik **Generate token** en **kopieer het token** (begint met `github_pat_`).
   Je ziet het maar één keer — bewaar het even in een notitie tot alle apparaten zijn ingesteld.

## 2. Token invoeren in de app (per apparaat)

1. Open de app-URL in Chrome.
2. Ga naar het tabblad **Instellingen**.
3. Plak het token in het veld en tik **Opslaan & testen**.
4. Rechtsboven moet het bolletje groen worden; de artikellijst wordt daarna
   automatisch geladen (of tik **Artikellijst verversen**).

Het token wordt alleen lokaal op het apparaat bewaard.

## 3. App op het beginscherm van de telefoon

1. Open de app-URL in Chrome op de telefoon.
2. Menu (⋮) → **Toevoegen aan startscherm** → **Installeren**.
3. Er komt een "Magazijn Scanner"-icoon op het beginscherm; die opent als volwaardige app.

## 4. Op de PC

- Maak een bladwijzer naar de app-URL (voor het overzicht van telverschillen en bestellingen).
- **Artikellijst bijwerken:** dubbelklik de snelkoppeling **"Artikellijst bijwerken"** op het
  bureaublad. Die leest `Export Artikelen.xlsx` (of `.csv`) uit
  `C:\Users\td\Projecten_AI\MagazijnScanner\Bron` en zet de nieuwe artikellijst in de cloud.
  De app haalt de lijst automatisch op bij de volgende start.
- In diezelfde map hoort **`Crediteuren.xlsx`** (kolommen `Cred.nr` en `Naam`). Het script zet
  daarmee de crediteurcode uit de export om naar de volledige naam, zodat het overzicht
  "Trailer Service Veenendaal B.V." toont in plaats van `TSVVEE10334`. Staat een code niet in
  dat bestand, dan blijft de code staan en meldt het script welke dat zijn.

## Dagelijks gebruik

- **Scannen** → barcode/QR richten → aantal geteld / bestellen / opmerking invullen → opslaan.
- **Geteld** → lijst van wat deze ronde al geteld is.
- **Overzicht** (PC) → telverschillen en bestellingen per crediteur.
- **Telling afronden & leegmaken** (Instellingen) → archiveert de telling in de cloud en
  begint met een schone lijst. Alleen doen als de hele telronde klaar is.
- **Uitloop** → artikelen die niet meer gebruikt worden zet je op de uitlooplijst
  met de knop **📉 Markeer als uitloop** in het artikelscherm. Scan je zo'n artikel,
  dan verschijnt een rode melding ("wordt niet meer aangevuld, op = op"). De hele
  lijst staat onderaan het **Overzicht**; zelfde knop haalt een artikel er weer af.
- **⚠ achter een locatie** → de locatie staat niet in de standaardnotatie
  `kast.plank.breedte` (eventueel met `-diepte`, bijv. `21.10.5-4` of `54.3.5-b`).
  De app snapt zo'n locatie gewoon, maar het is een typfout in het bronsysteem.
  Bij *Instellingen → Artikellijst* staat hoeveel het er zijn en download je de
  lijst (CSV) om ze stap voor stap recht te zetten. Bewust gekozen vrije locaties
  (ZOLDER, WPK, Oliehok, …) zet je daar op de uitzonderingenlijst — die tellen
  als goed en krijgen geen ⚠.

## Wekelijks rondje

- **Rondje** (tabblad) → de vaste controleroute door het magazijn.
- **Route instellen:** tik *＋ Locatie toevoegen* en vul een locatie in — een heel
  kastnummer (bijv. `11`) of één Kardex-la (bijv. `21.10`) — met optioneel een label
  ("koffer boortjes"). De lijst sorteert zichzelf op locatie (oplopend), ook als je
  later iets toevoegt. Je kunt er ook een **gebied** aan hangen (Boven, Zolder, …):
  gebieden maak je in hetzelfde scherm aan en wijs je toe door de chip aan te
  tikken; het gebied staat daarna klein achter de locatie.
- **Rondje lopen:** tik *▶ Rondje starten* en werk daarna gewoon zoals altijd. Elke
  scan die je opslaat (geteld / klopt / besteld / opmerking) vinkt de bijbehorende
  route-locatie automatisch af. Een locatie waar alles klopt zonder scan? Tik hem aan
  en kies *✓ Gecontroleerd — klopt* (of scan één artikel en tik *Voorraad klopt*).
  Overslaan kan ook; dat wordt dan zo vastgelegd.
- **Afronden:** zodra alles is afgevinkt rondt het rondje zichzelf af. Met open of
  overgeslagen locaties gebruik je de knop *Rondje afronden*. Het volledige rapport
  (locaties + alle scans van dat rondje) wordt bewaard in de cloud
  (`archief/rondje-….json`).
- **Historie:** op het Rondje-tabblad zie je alle eerdere rondes (tik voor het rapport
  en CSV-download) en per locatie wanneer die voor het laatst gecontroleerd is.
- **Vaste rondjesdag:** instellen bij *Instellingen → Wekelijks rondje*. Vanaf die dag
  verschijnt op het scanscherm een seintje zolang het rondje die week nog niet is
  gelopen. Op een andere dag lopen mag gewoon — het telt voor die week.
