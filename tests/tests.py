"""Testreeks MagazijnScanner: de echte app in headless Chrome tegen een nep-GitHub (mockgh.py).

Draaien via `python tests/draai.py` (start en stopt de servers zelf). Met een filter alleen de
tests waarvan de naam het filter bevat, bijv. `python tests/draai.py t_a4`.
Elke test begint met verse apparaten en een nep-data-repo met de testartikelen uit testdata.py.
Codes in de testnamen (A1, C5, ...) verwijzen naar RAPPORT-CODEREVIEW-2026-10-08.md.
"""
import json, sys, time, traceback
from cdp import Browser, mock
from testdata import basis, ARTIKELEN

DAG = 24 * 3600 * 1000
resultaten = []
def check(naam, ok, extra=''):
    resultaten.append((naam, bool(ok)))
    print(('OK   ' if ok else 'FOUT ') + naam + (('  -> ' + str(extra)) if not ok and extra != '' else ''))

def reg(d, code, geteld=None, bestel=None, opm=None, klopt=False):
    d.ev(f"zoekEnOpen({json.dumps(code)})")
    if geteld is not None: d.ev(f"$('inpGeteld').value = '{geteld}'")
    if bestel is not None: d.ev(f"$('inpBestellen').value = '{bestel}'")
    if opm is not None: d.ev(f"$('inpOpmerking').value = {json.dumps(opm)}")
    d.ev(f"slaOp({'true' if klopt else 'false'})")

def remote(pad):
    t = mock('/__state').get(pad)
    return json.loads(t) if t else None

def vers(b, *breedtes, state=None):
    b.ruim_op(); mock('/__reset', {}); st = basis(); st.update(state or {}); mock('/__state', st)
    return [b.apparaat(br) for br in (breedtes or (412,))]

PATCH_CSV = "window.__csv = []; downloadCsv = (naam, regels) => window.__csv.push({naam, regels});"

def t_laden(b):
    tel, = vers(b, 412); tel.start()
    check('laden: geen JS-fouten', tel.fouten() == [], tel.fouten())
    check('laden: versie 1.14.0 in Instellingen', '1.14.0' in tel.ev("$('versieInfo').textContent"))
    check('D7: ZXing niet geladen bij de start', tel.ev("typeof ZXing") == 'undefined')
    check('D2: status groen na start', tel.ev("$('statusDot').className") == 'status-dot ok', tel.ev("$('statusTxt').textContent"))
    pc = b.apparaat(1280); pc.start()
    pc.ga()   # herladen: artikellijst staat nu in de cache
    api = pc.ev("window.__api")
    check('D1: 3 API-verzoeken bij de start (2e apparaat, niets te schrijven)', len(api) == 3 and not any(a.startswith('PUT') for a in api), api)
    pc.ev("window.__api = []")
    reg(pc, '111', geteld=10); pc.ev("await syncTellingDirect()")
    api = pc.ev("window.__api")
    check('D1: 2 API-verzoeken per wijziging', api == ['GET telling.json', 'PUT telling.json'], api)
    check('D7: laadZxing laadt de fallback', pc.ev("await laadZxing(); typeof ZXing") == 'object')

def t_a1(b):
    tel, = vers(b); tel.start()
    reg(tel, '111', geteld=10)
    tel.ev("zoekEnOpen('222')")
    check('A1: geen ‹ › bij artikel zonder bladerlijst', tel.ev("getComputedStyle($('bladerNav')).display") == 'none')
    tel.ev("sluitPaneel()"); reg(tel, '222', geteld=5)
    tel.ev("toonView('lijst')"); tel.ev("$('lijstItems').querySelector('.item').click()")
    check('A1: ‹ › wel zichtbaar bij twee registraties', tel.ev("getComputedStyle($('bladerNav')).display") == 'flex')
    check('A1: positie 1 / 2', tel.ev("$('bladerPos').textContent") == '1 / 2')
    tel.ev("sluitPaneel(); toonView('overzicht')")
    check('A1: geen filterregel zonder filter', tel.ev("getComputedStyle($('ovFilterMelding')).display") == 'none')
    tel.ev("zetOvFilter('geteld')")
    check('A1: filterregel met filter', tel.ev("getComputedStyle($('ovFilterMelding')).display") == 'flex' and tel.ev("$('ovFilterTekst').textContent") == 'Alleen geteld')
    tel.ev("$('btnAllesTonen').click()")
    check('A1: Alles tonen verbergt de regel weer', tel.ev("getComputedStyle($('ovFilterMelding')).display") == 'none')

