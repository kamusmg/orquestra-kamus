$res = "packages/app/release/win-unpacked/resources"
if (Test-Path "$res/app.asar.new") {
    Remove-Item -Force "$res/app.asar" -ErrorAction SilentlyContinue
    Move-Item -Force "$res/app.asar.new" "$res/app.asar"
}
if (Test-Path "$res/app.asar.new.unpacked") {
    Remove-Item -Recurse -Force "$res/app.asar.unpacked" -ErrorAction SilentlyContinue
    Move-Item -Force "$res/app.asar.new.unpacked" "$res/app.asar.unpacked"
}
Write-Output "SWAP_DONE"
