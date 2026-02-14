#!/bin/bash
# scripts/install.sh - Install CCS native host and configure browsers
set -e

# ============ PATHS ============

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_HOST_DIR="$PROJECT_ROOT/native-host"
EXTENSION_DIR="$PROJECT_ROOT/extension"

BINARY_NAME="ai-code-host"
MANIFEST_NAME="com.aicode.host.json"
HOST_NAME="com.aicode.host"
HOST_DESCRIPTION="AI Code Assistant native messaging host"

DEFAULT_EXT_ID="jnifdaopghlhkgkghjlpmfngonndlped"
EXTENSION_ID="${EXTENSION_ID:-}"

# ============ COLORS ============

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
bold() { echo -e "${BOLD}$1${NC}"; }

# ============ BUILD BINARY ============

echo
bold "═══════════════════════════════════════════════════════════"
bold "  COPILOT CODE SAVER - INSTALLATION"
bold "═══════════════════════════════════════════════════════════"

echo
info "Step 1/4: Building native host..."

cd "$NATIVE_HOST_DIR"
cargo build --release

if [ ! -f "target/release/$BINARY_NAME" ]; then
    error "Build failed"
    exit 1
fi

success "Build complete"

# ============ INSTALL BINARY ============

echo
info "Step 2/4: Installing binary..."

BINARY_DIR="$HOME/bin"
BINARY_PATH="$BINARY_DIR/$BINARY_NAME"

mkdir -p "$BINARY_DIR"
cp "$NATIVE_HOST_DIR/target/release/$BINARY_NAME" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

success "Binary installed: $BINARY_PATH"

# Test binary
info "Testing binary..."
cat > /tmp/test-ccs-install.py << 'PYEOF'
import struct, json, subprocess, sys
proc = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
msg = json.dumps({"action": "ping"}).encode('utf-8')
proc.stdin.write(struct.pack('I', len(msg)))
proc.stdin.write(msg)
proc.stdin.flush()
try:
    length = struct.unpack('I', proc.stdout.read(4))[0]
    response = json.loads(proc.stdout.read(length))
    print("OK" if response.get('success') else "FAIL")
except: print("FAIL")
finally: proc.terminate()
PYEOF

if [ "$(python3 /tmp/test-ccs-install.py "$BINARY_PATH")" = "OK" ]; then
    success "Binary test passed"
else
    error "Binary test failed"
    exit 1
fi

# ============ DETECT BROWSERS ============

echo
info "Step 3/4: Detecting browsers..."

declare -a MANIFEST_LOCATIONS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts|Google Chrome|deb|recommended"
    "$HOME/.config/chromium/NativeMessagingHosts|Chromium|deb|recommended"
    "$HOME/snap/chromium/common/chromium/NativeMessagingHosts|Chromium|snap|warning"
    "$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts|Google Chrome|flatpak|recommended"
    "$HOME/.var/app/org.chromium.Chromium/config/chromium/NativeMessagingHosts|Chromium|flatpak|recommended"
)

DETECTED_LOCATIONS=()
HAS_SNAP=0
HAS_DEB=0

echo
for entry in "${MANIFEST_LOCATIONS[@]}"; do
    IFS='|' read -r location browser install_type status <<< "$entry"
    PARENT_DIR=$(dirname "$location")
    
    if [ -d "$PARENT_DIR" ]; then
        DETECTED_LOCATIONS+=("$location|$browser|$install_type|$status")
        
        if [ "$status" = "warning" ]; then
            warning "Found: $browser ($install_type) ⚠️  May not work"
            HAS_SNAP=1
        else
            success "Found: $browser ($install_type)"
            HAS_DEB=1
        fi
        
        echo "         → $location"
    fi
done

echo

if [ ${#DETECTED_LOCATIONS[@]} -eq 0 ]; then
    warning "No browsers detected"
    info "Will create default location: $HOME/.config/chromium/NativeMessagingHosts"
    DETECTED_LOCATIONS+=("$HOME/.config/chromium/NativeMessagingHosts|Chromium (default)|manual|recommended")
fi

# ============ SNAP WARNING & CHOICE ============

if [ $HAS_SNAP -eq 1 ]; then
    echo
    warning "═══════════════════════════════════════════════════════════"
    warning "  SNAP CHROMIUM DETECTED"
    warning ""
    warning "  Snap's sandbox typically blocks native messaging."
    
    if [ $HAS_DEB -eq 1 ]; then
        warning ""
        warning "  You also have non-snap browsers installed."
        warning "  Recommendation: Use those instead of snap."
        echo
        echo "Options:"
        echo "  1. Install manifests in ALL locations (default)"
        echo "  2. Skip snap Chromium (install only in non-snap)"
        echo "  3. Cancel installation"
        echo
        read -p "Choice [1/2/3]: " CHOICE
        
        case "$CHOICE" in
            2)
                info "Skipping snap Chromium"
                # Filter out snap entries
                FILTERED=()
                for entry in "${DETECTED_LOCATIONS[@]}"; do
                    if [[ ! "$entry" =~ snap ]]; then
                        FILTERED+=("$entry")
                    fi
                done
                DETECTED_LOCATIONS=("${FILTERED[@]}")
                ;;
            3)
                info "Installation cancelled"
                exit 0
                ;;
            *)
                info "Installing in all locations (including snap)"
                warning "Snap may not work - see README for alternatives"
                ;;
        esac
    else
        warning ""
        warning "  Snap is your ONLY detected browser."
        warning "  Installation will proceed, but may not work."
        warning ""
        warning "  Recommended alternatives:"
        warning "    • sudo apt install chromium-browser  (deb)"
        warning "    • Install Google Chrome (deb)"
        echo
        read -p "Continue anyway? (y/n) " CONTINUE
        if [ "$CONTINUE" != "y" ]; then
            exit 0
        fi
    fi
    warning "═══════════════════════════════════════════════════════════"