def t_a2(b):
    tel, pc = vers(b, 412, 1280); tel.start(); pc.start()
    reg(tel, '111', geteld=10); tel.ev("await syncTellingDirect()"); pc.ev("await syncTellingDirect()")
    check('A2: pc ziet de registratie', pc.ev("Object.keys(telling.items)") == ['111'], pc.ev("JSON.stringify(telling)"))
    tel.ev("await rondAf()")
    r = remote('telling.json')
    check('A2: afronden schrijft afgerond-tijdstempel', r['items'] == {} and r.get('afgerond', 0) > 0, r)
    reg(pc, '444', opm='na afronden')   # nieuw op de pc, nog niet gesynct
    pc.ev("await syncTellingDirect()")
    r = remote('telling.json')
    check('A2: oude regel komt niet terug, nieuwe blijft', sorted(r['items']) == ['444'] and r.get('afgerond'), r)
    tel.ev("await syncTellingDirect()")
    check('A2: telefoon ziet alleen de nieuwe regel', tel.ev("Object.keys(telling.items)") == ['444'])
    arch = [k for k in mock('/__state') if k.startswith('archief/telling-')]
    check('A2: archief bevat de afgeronde controle', len(arch) == 1 and list(remote(arch[0])['items']) == ['111'], [remote(a) for a in arch])
    # oud formaat zonder afgerond blijft werken
    mock('/__state', {'telling.json': json.dumps({'items': {'222': {'b': '222', 'g': 1, 'ts': 5}}})})
    tel.ev("await syncTellingDirect()")
    check('A2: telling.json zonder afgerond wordt gewoon samengevoegd', sorted(tel.ev("Object.keys(telling.items)")) == ['222', '444'])

def t_a2_review(b):
    # registraties die een ander apparaat nog niet had gesynct gaan niet verloren
    tel, pc = vers(b, 412, 1280); tel.start(); pc.start()
    reg(tel, '111', geteld=10); tel.ev("await syncTellingDirect()"); pc.ev("await syncTellingDirect()")
    reg(pc, '222', bestel=3); pc.ev("clearTimeout(syncTimer)")          # pc registreert, maar synct (nog) niet
    reg(pc, '444', geteld=1); pc.ev("clearTimeout(syncTimer); telling.items['444'].ts -= 3600 * 1000")  # klok van de pc een uur achter
    tel.ev("await rondAf()")
    pc.ev("await syncTellingDirect()")
    r = remote('telling.json')
    check('A2+: niet-gesyncte regels van vóór het afronden blijven bewaard', sorted(r['items']) == ['222', '444'], sorted(r['items']))
    check('A2+: de al gesyncte (gearchiveerde) regel komt niet terug', '111' not in r['items'])
    tel.ev("await syncTellingDirect()")
    check('A2+: afrondend apparaat ziet de geredde regels', sorted(tel.ev("Object.keys(telling.items)")) == ['222', '444'])
    # na de update: apparaat zonder telling.cloud valt terug op het afrondmoment
    pc.ev("delete telling.cloud; telling.afgerond = 0; bewaarTelling()")
    time.sleep(1.1)   # archiefnaam heeft seconden; twee keer afronden binnen één seconde kan in het echt niet
    tel.ev("await rondAf()")
    pc.ev("await syncTellingDirect()")
    check('A2+: zonder cloud-overzicht vervalt alles tot het afrondmoment', remote('telling.json')['items'] == {}, remote('telling.json'))
    # afronden terwijl een ander apparaat net heeft afgerond: geen leeg archief
    reg(pc, '111', geteld=2); pc.ev("await syncTellingDirect()"); tel.ev("await syncTellingDirect()")
    time.sleep(1.1)
    pc.ev("await rondAf()")
    time.sleep(1.1)
    voor = len([k for k in mock('/__state') if k.startswith('archief/telling-')])
    tel.ev("window.__toasts = []; await rondAf()")
    na = len([k for k in mock('/__state') if k.startswith('archief/telling-')])
    check('A2+/rondAf: geen leeg archief als een ander apparaat net afrondde', voor == na and any('al leeg' in t for t in tel.ev('window.__toasts')), tel.ev('window.__toasts'))
    check('A2+: geen JS-fouten', tel.fouten() == [] and pc.fouten() == [], (tel.fouten(), pc.fouten()))

def t_a3(b):
    tel, pc = vers(b, 412, 1280); tel.start(); pc.start()
    reg(tel, '111', geteld=9); tel.ev("await syncTellingDirect()")
    reg(pc, '222', bestel=4); pc.ev("await syncTellingDirect()")
    mock('/__fail', {'n': 1, 'status': 500, 'methode': 'GET'})
    tel.ev("await rondAf()")
    st = mock('/__state')
    check('A3: niets gearchiveerd bij mislukte sync', not [k for k in st if k.startswith('archief/telling-')])
    check('A3: cloud ongemoeid', sorted(remote('telling.json')['items']) == ['111', '222'])
    check('A3: melding getoond', any('Afronden afgebroken' in t for t in tel.ev('window.__toasts')), tel.ev('window.__toasts'))
    check('A3: lokale lijst niet gewist', tel.ev("Object.keys(telling.items).length") >= 1)
    tel.ev("await rondAf()")
    arch = [k for k in mock('/__state') if k.startswith('archief/telling-')]
    check('A3: daarna lukt afronden mét de regels van de pc', len(arch) == 1 and sorted(remote(arch[0])['items']) == ['111', '222'])

