#!/usr/bin/env bash
# One-time EC2 bootstrap for the GitHub Actions deploy.
# Run on the server:  bash ec2-setup.sh
# Works on Ubuntu and Amazon Linux 2023.
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y rsync curl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y rsync tar
fi

# Node 20 via nvm (no sudo needed for npm/pm2 afterwards)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm alias default 20
fi

export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

npm install -g pm2
mkdir -p ~/vcg_backend/uploads

# Start PM2 on reboot
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME"

echo
echo "Done. node $(node -v), pm2 $(pm2 -v)"
