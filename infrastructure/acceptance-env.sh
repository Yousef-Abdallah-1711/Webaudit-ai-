#!/bin/sh
# Writes .env.acceptance (git-ignored) with RANDOM throwaway secrets for the disposable acceptance stack only.
# Never reuse these values anywhere else and never point the stack at real infrastructure.
set -eu
out="${1:-.env.acceptance}"
if [ -e "$out" ]; then echo "$out already exists; remove it first to regenerate" >&2; exit 1; fi
rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
umask 077
cat > "$out" <<EOF
POSTGRES_PASSWORD=$(rand)
API_DB_PASSWORD=$(rand)
WORKER_DB_PASSWORD=$(rand)
ORCHESTRATOR_DB_PASSWORD=$(rand)
ENCRYPTION_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
JWT_ACCESS_SECRET=$(rand)$(rand)
JWT_REFRESH_SECRET=$(rand)$(rand)
MINIO_ROOT_USER=accept$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')
MINIO_ROOT_PASSWORD=$(rand)
SCAN_EXECUTION_PLANS=
EOF
echo "wrote $out"