def t_a5(b):
    tel, = vers(b); tel.start()
    tel.ev("await syncTellingDirect()")
    ander = json.dumps({'items': {'222': {'b': '222', 'a': 'O1002', 'g': 3, 'ts': int(time.time() * 1000)}}})
    reg(tel, '111', geteld=10)
    mock('/__naGet', {'telling.json': ander})
    ok1 = tel.ev("await syncTellingDirect()")
    check('A5: schrijven na een tussentijdse wijziging wordt geweigerd', ok1 is False and '222' in remote('telling.json')['items'])
    ok2 = tel.ev("await syncTellingDirect()")
    r = remote('telling.json')
    check('A5: herkansing voegt beide samen', ok2 and sorted(r['items']) == ['111', '222'], r)
    # rondje.json op dezelfde manier
    tel.ev("await syncRondje()")
    ander_r = json.loads(mock('/__state')['rondje.json']); ander_r['route']['rX'] = {'loc': '99', 'label': '', 'ts': int(time.time() * 1000)}
    tel.ev("rondje.route['rY'] = {loc: '98', label: '', ts: Date.now()}; bewaarRondje();")
    mock('/__naGet', {'rondje.json': json.dumps(ander_r)})
    tel.ev("await syncRondje()"); tel.ev("clearTimeout(rondjeSyncTimer); await syncRondje()")
    r = remote('rondje.json')
    check('A5: rondje-route van beide apparaten blijft bewaard', 'rX' in r['route'] and 'rY' in r['route'], list(r['route']))

def t_a6(b):
    tel, = vers(b); tel.start()
    tel.ev("window.__marker = 1; camActief = true; updateWacht = true; verwerkScan('111')")
    time.sleep(0.5)
    check('A6: scan opent het artikel ondanks klaarstaande update', tel.ev("window.__marker") == 1 and tel.ev("$('artPanel').hidden") is False and tel.ev("huidigeKey") == '111')
    tel.ev("setTimeout(sluitPaneel, 50)"); time.sleep(2)
    check('A6: na sluiten wordt herladen', tel.ev("typeof window.__marker") == 'undefined')
    tel.ev("window.__marker = 2; updateWacht = true; camActief = true; setTimeout(() => $('btnCamSluit').click(), 50)"); time.sleep(2)
    check('A6: camera sluiten met de knop herlaadt nog steeds', tel.ev("typeof window.__marker") == 'undefined')

def t_a7_c1(b):
    tel, = vers(b); tel.start()
    reg(tel, '222', geteld=5, opm='let op; puntkomma'); reg(tel, '111', geteld=10)
    tel.ev("toonView('overzicht'); zetOvFilter('geteld')")
    rows = tel.ev("[...$('ovGeteld').querySelectorAll('tr[data-key]')].map(r => r.dataset.key)")
    check('A7: Geteld natuurlijk gesorteerd (2.1.3 vóór 11.2.1)', rows == ['111', '222'], rows)
    tel.ev(PATCH_CSV + " downloadScanlijst(); downloadLocFouten();")
    csv = tel.ev("window.__csv")
    sl = csv[0]['regels']
    check('C1: scanlijst-CSV kop en volgorde', sl[0].startswith('Barcode;Artikelnummer') and sl[1].startswith('111;') and sl[2].startswith('222;'), sl)
    check('C1: puntkomma in opmerking wordt gequote', sl[2].endswith('"let op; puntkomma"'), sl[2])
    check('C1: bestandsnaam Scanlijst', csv[0]['naam'].startswith('Scanlijst '))
    lf = csv[1]['regels']
    check('C1/D3: afwijkende locaties (56. wel, ZOLDER niet)', len(lf) == 2 and lf[1].startswith('56.;O1005'), lf)
    tel.ga()
    tel.ev("""const B = window.Blob; window.Blob = function(p, o) { window.__blob = p[0]; return new B(p, o); };
              HTMLAnchorElement.prototype.click = function () {}; downloadCsv('x.csv', ['a;b', 'c'])""")
    check('C1: CSV begint met BOM en heeft CRLF', tel.ev("window.__blob") == '﻿a;b\r\nc')

def t_a9_d2(b):
    tel, = vers(b); tel.start(token='')
    check('A9: zonder token staat er "Geen token"', tel.ev("$('statusTxt').textContent") == 'Geen token')
    tel.ev("await syncTelling()")
    check('A9: ook na een sync-poging', tel.ev("$('statusTxt').textContent") == 'Geen token')
    pc, = vers(b, 1280); pc.start()
    mock('/__fail', {'n': 1, 'status': 500, 'methode': 'GET'})
    pc.ev("artMeta.sha = 'oud'; await verversArtikelen(true)")
    check('D2: fout artikellijst zichtbaar', pc.ev("$('statusTxt').textContent") == 'Fout')
    pc.ev("await syncTellingDirect()")
    check('D2: geslaagde telling-sync wist die fout niet', pc.ev("$('statusTxt').textContent") == 'Fout')
    pc.ev("await verversArtikelen(true)")
    check('D2: weer groen als de artikellijst lukt', pc.ev("$('statusDot').className") == 'status-dot ok')
    mock('/__fail', {'n': 1, 'status': 500, 'methode': 'GET'})
    pc.ev("artMeta.sha = 'oud'; await verversArtikelen(true)")
    check('D2: fout artikellijst opnieuw zichtbaar', pc.ev("$('statusTxt').textContent") == 'Fout')
    pc.ev("$('btnSyncNu').click()"); time.sleep(1.5)
    check('D2: Sync-knop probeert de artikellijst opnieuw', pc.ev("statusPerTaak.art.soort") == 'ok' and pc.ev("$('statusDot').className") == 'status-dot ok', pc.ev("JSON.stringify(statusPerTaak)"))
    mock('/__fail', {'n': 1, 'status': 401, 'methode': 'GET'})
    pc.ev("await syncTellingDirect()")
    check('D2/ghFout: 401 bij ophalen toont "Token?"', pc.ev("$('statusTxt').textContent") == 'Token?')
    pc.ev("clearTimeout(syncTimer)")

