#!/bin/bash
set -e

echo "Building ccs-host..."
cargo build --release

echo "Installing binary..."
mkdir -p ~/bin
cp target/release/ccs-host ~/bin/
chmod +x ~/bin/ccs-host

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

cat > "$MANIFEST_DIR/com.ccs.host.json" << EOF
{
  "name": "com.ccs.host",
  "description": "Copilot Code Saver Native Host",
  "path": "$HOME/bin/ccs-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "Creating default config..."
mkdir -p ~/.config/copilot-code-saver
if [ ! -f ~/.config/copilot-code-saver/projects.toml ]; then
    cp config.example.toml ~/.config/copilot-code-saver/projects.toml
    echo "Edit ~/.config/copilot-code-saver/projects.toml to add your projects"
fi

echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit ~/.config/copilot-code-saver/projects.toml"
echo "2. Reload the extension in Chrome"
