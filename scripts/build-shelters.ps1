param(
  [string]$SourceFile = (Join-Path $PSScriptRoot '..\data\shelters-source.xlsx')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputFile = Join-Path $projectRoot 'data\poltava-shelters.geojson'
$reportFile = Join-Path $projectRoot 'data\shelters-geocode-report.csv'
$errorFile = Join-Path $projectRoot 'data\shelters-geocode-errors.csv'
$geoportalUrl = 'https://mbk.rada-poltava.gov.ua/api/suggest/address_id_map?limit=20&key='

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-CellText {
  param($Cell, $SharedStrings, $Namespace)
  $value = $Cell.SelectSingleNode('x:v', $Namespace)
  if ($null -eq $value) { return $null }
  if ($Cell.GetAttribute('t') -eq 's') { return $SharedStrings[[int]$value.InnerText] }
  return $value.InnerText
}

function Get-StreetTokens {
  param([string]$Value)
  $normalized = $Value.ToLowerInvariant() -replace '[^\p{L}\p{N}]+', ' '
  $normalized = $normalized -replace '\bсоборний\b', 'соборності'
  $stop = @('полтава','вулиця','вул','проспект','просп','просп','пр','провулок','пров','пров','бульвар','бульв','б-р','площа','пл','майдан','узвіз','шосе','набережна','наб','алея')
  @($normalized -split '\s+' | Where-Object { $_.Length -ge 3 -and $_ -notin $stop })
}

function Normalize-House {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  $match = [regex]::Match($Value, '^\s*(\d+[\p{L}\p{N}]*(?:[/\-]\s*\d+[\p{L}\p{N}]*)?(?:\s+[\p{L}])?)', 'IgnoreCase')
  if (-not $match.Success) { return '' }
  return (($match.Groups[1].Value.ToLowerInvariant() -replace '\s+', '') -replace '-', '')
}

function Get-AddressInfo {
  param([string]$Address)
  $clean = [regex]::Replace($Address, '^\s*м\.\s*Полтава\s*,?\s*', '', 'IgnoreCase').Trim()
  if ([string]::IsNullOrWhiteSpace($clean) -or $clean -match '^\(') { return $null }

  $clean = [regex]::Replace($clean, '^\s*(?:вул\.?|вулиця|просп\.?|пр-т|пров\.?|провулок|бульв\.?|бульвар|б-р|пл\.?|площа|узвіз|шосе|наб\.?|набережна)\s*', '', 'IgnoreCase')
  $clean = [regex]::Replace($clean, '\s+', ' ').Trim()
  $houseMatch = [regex]::Match($clean, '(?:,\s*|\s+)(?<house>\d+[\p{L}\p{N}]*(?:[/\-]\s*\d+[\p{L}\p{N}]*)?(?:\s+[\p{L}])?(?:\s*,?\s*(?:к\.?|корп(?:ус)?)\s*\d+[\p{L}\p{N}]*)?)\s*$', 'IgnoreCase')
  if (-not $houseMatch.Success) { return $null }

  $house = $houseMatch.Groups['house'].Value.Trim()
  $street = $clean.Substring(0, $houseMatch.Index).Trim().TrimEnd(',').Trim()
  $street = [regex]::Replace($street, '\b[А-ЯІЇЄҐ]\s*\.\s*', '', 'IgnoreCase')
  $street = [regex]::Replace($street, '\s+', ' ').Trim(' ', ',')
  if ([string]::IsNullOrWhiteSpace($street)) { return $null }

  $baseHouseMatch = [regex]::Match($house, '^\s*\d+[\p{L}\p{N}]*(?:\s+[\p{L}])?', 'IgnoreCase')
  $baseHouse = if ($baseHouseMatch.Success) { $baseHouseMatch.Value.Trim() } else { $house }
  $queryHouse = $house -replace '/.*$', ''
  $queryStreet = $street
  if ($queryStreet -match 'Решитилівська') { $queryStreet = $queryStreet -replace 'Решитилівська', 'Решетилівська' }
  $queryStreet = $queryStreet -replace 'Соборний\s+майдан', 'Соборності'
  $queryStreet = $queryStreet.Replace([char]0x2019, [char]0x27).Replace([char]0x2018, [char]0x27)
  $queryKeys = [System.Collections.Generic.List[string]]::new()
  foreach ($key in @("$queryStreet, $queryHouse", "$queryStreet, $baseHouse", "$street, $queryHouse", "$street, $baseHouse")) {
    if (-not $queryKeys.Contains($key)) { $queryKeys.Add($key) }
  }

  [pscustomobject]@{
    Street = $street
    House = $house
    BaseHouse = $baseHouse
    Tokens = @(Get-StreetTokens $street)
    QueryKeys = $queryKeys.ToArray()
  }
}

function Find-GeoportalMatch {
  param($Info, $Suggestions)
  $targetHouse = Normalize-House $Info.House
  if (-not $targetHouse) { $targetHouse = Normalize-House $Info.BaseHouse }
  if (-not $targetHouse) { return $null }
  $candidateMatches = @()

  foreach ($suggestion in $Suggestions) {
    if ($suggestion.text -notmatch '^Полтава,\s*(?<tail>.+)$') { continue }
    $tail = $Matches['tail']
    $numberMatch = [regex]::Match($tail, ',\s*(?<house>\d+[\p{L}\p{N}]*(?:[/\-]\s*\d+[\p{L}\p{N}]*)?)(?:\s*,.*)?$', 'IgnoreCase')
    if (-not $numberMatch.Success) { continue }
    if ((Normalize-House $numberMatch.Groups['house'].Value) -ne $targetHouse) { continue }
    $candidateStreet = $tail.Substring(0, $numberMatch.Index).Trim().TrimEnd(',').Trim()
    $candidateTokens = @(Get-StreetTokens $candidateStreet)
    $score = @($Info.Tokens | Where-Object { $_ -in $candidateTokens }).Count
    if ($score -gt 0) {
      $candidateMatches += [pscustomobject]@{ Suggestion = $suggestion; Score = $score; Street = $candidateStreet }
    }
  }

  if (-not $candidateMatches.Count) { return $null }
  $candidateMatches | Sort-Object Score -Descending | Select-Object -First 1
}

if (-not (Test-Path -LiteralPath $SourceFile)) { throw "Не знайдено файл джерела: $SourceFile" }
$zipPath = (Resolve-Path -LiteralPath $SourceFile).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $sharedReader = [System.IO.StreamReader]::new(($zip.GetEntry('xl/sharedStrings.xml')).Open())
  try { [xml]$sharedXml = $sharedReader.ReadToEnd() } finally { $sharedReader.Dispose() }
  $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
  $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $sharedStrings = @($sharedXml.SelectNodes('//x:si', $sharedNs) | ForEach-Object { $_.InnerText })

  $sheetReader = [System.IO.StreamReader]::new(($zip.GetEntry('xl/worksheets/sheet1.xml')).Open())
  try { [xml]$sheetXml = $sheetReader.ReadToEnd() } finally { $sheetReader.Dispose() }
  $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
  $sheetNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $section = ''
  $records = [System.Collections.Generic.List[object]]::new()

  foreach ($row in $sheetXml.SelectNodes('//x:sheetData/x:row', $sheetNs)) {
    $cells = @{}
    foreach ($cell in $row.SelectNodes('x:c', $sheetNs)) {
      $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
      $text = Get-CellText $cell $sharedStrings $sheetNs
      if ($null -ne $text) { $cells[$column] = $text }
    }
    if ($cells.ContainsKey('B') -and -not $cells.ContainsKey('A') -and $cells['B'] -match 'СХОВ|УКРИТ|ЗАХИС|ПОДВІЙ') { $section = $cells['B'].Trim() }
    if ($cells.ContainsKey('A') -and $cells['A'] -match '^\d+$' -and $cells.ContainsKey('C') -and $cells['C'] -match '^\s*м\.\s*Полтава') {
      $typeLabel = switch -Regex ($section) {
        'СХОВИЩА' { 'Сховище'; break }
        'ПРОТИРАДІАЦІЙНІ' { 'Протирадіаційне укриття'; break }
        'ПОДВІЙНОГО ПРИЗНАЧЕННЯ' { 'Споруда подвійного призначення'; break }
        'НАЙПРОСТІШІ' { 'Найпростіше укриття'; break }
        default { 'Захисна споруда' }
      }
      $records.Add([pscustomobject]@{
        Number = $cells['A']
        Organization = [string]$cells['B']
        Address = ([string]$cells['C']).Trim()
        Ownership = [string]$cells['D']
        Capacity = [string]$cells['E']
        Type = $typeLabel
      })
    }
  }
}
finally { $zip.Dispose() }

