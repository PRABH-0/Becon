<#
.SYNOPSIS
Becon Developer Helper Script for Windows PowerShell.

.DESCRIPTION
Provides standard development workflow tasks: install, dev-backend, dev-frontend, test, lint, migrate, makemigration, seed.

.EXAMPLE
.\scripts\dev.ps1 install
.\scripts\dev.ps1 dev-backend
.\scripts\dev.ps1 dev-frontend
.\scripts\dev.ps1 test
.\scripts\dev.ps1 lint
.\scripts\dev.ps1 migrate
.\scripts\dev.ps1 makemigration -Message "add_table"
.\scripts\dev.ps1 seed
#>

param (
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet("install", "dev-backend", "dev-frontend", "test", "lint", "migrate", "makemigration", "seed", "fetch", "scheduler", "synthesize", "eval-quality", "smoke-test")]
    [string]$Command,

    [Parameter(Position=1, Mandatory=$false)]
    [string]$Message = "migration",

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

switch ($Command) {
    "install" {
        Write-Host "==> Installing Backend Dependencies..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            if (-not (Test-Path ".venv")) {
                Write-Host "Creating python virtualenv in backend\.venv..."
                python -m venv .venv
            }
            & .venv\Scripts\python.exe -m pip install --upgrade pip
            & .venv\Scripts\pip.exe install -r requirements.lock -r requirements-dev.txt
        } finally {
            Pop-Location
        }

        Write-Host "`n==> Installing Frontend Dependencies..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\frontend"
        try {
            npm install
        } finally {
            Pop-Location
        }
        Write-Host "`n[OK] All dependencies successfully installed." -ForegroundColor Green
    }

    "dev-backend" {
        Write-Host "==> Starting FastAPI Backend on http://localhost:8000..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
        } finally {
            Pop-Location
        }
    }

    "dev-frontend" {
        Write-Host "==> Starting Next.js Frontend on http://localhost:3000..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\frontend"
        try {
            npm run dev
        } finally {
            Pop-Location
        }
    }

    "test" {
        Write-Host "==> Running Backend Test Suite..." -ForegroundColor Cyan
        Push-Location "$RepoRoot"
        try {
            & backend\.venv\Scripts\pytest.exe backend\tests -v
        } finally {
            Pop-Location
        }

        Write-Host "`n==> Running Frontend Test Suite..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\frontend"
        try {
            npm test
        } finally {
            Pop-Location
        }
    }

    "lint" {
        Write-Host "==> Running Backend Ruff Linter..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\ruff.exe check app/ tests/
        } finally {
            Pop-Location
        }

        Write-Host "`n==> Running Frontend TypeScript & ESLint Checks..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\frontend"
        try {
            npx tsc --noEmit
            npm run lint
        } finally {
            Pop-Location
        }
    }

    "migrate" {
        Write-Host "==> Running Alembic Migrations to Head..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\alembic.exe upgrade head
        } finally {
            Pop-Location
        }
    }

    "makemigration" {
        Write-Host "==> Creating Alembic Migration: $Message..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\alembic.exe revision --autogenerate -m "$Message"
        } finally {
            Pop-Location
        }
    }

    "seed" {
        Write-Host "==> Running Database Seed..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\python.exe -m app.seed
        } finally {
            Pop-Location
        }
    }

    "fetch" {
        Write-Host "==> Running Becon Official Source Fetcher..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\python.exe -m app.fetchers
        } finally {
            Pop-Location
        }
    }

    "scheduler" {
        Write-Host "==> Running Becon Source Scheduler Worker..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\python.exe -m app.scheduler
        } finally {
            Pop-Location
        }
    }

    "synthesize" {
        Write-Host "==> Running Becon Production Synthesis Queue..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            & .venv\Scripts\python.exe -m app.synthesize
        } finally {
            Pop-Location
        }
    }

    "eval-quality" {
        Write-Host "==> Running Becon Quality Gate Evaluation..." -ForegroundColor Cyan
        Push-Location "$RepoRoot\backend"
        try {
            $evalArgs = @()
            if ($Message -and $Message -ne "migration") {
                $evalArgs += ($Message -split "\s+")
            }
            if ($ExtraArgs) {
                $evalArgs += $ExtraArgs
            }
            if ($evalArgs.Count -gt 0) {
                & .venv\Scripts\python.exe -m app.eval_quality @evalArgs
            } else {
                & .venv\Scripts\python.exe -m app.eval_quality
            }
        } finally {
            Pop-Location
        }
    }

    "smoke-test" {
        Write-Host "==> Running Deployment Smoke Test..." -ForegroundColor Cyan
        Push-Location "$RepoRoot"
        try {
            $smokeArgs = @()
            if ($Message -and $Message -ne "migration") {
                $smokeArgs += ($Message -split "\s+")
            }
            if ($ExtraArgs) {
                $smokeArgs += $ExtraArgs
            }
            if ($smokeArgs.Count -gt 0) {
                & .\scripts\smoke_test.ps1 @smokeArgs
            } else {
                Write-Host "Usage: .\scripts\dev.ps1 smoke-test -BaseUrl <url> -IngestToken <token>" -ForegroundColor Yellow
            }
        } finally {
            Pop-Location
        }
    }
}