def t_a10(b):
    nu = int(time.time() * 1000)
    hist = [{'id': 'h1', 'gestart': nu - 3 * DAG, 'afgerond': nu - 3 * DAG + 1000, 'items': [{'loc': '2', 'status': 'scan', 'n': 1}], 'scans': 1},
            {'id': 'h2', 'gestart': nu - DAG, 'afgerond': nu - DAG + 1000, 'items': [{'loc': '2', 'status': 'hand', 'n': 0}], 'scans': 1}]
    st = {'archief/rondje-h1.json': json.dumps({'id': 'h1', 'items': hist[0]['items'], 'scans': [{'ts': nu, 'b': '111', 'o': 'SCAN-VAN-H1', 'l': '2.1.3'}], 'afgerond': hist[0]['afgerond']}),
          'archief/rondje-h2.json': json.dumps({'id': 'h2', 'items': hist[1]['items'], 'scans': [{'ts': nu, 'b': '222', 'o': 'SCAN-VAN-H2', 'l': '11.2.1'}], 'afgerond': hist[1]['afgerond']})}
    tel, = vers(b, state=st); tel.start(rondje={'route': {}, 'actief': None, 'historie': hist, 'archiefWacht': []})
    mock('/__delay', {'ms': 1500, 'pad': 'archief/rondje-h1.json'})
    tel.ev("openHistSheet(rondje.historie.find(h => h.id === 'h1')); setTimeout(() => openHistSheet(rondje.historie.find(h => h.id === 'h2')), 100)")
    time.sleep(2.5)
    inh = tel.ev("$('histScans').textContent")
    check('A10: scans van het eerder geopende rondje komen niet in het nieuwe sheet', 'SCAN-VAN-H2' in inh and 'SCAN-VAN-H1' not in inh, inh)
    tel.ev(PATCH_CSV + " $('btnHistCsv').click()")
    csv = tel.ev("window.__csv")
    check('A10/C1: rapport-CSV hoort bij het open rondje', csv and any('SCAN-VAN-H2' in r for r in csv[0]['regels']), csv)
    mock('/__delay', {'ms': 0, 'pad': None})

def t_a11_d4(b):
    art = json.loads(json.dumps(ARTIKELEN)); art['artikelen'].append({'b': '666', 'a': 'O1007', 'o': 'Kabelgoot'})
    tel, = vers(b, state={'artikelen.json': json.dumps(art)}); tel.start()
    def zoek(q):
        tel.ev(f"$('zoekInput').value = {json.dumps(q)}; handmatigZoeken()")
        return tel.ev("[...$('zoekResultaten').querySelectorAll('.item .t2')].map(x => x.textContent.split(' · ')[0])")
    check('A11: zoeken met een artikel zonder velden geeft geen fout', zoek('kabelg') == ['O1007'] and tel.fouten() == [], tel.fouten())
    check('D4: zoeken op omschrijving', zoek('ring') == ['O1003', 'O1004'])
    check('D4: zoeken op locatie', zoek('21.10') == ['O1003', 'O1004'])
    check('D4: zoeken op fabrikantcode en hun nummer', zoek('F-5') == ['O1005'] and zoek('H-4') == ['O1004'])
    check('D4: exacte barcode eerst', zoek('111') == ['O1001'])
    check('D4: _zoek niet in de localStorage-cache', '_zoek' not in tel.ev("localStorage.getItem('mgz_art')"))
    check('D4: niets gevonden-melding', 'Niets gevonden' in (tel.ev("($('zoekInput').value = 'xyzxyz', handmatigZoeken(), $('zoekResultaten').textContent)") or ''))

def t_a12(b):
    nu = int(time.time() * 1000)
    tel_r = {'items': {'oud': {'b': 'oud', 'ts': nu - 40 * DAG, 'del': True}, 'nieuw': {'b': 'nieuw', 'ts': nu - DAG, 'del': True},
                       '111': {'b': '111', 'a': 'O1001', 'g': 2, 'ts': nu - 40 * DAG}}}
    ron = {'route': {'r1': {'loc': '2', 'ts': nu - 40 * DAG, 'del': True}, 'r2': {'loc': '11', 'label': '', 'ts': nu - 40 * DAG}},
           'actief': None, 'historie': [], 'archiefWacht': [], 'locUitz': {'ts': 0, 'lijst': ['ZOLDER', 'WPK', 'Oliehok']},
           'gebieden': {'ts': 0, 'lijst': []}, 'uitloop': {'444': {'ts': nu - 31 * DAG, 'del': True}, '555': {'ts': nu - 2 * DAG, 'del': True}}}
    tel, = vers(b, state={'telling.json': json.dumps(tel_r), 'rondje.json': json.dumps(ron)}); tel.start()
    time.sleep(0.5)
    r = remote('telling.json')
    check('A12: oude telling-grafsteen opgeruimd, recente en levende blijven', sorted(r['items']) == ['111', 'nieuw'], sorted(r['items']))
    r = remote('rondje.json')
    check('A12: oude route- en uitloopgrafstenen opgeruimd', sorted(r['route']) == ['r2'] and sorted(r['uitloop']) == ['555'], (sorted(r['route']), sorted(r['uitloop'])))

