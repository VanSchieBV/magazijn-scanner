/* Magazijn Scanner — app-logica
 * Data: privé-repo VanSchieBV/magazijn-data (artikelen.json / telling.json / rondje.json)
 * Sync: GitHub Contents API met fine-grained PAT (alleen die repo, Contents r/w)
 */
'use strict';

const VERSIE = '1.11.1';
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

// juiste locatienotatie: kast.plank of kast.plank.breedte, eventueel met -diepte
// (bijv. 1.1, 53.4.11, 21.10.5-4, 54.3.5-b, 21.5.8-7a) — al het andere is een
// typfout in het bronsysteem; de app snapt die locaties wél, maar markeert ze met ⚠
const LOC_NOTATIE = /^\d+\.\d+(\.\d+)?(-[0-9a-z]+)?$/i;
// bewust gekozen vrije locaties (ZOLDER, WPK, Oliehok, …) staan op een
// uitzonderingenlijst (Instellingen → Artikellijst) en tellen als juiste notatie
function locUitzondering(l) {
  const s = String(l).trim().toLowerCase();
  return ((rondje.locUitz && rondje.locUitz.lijst) || []).some(u => u.trim().toLowerCase() === s);
}
function locNotatieOk(l) { return LOC_NOTATIE.test(String(l).trim()) || locUitzondering(l); }
function locHtml(l) {
  if (!l) return '–';
  return esc(l) + (locNotatieOk(l) ? ''
    : ' <span class="loc-fout" title="Afwijkende notatie — hoort kast.plank.breedte(-diepte) te zijn">⚠</span>');
}

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
  const fout = artikelen.filter(a => a.l && !locNotatieOk(a.l));
  $('artInfo').innerHTML = artikelen.length
    ? esc(artikelen.length + ' artikelen · export van ' + artMeta.bijgewerkt) +
      (fout.length ? '<br><span class="loc-fout">⚠ ' + fout.length + ' met afwijkende locatienotatie</span>' : '')
    : 'Nog geen artikellijst geladen.';
  $('btnLocFouten').hidden = !fout.length;
}

