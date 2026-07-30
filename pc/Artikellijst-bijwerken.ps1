# Artikellijst bijwerken - leest de export (xlsx of csv) en zet hem als
# artikelen.json in de prive-repo magazijn-data, zodat de scanner-app de
# nieuwste artikeldata gebruikt.
#
# Leest het xlsx-bestand rechtstreeks (ZIP+XML), Excel wordt niet gestart.
param([string]$Bestand)

$ErrorActionPreference = 'Stop'
$Repo = 'VanSchieBV/magazijn-data'
# Bronmap: nieuwste "Export Artikelen.xlsx" of ".csv" wint (csv komt er later automatisch)
$BronMap = 'C:\Users\td\Projecten_AI\Magazijn scanner\Bron'

function Wacht {
    if ($env:MGZ_STIL) { return }
    Write-Host ''
    try { $null = Read-Host 'Druk op Enter om te sluiten' } catch { }
}

Write-Host ''
Write-Host '=== Artikellijst bijwerken (Magazijn Scanner) ===' -ForegroundColor Green

# --- 1. bronbestand bepalen ---
if (-not $Bestand) {
    $kandidaten = @(Get-ChildItem -Path (Join-Path $BronMap 'Export Artikelen.*') -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.xlsx', '.csv' } |
        Sort-Object LastWriteTime -Descending)
    if ($kandidaten.Count) {
        $Bestand = $kandidaten[0].FullName
    } else {
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.OpenFileDialog
        $dlg.Title = 'Kies de export (xlsx of csv)'
        $dlg.Filter = 'Excel of CSV|*.xlsx;*.csv'
        $dlg.InitialDirectory = $BronMap
        if ($dlg.ShowDialog() -ne 'OK') { Write-Host 'Geannuleerd.'; exit 1 }
        $Bestand = $dlg.FileName
    }
}
if (-not (Test-Path $Bestand)) { Write-Host "Bestand niet gevonden: $Bestand" -ForegroundColor Red; Wacht; exit 1 }
Write-Host "Bron: $Bestand"

# --- 2. rijen inlezen ---
function Lees-XlsxSheet {
    # geeft de rijen van een werkbladf terug als lijst van hashtables kolomletter->waarde
    param($Zip, [string]$Target, $SharedStrings, [int]$MaxRijen = 0)
    $entry = $Zip.GetEntry($Target)
    if (-not $entry) { throw "Werkblad $Target niet gevonden in het xlsx-bestand." }
    $rd = [System.Xml.XmlReader]::Create($entry.Open())
    $rijen = New-Object System.Collections.Generic.List[object]
    $rij = $null; $celRef = $null; $celType = $null; $skip = $false
    while ($skip -or $rd.Read()) {
        $skip = $false
        if ($rd.NodeType -eq 'Element') {
            switch ($rd.LocalName) {
                'row' { $rij = @{} }
                'c'   { $celRef = $rd.GetAttribute('r'); $celType = $rd.GetAttribute('t') }
                'v'   {
                    $v = $rd.ReadElementContentAsString(); $skip = $true
                    if ($celType -eq 's') { $v = $SharedStrings[[int]$v] }
                    $rij[($celRef -replace '\d', '')] = $v
                }
                't'   {
                    if ($celType -eq 'inlineStr') {
                        $rij[($celRef -replace '\d', '')] = $rd.ReadElementContentAsString(); $skip = $true
                    }
                }
            }
        } elseif ($rd.NodeType -eq 'EndElement' -and $rd.LocalName -eq 'row') {
            if ($rij.Count) { $rijen.Add($rij) }
            $rij = $null
            if ($MaxRijen -gt 0 -and $rijen.Count -ge $MaxRijen) { break }
        }
    }
    $rd.Close()
    return , $rijen
}

