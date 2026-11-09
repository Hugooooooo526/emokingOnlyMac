param([Parameter(Mandatory)][string]$Output, [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$icon = Join-Path $PSScriptRoot 'EmoKing.ico'
$env:EMOKING_ICNS = Join-Path $source 'native/AppIcon.icns'
$env:EMOKING_ICO = $icon
@'
const fs = require('fs');
const icns = fs.readFileSync(process.env.EMOKING_ICNS);
const images = [];
for (let i = 8; i < icns.length;) {
  const size = icns.readUInt32BE(i + 4);
  if (size < 8 || i + size > icns.length) throw new Error('Invalid ICNS');
  const png = icns.subarray(i + 8, i + size);
  if (['ic11', 'ic12', 'ic07', 'ic08'].includes(icns.toString('ascii', i, i + 4))) images.push(png);
  i += size;
}
images.sort((a, b) => a.readUInt32BE(16) - b.readUInt32BE(16));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const row = 6 + 16 * i;
  header[row] = png.readUInt32BE(16) & 255;
  header[row + 1] = png.readUInt32BE(20) & 255;
  header.writeUInt16LE(1, row + 4);
  header.writeUInt16LE(32, row + 6);
  header.writeUInt32LE(png.length, row + 8);
  header.writeUInt32LE(offset, row + 12);
  offset += png.length;
});
fs.writeFileSync(process.env.EMOKING_ICO, Buffer.concat([header, ...images]));
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Icon conversion failed.' }

$sim = Join-Path $PSScriptRoot 'sim.compat.js'
$render = Join-Path $PSScriptRoot 'render.compat.js'
$encoding = [Text.UTF8Encoding]::new($false)
$simSource = [IO.File]::ReadAllText((Join-Path $source 'web/sim.js')).Replace('{ type, ...data }', 'Object.assign({ type }, data)')
$renderSource = [IO.File]::ReadAllText((Join-Path $source 'web/render.js')).Replace('{ ...plan, delay }', 'Object.assign({ delay }, plan)')
[IO.File]::WriteAllText($sim, $simSource, $encoding)
[IO.File]::WriteAllText($render, $renderSource, $encoding)

$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$options = @('/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001', '/warnaserror+',
  "/out:$Output", "/win32icon:$icon", "/win32manifest:$PSScriptRoot\app.manifest",
  '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll', '/r:System.Web.Extensions.dll',
  "/resource:$PSScriptRoot\canvas.js,canvas.js", "/resource:$PSScriptRoot\desktop.js,desktop.js",
  "/resource:$sim,sim.js", "/resource:$render,render.js", "/resource:$source\LICENSE,LICENSE",
  "$PSScriptRoot\JsHost.cs", "$PSScriptRoot\Canvas.cs", "$PSScriptRoot\DrawingSetup.cs", "$PSScriptRoot\LayeredWindow.cs", "$PSScriptRoot\Program.cs")
if ($SelfTest) { $options += '/define:SELF_TEST', "$PSScriptRoot\SelfTest.cs" }
& $compiler @options
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
