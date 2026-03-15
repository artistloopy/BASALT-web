#!/usr/bin/env bash
set -euo pipefail

echo "This script will create a local .env file with your Supabase credentials."
echo "It will not send your keys anywhere. Ensure you're running this locally."

read -p "Supabase Project URL (e.g. https://xxxx.supabase.co): " SUPABASE_URL
read -s -p "Supabase ANON KEY (will be hidden): " SUPABASE_ANON_KEY
echo

if [ -z "${SUPABASE_URL}" ] || [ -z "${SUPABASE_ANON_KEY}" ]; then
  echo "Both values are required. Aborting."
  exit 1
fi

cat > .env <<EOF
PUBLIC_SUPABASE_URL=${SUPABASE_URL}
PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
EOF

chmod 600 .env || true
echo ".env created with Supabase credentials. Restart your dev server if it's running (pnpm run dev)."