function Lees-XlsxTabel {
    # opent een xlsx en geeft @{ Kolommen = naam->letter; Rijen = lijst } terug.
    # VoorkeurTab wint; anders het eerste tabblad met KenmerkKolom in de kop.
    param([string]$Pad, [string]$VoorkeurTab, [string]$KenmerkKolom)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Pad)
    try {
        # gedeelde teksten
        $ss = New-Object System.Collections.Generic.List[string]
        $entry = $zip.GetEntry('xl/sharedStrings.xml')
        if ($entry) {
            $rd = [System.Xml.XmlReader]::Create($entry.Open())
            $huidig = $null; $skip = $false
            while ($skip -or $rd.Read()) {
                $skip = $false
                if ($rd.NodeType -eq 'Element' -and $rd.LocalName -eq 'si') { $huidig = New-Object Text.StringBuilder }
                elseif ($rd.NodeType -eq 'Element' -and $rd.LocalName -eq 't' -and $huidig -ne $null) { $null = $huidig.Append($rd.ReadElementContentAsString()); $skip = $true }
                elseif ($rd.NodeType -eq 'EndElement' -and $rd.LocalName -eq 'si') { $ss.Add($huidig.ToString()); $huidig = $null }
            }
            $rd.Close()
        }

        # tabbladen: naam -> xml-bestand
        [xml]$wbXml = (New-Object IO.StreamReader($zip.GetEntry('xl/workbook.xml').Open())).ReadToEnd()
        [xml]$relXml = (New-Object IO.StreamReader($zip.GetEntry('xl/_rels/workbook.xml.rels').Open())).ReadToEnd()
        $relMap = @{}
        foreach ($r in $relXml.Relationships.Relationship) { $relMap[$r.Id] = 'xl/' + ($r.Target -replace '^/xl/', '') }
        $sheetMap = [ordered]@{}
        foreach ($s in $wbXml.workbook.sheets.sheet) {
            $rid = $s.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            $sheetMap[$s.name] = $relMap[$rid]
        }

        $doel = $null
        if ($VoorkeurTab -and $sheetMap.Contains($VoorkeurTab)) { $doel = $sheetMap[$VoorkeurTab] }
        else {
            foreach ($naam in $sheetMap.Keys) {
                $kop = Lees-XlsxSheet -Zip $zip -Target $sheetMap[$naam] -SharedStrings $ss -MaxRijen 1
                if ($kop.Count -and $kop[0].Values -contains $KenmerkKolom) { $doel = $sheetMap[$naam]; Write-Host "Tabblad '$naam' gebruikt."; break }
            }
        }
        if (-not $doel) { throw "Geen tabblad '$VoorkeurTab' (of tabblad met kolom $KenmerkKolom) gevonden in $Pad." }

        $alle = Lees-XlsxSheet -Zip $zip -Target $doel -SharedStrings $ss
    } finally {
        $zip.Dispose()
    }
    if ($alle.Count -lt 2) { throw "Het tabblad in $Pad is leeg." }
    $kol = @{}
    foreach ($kv in $alle[0].GetEnumerator()) { $kol[('' + $kv.Value).Trim()] = $kv.Key }
    return @{ Kolommen = $kol; Rijen = $alle.GetRange(1, $alle.Count - 1) }
}

$kolommen = $null   # hashtable: kolomnaam -> kolomletter
$dataRijen = $null  # lijst hashtables kolomletter -> waarde

if ($Bestand -match '\.xlsx$') {
    Write-Host 'Xlsx-bestand uitlezen...'
    $tabel = Lees-XlsxTabel -Pad $Bestand -VoorkeurTab 'Artikellijst' -KenmerkKolom 'Barcode'
    $kolommen = $tabel.Kolommen
    $dataRijen = $tabel.Rijen
} else {
    Write-Host 'CSV-bestand uitlezen...'
    $eersteRegel = Get-Content $Bestand -TotalCount 1 -Encoding UTF8
    $delim = if (($eersteRegel -split ';').Count -gt ($eersteRegel -split ',').Count) { ';' } else { ',' }
    $csv = Import-Csv $Bestand -Delimiter $delim -Encoding UTF8
    if (-not $csv.Count) { throw 'Het csv-bestand is leeg.' }
    $kolommen = @{}
    foreach ($naam in $csv[0].PSObject.Properties.Name) { $kolommen[$naam.Trim()] = $naam }
    $dataRijen = New-Object System.Collections.Generic.List[object]
    foreach ($r in $csv) {
        $h = @{}
        foreach ($p in $r.PSObject.Properties) { $h[$p.Name] = $p.Value }
        $dataRijen.Add($h)
    }
}

# --- 2b. crediteurnamen inlezen (Bron\Crediteuren.xlsx, kolommen Cred.nr + Naam) ---
$credNamen = @{}
$credBestand = Join-Path $BronMap 'Crediteuren.xlsx'
if (Test-Path $credBestand) {
    Write-Host 'Crediteurnamen uitlezen...'
    $credTabel = Lees-XlsxTabel -Pad $credBestand -VoorkeurTab 'Crediteur' -KenmerkKolom 'Cred.nr'
    $kNr = $credTabel.Kolommen['Cred.nr']
    $kNaam = $credTabel.Kolommen['Naam']
    if (-not $kNr -or -not $kNaam) { throw 'Crediteuren.xlsx mist de kolom "Cred.nr" of "Naam".' }
    foreach ($r in $credTabel.Rijen) {
        $nr = ('' + $r[$kNr]).Trim()
        $naam = ('' + $r[$kNaam]).Trim()
        if ($nr -and $naam) { $credNamen[$nr] = $naam }
    }
    Write-Host ("{0} crediteurnamen gevonden." -f $credNamen.Count)
} else {
    Write-Host "Crediteuren.xlsx niet gevonden in $BronMap - codes blijven ongewijzigd." -ForegroundColor Yellow
}

