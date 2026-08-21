$ErrorActionPreference = "Stop"

$envPath = Join-Path (Get-Location) ".env.local"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match "^([^#=\s]+)=(.*)$" -and -not [Environment]::GetEnvironmentVariable($matches[1], "Process")) {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
}

$Base = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_URL", "Process")
$Key = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_PUBLISHABLE_KEY", "Process")
if (-not $Key) { $Key = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_ANON_KEY", "Process") }

if (-not $Base -or -not $Key) {
  throw "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY"
}

function Today-Key([int]$Offset = 0) {
  return (Get-Date).AddDays($Offset).ToString("yyyy-MM-dd")
}

function Invoke-Supabase {
  param(
    [string]$Method = "GET",
    [string]$Path,
    [string]$Token = $Key,
    [object]$Body = $null,
    [hashtable]$ExtraHeaders = @{}
  )

  $headers = @{
    apikey = $Key
    Authorization = "Bearer $Token"
    Accept = "application/json"
  }
  foreach ($entry in $ExtraHeaders.GetEnumerator()) {
    $headers[$entry.Key] = $entry.Value
  }

  try {
    $jsonBody = $null
    if ($null -ne $Body) {
      if ($Body -is [byte[]]) {
        $jsonBody = $Body
      } else {
        $jsonBody = $Body | ConvertTo-Json -Depth 8
      }
    }

    $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$Base$Path" -Headers $headers -Body $jsonBody
    $payload = $response.Content
    try { $payload = $response.Content | ConvertFrom-Json } catch {}
    return [ordered]@{ ok = $true; status = [int]$response.StatusCode; payload = $payload }
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $payload = $_.ErrorDetails.Message
    if (-not $payload) { $payload = $_.Exception.Message }
    try { $payload = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
    return [ordered]@{ ok = $false; status = $status; payload = $payload }
  }
}

function Select-Table {
  param([string]$Table, [string]$Select, [string]$Token = $Key, [string]$Filter = "")
  $query = "select=$([System.Uri]::EscapeDataString($Select))"
  if ($Filter) { $query = "$query&$Filter" }
  return Invoke-Supabase -Path "/rest/v1/$Table`?$query&limit=1" -Token $Token
}

function Sign-In {
  param([string]$Email, [string]$Password)
  return Invoke-Supabase -Method "POST" -Path "/auth/v1/token?grant_type=password" -Body @{ email = $Email; password = $Password } -ExtraHeaders @{ "Content-Type" = "application/json" }
}

function Insert-Row {
  param([string]$Table, [string]$Token, [object]$Body)
  return Invoke-Supabase -Method "POST" -Path "/rest/v1/$Table" -Token $Token -Body $Body -ExtraHeaders @{ "Content-Type" = "application/json"; Prefer = "return=representation" }
}

function Patch-Rows {
  param([string]$Table, [string]$Token, [string]$Filter, [object]$Body)
  return Invoke-Supabase -Method "PATCH" -Path "/rest/v1/$Table`?$Filter" -Token $Token -Body $Body -ExtraHeaders @{ "Content-Type" = "application/json"; Prefer = "return=representation" }
}

function Delete-Rows {
  param([string]$Table, [string]$Token, [string]$Filter)
  return Invoke-Supabase -Method "DELETE" -Path "/rest/v1/$Table`?$Filter" -Token $Token -ExtraHeaders @{ Prefer = "return=representation" }
}

function Ensure-Today-Checkin {
  param([string]$Token, [string]$UserId, [string]$Label)
  $today = Today-Key
  $existing = Invoke-Supabase -Path "/rest/v1/checkins?select=*&user_id=eq.$UserId&date=eq.$today&limit=1" -Token $Token
  if ($existing.ok -and $existing.payload.Count -gt 0) {
    return [ordered]@{ ok = $true; record = $existing.payload[0]; created = $false; raw = $existing }
  }
  $insert = Insert-Row -Table "checkins" -Token $Token -Body @{
    user_id = $UserId
    date = $today
    content = "RLS probe $Label"
    study_minutes = 1
  }
  if ($insert.ok -and $insert.payload.Count -gt 0) {
    return [ordered]@{ ok = $true; record = $insert.payload[0]; created = $true; raw = $insert }
  }
  return [ordered]@{ ok = $false; record = $null; created = $false; raw = $insert }
}

function First-Column {
  param([string]$Token, [string]$UserId)
  $result = Invoke-Supabase -Path "/rest/v1/learning_columns?select=*&user_id=eq.$UserId&order=column_order.asc&limit=1" -Token $Token
  if ($result.ok -and $result.payload.Count -gt 0) { return $result.payload[0] }
  return $null
}

function Upload-Image {
  param([string]$Token, [string]$Path)
  $bytes = [byte[]](82, 73, 70, 70, 26, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 14, 0, 0, 0, 16, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  return Invoke-Supabase -Method "POST" -Path "/storage/v1/object/checkin-images/$Path" -Token $Token -Body $bytes -ExtraHeaders @{ "Content-Type" = "image/webp"; "x-upsert" = "true" }
}

function Download-Image {
  param([string]$Token, [string]$Path)
  return Invoke-Supabase -Method "GET" -Path "/storage/v1/object/checkin-images/$Path" -Token $Token -ExtraHeaders @{ Accept = "image/webp" }
}

function Download-Public-Image {
  param([string]$Path)
  return Invoke-Supabase -Method "GET" -Path "/storage/v1/object/public/checkin-images/$Path" -Token $Key -ExtraHeaders @{ Accept = "image/webp" }
}

function Delete-Images {
  param([string]$Token, [string[]]$Paths)
  return Invoke-Supabase -Method "DELETE" -Path "/storage/v1/object/checkin-images" -Token $Token -Body @{ prefixes = $Paths } -ExtraHeaders @{ "Content-Type" = "application/json" }
}

function Count-Payload($Payload) {
  if ($null -eq $Payload) { return 0 }
  if ($Payload -is [array]) { return $Payload.Count }
  if ($Payload.PSObject.Properties.Name -contains "Count") { return [int]$Payload.Count }
  return 1
}

function First-Payload($Payload) {
  if ($null -eq $Payload) { return $null }
  if ($Payload -is [array]) {
    if ($Payload.Count -gt 0) { return $Payload[0] }
    return $null
  }
  if ($Payload.PSObject.Properties.Name -contains "value") {
    if ($Payload.value.Count -gt 0) { return $Payload.value[0] }
    return $null
  }
  return $Payload
}

$result = [ordered]@{}

$result.tables = [ordered]@{
  profiles = Select-Table -Table "profiles" -Select "id,display_name,avatar_url,role,is_active,created_at"
  checkins = Select-Table -Table "checkins" -Select "id,user_id,date,content,study_minutes,created_at,updated_at"
  learning_columns = Select-Table -Table "learning_columns" -Select "id,user_id,name,column_order,created_at"
  checkin_entries = Select-Table -Table "checkin_entries" -Select "id,checkin_id,column_id,content,created_at,updated_at"
  checkin_images = Select-Table -Table "checkin_images" -Select "id,checkin_id,column_id,storage_path,file_name,content_type,size_bytes,created_at"
  checkin_change_logs = Select-Table -Table "checkin_change_logs" -Select "id,checkin_id,column_id,user_id,date,user_name,column_name,action,summary,created_at"
  old_images_column = Select-Table -Table "checkin_entries" -Select "images"
}

$result.anonWrite = Insert-Row -Table "checkins" -Token $Key -Body @{
  user_id = [guid]::NewGuid().Guid
  date = Today-Key
  content = "anonymous should not write"
  study_minutes = 1
}

$result.bucketAnonProbe = Invoke-Supabase -Path "/storage/v1/bucket/checkin-images"

$emailA = [Environment]::GetEnvironmentVariable("DAILYLOG_TEST_EMAIL", "Process")
$passwordA = [Environment]::GetEnvironmentVariable("DAILYLOG_TEST_PASSWORD", "Process")
$emailB = [Environment]::GetEnvironmentVariable("DAILYLOG_TEST_EMAIL_2", "Process")
$passwordB = [Environment]::GetEnvironmentVariable("DAILYLOG_TEST_PASSWORD_2", "Process")

if ($emailA -and $passwordA) {
  $authA = Sign-In -Email $emailA -Password $passwordA
  $result.authA = [ordered]@{ login = $authA }

  if ($authA.ok) {
    $tokenA = $authA.payload.access_token
    $userA = $authA.payload.user.id
    $todayCheckinA = Ensure-Today-Checkin -Token $tokenA -UserId $userA -Label "A"
    $result.memberA = [ordered]@{
      userId = $userA
      readProfiles = Invoke-Supabase -Path "/rest/v1/profiles?select=id,display_name,role,is_active" -Token $tokenA
      ownTodayCheckin = $todayCheckinA
      pastInsert = Insert-Row -Table "checkins" -Token $tokenA -Body @{ user_id = $userA; date = Today-Key -Offset -1; content = "past should fail"; study_minutes = 1 }
      futureInsert = Insert-Row -Table "checkins" -Token $tokenA -Body @{ user_id = $userA; date = Today-Key -Offset 1; content = "future should fail"; study_minutes = 1 }
    }

    if ($todayCheckinA.ok) {
      $checkinA = $todayCheckinA.record
      $markerA = "A update probe $(Get-Date -Format HHmmss)"
      $updateOwn = Patch-Rows -Table "checkins" -Token $tokenA -Filter "id=eq.$($checkinA.id)" -Body @{ content = $markerA; study_minutes = 2 }
      $backdateOwn = Patch-Rows -Table "checkins" -Token $tokenA -Filter "id=eq.$($checkinA.id)" -Body @{ date = Today-Key -Offset -1 }
      $deleteOwn = Delete-Rows -Table "checkins" -Token $tokenA -Filter "id=eq.$($checkinA.id)"
      $afterDelete = Invoke-Supabase -Path "/rest/v1/checkins?select=id,date,content&id=eq.$($checkinA.id)&limit=1" -Token $tokenA
      $columnA = First-Column -Token $tokenA -UserId $userA
      $imageChecks = [ordered]@{ skipped = $true; reason = "No learning column for member A" }
      if ($columnA) {
        $imagePath = "$userA/$($checkinA.id)/verify-$([guid]::NewGuid().Guid).webp"
        $upload = Upload-Image -Token $tokenA -Path $imagePath
        $publicDownload = Download-Public-Image -Path $imagePath
        $authDownloadOwn = Download-Image -Token $tokenA -Path $imagePath
        $metadata = $null
        $deleteMetadata = $null
        $deleteStorage = $null
        $afterStorageDelete = $null
        if ($upload.ok) {
          $metadata = Insert-Row -Table "checkin_images" -Token $tokenA -Body @{
            checkin_id = $checkinA.id
            column_id = $columnA.id
            storage_path = $imagePath
            file_name = "verify.webp"
            content_type = "image/webp"
            size_bytes = 34
          }
          if ($metadata.ok -and (Count-Payload $metadata.payload) -gt 0) {
            $metadataRow = First-Payload $metadata.payload
            $deleteStorage = Delete-Images -Token $tokenA -Paths @($imagePath)
            $afterStorageDelete = Download-Image -Token $tokenA -Path $imagePath
            $deleteMetadata = Delete-Rows -Table "checkin_images" -Token $tokenA -Filter "id=eq.$($metadataRow.id)"
          } elseif ($upload.ok) {
            $deleteStorage = Delete-Images -Token $tokenA -Paths @($imagePath)
          }
        }
        $imageChecks = [ordered]@{
          skipped = $false
          columnId = $columnA.id
          uploadOwnToday = $upload
          publicDownloadShouldFail = $publicDownload
          downloadOwnAuthenticated = $authDownloadOwn
          insertOwnMetadata = $metadata
          deleteOwnTodayStorage = $deleteStorage
          afterStorageDeleteProbe = $afterStorageDelete
          deleteOwnTodayMetadata = $deleteMetadata
        }
      }
      $result.memberA.ownUpdate = $updateOwn
      $result.memberA.backdateOwnUpdateShouldFail = $backdateOwn
      $result.memberA.deleteCheckinAttempt = $deleteOwn
      $result.memberA.afterDeleteProbe = $afterDelete
      $result.memberA.imageChecks = $imageChecks

      $pastCheckinA = Invoke-Supabase -Path "/rest/v1/checkins?select=*&user_id=eq.$userA&date=lt.$today&order=date.desc&limit=1" -Token $tokenA
      $pastRowA = First-Payload $pastCheckinA.payload
      if ($pastRowA) {
        $pastUpdate = Patch-Rows -Table "checkins" -Token $tokenA -Filter "id=eq.$($pastRowA.id)" -Body @{ content = "history should not change $(Get-Date -Format HHmmss)" }
        $pastAfter = Invoke-Supabase -Path "/rest/v1/checkins?select=id,date,content&id=eq.$($pastRowA.id)&limit=1" -Token $tokenA
        $pastUploadPath = "$userA/$($pastRowA.id)/history-forbidden-$([guid]::NewGuid().Guid).webp"
        $pastUpload = Upload-Image -Token $tokenA -Path $pastUploadPath
        $pastImageRows = Invoke-Supabase -Path "/rest/v1/checkin_images?select=*&checkin_id=eq.$($pastRowA.id)&limit=1" -Token $tokenA
        $pastImageRow = First-Payload $pastImageRows.payload
        $pastImageDelete = $null
        $pastStorageDelete = $null
        if ($pastImageRow) {
          $pastStorageDelete = Delete-Images -Token $tokenA -Paths @($pastImageRow.storage_path)
          $pastImageDelete = Delete-Rows -Table "checkin_images" -Token $tokenA -Filter "id=eq.$($pastImageRow.id)"
        }
        $result.memberA.historyLockProbe = [ordered]@{
          skipped = $false
          pastCheckin = $pastCheckinA
          updatePastCheckinShouldFail = $pastUpdate
          afterPastUpdateProbe = $pastAfter
          uploadToPastStoragePathShouldFail = $pastUpload
          existingPastImage = $pastImageRows
          deletePastStorageShouldFail = $pastStorageDelete
          deletePastMetadataShouldFail = $pastImageDelete
        }
      } else {
        $result.memberA.historyLockProbe = [ordered]@{
          skipped = $true
          reason = "No existing past checkin for member A. Past/future insert and backdate-update checks still ran."
          pastCheckin = $pastCheckinA
        }
      }
    }

    if ($emailB -and $passwordB) {
      $authB = Sign-In -Email $emailB -Password $passwordB
      $result.authB = [ordered]@{ login = $authB }
      if ($authB.ok) {
        $tokenB = $authB.payload.access_token
        $userB = $authB.payload.user.id
        $todayCheckinB = Ensure-Today-Checkin -Token $tokenB -UserId $userB -Label "B"
        $result.memberB = [ordered]@{
          userId = $userB
          ownTodayCheckin = $todayCheckinB
        }
        if ($todayCheckinB.ok) {
          $checkinB = $todayCheckinB.record
          $beforeB = Invoke-Supabase -Path "/rest/v1/checkins?select=id,content&id=eq.$($checkinB.id)&limit=1" -Token $tokenA
          $crossUpdate = Patch-Rows -Table "checkins" -Token $tokenA -Filter "id=eq.$($checkinB.id)" -Body @{ content = "A should not change B $(Get-Date -Format HHmmss)" }
          $afterB = Invoke-Supabase -Path "/rest/v1/checkins?select=id,content&id=eq.$($checkinB.id)&limit=1" -Token $tokenB
          $crossInsert = Insert-Row -Table "checkins" -Token $tokenA -Body @{
            user_id = $userB
            date = Today-Key
            content = "A should not create B"
            study_minutes = 1
          }
          $columnB = First-Column -Token $tokenB -UserId $userB
          $crossImage = [ordered]@{ skipped = $true; reason = "No learning column/checkin for member B" }
          $memberBImage = [ordered]@{ skipped = $true; reason = "No learning column/checkin for member B" }
          if ($columnB) {
            $memberBPath = "$userB/$($checkinB.id)/verify-b-$([guid]::NewGuid().Guid).webp"
            $uploadB = Upload-Image -Token $tokenB -Path $memberBPath
            $metadataB = $null
            $downloadBAsA = $null
            $deleteBAsA = $null
            $afterDeleteBAsA = $null
            $deleteBStorageAsB = $null
            $deleteBMetadataAsB = $null
            if ($uploadB.ok) {
              $metadataB = Insert-Row -Table "checkin_images" -Token $tokenB -Body @{
                checkin_id = $checkinB.id
                column_id = $columnB.id
                storage_path = $memberBPath
                file_name = "verify-b.webp"
                content_type = "image/webp"
                size_bytes = 34
              }
              $downloadBAsA = Download-Image -Token $tokenA -Path $memberBPath
              $deleteBAsA = Delete-Images -Token $tokenA -Paths @($memberBPath)
              $afterDeleteBAsA = Download-Image -Token $tokenB -Path $memberBPath
              $deleteBStorageAsB = Delete-Images -Token $tokenB -Paths @($memberBPath)
              if ($metadataB.ok -and (Count-Payload $metadataB.payload) -gt 0) {
                $metadataBRow = First-Payload $metadataB.payload
                $deleteBMetadataAsB = Delete-Rows -Table "checkin_images" -Token $tokenB -Filter "id=eq.$($metadataBRow.id)"
              }
            }
            $memberBImage = [ordered]@{
              skipped = $false
              uploadOwnToday = $uploadB
              insertOwnMetadata = $metadataB
              downloadOtherMemberImageAsA = $downloadBAsA
              deleteOtherMemberStorageAsAShouldFail = $deleteBAsA
              afterCrossDeleteProbe = $afterDeleteBAsA
              deleteOwnStorageAsB = $deleteBStorageAsB
              deleteOwnMetadataAsB = $deleteBMetadataAsB
            }

            $badPath = "$userB/$($checkinB.id)/forbidden-$([guid]::NewGuid().Guid).webp"
            $crossUpload = Upload-Image -Token $tokenA -Path $badPath
            $crossMetadata = Insert-Row -Table "checkin_images" -Token $tokenA -Body @{
              checkin_id = $checkinB.id
              column_id = $columnB.id
              storage_path = $badPath
              file_name = "forbidden.webp"
              content_type = "image/webp"
              size_bytes = 34
            }
            $crossImage = [ordered]@{
              skipped = $false
              uploadToOtherUserPath = $crossUpload
              insertOtherUserMetadata = $crossMetadata
            }
          }
          $result.crossUser = [ordered]@{
            beforeB = $beforeB
            updateBAsA = $crossUpdate
            afterB = $afterB
            insertBAsA = $crossInsert
            memberBImageLifecycle = $memberBImage
            imageAsAForB = $crossImage
          }
        }
      }
    }
  }
} else {
  $result.memberChecks = [ordered]@{
    skipped = $true
    reason = "Set DAILYLOG_TEST_EMAIL and DAILYLOG_TEST_PASSWORD. Set DAILYLOG_TEST_EMAIL_2 and DAILYLOG_TEST_PASSWORD_2 for cross-user checks."
  }
}

$result | ConvertTo-Json -Depth 20
