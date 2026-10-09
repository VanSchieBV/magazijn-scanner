"""Visuele vergelijking: berekende opmaak per element van een oude en de huidige versie.

Handig bij een opschoonronde waarin het uiterlijk niet mag veranderen. Gebruik:
  1. de oude versie (bijv. de laatste commit) uitpakken en serveren op poort 8766:
       git archive --format=zip -o oud.zip HEAD   (uitpakken in een lege map buiten de repo)
       python -m http.server 8766 --bind 127.0.0.1 --directory <die map>
  2. de app op 8765 en mockgh.py op 8767 laten draaien (zoals draai.py doet), dan:
       python tests/visueel.py http://localhost:8766/
Verschillen in opacity komen van animaties en zijn ruis.
"""
import json, sys, time
from cdp import Browser, mock
from testdata import basis
from tests import reg

OUD = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/'

PROPS = ['display', 'color', 'font-size', 'font-weight', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
         'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'cursor', 'text-align', 'gap',
         'justify-content', 'align-items', 'background-color', 'border-top-color', 'border-top-width', 'opacity',
         'visibility', 'width', 'height', 'line-height', 'white-space']
VINGER = """(() => {
  const props = %s; const out = {};
  const naam = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const walk = (el, pad) => {
    if (el.tagName === 'SCRIPT') return;
    const cs = getComputedStyle(el);
    out[pad] = [naam(el), props.map(p => cs.getPropertyValue(p)).join('|')];
    [...el.children].filter(c => c.tagName !== 'SCRIPT').forEach((c, i) => walk(c, pad + '>' + c.tagName.toLowerCase() + i));
  };
  walk(document.body, 'body');
  return out;
})()""" % json.dumps(PROPS)

def scenario(d, breed):
    uit = {}
    nu = int(time.time() * 1000)
    uit['scan'] = d.ev(VINGER)
    reg(d, '111', geteld=7, bestel=2, opm='opm'); reg(d, '222', bestel=4); reg(d, '444', geteld=0)
    d.ev("toonView('lijst')"); uit['lijst'] = d.ev(VINGER)
    d.ev("$('lijstItems').querySelector('.item').click()"); uit['paneel'] = d.ev(VINGER)
    d.ev("sluitPaneel(); zoekEnOpen('999')"); uit['paneel-onbekend'] = d.ev(VINGER)
    d.ev("sluitPaneel(); toonView('overzicht')"); uit['overzicht'] = d.ev(VINGER)
    d.ev("zetOvFilter('geteld')"); uit['overzicht-geteld'] = d.ev(VINGER)
    d.ev("toonView('instellingen')"); uit['instellingen'] = d.ev(VINGER)
    d.ev("toonView('rondje')"); uit['rondje-leeg'] = d.ev(VINGER)
    d.ev("openRouteSheet(null)"); uit['route-sheet-leeg'] = d.ev(VINGER)
    d.ev("$('inpRouteLoc').value = '2'; bewaarRouteItem(); openRouteSheet(null); $('inpRouteLoc').value = '11'; bewaarRouteItem()")
    uit['rondje-route'] = d.ev(VINGER)
    d.ev("rondjeStart()"); uit['rondje-actief'] = d.ev(VINGER)
    d.ev("openCheckSheet(routeItems()[0][0])"); uit['check-sheet'] = d.ev(VINGER)
    d.ev("zetCheck('hand'); rondjeAfronden(false); toonView('rondje')"); uit['rondje-historie'] = d.ev(VINGER)
    d.ev("openRouteSheet(routeItems()[0][0])"); uit['route-sheet-hist'] = d.ev(VINGER)
    d.ev("sluitSheet ? sluitSheet('routeOverlay') : $('routeOverlay').classList.remove('open')")
    d.ev("openHistSheet(rondje.historie[0])"); time.sleep(0.5); uit['hist-sheet'] = d.ev(VINGER)
    d.ev("$('histOverlay').classList.remove('open'); zoekEnOpen('333')"); uit['kiezer'] = d.ev(VINGER)
    return uit

b = Browser()
try:
    res = {}
    for versie, base in (('oud', OUD), ('nieuw', 'http://localhost:8765/')):
        for breed in (412, 1280):
            b.ruim_op(); mock('/__reset', {}); mock('/__state', basis())
            d = b.apparaat(breed)
            d.start(basis=base)
            d.ev("if (typeof sluitSheet === 'undefined') window.sluitSheet = id => $(id).classList.remove('open')")
            res[(versie, breed)] = scenario(d, breed)
            print(versie, breed, 'fouten:', d.fouten())
    for breed in (412, 1280):
        oud, nieuw = res[('oud', breed)], res[('nieuw', breed)]
        for sc in oud:
            o, n = oud[sc], nieuw[sc]
            verschil = []
            for pad in sorted(set(o) | set(n)):
                if pad not in o or pad not in n:
                    verschil.append((pad, 'alleen ' + ('oud' if pad in o else 'nieuw'), (o.get(pad) or n.get(pad))[0])); continue
                if o[pad][1] != n[pad][1]:
                    po, pn = o[pad][1].split('|'), n[pad][1].split('|')
                    d = {PROPS[i]: (po[i], pn[i]) for i in range(len(PROPS)) if po[i] != pn[i]}
                    verschil.append((pad, d, o[pad][0] + ' -> ' + n[pad][0]))
            print(f'== {breed}px {sc}: {len(verschil)} verschillen')
            for v in verschil[:12]: print('   ', v)
finally:
    b.sluit()
