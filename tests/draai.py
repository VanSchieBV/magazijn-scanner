"""Testreeks draaien met één commando: python tests/draai.py [filter]

Start zelf de app-server (127.0.0.1:8765, de projectmap) en de nep-GitHub (127.0.0.1:8767),
draait tests.py in headless Chrome (geen venster, eigen tijdelijk profiel) en stopt alles weer.
Draait een van de servers al, dan wordt die gebruikt. Nodig: Python 3, Chrome of Edge,
en `pip install websocket-client`. Exitcode 0 = alles geslaagd.
"""
import os, socket, subprocess, sys, time

HIER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HIER)


def poort_open(poort):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', poort)) == 0


def main():
    stil = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    servers = []
    if not poort_open(8765):
        servers.append(subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, **stil))
    if not poort_open(8767):
        servers.append(subprocess.Popen([sys.executable, os.path.join(HIER, 'mockgh.py'), '8767'], cwd=HIER, **stil))
    try:
        for _ in range(50):
            if poort_open(8765) and poort_open(8767):
                break
            time.sleep(0.1)
        else:
            print('De testservers starten niet (poort 8765 of 8767 bezet?)')
            return 2
        return subprocess.call([sys.executable, os.path.join(HIER, 'tests.py')] + sys.argv[1:], cwd=HIER)
    finally:
        for p in servers:
            p.terminate()


if __name__ == '__main__':
    sys.exit(main())
