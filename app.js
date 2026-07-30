/* Magazijn Scanner — app-logica
 * Data: privé-repo VanSchieBV/magazijn-data (artikelen.json / telling.json)
 * Sync: GitHub Contents API met fine-grained PAT (alleen die repo, Contents r/w)
 */
'use strict';

const VERSIE = '1.7.0';
const DATA_REPO = 'VanSchieBV/magazijn-data';
const API_BASE = 'https://api.github.com/repos/' + DATA_REPO + '/contents/';

// ---------- state ----------
let artikelen = [];            // [{b,a,o,c,f,h,l,v}]
let artIndex = new Map();      // barcode -> [artikel,...]
let artNrIndex = new Map();    // artikelnummer (upper) -> artikel
let telling = { items: {} };   // key -> {b,a,o,c,f,h,l,v,g,best,opm,ts,onb}
let huidigeKey = null;         // key van artikel in het open paneel
let huidigArt = null;          // artikel-object in het open paneel
let bladerKeys = [];           // volgorde om door getelde artikelen te bladeren
let bladerIdx = -1;
let syncTimer = null;
let syncBezig = false;
let syncNodig = false;

const $ = (id) => document.getElementById(id);
// verwijderde registraties blijven als tombstone ({del:true, ts}) staan zodat de
// verwijdering meesynct naar andere apparaten; overal via levend() filteren
const levend = (it) => (it && !it.del ? it : null);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- opslag ----------
function laadLokaal() {
  try {
    const a = localStorage.getItem('mgz_art');
    if (a) {
      const d = JSON.parse(a);
      artikelen = d.artikelen || [];
      artMeta = { sha: d.sha || null, bijgewerkt: d.bijgewerkt || '?' };
      bouwIndex();
    }
  } catch (e) { /* corrupte cache negeren */ }
  try {
    const t = localStorage.getItem('mgz_telling');
    if (t) telling = JSON.parse(t);
    if (!telling.items) telling.items = {};
  } catch (e) { telling = { items: {} }; }
}
let artMeta = { sha: null, bijgewerkt: '?' };

function bewaarArt() {
  localStorage.setItem('mgz_art', JSON.stringify({
    sha: artMeta.sha, bijgewerkt: artMeta.bijgewerkt, artikelen
  }));
}
function bewaarTelling() {
  localStorage.setItem('mgz_telling', JSON.stringify(telling));
}
function getToken() { return localStorage.getItem('mgz_token') || ''; }

function bouwIndex() {
  artIndex = new Map();
  artNrIndex = new Map();
  for (const art of artikelen) {
    const lijst = artIndex.get(art.b);
    if (lijst) lijst.push(art); else artIndex.set(art.b, [art]);
    if (art.a) artNrIndex.set(art.a.toUpperCase(), art);
  }
}

// ---------- GitHub API ----------
function ghHeaders(extra) {
  return Object.assign({
    'Authorization': 'Bearer ' + getToken(),
    'X-GitHub-Api-Version': '2022-11-28'
  }, extra || {});
}

async function ghDirInfo(bestand) {
  // sha van een bestand opvragen via de mapindex (werkt ook voor bestanden > 1 MB)
  const r = await fetch(API_BASE + '?t=' + Date.now(), { headers: ghHeaders() });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const lijst = await r.json();
  return lijst.find(x => x.name === bestand) || null;
}

