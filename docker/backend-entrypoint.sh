#!/bin/bash
set -euo pipefail
cd /app

mkdir -p /app/data/cert

# Hostnames/IPs derived from VITE_API_BASE_URL end up in CORS_ORIGINS and
# the cert SAN (-addext) — only accept plain hostname/IP characters.
valid_host() {
    echo "$1" | grep -qE '^[A-Za-z0-9.-]+$'
}

# ── 1. Generate .env if missing ──
if [ ! -f /app/data/.env ]; then
    API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    ENC_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

    # In Docker, hostname -I returns the container IP (useless for LAN access).
    # Default to localhost; override with VITE_API_BASE_URL env var for LAN access.
    BASE_URL="${VITE_API_BASE_URL:-https://localhost:8000}"

    # Allow the frontend origin (port 5173) on the same host as the API
    API_HOST=$(echo "$BASE_URL" | sed 's|.*://||;s|:.*||;s|/.*||')
    CORS_LIST="https://localhost:5173,https://127.0.0.1:5173"
    if [ -n "$API_HOST" ] && [ "$API_HOST" != "localhost" ] && [ "$API_HOST" != "127.0.0.1" ]; then
        if valid_host "$API_HOST"; then
            CORS_LIST="${CORS_LIST},https://${API_HOST}:5173"
        else
            echo "[backend] WARNING: host '${API_HOST}' from VITE_API_BASE_URL contains invalid characters; skipping CORS entry"
        fi
    fi

    umask 177
    cat > /app/data/.env <<EOF
MASTER_API_KEY=${API_KEY}
DATABASE_URL=sqlite:///./data/ApexAlgoDB.sqlite3
ENCRYPTION_KEY=${ENC_KEY}
VITE_API_BASE_URL=${BASE_URL}
CORS_ORIGINS=${CORS_LIST}
EOF
    umask 022
    echo "[backend] Generated new .env"
    echo "[backend] VITE_API_BASE_URL=${BASE_URL}"
    echo "[backend] For LAN access, edit data/.env and restart"
    echo "[backend] Enter the MASTER_API_KEY from data/.env in the web UI to log in"
else
    echo "[backend] Using existing .env"
    # Older .env files predate CORS_ORIGINS — derive it from VITE_API_BASE_URL
    # so LAN deployments keep working without a manual edit.
    if ! grep -q '^CORS_ORIGINS=' /app/data/.env; then
        API_HOST=$(grep '^VITE_API_BASE_URL=' /app/data/.env | sed 's|.*://||;s|:.*||;s|/.*||' || true)
        CORS_LIST="https://localhost:5173,https://127.0.0.1:5173"
        if [ -n "$API_HOST" ] && [ "$API_HOST" != "localhost" ] && [ "$API_HOST" != "127.0.0.1" ]; then
            if valid_host "$API_HOST"; then
                CORS_LIST="${CORS_LIST},https://${API_HOST}:5173"
            else
                echo "[backend] WARNING: host '${API_HOST}' from VITE_API_BASE_URL contains invalid characters; skipping CORS entry"
            fi
        fi
        printf '\nCORS_ORIGINS=%s\n' "$CORS_LIST" >> /app/data/.env
        echo "[backend] Added CORS_ORIGINS=${CORS_LIST} to existing .env"
    fi
fi

# .env holds the master API key and encryption key — keep it private
chmod 600 /app/data/.env

# ── 2. Generate SSL certs if missing ──
if [ ! -f /app/data/cert/cert.pem ] || [ ! -f /app/data/cert/key.pem ]; then
    # Extract host/IP from VITE_API_BASE_URL in .env so the cert SAN matches
    SAN="DNS:localhost,IP:127.0.0.1"
    API_HOST=$(grep '^VITE_API_BASE_URL=' /app/data/.env | sed 's|.*://||;s|:.*||' 2>/dev/null || true)
    if [ -n "$API_HOST" ] && [ "$API_HOST" != "localhost" ]; then
        if ! valid_host "$API_HOST"; then
            echo "[backend] WARNING: host '${API_HOST}' from VITE_API_BASE_URL contains invalid characters; skipping cert SAN entry"
        # Check if it looks like an IP address
        elif echo "$API_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            SAN="${SAN},IP:${API_HOST}"
        else
            SAN="${SAN},DNS:${API_HOST}"
        fi
    fi

    openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
        -keyout /app/data/cert/key.pem \
        -out /app/data/cert/cert.pem \
        -days 365 -subj "/CN=localhost" \
        -addext "subjectAltName=${SAN}" 2>/dev/null
    echo "[backend] Generated SSL certificates (SAN: ${SAN})"
else
    echo "[backend] Using existing SSL certificates"
fi

# Symlinks so find_dotenv() and uvicorn find files at expected paths
ln -sf /app/data/.env /app/.env
ln -sf /app/data/cert /app/.cert

# ── 3. Drop privileges ──
# The container starts as root so it can fix ownership of the mounted
# data volume, then runs the app as the unprivileged 'apex' user.
# Keep .env group-readable for the host user: docker compose auto-loads
# the repo-root .env symlink, and the owner needs to read MASTER_API_KEY.
# HOST_GID comes from compose; the stat fallback only works on first run,
# before the volume has been chowned to apex.
HOST_GID="${HOST_GID:-$(stat -c %g /app/data)}"
chown -R apex:apex /app/data
if [ "$HOST_GID" != "0" ] && [ "$HOST_GID" != "10001" ]; then
    chown apex:"$HOST_GID" /app/data/.env
    chmod 640 /app/data/.env
fi

echo "[backend] Starting on https://0.0.0.0:8000 (user: apex)"
echo "[backend] NOTE: --reload is disabled. After editing backend files, run: docker compose restart backend"
exec gosu apex uvicorn backend.main:app \
    --host 0.0.0.0 --port 8000 \
    --ssl-keyfile /app/.cert/key.pem \
    --ssl-certfile /app/.cert/cert.pem \
    --log-level warning
