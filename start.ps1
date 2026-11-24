# Chanakya Research Commons (CRC) -- PowerShell Runner
Set-Location -Path $PSScriptRoot

$VenvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (Test-Path $VenvPython) {
    & $VenvPython "start.py" $args
} else {
    python "start.py" $args
}
