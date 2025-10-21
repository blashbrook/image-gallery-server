#!/usr/bin/env bash

# Local Image Gallery Server CLI Installer
# Run from the project directory: ./install-local.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.gallery-cli"
BIN_NAME="gallery"

# Helper functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check requirements
check_requirements() {
    info "Checking system requirements..."
    
    # Check if we're in the right directory
    if [ ! -f "$SCRIPT_DIR/package.json" ] || [ ! -f "$SCRIPT_DIR/bin/gallery.js" ]; then
        error "This script must be run from the image-gallery-server directory"
    fi
    
    # Check Node.js
    if ! command_exists node; then
        error "Node.js is not installed. Please install Node.js 18+ and try again."
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version 18 or higher is required. Current version: $(node -v)"
    fi
    
    # Check npm
    if ! command_exists npm; then
        error "npm is not installed. Please install npm and try again."
    fi
    
    success "System requirements met"
}

# Install dependencies
install_dependencies() {
    info "Installing npm dependencies..."
    
    cd "$SCRIPT_DIR"
    npm install --only=production --silent
    
    success "Dependencies installed"
}

# Copy files to install directory
install_package() {
    info "Installing package to $INSTALL_DIR..."
    
    # Remove existing installation
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
    fi
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy necessary files
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
    
    # Make the CLI executable
    chmod +x "$INSTALL_DIR/bin/gallery.js"
    
    success "Package installed to $INSTALL_DIR"
}

# Create global symlink
create_symlink() {
    info "Setting up global command..."
    
    # Determine the best location for the symlink
    local bin_dir
    
    # Check common bin directories in order of preference
    if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
        bin_dir="/usr/local/bin"
    elif [ -d "$HOME/.local/bin" ]; then
        bin_dir="$HOME/.local/bin"
        # Add to PATH if not already there
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc" 2>/dev/null || true
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
        fi
    else
        mkdir -p "$HOME/.local/bin"
        bin_dir="$HOME/.local/bin"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc" 2>/dev/null || true
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
    fi
    
    # Remove existing symlink if it exists
    [ -L "$bin_dir/$BIN_NAME" ] && rm "$bin_dir/$BIN_NAME"
    
    # Create symlink
    ln -sf "$INSTALL_DIR/bin/gallery.js" "$bin_dir/$BIN_NAME"
    
    success "Global command '$BIN_NAME' created at $bin_dir/$BIN_NAME"
    
    if [ "$bin_dir" = "$HOME/.local/bin" ]; then
        warning "Added $HOME/.local/bin to PATH. Restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
    fi
}

# Verify installation
verify_installation() {
    info "Verifying installation..."
    
    # Check if command is available
    if command_exists "$BIN_NAME"; then
        success "Gallery CLI installed successfully!"
        
        echo ""
        echo "🎉 Installation complete!"
        echo ""
        echo "Available commands:"
        echo "  gallery up                    # Start server in current directory"
        echo "  gallery up -d ~/Pictures     # Start server for specific directory"
        echo "  gallery scan                  # Preview scan results"
        echo "  gallery stop                  # Stop all gallery servers"
        echo "  gallery rescan                # Force rescan of current directory"
        echo "  gallery cleanup               # Clean up orphaned thumbnails"
        echo "  gallery delete                # Clean up all cache files"
        echo ""
        
        # Test basic functionality - just check if the file exists and is executable
        if [ -x "$INSTALL_DIR/bin/gallery.js" ]; then
            success "Installation verified"
        else
            warning "Command installed but may not be working correctly"
        fi
    else
        warning "Command not immediately available in PATH. Shell restart required."
    fi
}

# Uninstall function
uninstall() {
    info "Uninstalling Image Gallery CLI..."
    
    # Remove symlink
    local bin_locations=("/usr/local/bin" "$HOME/.local/bin" "/usr/bin")
    for bin_dir in "${bin_locations[@]}"; do
        if [ -L "$bin_dir/$BIN_NAME" ]; then
            rm "$bin_dir/$BIN_NAME"
            success "Removed $bin_dir/$BIN_NAME"
        fi
    done
    
    # Remove installation directory
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        success "Removed $INSTALL_DIR"
    fi
    
    success "Image Gallery CLI uninstalled successfully"
    exit 0
}

# Main installation flow
main() {
    echo ""
    echo "🖼️  Image Gallery Server CLI Local Installer"
    echo "==========================================="
    echo ""
    
    # Check for uninstall flag
    if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "-u" ]; then
        uninstall
        return
    fi
    
    # Show help
    if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h        Show this help message"
        echo "  --uninstall, -u   Uninstall Image Gallery CLI"
        echo ""
        echo "This script installs the Gallery CLI globally from the current directory."
        echo "Make sure you're in the image-gallery-server project directory."
        echo ""
        exit 0
    fi
    
    check_requirements
    install_dependencies
    install_package
    create_symlink
    verify_installation
    
    echo "🚀 Ready to create beautiful image galleries!"
    echo "   Start with: gallery up"
    echo ""
    echo "💡 Restarting shell to update PATH..."
    
    # Try to restart the shell
    if [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
        echo "exec zsh" 
        exec zsh
    elif [ "$SHELL" = "/bin/bash" ] || [ "$SHELL" = "/usr/bin/bash" ]; then
        echo "exec bash"
        exec bash
    else
        echo "Please restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
    fi
}

# Run main function with all arguments
main "$@"