async function ghGetRaw(bestand) {
  const r = await fetch(API_BASE + bestand + '?t=' + Date.now(), {
    headers: ghHeaders({ 'Accept': 'application/vnd.github.raw+json' })
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return await r.text();
}

async function ghPut(bestand, tekst, sha, bericht) {
  const bytes = new TextEncoder().encode(tekst);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  const body = { message: bericht, content: btoa(bin) };
  if (sha) body.sha = sha;
  const r = await fetch(API_BASE + bestand, {
    method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const e = new Error('GitHub ' + r.status);
    e.status = r.status;
    throw e;
  }
  return (await r.json()).content.sha;
}

// ---------- artikellijst verversen ----------
async function verversArtikelen(stil) {
  if (!getToken()) { toonSetupBanner(); return false; }
  try {
    zetStatus('busy', 'Artikellijst…');
    const info = await ghDirInfo('artikelen.json');
    if (!info) throw new Error('artikelen.json niet gevonden in de data-repo');
    if (info.sha === artMeta.sha && artikelen.length) {
      zetStatus('ok', 'Actueel');
      if (!stil) toast('Artikellijst is al actueel');
      updateArtInfo();
      return true;
    }
    const raw = await ghGetRaw('artikelen.json');
    const d = JSON.parse(raw);
    artikelen = d.artikelen || [];
    artMeta = { sha: info.sha, bijgewerkt: d.bijgewerkt || '?' };
    bouwIndex();
    bewaarArt();
    zetStatus('ok', 'Actueel');
    if (!stil) toast('Artikellijst ververst: ' + artikelen.length + ' artikelen');
    updateArtInfo();
    return true;
  } catch (e) {
    zetStatus('err', 'Fout');
    if (!stil) toast('Verversen mislukt: ' + e.message, true);
    return false;
  }
}

function updateArtInfo() {
  $('artInfo').textContent = artikelen.length
    ? artikelen.length + ' artikelen · export van ' + artMeta.bijgewerkt
    : 'Nog geen artikellijst geladen.';
}

// ---------- telling sync ----------
function planSync() {
  syncNodig = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncTelling, 1500);
}

async function syncTelling() {
  if (!getToken() || !navigator.onLine) { zetStatus('err', 'Offline'); return; }
  if (syncBezig) { planSync(); return; }
  syncBezig = true;
  syncNodig = false;
  zetStatus('busy', 'Sync…');
  try {
    // ophalen + samenvoegen (nieuwste timestamp wint per artikel)
    let remote = { items: {} };
    let sha = null;
    const raw = await ghGetRaw('telling.json');
    if (raw !== null) {
      const info = await ghDirInfo('telling.json');
      sha = info ? info.sha : null;
      try { remote = JSON.parse(raw); } catch (e) { remote = { items: {} }; }
      if (!remote.items) remote.items = {};
    }
    let veranderd = false;
    const samen = Object.assign({}, remote.items);
    for (const [k, v] of Object.entries(telling.items)) {
      if (!samen[k] || (v.ts || 0) > (samen[k].ts || 0)) { samen[k] = v; veranderd = true; }
    }
    telling.items = samen;
    bewaarTelling();
    if (veranderd || raw === null) {
      await ghPut('telling.json', JSON.stringify({ items: samen }), sha, 'Telling bijgewerkt via app');
    }
    zetStatus('ok', 'Gesynct');
  } catch (e) {
    if (e.status === 409 || e.status === 422) { planSync(); }
    else if (e.status === 401 || e.status === 403) { zetStatus('err', 'Token?'); }
    else zetStatus('err', 'Sync-fout');
    syncNodig = true;
  } finally {
    syncBezig = false;
    renderAlles();
    if (syncNodig && navigator.onLine) { clearTimeout(syncTimer); syncTimer = setTimeout(syncTelling, 8000); }
  }
}

function zetStatus(soort, tekst) {
  $('statusDot').className = 'status-dot ' + soort;
  $('statusTxt').textContent = tekst;
}

// ---------- scanner ----------
let camStream = null;
let camActief = false;
let zxingReader = null;
let detectorLus = null;
let audioCtx = null;
let scanTriggerTot = 0;   // tot welk tijdstip (ms) er actief gescand wordt
let triggerTimer = null;

const TRIGGER_VENSTER = 2500; // ms zoeken na een druk op de scanknop

function scanActief() { return camActief && Date.now() <= scanTriggerTot; }

function scanNu() {
  if (!camActief) return;
  scanTriggerTot = Date.now() + TRIGGER_VENSTER;
  $('camOverlay').classList.add('scanning');
  $('camMsg').textContent = 'Scannen…';
  clearTimeout(triggerTimer);
  triggerTimer = setTimeout(() => {
    if (camActief && !scanActief()) {
      $('camOverlay').classList.remove('scanning');
      $('camMsg').textContent = 'Geen code gevonden — richt en druk opnieuw op Scan';
    }
  }, TRIGGER_VENSTER + 100);
}

// bij meerdere codes in beeld: pak de code die het dichtst bij het midden ligt
function dichtstBijMidden(codes, video) {
  const cx = video.videoWidth / 2, cy = video.videoHeight / 2;
  let beste = codes[0], besteAfstand = Infinity;
  for (const c of codes) {
    const b = c.boundingBox;
    if (!b) continue;
    const dx = (b.x + b.width / 2) - cx;
    const dy = (b.y + b.height / 2) - cy;
    const afstand = dx * dx + dy * dy;
    if (afstand < besteAfstand) { besteAfstand = afstand; beste = c; }
  }
  return beste;
}

function piep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 1400;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.17);
  } catch (e) { /* geluid is optioneel */ }
  if (navigator.vibrate) navigator.vibrate(70);
}

async function startScanner() {
  if (camActief) return;
  camActief = true;
  scanTriggerTot = 0;
  $('camOverlay').classList.add('open');
  $('camOverlay').classList.remove('scanning');
  $('camMsg').textContent = 'Camera starten…';
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  const video = $('camVideo');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = camStream;
    await video.play();
    $('camMsg').textContent = 'Richt op de code en druk op Scan';

    // zaklamp-knop tonen als de camera dat kan
    const track = camStream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('btnTorch').hidden = !caps.torch;
    $('btnTorch').classList.remove('torch-on');

    if ('BarcodeDetector' in window) {
      const formaten = await window.BarcodeDetector.getSupportedFormats();
      const detector = new window.BarcodeDetector({
        formats: formaten.filter(f => ['qr_code','code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','itf','data_matrix','codabar'].includes(f))
      });
      detectorLus = setInterval(async () => {
        if (!scanActief() || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length && scanActief()) verwerkScan(dichtstBijMidden(codes, video).rawValue);
        } catch (e) { /* frame overslaan */ }
      }, 140);
    } else {
      // fallback: ZXing
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.CODE_93, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.ITF,
        ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.CODABAR
      ]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxingReader = new ZXing.BrowserMultiFormatReader(hints);
      zxingReader.decodeFromStream(camStream, video, (res) => {
        if (res && scanActief()) verwerkScan(res.getText());
      });
    }
  } catch (e) {
    camActief = false;
    $('camOverlay').classList.remove('open');
    toast('Camera niet beschikbaar: ' + e.message, true);
  }
}

function stopScanner() {
  camActief = false;
  scanTriggerTot = 0;
  clearTimeout(triggerTimer);
  clearInterval(detectorLus);
  detectorLus = null;
  $('camOverlay').classList.remove('scanning');
  if (zxingReader) { try { zxingReader.reset(); } catch (e) {} zxingReader = null; }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  $('camVideo').srcObject = null;
  $('camOverlay').classList.remove('open');
  if (updateWacht && $('artPanel').hidden) location.reload();
}

async function wisselTorch() {
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  const aan = !$('btnTorch').classList.contains('torch-on');
  try {
    await track.applyConstraints({ advanced: [{ torch: aan }] });
    $('btnTorch').classList.toggle('torch-on', aan);
  } catch (e) { toast('Zaklamp niet beschikbaar', true); }
}

function verwerkScan(code) {
  if (!camActief) return;
  scanTriggerTot = 0;
  stopScanner();
  piep();
  zoekEnOpen(String(code).trim());
}

// ---------- artikel zoeken & paneel ----------
function zoekEnOpen(code) {
  let treffers = artIndex.get(code) || [];
  if (!treffers.length) {
    const opArtNr = artNrIndex.get(code.toUpperCase());
    if (opArtNr) treffers = [opArtNr];
  }
  if (treffers.length > 1) { toonKiezer(treffers, code); return; }
  if (treffers.length === 1) { openPaneel(treffers[0]); return; }
  openPaneelOnbekend(code);
}

