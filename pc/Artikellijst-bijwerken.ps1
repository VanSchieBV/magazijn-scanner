# Artikellijst bijwerken — leest de export (xlsx of csv) en zet hem als
# artikelen.json in de prive-repo magazijn-data, zodat de scanner-app de
# nieuwste artikeldata gebruikt.
param([string]$Bestand)

$ErrorActionPreference = 'Stop'
$Repo = 'flip-o0o-flow/magazijn-data'
$StandaardBestand = 'C:\Users\td\Desktop\Tijdelijk\Bestellijst Cloud.xlsx'

Write-Host ''
Write-Host '=== Artikellijst bijwerken (Magazijn Scanner) ===' -ForegroundColor Green

# --- 1. bronbestand bepalen ---
if (-not $Bestand) {
    if (Test-Path $StandaardBestand) {
        $Bestand = $StandaardBestand
    } else {
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.OpenFileDialog
        $dlg.Title = 'Kies de export (xlsx of csv)'
        $dlg.Filter = 'Excel of CSV|*.xlsx;*.xls;*.csv'
        $dlg.InitialDirectory = [Environment]::GetFolderPath('Desktop')
        if ($dlg.ShowDialog() -ne 'OK') { Write-Host 'Geannuleerd.'; exit 1 }
        $Bestand = $dlg.FileName
    }
}
if (-not (Test-Path $Bestand)) { Write-Host "Bestand niet gevonden: $Bestand" -ForegroundColor Red; pause; exit 1 }
Write-Host "Bron: $Bestand"

# --- 2. naar CSV (indien Excel) ---
$TempCsv = Join-Path $env:TEMP 'mgz_artikellijst.csv'
if ($Bestand -match '\.xlsx?$') {
    Write-Host 'Excel openen en Artikellijst exporteren...'
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false; $xl.DisplayAlerts = $false
    try {
        $wb = $xl.Workbooks.Open($Bestand, $null, $true)
        $ws = $null
        foreach ($s in $wb.Worksheets) { if ($s.Name -eq 'Artikellijst') { $ws = $s; break } }
        if (-not $ws) {
            foreach ($s in $wb.Worksheets) { if ($s.Cells.Item(1,1).Text -eq 'Barcode') { $ws = $s; break } }
        }
        if (-not $ws) { throw 'Geen tabblad "Artikellijst" (of tabblad met kolom Barcode) gevonden.' }
        $ws.Copy()
        $wb2 = $xl.ActiveWorkbook
        if (Test-Path $TempCsv) { Remove-Item $TempCsv -Force }
        $wb2.SaveAs($TempCsv, 62)   # 62 = CSV UTF-8
        $wb2.Close($false)
        $wb.Close($false)
    } finally {
        $xl.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
    }
} else {
    Copy-Item $Bestand $TempCsv -Force
}

# --- 3. CSV -> JSON ---
Write-Host 'Omzetten naar JSON...'
$eersteRegel = Get-Content $TempCsv -TotalCount 1 -Encoding UTF8
$delim = if (($eersteRegel -split ';').Count -gt ($eersteRegel -split ',').Count) { ';' } else { ',' }
$rijen = Import-Csv $TempCsv -Delimiter $delim -Encoding UTF8

# kolomnaam Techn.voorraad / Tech. Voorraad kan verschillen per export
$voorraadKolom = ($rijen[0].PSObject.Properties.Name | Where-Object { $_ -match '^Tech' } | Select-Object -First 1)
if (-not $voorraadKolom) { throw 'Kolom met technische voorraad niet gevonden.' }

$lijst = New-Object System.Collections.Generic.List[object]
foreach ($r in $rijen) {
    $bc = ('' + $r.Barcode).Trim()
    if (-not $bc) { continue }
    $lijst.Add([ordered]@{
        b = $bc
        a = ('' + $r.Artikelnummer).Trim()
        o = ('' + $r.'Korte omschrijving').Trim()
        c = ('' + $r.Crediteur).Trim()
        f = ('' + $r.Fabrikantcode).Trim()
        h = ('' + $r.'Hun nummer').Trim()
        l = ('' + $r.Locatie).Trim()
        v = ('' + $r.$voorraadKolom).Trim()
    })
}
if ($lijst.Count -lt 10) { throw "Slechts $($lijst.Count) artikelen gevonden - dat lijkt niet goed. Gestopt." }

$json = @{ bijgewerkt = (Get-Date -Format 'yyyy-MM-dd HH:mm'); artikelen = $lijst } | ConvertTo-Json -Compress -Depth 4
Write-Host ("{0} artikelen, {1:N0} kB JSON" -f $lijst.Count, ($json.Length/1024))

# --- 4. GitHub-token via credential manager (GitHub Desktop) ---
Write-Host 'Aanmelden bij GitHub...'
$token = (@('protocol=https', 'host=github.com', '') | git credential fill |
    Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''
if (-not $token) { throw 'Geen GitHub-token gevonden. Meld eerst aan via GitHub Desktop.' }

$headers = @{ Authorization = "Bearer $token"; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'MagazijnScanner' }

# --- 5. huidige sha ophalen en uploaden ---
$sha = $null
try {
    $inhoud = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/contents/" -Headers $headers
    $bestaand = $inhoud | Where-Object { $_.name -eq 'artikelen.json' }
    if ($bestaand) { $sha = $bestaand.sha }
} catch { }

Write-Host 'Uploaden naar de cloud...'
$body = @{
    message = "Artikellijst bijgewerkt ($($lijst.Count) artikelen)"
    content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}
if ($sha) { $body.sha = $sha }
$null = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/contents/artikelen.json" `
    -Method Put -Headers $headers -Body ($body | ConvertTo-Json) -ContentType 'application/json'

Write-Host ''
Write-Host ("KLAAR - {0} artikelen staan in de cloud." -f $lijst.Count) -ForegroundColor Green
Write-Host 'De app haalt de nieuwe lijst automatisch op bij de volgende start (of via Instellingen > Verversen).'
Write-Host ''
pause
