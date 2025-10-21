# Image Gallery Server CLI Installer for Windows
# One-line install: Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.ps1')

param(
    [switch]$Uninstall,
    [switch]$Help
)

# Configuration
$RepoUrl = "https://github.com/blashbrook/image-gallery-server"
$InstallDir = "$env:USERPROFILE\.gallery-cli"
$BinName = "gallery"
$BatFile = "$BinName.bat"

# Helper functions for colored output
function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
    exit 1
}

# Check if command exists
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# Check requirements
function Test-Requirements {
    Write-Info "Checking system requirements..."
    
    # Check Node.js
    if (-not (Test-Command "node")) {
        Write-Error "Node.js is not installed. Please install Node.js 18+ and try again."
    }
    
    # Check Node.js version
    $NodeVersion = & node -v
    $NodeVersionNumber = [int]($NodeVersion -replace "v(\d+).*", '$1')
    if ($NodeVersionNumber -lt 18) {
        Write-Error "Node.js version 18 or higher is required. Current version: $NodeVersion"
    }
    
    # Check npm
    if (-not (Test-Command "npm")) {
        Write-Error "npm is not installed. Please install npm and try again."
    }
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 3) {
        Write-Error "PowerShell 3.0 or higher is required."
    }
    
    Write-Success "System requirements met"
}

# Download the latest release
function Get-Package {
    Write-Info "Downloading Image Gallery CLI..."
    
    $TempDir = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
    New-Item -ItemType Directory -Path $TempDir | Out-Null
    
    $ArchiveUrl = "$RepoUrl/archive/refs/heads/main.zip"
    $ArchivePath = Join-Path $TempDir "gallery.zip"
    
    try {
        # Use built-in .NET webclient for compatibility
        $WebClient = New-Object System.Net.WebClient
        $WebClient.DownloadFile($ArchiveUrl, $ArchivePath)
        $WebClient.Dispose()
        
        # Extract archive
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $TempDir)
        
        # Move contents from extracted subfolder
        $ExtractedFolder = Get-ChildItem -Path $TempDir -Directory | Where-Object { $_.Name -like "*image-gallery-server*" } | Select-Object -First 1
        if ($ExtractedFolder) {
            $SourcePath = $ExtractedFolder.FullName
        } else {
            Write-Error "Could not find extracted package contents"
        }
        
        Write-Success "Package downloaded successfully"
        return @{
            TempDir = $TempDir
            SourcePath = $SourcePath
        }
    }
    catch {
        Write-Error "Failed to download package: $($_.Exception.Message)"
    }
}

# Install dependencies and setup
function Install-Package {
    param(
        [string]$SourcePath,
        [string]$TempDir
    )
    
    Write-Info "Installing package dependencies..."
    
    # Change to source directory
    Push-Location $SourcePath
    
    try {
        # Install npm dependencies
        & npm install --only=production --silent
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install npm dependencies"
        }
        
        # Create installation directory
        if (Test-Path $InstallDir) {
            Remove-Item -Recurse -Force $InstallDir
        }
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        
        # Copy files to install directory
        Copy-Item -Recurse -Path "$SourcePath\*" -Destination $InstallDir -Force
        
        Write-Success "Package installed to $InstallDir"
    }
    finally {
        Pop-Location
    }
}

# Create batch file for global command
function New-GlobalCommand {
    Write-Info "Setting up global command..."
    
    # Create batch file content
    $BatchContent = @"
@echo off
node "$InstallDir\bin\gallery.js" %*
"@
    
    # Find suitable directory for the batch file
    $BinDirs = @(
        "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps",
        "$env:USERPROFILE\.local\bin"
    )
    
    $BinDir = $null
    foreach ($Dir in $BinDirs) {
        if (Test-Path $Dir) {
            $BinDir = $Dir
            break
        }
    }
    
    # Create .local\bin if no suitable directory found
    if (-not $BinDir) {
        $BinDir = "$env:USERPROFILE\.local\bin"
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
        
        # Add to PATH if not already there
        $CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($CurrentPath -notlike "*$BinDir*") {
            [Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$BinDir", "User")
            Write-Warning "Added $BinDir to PATH. Restart your terminal or run 'refreshenv' if using Chocolatey"
        }
    }
    
    # Create batch file
    $BatPath = Join-Path $BinDir $BatFile
    $BatchContent | Out-File -FilePath $BatPath -Encoding ASCII
    
    Write-Success "Global command '$BinName' created at $BatPath"
    
    return $BinDir
}

# Verify installation
function Test-Installation {
    param([string]$BinDir)
    
    Write-Info "Verifying installation..."
    
    $BatPath = Join-Path $BinDir $BatFile
    
    if (Test-Path $BatPath) {
        Write-Success "Gallery CLI installed successfully!"
        
        Write-Host ""
        Write-Host "🎉 Installation complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Available commands:"
        Write-Host "  gallery up                    # Start server in current directory"
        Write-Host "  gallery up -d C:\Pictures     # Start server for specific directory"  
        Write-Host "  gallery scan                  # Preview scan results"
        Write-Host "  gallery stop                  # Stop all gallery servers"
        Write-Host "  gallery rescan                # Force rescan of current directory"
        Write-Host "  gallery cleanup               # Clean up orphaned thumbnails"
        Write-Host "  gallery delete                # Clean up all cache files"
        Write-Host ""
        
        # Test if command is available in PATH
        if (Test-Command $BinName) {
            Write-Success "Installation verified"
        } else {
            Write-Warning "Command not immediately available in PATH. Terminal restart may be required."
        }
    } else {
        Write-Error "Installation verification failed"
    }
}

# Cleanup temporary files
function Remove-TempFiles {
    param([string]$TempDir)
    
    if ($TempDir -and (Test-Path $TempDir)) {
        Remove-Item -Recurse -Force $TempDir
    }
}

# Uninstall function
function Uninstall-Gallery {
    Write-Info "Uninstalling Image Gallery CLI..."
    
    # Remove batch file from common locations
    $BinLocations = @(
        "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps",
        "$env:USERPROFILE\.local\bin"
    )
    
    foreach ($BinDir in $BinLocations) {
        $BatPath = Join-Path $BinDir $BatFile
        if (Test-Path $BatPath) {
            Remove-Item $BatPath -Force
            Write-Success "Removed $BatPath"
        }
    }
    
    # Remove installation directory
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
        Write-Success "Removed $InstallDir"
    }
    
    Write-Success "Image Gallery CLI uninstalled successfully"
    exit 0
}