function toonKiezer(treffers, code) {
  const div = $('kiesLijst');
  div.innerHTML = '';
  for (const art of treffers) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<div class="mid"><div class="t1">' + esc(art.o) + '</div>' +
      '<div class="t2">' + esc(art.a) + ' · locatie ' + esc(art.l || '?') + '</div></div>' +
      '<div class="right"><span class="badge groen">' + esc(art.v) + '</span></div>';
    el.onclick = () => { $('kiesOverlay').classList.remove('open'); openPaneel(art); };
    div.appendChild(el);
  }
  $('kiesOverlay').classList.add('open');
}

function openPaneel(art, behoudBlader) {
  huidigArt = art;
  huidigeKey = art.b;
  const bestaand = levend(telling.items[huidigeKey]);
  $('artKop').innerHTML =
    '<div class="art-title">' + esc(art.o) + '</div>' +
    '<div class="art-nr">' + esc(art.a) +
    (bestaand ? ' <span class="badge groen">al geteld</span>' : '') +
    (bestaand && bestaand.bsd ? ' <span class="badge geel">🛒 besteld</span>' : '') + '</div>';
  $('artGrid').innerHTML =
    veld('Locatie', esc(art.l || '–'), 'big') +
    veld('Tech. voorraad', esc(art.v || '0'), 'groen big') +
    veld('Crediteur', esc(art.c || '–')) +
    veld('Fabrikantcode', esc(art.f || '–') +
      (art.f ? ' <button class="copy-mini" data-copy="' + esc(art.f) + '">⧉ kopieer</button>' : '')) +
    veld('Hun nummer', art.h
      ? '<span class="kopieer-waarde" data-copy="' + esc(art.h) + '">' + esc(art.h) + '</span>'
      : '–') +
    veld('Barcode', esc(art.b));
  bindKopieKnoppen($('artGrid'));
  $('inpGeteld').value = bestaand && bestaand.g != null ? bestaand.g : '';
  $('inpBestellen').value = bestaand && bestaand.best != null ? bestaand.best : '';
  $('inpOpmerking').value = bestaand ? (bestaand.opm || '') : '';
  zetActiefVeld('inpBestellen');
  $('btnVerwijder').hidden = !bestaand;
  $('btnKlopt').hidden = false;
  $('scanIdle').hidden = true;
  $('artPanel').hidden = false;
  if (!behoudBlader) bouwBlader();
  updateBladerUI();
  updateBesteldKnop();
  toonView('scan');
  window.scrollTo(0, 0);
}

function openPaneelOnbekend(code, behoudBlader) {
  huidigArt = { b: code, a: '', o: 'Onbekende code', c: '', f: '', h: '', l: '', v: '', onb: true };
  huidigeKey = code;
  const bestaand = levend(telling.items[huidigeKey]);
  $('artKop').innerHTML =
    '<div class="art-title">Onbekende code <span class="badge rood">niet in artikellijst</span></div>' +
    '<div class="art-nr">' + esc(code) +
    (bestaand && bestaand.bsd ? ' <span class="badge geel">🛒 besteld</span>' : '') + '</div>';
  $('artGrid').innerHTML = veld('Gescand', esc(code)) +
    veld('Tip', 'Zet in de opmerking om welk artikel/vak het gaat');
  $('inpGeteld').value = bestaand && bestaand.g != null ? bestaand.g : '';
  $('inpBestellen').value = bestaand && bestaand.best != null ? bestaand.best : '';
  $('inpOpmerking').value = bestaand ? (bestaand.opm || '') : '';
  zetActiefVeld('inpBestellen');
  $('btnVerwijder').hidden = !bestaand;
  $('btnKlopt').hidden = true;
  $('scanIdle').hidden = true;
  $('artPanel').hidden = false;
  if (!behoudBlader) bouwBlader();
  updateBladerUI();
  updateBesteldKnop();
  toonView('scan');
  window.scrollTo(0, 0);
}

function bindKopieKnoppen(container) {
  container.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => {
      const w = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(w)
        .then(() => toast('Gekopieerd: ' + w))
        .catch(() => toast('Kopiëren mislukt', true));
    };
  });
}

// ---------- bladeren door getelde artikelen ----------
function bouwBlader() {
  bladerKeys = Object.entries(telling.items)
    .filter(x => !x[1].del)
    .sort((x, y) => (y[1].ts || 0) - (x[1].ts || 0))
    .map(x => x[0]);
}

function updateBladerUI() {
  bladerIdx = bladerKeys.indexOf(huidigeKey);
  const nav = $('bladerNav');
  if (bladerIdx < 0 || bladerKeys.length < 2) { nav.hidden = true; return; }
  nav.hidden = false;
  $('bladerPos').textContent = (bladerIdx + 1) + ' / ' + bladerKeys.length;
  $('btnVorig').disabled = bladerIdx === 0;
  $('btnVolgend').disabled = bladerIdx === bladerKeys.length - 1;
}

function blader(richting) {
  const i = bladerIdx + richting;
  if (i < 0 || i >= bladerKeys.length) return;
  openViaKey(bladerKeys[i]);
}

function openViaKey(key) {
  const it = levend(telling.items[key]);
  if (!it) { bouwBlader(); updateBladerUI(); return; }
  const art = (artIndex.get(it.b) || [])[0];
  if (art) openPaneel(art, true); else openPaneelOnbekend(it.b, true);
}

// ---------- besteld-markering ----------
function updateBesteldKnop() {
  const btn = $('btnBesteld');
  const bestaand = levend(telling.items[huidigeKey]);
  if (bestaand && bestaand.bsd) {
    btn.textContent = '🛒 Besteld ✓ — tik om ongedaan te maken';
    btn.classList.add('besteld-actief');
  } else {
    const heeftVolgende = bladerIdx >= 0 && bladerIdx < bladerKeys.length - 1;
    btn.textContent = heeftVolgende ? '🛒 Besteld → volgende artikel' : '🛒 Markeer als besteld';
    btn.classList.remove('besteld-actief');
  }
}

