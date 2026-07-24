# Magazijn Scanner

PWA voor magazijntelling met barcode/QR-scanner via de telefooncamera.

- **App:** https://flip-o0o-flow.github.io/magazijn-scanner/
- **Data:** privé-repo `magazijn-data` (artikelen.json, telling.json, archief/) via de GitHub Contents API met een fine-grained PAT (alleen Contents read/write op die repo).
- **Artikellijst bijwerken (PC):** `pc/Artikellijst-bijwerken.ps1` — leest de Excel-export (tabblad *Artikellijst*), zet hem om naar JSON en pusht naar de data-repo.

## Onderhoud

Bij elke wijziging aan de app: **VERSION in `sw.js` ophogen**, anders blijven telefoons de oude versie uit de cache gebruiken.

Scanner: gebruikt de native `BarcodeDetector` waar beschikbaar, anders ZXing (`zxing.min.js`, lokaal gebundeld).
