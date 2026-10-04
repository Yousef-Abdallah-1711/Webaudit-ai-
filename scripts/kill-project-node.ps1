$root = 'H:\Projects\Webaudit-ai-'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $_.CommandLine -like '*Webaudit*' -or
    ($_.CommandLine -like '*tsx*' -and $_.CommandLine -match 'src[\\/]index\.ts|src[\\/]serve\.ts') -or
    $_.CommandLine -like '*next\dist\bin\next*'
  } |
  ForEach-Object {
    Write-Output ("kill " + $_.ProcessId + " :: " + $_.CommandLine.Substring(0, [Math]::Min(100, $_.CommandLine.Length)))
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