function wisselBesteld() {
  if (!huidigArt) return;
  const bestaand = levend(telling.items[huidigeKey]);
  if (bestaand && bestaand.bsd) {
    delete bestaand.bsd;
    bestaand.ts = Date.now();
    bewaarTelling();
    planSync();
    renderAlles();
    updateBesteldKnop();
    toast('Bestelmarkering verwijderd');
    return;
  }
  const entry = bouwEntry(false);
  entry.bsd = Date.now();
  telling.items[huidigeKey] = entry;
  bewaarTelling();
  planSync();
  renderAlles();
  toast('🛒 ' + (huidigArt.a || huidigArt.b) + ' besteld');
  if (bladerIdx >= 0 && bladerIdx < bladerKeys.length - 1) blader(1);
  else { updateBladerUI(); updateBesteldKnop(); }
}

// ---------- geselecteerd telveld (− en + werken op dit veld) ----------
let actiefVeld = 'inpGeteld';
function zetActiefVeld(id) {
  actiefVeld = id;
  $('veldGeteld').classList.toggle('sel', id === 'inpGeteld');
  $('veldBestellen').classList.toggle('sel', id === 'inpBestellen');
}

// ---------- registratie verwijderen ----------
function verwijderRegistratie() {
  const bestaand = levend(telling.items[huidigeKey]);
  if (!bestaand) return;
  const naam = huidigArt ? (huidigArt.a || huidigArt.b) : huidigeKey;
  if (!confirm(naam + ' uit de controle verwijderen?\n\nGeteld, bestellen en opmerking van dit artikel worden gewist (op alle apparaten).')) return;
  // tombstone i.p.v. echt wissen, anders komt het item bij de volgende sync terug
  telling.items[huidigeKey] = { b: bestaand.b, ts: Date.now(), del: true };
  bewaarTelling();
  planSync();
  renderAlles();
  toast('🗑 ' + naam + ' uit de controle verwijderd');
  // binnen de huidige bladervolgorde doorschuiven naar het volgende artikel
  const idx = bladerIdx;
  bladerKeys = bladerKeys.filter(k => k !== huidigeKey && levend(telling.items[k]));
  if (bladerKeys.length) openViaKey(bladerKeys[Math.min(Math.max(idx, 0), bladerKeys.length - 1)]);
  else sluitPaneel();
}

function veld(lbl, val, klasse) {
  return '<div class="art-field"><div class="lbl">' + lbl + '</div><div class="val ' + (klasse || '') + '">' + val + '</div></div>';
}

function sluitPaneel() {
  huidigArt = null;
  huidigeKey = null;
  $('artPanel').hidden = true;
  $('scanIdle').hidden = false;
  if (updateWacht) location.reload();
}

