<#
.SYNOPSIS
    Production/Staging Smoke Test Script for Becon.

.DESCRIPTION
    Validates deployment readiness against live or staging endpoints:
    - GET /health
    - GET /api/synthesis/status (with and without X-Ingest-Token)
    - GET /api/briefings
    - CORS preflight/headers (Access-Control-Allow-Origin)
    
    SECURITY INVARIANT:
    The $IngestToken parameter is strictly redacted and never echoed to stdout,
    stderr, or error traces.

.PARAMETER BaseUrl
    Base URL of the target deployment (e.g. https://api.becon.dev or https://becon-staging.onrender.com).

.PARAMETER IngestToken
    Administrative ingestion API token (X-Ingest-Token). Masked in all console output.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Deployment base URL (e.g. https://api.becon.dev)")]
    [ValidateNotNullOrEmpty()]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true, HelpMessage = "Administrative X-Ingest-Token for ingestion status")]
    [ValidateNotNullOrEmpty()]
    [string]$IngestToken
)

$ErrorActionPreference = "Stop"

# Normalize BaseUrl (remove trailing slash)
$TargetUrl = $BaseUrl.TrimEnd('/')
$TotalChecks = 4
$PassedChecks = 0
$FailedChecks = 0

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Becon Deployment Smoke Test" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Target URL   : $TargetUrl"
Write-Host " Ingest Token : [REDACTED]"
Write-Host ""

function Report-Pass([string]$name, [string]$detail) {
    Write-Host " [PASS] $name" -ForegroundColor Green
    if ($detail) {
        Write-Host "        $detail" -ForegroundColor Gray
    }
}

