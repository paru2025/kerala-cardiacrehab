param(
  [int]$Port = 8000,
  [string]$Root = "."
)
$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output $prefix
function Get-ContentType($file) {
  switch ([IO.Path]::GetExtension($file).ToLower()) {
    ".html" { "text/html" }
    ".css" { "text/css" }
    ".js" { "application/javascript" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".svg" { "image/svg+xml" }
    ".json" { "application/json" }
    default { "application/octet-stream" }
  }
}
$rootFull = [System.IO.Path]::GetFullPath($Root)
while ($true) {
  $context = $listener.GetContext()
  $path = $context.Request.Url.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $full = [System.IO.Path]::GetFullPath((Join-Path $Root $path))
  if (-not $full.StartsWith($rootFull)) {
    $context.Response.StatusCode = 403
    $writer = New-Object System.IO.StreamWriter($context.Response.OutputStream)
    $writer.Write("Forbidden")
    $writer.Flush()
    $context.Response.OutputStream.Close()
    continue
  }
  if (-not (Test-Path $full)) {
    $context.Response.StatusCode = 404
    $writer = New-Object System.IO.StreamWriter($context.Response.OutputStream)
    $writer.Write("Not Found")
    $writer.Flush()
    $context.Response.OutputStream.Close()
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($full)
  $context.Response.ContentType = Get-ContentType $full
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.OutputStream.Close()
}