# Smart terminal detection and post-install guidance
function Show-PostInstallGuidance {
    $isModernTerminal = $false
    $terminalName = "terminal"
    
    # Detect Windows Terminal
    if ($env:WT_SESSION) {
        $isModernTerminal = $true
        $terminalName = "Windows Terminal"
    }
    # Detect VSCode integrated terminal
    elseif ($env:VSCODE_INJECTION -or $env:TERM_PROGRAM -eq "vscode") {
        $isModernTerminal = $true
        $terminalName = "VSCode Terminal"
    }
    # Detect PowerShell ISE
    elseif ($Host.Name -eq "Windows PowerShell ISE Host") {
        $isModernTerminal = $true
        $terminalName = "PowerShell ISE"
    }
    # Detect ConEmu
    elseif ($env:ConEmuPID) {
        $isModernTerminal = $true
        $terminalName = "ConEmu"
    }
    # Detect Hyper terminal
    elseif ($env:HYPER) {
        $isModernTerminal = $true
        $terminalName = "Hyper Terminal"
    }
    
    if ($isModernTerminal) {
        Write-Host "💡 $terminalName detected - PATH updated!" -ForegroundColor Blue
        Write-Host "   The 'gallery' command will be available:" -ForegroundColor Yellow
        Write-Host "   • In new terminal tabs/windows" -ForegroundColor White
        Write-Host "   • After restarting your terminal application" -ForegroundColor White
        Write-Host "   • Or try 'gallery up' now - it might already work!" -ForegroundColor White
    } else {
        Write-Host "💡 PATH updated! You may need to:" -ForegroundColor Yellow
        Write-Host "   • Restart your terminal application" -ForegroundColor White
        Write-Host "   • Or open a new terminal window" -ForegroundColor White
        Write-Host "   • Then try 'gallery up'" -ForegroundColor White
    }
}

# Show help
function Show-Help {
    Write-Host ""
    Write-Host "🖼️  Image Gallery Server CLI Installer for Windows" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help          Show this help message"
    Write-Host "  -Uninstall     Uninstall Image Gallery CLI"
    Write-Host ""
    Write-Host "Install via PowerShell (Run as Administrator may be required):"
    Write-Host "  Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.ps1')" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or download and run locally:"
    Write-Host "  .\install.ps1" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Uninstall:"
    Write-Host "  .\install.ps1 -Uninstall" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# Main installation flow
function Main {
    Write-Host ""
    Write-Host "🖼️  Image Gallery Server CLI Installer" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Handle command line arguments
    if ($Help) {
        Show-Help
        return
    }
    
    if ($Uninstall) {
        Uninstall-Gallery
        return
    }
    
    $TempData = $null
    
    try {
        Test-Requirements
        $TempData = Get-Package
        Install-Package -SourcePath $TempData.SourcePath -TempDir $TempData.TempDir
        $BinDir = New-GlobalCommand
        Test-Installation -BinDir $BinDir
        
        Write-Host ""
        Write-Host "🚀 Ready to create beautiful image galleries!" -ForegroundColor Green
        Write-Host "   Start with: gallery up" -ForegroundColor Green
        Write-Host ""
        
        # Smart terminal detection and guidance
        Show-PostInstallGuidance
    }
    catch {
        Write-Error "Installation failed: $($_.Exception.Message)"
    }
    finally {
        if ($TempData) {
            Remove-TempFiles -TempDir $TempData.TempDir
        }
    }
}

# Execute main function
Main