function leesGetal(id) {
  const v = $(id).value.trim();
  if (v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function bouwEntry(kloptDirect) {
  const art = huidigArt;
  const entry = {
    b: art.b, a: art.a, o: art.o, c: art.c, f: art.f, h: art.h, l: art.l, v: art.v,
    g: kloptDirect ? (parseInt(art.v, 10) || 0) : leesGetal('inpGeteld'),
    best: leesGetal('inpBestellen'),
    opm: $('inpOpmerking').value.trim(),
    ts: Date.now()
  };
  if (art.onb) entry.onb = true;
  const oud = telling.items[huidigeKey];
  if (oud && oud.bsd) entry.bsd = oud.bsd; // besteld-markering behouden bij opnieuw opslaan
  return entry;
}

function slaOp(kloptDirect) {
  if (!huidigArt) return;
  const art = huidigArt;
  const entry = bouwEntry(kloptDirect);
  if (entry.g == null && entry.best == null && !entry.opm) {
    if (levend(telling.items[huidigeKey])) {
      toast('Alles leeg — gebruik 🗑 om de registratie te verwijderen', true);
    } else {
      toast('Niets ingevuld — vul geteld, bestellen of een opmerking in', true);
    }
    return;
  }
  telling.items[huidigeKey] = entry;
  bewaarTelling();
  planSync();
  const naam = art.a || art.b;
  toast(kloptDirect ? ('✓ ' + naam + ' klopt (' + entry.g + ')') : ('✓ ' + naam + ' opgeslagen'));
  sluitPaneel();
  renderAlles();
  if ($('swDoorscannen').checked) startScanner();
}

// ---------- handmatig zoeken ----------
function handmatigZoeken() {
  const q = $('zoekInput').value.trim();
  const div = $('zoekResultaten');
  div.innerHTML = '';
  if (!q) return;
  const qU = q.toUpperCase();
  // exacte treffer eerst
  let res = (artIndex.get(q) || []).slice();
  const opNr = artNrIndex.get(qU);
  if (opNr && !res.includes(opNr)) res.push(opNr);
  if (!res.length && q.length >= 2) {
    for (const art of artikelen) {
      if (art.o.toUpperCase().includes(qU) || art.a.toUpperCase().includes(qU) ||
          art.f.toUpperCase().includes(qU) || art.h.toUpperCase().includes(qU) ||
          art.b.includes(q) || art.l.toUpperCase().includes(qU)) {
        res.push(art);
        if (res.length >= 40) break;
      }
    }
  }
  if (!res.length) {
    div.innerHTML = '<div class="leeg-melding">Niets gevonden voor “' + esc(q) + '”</div>';
    return;
  }
  for (const art of res) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<div class="mid"><div class="t1">' + esc(art.o) + '</div>' +
      '<div class="t2">' + esc(art.a) + ' · ' + esc(art.l || 'geen locatie') + '</div></div>' +
      '<div class="right"><span class="badge groen">' + esc(art.v) + '</span></div>';
    el.onclick = () => { div.innerHTML = ''; $('zoekInput').value = ''; openPaneel(art); };
    div.appendChild(el);
  }
}

// ---------- lijst-weergave ----------
function maakLijstItem(it) {
  const verschil = it.g != null && String(it.g) !== String(parseInt(it.v, 10) || 0);
  let badgeHtml = '';
  if (it.onb) badgeHtml = '<span class="badge rood">onbekend</span>';
  else if (verschil) badgeHtml = '<span class="badge rood">' + it.g + ' i.p.v. ' + (parseInt(it.v, 10) || 0) + '</span>';
  else if (it.g != null) badgeHtml = '<span class="badge groen">✓ ' + it.g + '</span>';
  if (it.bsd) badgeHtml += ' <span class="badge groen">🛒 besteld' + (it.best > 0 ? ' ' + it.best : '') + '</span>';
  else if (it.best != null && it.best > 0) badgeHtml += ' <span class="badge geel">bestel ' + it.best + '</span>';
  const el = document.createElement('div');
  el.className = 'item' + (it.kl ? ' klaar' : '');
  el.innerHTML = '<input type="checkbox" class="lijst-klaar" aria-label="Klaar"' + (it.kl ? ' checked' : '') + '>' +
    '<div class="mid"><div class="t1">' + esc(it.o) + '</div>' +
    '<div class="t2">' + esc(it.a || it.b) + ' · ' + esc(it.l || '–') +
    (it.opm ? ' · 💬 ' + esc(it.opm) : '') + '</div></div>' +
    '<div class="right">' + badgeHtml + '</div>' +
    (it.kl ? '<button class="lijst-del" aria-label="Verwijderen">✕</button>' : '');
  el.onclick = () => {
    const art = (artIndex.get(it.b) || [])[0];
    if (art) openPaneel(art); else openPaneelOnbekend(it.b);
  };
  // afvinken: item wordt als "klaar" gemarkeerd en zakt naar de klaar-sectie
  const cb = el.querySelector('.lijst-klaar');
  cb.onclick = (e) => e.stopPropagation();
  cb.onchange = () => {
    const item = levend(telling.items[it.b]);
    if (!item) return;
    if (cb.checked) item.kl = Date.now(); else delete item.kl;
    item.ts = Date.now();
    bewaarTelling();
    planSync();
    renderAlles();
  };
  const del = el.querySelector('.lijst-del');
  if (del) del.onclick = (e) => {
    e.stopPropagation();
    // tombstone i.p.v. echt wissen, anders komt het item bij de volgende sync terug
    telling.items[it.b] = { b: it.b, ts: Date.now(), del: true };
    bewaarTelling();
    planSync();
    renderAlles();
    toast('🗑 ' + (it.a || it.b) + ' uit de controle verwijderd');
  };
  return el;
}

function renderLijst() {
  const items = Object.values(telling.items).filter(it => !it.del).sort((a, b2) => (b2.ts || 0) - (a.ts || 0));
  const actief = items.filter(it => !it.kl);
  const klaar = items.filter(it => it.kl);
  $('lijstSub').textContent = items.length
    ? items.length + ' artikelen geregistreerd' + (klaar.length ? ' · ' + klaar.length + ' klaar' : '')
    : 'Nog niets gescand';
  const badge = $('navBadge');
  badge.hidden = !items.length;
  badge.textContent = items.length;
  const div = $('lijstItems');
  div.innerHTML = '';
  if (!items.length) {
    div.innerHTML = '<div class="leeg-melding">Scan een code om te beginnen.</div>';
    return;
  }
  for (const it of actief) div.appendChild(maakLijstItem(it));
  if (klaar.length) {
    const kop = document.createElement('div');
    kop.className = 'klaar-kop';
    kop.innerHTML = '<span>Klaar · ' + klaar.length + '</span>' +
      '<button class="btn stil klein" id="btnWisKlaar">🗑 Verwijder afgevinkte</button>';
    kop.querySelector('#btnWisKlaar').onclick = () => {
      if (!confirm(klaar.length + ' afgevinkte artikel(en) uit de controle verwijderen?\n\nGeteld, bestellen en opmerkingen van deze artikelen worden gewist (op alle apparaten).')) return;
      const nu = Date.now();
      for (const it of klaar) telling.items[it.b] = { b: it.b, ts: nu, del: true };
      bewaarTelling();
      planSync();
      renderAlles();
      toast('🗑 ' + klaar.length + ' artikel(en) uit de controle verwijderd');
    };
    div.appendChild(kop);
    for (const it of klaar) div.appendChild(maakLijstItem(it));
  }
}

// ---------- overzicht ----------
// crediteur van een regel: de waarde uit de actuele artikellijst wint, zodat
// eerder gescande regels de volledige naam tonen zodra die lijst is ververst
function credVan(it) {
  const art = (artIndex.get(it.b) || [])[0];
  return (art && art.c) || it.c || '';
}

// filter via de vier tegels bovenaan; null = de gebruikelijke drie secties
let ovFilter = null;

function zetOvFilter(sectie) {
  ovFilter = (ovFilter === sectie) ? null : sectie;
  renderOverzicht();
  window.scrollTo(0, 0);
}

function pasOvFilterToe() {
  const labels = {
    geteld: 'Alleen geteld', verschillen: 'Alleen telverschillen',
    bestellen: 'Alleen te bestellen', opmerkingen: 'Alleen opmerkingen'
  };
  // zonder filter blijft Geteld verborgen: die lijst is lang en staat al in Gescand
  $('kaartGeteld').hidden = ovFilter !== 'geteld';
  $('kaartVerschillen').hidden = !(ovFilter === null || ovFilter === 'verschillen');
  $('kaartBestellen').hidden = !(ovFilter === null || ovFilter === 'bestellen');
  $('kaartOpmerkingen').hidden = !(ovFilter === null || ovFilter === 'opmerkingen');
  $('ovFilterMelding').hidden = !ovFilter;
  if (ovFilter) $('ovFilterTekst').textContent = labels[ovFilter];
}

// rijen klikbaar maken: opent het artikelpaneel en laat < / > door de
// artikelen bladeren in de volgorde van deze overzichtssectie
function koppelOverzichtRijen(container) {
  const rijen = container.querySelectorAll('tr[data-key]');
  const keys = Array.from(rijen).map(r => r.getAttribute('data-key'));
  rijen.forEach(r => {
    r.onclick = () => { bladerKeys = keys.slice(); openViaKey(r.getAttribute('data-key')); };
  });
}

function renderOverzicht() {
  const items = Object.values(telling.items).filter(it => !it.del);
  const verschillen = items.filter(it => !it.onb && it.g != null && it.g !== (parseInt(it.v, 10) || 0));
  const bestellen = items.filter(it => it.best != null && it.best > 0);
  const opmerkingen = items.filter(it => it.opm);
  const geteld = items.filter(it => it.g != null);

  // de vier tegels zijn filters: tik = alleen die sectie, nog eens tikken = alles
  const tegel = (sectie, kleur, n, label) =>
    '<button type="button" class="stat' + (kleur ? ' ' + kleur : '') +
    (ovFilter === sectie ? ' sel' : '') + '" data-sectie="' + sectie + '">' +
    '<div class="n">' + n + '</div><div class="l">' + label + '</div></button>';
  $('ovStats').innerHTML =
    tegel('geteld', 'groen', geteld.length, 'Geteld') +
    tegel('verschillen', 'rood', verschillen.length, 'Telverschillen') +
    tegel('bestellen', 'geel', bestellen.length, 'Te bestellen') +
    tegel('opmerkingen', '', opmerkingen.length, 'Opmerkingen');
  $('ovStats').querySelectorAll('[data-sectie]').forEach(b => {
    b.onclick = () => zetOvFilter(b.getAttribute('data-sectie'));
  });
  pasOvFilterToe();

  // geteld — alleen zichtbaar als er op de tegel Geteld is getikt
  if (!geteld.length) {
    $('ovGeteld').innerHTML = '<div class="leeg-melding">Nog niets geteld</div>';
  } else {
    let h = '<table><tr><th>Artikel</th><th>Locatie</th><th class="num">Systeem</th><th class="num">Geteld</th></tr>';
    for (const it of geteld.sort((a, b) => (a.l || '').localeCompare(b.l || ''))) {
      const sys = parseInt(it.v, 10) || 0;
      const afwijkend = !it.onb && it.g !== sys;
      h += '<tr data-key="' + esc(it.b) + '"><td><b>' + esc(it.a || it.b) + '</b><br><span style="color:var(--muted)">' + esc(it.o) + '</span></td>' +
        '<td>' + esc(it.l || '–') + '</td><td class="num">' + (it.onb ? '–' : sys) + '</td>' +
        '<td class="num" style="font-weight:600' + (afwijkend ? ';color:var(--red)' : ';color:var(--green)') + '">' + it.g + '</td></tr>';
    }
    $('ovGeteld').innerHTML = h + '</table>';
    koppelOverzichtRijen($('ovGeteld'));
  }

  // telverschillen
  if (!verschillen.length) {
    $('ovVerschillen').innerHTML = '<div class="leeg-melding">Geen telverschillen 🎉</div>';
  } else {
    let h = '<table><tr><th>Artikel</th><th>Locatie</th><th class="num">Systeem</th><th class="num">Geteld</th><th class="num">Verschil</th></tr>';
    for (const it of verschillen.sort((a, b) => (a.l || '').localeCompare(b.l || ''))) {
      const sys = parseInt(it.v, 10) || 0;
      const d = it.g - sys;
      h += '<tr data-key="' + esc(it.b) + '"><td><b>' + esc(it.a) + '</b><br><span style="color:var(--muted)">' + esc(it.o) + '</span></td>' +
        '<td>' + esc(it.l || '–') + '</td><td class="num">' + sys + '</td><td class="num">' + it.g + '</td>' +
        '<td class="num" style="color:var(--red);font-weight:600">' + (d > 0 ? '+' : '') + d + '</td></tr>';
    }
    $('ovVerschillen').innerHTML = h + '</table>';
    koppelOverzichtRijen($('ovVerschillen'));
  }

  // bestellen, gegroepeerd per crediteur
  if (!bestellen.length) {
    $('ovBestellen').innerHTML = '<div class="leeg-melding">Niets te bestellen</div>';
  } else {
    const groepen = {};
    for (const it of bestellen) {
      const c = credVan(it) || 'Onbekende crediteur';
      (groepen[c] = groepen[c] || []).push(it);
    }
    let h = '';
    for (const cred of Object.keys(groepen).sort()) {
      const regels = groepen[cred];
      const nogTeDoen = regels.filter(it => !it.bsd);
      h += '<div class="cred-blok"><div class="cred-kop"><span class="naam">' + esc(cred) + '</span>' +
        (nogTeDoen.length ? '' : '<span class="badge groen">✓ Alles besteld</span>') + '</div>';
      h += '<div class="tabel-wrap"><table class="bestel-tabel"><tr><th>Artikel</th><th>Hun nummer</th><th>Locatie</th><th class="num">Aantal</th><th>Besteld</th></tr>';
      for (const it of regels) {
        const hun = it.h || it.f || '';
        h += '<tr data-key="' + esc(it.b) + '"' + (it.bsd ? ' class="rij-besteld"' : '') + '><td><b class="art-kopie" data-kopieer="' + esc(it.a || it.b) + '">' + esc(it.a || it.b) + '</b><br><span style="color:var(--muted)">' + esc(it.o) + '</span></td>' +
          (hun ? '<td class="hun-kopie" data-kopieer="' + esc(hun) + '">' + esc(hun) + '</td>' : '<td>–</td>') + '<td>' + esc(it.l || '–') + '</td>' +
          '<td class="num"><input type="text" class="ov-aantal" data-key="' + esc(it.b) + '" inputmode="numeric" maxlength="4" value="' + it.best + '"></td>' +
          '<td class="besteld-cel"><input type="checkbox" class="ov-besteld" data-key="' + esc(it.b) + '"' + (it.bsd ? ' checked' : '') + '>' +
          '<input type="text" class="ov-ink" data-key="' + esc(it.b) + '" inputmode="numeric" maxlength="8" value="' + esc(it.ink || '') + '"></td></tr>';
      }
      h += '</table></div></div>';
    }
    $('ovBestellen').innerHTML = h;
    koppelOverzichtRijen($('ovBestellen'));
    // tik op artikelnummer of Hun nummer kopieert die waarde, zonder de rij te openen
    $('ovBestellen').querySelectorAll('[data-kopieer]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(el.getAttribute('data-kopieer'))
          .then(() => toast('Gekopieerd: ' + el.getAttribute('data-kopieer')))
          .catch(() => toast('Kopiëren mislukt', true));
      };
    });
    // aantal, besteld-vinkje en inkoopnummer direct in de tabel bewerken
    const zetItem = (key, fn) => {
      const it = telling.items[key];
      if (!it) return;
      fn(it);
      it.ts = Date.now();
      bewaarTelling();
      planSync();
      renderAlles();
    };
    $('ovBestellen').querySelectorAll('.ov-aantal').forEach(inp => {
      inp.onclick = (e) => e.stopPropagation();
      inp.onblur = () => { if (renderUitgesteld) renderAlles(); };
      inp.onchange = () => {
        const n = parseInt(inp.value, 10);
        if (!isNaN(n) && n > 0) zetItem(inp.getAttribute('data-key'), it => { it.best = n; });
        else { toast('Aantal moet minimaal 1 zijn — pas het aan via het artikel zelf om te verwijderen', true); inp.blur(); renderAlles(); }
      };
    });
    $('ovBestellen').querySelectorAll('.ov-besteld').forEach(cb => {
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        const aan = cb.checked;
        zetItem(cb.getAttribute('data-key'), it => {
          if (aan) it.bsd = Date.now(); else delete it.bsd;
        });
        toast(aan ? '🛒 Gemarkeerd als besteld' : 'Bestelmarkering verwijderd');
      };
    });
    $('ovBestellen').querySelectorAll('.ov-ink').forEach(inp => {
      inp.onclick = (e) => e.stopPropagation();
      inp.onblur = () => { if (renderUitgesteld) renderAlles(); };
      inp.onchange = () => {
        const v = inp.value.trim();
        zetItem(inp.getAttribute('data-key'), it => {
          if (v) it.ink = v; else delete it.ink;
        });
      };
    });
  }

  // opmerkingen
  if (!opmerkingen.length) {
    $('ovOpmerkingen').innerHTML = '<div class="leeg-melding">Geen opmerkingen</div>';
  } else {
    let h = '<table><tr><th>Artikel</th><th>Locatie</th><th>Opmerking</th></tr>';
    for (const it of opmerkingen) {
      h += '<tr data-key="' + esc(it.b) + '"><td><b>' + esc(it.a || it.b) + '</b><br><span style="color:var(--muted)">' + esc(it.o) + '</span></td>' +
        '<td>' + esc(it.l || '–') + '</td><td>' + esc(it.opm) + '</td></tr>';
    }
    $('ovOpmerkingen').innerHTML = h + '</table>';
    koppelOverzichtRijen($('ovOpmerkingen'));
  }
}