def t_b2(b):
    tel, = vers(b); tel.start(extra={'mgz_handscanner': '1'})
    check('B2: handscanner-stand houdt de zoekbalk gefocust', tel.ev("document.activeElement.id") == 'zoekInput' and tel.ev("$('zoekInput').getAttribute('inputmode')") == 'none')
    tel.ev("$('zoekInput').value = '111'; $('zoekInput').dispatchEvent(new Event('input'))")
    time.sleep(0.8)
    check('B2: invoer in de zoekbalk opent vanzelf', tel.ev("huidigeKey") == '111' and tel.ev("$('zoekInput').value") == '')
    tel.ev("sluitPaneel(); document.activeElement.blur()")
    tel.ev("for (const k of '222') document.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}))")
    time.sleep(0.8)
    check('B2: vangnet zonder focus opent ook', tel.ev("huidigeKey") == '222')
    tel.ev("sluitPaneel(); document.activeElement.blur()")
    tel.ev("for (const k of ['4','4','4','Enter']) document.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}))")
    check('B2: vangnet met Enter opent direct', tel.ev("huidigeKey") == '444')
    tel.ev("sluitPaneel(); $('btnToetsenbord').click()"); time.sleep(0.2)
    check('B2: ⌨-knop geeft het toetsenbord terug', tel.ev("hsTypStand") is True and tel.ev("$('zoekInput').hasAttribute('inputmode')") is False)
    check('B2: geen JS-fouten', tel.fouten() == [], tel.fouten())

def t_c3_c5(b):
    tel, = vers(b); tel.start()
    tel.ev("zoekEnOpen('999')")
    check('C3: onbekende code toont de onbekend-kop', 'Onbekende code' in tel.ev("$('artKop').textContent") and tel.ev("$('btnKlopt').hidden") is True)
    tel.ev("$('inpOpmerking').value = 'vak 7'; slaOp(false)")
    check('C3: onbekende registratie krijgt onb', tel.ev("telling.items['999'].onb") is True)
    tel.ev("zoekEnOpen('111')")
    check('C3: bekend artikel toont grid en Klopt-knop', 'Bout M8' in tel.ev("$('artKop').textContent") and tel.ev("$('btnKlopt').hidden") is False and 'Fabrikantcode' in tel.ev("$('artGrid').textContent"))
    tel.ev("slaOp(true)")
    check('C2: Voorraad klopt zet geteld op de systeemvoorraad', tel.ev("telling.items['111'].g") == 10)
    tel.ev("toonView('lijst')")
    txt = tel.ev("$('lijstItems').textContent")
    check('lijst: onbekend-badge en ✓ 10', 'onbekend' in txt and '✓ 10' in txt, txt)
    tel.ev("const cb = $('lijstItems').querySelector('.lijst-klaar'); cb.checked = true; cb.dispatchEvent(new Event('change'))")
    check('lijst: afvinken zet kl en toont klaar-kop', tel.ev("!!document.querySelector('.klaar-kop')"))
    tel.ev("document.querySelector('.lijst-del').click()")
    dood = tel.ev("Object.entries(telling.items).filter(([k, v]) => v.del).map(([k]) => k)")
    check('C5: ✕ maakt een grafsteen', len(dood) == 1, dood)
    tel.ev("zoekEnOpen('111'); verwijderRegistratie()")
    check('C5: verwijderen uit het paneel maakt een grafsteen', tel.ev("telling.items['111'].del") is True)
    reg(tel, '222', geteld=1); reg(tel, '444', geteld=0); tel.ev("toonView('lijst')")
    tel.ev("for (const cb of [...$('lijstItems').querySelectorAll('.lijst-klaar')]) { cb.checked = true; cb.dispatchEvent(new Event('change')); }")
    tel.ev("toonView('lijst'); $('btnWisKlaar').click()")
    check('C5: verwijder afgevinkte', tel.ev("Object.values(telling.items).filter(it => !it.del).length") == 0)

def t_d5(b):
    tel, = vers(b); tel.start()
    reg(tel, '111', geteld=10)
    check('D5: Gescand-lijst niet opgebouwd zolang het tabblad dicht is', tel.ev("$('lijstItems').children.length") == 0)
    check('D5: teller in de navigatie loopt wel mee', tel.ev("$('navBadge').textContent") == '1' and tel.ev("$('navBadge').hidden") is False)
    tel.ev("toonView('lijst')")
    check('D5: openen bouwt de lijst op', tel.ev("$('lijstItems').querySelectorAll('.item').length") == 1)

