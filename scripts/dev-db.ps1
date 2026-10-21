$base = "C:\Program Files\MySQL\MySQL Server 8.0"
$data = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "data\mysql"
$listening = netstat -ano | Select-String ":3307\s"
if ($listening) {
  Write-Output "MySQL already listening on 127.0.0.1:3307"
  exit 0
}
if (-not (Test-Path (Join-Path $data "mysql"))) {
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  & "$base\bin\mysqld.exe" --no-defaults --initialize-insecure --basedir="$base" --datadir="$data"
}
& "$base\bin\mysqld.exe" --no-defaults --basedir="$base" --datadir="$data" --port=3307 --bind-address=127.0.0.1 --mysqlx=0 --enable-named-pipe --socket=mailerdev --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --console
