param([switch]$Reference)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$serve = Join-Path $PSScriptRoot 'serve-jevk5.py'

if (-not (Test-Path -LiteralPath $python)) {
    throw "JevK5 Python environment is missing at $python. Recreate it and install JevK5 v0.2.0; see docs/jevk5-local.md."
}
if (-not (Test-Path -LiteralPath $serve)) {
    throw "Local JevK5 launcher is missing at $serve."
}

& $python -c "import torch, jevk5; assert torch.cuda.is_available(), 'PyTorch CUDA is unavailable'; print('GPU:', torch.cuda.get_device_name(0), 'CUDA:', torch.version.cuda)"
if ($LASTEXITCODE -ne 0) {
    throw 'JevK5 dependencies or NVIDIA CUDA are unavailable. Check the project venv and GPU driver.'
}

if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8090 -InformationLevel Quiet) {
    throw 'Port 8090 is already in use. Stop the existing process before starting JevK5.'
}

Write-Host 'Starting alibiserikbay/JevK5 on http://127.0.0.1:8090/v1/systemone (localhost only).'
# Bounded graph capture was tested but did not improve throughput. Keep eager
# execution, with verified accelerated attention/convolution and pinned weights.
$env:JEVK5_GRAPHS = '0'
if ($Reference) {
    & $python $serve --port 8090 --kernels reference
} else {
    & $python $serve --port 8090 --kernels fla --triton-conv
}
exit $LASTEXITCODE
