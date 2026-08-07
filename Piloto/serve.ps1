# AYGEST ERP — servidor estático simples para pré-visualização local.
$root = $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 5710 }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "AYGEST a servir $root em http://localhost:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }

    $file = Join-Path $root ($path.TrimStart("/"))
    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $response.ContentType = $ct
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Nao encontrado: $path")
      $response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $response.OutputStream.Close()
  } catch {
    Write-Host "Erro: $_"
  }
}
