"""Kleine Chrome DevTools-driver voor de tests.

Start Chrome headless (geen venster) met een eigen, tijdelijk profiel, dus nooit in de gewone
browsersessie. Elk 'apparaat' is een eigen browsercontext met een eigen localStorage; de
data-repo is de nep-GitHub uit mockgh.py. Het token in de tests is een nep-token ('test').
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request
import websocket   # pip install websocket-client

sys.stdout.reconfigure(encoding='utf-8')

KANDIDATEN = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]
CHROME = next((p for p in KANDIDATEN if os.path.exists(p)), KANDIDATEN[0])
APP = 'http://localhost:8765/'
MOCK = 'http://127.0.0.1:8767'

# draait in elke pagina vóór app.js: API-verkeer naar de nep-GitHub, fouten en toasts bijhouden,
# confirm() altijd 'ja' (een echt dialoogvenster zou headless Chrome blokkeren)
INJECT = r"""
(() => {
  const echt = window.fetch.bind(window);
  window.__api = [];
  window.fetch = (url, opt) => {
    if (typeof url === 'string' && url.startsWith('https://api.github.com/')) {
      url = '%MOCK%/' + url.slice('https://api.github.com/'.length);
      window.__api.push(((opt && opt.method) || 'GET') + ' ' + url.replace('%MOCK%/repos/VanSchieBV/magazijn-data/contents/', '').replace(/\?.*$/, ''));
    }
    return echt(url, opt);
  };
  window.__fouten = [];
  window.addEventListener('error', e => window.__fouten.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => window.__fouten.push('promise: ' + ((e.reason && e.reason.message) || e.reason)));
  window.confirm = () => true;
  window.alert = () => {};
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('toast');
    if (t) new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); })
      .observe(t, { childList: true, characterData: true, subtree: true });
  });
})();
""".replace('%MOCK%', MOCK)


def mock(pad, data=None):
    """beheer-endpoint van mockgh.py aanroepen (GET zonder data, POST met data)"""
    req = urllib.request.Request(MOCK + pad, method='POST' if data is not None else 'GET',
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')


class Browser:
    def __init__(self, poort=9333):
        self.profiel = tempfile.mkdtemp(prefix='mgz-chrome-')
        self.proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={poort}',
            f'--user-data-dir={self.profiel}', '--no-first-run', '--no-default-browser-check',
            '--disable-extensions', '--window-size=412,915', 'about:blank'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{poort}/json/version') as r:
                    url = json.loads(r.read())['webSocketDebuggerUrl']
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError('Chrome start niet')
        self.ws = websocket.create_connection(url, timeout=60, suppress_origin=True)
        self.id = 0
        self.events = []
        self.contexten = []

    def cmd(self, method, params=None, sessie=None):
        self.id += 1
        msg = {'id': self.id, 'method': method, 'params': params or {}}
        if sessie:
            msg['sessionId'] = sessie
        self.ws.send(json.dumps(msg))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == self.id:
                if 'error' in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get('result', {})
            self.events.append(m)

    def apparaat(self, breed=412):
        """nieuw apparaat (eigen browsercontext); breed >= 900 gedraagt zich als de pc"""
        ctx = self.cmd('Target.createBrowserContext', {'disposeOnDetach': True})['browserContextId']
        self.contexten.append(ctx)
        tid = self.cmd('Target.createTarget', {'url': 'about:blank', 'browserContextId': ctx})['targetId']
        sid = self.cmd('Target.attachToTarget', {'targetId': tid, 'flatten': True})['sessionId']
        return Apparaat(self, sid, breed)

    def ruim_op(self):
        """alle apparaten sluiten, zodat hun timers niet in de volgende test doorlopen"""
        for ctx in self.contexten:
            try:
                self.cmd('Target.disposeBrowserContext', {'browserContextId': ctx})
            except Exception:
                pass
        self.contexten = []

    def sluit(self):
        try:
            self.cmd('Browser.close')
        except Exception:
            pass
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profiel, ignore_errors=True)


class Apparaat:
    def __init__(self, b, sid, breed):
        self.b, self.sid = b, sid
        self.cmd('Page.enable')
        self.cmd('Runtime.enable')
        self.cmd('Emulation.setDeviceMetricsOverride', {'width': breed, 'height': 900, 'deviceScaleFactor': 1, 'mobile': breed < 900})
        self.cmd('Page.addScriptToEvaluateOnNewDocument', {'source': INJECT})

    def cmd(self, m, p=None):
        return self.b.cmd(m, p, self.sid)

    def ga(self, url=APP, wacht=1.5):
        self.b.events.clear()
        self.cmd('Page.navigate', {'url': url})
        eind = time.time() + 20
        while time.time() < eind:
            if any(e.get('method') == 'Page.loadEventFired' and e.get('sessionId') == self.sid for e in self.b.events):
                break
            self.ev('1')
            time.sleep(0.1)
        time.sleep(wacht)

    def ev(self, expr, wacht=True):
        """JavaScript uitvoeren in de pagina (top-level let's van app.js zijn bereikbaar)"""
        r = self.cmd('Runtime.evaluate', {'expression': expr, 'awaitPromise': wacht, 'returnByValue': True,
                                          'replMode': True})
        if 'exceptionDetails' in r:
            d = r['exceptionDetails']
            raise RuntimeError('JS: ' + str(d.get('exception', {}).get('description') or d.get('text')))
        return r['result'].get('value')

    def start(self, token='test', telling=None, rondje=None, extra=None, basis=APP):
        """localStorage vullen en de app laden"""
        # eerst een bestand van dezelfde origin zonder app-code, zodat er geen oude sync meeloopt
        self.ga(basis + 'manifest.webmanifest', wacht=0)
        zet = {'mgz_token': token, 'mgz_doorscannen': '0'}
        if telling is not None:
            zet['mgz_telling'] = json.dumps(telling)
        if rondje is not None:
            zet['mgz_rondje'] = json.dumps(rondje)
        zet.update(extra or {})
        self.ev('localStorage.clear(); ' + ''.join(f'localStorage.setItem({json.dumps(k)}, {json.dumps(v)});' for k, v in zet.items()))
        self.ga(basis)

    def fouten(self):
        return self.ev('window.__fouten')