# --- 3. omzetten naar JSON ---
$voorraadKop = ($kolommen.Keys | Where-Object { $_ -match '^Tech' } | Select-Object -First 1)
$vereist = @('Barcode', 'Artikelnummer', 'Korte omschrijving', 'Crediteur', 'Fabrikantcode', 'Hun nummer', 'Locatie')
foreach ($k in $vereist) { if (-not $kolommen.Contains($k)) { throw "Kolom '$k' niet gevonden in de export." } }
if (-not $voorraadKop) { throw 'Kolom met technische voorraad (Tech...) niet gevonden.' }

function JsonEsc {
    param([string]$s)
    if ($null -eq $s) { return '' }
    $sb = New-Object Text.StringBuilder
    foreach ($ch in $s.ToCharArray()) {
        switch ($ch) {
            '"'  { $null = $sb.Append('\"') }
            '\' { $null = $sb.Append('\\') }
            default {
                if ([int]$ch -lt 32) { $null = $sb.AppendFormat('\u{0:x4}', [int]$ch) }
                else { $null = $sb.Append($ch) }
            }
        }
    }
    $sb.ToString()
}

Write-Host 'Omzetten naar JSON...'
$sb = New-Object Text.StringBuilder
$null = $sb.Append('{"bijgewerkt":"').Append((Get-Date -Format 'yyyy-MM-dd HH:mm')).Append('","artikelen":[')
$aantal = 0
$veldKol = @{
    b = $kolommen['Barcode']; a = $kolommen['Artikelnummer']; o = $kolommen['Korte omschrijving']
    c = $kolommen['Crediteur']; f = $kolommen['Fabrikantcode']; h = $kolommen['Hun nummer']
    l = $kolommen['Locatie']; v = $kolommen[$voorraadKop]
}
$credOnbekend = @{}
foreach ($rij in $dataRijen) {
    $bc = ('' + $rij[$veldKol.b]).Trim()
    if (-not $bc) { continue }
    # crediteurcode omzetten naar de volledige naam; onbekende code blijft staan
    $credCode = ('' + $rij[$veldKol.c]).Trim()
    $cred = $credCode
    if ($credCode) {
        if ($credNamen.ContainsKey($credCode)) { $cred = $credNamen[$credCode] }
        elseif ($credNamen.Count) { $credOnbekend[$credCode] = $true }
    }
    if ($aantal) { $null = $sb.Append(',') }
    $null = $sb.Append('{"b":"').Append((JsonEsc $bc))
    $null = $sb.Append('","a":"').Append((JsonEsc ('' + $rij[$veldKol.a]).Trim()))
    $null = $sb.Append('","o":"').Append((JsonEsc ('' + $rij[$veldKol.o]).Trim()))
    $null = $sb.Append('","c":"').Append((JsonEsc $cred))
    $null = $sb.Append('","f":"').Append((JsonEsc ('' + $rij[$veldKol.f]).Trim()))
    $null = $sb.Append('","h":"').Append((JsonEsc ('' + $rij[$veldKol.h]).Trim()))
    $null = $sb.Append('","l":"').Append((JsonEsc ('' + $rij[$veldKol.l]).Trim()))
    $null = $sb.Append('","v":"').Append((JsonEsc ('' + $rij[$veldKol.v]).Trim()))
    $null = $sb.Append('"}')
    $aantal++
}
$null = $sb.Append(']}')
$json = $sb.ToString()
if ($aantal -lt 10) { throw "Slechts $aantal artikelen gevonden - dat lijkt niet goed. Gestopt." }
Write-Host ("{0} artikelen, {1:N0} kB JSON" -f $aantal, ($json.Length / 1024))
if ($credOnbekend.Count) {
    Write-Host ("Let op: {0} crediteurcode(s) staan niet in Crediteuren.xlsx en blijven als code staan: {1}" -f `
        $credOnbekend.Count, (($credOnbekend.Keys | Sort-Object) -join ', ')) -ForegroundColor Yellow
}

# --- 4. GitHub-token via credential manager (GitHub Desktop) ---
Write-Host 'Aanmelden bij GitHub...'
# stdin via cmd-redirect: rechtstreeks pipen vanuit PowerShell komt niet goed aan bij git
$credFile = Join-Path $PSScriptRoot '_cred_tmp.txt'
"protocol=https`nhost=github.com`n" | Out-File -FilePath $credFile -Encoding ascii
try {
    $credUit = cmd /c "git credential fill < `"$credFile`""
} finally {
    Remove-Item $credFile -Force -ErrorAction SilentlyContinue
}
$token = ($credUit | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''
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
    message = "Artikellijst bijgewerkt ($aantal artikelen)"
    content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}
if ($sha) { $body.sha = $sha }
$null = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/contents/artikelen.json" `
    -Method Put -Headers $headers -Body ($body | ConvertTo-Json) -ContentType 'application/json'

Write-Host ''
Write-Host ("KLAAR - {0} artikelen staan in de cloud." -f $aantal) -ForegroundColor Green
Write-Host 'De app haalt de nieuwe lijst automatisch op bij de volgende start (of via Instellingen > Verversen).'
Wacht
