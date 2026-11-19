<#
.SYNOPSIS
  Workflow Preview per Italian Rainforest: verifica identità GitHub/Vercel, controlli di
  qualità, commit selettivo, push SOLO su preview/italianrainforest e link Preview Vercel.

.DESCRIPTION
  - Non tocca mai main/master né la produzione Vercel (niente --prod, promote, alias).
  - Niente force push, reset --hard, clean, né modifiche alla config Git globale o SSH.
  - Chiede conferma prima di commit, push e deploy manuale.
  - Si ferma al primo controllo fallito.

  L'email Git attesa non è scritta nello script: impostala nella sessione PowerShell
  prima di eseguirlo:
      $env:IRF_GIT_EMAIL = "<email Git del team>"

.EXAMPLE
  .\preview-italianrainforest.ps1
  .\preview-italianrainforest.ps1 -CommitMessage "Hero: nuovo testo" -SkipBuild
#>
[CmdletBinding()]
param(
  [string]$CommitMessage,
  [switch]$SkipBuild,
  [int]$DeployTimeoutSec = 600
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# ---------------------------------------------------------------------------
# Identificativi attesi (verificati il 2026-11-19 via GitHub API e Vercel API)
# ---------------------------------------------------------------------------
$GH_OWNER         = 'Rainmakers2026'
$GH_REPO          = 'ItalianRainforest.it-website'
$GH_REPO_ID       = 1429367281
$SSH_ALIAS        = 'github-rainmakers'
$EXPECTED_REMOTE  = "git@${SSH_ALIAS}:${GH_OWNER}/${GH_REPO}.git"
$GIT_NAME         = 'Rainmakers2026'
$GIT_EMAIL        = $env:IRF_GIT_EMAIL
$PREVIEW_BRANCH   = 'preview/italianrainforest'
$FORBIDDEN_BRANCH = @('main', 'master', 'production', 'prod', 'release')
$VERCEL_PROJECT   = 'prj_Hz2y1dGf8efRqmcYbLfXezWw50I6'
$VERCEL_ORG       = 'team_uil1PIU0oTpaorKXwLJJyQCD'   # team "Rainmakers" (slug rainmakers3)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
function Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Fail([string]$msg) {
  Write-Host ""
  Write-Host "  [STOP] $msg" -ForegroundColor Red
  Write-Host "  Workflow interrotto: nessuna ulteriore operazione eseguita." -ForegroundColor Red
  exit 1
}

function Confirm-Step([string]$question) {
  $a = Read-Host "$question [s/N]"
  return ($a -match '^(s|si|sì|y|yes)$')
}

# Esegue un comando esterno catturando stdout/stderr separatamente, senza che lo
# stderr nativo venga trasformato in errore da PowerShell 5.1.
function Invoke-Native {
  param([string]$Exe, [string[]]$ArgList, [switch]$AllowFail)
  $errFile = [IO.Path]::GetTempFileName()
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @ArgList 2> $errFile
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  $err = Get-Content -Raw -LiteralPath $errFile -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
  $text = (@($out) | ForEach-Object { "$_" }) -join "`n"
  if ($code -ne 0 -and -not $AllowFail) {
    Fail "Comando fallito ($code): $Exe $($ArgList -join ' ')`n$err"
  }
  return [pscustomobject]@{ Code = $code; Out = $text; Err = "$err" }
}

# Esegue un comando mostrando l'output in tempo reale; si ferma se il codice d'uscita != 0.
function Invoke-Live {
  param([string]$Exe, [string[]]$ArgList)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Exe @ArgList; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  if ($code -ne 0) { Fail "Comando fallito ($code): $Exe $($ArgList -join ' ')" }
}

function GitOut([string[]]$a) { return (Invoke-Native -Exe 'git' -ArgList $a).Out }
function GitSha([string]$ref) {
  $line = GitOut @('ls-remote', 'origin', $ref)
  if (-not $line) { return '' }
  return ($line -split "`t")[0].Trim()
}

# Vercel CLI: globale se presente, altrimenti tramite npx.
if (Get-Command vercel -ErrorAction SilentlyContinue) { $VercelExe = 'vercel'; $VercelPre = @() }
else { $VercelExe = 'npx'; $VercelPre = @('--yes', 'vercel') }
function VercelCli([string[]]$a) { return Invoke-Native -Exe $VercelExe -ArgList ($VercelPre + $a) }
function VercelApi([string]$path) {
  $json = (VercelCli @('api', $path, '--raw')).Out
  $i = $json.IndexOf('{')
  if ($i -lt 0) { Fail "Risposta Vercel API non valida per $path" }
  return ($json.Substring($i) | ConvertFrom-Json)
}
function Has($obj, [string]$prop) { return ($null -ne $obj -and $obj.PSObject.Properties[$prop] -and $obj.$prop) }

# ===========================================================================
# 1. REPOSITORY E GIT
# ===========================================================================
Step "Repository locale"
$root = (GitOut @('rev-parse', '--show-toplevel')).Trim()
if (-not $root) { Fail "Non sei dentro un repository Git." }
Set-Location -LiteralPath $root
Ok "Root: $root"

$remote = (GitOut @('remote', 'get-url', 'origin')).Trim()
$HTTPS_REMOTE_RE = "^https://($([regex]::Escape($GH_OWNER))@)?github\.com/$([regex]::Escape($GH_OWNER))/$([regex]::Escape($GH_REPO))(\.git)?$"
if ($remote -eq $EXPECTED_REMOTE) { $remoteMode = 'ssh' }
elseif ($remote -match $HTTPS_REMOTE_RE) { $remoteMode = 'https' }
else {
  Fail ("Il remote origin è '$remote'.`n  Atteso: '$EXPECTED_REMOTE'`n" +
        "  oppure https://github.com/$GH_OWNER/$GH_REPO.git")
}
$pushRemote = (GitOut @('remote', 'get-url', '--push', 'origin')).Trim()
if ($pushRemote -ne $remote) { Fail "Il remote di push ('$pushRemote') è diverso da quello di fetch." }
Ok "Remote origin ($remoteMode): $remote"

Step "Identità Git locale"
if (-not $GIT_EMAIL) { $GIT_EMAIL = (Read-Host "Email Git attesa per $GIT_NAME (oppure imposta `$env:IRF_GIT_EMAIL)").Trim() }
if (-not $GIT_EMAIL) { Fail "Email Git attesa non indicata." }
$name  = (Invoke-Native -Exe 'git' -ArgList @('config', '--local', 'user.name')  -AllowFail).Out.Trim()
$email = (Invoke-Native -Exe 'git' -ArgList @('config', '--local', 'user.email') -AllowFail).Out.Trim()
if ($name -ne $GIT_NAME -or $email -ne $GIT_EMAIL) {
  Fail ("user.name/user.email locali = '$name' / '$email' (attesi '$GIT_NAME' / '$GIT_EMAIL').`n" +
        "  Imposta solo per questo repository:`n" +
        "    git config --local user.name `"$GIT_NAME`"`n" +
        "    git config --local user.email `"$GIT_EMAIL`"")
}
Ok "$name <$email>"

if ($remoteMode -eq 'ssh') {
  Step "Autenticazione SSH ($SSH_ALIAS)"
  # ssh -T termina con codice 1 anche quando l'autenticazione riesce: si verifica il testo.
  $ssh = Invoke-Native -Exe 'ssh' -ArgList @('-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', "git@$SSH_ALIAS") -AllowFail
  $sshText = "$($ssh.Out)`n$($ssh.Err)"
  if ($sshText -notmatch "Hi $([regex]::Escape($GH_OWNER))!") {
    Fail "L'alias SSH '$SSH_ALIAS' non autentica come $GH_OWNER.`n  Output: $($sshText.Trim())"
  }
  Ok "SSH autenticato come $GH_OWNER"
} else {
  Step "Autenticazione HTTPS (credenziali Git salvate)"
  # Legge la credenziale che Git userà per il push (Git Credential Manager) e chiede a
  # GitHub a quale account appartiene. Il token resta in memoria e non viene mai stampato.
  $credIn = "protocol=https`nhost=github.com`nusername=$GH_OWNER`n`n"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $credOut = $credIn | & git credential fill 2> $null; $credCode = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  $secret = $null
  foreach ($l in @($credOut)) { if ("$l" -like 'password=*') { $secret = "$l".Substring(9) } }
  if ($credCode -ne 0 -or -not $secret) { Fail "Nessuna credenziale GitHub disponibile per $GH_OWNER (Git Credential Manager)." }
  try {
    $hdr = @{ 'User-Agent' = 'preview-script'; Authorization = "token $secret" }
    $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $hdr -TimeoutSec 20
    $perm = Invoke-RestMethod -Uri "https://api.github.com/repos/$GH_OWNER/$GH_REPO" -Headers $hdr -TimeoutSec 20
  } catch {
    Fail "Le credenziali salvate non sono valide per GitHub API (il token non viene mostrato)."
  } finally { $secret = $null; $hdr = $null }
  if ($me.login -ne $GH_OWNER) { Fail "Le credenziali HTTPS appartengono a '$($me.login)', non a $GH_OWNER." }
  if (-not ((Has $perm 'permissions') -and $perm.permissions.push)) { Fail "L'account $GH_OWNER non ha permesso di push su $GH_REPO." }
  Ok "HTTPS autenticato come $($me.login) con permesso di push"
}

Step "Repository GitHub (API pubblica)"
try {
  $gh = Invoke-RestMethod -Uri "https://api.github.com/repos/$GH_OWNER/$GH_REPO" -Headers @{ 'User-Agent' = 'preview-script' } -TimeoutSec 20
} catch { Fail "GitHub API non raggiungibile o repository non visibile: $($_.Exception.Message)" }
if ($gh.id -ne $GH_REPO_ID -or $gh.full_name -ne "$GH_OWNER/$GH_REPO") {
  Fail "Repository GitHub inatteso: id=$($gh.id) full_name=$($gh.full_name) (atteso id $GH_REPO_ID)."
}
Ok "$($gh.full_name) id=$($gh.id) default_branch=$($gh.default_branch)"

$remoteMainBefore = GitSha 'refs/heads/main'
Ok "origin/main remoto: $remoteMainBefore"

# ===========================================================================
# 2. VERCEL
# ===========================================================================
Step "Variabili d'ambiente Vercel"
foreach ($v in 'VERCEL_PROJECT_ID', 'VERCEL_ORG_ID') {
  $val = [Environment]::GetEnvironmentVariable($v)
  if ($val) {
    $exp = if ($v -eq 'VERCEL_PROJECT_ID') { $VERCEL_PROJECT } else { $VERCEL_ORG }
    if ($val -ne $exp) { Fail "$v è impostata su un valore diverso da quello atteso ($exp)." }
    Ok "$v corrisponde"
  }
}
if ($env:VERCEL_TOKEN) { Warn "VERCEL_TOKEN è impostata: la CLI userà quel token (valore non mostrato)." }

Step "Collegamento locale .vercel"
$linked = $false
if (Test-Path -LiteralPath '.vercel/project.json') {
  $pj = Get-Content -Raw -LiteralPath '.vercel/project.json' | ConvertFrom-Json
  if ($pj.projectId -ne $VERCEL_PROJECT -or $pj.orgId -ne $VERCEL_ORG) { Fail ".vercel/project.json punta a un altro progetto/team." }
  $linked = $true; Ok ".vercel/project.json corrisponde"
}
if (Test-Path -LiteralPath '.vercel/repo.json') {
  $rj = Get-Content -Raw -LiteralPath '.vercel/repo.json' | ConvertFrom-Json
  $rp = @($rj.projects)
  if ($rp.Count -ne 1 -or $rp[0].id -ne $VERCEL_PROJECT -or $rp[0].orgId -ne $VERCEL_ORG) {
    Fail ".vercel/repo.json non punta esclusivamente al progetto atteso."
  }
  $linked = $true; Ok ".vercel/repo.json corrisponde"
}
if (-not $linked) { Warn "Nessun collegamento .vercel locale: il deploy manuale userà ID espliciti." }

Step "Identità Vercel CLI"
$who = VercelCli @('whoami')
Ok "Account CLI: $($who.Out.Trim())"
$proj = VercelApi "/v9/projects/${VERCEL_PROJECT}?teamId=$VERCEL_ORG"
if ($proj.id -ne $VERCEL_PROJECT -or $proj.accountId -ne $VERCEL_ORG) { Fail "Il progetto Vercel restituito non corrisponde a Project/Org attesi." }
Ok "Progetto $($proj.name) ($($proj.id)) nel team $($proj.accountId)"
if (-not (Has $proj 'link') -or $proj.link.type -ne 'github' -or $proj.link.repoId -ne $GH_REPO_ID) {
  Fail "L'integrazione Git del progetto Vercel non punta al repository $GH_OWNER/$GH_REPO (id $GH_REPO_ID)."
}
$prodBranch = $proj.link.productionBranch
Ok "Integrazione GitHub: $($proj.link.org)/$($proj.link.repo), Production Branch = '$prodBranch'"
if ($prodBranch -eq $PREVIEW_BRANCH) { Fail "Il branch Preview coincide con il Production Branch su Vercel." }

# ===========================================================================
# 3. BRANCH
# ===========================================================================
Step "Branch"
$current = (GitOut @('branch', '--show-current')).Trim()
$dirty   = [bool](GitOut @('status', '--porcelain'))
$localExists  = (Invoke-Native -Exe 'git' -ArgList @('show-ref', '--verify', '--quiet', "refs/heads/$PREVIEW_BRANCH") -AllowFail).Code -eq 0
$remoteExists = [bool](GitOut @('ls-remote', '--heads', 'origin', $PREVIEW_BRANCH))

if ($current -ne $PREVIEW_BRANCH) {
  Warn "Branch attivo: '$current'."
  if (-not $localExists -and -not $remoteExists) {
    # Creare un nuovo branch dal commit attuale conserva tutte le modifiche locali.
    if (-not (Confirm-Step "Creare '$PREVIEW_BRANCH' dal commit attuale portando con sé le modifiche locali?")) { Fail "Annullato." }
    GitOut @('switch', '-c', $PREVIEW_BRANCH) | Out-Null
  } elseif ($dirty) {
    Fail "'$PREVIEW_BRANCH' esiste già e ci sono modifiche locali: cambia branch a mano (git switch $PREVIEW_BRANCH) per non rischiare sovrascritture."
  } elseif ($localExists) {
    GitOut @('switch', $PREVIEW_BRANCH) | Out-Null
  } else {
    GitOut @('switch', '--track', "origin/$PREVIEW_BRANCH") | Out-Null
  }
}
$current = (GitOut @('branch', '--show-current')).Trim()
if ($current -ne $PREVIEW_BRANCH -or $FORBIDDEN_BRANCH -contains $current -or $current -eq $prodBranch) {
  Fail "Branch attivo non valido: '$current'."
}
Ok "Branch attivo: $current"

# ===========================================================================
# 4. MODIFICHE
# ===========================================================================
Step "Stato del repository"
Invoke-Live 'git' @('status')
$staged = @((GitOut @('-c', 'core.quotepath=off', 'diff', '--cached', '--name-only')) -split "`n" | Where-Object { $_ })
if ($staged.Count) { Warn "File già in staging: $($staged -join ', ')" }

# Elenco completo (anche file non tracciati e rinomine), con percorsi letterali.
$raw = GitOut @('-c', 'core.quotepath=off', 'status', '--porcelain=v1', '-z', '--untracked-files=all')
$parts = $raw -split "`0"
$items = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $parts.Count; $i++) {
  $e = $parts[$i]; if ($e.Length -lt 4) { continue }
  $xy = $e.Substring(0, 2); $path = $e.Substring(3); $orig = $null
  if ($xy -match '[RC]') { $i++; $orig = $parts[$i] }
  [void]$items.Add([pscustomobject]@{ XY = $xy; Path = $path; Orig = $orig })
}
if (-not $items.Count) { Fail "Nessuna modifica da pubblicare." }

$sensitiveName = '(^|/)\.env($|\.(?!example$))|\.pem$|\.key$|\.p12$|\.pfx$|(^|/)id_(rsa|ecdsa|ed25519)|(^|/)\.ssh/|(^|/)\.vercel/|(^|/)\.npmrc$|credential|secret'
$secretContent = @(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'ghp_[A-Za-z0-9]{30,}', 'github_pat_[A-Za-z0-9_]{30,}',
  'pat[A-Za-z0-9]{14}\.[a-f0-9]{40,}',      # Airtable PAT
  'sk-[A-Za-z0-9_\-]{20,}', 'AKIA[0-9A-Z]{16}', 'xox[baprs]-[A-Za-z0-9\-]{10,}',
  '(?i)(api[_-]?key|secret|password|passwd|token)\w*["'']?\s*[:=]\s*["''][A-Za-z0-9_\-\.\/+=]{24,}["'']'
)

$candidates = New-Object System.Collections.ArrayList
$excluded   = New-Object System.Collections.ArrayList
$leaks      = New-Object System.Collections.ArrayList
foreach ($it in $items) {
  if ($it.Path -match $sensitiveName) { [void]$excluded.Add($it.Path); continue }
  if ($it.XY -notmatch 'D' -and (Test-Path -LiteralPath $it.Path -PathType Leaf)) {
    $f = Get-Item -LiteralPath $it.Path
    if ($f.Length -lt 2MB) {
      $hits = Select-String -LiteralPath $it.Path -Pattern $secretContent -ErrorAction SilentlyContinue
      foreach ($h in @($hits)) { if ($h) { [void]$leaks.Add("$($it.Path):$($h.LineNumber)") } }
    }
  }
  [void]$candidates.Add($it)
}
if ($excluded.Count) { Warn "Esclusi automaticamente (possibili file sensibili): $($excluded -join ', ')" }
if ($leaks.Count) {
  Fail ("Possibili segreti nel contenuto (valori non mostrati):`n    " + ($leaks -join "`n    ") +
        "`n  Rimuovili o verifica a mano prima di ripetere.")
}
Ok "Nessun segreto riconosciuto nei file candidati"

Step "File candidati"
for ($i = 0; $i -lt $candidates.Count; $i++) {
  $c = $candidates[$i]
  $label = switch -Regex ($c.XY) { '\?\?' { 'nuovo'; break } 'D' { 'eliminato'; break } 'R' { 'rinominato'; break } default { 'modificato' } }
  $extra = if ($c.Orig) { "  (da $($c.Orig))" } else { '' }
  Write-Host ("  {0,3}. [{1,-10}] {2}{3}" -f ($i + 1), $label, $c.Path, $extra)
}
Write-Host ""
Write-Host "  Diff compatto:" -ForegroundColor DarkGray
Invoke-Live 'git' @('--no-pager', 'diff', '--stat')
if (Confirm-Step "Vuoi vedere il diff completo dei file tracciati?") { Invoke-Live 'git' @('--no-pager', 'diff') }

$sel = Read-Host "File da includere: INVIO = tutti i candidati, oppure numeri/intervalli (es. 1,3,5-9), q = esci"
if ($sel -match '^\s*q\s*$') { Fail "Annullato." }
$chosen = New-Object System.Collections.ArrayList
if ($sel -match '^\s*$') { foreach ($c in $candidates) { [void]$chosen.Add($c) } }
else {
  foreach ($tok in ($sel -split ',')) {
    $t = $tok.Trim()
    if ($t -match '^(\d+)-(\d+)$') { $a = [int]$Matches[1]; $b = [int]$Matches[2] }
    elseif ($t -match '^\d+$') { $a = [int]$t; $b = $a }
    else { Fail "Selezione non valida: '$t'" }
    for ($n = $a; $n -le $b; $n++) {
      if ($n -lt 1 -or $n -gt $candidates.Count) { Fail "Numero fuori intervallo: $n" }
      if (-not $chosen.Contains($candidates[$n - 1])) { [void]$chosen.Add($candidates[$n - 1]) }
    }
  }
}
$paths = New-Object System.Collections.ArrayList
foreach ($c in $chosen) { [void]$paths.Add($c.Path); if ($c.Orig) { [void]$paths.Add($c.Orig) } }

$notChosenStaged = @($staged | Where-Object { -not $paths.Contains($_) })
if ($notChosenStaged.Count) {
  Fail ("Ci sono file già in staging non selezionati: $($notChosenStaged -join ', ').`n" +
        "  Toglili dallo staging a mano (git restore --staged <file>) o includili.")
}

# ===========================================================================
# 5. CONTROLLI DI QUALITÀ
# ===========================================================================
Step "Controlli di qualità (script presenti in package.json)"
$scripts = @()
if (Test-Path -LiteralPath 'package.json') {
  $pkg = Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json
  if ($pkg.PSObject.Properties['scripts']) { $scripts = @($pkg.scripts.PSObject.Properties | ForEach-Object { $_.Name }) }
}
$wanted = @('lint', 'typecheck', 'test')
if (-not $SkipBuild) { $wanted += 'build' } else { Warn "Build saltata (-SkipBuild): Vercel la eseguirà comunque." }
foreach ($s in $wanted) {
  if ($scripts -contains $s) { Write-Host "  > npm run $s" -ForegroundColor DarkGray; Invoke-Live 'npm' @('run', $s); Ok "$s superato" }
  else { Warn "Script '$s' non presente: saltato" }
}

# ===========================================================================
# 6. COMMIT
# ===========================================================================
Step "Riepilogo commit"
Write-Host "  Repository: $GH_OWNER/$GH_REPO   Branch: $current   File: $($chosen.Count)"
foreach ($c in $chosen) { Write-Host "    - $($c.Path)" }
if (-not (Confirm-Step "Confermi lo staging e il commit di questi file?")) { Fail "Commit annullato dall'utente." }

$listFile = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($listFile, (($paths | ForEach-Object { $_ }) -join "`0") + "`0", (New-Object Text.UTF8Encoding $false))
Invoke-Native -Exe 'git' -ArgList @('--literal-pathspecs', 'add', '-A', "--pathspec-from-file=$listFile", '--pathspec-file-nul') | Out-Null
Remove-Item -LiteralPath $listFile -Force

$stagedNow = @((GitOut @('-c', 'core.quotepath=off', 'diff', '--cached', '--name-only')) -split "`n" | Where-Object { $_ })
$unexpected = @($stagedNow | Where-Object { -not $paths.Contains($_) })
if ($unexpected.Count) { Fail "Nello staging sono finiti file non approvati: $($unexpected -join ', ')" }
if (-not $stagedNow.Count) { Fail "Nessun file nello staging." }

Invoke-Live 'git' @('--no-pager', 'diff', '--cached', '--stat')
if (Confirm-Step "Vuoi vedere 'git diff --cached' completo?") { Invoke-Live 'git' @('--no-pager', 'diff', '--cached') }
if (-not $CommitMessage) { $CommitMessage = Read-Host "Messaggio di commit" }
if (-not $CommitMessage.Trim()) { Fail "Messaggio di commit vuoto." }
if (-not (Confirm-Step "Creare il commit '$CommitMessage'?")) { Fail "Commit annullato (i file restano in staging)." }
Invoke-Live 'git' @('commit', '-m', $CommitMessage)
$sha = (GitOut @('rev-parse', 'HEAD')).Trim()
Ok "Commit $sha"

# ===========================================================================
# 7. PUSH (solo preview/italianrainforest, mai force)
# ===========================================================================
Step "Verifiche prima del push"
if ((GitOut @('branch', '--show-current')).Trim() -ne $PREVIEW_BRANCH) { Fail "Il branch è cambiato." }
if ((GitOut @('remote', 'get-url', '--push', 'origin')).Trim() -ne $remote) { Fail "Il remote di push è cambiato." }
$up = Invoke-Native -Exe 'git' -ArgList @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -AllowFail
$setUpstream = $false
if ($up.Code -eq 0) {
  if ($up.Out.Trim() -ne "origin/$PREVIEW_BRANCH") { Fail "Upstream inatteso: '$($up.Out.Trim())' (atteso origin/$PREVIEW_BRANCH)." }
  Ok "Upstream: $($up.Out.Trim())"
} else { $setUpstream = $true; Warn "Nessun upstream: verrà impostato su origin/$PREVIEW_BRANCH" }

if (-not (Confirm-Step "Eseguire il push di $($sha.Substring(0,7)) su origin/$PREVIEW_BRANCH?")) { Fail "Push annullato (il commit resta in locale)." }
$pushArgs = @('push', '--porcelain')
if ($setUpstream) { $pushArgs += '--set-upstream' }
$pushArgs += @('origin', "refs/heads/${PREVIEW_BRANCH}:refs/heads/${PREVIEW_BRANCH}")
$push = Invoke-Native -Exe 'git' -ArgList $pushArgs -AllowFail
Write-Host $push.Out
if ($push.Code -ne 0) { Fail "Push rifiutato o fallito. Nessun force push eseguito.`n$($push.Err)" }
$refLines = @($push.Out -split "`n" | Where-Object { $_ -match "`trefs/" })
foreach ($l in $refLines) { if ($l -notmatch [regex]::Escape("refs/heads/${PREVIEW_BRANCH}:refs/heads/${PREVIEW_BRANCH}")) { Fail "Il push ha toccato un ref inatteso: $l" } }

$remoteSha = GitSha "refs/heads/$PREVIEW_BRANCH"
if ($remoteSha -ne $sha) { Fail "Il commit remoto ($remoteSha) non corrisponde a quello locale ($sha)." }
Ok "origin/$PREVIEW_BRANCH = $sha"
if ((GitSha 'refs/heads/main') -ne $remoteMainBefore) { Warn "ATTENZIONE: origin/main è cambiato durante il workflow (non da questo script)." }
else { Ok "origin/main invariato" }

# ===========================================================================
# 8. PREVIEW VERCEL
# ===========================================================================
Step "Deployment Preview Vercel per $($sha.Substring(0,7)) (timeout ${DeployTimeoutSec}s)"
$deadline = (Get-Date).AddSeconds($DeployTimeoutSec)
$dep = $null; $seen = $false
while ((Get-Date) -lt $deadline) {
  $list = VercelApi "/v6/deployments?projectId=$VERCEL_PROJECT&teamId=$VERCEL_ORG&limit=30"
  $match = @($list.deployments | Where-Object { (Has $_ 'meta') -and (Has $_.meta 'githubCommitSha') -and $_.meta.githubCommitSha -eq $sha })
  if ($match.Count) {
    $d = $match[0]; $seen = $true
    if ((Has $d 'target') -and $d.target -eq 'production') { Fail "Il deployment del commit risulta di PRODUZIONE: verifica subito su Vercel." }
    $state = if (Has $d 'readyState') { $d.readyState } else { $d.state }
    Write-Host "  stato: $state"
    if ($state -eq 'READY') { $dep = $d; break }
    if ($state -eq 'ERROR' -or $state -eq 'CANCELED') { Fail "Deployment Vercel terminato con stato ${state}: https://$($d.url) (vedi log su Vercel)." }
  } else { Write-Host "  in attesa che Vercel avvii il deployment..." }
  Start-Sleep -Seconds 15
}

$previewUrl = $null; $branchUrl = $null
if ($dep) {
  $previewUrl = "https://$($dep.url)"
  $info = VercelApi "/v13/deployments/$($dep.uid)?teamId=$VERCEL_ORG"
  if (Has $info 'alias') { $branchUrl = @($info.alias | Where-Object { $_ -match '-git-' }) | Select-Object -First 1 }
  Ok "Preview pronta"
} elseif ($seen) {
  Fail "Il deployment automatico esiste ma non è pronto entro il timeout: controllalo su Vercel (nessun deploy duplicato creato)."
} else {
  Warn "Nessun deployment automatico trovato per questo commit."
  if (-not (Confirm-Step "Creare una Preview manuale con 'vercel deploy' (MAI --prod)?")) { Fail "Deploy manuale non eseguito." }
  $p2 = VercelApi "/v9/projects/${VERCEL_PROJECT}?teamId=$VERCEL_ORG"
  if ($p2.id -ne $VERCEL_PROJECT -or $p2.accountId -ne $VERCEL_ORG) { Fail "Verifica Project/Org fallita prima del deploy." }
  $oldP = $env:VERCEL_PROJECT_ID; $oldO = $env:VERCEL_ORG_ID
  $env:VERCEL_PROJECT_ID = $VERCEL_PROJECT; $env:VERCEL_ORG_ID = $VERCEL_ORG
  try { $d = VercelCli @('deploy', '--yes', '--target', 'preview') }
  finally { $env:VERCEL_PROJECT_ID = $oldP; $env:VERCEL_ORG_ID = $oldO }
  $previewUrl = ([regex]::Match("$($d.Out)`n$($d.Err)", 'https://[a-z0-9\-]+\.vercel\.app')).Value
  if (-not $previewUrl) { Fail "Deploy eseguito ma URL non trovato nell'output." }
  Ok "Preview manuale creata"
}

# ===========================================================================
# 9. CONDIVISIONE
# ===========================================================================
Step "Deployment Protection"
$prot = VercelApi "/v9/projects/${VERCEL_PROJECT}?teamId=$VERCEL_ORG"
if (-not (Has $prot 'ssoProtection') -and -not (Has $prot 'passwordProtection')) {
  Ok "Nessuna protezione attiva: il link si apre senza account Vercel."
} else {
  Warn "Le Preview sono protette (Vercel Authentication/password)."
  Write-Host "  Per condividerle senza account: Vercel > progetto > Deployments > apri il deployment >"
  Write-Host "  pulsante 'Share' > copia il link condivisibile. Non incollare token nel repository."
}
Warn "Chiunque riceva il link può aprirlo, anche fuori dal team, se viene inoltrato."

# ===========================================================================
# 10. RIEPILOGO
# ===========================================================================
Step "Riepilogo"
Write-Host "  Repository : $GH_OWNER/$GH_REPO (id $GH_REPO_ID)"
Write-Host "  Branch     : $PREVIEW_BRANCH"
Write-Host "  Commit     : $sha"
Write-Host "  Preview    : $previewUrl" -ForegroundColor Green
if ($branchUrl) { Write-Host "  Link fisso del branch (sempre l'ultima Preview): https://$branchUrl" -ForegroundColor Green }
Write-Host "  Produzione : invariata (Production Branch '$prodBranch', nessun --prod/promote/alias)"
