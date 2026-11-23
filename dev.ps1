<#
.SYNOPSIS
Root helper forwarder to scripts\dev.ps1 for Becon.
#>
param (
    [Parameter(Position=0, Mandatory=$true)]
    [string]$Command,

    [Parameter(Position=1, Mandatory=$false)]
    [string]$Message = "migration"
)

& "$PSScriptRoot\scripts\dev.ps1" -Command $Command -Message $Message