function downloadCsv() {
  const items = Object.values(telling.items).filter(it => !it.del).sort((a, b) => (a.l || '').localeCompare(b.l || ''));
  if (!items.length) { toast('Nog niets geteld', true); return; }
  const kol = ['Barcode','Artikelnummer','Korte omschrijving','Fabrikantcode','Hun nummer','Locatie','Tech. Voorraad','Geteld','Crediteur','Bestellen','Besteld','Inkoopnummer','Opmerking'];
  const cel = (v) => {
    v = String(v == null ? '' : v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const regels = [kol.join(';')];
  for (const it of items) {
    regels.push([it.b, it.a, it.o, it.f, it.h, it.l, it.v,
      it.g != null ? it.g : '', credVan(it), it.best != null ? it.best : '',
      it.bsd ? 'ja' : '', it.ink || '', it.opm].map(cel).join(';'));
  }
  const blob = new Blob(['﻿' + regels.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = 'Scanlijst ' + d.toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- telling afronden ----------
async function rondAf() {
  const n = Object.values(telling.items).filter(it => !it.del).length;
  if (!n) { toast('De controle is al leeg', true); return; }
  if (!confirm('Controle afronden?\n\n' + n + ' regels worden gearchiveerd in de cloud en de lijst wordt leeggemaakt.')) return;
  if (!getToken() || !navigator.onLine) { toast('Afronden kan alleen online', true); return; }
  try {
    zetStatus('busy', 'Archiveren…');
    await syncTellingDirect();
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const archiefItems = {};
    for (const [k, v] of Object.entries(telling.items)) { if (!v.del) archiefItems[k] = v; }
    await ghPut('archief/telling-' + stamp + '.json', JSON.stringify({ afgerond: d.toISOString(), items: archiefItems }), null, 'Telling afgerond');
    const info = await ghDirInfo('telling.json');
    await ghPut('telling.json', JSON.stringify({ items: {} }), info ? info.sha : null, 'Telling geleegd na afronden');
    telling = { items: {} };
    bewaarTelling();
    renderAlles();
    zetStatus('ok', 'Gesynct');
    toast('Controle gearchiveerd en leeggemaakt');
  } catch (e) {
    zetStatus('err', 'Fout');
    toast('Afronden mislukt: ' + e.message, true);
  }
}

async function syncTellingDirect() {
  // synchroon wachten tot de lopende sync klaar is
  clearTimeout(syncTimer);
  while (syncBezig) await new Promise(r => setTimeout(r, 200));
  await syncTelling();
  while (syncBezig) await new Promise(r => setTimeout(r, 200));
}

// ---------- UI ----------
function toonView(naam) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + naam).classList.add('active');
  document.querySelectorAll('nav button[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === naam));
  if (naam === 'overzicht') renderOverzicht();
  if (naam === 'lijst') renderLijst();
}

// niet renderen terwijl er in een overzicht-veldje getypt wordt (sync zou de
// invoer wissen); de render wordt dan uitgesteld tot het veld wordt verlaten
let renderUitgesteld = false;
function renderAlles() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('.ov-aantal, .ov-ink')) { renderUitgesteld = true; return; }
  renderUitgesteld = false;
  renderLijst();
  if ($('view-overzicht').classList.contains('active')) renderOverzicht();
}

let toastTimer = null;
function toast(msg, fout) {
  const t = $('toast');
  t.textContent = msg;
  t.className = fout ? 'err show' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function toonSetupBanner() {
  $('setupBanner').hidden = !!getToken();
}

function stepper(inpId, delta) {
  const inp = $(inpId);
  const cur = parseInt(inp.value, 10);
  inp.value = Math.max(0, (isNaN(cur) ? 0 : cur) + delta);
}

// ---------- events ----------
function bindEvents() {
  document.querySelectorAll('nav button[data-view]').forEach(b =>
    b.addEventListener('click', () => toonView(b.dataset.view)));

  $('btnScan').addEventListener('click', startScanner);
  $('btnTrigger').addEventListener('click', scanNu);
  $('btnCamSluit').addEventListener('click', stopScanner);
  $('btnTorch').addEventListener('click', wisselTorch);
  $('btnKiesSluit').addEventListener('click', () => $('kiesOverlay').classList.remove('open'));

  $('btnZoek').addEventListener('click', handmatigZoeken);
  $('zoekInput').addEventListener('keydown', e => { if (e.key === 'Enter') handmatigZoeken(); });

  $('inpGeteld').addEventListener('focus', () => zetActiefVeld('inpGeteld'));
  $('inpBestellen').addEventListener('focus', () => zetActiefVeld('inpBestellen'));
  // pointerdown niet laten doorgaan: zo blijft de focus (en het toetsenbord) op het invoerveld
  document.querySelectorAll('.stap').forEach(btn => {
    btn.addEventListener('pointerdown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      stepper(btn.dataset.inp, parseInt(btn.dataset.d, 10));
      zetActiefVeld(btn.dataset.inp);
    });
  });

  $('btnOpslaan').addEventListener('click', () => slaOp(false));
  $('btnKlopt').addEventListener('click', () => slaOp(true));
  $('btnAnnuleer').addEventListener('click', sluitPaneel);
  $('btnTerugScan').addEventListener('click', () => { sluitPaneel(); startScanner(); });
  $('btnVerwijder').addEventListener('click', verwijderRegistratie);
  $('btnBesteld').addEventListener('click', wisselBesteld);
  $('btnVorig').addEventListener('click', () => blader(-1));
  $('btnVolgend').addEventListener('click', () => blader(1));

  $('btnSyncNu').addEventListener('click', () => { syncTelling(); });
  $('btnCsv').addEventListener('click', downloadCsv);
  $('btnAllesTonen').addEventListener('click', () => { ovFilter = null; renderOverzicht(); });
  $('btnAfronden').addEventListener('click', rondAf);
  $('btnArtVerversen').addEventListener('click', () => verversArtikelen(false));

  $('setupBanner').addEventListener('click', () => toonView('instellingen'));

  $('btnTokenOpslaan').addEventListener('click', async () => {
    const t = $('inpToken').value.trim();
    if (!t) { toast('Vul eerst een token in', true); return; }
    localStorage.setItem('mgz_token', t);
    toonSetupBanner();
    toast('Token opgeslagen — verbinding testen…');
    const ok = await verversArtikelen(true);
    if (ok) { toast('✓ Verbonden met de data-repo'); syncTelling(); }
    else toast('Verbinden mislukt — controleer het token', true);
  });

  $('swDoorscannen').addEventListener('change', () =>
    localStorage.setItem('mgz_doorscannen', $('swDoorscannen').checked ? '1' : '0'));

  $('slScanPos').addEventListener('input', () => {
    localStorage.setItem('mgz_scanpos', $('slScanPos').value);
    pasScanIndelingToe();
  });
  $('swKnopBoven').addEventListener('change', () => {
    localStorage.setItem('mgz_knopboven', $('swKnopBoven').checked ? '1' : '0');
    pasScanIndelingToe();
  });

  window.addEventListener('resize', zetAppHoogte);
  window.addEventListener('online', () => { if (syncNodig) syncTelling(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncNodig) syncTelling();
    if (document.visibilityState === 'hidden') stopScanner();
  });
}

// ---------- app-hoogte: exact de zichtbare vensterhoogte ----------
// 100dvh rekent op Android met de ingeklapte adresbalk en maakt de pagina
// dan scrollbaar; window.innerHeight volgt de echte viewport wel.
function zetAppHoogte() {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
}

// ---------- indeling scanscherm (per apparaat, niet gesynct) ----------
function pasScanIndelingToe() {
  const p = parseInt(localStorage.getItem('mgz_scanpos') || '100', 10);
  const idle = $('scanIdle');
  idle.style.setProperty('--ruimte-boven', p);
  idle.style.setProperty('--ruimte-onder', 100 - p);
  idle.classList.toggle('knop-boven', localStorage.getItem('mgz_knopboven') === '1');
}

// ---------- service worker & app-updates ----------
let updateWacht = false;

function pasUpdateToe() {
  // niet verversen midden in een open artikel of tijdens het scannen
  if (!$('artPanel').hidden || camActief) {
    updateWacht = true;
    toast('Nieuwe versie gedownload — wordt toegepast zodra je klaar bent');
    return;
  }
  location.reload();
}

function registreerSw() {
  if (!('serviceWorker' in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // allereerste installatie
    pasUpdateToe();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // bij het (her)openen van de app controleren of er een nieuwe versie online staat
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
  }).catch(() => { /* offline; volgende keer opnieuw proberen */ });
}

// ---------- start ----------
function init() {
  zetAppHoogte();
  laadLokaal();
  bindEvents();
  $('versieInfo').textContent = 'Magazijn Scanner v' + VERSIE + ' · data: ' + DATA_REPO;
  $('inpToken').value = getToken();
  $('swDoorscannen').checked = localStorage.getItem('mgz_doorscannen') !== '0';
  $('slScanPos').value = localStorage.getItem('mgz_scanpos') || '100';
  $('swKnopBoven').checked = localStorage.getItem('mgz_knopboven') === '1';
  pasScanIndelingToe();
  toonSetupBanner();
  updateArtInfo();
  renderLijst();

  // op een pc met groot scherm direct het overzicht tonen
  if (window.matchMedia('(pointer: fine)').matches && window.innerWidth > 900 && Object.values(telling.items).some(it => !it.del)) {
    toonView('overzicht');
  }

  if (getToken() && navigator.onLine) {
    verversArtikelen(true);
    syncTelling();
  } else if (!navigator.onLine) {
    zetStatus('err', 'Offline');
  } else {
    zetStatus('err', 'Geen token');
  }

  registreerSw();
}

init();