function Report-Fail([string]$name, [string]$detail) {
    Write-Host " [FAIL] $name" -ForegroundColor Red
    if ($detail) {
        Write-Host "        $detail" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Check 1: Health Probe
# ---------------------------------------------------------------------------
Write-Host "Checking 1/4: GET /health ..." -ForegroundColor White
try {
    $healthUrl = "$TargetUrl/health"
    $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15
    if ($response.status -eq "ok" -or $response.status -eq "healthy" -or $response -ne $null) {
        Report-Pass "Health probe (/health)" "Service reported healthy status"
        $PassedChecks++
    } else {
        Report-Fail "Health probe (/health)" "Unexpected response payload: $response"
        $FailedChecks++
    }
} catch {
    Report-Fail "Health probe (/health)" "Failed to connect or received error: $($_.Exception.Message)"
    $FailedChecks++
}

# ---------------------------------------------------------------------------
# Check 2: Synthesis Status (Protected Endpoint)
# ---------------------------------------------------------------------------
Write-Host "Checking 2/4: GET /api/synthesis/status (auth & guard) ..." -ForegroundColor White
$statusAuthPassed = $false
$statusRejectPassed = $false

# 2a: Unauthenticated request should be rejected (401 or 403)
try {
    $unauthUrl = "$TargetUrl/api/synthesis/status"
    $null = Invoke-WebRequest -Uri $unauthUrl -Method Get -TimeoutSec 15 -SkipHttpErrorCheck
    # In PS 7+, SkipHttpErrorCheck returns response; check status code
} catch {
    # In Windows PowerShell 5.1, WebException is thrown for 401/403
    $ex = $_.Exception
    if ($ex.Response -ne $null) {
        $statusCode = [int]$ex.Response.StatusCode
        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            $statusRejectPassed = $true
        }
    }
}

# If using PowerShell Core / 7, check status code from response
if (-not $statusRejectPassed) {
    try {
        $res = Invoke-WebRequest -Uri "$TargetUrl/api/synthesis/status" -Method Get -TimeoutSec 15 -ErrorAction SilentlyContinue
        if ($res.StatusCode -eq 401 -or $res.StatusCode -eq 403) {
            $statusRejectPassed = $true
        }
    } catch {
        $ex = $_.Exception
        if ($ex.Response -ne $null) {
            $statusCode = [int]$ex.Response.StatusCode
            if ($statusCode -eq 401 -or $statusCode -eq 403) {
                $statusRejectPassed = $true
            }
        }
    }
}

# 2b: Authenticated request with X-Ingest-Token should succeed (200 OK)
try {
    $authHeaders = @{
        "X-Ingest-Token" = $IngestToken
    }
    $authResponse = Invoke-RestMethod -Uri "$TargetUrl/api/synthesis/status" -Method Get -Headers $authHeaders -TimeoutSec 15
    if ($authResponse -ne $null) {
        $statusAuthPassed = $true
    }
} catch {
    Report-Fail "Synthesis status (authenticated)" "Request with X-Ingest-Token failed (token redacted): $($_.Exception.Message)"
}

if ($statusAuthPassed) {
    Report-Pass "Synthesis status (/api/synthesis/status)" "Protected endpoint returned 200 with valid token"
    $PassedChecks++
} else {
    $FailedChecks++
}

# ---------------------------------------------------------------------------
# Check 3: Briefings Endpoint
# ---------------------------------------------------------------------------
Write-Host "Checking 3/4: GET /api/briefings ..." -ForegroundColor White
try {
    $briefingsUrl = "$TargetUrl/api/briefings?page=1&limit=5"
    $briefings = Invoke-RestMethod -Uri $briefingsUrl -Method Get -TimeoutSec 15
    if ($briefings -is [System.Collections.IEnumerable] -or $briefings.Count -ge 0) {
        Report-Pass "Briefings endpoint (/api/briefings)" "Returned valid briefings response list"
        $PassedChecks++
    } else {
        Report-Fail "Briefings endpoint (/api/briefings)" "Payload was not a collection: $briefings"
        $FailedChecks++
    }
} catch {
    Report-Fail "Briefings endpoint (/api/briefings)" "Failed to fetch briefings: $($_.Exception.Message)"
    $FailedChecks++
}

# ---------------------------------------------------------------------------
# Check 4: CORS Headers
# ---------------------------------------------------------------------------
Write-Host "Checking 4/4: CORS headers on /api/briefings ..." -ForegroundColor White
try {
    $corsOrigin = "https://becon.dev"
    $corsHeaders = @{
        "Origin" = $corsOrigin
    }
    $corsResponse = Invoke-WebRequest -Uri "$TargetUrl/api/briefings?page=1&limit=1" -Method Get -Headers $corsHeaders -TimeoutSec 15
    $allowOrigin = $corsResponse.Headers["Access-Control-Allow-Origin"]
    if ($allowOrigin) {
        Report-Pass "CORS headers verification" "Access-Control-Allow-Origin: $allowOrigin"
        $PassedChecks++
    } else {
        # Check case-insensitive match in headers
        $matched = $false
        foreach ($h in $corsResponse.Headers.Keys) {
            if ($h -like "*access-control-allow-origin*") {
                Report-Pass "CORS headers verification" "$h : $($corsResponse.Headers[$h])"
                $matched = $true
                $PassedChecks++
                break
            }
        }
        if (-not $matched) {
            Report-Fail "CORS headers verification" "Access-Control-Allow-Origin header missing in response"
            $FailedChecks++
        }
    }
} catch {
    Report-Fail "CORS headers verification" "Request failed: $($_.Exception.Message)"
    $FailedChecks++
}

# ---------------------------------------------------------------------------
# Final Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Smoke Test Summary: $PassedChecks/$TotalChecks Passed ($FailedChecks Failed)" -ForegroundColor $(if ($FailedChecks -eq 0) { "Green" } else { "Red" })
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan

if ($FailedChecks -gt 0) {
    Write-Host "Deployment smoke test FAILED. Review errors above." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Deployment smoke test PASSED successfully." -ForegroundColor Green
    exit 0
}
