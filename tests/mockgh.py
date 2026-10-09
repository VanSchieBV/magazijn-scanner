"""Nep-GitHub Contents API voor de MagazijnScanner-tests (alleen 127.0.0.1, alles in het geheugen).
Gedraagt zich als GitHub op de punten die de app gebruikt: raw en JSON (base64 + sha), de mapindex,
en PUT met sha-controle (409 bij een verouderde sha, 422 bij een ontbrekende).
Pad: /repos/VanSchieBV/magazijn-data/contents/<bestand>
Beheer: GET /__state, POST /__state (json {bestand: tekst|null}), POST /__fail (json {n, status, methode}),
        GET /__log, POST /__reset, POST /__delay (json {ms, pad}),
        POST /__naGet (json {pad: tekst}: direct na de volgende GET van pad 'schrijft een ander apparaat')"""
import base64, hashlib, json, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PREFIX = '/repos/VanSchieBV/magazijn-data/contents/'
lock = threading.Lock()
files = {}          # pad -> tekst
log = []            # (methode, pad, status)
fail = {'n': 0, 'status': 500, 'methode': None}
delay = {'ms': 0, 'pad': None}
na_get = {}        # pad -> nieuwe tekst die direct na de volgende GET van dat pad wordt gezet

def sha(t):
    return hashlib.sha1(t.encode('utf-8')).hexdigest()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
    def stuur(self, status, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode('utf-8')
        self.send_response(status); self.cors()
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def lees(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'null') if n else None
    def beheer(self, m):
        p = urlparse(self.path).path
        with lock:
            if p == '/__state' and m == 'GET': return self.stuur(200, files)
            if p == '/__state':
                for k, v in (self.lees() or {}).items():
                    if v is None: files.pop(k, None)
                    else: files[k] = v
                return self.stuur(200, {'ok': True})
            if p == '/__fail': fail.update(self.lees() or {}); return self.stuur(200, fail)
            if p == '/__delay': delay.update(self.lees() or {}); return self.stuur(200, delay)
            if p == '/__naGet': na_get.update(self.lees() or {}); return self.stuur(200, na_get)
            if p == '/__log' and m == 'GET': return self.stuur(200, log)
            if p == '/__log': log.clear(); return self.stuur(200, {'ok': True})
            if p == '/__reset':
                files.clear(); log.clear(); na_get.clear(); fail.update(n=0, status=500, methode=None); delay.update(ms=0, pad=None)
                return self.stuur(200, {'ok': True})
        self.stuur(404, {'message': 'onbekend'})
    def api(self, m):
        p = urlparse(self.path).path
        if not p.startswith(PREFIX): return self.stuur(404, {'message': 'Not Found'})
        pad = p[len(PREFIX):]
        if delay['ms'] and (delay['pad'] is None or delay['pad'] == pad) and m == 'GET':
            time.sleep(delay['ms'] / 1000)
        with lock:
            if fail['n'] > 0 and (fail['methode'] in (None, m)):
                fail['n'] -= 1
                log.append((m, pad, fail['status']))
                return self.stuur(fail['status'], {'message': 'kunstmatige fout'})
            if m == 'GET':
                if pad == '':
                    lijst = [{'name': k, 'path': k, 'sha': sha(v), 'size': len(v.encode()), 'type': 'file'}
                             for k, v in files.items() if '/' not in k]
                    log.append((m, '(map)', 200)); return self.stuur(200, lijst)
                if pad not in files:
                    log.append((m, pad, 404)); return self.stuur(404, {'message': 'Not Found'})
                t = files[pad]
                log.append((m, pad, 200))
                if pad in na_get: files[pad] = na_get.pop(pad)   # 'ander apparaat' schrijft net hierna
                if 'raw' in (self.headers.get('Accept') or ''):
                    return self.stuur(200, t, 'text/plain; charset=utf-8')
                b64 = base64.b64encode(t.encode('utf-8')).decode()
                b64 = '\n'.join(b64[i:i+60] for i in range(0, len(b64), 60)) + '\n'
                return self.stuur(200, {'name': pad.split('/')[-1], 'path': pad, 'sha': sha(t),
                                        'size': len(t.encode()), 'encoding': 'base64', 'content': b64})
            if m == 'PUT':
                body = self.lees() or {}
                t = base64.b64decode(body.get('content', '')).decode('utf-8')
                if pad in files:
                    if 'sha' not in body:
                        log.append((m, pad, 422)); return self.stuur(422, {'message': 'sha ontbreekt'})
                    if body['sha'] != sha(files[pad]):
                        log.append((m, pad, 409)); return self.stuur(409, {'message': 'sha klopt niet'})
                files[pad] = t
                log.append((m, pad, 200))
                return self.stuur(200, {'content': {'sha': sha(t), 'path': pad}})
        self.stuur(405, {'message': 'methode'})
    def do_GET(self):
        if self.path.startswith('/__'): return self.beheer('GET')
        self.api('GET')
    def do_POST(self):
        if self.path.startswith('/__'): return self.beheer('POST')
        self.stuur(405, {})
    def do_PUT(self): self.api('PUT')

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8767), H).serve_forever()
