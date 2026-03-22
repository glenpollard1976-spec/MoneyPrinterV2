#!/usr/bin/env bash
# NemoClaw setup script for MoneyPrinterV2
# Run this from your local machine (requires nemoclaw, Docker, and NVIDIA Container Toolkit)

set -euo pipefail

SANDBOX_NAME="moneyprinter-agent"
POLICY_FILE="$(dirname "$0")/moneyprinter-policy.yaml"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking prerequisites..."

if ! command -v nemoclaw &>/dev/null; then
  echo "ERROR: nemoclaw not found. Install with: npm install -g nemoclaw"
  exit 1
fi

if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
  echo "ERROR: Docker is not running. Start Docker and retry."
  exit 1
fi

if ! command -v nvidia-smi &>/dev/null; then
  echo "ERROR: nvidia-smi not found. Ensure NVIDIA drivers and Container Toolkit are installed."
  exit 1
fi

echo "==> Prerequisites OK"
echo "==> Onboarding sandbox: $SANDBOX_NAME"

PROJECT_ROOT="$PROJECT_ROOT" \
  nemoclaw onboard \
    --non-interactive \
    --name "$SANDBOX_NAME"

echo "==> Applying sandbox policy..."

PROJECT_ROOT="$PROJECT_ROOT" \
  nemoclaw policy apply "$POLICY_FILE"

echo "==> Verifying sandbox status..."

nemoclaw "$SANDBOX_NAME" status --json

echo ""
echo "Setup complete. Sandbox '$SANDBOX_NAME' is ready."
echo "To connect: nemoclaw $SANDBOX_NAME connect"
