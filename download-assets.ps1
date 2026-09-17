$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path $PSScriptRoot 'vendor'
New-Item -ItemType Directory -Force -Path (Join-Path $assetRoot 'wasm') | Out-Null
$cdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/'
$assetNames = @('vision_bundle.mjs','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm')
foreach ($assetName in $assetNames) {
    Invoke-WebRequest -Uri ($cdn + $assetName) -OutFile (Join-Path $assetRoot $assetName) -TimeoutSec 120
    Write-Output ('Saved ' + $assetName)
}
Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' -OutFile (Join-Path $assetRoot 'face_detector.tflite') -TimeoutSec 120
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE' -OutFile (Join-Path $assetRoot 'LICENSE-mediapipe.txt') -TimeoutSec 60
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.js' -OutFile (Join-Path $assetRoot 'heic-to.js') -TimeoutSec 120
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/LICENSE' -OutFile (Join-Path $assetRoot 'LICENSE-heic-to.txt') -TimeoutSec 60
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js' -OutFile (Join-Path $assetRoot 'fflate.js') -TimeoutSec 60
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/LICENSE' -OutFile (Join-Path $assetRoot 'LICENSE-fflate.txt') -TimeoutSec 60
Write-Output 'All local detection and conversion assets are ready.'
