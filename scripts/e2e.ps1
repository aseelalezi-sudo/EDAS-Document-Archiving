param([string]$Repo = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$apiDir = Join-Path $Repo 'api'
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'edas-e2e'
New-Item -ItemType Directory -Force $tmp | Out-Null
$pgName = 'edas-pg-e2e'
$kcName = 'edas-kc-e2e'
$apiPort = if ($env:E2E_API_PORT) { [int]$env:E2E_API_PORT } else { 4210 }
$s3Port = if ($env:E2E_S3_PORT) { [int]$env:E2E_S3_PORT } else { 9210 }
$kcPort = if ($env:E2E_KC_PORT) { [int]$env:E2E_KC_PORT } else { 8280 }
$pgPort = if ($env:E2E_PG_PORT) { [int]$env:E2E_PG_PORT } else { 55432 }
$tokenUrl = "http://localhost:$kcPort/realms/edas/protocol/openid-connect/token"
$base = "http://localhost:$apiPort/api/v1"
$apiProc = $null
$s3Proc = $null
$hiddenWindow = @{}
if ($IsWindows) { $hiddenWindow['WindowStyle'] = 'Hidden' }
$prisma = Join-Path $apiDir 'node_modules/.bin/prisma'
if ($IsWindows) { $prisma = "$prisma.cmd" }
$schema = Join-Path $apiDir 'prisma/schema.prisma'

function Log($m) { Write-Output $m }
function Fail($m) { Write-Output "E2E FAIL: $m"; exit 1 }
function Assert($cond, $m) { if (-not $cond) { Fail $m } }

function Login($user, $pass) {
  $body = @{ grant_type = 'password'; client_id = 'edas-cli'; username = $user; password = $pass; scope = 'openid' }
  (Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $body -ContentType 'application/x-www-form-urlencoded').access_token
}
function AuthHeader($token) { @{ Authorization = "Bearer $token" } }

try {
  # --- infra: postgres + keycloak ---
  docker rm -f $pgName $kcName *> $null
  docker run -d --name $pgName -e POSTGRES_DB=edas -e POSTGRES_USER=edas -e POSTGRES_PASSWORD=edas_dev_pw -p "${pgPort}:5432" postgres:15-alpine *> $null
  docker run -d --name $kcName -p "${kcPort}:8080" `
    -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin `
    -e "KC_HOSTNAME=http://localhost:$kcPort" `
    -v "$($repo.Replace('\','/'))/infra/keycloak:/opt/keycloak/data/import:ro" `
    quay.io/keycloak/keycloak:26.0 start-dev --import-realm *> $null

  $pgReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $pgName pg_isready -U edas -d edas *> $null
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep -Seconds 2
  }
  Assert $pgReady 'postgres not ready'
  Log 'postgres: ready'

  $env:DATABASE_URL = "postgresql://edas:edas_dev_pw@localhost:$pgPort/edas?schema=public"
  & $prisma migrate deploy --schema $schema *> $null
  Assert ($LASTEXITCODE -eq 0) 'prisma migrate deploy'
  Log 'prisma migrate deploy: OK'

  $kcReady = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      Invoke-RestMethod "http://localhost:$kcPort/realms/edas/.well-known/openid-configuration" -TimeoutSec 3 | Out-Null
      $kcReady = $true; break
    } catch { Start-Sleep -Seconds 3 }
  }
  Assert $kcReady 'keycloak realm not ready'
  Log 'keycloak: realm ready'

  # --- s3 mock + api ---
  $s3Script = Join-Path $PSScriptRoot 's3mock.cjs'
  $s3Proc = Start-Process -FilePath 'node' -ArgumentList "`"$s3Script`" $s3Port" -PassThru @hiddenWindow -RedirectStandardOutput (Join-Path $tmp 's3-out.log') -RedirectStandardError (Join-Path $tmp 's3-err.log')
  Start-Sleep -Seconds 2

  $env:PORT = "$apiPort"
  $env:KEYCLOAK_ISSUER = "http://localhost:$kcPort/realms/edas"
  $env:KEYCLOAK_AUDIENCE = 'edas-api'
  $env:KEYCLOAK_CLIENT_ID = 'edas-web'
  $env:CORS_ORIGINS = 'http://localhost:5173'
  $env:MINIO_ENDPOINT = 'localhost'
  $env:MINIO_PORT = "$s3Port"
  $env:MINIO_USE_SSL = 'false'
  $env:MINIO_BUCKET = 'edas-documents'
  $env:MINIO_ACCESS_KEY = 'edas_minio'
  $env:MINIO_SECRET_KEY = 'edas_minio_dev_pw'
  $env:THROTTLE_LIMIT = '100000'
  $apiProc = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $apiDir -PassThru @hiddenWindow -RedirectStandardOutput (Join-Path $tmp 'api-out.log') -RedirectStandardError (Join-Path $tmp 'api-err.log')

  $up = $false
  for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-RestMethod "$base/health" -TimeoutSec 3 | Out-Null; $up = $true; break } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $up) { Get-Content (Join-Path $tmp 'api-err.log') -Tail 40; Fail 'api did not start' }
  Log 'api: up'

  # --- auth ---
  $adminTok = Login 'admin' 'admin'
  Assert ($adminTok.Length -gt 20) 'admin token'
  Log "auth: admin token acquired (len=$($adminTok.Length))"

  $me = (Invoke-RestMethod "$base/auth/me" -Headers (AuthHeader $adminTok)).data
  Assert ($me.role -eq 'SYSTEM_ADMIN') "expected SYSTEM_ADMIN, got $($me.role)"
  Log "auth/me: $($me.username) role=$($me.role) isNew=$($me.isNew)"

  # --- organization directory ---
  $orgTree = (Invoke-RestMethod "$base/org/tree" -Headers (AuthHeader $adminTok)).data
  Assert ($null -ne $orgTree.items) 'org tree should return items'
  $orgProjects = (Invoke-RestMethod "$base/org/projects" -Headers (AuthHeader $adminTok)).data
  Assert ($null -ne $orgProjects.items) 'org projects should return items'
  $orgEmployees = (Invoke-RestMethod "$base/org/employees" -Headers (AuthHeader $adminTok)).data
  Assert ($null -ne $orgEmployees.items) 'org employees should return items'
  $directory = (Invoke-RestMethod "$base/users" -Headers (AuthHeader $adminTok)).data
  Assert ($directory.meta.total -ge 1) 'users directory should include the admin'
  $adminUser = $directory.items | Where-Object { $_.id -eq $me.id }
  Assert ($adminUser.username -eq 'admin') 'users directory should expose usernames'
  Log "org.tree: departments=$($orgTree.items.Count) projects=$($orgProjects.items.Count) employees=$($orgEmployees.items.Count) users=$($directory.meta.total)"

  # --- organization write-through ---
  $stamp = (Get-Date).ToString('HHmmssfff')
  $orgDept = (Invoke-RestMethod -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "D-$stamp"; name = 'إدارة الاختبار'; nameEn = 'Test dept'; manager = 'مدير الاختبار' } | ConvertTo-Json)).data
  Assert ($orgDept.code -eq "D-$stamp") 'department create should return the code'
  $orgSection = (Invoke-RestMethod -Method Post -Uri "$base/org/sections" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "S-$stamp"; name = 'قسم الاختبار'; manager = 'رئيس القسم'; departmentId = $orgDept.id } | ConvertTo-Json)).data
  Assert ($orgSection.departmentId -eq $orgDept.id) 'section should belong to the department'
  Assert ($orgDept.manager -eq 'مدير الاختبار') 'department manager should persist'
  Assert ($orgSection.manager -eq 'رئيس القسم') 'section manager should persist'
  $renamedDept = (Invoke-RestMethod -Method Patch -Uri "$base/org/departments/$($orgDept.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ nameEn = 'Renamed dept' } | ConvertTo-Json)).data
  Assert ($renamedDept.nameEn -eq 'Renamed dept') 'department update should persist'
  $orgProject = (Invoke-RestMethod -Method Post -Uri "$base/org/projects" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "P-$stamp"; name = 'مشروع الاختبار'; status = 'active'; startDate = '2026-01-01'; endDate = '2026-12-31'; departmentId = $orgDept.id } | ConvertTo-Json)).data
  Assert ($orgProject.departmentId -eq $orgDept.id) 'project should belong to the department'
  $orgEmployee = (Invoke-RestMethod -Method Post -Uri "$base/org/employees" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ empNo = "E-$stamp"; name = 'موظف الاختبار'; jobTitle = 'محلل'; email = "emp$stamp@edas.gov"; status = 'ACTIVE'; departmentId = $orgDept.id; sectionId = $orgSection.id } | ConvertTo-Json)).data
  Assert ($orgEmployee.sectionId -eq $orgSection.id) 'employee should belong to the section'
  $treeAfter = (Invoke-RestMethod "$base/org/tree" -Headers (AuthHeader $adminTok)).data
  $createdDept = $treeAfter.items | Where-Object { $_.id -eq $orgDept.id }
  Assert ($createdDept.sections[0].id -eq $orgSection.id) 'tree should include the created section'
  $deptInUse = Invoke-WebRequest -Method Delete -Uri "$base/org/departments/$($orgDept.id)" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$deptInUse.StatusCode -eq 409) "deleting a department with sections should be 409 (got $($deptInUse.StatusCode))"
  Invoke-RestMethod -Method Delete -Uri "$base/org/employees/$($orgEmployee.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/org/sections/$($orgSection.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/org/projects/$($orgProject.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/org/departments/$($orgDept.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Log "org.crud: dept+section+project+employee created, updated, 409 in-use, deleted"

  # --- user administration ---
  $userName = "e2e$stamp"
  $userBody = @{ name = 'E2E User'; username = $userName; email = "$userName@edas.gov"; password = 'Passw0rd!'; role = 'EMPLOYEE' } | ConvertTo-Json
  $newUser = (Invoke-RestMethod -Method Post -Uri "$base/users" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $userBody).data
  Assert ($newUser.username -eq $userName) 'created user should round-trip'
  $newTok = Login $userName 'Passw0rd!'
  $newMe = (Invoke-RestMethod "$base/auth/me" -Headers (AuthHeader $newTok)).data
  Assert ($newMe.role -eq 'EMPLOYEE') "new user should default to EMPLOYEE (got $($newMe.role))"
  $lockedUser = (Invoke-RestMethod -Method Patch -Uri "$base/users/$($newUser.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ role = 'AUDITOR'; status = 'LOCKED' } | ConvertTo-Json)).data
  Assert ($lockedUser.role -eq 'AUDITOR' -and $lockedUser.status -eq 'LOCKED') 'user update should apply role and status'
  $lockedCall = Invoke-WebRequest "$base/auth/me" -Headers (AuthHeader $newTok) -SkipHttpErrorCheck
  Assert ([int]$lockedCall.StatusCode -eq 401) "locked user token should be rejected (got $($lockedCall.StatusCode))"
  $null = Invoke-RestMethod -Method Patch -Uri "$base/users/$($newUser.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ status = 'ACTIVE' } | ConvertTo-Json)
  $null = Invoke-RestMethod -Method Post -Uri "$base/users/$($newUser.id)/reset-password" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ password = 'NewPassw0rd!' } | ConvertTo-Json)
  $null = Invoke-RestMethod -Method Patch -Uri "$base/users/$($newUser.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ requireTwoFactor = $true } | ConvertTo-Json)
  $totpBlocked = $false
  try { $null = Login $userName 'NewPassw0rd!' } catch { $totpBlocked = $true }
  Assert $totpBlocked 'pending two-factor enrollment should block password login'
  $revoked = (Invoke-RestMethod -Method Post -Uri "$base/users/$($newUser.id)/revoke-sessions" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}').data
  Assert ($revoked.sessions -eq 0) 'revoking should clear sessions'
  $null = Invoke-RestMethod -Method Delete -Uri "$base/users/$($newUser.id)" -Headers (AuthHeader $adminTok)
  $deletedUser = Invoke-WebRequest -Uri "$base/users/$($newUser.id)" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$deletedUser.StatusCode -eq 404) "deleted user should be gone (got $($deletedUser.StatusCode))"
  Log "users.crud: create/login/update/reset/revoke/delete OK"

  $groupBody = @{ name = "E2E Group $stamp"; nameEn = 'E2E Group'; desc = 'E2E'; scope = 'QA'; type = 'project'; memberIds = @($adminUser.id) } | ConvertTo-Json
  $group = (Invoke-RestMethod -Method Post -Uri "$base/groups" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $groupBody).data
  Assert ($group.memberIds -contains $adminUser.id) 'group should keep its members'
  $updatedGroup = (Invoke-RestMethod -Method Patch -Uri "$base/groups/$($group.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = "E2E Group $stamp b"; memberIds = @() } | ConvertTo-Json)).data
  Assert ($updatedGroup.name -like '* b' -and $updatedGroup.memberIds.Count -eq 0) 'group update should replace members'
  $null = Invoke-RestMethod -Method Delete -Uri "$base/groups/$($group.id)" -Headers (AuthHeader $adminTok)
  $groupsList = (Invoke-RestMethod "$base/groups" -Headers (AuthHeader $adminTok)).data
  Assert (-not ($groupsList.items | Where-Object { $_.id -eq $group.id })) 'deleted group should be gone'
  Log "groups.crud: create/update/delete OK"

  # --- folders ---
  $folder = (Invoke-RestMethod -Method Post -Uri "$base/folders" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'سجل الوثائق'; nameEn = 'Records' } | ConvertTo-Json)).data
  Log "folder.create: $($folder.id) path=$($folder.path)"

  $aclBody = @{ rules = @(@{ principalType = 'ROLE'; principalId = 'employee'; actions = @('VIEW', 'EXPORT') }, @{ principalType = 'USER'; principalId = 'no-such-user'; actions = @('DELETE'); effect = 'DENY' }) } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Put -Uri "$base/folders/$($folder.id)/acl" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $aclBody | Out-Null
  $acl = (Invoke-RestMethod "$base/folders/$($folder.id)/acl" -Headers (AuthHeader $adminTok)).data
  Assert ($acl.Count -eq 2) "acl rules count"
  Assert ($acl[0].effect -eq 'ALLOW') "default acl effect should be ALLOW (got $($acl[0].effect))"
  Assert ($acl[1].effect -eq 'DENY') "acl should store the DENY effect (got $($acl[1].effect))"
  $aclText = ($acl | ForEach-Object { "$($_.principalType)/$($_.principalId)=$($_.effect):$($_.actions -join '|')" }) -join ' , '
  Log "folder.acl: $aclText"
  $badRule = Invoke-WebRequest -Method Put -Uri "$base/folders/$($folder.id)/acl" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ rules = @(@{ principalType = 'ROLE'; principalId = 'employee'; actions = @('VIEW'); effect = 'MAYBE' }) } | ConvertTo-Json -Depth 5) -SkipHttpErrorCheck
  Assert ([int]$badRule.StatusCode -eq 400) "an unknown acl effect should be rejected (got $($badRule.StatusCode))"
  Assert ((ConvertFrom-Json $badRule.Content).error.code -eq 'VALIDATION_ERROR') "acl effect error code (got $((ConvertFrom-Json $badRule.Content).error.code))"
  Log "folder.acl: invalid effect -> HTTP $($badRule.StatusCode)"
  $null = Invoke-RestMethod -Method Put -Uri "$base/folders/$($folder.id)/acl" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ rules = @(@{ principalType = 'ROLE'; principalId = 'employee'; actions = @('VIEW', 'EXPORT') }) } | ConvertTo-Json -Depth 5)

  $tempFolder = (Invoke-RestMethod -Method Post -Uri "$base/folders" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'مجلد مؤقت'; nameEn = 'Temp folder' } | ConvertTo-Json)).data
  $null = Invoke-RestMethod -Method Put -Uri "$base/folders/$($tempFolder.id)/acl" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ rules = @(@{ principalType = 'ROLE'; principalId = 'employee'; actions = @('VIEW') }) } | ConvertTo-Json -Depth 5)
  $folderGone = Invoke-WebRequest -Method Delete -Uri "$base/folders/$($tempFolder.id)" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$folderGone.StatusCode -eq 200) "deleting a folder that carries acl rules should succeed (got $($folderGone.StatusCode))"
  Log "folder.delete: with acl rules -> HTTP $($folderGone.StatusCode)"

  # --- files: presign -> upload -> register ---
  function UploadFile($handle) {
    $presign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = $handle; mimeType = 'application/pdf' } | ConvertTo-Json)).data
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("PDF-$handle-$([guid]::NewGuid())")
    Invoke-WebRequest -Method Put -Uri $presign.url -Body $bytes -ContentType 'application/pdf' | Out-Null
    $sha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($bytes)).Replace('-', '').ToLower()
    $reg = (Invoke-RestMethod -Method Post -Uri "$base/files" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ storageKey = $presign.storageKey; originalName = $handle; mimeType = 'application/pdf'; sizeBytes = $bytes.Length; checksumSha256 = $sha } | ConvertTo-Json)).data
    return $reg
  }
  $file1 = UploadFile 'report-2026.pdf'
  Log "file.register: $($file1.id) size=$($file1.sizeBytes)"
  $file2 = UploadFile 'report-2026-v2.pdf'

  # --- upload hardening ---
  function PostJson($uri, $token, $body) {
    Invoke-WebRequest -Method Post -Uri $uri -Headers (AuthHeader $token) -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 5) -SkipHttpErrorCheck
  }

  $badType = PostJson "$base/files/presign-upload" $adminTok @{ fileName = 'payload.exe'; mimeType = 'application/x-msdownload'; sizeBytes = 1024 }
  Assert ([int]$badType.StatusCode -eq 400) "an unsupported content type should be 400 (got $($badType.StatusCode))"
  Assert ($badType.Content -match 'Unsupported content type') 'presign should name the rejected content type'
  Log "file.presign: application/x-msdownload -> HTTP 400"

  $markupType = PostJson "$base/files/presign-upload" $adminTok @{ fileName = 'page.svg'; mimeType = 'image/svg+xml'; sizeBytes = 1024 }
  Assert ([int]$markupType.StatusCode -eq 400) "svg upload should be refused (got $($markupType.StatusCode))"
  Log "file.presign: image/svg+xml -> HTTP 400"

  $badExt = PostJson "$base/files/presign-upload" $adminTok @{ fileName = 'invoice.docx'; mimeType = 'application/pdf'; sizeBytes = 1024 }
  Assert ([int]$badExt.StatusCode -eq 400) "an extension contradicting the type should be 400 (got $($badExt.StatusCode))"
  Assert ($badExt.Content -match 'does not match') 'presign should reject the mismatched extension'
  Log "file.presign: invoice.docx as application/pdf -> HTTP 400"

  $limitProbe = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = 'probe.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  Assert ($limitProbe.maxBytes -gt 0) "presign should return the upload limit (got $($limitProbe.maxBytes))"
  $oversize = PostJson "$base/files/presign-upload" $adminTok @{ fileName = 'huge.pdf'; mimeType = 'application/pdf'; sizeBytes = ($limitProbe.maxBytes + 1) }
  Assert ([int]$oversize.StatusCode -eq 400) "an oversize presign should be 400 (got $($oversize.StatusCode))"
  Assert ($oversize.Content -match 'upload limit') 'presign should state the byte limit'
  Log "file.presign: $($limitProbe.maxBytes + 1) bytes -> HTTP 400 (limit $($limitProbe.maxBytes))"

  $noIntent = PostJson "$base/files" $adminTok @{ storageKey = 'documents/2026/never-presigned.pdf'; originalName = 'ghost.pdf'; mimeType = 'application/pdf'; sizeBytes = 12; checksumSha256 = ('a' * 64) }
  Assert ([int]$noIntent.StatusCode -eq 403) "registering a key with no presign intent should be 403 (got $($noIntent.StatusCode))"
  Log "file.register: unknown storageKey -> HTTP 403"

  $traversal = PostJson "$base/files" $adminTok @{ storageKey = '../documents/2026/x.pdf'; originalName = 'x.pdf'; mimeType = 'application/pdf'; sizeBytes = 12; checksumSha256 = ('a' * 64) }
  Assert ([int]$traversal.StatusCode -eq 400) "a traversal-shaped storage key should be 400 (got $($traversal.StatusCode))"
  Log "file.register: traversal storageKey -> HTTP 400"

  $badChecksum = PostJson "$base/files" $adminTok @{ storageKey = 'documents/2026/x.pdf'; originalName = 'x.pdf'; mimeType = 'application/pdf'; sizeBytes = 12; checksumSha256 = 'not-a-hash' }
  Assert ([int]$badChecksum.StatusCode -eq 400) "a malformed checksum should be 400 (got $($badChecksum.StatusCode))"
  Log "file.register: malformed checksum -> HTTP 400"

  $replayPresign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = 'twice.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  $replayBytes = [System.Text.Encoding]::UTF8.GetBytes("PDF-twice-$([guid]::NewGuid())")
  Invoke-WebRequest -Method Put -Uri $replayPresign.url -Body $replayBytes -ContentType 'application/pdf' | Out-Null
  $replaySha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($replayBytes)).Replace('-', '').ToLower()
  $replayBody = @{ storageKey = $replayPresign.storageKey; originalName = 'twice.pdf'; mimeType = 'application/pdf'; sizeBytes = $replayBytes.Length; checksumSha256 = $replaySha }
  $replayFirst = PostJson "$base/files" $adminTok $replayBody
  Assert ([int]$replayFirst.StatusCode -lt 300) "the first registration should succeed (got $($replayFirst.StatusCode))"
  $replaySecond = PostJson "$base/files" $adminTok $replayBody
  Assert ([int]$replaySecond.StatusCode -eq 409) "replaying a consumed presign intent should be 409 (got $($replaySecond.StatusCode))"
  Log "file.register: presign intent is single-use -> first $($replayFirst.StatusCode), replay HTTP 409"

  $liarPresign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = 'liar.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  $liarBytes = [System.Text.Encoding]::UTF8.GetBytes("PDF-liar-$([guid]::NewGuid())")
  Invoke-WebRequest -Method Put -Uri $liarPresign.url -Body $liarBytes -ContentType 'application/pdf' | Out-Null
  $liarSha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($liarBytes)).Replace('-', '').ToLower()
  $liarRegister = PostJson "$base/files" $adminTok @{ storageKey = $liarPresign.storageKey; originalName = 'liar.pdf'; mimeType = 'application/pdf'; sizeBytes = 1; checksumSha256 = $liarSha }
  Assert ([int]$liarRegister.StatusCode -eq 400) "a declared size that contradicts the stored object should be 400 (got $($liarRegister.StatusCode))"
  Log "file.register: declared 1 byte vs stored $($liarBytes.Length) -> HTTP 400"

  $ghostPresign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = 'never-uploaded.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  $ghostRegister = PostJson "$base/files" $adminTok @{ storageKey = $ghostPresign.storageKey; originalName = 'never-uploaded.pdf'; mimeType = 'application/pdf'; sizeBytes = 5; checksumSha256 = $liarSha }
  Assert ([int]$ghostRegister.StatusCode -eq 400) "registering a presigned-but-unuploaded object should be 400 (got $($ghostRegister.StatusCode))"
  Assert ($ghostRegister.Content -match 'not found in storage') 'the API should say the object is missing'
  Log "file.register: presigned but nothing uploaded -> HTTP 400"

  $evilName = UploadFile '..\..\المرفق النهائي.pdf'
  Assert ($evilName.originalName -notmatch '[\\/]') "stored name should be a basename (got $($evilName.originalName))"
  Log "file.register: sanitized originalName=$($evilName.originalName)"

  # --- documents ---
  $docBody = @{ title = 'تقرير الأداء السنوي'; titleEn = 'Annual performance report'; folderId = $folder.id; fileId = $file1.id; classification = 'INTERNAL'; tags = @('finance', 'annual') } | ConvertTo-Json
  $doc = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $docBody).data
  Log "document.create: $($doc.docNo) v$($doc.currentVersion) size=$($doc.sizeBytes)"

  $search = (Invoke-RestMethod "$base/documents?q=performance" -Headers (AuthHeader $adminTok)).data
  Assert ($search.meta.total -ge 1) 'search should find the document'
  Log "documents.search: total=$($search.meta.total)"

  $perms = (Invoke-RestMethod "$base/documents/$($doc.id)/permissions" -Headers (AuthHeader $adminTok)).data
  Log "document.permissions: $($perms.actions -join ',')"

  $v2 = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc.id)/versions" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileId = $file2.id; comment = 'v2' } | ConvertTo-Json)).data
  Assert ($v2.version -eq 2) 'version should be 2'
  Log "document.version.add: v$($v2.version)"

  $rec = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc.id)/declare-record" -Headers (AuthHeader $adminTok)).data
  Assert ($rec.isRecord -eq $true) 'declare-record should set isRecord'
  Log "document.declare-record: isRecord=$($rec.isRecord) status=$($rec.status)"

  # --- download (streamed through the API, no storage URL) ---
  $dl = (Invoke-RestMethod "$base/files/$($file1.id)/download" -Headers (AuthHeader $adminTok)).data
  Assert ($dl.url -match '/api/v1/files/.+/content\?ticket=[A-Za-z0-9_-]{40,}$') "download should return an API ticket link (got $($dl.url))"
  Assert ($dl.url -notmatch ':9210|:9000') "download must not expose the storage endpoint (got $($dl.url))"
  Assert ($dl.expiresInSeconds -le 300) 'download tickets should be short-lived'
  $downloaded = Invoke-WebRequest -Uri $dl.url
  Assert ($downloaded.StatusCode -eq 200) 'download should return 200 without a bearer header'
  Assert ($downloaded.Headers['Content-Disposition'] -match '^attachment') 'downloads must be served as an attachment'
  Assert ($downloaded.Headers['Cache-Control'] -match 'no-store') 'downloads must not be cached'
  Log "file.download: HTTP $($downloaded.StatusCode) bytes=$($downloaded.RawContentLength) ttl=$($dl.expiresInSeconds)s"

  $badTicket = Invoke-WebRequest "$base/files/$($file1.id)/content?ticket=deadbeef" -SkipHttpErrorCheck
  Assert ([int]$badTicket.StatusCode -eq 403) "an unknown download ticket should be 403 (got $($badTicket.StatusCode))"
  $foreignTicket = Invoke-WebRequest ($dl.url -replace [regex]::Escape($file1.id), $file2.id) -SkipHttpErrorCheck
  Assert ([int]$foreignTicket.StatusCode -eq 403) "a ticket must not unlock another file (got $($foreignTicket.StatusCode))"
  $downloadRange = Invoke-WebRequest -Uri $dl.url -Headers @{ Range = 'bytes=999999-' } -SkipHttpErrorCheck
  Assert ([int]$downloadRange.StatusCode -eq 416) "an unsatisfiable download range should be 416 (got $($downloadRange.StatusCode))"
  Log "file.download: invalid ticket -> HTTP $($badTicket.StatusCode), foreign file -> HTTP $($foreignTicket.StatusCode), range -> HTTP $($downloadRange.StatusCode)"

  # --- secure preview API ---
  $pdfPresign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ fileName = 'preview.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  $pdfBytes = [System.Text.Encoding]::UTF8.GetBytes("%PDF-1.7`n1 0 obj`n<<>>`nendobj`ntrailer`n<<>>`n%%EOF`n")
  Invoke-WebRequest -Method Put -Uri $pdfPresign.url -Body $pdfBytes -ContentType 'application/pdf' | Out-Null
  $pdfSha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($pdfBytes)).Replace('-', '').ToLower()
  $pdfFile = (Invoke-RestMethod -Method Post -Uri "$base/files" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ storageKey = $pdfPresign.storageKey; originalName = 'preview.pdf'; mimeType = 'application/pdf'; sizeBytes = $pdfBytes.Length; checksumSha256 = $pdfSha } | ConvertTo-Json)).data

  $preview = (Invoke-RestMethod "$base/preview/files/$($pdfFile.id)" -Headers (AuthHeader $adminTok)).data
  Assert ($preview.status -eq 'ready') "a real PDF should be ready to preview (got $($preview.status)/$($preview.reason))"
  Assert ($preview.downloadable -eq $true) 'an account with EXPORT should be told the file is downloadable'
  Log "preview.status: $($preview.status) kind=$($preview.kind) downloadable=$($preview.downloadable)"

  $spoofed = (Invoke-RestMethod "$base/preview/files/$($file1.id)" -Headers (AuthHeader $adminTok)).data
  Assert ($spoofed.status -eq 'unavailable' -and $spoofed.reason -eq 'type_mismatch') "a renamed non-PDF should be blocked (got $($spoofed.status)/$($spoofed.reason))"
  $spoofedContent = Invoke-WebRequest "$base/preview/files/$($file1.id)/content?kind=original" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$spoofedContent.StatusCode -eq 403) "streaming a type-mismatched file should be 403 (got $($spoofedContent.StatusCode))"
  Log "preview.type_mismatch: status=$($spoofed.status) content -> HTTP $($spoofedContent.StatusCode)"

  $anonPreview = Invoke-WebRequest "$base/preview/files/$($pdfFile.id)/content?kind=original" -SkipHttpErrorCheck
  Assert ([int]$anonPreview.StatusCode -eq 401) "an unauthenticated preview should be 401 (got $($anonPreview.StatusCode))"
  Log "preview.content: unauthenticated -> HTTP $($anonPreview.StatusCode)"

  $content = Invoke-WebRequest "$base/preview/files/$($pdfFile.id)/content?kind=original" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$content.StatusCode -eq 200) "authorized preview should be 200 (got $($content.StatusCode))"
  Assert ($content.Headers['Cache-Control'] -match 'no-store') "preview must not be cached (got $($content.Headers['Cache-Control']))"
  Assert ($content.Headers['X-Content-Type-Options'] -eq 'nosniff') 'preview must set nosniff'
  Assert ($content.Headers['Content-Disposition'] -match '^inline') 'preview must be served inline'
  Log "preview.content: HTTP $($content.StatusCode) cache=$($content.Headers['Cache-Control'])"

  $badRange = Invoke-WebRequest "$base/preview/files/$($pdfFile.id)/content?kind=original" -Headers @{ Authorization = "Bearer $adminTok"; Range = 'bytes=999999-' } -SkipHttpErrorCheck
  Assert ([int]$badRange.StatusCode -eq 416) "an unsatisfiable range should be 416 (got $($badRange.StatusCode))"
  Assert ($badRange.Headers['Content-Range'] -match '^bytes \*/\d+$') 'a 416 response should state the object size'
  Log "preview.content: unsatisfiable range -> HTTP $($badRange.StatusCode) $($badRange.Headers['Content-Range'])"

  # --- storage integrity: real totals + explicit truncation flags ---
  $integrity = (Invoke-RestMethod "$base/files/integrity" -Headers (AuthHeader $adminTok)).data
  Assert ($integrity.files.unreferencedCount -ge @($integrity.files.unreferenced).Count) 'unreferenced count should cover every listed row'
  Assert ($integrity.storage.missingObjectsCount -ge @($integrity.storage.missingObjects).Count) 'missing count should cover every listed row'
  Assert ($integrity.storage.orphanObjectsCount -ge @($integrity.storage.orphanObjects).Count) 'orphan count should cover every listed key'
  Assert ($integrity.versions.mismatchCount -ge @($integrity.versions.mismatches).Count) 'mismatch count should cover every listed row'
  Assert ($null -ne $integrity.files.unreferencedTruncated) 'unreferenced truncation flag should be reported'
  Assert ($null -ne $integrity.storage.missingObjectsTruncated) 'missing truncation flag should be reported'
  Assert ($null -ne $integrity.storage.orphanObjectsTruncated) 'orphan truncation flag should be reported'
  Assert ($null -ne $integrity.versions.mismatchesTruncated) 'mismatch truncation flag should be reported'
  Log "files.integrity: files=$($integrity.files.total) unreferenced=$($integrity.files.unreferencedCount) missing=$($integrity.storage.missingObjectsCount) orphan=$($integrity.storage.orphanObjectsCount) mismatches=$($integrity.versions.mismatchCount)"

  # --- audit chain ---
  $audit = (Invoke-RestMethod "$base/audit?entityType=Document" -Headers (AuthHeader $adminTok)).data
  Assert ($audit.meta.total -ge 3) 'audit should contain document events'
  Assert ($audit.items[0].hash.Length -eq 64) 'audit hash present'
  Log "audit: total=$($audit.meta.total) latest=$($audit.items[0].action) prevHash=$($audit.items[0].prevHash.Substring(0,8)).. hash=$($audit.items[0].hash.Substring(0,8)).."

  # --- validation error ---
  $bad = Invoke-WebRequest -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck
  Assert ([int]$bad.StatusCode -eq 400) "expected 400, got $($bad.StatusCode)"
  Assert ($bad.Content -match 'VALIDATION_ERROR') 'validation error envelope'
  Log "validation: HTTP 400 code=VALIDATION_ERROR"

  # --- document lifecycle: checkout / signature / soft delete / restore / purge ---
  $doc3 = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'Lifecycle document'; fileId = $file1.id; classification = 'INTERNAL'; category = 'po' } | ConvertTo-Json)).data
  Log "document.create (lifecycle): $($doc3.id) category=$($doc3.category)"

  $co = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc3.id)/checkout" -Headers (AuthHeader $adminTok)).data
  Assert ($co.checkedOutById -eq $me.id) "checkout should set holder (got $($co.checkedOutById))"
  Log "document.checkout: holder=$($co.checkedOutByName)"

  $ci = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc3.id)/checkin" -Headers (AuthHeader $adminTok)).data
  Assert (-not $ci.checkedOutById) 'checkin should clear the holder'
  Log "document.checkin: holder cleared"

  $sigReq = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc3.id)/signature/request" -Headers (AuthHeader $adminTok)).data
  Assert ($sigReq.signatureStatus -eq 'PENDING') 'signature request should be PENDING'
  $sig = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc3.id)/signature/sign" -Headers (AuthHeader $adminTok)).data
  Assert ($sig.signatureStatus -eq 'SIGNED') 'signature should be SIGNED'
  Assert ($sig.signedByName) 'signature should record signer name'
  Log "document.signature: $($sig.signatureStatus) by=$($sig.signedByName)"

  $renamed = (Invoke-RestMethod -Method Patch -Uri "$base/documents/$($doc3.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'Lifecycle renamed'; category = 'contract' } | ConvertTo-Json)).data
  Assert ($renamed.title -eq 'Lifecycle renamed') 'patch should rename the document'
  Assert ($renamed.category -eq 'contract') 'patch should update the category'
  Log "document.update: $($renamed.title) / $($renamed.category)"

  $soft = (Invoke-RestMethod -Method Delete -Uri "$base/documents/$($doc3.id)" -Headers (AuthHeader $adminTok)).data
  Assert ($soft.deleted -eq $true) 'delete should soft-delete'
  $trash = (Invoke-RestMethod "$base/documents/trash?q=Lifecycle" -Headers (AuthHeader $adminTok)).data
  Assert ($trash.meta.total -ge 1) 'trash should list the deleted document'
  Assert ($trash.items[0].deletedByName) 'trash should expose the deleter name'
  $active = (Invoke-RestMethod "$base/documents?q=Lifecycle" -Headers (AuthHeader $adminTok)).data
  Assert ($active.meta.total -eq 0) 'deleted document must not appear in the library'
  Log "document.trash: total=$($trash.meta.total) deleter=$($trash.items[0].deletedByName)"

  $restored = (Invoke-RestMethod -Method Post -Uri "$base/documents/$($doc3.id)/restore" -Headers (AuthHeader $adminTok)).data
  Assert (-not $restored.deletedAt) 'restore should clear deletedAt'
  $afterRestore = (Invoke-RestMethod "$base/documents?q=Lifecycle" -Headers (AuthHeader $adminTok)).data
  Assert ($afterRestore.meta.total -ge 1) 'restored document should return to the library'
  Log "document.restore: $($restored.docNo) deletedAt cleared"

  Invoke-RestMethod -Method Delete -Uri "$base/documents/$($doc3.id)" -Headers (AuthHeader $adminTok) | Out-Null
  $purged = (Invoke-RestMethod -Method Delete -Uri "$base/documents/$($doc3.id)/purge" -Headers (AuthHeader $adminTok)).data
  Assert ($purged.purged -eq $true) 'purge should hard-delete'
  $gone = Invoke-WebRequest -Uri "$base/documents/$($doc3.id)" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$gone.StatusCode -eq 404) "purged document should 404 (got $($gone.StatusCode))"
  Log "document.purge: HTTP $($gone.StatusCode)"

  # --- RBAC with employee ---
  $empTok = Login 'employee' 'employee'
  $empMe = (Invoke-RestMethod "$base/auth/me" -Headers (AuthHeader $empTok)).data
  Log "auth/me (employee): role=$($empMe.role)"

  $unassignedRead = Invoke-WebRequest -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$unassignedRead.StatusCode -eq 403) "employee without a department should be rejected (got $($unassignedRead.StatusCode))"
  Log "rbac: employee without department -> HTTP $($unassignedRead.StatusCode)"

  $rbacStamp = (Get-Date).ToString('HHmmssfff')
  $rbacDept = (Invoke-RestMethod -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "RB-$rbacStamp"; name = 'إدارة الصلاحيات'; nameEn = 'RBAC dept' } | ConvertTo-Json)).data
  $otherDept = (Invoke-RestMethod -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "RC-$rbacStamp"; name = 'إدارة أخرى'; nameEn = 'Other dept' } | ConvertTo-Json)).data
  $rbacFolder = (Invoke-RestMethod -Method Post -Uri "$base/folders" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'مجلد الصلاحيات'; nameEn = 'RBAC folder'; scope = 'DEPARTMENT'; departmentId = $rbacDept.id } | ConvertTo-Json)).data
  $null = (Invoke-RestMethod -Method Patch -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ folderId = $rbacFolder.id } | ConvertTo-Json)).data
  Log "rbac: document moved into department folder $($rbacFolder.nameEn)"

  $null = (Invoke-RestMethod -Method Patch -Uri "$base/users/$($empMe.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ departmentId = $otherDept.id } | ConvertTo-Json)).data
  $foreignRead = Invoke-WebRequest -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$foreignRead.StatusCode -eq 403) "employee from another department should be out of scope (got $($foreignRead.StatusCode))"
  Log "rbac: cross-department VIEW -> HTTP $($foreignRead.StatusCode)"

  $null = (Invoke-RestMethod -Method Patch -Uri "$base/users/$($empMe.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ departmentId = $rbacDept.id } | ConvertTo-Json)).data
  $scopedDocs = (Invoke-RestMethod "$base/documents?pageSize=100" -Headers (AuthHeader $empTok)).data
  Assert ($scopedDocs.meta.total -eq 1) "employee should list only the department document (got $($scopedDocs.meta.total))"
  Log "rbac: scoped list total=$($scopedDocs.meta.total)"

  $empSummary = (Invoke-RestMethod "$base/reports/summary" -Headers (AuthHeader $empTok)).data
  Assert ($empSummary.documents.total -eq $scopedDocs.meta.total) "the dashboard summary should match the scoped list (got $($empSummary.documents.total) vs $($scopedDocs.meta.total))"
  Log "reports.summary (employee): documents=$($empSummary.documents.total) byStatus=$($empSummary.documents.byStatus | ConvertTo-Json -Compress)"

  $empRead = Invoke-WebRequest -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$empRead.StatusCode -eq 200) "employee should be able to VIEW (got $($empRead.StatusCode))"
  Log "rbac: employee VIEW document -> HTTP $($empRead.StatusCode)"

  $empEditBefore = Invoke-WebRequest -Method Patch -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -ContentType 'application/json' -Body (@{ title = 'تعديل مسموح' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$empEditBefore.StatusCode -eq 200) "employee EDIT should pass before the deny rule (got $($empEditBefore.StatusCode))"
  Log "rbac: employee EDIT before deny -> HTTP $($empEditBefore.StatusCode)"

  $empAcl = Invoke-WebRequest -Method Put -Uri "$base/folders/$($rbacFolder.id)/acl" -Headers (AuthHeader $empTok) -ContentType 'application/json' -Body (@{ rules = @(@{ principalType = 'ROLE'; principalId = 'employee'; actions = @('VIEW', 'DELETE') }) } | ConvertTo-Json -Depth 5) -SkipHttpErrorCheck
  Assert ([int]$empAcl.StatusCode -eq 403) "employee EDIT must not manage ACLs (got $($empAcl.StatusCode))"
  Assert ((ConvertFrom-Json $empAcl.Content).error.message -match 'MANAGE_ACL') "employee ACL rejection should name MANAGE_ACL (got $((ConvertFrom-Json $empAcl.Content).error.message))"
  Log "rbac: employee ACL write -> HTTP $($empAcl.StatusCode)"

  $denyBody = @{ rules = @(@{ principalType = 'USER'; principalId = $empMe.id; actions = @('EDIT'); effect = 'DENY' }) } | ConvertTo-Json -Depth 5
  $deniedRule = (Invoke-RestMethod -Method Put -Uri "$base/folders/$($rbacFolder.id)/acl" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $denyBody).data
  Assert ($deniedRule[0].effect -eq 'DENY') "folder rule should keep the DENY effect (got $($deniedRule[0].effect))"
  $empEditAfter = Invoke-WebRequest -Method Patch -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -ContentType 'application/json' -Body (@{ title = 'تعديل مرفوض' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$empEditAfter.StatusCode -eq 403) "folder DENY EDIT should block the employee (got $($empEditAfter.StatusCode))"
  Log "rbac: employee EDIT after deny -> HTTP $($empEditAfter.StatusCode) ($((ConvertFrom-Json $empEditAfter.Content).error.message))"

  $empReadAfterDeny = Invoke-WebRequest -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$empReadAfterDeny.StatusCode -eq 200) "VIEW should survive a rule that only denies EDIT (got $($empReadAfterDeny.StatusCode))"
  Log "rbac: employee VIEW after deny -> HTTP $($empReadAfterDeny.StatusCode)"

  $empDelete = Invoke-WebRequest -Method Delete -Uri "$base/documents/$($doc.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$empDelete.StatusCode -eq 403) "employee DELETE should be 403 (got $($empDelete.StatusCode))"
  Log "rbac: employee DELETE document -> HTTP $($empDelete.StatusCode) ($($empDelete.Content))"

  # --- approvals ---
  $mgrTok = Login 'manager' 'manager'
  $mgrMe = (Invoke-RestMethod "$base/auth/me" -Headers (AuthHeader $mgrTok)).data
  $unassignedList = Invoke-WebRequest -Uri "$base/documents?pageSize=10" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$unassignedList.StatusCode -eq 403) "a department role without a department should be rejected (got $($unassignedList.StatusCode))"
  Log "rbac: manager without department -> HTTP $($unassignedList.StatusCode)"
  $mgrStamp = (Get-Date).ToString('HHmmssfff')
  $mgrDept = (Invoke-RestMethod -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ code = "MD-$mgrStamp"; name = 'إدارة الاعتماد'; nameEn = 'Approval dept' } | ConvertTo-Json)).data
  $null = (Invoke-RestMethod -Method Patch -Uri "$base/users/$($mgrMe.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ departmentId = $mgrDept.id } | ConvertTo-Json)).data
  Log "rbac: manager account $($mgrMe.id) assigned to department $($mgrDept.nameEn)"

  $doc2 = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'مسودة للاعتماد'; titleEn = 'Draft for approval'; fileId = $file2.id; classification = 'INTERNAL'; departmentId = $mgrDept.id } | ConvertTo-Json)).data
  Log "document.create (draft): $($doc2.docNo) status=$($doc2.status)"

  # --- file access across accounts and departments ---
  function UploadAs($token, $handle) {
    $presign = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $token) -ContentType 'application/json' -Body (@{ fileName = $handle; mimeType = 'application/pdf' } | ConvertTo-Json)).data
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("PDF-$handle-$([guid]::NewGuid())")
    Invoke-WebRequest -Method Put -Uri $presign.url -Body $bytes -ContentType 'application/pdf' | Out-Null
    $sha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($bytes)).Replace('-', '').ToLower()
    $reg = (Invoke-RestMethod -Method Post -Uri "$base/files" -Headers (AuthHeader $token) -ContentType 'application/json' -Body (@{ storageKey = $presign.storageKey; originalName = $handle; mimeType = 'application/pdf'; sizeBytes = $bytes.Length; checksumSha256 = $sha } | ConvertTo-Json)).data
    return @{ file = $reg; presign = $presign; bytes = $bytes; sha = $sha }
  }

  $mgrUpload = UploadAs $mgrTok 'manager-only.pdf'
  $mgrFile = $mgrUpload.file
  Log "file.register (manager): $($mgrFile.id) size=$($mgrFile.sizeBytes)"

  $otherIntent = (Invoke-RestMethod -Method Post -Uri "$base/files/presign-upload" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ fileName = 'manager-second.pdf'; mimeType = 'application/pdf' } | ConvertTo-Json)).data
  $stealRegister = PostJson "$base/files" $empTok @{ storageKey = $otherIntent.storageKey; originalName = 'stolen.pdf'; mimeType = 'application/pdf'; sizeBytes = 12; checksumSha256 = ('a' * 64) }
  Assert ([int]$stealRegister.StatusCode -eq 403) "another account should not register a foreign presign intent (got $($stealRegister.StatusCode))"
  Log "file.register: foreign intent -> HTTP 403"

  $otherBytes = [System.Text.Encoding]::UTF8.GetBytes("PDF-second-$([guid]::NewGuid())")
  Invoke-WebRequest -Method Put -Uri $otherIntent.url -Body $otherBytes -ContentType 'application/pdf' | Out-Null
  $otherSha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash($otherBytes)).Replace('-', '').ToLower()
  $looseFile = (Invoke-RestMethod -Method Post -Uri "$base/files" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ storageKey = $otherIntent.storageKey; originalName = 'manager-second.pdf'; mimeType = 'application/pdf'; sizeBytes = $otherBytes.Length; checksumSha256 = $otherSha } | ConvertTo-Json)).data

  $looseDownload = Invoke-WebRequest -Uri "$base/files/$($looseFile.id)/download" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$looseDownload.StatusCode -eq 403) "an upload that is not attached to any document should stay private to its uploader (got $($looseDownload.StatusCode))"
  Log "file.download: unattached upload from another account -> HTTP 403"

  $looseOwn = Invoke-WebRequest -Uri "$base/files/$($looseFile.id)/download" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$looseOwn.StatusCode -eq 200) "the uploader should still reach their own unattached upload (got $($looseOwn.StatusCode))"
  Log "file.download: unattached upload by its uploader -> HTTP 200"

  $mgrDoc = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ title = 'ملف إدارة الاعتماد'; titleEn = 'Approval dept file'; fileId = $mgrFile.id; classification = 'INTERNAL' } | ConvertTo-Json)).data
  Log "document.create (manager upload): $($mgrDoc.docNo)"

  $foreignDownload = Invoke-WebRequest -Uri "$base/files/$($mgrFile.id)/download" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$foreignDownload.StatusCode -eq 403) "a document in another department must not leak its file (got $($foreignDownload.StatusCode))"
  Log "file.download: cross-department document file -> HTTP 403"

  $adminDownload = Invoke-WebRequest -Uri "$base/files/$($mgrFile.id)/download" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$adminDownload.StatusCode -eq 200) "an auditor-role administrator should read the file (got $($adminDownload.StatusCode))"
  Log "file.download: system administrator -> HTTP 200"

  $foreignAttach = PostJson "$base/documents" $empTok @{ title = 'ملف مسروق'; titleEn = 'Borrowed file'; fileId = $mgrFile.id; classification = 'INTERNAL' }
  Assert ([int]$foreignAttach.StatusCode -eq 403) "attaching a file uploaded by another account should be 403 (got $($foreignAttach.StatusCode))"
  Assert ($foreignAttach.Content -match 'uploaded a file') 'the API should explain the attachment rule'
  Log "document.create: foreign fileId -> HTTP 403"

  $empSummaryForeign = (Invoke-RestMethod "$base/reports/summary" -Headers (AuthHeader $empTok)).data
  Assert ($empSummaryForeign.documents.total -eq $empSummary.documents.total) "a document in another department must not enter the employee summary (got $($empSummaryForeign.documents.total))"
  $adminSummaryForeign = (Invoke-RestMethod "$base/reports/summary" -Headers (AuthHeader $adminTok)).data
  Assert ($adminSummaryForeign.documents.total -gt $empSummaryForeign.documents.total) "admin should still count every department (got $($adminSummaryForeign.documents.total))"
  Log "reports.summary: employee=$($empSummaryForeign.documents.total) admin=$($adminSummaryForeign.documents.total) (foreign document excluded)"

  $chainBody = @{ name = 'سلسلة اعتماد المدير'; description = 'manager review'; steps = @(@{ role = 'DEPT_MANAGER'; name = 'مراجعة المدير' }) } | ConvertTo-Json -Depth 5
  $chain = (Invoke-RestMethod -Method Post -Uri "$base/approval-chains" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body $chainBody).data
  Assert ($chain.steps.Count -eq 1) 'chain should have 1 step'
  Log "approval-chain.create: $($chain.id) steps=$($chain.steps.Count)"

  $chains = (Invoke-RestMethod "$base/approval-chains" -Headers (AuthHeader $adminTok)).data
  $listed = $chains.items | Where-Object { $_.id -eq $chain.id } | Select-Object -First 1
  Assert ($listed) 'approval chain should be listed'
  Assert ($listed.steps[0].role -eq 'DEPT_MANAGER') 'chain step role should round-trip'
  $renamed = (Invoke-RestMethod -Method Patch -Uri "$base/approval-chains/$($chain.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'Chain renamed'; isActive = $false } | ConvertTo-Json)).data
  Assert ($renamed.name -eq 'Chain renamed' -and $renamed.isActive -eq $false) 'chain update should apply name and isActive'
  $null = Invoke-RestMethod -Method Patch -Uri "$base/approval-chains/$($chain.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ isActive = $true } | ConvertTo-Json)
  Log "approval-chain.update: name=$($renamed.name) active=$($renamed.isActive) listed=$($chains.meta.total)"

  $twoSteps = (Invoke-RestMethod -Method Patch -Uri "$base/approval-chains/$($chain.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ steps = @(@{ role = 'DEPT_MANAGER'; name = 'M1' }, @{ role = 'ARCHIVIST'; name = 'A1' }) } | ConvertTo-Json -Depth 5)).data
  Assert ($twoSteps.steps.Count -eq 2) 'chain steps should be replaced'
  $oneStep = (Invoke-RestMethod -Method Patch -Uri "$base/approval-chains/$($chain.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ steps = @(@{ role = 'DEPT_MANAGER'; name = 'M1' }) } | ConvertTo-Json -Depth 5)).data
  Assert ($oneStep.steps.Count -eq 1) 'chain steps should be reducible'
  Log 'approval-chain.steps: 2 -> 1'

  $sub = (Invoke-RestMethod -Method Post -Uri "$base/approvals" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ documentId = $doc2.id; chainId = $chain.id } | ConvertTo-Json)).data
  Assert ($sub.status -eq 'PENDING') 'approval should be pending'
  Log "approval.submit: status=$($sub.status) currentStep=$($sub.currentStep.role)"
  $stepsBlocked = Invoke-WebRequest -Method Patch -Uri "$base/approval-chains/$($chain.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ steps = @(@{ role = 'ARCHIVIST' }) } | ConvertTo-Json -Depth 5) -SkipHttpErrorCheck
  Assert ([int]$stepsBlocked.StatusCode -eq 409) "editing steps with pending approvals should be 409 (got $($stepsBlocked.StatusCode))"
  Log "approval-chain.steps: pending guard HTTP $($stepsBlocked.StatusCode)"

  $empDecide = Invoke-WebRequest -Method Post -Uri "$base/approvals/$($sub.id)/decide" -Headers (AuthHeader $empTok) -ContentType 'application/json' -Body (@{ decision = 'APPROVED' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$empDecide.StatusCode -eq 403) "employee decide should be 403 (got $($empDecide.StatusCode))"
  Log "approval.rbac: employee decide -> HTTP $($empDecide.StatusCode)"

  $pendingApprovals = (Invoke-RestMethod "$base/approvals/pending" -Headers (AuthHeader $adminTok)).data
  Assert ($pendingApprovals.meta.total -ge 1) 'admin should see the pending approval'
  Log "approvals.pending: total=$($pendingApprovals.meta.total)"

  $mgrPending = (Invoke-RestMethod "$base/approvals/pending" -Headers (AuthHeader $mgrTok)).data
  Assert ($mgrPending.meta.total -ge 1) 'the department manager should see the approval pending in their department'
  Log "approvals.pending (manager): total=$($mgrPending.meta.total)"

  $foreignApproval = Invoke-WebRequest -Uri "$base/approvals/$($sub.id)" -Headers (AuthHeader $empTok) -SkipHttpErrorCheck
  Assert ([int]$foreignApproval.StatusCode -eq 403) "another department should not read the approval (got $($foreignApproval.StatusCode))"
  Log "approval.rbac: cross-department approval GET -> HTTP $($foreignApproval.StatusCode)"

  $decided = (Invoke-RestMethod -Method Post -Uri "$base/approvals/$($sub.id)/decide" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ decision = 'APPROVED'; comment = 'موافق' } | ConvertTo-Json)).data
  Assert ($decided.status -eq 'APPROVED') 'approval should be approved'
  $docAfterApproval = (Invoke-RestMethod "$base/documents/$($doc2.id)" -Headers (AuthHeader $adminTok)).data
  Assert ($docAfterApproval.status -eq 'APPROVED') 'document should be APPROVED'
  Log "approval.decide: approval=$($decided.status) document=$($docAfterApproval.status)"

  # --- retention ---
  $policy = (Invoke-RestMethod -Method Post -Uri "$base/retention/policies" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'سياسة أرشفة 12 شهراً'; retentionMonths = 12; action = 'ARCHIVE'; category = 'إداري' } | ConvertTo-Json)).data
  Log "retention.policy.create: $($policy.id) action=$($policy.action)"

  $item = (Invoke-RestMethod -Method Post -Uri "$base/retention/items" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ documentId = $doc2.id; policyId = $policy.id } | ConvertTo-Json)).data
  Assert ($item.dueAt) 'retention item should have a due date'
  Log "retention.schedule: due=$($item.dueAt) status=$($item.status)"

  $retentionItems = (Invoke-RestMethod "$base/retention/items?dueOnly=false" -Headers (AuthHeader $adminTok)).data
  Assert ($retentionItems.meta.total -ge 1) 'retention list should include the item'
  Assert ($retentionItems.items[0].document.owner.name) 'retention item should expose the owner name'
  Log "retention.items: total=$($retentionItems.meta.total) owner=$($retentionItems.items[0].document.owner.name)"

  $policies = (Invoke-RestMethod "$base/retention/policies" -Headers (AuthHeader $adminTok)).data
  $policyFound = $policies.items | Where-Object { $_.id -eq $policy.id } | Select-Object -First 1
  Assert ($policyFound) 'retention policies should list the created policy'
  Assert ($policyFound._count.items -ge 1) 'retention policy should count its items'
  Log "retention.policies: total=$($policies.meta.total) items=$($policyFound._count.items)"

  $toggled = (Invoke-RestMethod -Method Patch -Uri "$base/retention/policies/$($policy.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ isActive = $false } | ConvertTo-Json)).data
  Assert ($toggled.isActive -eq $false) 'policy toggle should deactivate'
  $null = Invoke-RestMethod -Method Patch -Uri "$base/retention/policies/$($policy.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ isActive = $true } | ConvertTo-Json)
  Log "retention.policy.update: isActive=$($toggled.isActive)"

  $tempPolicy = (Invoke-RestMethod -Method Post -Uri "$base/retention/policies" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'TEMP policy'; retentionMonths = 6; action = 'REVIEW' } | ConvertTo-Json)).data
  $inUse = Invoke-WebRequest -Method Delete -Uri "$base/retention/policies/$($policy.id)" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$inUse.StatusCode -eq 409) "deleting an in-use policy should be 409 (got $($inUse.StatusCode))"
  $null = Invoke-RestMethod -Method Delete -Uri "$base/retention/policies/$($tempPolicy.id)" -Headers (AuthHeader $adminTok)
  Assert ($true) 'temporary policy deleted'
  Log "retention.policy.delete: in-use=409 temp=deleted"

  $extended = (Invoke-RestMethod -Method Patch -Uri "$base/retention/items/$($item.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ dueAt = '2028-01-01T00:00:00.000Z' } | ConvertTo-Json)).data
  Assert ($extended.dueAt.ToUniversalTime().ToString('yyyy-MM-dd') -eq '2028-01-01') 'extend should update the due date'
  Log "retention.extend: due=$($extended.dueAt)"

  $executed = (Invoke-RestMethod -Method Post -Uri "$base/retention/items/$($item.id)/execute" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}').data
  Assert ($executed.item.status -eq 'executed') 'retention item should be executed'
  Assert ($executed.document.status -eq 'ARCHIVED') 'document should be ARCHIVED'
  Log "retention.execute: item=$($executed.item.status) document=$($executed.document.status)"

  # --- legal holds ---
  $hold = (Invoke-RestMethod -Method Post -Uri "$base/legal-holds" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ caseNo = 'CASE-2026-001'; reason = 'نزاع قضائي'; documentIds = @($doc2.id) } | ConvertTo-Json -Depth 5)).data
  Assert ($hold.documents.Count -eq 1) 'hold should have 1 document'
  Assert ($hold.status -eq 'ACTIVE') 'hold should be active'
  Assert ($hold.placedByName) 'hold should expose the placer name'
  Log "legal-hold.create: $($hold.caseNo) docs=$($hold.documents.Count) status=$($hold.status) placedBy=$($hold.placedByName)"

  $destroyPolicy = (Invoke-RestMethod -Method Post -Uri "$base/retention/policies" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'سياسة إتلاف'; retentionMonths = 6; action = 'DESTROY' } | ConvertTo-Json)).data
  $destroyItem = (Invoke-RestMethod -Method Post -Uri "$base/retention/items" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ documentId = $doc2.id; policyId = $destroyPolicy.id } | ConvertTo-Json)).data
  $blocked = Invoke-WebRequest -Method Post -Uri "$base/retention/items/$($destroyItem.id)/execute" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck
  Assert ([int]$blocked.StatusCode -eq 409) "destroy under hold should be 409 (got $($blocked.StatusCode))"
  Log "legal-hold.blocks-destroy: HTTP $($blocked.StatusCode)"

  $released = (Invoke-RestMethod -Method Post -Uri "$base/legal-holds/$($hold.id)/release" -Headers (AuthHeader $adminTok)).data
  Assert ($released.status -eq 'RELEASED') 'hold should be released'
  Log "legal-hold.release: status=$($released.status)"

  $destroyed = (Invoke-RestMethod -Method Post -Uri "$base/retention/items/$($destroyItem.id)/execute" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}').data
  Assert ($destroyed.document.status -eq 'DISPOSED') 'document should be DISPOSED'
  Log "retention.destroy: document=$($destroyed.document.status)"

  $holds = (Invoke-RestMethod "$base/legal-holds?status=RELEASED" -Headers (AuthHeader $adminTok)).data
  Assert ($holds.meta.total -ge 1) 'released holds should be listed'
  Log "legal-holds.list: total=$($holds.meta.total)"

  # --- notifications ---
  $note = (Invoke-RestMethod -Method Post -Uri "$base/notifications" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ userId = $me.id; title = 'اختبار إشعار'; message = 'رسالة اختبار'; level = 'INFO' } | ConvertTo-Json)).data
  Log "notification.create: $($note.id) level=$($note.level)"

  $notes = (Invoke-RestMethod "$base/notifications?unreadOnly=true" -Headers (AuthHeader $adminTok)).data
  Assert ($notes.meta.total -ge 1) 'notifications should list the unread item'
  Log "notifications.list: total=$($notes.meta.total) unread=$($notes.meta.unread)"

  $read = (Invoke-RestMethod -Method Post -Uri "$base/notifications/$($note.id)/read" -Headers (AuthHeader $adminTok)).data
  Assert ($read.read -eq $true) 'notification should be marked read'
  Log "notification.read: read=$($read.read)"

  $globalNote = (Invoke-RestMethod -Method Post -Uri "$base/notifications" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'إشعار عام'; message = 'لكل المستخدمين'; level = 'WARNING' } | ConvertTo-Json)).data
  $globalRead = (Invoke-RestMethod -Method Post -Uri "$base/notifications/$($globalNote.id)/read" -Headers (AuthHeader $adminTok)).data
  Assert ($globalRead.read -eq $true) 'global notification should be markable as read'
  $readAll = (Invoke-RestMethod -Method Post -Uri "$base/notifications/read-all" -Headers (AuthHeader $adminTok)).data
  Assert ($readAll.updated -ge 1) 'read-all should update unread notifications'
  Log "notification.read-all: updated=$($readAll.updated) global=$($globalRead.read)"

  # --- tasks ---
  $task = (Invoke-RestMethod -Method Post -Uri "$base/tasks" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'مراجعة الوثيقة'; description = 'مهمة اختبار'; documentId = $doc2.id; priority = 'high' } | ConvertTo-Json)).data
  Assert ($task.status -eq 'open') 'task should be open'
  Log "task.create: $($task.id) status=$($task.status)"

  $tasks = (Invoke-RestMethod "$base/tasks" -Headers (AuthHeader $adminTok)).data
  Assert ($tasks.meta.total -ge 1) 'tasks list should include the task'
  Log "tasks.list: total=$($tasks.meta.total)"

  $completed = (Invoke-RestMethod -Method Post -Uri "$base/tasks/$($task.id)/complete" -Headers (AuthHeader $adminTok)).data
  Assert ($completed.status -eq 'completed') 'task should be completed'
  Log "task.complete: status=$($completed.status)"

  $changes = (Invoke-RestMethod -Method Patch -Uri "$base/tasks/$($task.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ status = 'changes_requested'; description = 'clarify scope' } | ConvertTo-Json)).data
  Assert ($changes.status -eq 'changes_requested') 'task should accept changes_requested'
  $reassignedTask = (Invoke-RestMethod -Method Patch -Uri "$base/tasks/$($task.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ status = 'open'; assigneeId = $me.id } | ConvertTo-Json)).data
  Assert ($reassignedTask.assigneeId -eq $me.id) 'task should reassign to the given user'
  Log "task.update: status=$($changes.status) assignee=$($reassignedTask.assigneeId)"

  # --- report templates ---
  $templates = (Invoke-RestMethod "$base/report-templates" -Headers (AuthHeader $adminTok)).data
  Assert ($templates.meta.total -ge 8) "report template catalog should be seeded (got $($templates.meta.total))"
  $fav = (Invoke-RestMethod -Method Patch -Uri "$base/report-templates/rpt-3/favorite" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ favorite = $true } | ConvertTo-Json)).data
  Assert ($fav.favorite -eq $true) 'favorite should persist'
  $templates = (Invoke-RestMethod "$base/report-templates" -Headers (AuthHeader $adminTok)).data
  Assert (($templates.items | Where-Object { $_.id -eq 'rpt-3' }).favorite) 'favorite should survive a reload'
  Log "report-templates: total=$($templates.meta.total) favorite=rpt-3"

  # --- role policies ---
  $roles = (Invoke-RestMethod "$base/roles" -Headers (AuthHeader $adminTok)).data
  Assert ($roles.meta.total -eq 6) "roles should expose all built-in roles (got $($roles.meta.total))"
  $auditorRole = $roles.items | Where-Object { $_.role -eq 'AUDITOR' }
  Assert (($auditorRole.actions -contains 'VIEW') -and -not ($auditorRole.actions -contains 'APPROVE')) 'auditor defaults should come from shared'
  $updatedRole = (Invoke-RestMethod -Method Patch -Uri "$base/roles/AUDITOR" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ actions = @('VIEW', 'EXPORT', 'APPROVE') } | ConvertTo-Json)).data
  Assert (($updatedRole.customized -eq $true) -and ($updatedRole.actions -contains 'APPROVE')) 'role policy should persist custom actions'
  $roles = (Invoke-RestMethod "$base/roles" -Headers (AuthHeader $adminTok)).data
  Assert (((($roles.items | Where-Object { $_.role -eq 'AUDITOR' }).actions) -contains 'APPROVE')) 'custom role policy should survive a reload'
  $resetRole = (Invoke-RestMethod -Method Delete -Uri "$base/roles/AUDITOR" -Headers (AuthHeader $adminTok)).data
  Assert (($resetRole.customized -eq $false) -and -not ($resetRole.actions -contains 'APPROVE')) 'role policy reset should restore shared defaults'
  Log "roles.policy: total=$($roles.meta.total) update+reset OK"

  # --- notification templates ---
  $notifTemplates = (Invoke-RestMethod "$base/notification-templates" -Headers (AuthHeader $adminTok)).data
  Assert ($notifTemplates.meta.total -eq 6) "notification templates should be seeded (got $($notifTemplates.meta.total))"
  $ntUpdate = (Invoke-RestMethod -Method Patch -Uri "$base/notification-templates/nt-1" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ subjectEn = 'Updated subject' } | ConvertTo-Json)).data
  Assert ($ntUpdate.subjectEn -eq 'Updated subject') 'notification template should update'
  $ntReset = (Invoke-RestMethod -Method Post -Uri "$base/notification-templates/nt-1/reset" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body '{}').data
  Assert ($ntReset.subjectEn -eq 'You have a new approval request') 'notification template reset should restore the seed'
  $ntNew = (Invoke-RestMethod -Method Post -Uri "$base/notification-templates" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'tpl'; nameEn = 'Custom template'; subject = 'نص'; subjectEn = 'Custom subject'; body = 'نص'; bodyEn = 'Custom body' } | ConvertTo-Json)).data
  Assert ($ntNew.nameEn -eq 'Custom template') 'custom notification template should be created'
  Invoke-RestMethod -Method Delete -Uri "$base/notification-templates/$($ntNew.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Log "notification-templates: total=$($notifTemplates.meta.total) update+reset+create+delete OK"

  # --- reports ---
  $schedule = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'تقرير شهري'; reportType = 'rpt-3'; cadence = 'MONTHLY'; recipients = @('admin@edas.local'); filters = @{ time = '07:30'; format = 'Excel' } } | ConvertTo-Json -Depth 5)).data
  Assert ($schedule.nextRunAt) 'schedule should have nextRunAt'
  Log "report.schedule.create: $($schedule.id) cadence=$($schedule.cadence)"

  $run = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules/$($schedule.id)/run" -Headers (AuthHeader $adminTok)).data
  Assert ($run.status -eq 'completed') "report run should complete (got $($run.status))"
  Assert ($run.fileId) 'completed run should reference a file'
  Log "report.run: $($run.id) status=$($run.status) file=$($run.fileId)"

  $download = (Invoke-RestMethod "$base/reports/runs/$($run.id)/download" -Headers (AuthHeader $adminTok)).data
  Assert ($download.url -match '/api/v1/reports/runs/.+/content\?ticket=[A-Za-z0-9_-]{40,}$') "report download should return an API ticket link (got $($download.url))"
  Assert ($download.url -notmatch ':9210|:9000') 'report download must not expose the storage endpoint'
  Assert ($download.fileName -like '*.xls') "excel schedule should export .xls (got $($download.fileName))"
  $xlsPath = Join-Path $tmp 'report-export.xls'
  $xls = Invoke-WebRequest -Uri $download.url -OutFile $xlsPath -PassThru
  Assert ([int]$xls.StatusCode -eq 200) 'report export should download'
  Assert ($xls.Headers['Content-Disposition'] -match '^attachment') 'report exports must be served as an attachment'
  $badReportTicket = Invoke-WebRequest "$base/reports/runs/$($run.id)/content?ticket=deadbeef" -SkipHttpErrorCheck
  Assert ([int]$badReportTicket.StatusCode -eq 403) "an unknown report ticket should be 403 (got $($badReportTicket.StatusCode))"
  $xlsText = Get-Content $xlsPath -Raw
  Assert ($xlsText.Contains('<Workbook')) 'excel export should be SpreadsheetML'
  Assert ($xlsText.Contains('System Admin')) 'excel export should contain the user activity rows'
  Log "report.download: $($download.fileName) bytes=$((Get-Item $xlsPath).Length)"

  $csvRun = (Invoke-RestMethod -Method Post -Uri "$base/reports/runs" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ reportType = 'rpt-3'; format = 'csv' } | ConvertTo-Json)).data
  Assert ($csvRun.status -eq 'completed') 'manual CSV run should complete'
  $csvDownload = (Invoke-RestMethod "$base/reports/runs/$($csvRun.id)/download" -Headers (AuthHeader $adminTok)).data
  Assert ($csvDownload.fileName -like '*.csv') "CSV run should export .csv (got $($csvDownload.fileName))"
  $csvPath = Join-Path $tmp 'report-export.csv'
  $csvResponse = Invoke-WebRequest -Uri $csvDownload.url -OutFile $csvPath -PassThru
  Assert ([int]$csvResponse.StatusCode -eq 200) 'report CSV should download'
  Assert ($csvResponse.Headers['Content-Disposition'] -match '^attachment') 'report exports must be served as an attachment'
  $csvText = Get-Content $csvPath -Raw
  Assert ($csvText.Contains('System Admin')) 'report CSV should contain the activity rows'
  Log "report.download.csv: $($csvDownload.fileName) bytes=$((Get-Item $csvPath).Length)"

  $badType = Invoke-WebRequest -Method Post -Uri "$base/reports/runs" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ reportType = 'documents'; format = 'csv' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$badType.StatusCode -eq 400) "unknown report type should be 400 (got $($badType.StatusCode))"
  Assert ((ConvertFrom-Json $badType.Content).error.code -eq 'BAD_REQUEST') "unknown report type should carry BAD_REQUEST (got $((ConvertFrom-Json $badType.Content).error.code))"
  Log "report.run.validation: HTTP $($badType.StatusCode) code=$((ConvertFrom-Json $badType.Content).error.code)"

  $pdfRun = (Invoke-RestMethod -Method Post -Uri "$base/reports/runs" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ reportType = 'rpt-1'; format = 'pdf' } | ConvertTo-Json)).data
  Assert ($pdfRun.status -eq 'completed') 'PDF run should complete'
  $pdfDownload = (Invoke-RestMethod "$base/reports/runs/$($pdfRun.id)/download" -Headers (AuthHeader $adminTok)).data
  Assert ($pdfDownload.fileName -like '*.pdf') "PDF run should export .pdf (got $($pdfDownload.fileName))"
  $pdfPath = Join-Path $tmp 'report-export.pdf'
  $null = Invoke-WebRequest -Uri $pdfDownload.url -OutFile $pdfPath
  $pdfBytes = [System.IO.File]::ReadAllBytes($pdfPath)
  $pdfHeader = [System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, 5)
  Assert ($pdfHeader -eq '%PDF-') "PDF export should have a PDF header (got $pdfHeader)"
  Log "report.download.pdf: $($pdfDownload.fileName) bytes=$($pdfBytes.Length)"

  $runs = (Invoke-RestMethod "$base/reports/runs" -Headers (AuthHeader $adminTok)).data
  Assert ($runs.meta.total -ge 1) 'report runs should be listed'
  Log "reports.runs: total=$($runs.meta.total)"

  $schedules = (Invoke-RestMethod "$base/reports/schedules" -Headers (AuthHeader $adminTok)).data
  $listed = $schedules.items | Where-Object { $_.id -eq $schedule.id }
  Assert ($listed.filters.time -eq '07:30') 'schedule filters should round-trip'
  Assert ($listed._count.runs -ge 1) 'schedule should count runs'
  Log "reports.schedules: total=$($schedules.meta.total) filters.time=$($listed.filters.time) runs=$($listed._count.runs)"

  $updated = (Invoke-RestMethod -Method Patch -Uri "$base/reports/schedules/$($schedule.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ isActive = $false; recipients = @('audit@edas.local') } | ConvertTo-Json -Depth 5)).data
  Assert ($updated.isActive -eq $false) 'schedule should be paused'
  Log "report.schedule.update: isActive=$($updated.isActive)"

  Invoke-RestMethod -Method Delete -Uri "$base/reports/schedules/$($schedule.id)" -Headers (AuthHeader $adminTok) | Out-Null
  $afterDelete = (Invoke-RestMethod "$base/reports/schedules" -Headers (AuthHeader $adminTok)).data
  Assert (-not ($afterDelete.items | Where-Object { $_.id -eq $schedule.id })) 'schedule should be deleted'
  Log 'report.schedule.delete: OK'

  $summary = (Invoke-RestMethod "$base/reports/summary" -Headers (AuthHeader $adminTok)).data
  Assert ($summary.documents.total -ge 2) 'summary should count documents'
  Assert ($summary.users.total -ge 2) 'summary should count users'
  Assert ($null -ne $summary.tasks.open) 'summary should expose open tasks'
  Assert ($summary.trend.Count -eq 6) 'summary should expose a six-month trend'
  Assert ($summary.trend[5].uploaded -ge 1) 'trend should count the created documents'
  Log "reports.summary: documents=$($summary.documents.total) pendingApprovals=$($summary.approvals.pending) users=$($summary.users.total) openTasks=$($summary.tasks.open) trend=$($summary.trend.Count)"

  # --- department scope: reports, legal holds, organization tree ---
  $scopeStamp = (Get-Date).ToString('HHmmssfff')
  $otherMgrName = "e2emgr$scopeStamp"
  $otherMgr = (Invoke-RestMethod -Method Post -Uri "$base/users" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'Other Manager'; username = $otherMgrName; email = "$otherMgrName@edas.gov"; password = 'Passw0rd!'; role = 'DEPT_MANAGER' } | ConvertTo-Json)).data
  $null = Invoke-RestMethod -Method Patch -Uri "$base/users/$($otherMgr.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ departmentId = $otherDept.id } | ConvertTo-Json)
  $otherMgrTok = Login $otherMgrName 'Passw0rd!'
  Log "scope fixture: manager $($otherMgr.username) placed in $($otherDept.nameEn)"

  $orgSchedule = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'Org wide report'; reportType = 'rpt-1'; cadence = 'DAILY'; recipients = @('admin@edas.local'); filters = @{ time = '06:00'; format = 'CSV' } } | ConvertTo-Json -Depth 5)).data
  $otherSchedule = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules" -Headers (AuthHeader $otherMgrTok) -ContentType 'application/json' -Body (@{ name = 'Other dept report'; reportType = 'rpt-1'; cadence = 'WEEKLY'; recipients = @('other@edas.local'); filters = @{ time = '06:30'; format = 'CSV' } } | ConvertTo-Json -Depth 5)).data
  Assert (-not $orgSchedule.departmentId) 'an admin schedule should stay organisation-wide'
  Assert ($otherSchedule.departmentId -eq $otherDept.id) "a manager schedule should carry its department (got $($otherSchedule.departmentId))"
  Log "report.schedule: org-wide=$($orgSchedule.id) other-dept=$($otherSchedule.departmentId)"

  $mgrSchedules = (Invoke-RestMethod "$base/reports/schedules" -Headers (AuthHeader $mgrTok)).data
  Assert ($mgrSchedules.items | Where-Object { $_.id -eq $orgSchedule.id }) 'organisation-wide schedules should stay visible to a manager'
  Assert (-not ($mgrSchedules.items | Where-Object { $_.id -eq $otherSchedule.id })) "another department's schedule should be hidden (got $($mgrSchedules.meta.total))"
  Log "reports.schedules (manager): total=$($mgrSchedules.meta.total)"

  $foreignPatch = Invoke-WebRequest -Method Patch -Uri "$base/reports/schedules/$($otherSchedule.id)" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ isActive = $false } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$foreignPatch.StatusCode -eq 403) "editing another department's schedule should be 403 (got $($foreignPatch.StatusCode))"
  $orgPatch = Invoke-WebRequest -Method Patch -Uri "$base/reports/schedules/$($orgSchedule.id)" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ isActive = $false } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$orgPatch.StatusCode -eq 403) "editing an organisation-wide schedule should be 403 (got $($orgPatch.StatusCode))"
  $foreignRun = Invoke-WebRequest -Method Post -Uri "$base/reports/schedules/$($otherSchedule.id)/run" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$foreignRun.StatusCode -eq 403) "running another department's schedule should be 403 (got $($foreignRun.StatusCode))"
  $orgPatchByAdmin = Invoke-WebRequest -Method Patch -Uri "$base/reports/schedules/$($orgSchedule.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ cadence = 'MONTHLY' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$orgPatchByAdmin.StatusCode -eq 200) "the admin should still edit organisation-wide schedules (got $($orgPatchByAdmin.StatusCode))"
  Log "report.schedule.write: foreign=$($foreignPatch.StatusCode) org-wide=$($orgPatch.StatusCode) run-foreign=$($foreignRun.StatusCode) admin=$($orgPatchByAdmin.StatusCode)"

  $sharedRun = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules/$($orgSchedule.id)/run" -Headers (AuthHeader $mgrTok)).data
  Assert ($sharedRun.departmentId -eq $mgrDept.id) "a manager run of a shared schedule should be stamped with the manager department (got $($sharedRun.departmentId))"
  $orgRun = (Invoke-RestMethod -Method Post -Uri "$base/reports/schedules/$($orgSchedule.id)/run" -Headers (AuthHeader $adminTok)).data
  Assert (-not $orgRun.departmentId) 'an admin run of an organisation-wide schedule stays organisation-wide'
  Log "report.run.scope: manager=$($sharedRun.departmentId) admin=$($orgRun.departmentId)"

  $foreignDownload = Invoke-WebRequest -Uri "$base/reports/runs/$($orgRun.id)/download" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$foreignDownload.StatusCode -eq 403) "downloading a run built for another scope should be 403 (got $($foreignDownload.StatusCode))"
  $ownDownload = Invoke-WebRequest -Uri "$base/reports/runs/$($sharedRun.id)/download" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$ownDownload.StatusCode -eq 200) "the manager should download the run built for their department (got $($ownDownload.StatusCode))"
  $adminDownload = Invoke-WebRequest -Uri "$base/reports/runs/$($orgRun.id)/download" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$adminDownload.StatusCode -eq 200) 'the admin should still download organisation-wide runs'
  Log "report.run.download: foreign=$($foreignDownload.StatusCode) own=$($ownDownload.StatusCode) admin=$($adminDownload.StatusCode)"

  $mgrRuns = (Invoke-RestMethod "$base/reports/runs?pageSize=100" -Headers (AuthHeader $mgrTok)).data
  Assert ($mgrRuns.items | Where-Object { $_.id -eq $sharedRun.id }) 'the manager should list the run built for their department'
  Assert (-not ($mgrRuns.items | Where-Object { $_.id -eq $orgRun.id })) 'organisation-wide runs should stay out of the manager list'
  Log "reports.runs (manager): total=$($mgrRuns.meta.total)"

  $holdDocA = UploadAs $adminTok 'hold-scope-a.pdf'
  $holdDocB = UploadAs $adminTok 'hold-scope-b.pdf'
  $scopedDocA = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'Hold document A'; titleEn = 'Hold document A'; fileId = $holdDocA.file.id; classification = 'INTERNAL'; departmentId = $mgrDept.id } | ConvertTo-Json)).data
  $scopedDocB = (Invoke-RestMethod -Method Post -Uri "$base/documents" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ title = 'Hold document B'; titleEn = 'Hold document B'; fileId = $holdDocB.file.id; classification = 'INTERNAL'; departmentId = $otherDept.id } | ConvertTo-Json)).data
  $crossHold = (Invoke-RestMethod -Method Post -Uri "$base/legal-holds" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ caseNo = "CASE-$scopeStamp"; reason = 'Cross department case'; documentIds = @($scopedDocA.id, $scopedDocB.id) } | ConvertTo-Json -Depth 5)).data
  Assert ($crossHold.documents.Count -eq 2) "the cross-department hold should keep both documents (got $($crossHold.documents.Count))"
  $mgrHolds = (Invoke-RestMethod "$base/legal-holds" -Headers (AuthHeader $mgrTok)).data
  Assert ($mgrHolds.items | Where-Object { $_.id -eq $crossHold.id }) 'a hold touching the manager department should be visible'
  Log "legal-hold.scope: case=$($crossHold.caseNo) visible-to-manager=$($mgrHolds.meta.total)"

  $holdReleaseDenied = Invoke-WebRequest -Method Post -Uri "$base/legal-holds/$($crossHold.id)/release" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$holdReleaseDenied.StatusCode -eq 403) "releasing a hold that spans other departments should be 403 (got $($holdReleaseDenied.StatusCode))"
  $removeForeign = Invoke-WebRequest -Method Delete -Uri "$base/legal-holds/$($crossHold.id)/documents/$($scopedDocB.id)" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$removeForeign.StatusCode -eq 403) "lifting a foreign document from a hold should be 403 (got $($removeForeign.StatusCode))"
  $removeOwn = Invoke-WebRequest -Method Delete -Uri "$base/legal-holds/$($crossHold.id)/documents/$($scopedDocA.id)" -Headers (AuthHeader $mgrTok) -SkipHttpErrorCheck
  Assert ([int]$removeOwn.StatusCode -eq 200) "the manager should lift their own department document (got $($removeOwn.StatusCode))"
  $adminRelease = Invoke-WebRequest -Method Post -Uri "$base/legal-holds/$($crossHold.id)/release" -Headers (AuthHeader $adminTok) -SkipHttpErrorCheck
  Assert ([int]$adminRelease.StatusCode -in 200, 201) "the admin should release the whole case (got $($adminRelease.StatusCode))"
  Log "legal-hold.scope: release=$($holdReleaseDenied.StatusCode) remove-foreign=$($removeForeign.StatusCode) remove-own=$($removeOwn.StatusCode) admin-release=$($adminRelease.StatusCode)"

  $topLevel = Invoke-WebRequest -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ code = "SA-$scopeStamp"; name = 'Scope dept'; nameEn = 'Scope dept' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$topLevel.StatusCode -eq 403) "a manager should not create a top-level department (got $($topLevel.StatusCode))"
  $foreignChild = Invoke-WebRequest -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ code = "SB-$scopeStamp"; name = 'Foreign child'; nameEn = 'Foreign child'; parentId = $otherDept.id } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$foreignChild.StatusCode -eq 403) "a manager should not create inside another department tree (got $($foreignChild.StatusCode))"
  $foreignEdit = Invoke-WebRequest -Method Patch -Uri "$base/org/departments/$($otherDept.id)" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ nameEn = 'Renamed by intruder' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$foreignEdit.StatusCode -eq 403) "a manager should not edit a foreign department (got $($foreignEdit.StatusCode))"
  $ownChild = Invoke-WebRequest -Method Post -Uri "$base/org/departments" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ code = "SC-$scopeStamp"; name = 'Own child'; nameEn = 'Own child'; parentId = $mgrDept.id } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$ownChild.StatusCode -in 200, 201) "a manager should create inside their own tree (got $($ownChild.StatusCode))"
  $childId = ($ownChild | ConvertFrom-Json).data.id
  $childEdit = Invoke-WebRequest -Method Patch -Uri "$base/org/departments/$childId" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ nameEn = 'Own child renamed' } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$childEdit.StatusCode -eq 200) "a manager should edit their own sub-department (got $($childEdit.StatusCode))"
  $foreignProject = Invoke-WebRequest -Method Post -Uri "$base/org/projects" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ code = "SP-$scopeStamp"; name = 'Foreign project'; nameEn = 'Foreign project'; departmentId = $otherDept.id } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$foreignProject.StatusCode -eq 403) "a manager should not create a project in another department (got $($foreignProject.StatusCode))"
  $foreignEmployee = Invoke-WebRequest -Method Post -Uri "$base/org/employees" -Headers (AuthHeader $mgrTok) -ContentType 'application/json' -Body (@{ empNo = "SE-$scopeStamp"; name = 'Foreign employee'; jobTitle = 'Analyst'; email = "se-$scopeStamp@edas.gov"; departmentId = $otherDept.id } | ConvertTo-Json) -SkipHttpErrorCheck
  Assert ([int]$foreignEmployee.StatusCode -eq 403) "a manager should not create an employee in another department (got $($foreignEmployee.StatusCode))"
  $scopeEmployee = (Invoke-RestMethod -Method Post -Uri "$base/org/employees" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ empNo = "SF-$scopeStamp"; name = 'Scoped employee'; jobTitle = 'Analyst'; email = "sf-$scopeStamp@edas.gov"; phone = '0111111'; departmentId = $mgrDept.id } | ConvertTo-Json)).data
  Assert ($scopeEmployee.email) 'the admin should store the contact details'
  $null = Invoke-RestMethod -Method Delete -Uri "$base/org/departments/$childId" -Headers (AuthHeader $mgrTok)
  Log "org.scope: top-level=$($topLevel.StatusCode) foreign-child=$($foreignChild.StatusCode) foreign-edit=$($foreignEdit.StatusCode) own=$($childEdit.StatusCode) foreign-project=$($foreignProject.StatusCode) foreign-employee=$($foreignEmployee.StatusCode)"

  $empDirectory = (Invoke-RestMethod "$base/org/employees" -Headers (AuthHeader $empTok)).data
  Assert ($empDirectory.items.Count -ge 1) 'the directory should list employees to an employee account'
  Assert (-not ($empDirectory.items | Where-Object { $_.email })) 'employee contact details should be redacted for the EMPLOYEE role'
  $mgrDirectory = (Invoke-RestMethod "$base/org/employees" -Headers (AuthHeader $mgrTok)).data
  Assert ($mgrDirectory.items | Where-Object { $_.email }) 'a manager should keep contact details'
  Log "org.directory: redacted=$($empDirectory.items.Count) full=$($mgrDirectory.items.Count)"

  Invoke-RestMethod -Method Delete -Uri "$base/reports/schedules/$($otherSchedule.id)" -Headers (AuthHeader $otherMgrTok) | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/reports/schedules/$($orgSchedule.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/users/$($otherMgr.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Log "scope fixture: temporary schedules and manager account removed"

  # --- saved searches ---
  $saved = (Invoke-RestMethod -Method Post -Uri "$base/saved-searches" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'وثائق داخلية'; query = @{ classification = 'INTERNAL' } } | ConvertTo-Json -Depth 5)).data
  Log "saved-search.create: $($saved.id)"
  $savedList = (Invoke-RestMethod "$base/saved-searches" -Headers (AuthHeader $adminTok)).data
  Assert ($savedList.meta.total -ge 1) 'saved searches should be listed'
  $savedUpdated = (Invoke-RestMethod -Method Patch -Uri "$base/saved-searches/$($saved.id)" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ name = 'وثائق داخلية محدثة'; query = @{ classification = 'INTERNAL'; q = 'contract' } } | ConvertTo-Json -Depth 5)).data
  Assert ($savedUpdated.name -like '*محدثة*') 'saved search should be renamed'
  Log "saved-search.update: $($savedUpdated.name)"
  Invoke-RestMethod -Method Delete -Uri "$base/saved-searches/$($saved.id)" -Headers (AuthHeader $adminTok) | Out-Null
  Log "saved-search.delete: OK"

  # --- audit ---
  $audit = (Invoke-RestMethod "$base/audit?entityType=Document" -Headers (AuthHeader $adminTok)).data
  Assert ($audit.meta.total -ge 1) 'audit events should be listed'
  Assert ($audit.items[0].hash) 'audit events should be hash-chained'
  Log "audit.list: total=$($audit.meta.total) latest=$($audit.items[0].action)"

  # --- settings ---
  $setting = (Invoke-RestMethod -Method Put -Uri "$base/settings/ui.theme" -Headers (AuthHeader $adminTok) -ContentType 'application/json' -Body (@{ value = @{ mode = 'dark' } } | ConvertTo-Json -Depth 5)).data
  Assert ($setting.value.mode -eq 'dark') 'setting should round-trip'
  Log "setting.put: $($setting.key) mode=$($setting.value.mode)"

  $settingsList = (Invoke-RestMethod "$base/settings" -Headers (AuthHeader $adminTok)).data
  Assert (($settingsList.items | Where-Object { $_.key -eq 'ui.theme' }).Count -eq 1) 'settings list should include ui.theme'
  Log "settings.list: total=$($settingsList.meta.total)"

  Write-Output 'E2E PASS'
} finally {
  if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue }
  if ($s3Proc -and -not $s3Proc.HasExited) { Stop-Process -Id $s3Proc.Id -Force -ErrorAction SilentlyContinue }
  docker rm -f $pgName $kcName *> $null
}
