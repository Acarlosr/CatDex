import logging
import os
import hmac
import threading
import time
from fastapi import Request, Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

logger = logging.getLogger("apexalgo.security")

API_KEY = os.getenv("MASTER_API_KEY")
if not API_KEY:
    raise ValueError("FATAL ERROR: MASTER_API_KEY is missing in your .env file!")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Best-effort in-memory throttle for failed auth attempts per client IP
_AUTH_FAIL_LIMIT = 10
_AUTH_FAIL_WINDOW = 60.0  # seconds
_auth_failures: dict[str, list[float]] = {}
_auth_failures_lock = threading.Lock()


async def verify_api_key(request: Request, api_key: str = Security(api_key_header)):
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()

    with _auth_failures_lock:
        recent = [t for t in _auth_failures.get(client_ip, []) if now - t < _AUTH_FAIL_WINDOW]
        if recent:
            _auth_failures[client_ip] = recent
        else:
            _auth_failures.pop(client_ip, None)
        if len(recent) >= _AUTH_FAIL_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Try again later.",
            )

    if api_key and hmac.compare_digest(api_key, API_KEY):
        return api_key

    with _auth_failures_lock:
        _auth_failures.setdefault(client_ip, []).append(now)
    logger.warning("Auth failure from %s", client_ip)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="403 Forbidden No Auth.",
    )