$recordsByAddress = @{}
foreach ($record in $records) {
  if (-not $recordsByAddress.ContainsKey($record.Address)) { $recordsByAddress[$record.Address] = [System.Collections.Generic.List[object]]::new() }
  $recordsByAddress[$record.Address].Add($record)
}

$resolved = @{}
if (Test-Path -LiteralPath $outputFile) {
  try {
    $previous = Get-Content -LiteralPath $outputFile -Raw | ConvertFrom-Json
    foreach ($feature in $previous.features) {
      $coords = $feature.geometry.coordinates
      $items = @($feature.properties.items_json | ConvertFrom-Json)
      foreach ($item in $items) {
        if ($item.address -and $recordsByAddress.ContainsKey([string]$item.address)) {
          $resolved[[string]$item.address] = [pscustomobject]@{
            Longitude = [double]$coords[0]
            Latitude = [double]$coords[1]
            MatchedAddress = [string]$feature.properties.matched_address
          }
        }
      }
    }
  } catch { Write-Warning "Не вдалося прочитати попередній GeoJSON для кешу: $($_.Exception.Message)" }
}

$addressInfos = @{}
foreach ($record in $records) {
  if (-not $addressInfos.ContainsKey($record.Address)) { $addressInfos[$record.Address] = Get-AddressInfo $record.Address }
}

