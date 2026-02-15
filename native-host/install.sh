#!/bin/bash
set -e

echo "Building ai-code-host..."
cargo build --release

echo "Installing binary..."
mkdir -p ~/bin
cp target/release/ai-code-host ~/bin/
chmod +x ~/bin/ai-code-host

echo "Installing native messaging manifest..."
MANIFEST_DIR=""
if [ -d ~/.config/google-chrome ]; then
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
elif [ -d ~/.config/chromium ]; then
    MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
else
    echo "Chrome/Chromium config not found. Creating for both..."
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

mkdir -p "$MANIFEST_DIR"

# Get extension ID (user must fill this in)
read -p "Enter your extension ID (from chrome://extensions): " EXT_ID

cat > "$MANIFEST_DIR/com.aicode.host.json" << EOF
{
  "name": "com.aicode.host",
  "description": "AI Code Assistant native messaging host",
  "path": "$HOME/bin/ai-code-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Reload the extension in Chrome"
echo "2. Add projects in the extension popup dialog"