def t_rondje(b):
    tel, = vers(b); tel.start()
    tel.ev("openRouteSheet(null); $('inpRouteLoc').value = '2'; $('inpRouteLabel').value = 'kast twee'; bewaarRouteItem()")
    tel.ev("openRouteSheet(null); $('inpRouteLoc').value = '11'; bewaarRouteItem()")
    tel.ev("openRouteSheet(null); $('inpRouteLoc').value = '56'; bewaarRouteItem()")
    tel.ev("toonView('rondje')")
    check('rondje: route natuurlijk gesorteerd', tel.ev("routeItems().map(x => x[1].loc)") == ['2', '11', '56'])
    tel.ev("rondjeStart()")
    reg(tel, '111', geteld=10)
    st = tel.ev("routeItems().map(([id]) => (checkVan(rondje.actief, id) || {}).w || 'open')")
    check('rondje: scan vinkt kast 2 af', st == ['scan', 'open', 'open'], st)
    tel.ev("toonView('rondje'); openCheckSheet(routeItems()[1][0]); zetCheck('skip')")
    tel.ev("openCheckSheet(routeItems()[2][0]); $('inpCheckOpm').value = 'la klemt'; zetCheck('hand')")
    check('rondje: badge weg als alles behandeld is', tel.ev("$('rondjeBadge').hidden") is True)
    check('rondje: lijst toont status', 'Overgeslagen' in tel.ev("$('rondjeLijst').textContent"))
    tel.ev("openCheckSheet(routeItems()[2][0]); resetCheck()")
    check('rondje: vinkje weghalen', tel.ev("checkVan(rondje.actief, routeItems()[2][0])") is None)
    tel.ev("rondjeAfronden(false)")
    check('rondje: afronden zet historie', tel.ev("rondje.historie.length") == 1 and tel.ev("rondje.actief") is None)
    hid = tel.ev("rondje.historie[0].id")
    check('C4: rondje-id via stempelId', len(hid) == 15 and hid[4] == '-' and hid[10] == '_', hid)
    tel.ev("clearTimeout(rondjeSyncTimer); await syncRondje()")
    check('rondje: rapport in het archief', ('archief/rondje-' + hid + '.json') in mock('/__state') and tel.ev("rondje.archiefWacht.length") == 0)
    tel.ev("openHistSheet(rondje.historie[0])"); time.sleep(1)
    check('rondje: historie-sheet toont scans', 'Bout M8' in tel.ev("$('histScans').textContent"))
    tel.ev(PATCH_CSV + " $('btnHistCsv').click()")
    regels = tel.ev("window.__csv[0].regels")
    check('rondje: CSV met locaties en scans', regels[0].startswith('Locatie;Label') and any(r.startswith('2;kast twee;;gecontroleerd (scan)') for r in regels), regels)
    tel.ev("sluitSheet('histOverlay'); openRouteSheet(routeItems()[0][0])")
    check('rondje: route-sheet toont eerdere controles', 'Eerdere controles' in tel.ev("$('routeHistBlok').textContent"))
    tel.ev("verwijderRouteItem()")
    check('rondje: locatie uit de route (grafsteen)', tel.ev("routeItems().length") == 2)
    check('rondje: geen JS-fouten', tel.fouten() == [], tel.fouten())

def t_uitloop_bestel(b):
    tel, = vers(b, 1280); tel.start()
    tel.ev("zoekEnOpen('444'); wisselUitloop()")
    check('uitloop: op de lijst en banner zichtbaar', tel.ev("!!uitloopVan('444')") and tel.ev("$('uitloopBanner').hidden") is False)
    tel.ev("sluitPaneel(); toonView('overzicht')")
    check('uitloop: kaart in het Overzicht', tel.ev("$('kaartUitloop').hidden") is False and 'O1005' in tel.ev("$('ovUitloop').textContent"))
    tel.ev("$('ovUitloop').querySelector('tr[data-uitloop]').click()")
    check('uitloop: rij opent het artikel', tel.ev("huidigeKey") == '444')
    tel.ev("wisselUitloop(); sluitPaneel()")
    check('uitloop: weer eraf (grafsteen)', tel.ev("rondje.uitloop['444'].del") is True)
    reg(tel, '222', bestel=4); reg(tel, '111', bestel=2, geteld=7)
    tel.ev("toonView('overzicht')")
    txt = tel.ev("$('ovBestellen').textContent")
    check('bestel: blok per leverancier', 'Leverancier A' in txt and txt.count('O100') == 2, txt)
    tel.ev("const cb = $('ovBestellen').querySelector('.ov-besteld[data-key=\"222\"]'); cb.checked = true; cb.dispatchEvent(new Event('change'))")
    check('bestel: vinkje zet besteld en vult inkoopnummer', tel.ev("!!telling.items['222'].bsd") and tel.ev("telling.items['222'].ink") == '4')
    tel.ev("const i = $('ovBestellen').querySelector('.ov-aantal[data-key=\"111\"]'); i.value = '6'; i.dispatchEvent(new Event('change'))")
    check('bestel: aantal inline aanpassen', tel.ev("telling.items['111'].best") == 6)
    tel.ev("$('ovBestellen').querySelector('.cred-kop').click()")
    check('bestel: blok inklappen', tel.ev("ovDicht.has('Leverancier A')") and tel.ev("localStorage.getItem('mgz_ov_dicht')") == '["Leverancier A"]')
    tel.ev("$('ovBestellen').querySelector('.cred-kop').click()")
    tel.ev("navigator.clipboard.writeText = (t) => { window.__klembord = t; return Promise.resolve(); }; $('ovBestellen').querySelector('.art-kopie').click()")
    time.sleep(0.2)
    check('C6: tik op artikelnummer kopieert', tel.ev("window.__klembord") in ('O1001', 'O1002') and tel.ev("$('artPanel').hidden") is True)
    verschil = tel.ev("$('ovVerschillen').textContent")
    check('C2: telverschil 7 i.p.v. 10 = -3', '-3' in verschil, verschil)
    check('C8/C9: geen inline styles in het overzicht', tel.ev("document.querySelectorAll('#view-overzicht [style]').length") == 0)
    tel.ev("toonView('scan'); zoekEnOpen('333')")
    check('kiezer bij dubbele barcode', tel.ev("$('kiesOverlay').classList.contains('open')") and tel.ev("$('kiesLijst').children.length") == 2)
    tel.ev("$('kiesLijst').children[1].click()")
    check('kiezer: tweede artikel opent', 'Ring 10 mm' in tel.ev("$('artKop').textContent") and not tel.ev("$('kiesOverlay').classList.contains('open')"))
    check('geen JS-fouten', tel.fouten() == [], tel.fouten())