$queryCache = @{}
$apiErrors = [System.Collections.Generic.List[object]]::new()
$lastRequest = [datetime]::MinValue
$apiLimited = $false
function Invoke-GeoportalSearch {
  param([string[]]$Keys)
  foreach ($key in $Keys) {
    if ($queryCache.ContainsKey($key)) { continue }
    if ($script:lastRequest -ne [datetime]::MinValue) { Start-Sleep -Milliseconds 850 }
  $encoded = [uri]::EscapeDataString($key)
  try {
      $result = Invoke-RestMethod -Uri ($geoportalUrl + $encoded) -TimeoutSec 30
      $queryCache[$key] = @($result.data)
    } catch {
      $queryCache[$key] = @()
      $statusCode = 0
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
      $apiErrors.Add([pscustomobject]@{ Query = $key; Status = $statusCode; Error = $_.ErrorDetails.Message ?? $_.Exception.Message })
      if ($statusCode -eq 429) { $script:apiLimited = $true; Write-Warning 'Геопортал тимчасово обмежив запити; пропускаю решту адрес, щоб не перевантажувати сервіс.'; return }
    } finally { $script:lastRequest = Get-Date }
  }
}

$unresolvedAddresses = @($addressInfos.Keys | Where-Object { -not $resolved.ContainsKey($_) -and $null -ne $addressInfos[$_] })
$primaryKeys = @($unresolvedAddresses | ForEach-Object { $addressInfos[$_].QueryKeys[0] } | Sort-Object -Unique)
Write-Host "Знайдено записів Полтави: $($records.Count); уже зіставлено: $($resolved.Count); первинних пошуків: $($primaryKeys.Count)"
Invoke-GeoportalSearch $primaryKeys

foreach ($address in $unresolvedAddresses) {
  if ($resolved.ContainsKey($address)) { continue }
  $info = $addressInfos[$address]
  foreach ($key in $info.QueryKeys) {
    if (-not $queryCache.ContainsKey($key)) { continue }
    $match = Find-GeoportalMatch $info $queryCache[$key]
    if ($null -ne $match) {
      $resolved[$address] = [pscustomobject]@{ Longitude = [double]$match.Suggestion.x; Latitude = [double]$match.Suggestion.y; MatchedAddress = [string]$match.Suggestion.text }
      break
    }
  }
}

