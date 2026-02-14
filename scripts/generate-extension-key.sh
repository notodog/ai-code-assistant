#!/bin/bash
# scripts/generate-extension-key.sh - Generate stable extension key
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/extension"
KEY_FILE="$PROJECT_ROOT/extension-key.pem"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

echo
info "Generating stable extension key..."

if [ -f "$KEY_FILE" ]; then
    warning "Key already exists: $KEY_FILE"
    read -p "Regenerate? (changes extension ID!) (y/n) " REGEN
    if [ "$REGEN" != "y" ]; then
        exit 0
    fi
fi

# Generate key
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out "$KEY_FILE"
success "Private key: $KEY_FILE"

# Extract public key
KEY_BASE64=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | base64 -w 0)

# Update manifest
if [ ! -f "$EXTENSION_DIR/manifest.json" ]; then
    error "Manifest not found: $EXTENSION_DIR/manifest.json"
    exit 1
fi

cp "$EXTENSION_DIR/manifest.json" "$EXTENSION_DIR/manifest.json.backup"

if command -v jq &> /dev/null; then
    jq --arg key "$KEY_BASE64" '. + {key: $key}' "$EXTENSION_DIR/manifest.json" > "$EXTENSION_DIR/manifest.json.tmp"
    mv "$EXTENSION_DIR/manifest.json.tmp" "$EXTENSION_DIR/manifest.json"
    success "Key added to manifest.json"
else
    warning "jq not installed - manual edit required"
    echo
    echo "Add after \"manifest_version\":"
    echo "  \"key\": \"$KEY_BASE64\","
fi

# Update .gitignore
GITIGNORE="$PROJECT_ROOT/.gitignore"
if ! grep -q "extension-key.pem" "$GITIGNORE" 2>/dev/null; then
    echo "extension-key.pem" >> "$GITIGNORE"
    success "Added to .gitignore"
fi

echo
success "Extension key generated!"
echo
info "Next steps:"
echo "  1. Reload extension in chromium://extensions"
echo "  2. Copy NEW extension ID"
echo "  3. Run: EXTENSION_ID=new_id $SCRIPT_DIR/install.sh"
echo "  4. Or update DEFAULT_EXT_ID in install.sh"
echo
warning "Keep extension-key.pem private!"

echo