def t_instellingen(b):
    tel, = vers(b); tel.start()
    tel.ev("toonView('instellingen'); $('inpLocUitz').value = 'ZOLDER\\nWPK\\nOliehok\\n56.'; $('btnLocUitzOpslaan').click()")
    check('D3: uitzondering opslaan werkt de ⚠-teller bij', tel.ev("$('btnLocFouten').hidden") is True and tel.ev("locNotatieOk('56.')"))
    check('D3: hoofdletters maken niet uit', tel.ev("locNotatieOk('zolder')") and not tel.ev("locNotatieOk('kelder')"))
    tel.ev("$('slScanPos').value = '40'; $('slScanPos').dispatchEvent(new Event('input'))")
    check('instellingen: scanpositie', tel.ev("localStorage.getItem('mgz_scanpos')") == '40')
    tel.ev("$('selRondjeDag').value = '0'; $('selRondjeDag').dispatchEvent(new Event('change'))")
    check('instellingen: rondjesdag', tel.ev("localStorage.getItem('mgz_rondjedag')") == '0')

def kies(d, code, index, geteld=None, opm=None):
    d.ev(f"zoekEnOpen({json.dumps(code)}); $('kiesLijst').children[{index}].click()")
    if geteld is not None: d.ev(f"$('inpGeteld').value = '{geteld}'")
    if opm is not None: d.ev(f"$('inpOpmerking').value = {json.dumps(opm)}")
    d.ev("slaOp(false)")

