#!/bin/bash
# scripts/diagnose.sh - Troubleshoot CCS installation
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BINARY_PATH="$HOME/bin/ccs-host"
MANIFEST_NAME="com.ccs.host.json"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

echo "═══════════════════════════════════════════════════════════"
echo "  CCS DIAGNOSTICS"
echo "═══════════════════════════════════════════════════════════"

# 1. Binary
echo
info "[1/5] Checking binary..."
if [ -f "$BINARY_PATH" ]; then
    success "Binary exists: $BINARY_PATH"
    ls -lh "$BINARY_PATH"
else
    error "Binary not found!"
    echo "  Run: $SCRIPT_DIR/install.sh"
    exit 1
fi

# 2. Test binary
echo
info "[2/5] Testing binary protocol..."
cat > /tmp/test-ccs-diag.py << 'PYEOF'
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
except Exception as e:
    print(f"FAIL: {e}")
finally:
    proc.terminate()
PYEOF

RESULT=$(python3 /tmp/test-ccs-diag.py "$BINARY_PATH")
if [ "$RESULT" = "OK" ]; then
    success "Binary works correctly"
else
    error "Binary test failed: $RESULT"
    exit 1
fi

# 3. Find manifests
echo
info "[3/5] Searching for manifests..."
MANIFESTS=$(find ~ -name "$MANIFEST_NAME" 2>/dev/null || true)

if [ -z "$MANIFESTS" ]; then
    error "No manifests found!"
    echo "  Run: $SCRIPT_DIR/install.sh"
    exit 1
else
    while IFS= read -r manifest; do
        success "Found: $manifest"
        
        # Show content
        echo "    Extension ID: $(jq -r '.allowed_origins[0]' "$manifest" 2>/dev/null || echo "N/A")"
        echo "    Binary path:  $(jq -r '.path' "$manifest" 2>/dev/null || echo "N/A")"
    done <<< "$MANIFESTS"
fi

# 4. Check browser
echo
info "[4/5] Detecting browser installation..."

if command -v snap &> /dev/null && snap list chromium &> /dev/null 2>&1; then
    warning "Snap Chromium detected (may not work!)"
    echo "  Profile: $(find ~/snap/chromium/common/chromium -name "Default" 2>/dev/null | head -1)"
elif [ -d "$HOME/.config/chromium" ]; then
    success "Chromium (deb/non-snap)"
    echo "  Profile: $HOME/.config/chromium/Default"
elif [ -d "$HOME/.config/google-chrome" ]; then
    success "Google Chrome"
    echo "  Profile: $HOME/.config/google-chrome/Default"
else
    warning "No standard browser found"
fi

# 5. Extension check
echo
info "[5/5] Extension verification..."
EXTENSION_DIR="$PROJECT_ROOT/extension"

if [ -f "$EXTENSION_DIR/manifest.json" ]; then
    HAS_KEY=$(grep -c '"key"' "$EXTENSION_DIR/manifest.json" || true)
    
    if [ "$HAS_KEY" -gt 0 ]; then
        success "Extension has stable key"
    else
        warning "Extension lacks stable key (ID changes on reload)"
        echo "  Generate: $SCRIPT_DIR/generate-extension-key.sh"
    fi
else
    error "Extension manifest not found"
fi

# Summary
echo
echo "═══════════════════════════════════════════════════════════"
info "Checklist for browser:"
echo "  1. Go to chromium://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Find 'Copilot Code Saver' extension"
echo "  4. Verify ID matches manifest above"
echo "  5. Click RELOAD"
echo "  6. Click extension icon"
echo "  7. Should show: 'Native host connected'"
echo
info "If still failing:"
echo "  • Check extension ID: EXTENSION_ID=correct_id $SCRIPT_DIR/install.sh"
echo "  • Check browser console (F12) for errors"
echo "  • If snap: switch to .deb Chromium or Chrome"
echo "═══════════════════════════════════════════════════════════"

echo