// lijst van artikelen waarvan de locatie niet als kast.plank.breedte(-diepte)
// genoteerd staat — om de typfouten in het bronsysteem stap voor stap op te lossen
function downloadLocFouten() {
  const fout = artikelen.filter(a => a.l && !locNotatieOk(a.l))
    .sort((a, b) => String(a.l).localeCompare(String(b.l), undefined, { numeric: true }));
  if (!fout.length) { toast('Alle locaties staan goed genoteerd 🎉'); return; }
  const cel = (v) => {
    v = String(v == null ? '' : v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const regels = ['Locatie;Artikelnummer;Korte omschrijving;Barcode'];
  for (const a of fout) regels.push([a.l, a.a, a.o, a.b].map(cel).join(';'));
  const blob = new Blob(['﻿' + regels.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = 'Afwijkende locaties ' + new Date().toISOString().slice(0, 10) + '.csv';
  el.click();
  URL.revokeObjectURL(el.href);
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
function dichtstBijMidden(codes, beeld) {
  const cx = beeld.width / 2, cy = beeld.height / 2;
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

// welk deel van het camerabeeld (in videopixels) valt binnen het scanvlak op het scherm?
// de video staat op object-fit: cover, dus het beeld is geschaald en aan de randen afgesneden
function scanVakInVideo(video) {
  const vr = video.getBoundingClientRect();
  const fr = document.querySelector('.cam-frame').getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !vr.width || !vr.height) return null;
  const schaal = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vw * schaal - vr.width) / 2;
  const offY = (vh * schaal - vr.height) / 2;
  const x1 = Math.max(0, (fr.left - vr.left + offX) / schaal);
  const y1 = Math.max(0, (fr.top - vr.top + offY) / schaal);
  const x2 = Math.min(vw, (fr.right - vr.left + offX) / schaal);
  const y2 = Math.min(vh, (fr.bottom - vr.top + offY) / schaal);
  if (x2 - x1 < 10 || y2 - y1 < 10) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// knip het scanvlak uit het huidige camerabeeld; de decoder ziet alleen dit stukje
let scanCanvas = null;
function pakScanBeeld(video) {
  const vak = scanVakInVideo(video);
  if (!vak) return null;
  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  scanCanvas.width = Math.round(vak.w);
  scanCanvas.height = Math.round(vak.h);
  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, vak.x, vak.y, vak.w, vak.h, 0, 0, scanCanvas.width, scanCanvas.height);
  return scanCanvas;
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
          const beeld = pakScanBeeld(video);
          if (!beeld) return;
          const codes = await detector.detect(beeld);
          if (codes.length && scanActief()) verwerkScan(dichtstBijMidden(codes, beeld).rawValue);
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
      detectorLus = setInterval(() => {
        if (!scanActief() || video.readyState < 2) return;
        try {
          const beeld = pakScanBeeld(video);
          if (!beeld) return;
          const bron = new ZXing.HTMLCanvasElementLuminanceSource(beeld);
          const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(bron));
          const res = zxingReader.decodeBitmap(bitmap);
          if (res && scanActief()) verwerkScan(res.getText());
        } catch (e) { /* niets gevonden in dit frame */ }
      }, 200);
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
      '<div class="t2">' + esc(art.a) + ' · locatie ' + locHtml(art.l || '?') + '</div></div>' +
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
    veld('Locatie', esc(art.l || '–') +
      (art.l && !locNotatieOk(art.l) ? ' <span class="badge geel" title="Hoort kast.plank.breedte(-diepte) te zijn">⚠ notatie</span>' : ''), 'big') +
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
  // het veldje in de kolom Besteld automatisch vullen met het bestelde aantal
  if (!entry.ink && entry.best > 0) entry.ink = String(entry.best);
  telling.items[huidigeKey] = entry;
  bewaarTelling();
  planSync();
  renderAlles();
  const rondjeNieuw = rondjeRegistreerScan(entry);
  toast('🛒 ' + (huidigArt.a || huidigArt.b) + ' besteld' +
    (rondjeNieuw.length ? ' · 📍 ' + rondjeNieuw.join(', ') + ' ✓' : ''));
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
  // besteld-markering, besteld-aantal en klaar-vinkje behouden bij opnieuw opslaan
  if (oud && oud.bsd) entry.bsd = oud.bsd;
  if (oud && oud.ink) entry.ink = oud.ink;
  if (oud && oud.kl) entry.kl = oud.kl;
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
  const rondjeNieuw = rondjeRegistreerScan(entry);
  const extra = rondjeNieuw.length ? ' · 📍 ' + rondjeNieuw.join(', ') + ' ✓' : '';
  toast(kloptDirect ? ('✓ ' + naam + ' klopt (' + entry.g + ')' + extra) : ('✓ ' + naam + ' opgeslagen' + extra));
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
      '<div class="t2">' + esc(art.a) + ' · ' + (art.l ? locHtml(art.l) : 'geen locatie') + '</div></div>' +
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
    '<div class="t2">' + esc(it.a || it.b) + ' · ' + locHtml(it.l) +
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
        '<td>' + locHtml(it.l) + '</td><td class="num">' + (it.onb ? '–' : sys) + '</td>' +
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
        '<td>' + locHtml(it.l) + '</td><td class="num">' + sys + '</td><td class="num">' + it.g + '</td>' +
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
          (hun ? '<td class="hun-kopie" data-kopieer="' + esc(hun) + '">' + esc(hun) + '</td>' : '<td>–</td>') + '<td>' + locHtml(it.l) + '</td>' +
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
          if (aan) {
            it.bsd = Date.now();
            // het veldje ernaast automatisch vullen met het bestelde aantal
            if (!it.ink && it.best > 0) it.ink = String(it.best);
          } else delete it.bsd;
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
        '<td>' + locHtml(it.l) + '</td><td>' + esc(it.opm) + '</td></tr>';
    }
    $('ovOpmerkingen').innerHTML = h + '</table>';
    koppelOverzichtRijen($('ovOpmerkingen'));
  }
}

function downloadCsv() {
  const items = Object.values(telling.items).filter(it => !it.del).sort((a, b) => (a.l || '').localeCompare(b.l || ''));
  if (!items.length) { toast('Nog niets geteld', true); return; }
  const kol = ['Barcode','Artikelnummer','Korte omschrijving','Fabrikantcode','Hun nummer','Locatie','Locatienotatie','Tech. Voorraad','Geteld','Crediteur','Bestellen','Besteld','Inkoopnummer','Opmerking'];
  const cel = (v) => {
    v = String(v == null ? '' : v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const regels = [kol.join(';')];
  for (const it of items) {
    regels.push([it.b, it.a, it.o, it.f, it.h, it.l,
      it.l && !locNotatieOk(it.l) ? 'afwijkend' : '', it.v,
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

// ---------- wekelijks rondje ----------
// route:   {id: {loc,label,ts,del?}} — de vaste controleroute (gesynct via rondje.json),
//          altijd gesorteerd op locatie (natuurlijk oplopend)
// actief:  null | {gestart, checks:{id:{ts,w,n,opm}}, scans:{barcode:{…}}}
//          w: 'scan' (automatisch via een scan), 'hand' (handmatig afgevinkt),
//             'skip' (deze ronde overgeslagen), 'reset' (tombstone: vinkje weggehaald)
// historie: compacte samenvattingen per rondje; het volledige rapport (incl. alle
//           scans) staat in archief/rondje-<id>.json en wordt op verzoek opgehaald
let rondje = { route: {}, actief: null, historie: [], archiefWacht: [] };
let rondjeSyncTimer = null;
let rondjeSyncBezig = false;
let rondjeSyncNodig = false;
let routeSheetId = null;
let checkSheetId = null;
let histCsvData = null;

const fmtDatum = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTijd = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });

function laadRondjeLokaal() {
  try {
    const r = localStorage.getItem('mgz_rondje');
    if (r) rondje = JSON.parse(r);
  } catch (e) { /* corrupte cache negeren */ }
  if (!rondje.route) rondje.route = {};
  if (!rondje.historie) rondje.historie = [];
  if (!rondje.archiefWacht) rondje.archiefWacht = [];
  if (rondje.actief === undefined) rondje.actief = null;
  // ts 0: de standaardlijst verliest altijd van een bewust opgeslagen lijst
  if (!rondje.locUitz) rondje.locUitz = { ts: 0, lijst: ['ZOLDER', 'WPK', 'Oliehok'] };
  // gebiedslabels (Boven, Zolder, …) die aan route-locaties gehangen kunnen worden
  if (!rondje.gebieden) rondje.gebieden = { ts: 0, lijst: [] };
}
function bewaarRondje() { localStorage.setItem('mgz_rondje', JSON.stringify(rondje)); }

// locaties: kast.plank.breedte[-diepte] — een route-item dekt alles wat eronder valt
function locSegmenten(l) {
  return String(l || '').trim().split(/[.\-]/).map(s => s.trim()).filter(s => s !== '');
}
function segGelijk(a, b) {
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return parseInt(a, 10) === parseInt(b, 10);
  return a.toUpperCase() === b.toUpperCase();
}
function locValtBinnen(routeLoc, artLoc) {
  const r = locSegmenten(routeLoc), a = locSegmenten(artLoc);
  if (!r.length || a.length < r.length) return false;
  return r.every((s, i) => segGelijk(s, a[i]));
}

function routeItems() {
  // natuurlijk oplopend op locatie: 2.4 vóór 11, 21.2 vóór 21.10, letters alfabetisch
  return Object.entries(rondje.route).filter(x => !x[1].del)
    .sort((a, b) => String(a[1].loc).localeCompare(String(b[1].loc), undefined, { numeric: true, sensitivity: 'base' }));
}
// een check met w:'reset' is een tombstone (vinkje weggehaald) en telt als "geen check"
function checkVan(act, id) {
  const c = act && act.checks ? act.checks[id] : null;
  return c && c.w !== 'reset' ? c : null;
}
function isoWeekKey(ts) {
  const d = new Date(ts);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3);
  const w1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + '-W' + week;
}
// het rondje "staat open" vanaf de vaste dag zolang het deze week nog niet gelopen is
function rondjeDue() {
  const dag = localStorage.getItem('mgz_rondjedag');
  if (dag === null || dag === '') return false;
  if (rondje.actief || !routeItems().length) return false;
  const nu = Date.now();
  const laatste = rondje.historie.length ? rondje.historie[rondje.historie.length - 1].afgerond : 0;
  if (laatste && isoWeekKey(laatste) === isoWeekKey(nu)) return false;
  return (new Date().getDay() + 6) % 7 >= parseInt(dag, 10);
}

// ---------- rondje sync ----------
function planRondjeSync() {
  rondjeSyncNodig = true;
  clearTimeout(rondjeSyncTimer);
  rondjeSyncTimer = setTimeout(syncRondje, 1500);
}

function mergeRondje(remote) {
  if (!remote) return;
  const route = Object.assign({}, remote.route || {});
  for (const [k, v] of Object.entries(rondje.route)) {
    if (!route[k] || (v.ts || 0) > (route[k].ts || 0)) route[k] = v;
  }
  const histMap = new Map();
  for (const h of (remote.historie || [])) histMap.set(h.id, h);
  for (const h of rondje.historie) if (!histMap.has(h.id)) histMap.set(h.id, h);
  const historie = Array.from(histMap.values()).sort((a, b) => (a.afgerond || 0) - (b.afgerond || 0));
  const awMap = new Map();
  for (const a of (remote.archiefWacht || [])) awMap.set(a.id, a);
  for (const a of rondje.archiefWacht) awMap.set(a.id, a);
  // een actief rondje van vóór het laatst afgeronde rondje is verouderd (ander
  // apparaat heeft al afgerond) en vervalt
  const laatste = historie.length ? (historie[historie.length - 1].afgerond || 0) : 0;
  const geldig = a => (a && (a.gestart || 0) > laatste) ? a : null;
  const A = geldig(rondje.actief), B = geldig(remote.actief);
  let actief = A || B;
  if (A && B) {
    const checks = Object.assign({}, B.checks || {});
    for (const [k, v] of Object.entries(A.checks || {})) {
      if (!checks[k] || (v.ts || 0) > (checks[k].ts || 0)) checks[k] = v;
    }
    const scans = Object.assign({}, B.scans || {});
    for (const [k, v] of Object.entries(A.scans || {})) {
      if (!scans[k] || (v.ts || 0) > (scans[k].ts || 0)) scans[k] = v;
    }
    actief = { gestart: Math.min(A.gestart, B.gestart), checks, scans };
  }
  // uitzonderingen- en gebiedenlijst: de laatst opgeslagen versie wint in zijn geheel
  const locUitz = (!remote.locUitz || (rondje.locUitz && (rondje.locUitz.ts || 0) >= (remote.locUitz.ts || 0)))
    ? rondje.locUitz : remote.locUitz;
  const gebieden = (!remote.gebieden || (rondje.gebieden && (rondje.gebieden.ts || 0) >= (remote.gebieden.ts || 0)))
    ? rondje.gebieden : remote.gebieden;
  rondje = { route, actief, historie, archiefWacht: Array.from(awMap.values()), locUitz, gebieden };
}

async function syncRondje() {
  if (!getToken() || !navigator.onLine) return;
  if (rondjeSyncBezig) { planRondjeSync(); return; }
  rondjeSyncBezig = true;
  rondjeSyncNodig = false;
  try {
    let sha = null;
    const raw = await ghGetRaw('rondje.json');
    let remote = null;
    if (raw !== null) {
      const info = await ghDirInfo('rondje.json');
      sha = info ? info.sha : null;
      try { remote = JSON.parse(raw); } catch (e) { remote = null; }
    }
    mergeRondje(remote);
    // afgeronde rondjes die nog niet in het archief staan alsnog wegschrijven
    for (const rap of rondje.archiefWacht.slice()) {
      try {
        await ghPut('archief/rondje-' + rap.id + '.json', JSON.stringify(rap), null, 'Rondje afgerond');
        rondje.archiefWacht = rondje.archiefWacht.filter(x => x.id !== rap.id);
      } catch (e) {
        if (e.status === 422) rondje.archiefWacht = rondje.archiefWacht.filter(x => x.id !== rap.id); // stond er al
        else throw e;
      }
    }
    const nieuw = JSON.stringify({
      route: rondje.route, actief: rondje.actief,
      historie: rondje.historie, archiefWacht: rondje.archiefWacht,
      locUitz: rondje.locUitz, gebieden: rondje.gebieden
    });
    if (raw === null || nieuw !== raw) {
      await ghPut('rondje.json', nieuw, sha, 'Rondje bijgewerkt via app');
    }
    bewaarRondje();
  } catch (e) {
    if (e.status === 409 || e.status === 422) planRondjeSync();
    else rondjeSyncNodig = true;
  } finally {
    rondjeSyncBezig = false;
    updateRondjeUI();
    if (rondjeSyncNodig && navigator.onLine) {
      clearTimeout(rondjeSyncTimer);
      rondjeSyncTimer = setTimeout(syncRondje, 8000);
    }
  }
}

// ---------- rondje kernacties ----------
// aangeroepen bij elke opgeslagen registratie (opslaan / klopt / besteld):
// logt de scan bij het lopende rondje en vinkt passende route-locaties af.
// geeft de namen van nieuw afgevinkte locaties terug (voor in de toast).
function rondjeRegistreerScan(entry) {
  const act = rondje.actief;
  if (!act) return [];
  act.scans[entry.b] = {
    ts: entry.ts, b: entry.b, a: entry.a || '', o: entry.o || '', l: entry.l || '',
    g: entry.g != null ? entry.g : null, best: entry.best != null ? entry.best : null,
    opm: entry.opm || '', bsd: entry.bsd ? 1 : 0
  };
  const nieuw = [];
  if (entry.l) {
    for (const [id, item] of routeItems()) {
      if (!locValtBinnen(item.loc, entry.l)) continue;
      const c = checkVan(act, id);
      if (!c) {
        act.checks[id] = { ts: Date.now(), w: 'scan', n: 1, opm: (act.checks[id] && act.checks[id].opm) || '' };
        nieuw.push(item.label || item.loc);
      } else {
        c.n = (c.n || 0) + 1;
        c.ts = Date.now();
        if (c.w === 'skip') { c.w = 'scan'; nieuw.push(item.label || item.loc); }
      }
    }
  }
  bewaarRondje();
  planRondjeSync();
  updateRondjeUI();
  // even wachten met auto-afronden zodat de opslaan-toast niet ondersneeuwt
  setTimeout(controleerAutoAfronden, 700);
  return nieuw;
}

function controleerAutoAfronden() {
  const act = rondje.actief;
  if (!act) return;
  const items = routeItems();
  if (!items.length) return;
  const klaar = items.every(([id]) => {
    const c = checkVan(act, id);
    return c && c.w !== 'skip';
  });
  if (klaar) rondjeAfronden(true);
}

function rondjeStart() {
  if (rondje.actief) return;
  if (!routeItems().length) { toast('Voeg eerst locaties toe aan de route', true); return; }
  rondje.actief = { gestart: Date.now(), checks: {}, scans: {} };
  bewaarRondje();
  planRondjeSync();
  renderRondje();
  updateRondjeUI();
  toast('▶ Rondje gestart — scan zoals altijd, locaties vinken vanzelf af');
}

function rondjeAnnuleer() {
  if (!rondje.actief) return;
  if (!confirm('Rondje annuleren?\n\nDe voortgang van dit rondje wordt gewist (er wordt niets vastgelegd).')) return;
  rondje.actief = null;
  bewaarRondje();
  planRondjeSync();
  renderRondje();
  updateRondjeUI();
  toast('Rondje geannuleerd');
}

function rondjeAfronden(auto) {
  const act = rondje.actief;
  if (!act) return;
  const items = routeItems().map(([id, item]) => {
    const c = checkVan(act, id);
    return {
      loc: item.loc, label: item.label || '', gebied: item.gebied || '',
      status: c ? c.w : 'open',
      ts: c ? c.ts : null, opm: c && c.opm ? c.opm : '', n: c ? (c.n || 0) : 0
    };
  });
  if (!auto) {
    const open = items.filter(i => i.status === 'open').length;
    let msg = 'Rondje afronden?';
    if (open) msg += '\n\n' + open + ' locatie(s) zijn niet gecontroleerd — die worden als "niet gedaan" vastgelegd.';
    if (!confirm(msg)) return;
  }
  const d = new Date();
  const id = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0');
  const scans = Object.values(act.scans).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  rondje.historie.push({ id, gestart: act.gestart, afgerond: Date.now(), items, scans: scans.length });
  // het volledige rapport gaat naar archief/rondje-<id>.json zodra er verbinding is
  rondje.archiefWacht.push({ id, gestart: act.gestart, afgerond: Date.now(), items, scans });
  rondje.actief = null;
  bewaarRondje();
  planRondjeSync();
  renderRondje();
  updateRondjeUI();
  toast(auto ? '🎉 Alle locaties gecontroleerd — rondje afgerond' : '✓ Rondje afgerond');
}

// ---------- rondje weergave ----------
function statusBadge(status, n) {
  if (status === 'scan') return '<span class="badge groen">✓ ' + (n ? n + ' scan' + (n > 1 ? 's' : '') : 'gescand') + '</span>';
  if (status === 'hand') return '<span class="badge groen">✓ afgevinkt</span>';
  if (status === 'skip') return '<span class="badge geel">⏭ overgeslagen</span>';
  return '<span class="badge rood">niet gedaan</span>';
}
function statusTekstCheck(c) {
  if (!c) return 'Nog niet gecontroleerd deze ronde';
  if (c.w === 'skip') return 'Overgeslagen · ' + fmtTijd.format(c.ts);
  if (c.w === 'scan') return 'Afgevinkt via ' + (c.n || 1) + ' scan' + ((c.n || 1) > 1 ? 's' : '') + ' · ' + fmtTijd.format(c.ts);
  return 'Handmatig afgevinkt · ' + fmtTijd.format(c.ts);
}
// laatste geslaagde controle van een locatie, uit de historie
function laatsteControle(loc) {
  for (let i = rondje.historie.length - 1; i >= 0; i--) {
    const it = (rondje.historie[i].items || []).find(x => x.loc === loc);
    if (it && (it.status === 'scan' || it.status === 'hand')) return rondje.historie[i].afgerond;
  }
  return null;
}

function renderRondje() {
  const items = routeItems();
  const act = rondje.actief;

  // statuskaart
  let h;
  if (act) {
    const gedaan = items.filter(([id]) => { const c = checkVan(act, id); return c && c.w !== 'skip'; }).length;
    const skip = items.filter(([id]) => { const c = checkVan(act, id); return c && c.w === 'skip'; }).length;
    h = '<div class="card"><h2>Rondje bezig</h2>' +
      '<div style="color:var(--muted);font-size:.83rem;">Gestart ' + fmtTijd.format(act.gestart) +
      ' · scan zoals altijd, locaties vinken vanzelf af. Tik een locatie om handmatig af te vinken of over te slaan.</div>' +
      '<div class="rondje-balk"><div style="width:' + (items.length ? Math.round(gedaan / items.length * 100) : 0) + '%"></div></div>' +
      '<div style="font-size:.85rem;color:var(--muted);margin-top:6px;">' + gedaan + ' van ' + items.length + ' gecontroleerd' +
      (skip ? ' · ' + skip + ' overgeslagen' : '') + '</div>' +
      '<div class="btn-row"><button class="btn geel" id="btnRondjeAfronden">Rondje afronden</button>' +
      '<button class="btn stil klein rood" id="btnRondjeAnnuleer">✕</button></div></div>';
  } else {
    const laatste = rondje.historie.length ? rondje.historie[rondje.historie.length - 1] : null;
    let sub;
    if (laatste) {
      const gedaan = laatste.items.filter(i => i.status === 'scan' || i.status === 'hand').length;
      sub = 'Laatste rondje: ' + fmtDatum.format(laatste.afgerond) + ' · ' + gedaan + ' van ' + laatste.items.length + ' gedaan';
    } else sub = 'Nog geen rondje gelopen';
    if (rondjeDue()) sub += ' — deze week staat het rondje nog open';
    h = '<div class="card"><h2>Wekelijks rondje</h2>' +
      '<div style="color:var(--muted);font-size:.83rem;margin-bottom:12px;">' + esc(sub) + '</div>' +
      (items.length
        ? '<div class="btn-row" style="margin-top:0;"><button class="btn primair" id="btnRondjeStart">▶ Rondje starten</button></div>'
        : '<div style="color:var(--muted);font-size:.83rem;">Voeg hieronder de locaties toe die je elke week naloopt — een kastnummer (bijv. 11) of een Kardex-la (bijv. 21.10).</div>') +
      '</div>';
  }
  $('rondjeStatus').innerHTML = h;
  const bs = $('btnRondjeStart'); if (bs) bs.onclick = rondjeStart;
  const ba = $('btnRondjeAfronden'); if (ba) ba.onclick = () => rondjeAfronden(false);
  const bx = $('btnRondjeAnnuleer'); if (bx) bx.onclick = rondjeAnnuleer;

  // routelijst
  const div = $('rondjeLijst');
  div.innerHTML = '';
  for (const [id, item] of items) {
    const c = act ? checkVan(act, id) : null;
    const el = document.createElement('div');
    el.className = 'item' + (c && c.w === 'skip' ? ' r-skip' : '');
    let t2;
    if (act) {
      t2 = statusTekstCheck(c) + (c && c.opm ? ' · 💬 ' + c.opm : '');
    } else {
      const lc = laatsteControle(item.loc);
      t2 = lc ? 'Laatst gecontroleerd: ' + fmtDatum.format(lc) : 'Nog niet eerder gecontroleerd';
    }
    el.innerHTML = (act
      ? '<div class="status-ico' + (c && c.w !== 'skip' ? ' groen' : '') + '">' + (c ? (c.w === 'skip' ? '⏭' : '✓') : '○') + '</div>'
      : '') +
      '<div class="mid"><div class="t1">' + esc(item.loc) + (item.label ? ' — ' + esc(item.label) : '') +
      (item.gebied ? '<span class="gebied-chip">' + esc(item.gebied) + '</span>' : '') + '</div>' +
      '<div class="t2">' + esc(t2) + '</div></div>' +
      '<div class="right">' + (act && c ? statusBadge(c.w, c.n) : '') + '</div>';
    el.onclick = () => { if (rondje.actief) openCheckSheet(id); else openRouteSheet(id); };
    div.appendChild(el);
  }
  if (!items.length) div.innerHTML = '<div class="leeg-melding">Nog geen locaties in de route.</div>';

  // historie
  const hist = rondje.historie.slice().reverse();
  $('rondjeHistKaart').hidden = !hist.length;
  const hDiv = $('rondjeHistorie');
  hDiv.innerHTML = '';
  for (const hs of hist) {
    const gedaan = hs.items.filter(i => i.status === 'scan' || i.status === 'hand').length;
    const skip = hs.items.filter(i => i.status === 'skip').length;
    const open = hs.items.filter(i => i.status === 'open').length;
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<div class="mid"><div class="t1">' + esc(fmtDatum.format(hs.afgerond)) + '</div>' +
      '<div class="t2">' + gedaan + ' van ' + hs.items.length + ' gecontroleerd' +
      (hs.scans ? ' · ' + hs.scans + ' scans' : '') + '</div></div>' +
      '<div class="right">' +
      (open ? '<span class="badge rood">' + open + ' niet gedaan</span> ' : '') +
      (skip ? '<span class="badge geel">' + skip + ' overgeslagen</span>' : (open ? '' : '<span class="badge groen">✓ compleet</span>')) +
      '</div>';
    el.onclick = () => openHistSheet(hs);
    hDiv.appendChild(el);
  }
}

function updateRondjeUI() {
  // navigatie-badge: openstaande locaties tijdens een rondje, of ! als het rondje deze week nog moet
  const b = $('rondjeBadge');
  if (rondje.actief) {
    const open = routeItems().filter(([id]) => !checkVan(rondje.actief, id)).length;
    b.hidden = !open;
    b.textContent = open;
  } else if (rondjeDue()) {
    b.hidden = false;
    b.textContent = '!';
  } else b.hidden = true;

  // hint op het scanscherm
  const hint = $('rondjeHint');
  if (rondje.actief) {
    const items = routeItems();
    const gedaan = items.filter(([id]) => { const c = checkVan(rondje.actief, id); return c && c.w !== 'skip'; }).length;
    hint.textContent = '📍 Rondje bezig · ' + gedaan + ' van ' + items.length + ' — tik voor de lijst';
    hint.hidden = false;
  } else if (rondjeDue()) {
    hint.textContent = '📍 Het wekelijkse rondje is deze week nog niet gelopen — tik om te starten';
    hint.hidden = false;
  } else hint.hidden = true;

  // uitzonderingenlijst kan via sync gewijzigd zijn: veld en ⚠-teller verversen
  const uitz = $('inpLocUitz');
  if (uitz && document.activeElement !== uitz) {
    uitz.value = ((rondje.locUitz && rondje.locUitz.lijst) || []).join('\n');
  }
  updateArtInfo();

  if ($('view-rondje').classList.contains('active')) renderRondje();
}

// ---------- rondje sheets ----------
let routeSheetGebied = null;

function renderRouteTags() {
  const div = $('routeTags');
  div.innerHTML = '';
  if (!rondje.gebieden.lijst.length) {
    div.innerHTML = '<div style="color:var(--muted);font-size:.78rem;">Nog geen gebieden — maak er hieronder een aan.</div>';
    return;
  }
  for (const g of rondje.gebieden.lijst) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip' + (routeSheetGebied === g ? ' sel' : '');
    chip.innerHTML = esc(g) + '<span class="tag-del" aria-label="Gebied verwijderen">✕</span>';
    chip.onclick = (e) => {
      if (e.target.classList.contains('tag-del')) { verwijderGebied(g); return; }
      routeSheetGebied = routeSheetGebied === g ? null : g;
      renderRouteTags();
    };
    div.appendChild(chip);
  }
}

function voegGebiedToe() {
  const naam = $('inpNieuwGebied').value.trim();
  if (!naam) return;
  const bestaand = rondje.gebieden.lijst.find(g => g.toLowerCase() === naam.toLowerCase());
  if (!bestaand) {
    rondje.gebieden = { ts: Date.now(), lijst: rondje.gebieden.lijst.concat(naam) };
    bewaarRondje();
    planRondjeSync();
  }
  routeSheetGebied = bestaand || naam;
  $('inpNieuwGebied').value = '';
  renderRouteTags();
}

function verwijderGebied(g) {
  if (!confirm('Gebied "' + g + '" verwijderen?\n\nHet wordt ook weggehaald bij locaties met dit gebied.')) return;
  rondje.gebieden = { ts: Date.now(), lijst: rondje.gebieden.lijst.filter(x => x !== g) };
  for (const item of Object.values(rondje.route)) {
    if (!item.del && item.gebied === g) { delete item.gebied; item.ts = Date.now(); }
  }
  if (routeSheetGebied === g) routeSheetGebied = null;
  bewaarRondje();
  planRondjeSync();
  renderRouteTags();
  renderRondje();
}

function openRouteSheet(id) {
  routeSheetId = id || null;
  routeSheetGebied = id ? (rondje.route[id].gebied || null) : null;
  $('routeSheetTitel').textContent = id ? 'Locatie bewerken' : 'Locatie toevoegen';
  $('inpRouteLoc').value = id ? rondje.route[id].loc : '';
  $('inpRouteLabel').value = id ? (rondje.route[id].label || '') : '';
  $('inpNieuwGebied').value = '';
  renderRouteTags();
  $('routeDelRow').hidden = !id;
  let hh = '';
  if (id) {
    const loc = rondje.route[id].loc;
    const regels = [];
    for (let i = rondje.historie.length - 1; i >= 0 && regels.length < 6; i--) {
      const it = (rondje.historie[i].items || []).find(x => x.loc === loc);
      if (it) {
        regels.push('<div class="item" style="cursor:default;"><div class="mid"><div class="t1">' +
          esc(fmtDatum.format(rondje.historie[i].afgerond)) + '</div>' +
          (it.opm ? '<div class="t2">💬 ' + esc(it.opm) + '</div>' : '') +
          '</div><div class="right">' + statusBadge(it.status, it.n) + '</div></div>');
      }
    }
    if (regels.length) {
      hh = '<div style="font-size:.8rem;color:var(--muted);margin:8px 0 6px;">Eerdere controles</div>' + regels.join('');
    }
  }
  $('routeHistBlok').innerHTML = hh;
  $('routeOverlay').classList.add('open');
}

function bewaarRouteItem() {
  const loc = $('inpRouteLoc').value.trim().replace(/\s+/g, '');
  const label = $('inpRouteLabel').value.trim();
  if (!locSegmenten(loc).length) { toast('Vul een locatie in, bijv. 11 of 21.10', true); return; }
  if (routeSheetId) {
    const item = rondje.route[routeSheetId];
    item.loc = loc;
    item.label = label;
    if (routeSheetGebied) item.gebied = routeSheetGebied; else delete item.gebied;
    item.ts = Date.now();
  } else {
    const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    rondje.route[id] = { loc, label, ts: Date.now() };
    if (routeSheetGebied) rondje.route[id].gebied = routeSheetGebied;
  }
  bewaarRondje();
  planRondjeSync();
  $('routeOverlay').classList.remove('open');
  renderRondje();
  updateRondjeUI();
  toast('✓ ' + loc + (label ? ' — ' + label : '') + ' opgeslagen');
}

function verwijderRouteItem() {
  if (!routeSheetId) return;
  const item = rondje.route[routeSheetId];
  if (!confirm((item.label || item.loc) + ' uit de route verwijderen?')) return;
  // tombstone i.p.v. echt wissen, anders komt het item bij de volgende sync terug
  rondje.route[routeSheetId] = { loc: item.loc, ts: Date.now(), del: true };
  bewaarRondje();
  planRondjeSync();
  $('routeOverlay').classList.remove('open');
  renderRondje();
  updateRondjeUI();
  toast('🗑 ' + item.loc + ' uit de route verwijderd');
}

function openCheckSheet(id) {
  const item = rondje.route[id];
  const act = rondje.actief;
  if (!item || item.del || !act) return;
  checkSheetId = id;
  const c = checkVan(act, id);
  $('checkTitel').textContent = item.loc + (item.label ? ' — ' + item.label : '') +
    (item.gebied ? ' · ' + item.gebied : '');
  $('checkStatus').textContent = statusTekstCheck(c);
  $('inpCheckOpm').value = c && c.opm ? c.opm : '';
  $('btnCheckReset').hidden = !c;
  $('checkOverlay').classList.add('open');
}

function zetCheck(w) {
  const act = rondje.actief;
  if (!act || !checkSheetId) return;
  const item = rondje.route[checkSheetId];
  const c = checkVan(act, checkSheetId);
  act.checks[checkSheetId] = {
    ts: Date.now(),
    // een al-gescande locatie blijft "scan" (dat is het sterkere bewijs)
    w: (w === 'hand' && c && c.w === 'scan') ? 'scan' : w,
    n: c ? (c.n || 0) : 0,
    opm: $('inpCheckOpm').value.trim()
  };
  bewaarRondje();
  planRondjeSync();
  $('checkOverlay').classList.remove('open');
  renderRondje();
  updateRondjeUI();
  toast(w === 'skip' ? '⏭ ' + item.loc + ' deze ronde overgeslagen' : '✓ ' + item.loc + ' afgevinkt');
  if (w !== 'skip') controleerAutoAfronden();
}

function resetCheck() {
  const act = rondje.actief;
  if (!act || !checkSheetId) return;
  // tombstone i.p.v. echt wissen, anders komt het vinkje bij de volgende sync terug
  act.checks[checkSheetId] = { ts: Date.now(), w: 'reset' };
  bewaarRondje();
  planRondjeSync();
  $('checkOverlay').classList.remove('open');
  renderRondje();
  updateRondjeUI();
  toast('Vinkje weggehaald');
}

function sluitCheckSheet() {
  const act = rondje.actief;
  if (act && checkSheetId) {
    const c = checkVan(act, checkSheetId);
    const opm = $('inpCheckOpm').value.trim();
    if (c && (c.opm || '') !== opm) {
      c.opm = opm;
      c.ts = Date.now();
      bewaarRondje();
      planRondjeSync();
      renderRondje();
    }
  }
  $('checkOverlay').classList.remove('open');
}

// ---------- rondje historie-detail & rapport ----------
function openHistSheet(hs) {
  $('histTitel').textContent = 'Rondje ' + fmtDatum.format(hs.afgerond);
  const gedaan = hs.items.filter(i => i.status === 'scan' || i.status === 'hand').length;
  let h = '<div style="color:var(--muted);font-size:.83rem;margin-bottom:10px;">' +
    gedaan + ' van ' + hs.items.length + ' gecontroleerd · ' +
    esc(fmtTijd.format(hs.gestart)) + ' – ' + esc(fmtTijd.format(hs.afgerond)) + '</div>';
  for (const it of hs.items) {
    h += '<div class="item" style="cursor:default;"><div class="mid"><div class="t1">' +
      esc(it.loc) + (it.label ? ' — ' + esc(it.label) : '') +
      (it.gebied ? '<span class="gebied-chip">' + esc(it.gebied) + '</span>' : '') + '</div>' +
      (it.opm ? '<div class="t2">💬 ' + esc(it.opm) + '</div>' : '') +
      '</div><div class="right">' + statusBadge(it.status, it.n) + '</div></div>';
  }
  h += '<div id="histScans">' + (hs.scans ? '<div class="leeg-melding" style="padding:14px;">Scans laden…</div>' : '') + '</div>';
  $('histInhoud').innerHTML = h;
  histCsvData = null;
  $('btnHistCsv').hidden = true;
  $('histOverlay').classList.add('open');
  if (hs.scans) laadHistScans(hs);
  else {
    histCsvData = { id: hs.id, gestart: hs.gestart, afgerond: hs.afgerond, items: hs.items, scans: [] };
    $('btnHistCsv').hidden = false;
  }
}

async function laadHistScans(hs) {
  // het volledige rapport: eerst lokaal (nog niet gearchiveerd), anders uit het archief
  let vol = rondje.archiefWacht.find(x => x.id === hs.id) || null;
  if (!vol) {
    try {
      const raw = await ghGetRaw('archief/rondje-' + hs.id + '.json');
      if (raw) vol = JSON.parse(raw);
    } catch (e) { /* offline of niet gevonden */ }
  }
  const div = $('histScans');
  if (!div || !$('histOverlay').classList.contains('open')) return;
  if (!vol) {
    div.innerHTML = '<div class="leeg-melding" style="padding:14px;">Scans niet beschikbaar (offline?)</div>';
    return;
  }
  let h = '<div style="font-size:.8rem;color:var(--muted);margin:10px 0 6px;">Geregistreerd tijdens dit rondje · ' + vol.scans.length + '</div>';
  for (const s of vol.scans) {
    const badges = (s.g != null ? '<span class="badge groen">✓ ' + s.g + '</span> ' : '') +
      (s.best ? '<span class="badge geel">bestel ' + s.best + '</span>' : '');
    h += '<div class="item" style="cursor:default;"><div class="mid"><div class="t1">' + esc(s.o || s.b) + '</div>' +
      '<div class="t2">' + esc(s.a || s.b) + ' · ' + locHtml(s.l) +
      (s.opm ? ' · 💬 ' + esc(s.opm) : '') + '</div></div><div class="right">' + badges + '</div></div>';
  }
  div.innerHTML = h;
  histCsvData = vol;
  $('btnHistCsv').hidden = false;
}

function downloadRondjeCsv(vol) {
  const cel = (v) => {
    v = String(v == null ? '' : v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const st = { scan: 'gecontroleerd (scan)', hand: 'gecontroleerd (handmatig)', skip: 'overgeslagen', open: 'niet gedaan' };
  const regels = ['Locatie;Label;Gebied;Status;Tijd;Scans;Opmerking'];
  for (const it of vol.items) {
    regels.push([it.loc, it.label || '', it.gebied || '', st[it.status] || it.status,
      it.ts ? fmtTijd.format(it.ts) : '', it.n || '', it.opm || ''].map(cel).join(';'));
  }
  if ((vol.scans || []).length) {
    regels.push('');
    regels.push('Tijd;Barcode;Artikelnummer;Omschrijving;Locatie;Locatienotatie;Geteld;Bestellen;Besteld;Opmerking');
    for (const s of vol.scans) {
      regels.push([fmtTijd.format(s.ts), s.b, s.a, s.o, s.l,
        s.l && !locNotatieOk(s.l) ? 'afwijkend' : '',
        s.g != null ? s.g : '', s.best != null ? s.best : '', s.bsd ? 'ja' : '', s.opm || ''].map(cel).join(';'));
    }
  }
  const blob = new Blob(['﻿' + regels.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Rondje ' + new Date(vol.afgerond).toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- UI ----------
function toonView(naam) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + naam).classList.add('active');
  document.querySelectorAll('nav button[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === naam));
  if (naam === 'overzicht') renderOverzicht();
  if (naam === 'lijst') renderLijst();
  if (naam === 'rondje') renderRondje();
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

  $('btnSyncNu').addEventListener('click', () => { syncTelling(); syncRondje(); });
  $('btnCsv').addEventListener('click', downloadCsv);
  $('btnAllesTonen').addEventListener('click', () => { ovFilter = null; renderOverzicht(); });
  $('btnAfronden').addEventListener('click', rondAf);
  $('btnArtVerversen').addEventListener('click', () => verversArtikelen(false));
  $('btnLocFouten').addEventListener('click', downloadLocFouten);
  $('btnLocUitzOpslaan').addEventListener('click', () => {
    const lijst = Array.from(new Set($('inpLocUitz').value.split('\n').map(s => s.trim()).filter(Boolean)));
    rondje.locUitz = { ts: Date.now(), lijst };
    bewaarRondje();
    planRondjeSync();
    updateArtInfo();
    renderAlles();
    toast('✓ ' + lijst.length + ' uitzondering(en) opgeslagen');
  });

  $('setupBanner').addEventListener('click', () => toonView('instellingen'));

  // rondje
  $('rondjeHint').addEventListener('click', () => toonView('rondje'));
  $('btnRouteToevoegen').addEventListener('click', () => openRouteSheet(null));
  $('btnRouteOpslaan').addEventListener('click', bewaarRouteItem);
  $('btnRouteSluit').addEventListener('click', () => $('routeOverlay').classList.remove('open'));
  $('btnRouteDel').addEventListener('click', verwijderRouteItem);
  $('btnNieuwGebied').addEventListener('click', voegGebiedToe);
  $('inpNieuwGebied').addEventListener('keydown', e => { if (e.key === 'Enter') voegGebiedToe(); });
  $('btnCheckKlopt').addEventListener('click', () => zetCheck('hand'));
  $('btnCheckSkip').addEventListener('click', () => zetCheck('skip'));
  $('btnCheckReset').addEventListener('click', resetCheck);
  $('btnCheckSluit').addEventListener('click', sluitCheckSheet);
  $('btnHistSluit').addEventListener('click', () => $('histOverlay').classList.remove('open'));
  $('btnHistCsv').addEventListener('click', () => { if (histCsvData) downloadRondjeCsv(histCsvData); });
  $('selRondjeDag').addEventListener('change', () => {
    localStorage.setItem('mgz_rondjedag', $('selRondjeDag').value);
    updateRondjeUI();
  });

  $('btnTokenOpslaan').addEventListener('click', async () => {
    const t = $('inpToken').value.trim();
    if (!t) { toast('Vul eerst een token in', true); return; }
    localStorage.setItem('mgz_token', t);
    toonSetupBanner();
    toast('Token opgeslagen — verbinding testen…');
    const ok = await verversArtikelen(true);
    if (ok) { toast('✓ Verbonden met de data-repo'); syncTelling(); syncRondje(); }
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
  window.addEventListener('online', () => {
    if (syncNodig) syncTelling();
    if (rondjeSyncNodig) syncRondje();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncNodig) syncTelling();
    if (document.visibilityState === 'visible' && rondjeSyncNodig) syncRondje();
    if (document.visibilityState === 'hidden') stopScanner();
  });
}

// ---------- schermtoetsenbord: invoer niet laten bedekken ----------
// de viewport is bewust overlays-content (scanscherm verspringt dan niet), dus
// het toetsenbord valt óver de app heen. Hier meten we de toetsenbordhoogte en
// zetten die in --kb: sheets krijgen er marge onder, en een invoerveld in het
// gewone scherm wordt in beeld gescrold.
function initToetsenbord() {
  const zetKb = (hoogte) => {
    document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(hoogte)) + 'px');
    if (hoogte > 40) {
      const a = document.activeElement;
      if (a && a.matches && a.matches('input, textarea') && !a.closest('.overlay')) {
        setTimeout(() => { try { a.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }, 120);
      }
    }
  };
  if ('virtualKeyboard' in navigator) {
    try {
      navigator.virtualKeyboard.overlaysContent = true;
      navigator.virtualKeyboard.addEventListener('geometrychange', (e) => zetKb(e.target.boundingRect.height));
      return;
    } catch (e) { /* val terug op visualViewport */ }
  }
  // iOS en oudere browsers: daar verkleint het toetsenbord de visual viewport
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () =>
      zetKb(window.innerHeight - window.visualViewport.height));
  }
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
  initToetsenbord();
  laadLokaal();
  laadRondjeLokaal();
  bindEvents();
  $('versieInfo').textContent = 'Magazijn Scanner v' + VERSIE + ' · data: ' + DATA_REPO;
  $('inpToken').value = getToken();
  $('swDoorscannen').checked = localStorage.getItem('mgz_doorscannen') !== '0';
  $('slScanPos').value = localStorage.getItem('mgz_scanpos') || '100';
  $('swKnopBoven').checked = localStorage.getItem('mgz_knopboven') === '1';
  $('selRondjeDag').value = localStorage.getItem('mgz_rondjedag') || '';
  pasScanIndelingToe();
  toonSetupBanner();
  updateArtInfo();
  renderLijst();
  updateRondjeUI();

  // op een pc met groot scherm direct het overzicht tonen
  if (window.matchMedia('(pointer: fine)').matches && window.innerWidth > 900 && Object.values(telling.items).some(it => !it.del)) {
    toonView('overzicht');
  }

  if (getToken() && navigator.onLine) {
    verversArtikelen(true);
    syncTelling();
    syncRondje();
  } else if (!navigator.onLine) {
    zetStatus('err', 'Offline');
  } else {
    zetStatus('err', 'Geen token');
  }

  registreerSw();
}

init();