def t_a4(b):
    tel, = vers(b, 1280); tel.start()
    kies(tel, '333', 0, geteld=4); kies(tel, '333', 1, geteld=2)
    items = tel.ev("JSON.stringify(Object.fromEntries(Object.entries(telling.items).map(([k, v]) => [k, [v.a, v.g]])))")
    check('A4: twee artikelen met dezelfde barcode hebben elk een registratie', json.loads(items) == {'333|O1003': ['O1003', 4], '333|O1004': ['O1004', 2]}, items)
    tel.ev("toonView('lijst')")
    tel.ev("[...$('lijstItems').querySelectorAll('.item')].find(el => el.textContent.includes('O1004')).click()")
    check('A4: openen vanuit de lijst opent het juiste artikel', 'Ring 10 mm' in tel.ev("$('artKop').textContent") and tel.ev("$('inpGeteld').value") == '2')
    tel.ev("sluitPaneel(); toonView('overzicht'); zetOvFilter('geteld')")
    rows = tel.ev("[...$('ovGeteld').querySelectorAll('tr[data-key]')].map(r => r.dataset.key)")
    check('A4: overzicht toont beide regels met hun eigen sleutel', sorted(rows) == ['333|O1003', '333|O1004'], rows)
    tel.ev("$('ovGeteld').querySelector('tr[data-key=\"333|O1003\"]').click()")
    check('A4: rij in het overzicht opent het juiste artikel', 'Ring 8 mm' in tel.ev("$('artKop').textContent") and tel.ev("huidigeKey") == '333|O1003')
    tel.ev("wisselUitloop(); sluitPaneel()")
    check('A4: uitloop per artikel', tel.ev("!!uitloopVan('333|O1003')") and tel.ev("rondje.uitloop['333|O1003'].b") == '333')
    tel.ev("zoekEnOpen('333'); $('kiesLijst').children[1].click()")
    check('A4: het andere artikel krijgt geen uitloopmelding', tel.ev("$('uitloopBanner').hidden") is True)
    tel.ev("sluitPaneel(); toonView('overzicht')")
    tel.ev("$('ovUitloop').querySelector('tr[data-uitloop]').click()")
    check('A4: uitloopregel opent het juiste artikel', 'Ring 8 mm' in tel.ev("$('artKop').textContent"))
    tel.ev("sluitPaneel()")
    tel.ev(PATCH_CSV + " downloadScanlijst()")
    regels = tel.ev("window.__csv[0].regels")
    check('A4: CSV bevat beide artikelen', sum(1 for r in regels if r.startswith('333;')) == 2 and any(r.startswith('333;O1003') and r.endswith(';ja;') for r in regels), regels)
    check('A4: geen JS-fouten (pc-breedte)', tel.fouten() == [], tel.fouten())
    # oude registratie (van vóór v1.14) onder de kale barcode
    nu = int(time.time() * 1000)
    oud = {'items': {'333': {'b': '333', 'a': 'O1004', 'o': 'Ring 10 mm', 'l': '21.10.6', 'v': '3', 'g': 9, 'ts': nu}}}
    pc, = vers(b, 412, state={'telling.json': json.dumps(oud)}); pc.start()
    pc.ev("zoekEnOpen('333'); $('kiesLijst').children[1].click()")
    check('A4-migratie: oude registratie blijft bij haar eigen artikel', pc.ev("huidigeKey") == '333' and pc.ev("$('inpGeteld').value") == '9')
    pc.ev("sluitPaneel(); zoekEnOpen('333'); $('kiesLijst').children[0].click()")
    check('A4-migratie: het andere artikel krijgt een eigen sleutel', pc.ev("huidigeKey") == '333|O1003' and pc.ev("$('inpGeteld').value") == '')
    pc.ev("sluitPaneel(); toonView('lijst'); $('lijstItems').querySelector('.item').click()")
    check('A4-migratie: openen vanuit de lijst', pc.ev("huidigeKey") == '333' and 'Ring 10 mm' in pc.ev("$('artKop').textContent"))
    pc.ev("sluitPaneel(); rondje.route.rz = {loc: '21', label: '', ts: Date.now()}; rondjeStart()")
    kies(pc, '333', 0, geteld=1)
    check('A4: rondje-scans per registratie', sorted(pc.ev("Object.keys(rondje.actief.scans)")) == ['333|O1003'])
    check('A4: geen JS-fouten', pc.fouten() == [], pc.fouten())

def t_a8_d6(b):
    tel, = vers(b); tel.start()
    tel.ev("await syncTellingDirect()")
    ander = json.dumps({'items': {'222': {'b': '222', 'a': 'O1002', 'g': 3, 'ts': int(time.time() * 1000)}}})
    reg(tel, '111', geteld=10)
    mock('/__naGet', {'telling.json': ander})
    tel.ev("clearTimeout(syncTimer); syncTelling()")
    time.sleep(1.0)
    check('A8: na een conflict nog niet direct opnieuw', '111' not in remote('telling.json')['items'])
    time.sleep(2.0)
    check('A8: herkansing na 1,5 s voegt alles samen', sorted(remote('telling.json')['items']) == ['111', '222'])
    mock('/__fail', {'n': 1, 'status': 500, 'methode': 'GET'})
    reg(tel, '444', geteld=1)
    tel.ev("clearTimeout(syncTimer); syncTelling()")
    time.sleep(3.0)
    check('A8: na een serverfout niet binnen 3 s opnieuw', '444' not in remote('telling.json')['items'])
    tel.ev("clearTimeout(syncTimer)")
    tel.ev("""const echt = Storage.prototype.setItem;
              Storage.prototype.setItem = function (k, v) {
                if (k === 'mgz_art') throw new DOMException('vol', 'QuotaExceededError');
                return echt.call(this, k, v);
              };
              artMeta.sha = 'oud'; window.__toasts = [];""")
    ok = tel.ev("await verversArtikelen(false)")
    check('D6: volle cache geeft een duidelijke melding', ok is True and any('te groot voor de cache' in t for t in tel.ev('window.__toasts')), tel.ev('window.__toasts'))
    check('D6: artikellijst werkt dan wel', tel.ev("artikelen.length") == 6 and tel.ev("statusPerTaak.art.soort") == 'ok')

TESTS = [t_laden, t_a1, t_a2, t_a2_review, t_a3, t_a4, t_a8_d6, t_a5, t_a6, t_a7_c1, t_a9_d2, t_a10, t_a11_d4, t_a12, t_b2, t_c3_c5, t_d5, t_rondje, t_uitloop_bestel, t_instellingen]

if __name__ == '__main__':
    filt = sys.argv[1] if len(sys.argv) > 1 else ''
    b = Browser()
    try:
        for t in TESTS:
            if filt and filt not in t.__name__: continue
            try: t(b)
            except Exception as e:
                check(t.__name__ + ' (uitzondering)', False, repr(e)); traceback.print_exc()
    finally:
        b.sluit()
    fout = [n for n, ok in resultaten if not ok]
    print(f'\n{len(resultaten) - len(fout)}/{len(resultaten)} geslaagd' + (': FOUT in ' + ', '.join(fout) if fout else ''))
    sys.exit(1 if fout or not resultaten else 0)
