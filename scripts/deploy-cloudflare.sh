#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.config/cloudflare/deploy.env"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
corepack pnpm --filter @pm/shared build
VITE_API_URL="" corepack pnpm --filter @pm/web build
corepack pnpm --filter @pm/api exec wrangler deploy --config ../../wrangler.jsonc