fi

# ============ GET EXTENSION ID ============

echo
info "Step 4/4: Configuring extension ID..."

# Check for stable key
if [ -f "$EXTENSION_DIR/manifest.json" ]; then
    HAS_KEY=$(grep -c '"key"' "$EXTENSION_DIR/manifest.json" || true)
    if [ "$HAS_KEY" -gt 0 ]; then
        success "Extension has stable key"
    else
        warning "Extension lacks stable key (ID changes on reload)"
        info "Generate one: $SCRIPT_DIR/generate-extension-key.sh"
    fi
fi

# Get extension ID
if [ -n "$EXTENSION_ID" ]; then
    info "Using extension ID from environment: $EXTENSION_ID"
elif [ -n "$DEFAULT_EXT_ID" ]; then
    echo
    info "Default extension ID: $DEFAULT_EXT_ID"
    echo
    echo "  [Enter] - Use default"
    echo "  [ID]    - Enter custom ID from chromium://extensions"
    echo
    read -p "Extension ID: " USER_INPUT
    
    if [ -z "$USER_INPUT" ]; then
        EXTENSION_ID="$DEFAULT_EXT_ID"
    else
        EXTENSION_ID="$USER_INPUT"
    fi
else
    echo
    info "Get extension ID from chromium://extensions"
    read -p "Extension ID: " EXTENSION_ID
fi

if [ -z "$EXTENSION_ID" ]; then
    error "No extension ID provided"
    exit 1
fi

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
    warning "Extension ID format unusual (expected 32 chars a-p)"
fi

success "Using extension ID: $EXTENSION_ID"

# ============ INSTALL MANIFESTS ============

echo
info "Installing native messaging manifests..."
echo

INSTALL_COUNT=0
INSTALLED_LIST=()

for entry in "${DETECTED_LOCATIONS[@]}"; do
    IFS='|' read -r location browser install_type status <<< "$entry"
    MANIFEST_PATH="$location/$MANIFEST_NAME"
    
    # Create directory
    mkdir -p "$location"
    
    # Write manifest with absolute paths (never use ~)
    cat > "$MANIFEST_PATH" << EOF
{
  "name": "$HOST_NAME",
  "description": "$HOST_DESCRIPTION",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
    
    # Verify JSON
    if command -v jq &> /dev/null; then
        if ! jq empty "$MANIFEST_PATH" 2>/dev/null; then
            error "Invalid JSON for $browser"
            cat "$MANIFEST_PATH"
            exit 1
        fi
    fi
    
    # Report installation
    if [ "$status" = "warning" ]; then
        warning "Installed: $browser ($install_type) ⚠️"
    else
        success "Installed: $browser ($install_type)"
    fi
    
    echo "           $MANIFEST_PATH"
    
    INSTALLED_LIST+=("  • $browser ($install_type): $MANIFEST_PATH")
    ((INSTALL_COUNT++))
done

# ============ SUMMARY ============

echo
bold "═══════════════════════════════════════════════════════════"
success "  INSTALLATION COMPLETE!"
bold "═══════════════════════════════════════════════════════════"

echo
bold "Installed Components:"
echo "  Binary:      $BINARY_PATH"
echo "  Extension:   chrome-extension://$EXTENSION_ID/"
echo "  Manifests:   $INSTALL_COUNT location(s)"
echo

bold "Manifest Locations:"
for item in "${INSTALLED_LIST[@]}"; do
    echo "$item"
done

echo
bold "═══════════════════════════════════════════════════════════"
info "Next Steps:"
echo "  1. Open your browser (Chrome/Chromium)"
echo "  2. Go to: chromium://extensions"
echo "  3. Enable 'Developer mode' (top right)"
echo "  4. Verify extension ID matches: $EXTENSION_ID"
echo "     (If different, re-run: EXTENSION_ID=actual_id ./scripts/install.sh)"
echo "  5. Click RELOAD button on 'Copilot Code Saver'"
echo "  6. Click extension icon in toolbar"
echo "  7. Should show: '✓ Native host connected'"

echo
info "Troubleshooting:"
echo "  • Diagnose:    $SCRIPT_DIR/diagnose.sh"
echo "  • Stable ID:   $SCRIPT_DIR/generate-extension-key.sh"
echo "  • Test binary: python3 $SCRIPT_DIR/test-native-host.py"

if [ $HAS_SNAP -eq 1 ]; then
    echo
    warning "If snap Chromium fails, switch to .deb or Chrome (see README)"
fi

bold "═══════════════════════════════════════════════════════════"

echo
