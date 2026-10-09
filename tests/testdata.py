import json
# verzonnen testartikelen (geen bedrijfsdata); 333 is een dubbele barcode
ARTIKELEN = {'bijgewerkt': '2026-10-08 09:15', 'artikelen': [
    {'b': '111', 'a': 'O1001', 'o': 'Bout M8', 'c': 'Leverancier A', 'f': 'F-1', 'h': 'H-1', 'l': '2.1.3', 'v': '10'},
    {'b': '222', 'a': 'O1002', 'o': 'Moer M8', 'c': 'Leverancier A', 'f': 'F-2', 'h': '', 'l': '11.2.1', 'v': '5'},
    {'b': '333', 'a': 'O1003', 'o': 'Ring 8 mm', 'c': 'Leverancier B', 'f': '', 'h': 'H-3', 'l': '21.10.5-4', 'v': '7'},
    {'b': '333', 'a': 'O1004', 'o': 'Ring 10 mm', 'c': 'Leverancier B', 'f': '', 'h': 'H-4', 'l': '21.10.6', 'v': '3'},
    {'b': '444', 'a': 'O1005', 'o': 'Slang', 'c': 'Leverancier C', 'f': 'F-5', 'h': 'H-5', 'l': '56.', 'v': '0'},
    {'b': '555', 'a': 'O1006', 'o': 'Kabelbinder', 'c': '', 'f': '', 'h': '', 'l': 'ZOLDER', 'v': '100'},
]}
def basis():
    return {'artikelen.json': json.dumps(ARTIKELEN, ensure_ascii=False), 'telling.json': None, 'rondje.json': None}