$stillUnresolved = @($unresolvedAddresses | Where-Object { -not $resolved.ContainsKey($_) })
for ($variantIndex = 1; $stillUnresolved.Count -gt 0 -and $variantIndex -lt 4 -and -not $apiLimited; $variantIndex++) {
  $fallbackKeys = @($stillUnresolved | ForEach-Object { $info = $addressInfos[$_]; if ($info.QueryKeys.Count -gt $variantIndex) { $info.QueryKeys[$variantIndex] } } | Where-Object { $_ } | Sort-Object -Unique)
  Invoke-GeoportalSearch $fallbackKeys
  foreach ($address in $stillUnresolved) {
    $info = $addressInfos[$address]
    if ($info.QueryKeys.Count -le $variantIndex) { continue }
    $match = Find-GeoportalMatch $info $queryCache[$info.QueryKeys[$variantIndex]]
    if ($null -ne $match) { $resolved[$address] = [pscustomobject]@{ Longitude = [double]$match.Suggestion.x; Latitude = [double]$match.Suggestion.y; MatchedAddress = [string]$match.Suggestion.text } }
  }
  $stillUnresolved = @($stillUnresolved | Where-Object { -not $resolved.ContainsKey($_) })
}

$unmatched = [System.Collections.Generic.List[object]]::new()
foreach ($address in $addressInfos.Keys) {
  if (-not $resolved.ContainsKey($address)) {
    $unmatched.Add([pscustomobject]@{ Address = $address; Records = $recordsByAddress[$address].Count; Reason = if ($null -eq $addressInfos[$address]) { 'Немає адреси з номером будинку для точного зіставлення' } else { 'Точну адресу не знайдено в адресному реєстрі' } })
  }
}

$coordinateGroups = @{}
foreach ($record in $records) {
  $address = $record.Address
  if (-not $resolved.ContainsKey($address)) { continue }
  $geo = $resolved[$address]
  $key = '{0:F7},{1:F7}' -f $geo.Longitude, $geo.Latitude
  if (-not $coordinateGroups.ContainsKey($key)) {
    $coordinateGroups[$key] = [pscustomobject]@{
      Longitude = $geo.Longitude
      Latitude = $geo.Latitude
      Address = $address
      MatchedAddress = $geo.MatchedAddress
      Items = [System.Collections.Generic.List[object]]::new()
    }
  }
  $coordinateGroups[$key].Items.Add([pscustomobject]@{
    name = $record.Organization
    type = $record.Type
    capacity = $record.Capacity
    ownership = $record.Ownership
    address = $record.Address
  })
}

$features = [System.Collections.Generic.List[object]]::new()
foreach ($group in $coordinateGroups.Values) {
  $features.Add([pscustomobject]@{
    type = 'Feature'
    geometry = [pscustomobject]@{ type = 'Point'; coordinates = @($group.Longitude, $group.Latitude) }
    properties = [pscustomobject]@{
      name = 'Захисні споруди'
      address = $group.Address
      matched_address = $group.MatchedAddress
      shelter_count = $group.Items.Count
      items_json = ConvertTo-Json -InputObject @($group.Items) -Depth 5 -Compress
    }
  })
}

$geoJson = [pscustomobject]@{
  type = 'FeatureCollection'
  source = 'Відкриті дані Полтавської міської ради, набір e80b9412-28d1-4540-a7b7-080085badee8'
  source_url = 'https://odata.rada-poltava.gov.ua/resource/77/8665'
  coordinates_source = 'Адресний реєстр ГІС Полтавської міської ради'
  coordinates_source_url = 'https://mbk.rada-poltava.gov.ua/'
  data_updated = '2026-08-19'
  generated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  total_shelters = $records.Count
  geocoded_shelters = @($records | Where-Object { $resolved.ContainsKey($_.Address) }).Count
  unmatched_shelters = @($records | Where-Object { -not $resolved.ContainsKey($_.Address) }).Count
  features = @($features)
}
$geoJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outputFile -Encoding utf8
$unmatched | Export-Csv -LiteralPath $reportFile -NoTypeInformation -Encoding utf8
if ($apiErrors.Count) { $apiErrors | Export-Csv -LiteralPath $errorFile -NoTypeInformation -Encoding utf8 } elseif (Test-Path -LiteralPath $errorFile) { Remove-Item -LiteralPath $errorFile }
Write-Host "Картографічних точок: $($features.Count); записів з координатами: $($geoJson.geocoded_shelters); без координат: $($geoJson.unmatched_shelters); помилок API: $($apiErrors.Count)"
if ($apiErrors.Count) { Write-Host "Перша помилка API: status=$($apiErrors[0].Status); $($apiErrors[0].Error)" }
Write-Host "GeoJSON: $outputFile"
Write-Host "Звіт непідібраних адрес: $reportFile"
