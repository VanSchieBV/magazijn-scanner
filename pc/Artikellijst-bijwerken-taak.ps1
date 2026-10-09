# Geplande taak: draait Artikellijst-bijwerken.ps1 zonder venster, maar alleen
# als er een nieuwe/gewijzigde export in de Bron-map ligt. Alles komt in
# bijwerken-taak.log; het stempelbestand onthoudt welke export al verwerkt is.
$ErrorActionPreference = 'Stop'
$BronMap = 'C:\Users\td\Projecten_AI\MagazijnScanner\Bron'
$Log = Join-Path $PSScriptRoot 'bijwerken-taak.log'
$Marker = Join-Path $PSScriptRoot '_laatst-verwerkt.txt'

function Log { param([string]$Tekst)
    ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Tekst) | Add-Content -Path $Log -Encoding UTF8
}

# logbestand niet eindeloos laten groeien: boven ~200 kB de oudste helft weggooien
if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 200kb) {
    $regels = Get-Content $Log
    $regels[[int]($regels.Count / 2)..($regels.Count - 1)] | Set-Content $Log -Encoding UTF8
}

$bestand = @(Get-ChildItem -Path (Join-Path $BronMap 'Artikelen.*') -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.xlsx', '.csv' } |
    Sort-Object LastWriteTime -Descending) | Select-Object -First 1
if (-not $bestand) { Log 'Geen Artikelen.xlsx/.csv in de Bron-map - overgeslagen.'; exit 0 }

$stempel = '{0}|{1}' -f $bestand.LastWriteTimeUtc.Ticks, $bestand.Length
if ((Test-Path $Marker) -and ((Get-Content $Marker -First 1) -eq $stempel)) {
    Log ("Geen nieuwe export ({0} ongewijzigd) - overgeslagen." -f $bestand.Name)
    exit 0
}

Log ("Nieuwe export gevonden: {0} ({1:N0} kB, gewijzigd {2:dd-MM-yyyy HH:mm})." -f `
    $bestand.Name, ($bestand.Length / 1024), $bestand.LastWriteTime)
$env:MGZ_STIL = '1'
try {
    $uitvoer = & (Join-Path $PSScriptRoot 'Artikellijst-bijwerken.ps1') -Bestand $bestand.FullName *>&1
    foreach ($r in $uitvoer) { $t = ('' + $r).TrimEnd(); if ($t) { Log ('    ' + $t) } }
    if (($uitvoer | Out-String) -match 'KLAAR') {
        Set-Content -Path $Marker -Value $stempel -Encoding UTF8
        Log 'Gelukt - stempel bijgewerkt.'
    } else {
        Log 'FOUT: script is niet goed afgerond (geen KLAAR-melding). Stempel NIET bijgewerkt; volgende run probeert opnieuw.'
        exit 1
    }
} catch {
    Log ('FOUT: ' + $_.Exception.Message)
    Log 'Stempel NIET bijgewerkt; volgende run probeert opnieuw.'
    exit 1
}
