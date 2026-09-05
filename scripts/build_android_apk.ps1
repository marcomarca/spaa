<#
.SYNOPSIS
    Compila y sincroniza el cliente nativo de Android de SPAA con Capacitor.
.DESCRIPTION
    1. Construye el bundle optimizado de producción del frontend web (dist/).
    2. Sincroniza los assets web y plugins en el contenedor nativo de Android (android/).
    3. Si detecta un entorno Java (JDK) instalado, compila el archivo APK debug mediante el Gradle Wrapper.
    4. Proporciona la ruta exacta del APK para instalar en el smartphone.
#>

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  📱 COMPILADOR Y SINCRONIZADOR DE APK ANDROID — SPAA      " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$frontendDir = Join-Path $PSScriptRoot "..\frontend"
$androidDir = Join-Path $frontendDir "android"

# 1. Compilar Frontend Web
Write-Host "`n[1/3] ⚛️  Compilando bundle web de producción..." -ForegroundColor Yellow
Push-Location $frontendDir
try {
    bun run build
    if ($LASTEXITCODE -ne 0) { throw "Error al compilar el frontend con bun" }
} finally {
    Pop-Location
}

# 2. Sincronizar con Capacitor Android
Write-Host "`n[2/3] 🔄 Sincronizando assets con el contenedor Capacitor Android..." -ForegroundColor Yellow
Push-Location $frontendDir
try {
    bunx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Error en capacitor sync" }
} finally {
    Pop-Location
}

# 3. Verificar entorno Java / Gradle para compilar APK
Write-Host "`n[3/3] 🔨 Verificando compilador nativo (JDK / Gradle)..." -ForegroundColor Yellow

$javaCmd = Get-Command java -ErrorAction SilentlyContinue
$javacCmd = Get-Command javac -ErrorAction SilentlyContinue
$hasJdk = ($null -ne $javaCmd) -or ($null -ne $javacCmd) -or ($null -ne $env:JAVA_HOME)

if (-not $hasJdk) {
    # Buscar si OpenJDK existe en ubicaciones típicas de Windows
    $commonJavaPaths = @(
        "C:\Program Files\Microsoft\jdk*",
        "C:\Program Files\Eclipse Adoptium\jdk*",
        "C:\Program Files\Java\jdk*",
        "C:\Program Files\Android\Android Studio\jbr"
    )
    foreach ($path in $commonJavaPaths) {
        $found = Get-Item $path -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($found) {
            $env:JAVA_HOME = $found.FullName
            $env:Path = "$($found.FullName)\bin;" + $env:Path
            $hasJdk = $true
            Write-Host "   -> JDK detectado en: $($found.FullName)" -ForegroundColor Green
            break
        }
    }
}

if (-not $env:ANDROID_HOME) {
    $defaultSdk = "$env:USERPROFILE\AppData\Local\Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
        $env:Path = "$defaultSdk\platform-tools;$defaultSdk\build-tools\36.0.0;" + $env:Path
    }
}

if ($hasJdk) {
    Write-Host "   -> Entorno JDK verificado. Compilando APK con Gradle..." -ForegroundColor Green
    Push-Location $androidDir
    try {
        .\gradlew.bat assembleDebug
        $apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
        if (Test-Path $apkPath) {
            Write-Host "`n🎉 ¡APK compilado exitosamente!" -ForegroundColor Green
            Write-Host "   Ubicación: $apkPath" -ForegroundColor Cyan
            Write-Host "`n📲 Para instalarlo en tu smartphone:" -ForegroundColor White
            Write-Host "   1. Si tienes depuración USB activada: adb install `"$apkPath`"" -ForegroundColor Gray
            Write-Host "   2. O copia el archivo `app-debug.apk` a tu teléfono (Telegram, Google Drive, WhatsApp, cable USB) y ábrelo para instalar." -ForegroundColor Gray
        } else {
            Write-Host "⚠️  Gradle finalizó pero no se encontró el APK en la ruta esperada." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Fallo durante la compilación de Gradle: $_" -ForegroundColor Red
        Write-Host "   Puedes abrir el proyecto en Android Studio con: cd frontend; bunx cap open android" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`nℹ️  Los assets web y la configuración nativa están 100% sincronizados en: $androidDir" -ForegroundColor Cyan
    Write-Host "   Para compilar el archivo APK final tienes 2 opciones sencillas:" -ForegroundColor White
    Write-Host "   Opción A: Instalar JDK en Windows ejecutando:" -ForegroundColor Yellow
    Write-Host "             winget install Microsoft.OpenJDK.17" -ForegroundColor Gray
    Write-Host "             Y luego volver a ejecutar este script." -ForegroundColor Gray
    Write-Host "`n   Opción B: Abrir el proyecto en Android Studio con un clic:" -ForegroundColor Yellow
    Write-Host "             cd frontend; bunx cap open android" -ForegroundColor Gray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
