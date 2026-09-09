import hashlib
import hmac
import logging
import os
import secrets
import threading
import time

from dotenv import find_dotenv, load_dotenv
from fastapi import HTTPException, Request, Security, status
from fastapi.security.api_key import APIKeyHeader

load_dotenv(find_dotenv())

logger = logging.getLogger("apexalgo.security")

API_KEY = os.getenv("MASTER_API_KEY")
if not API_KEY:
    raise ValueError("FATAL ERROR: MASTER_API_KEY is missing in your .env file!")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Browser session cookie. The value is an HMAC of the master key under a
# per-boot secret, so the cookie never contains the key itself and every
# session is invalidated by a backend restart.
# CSRF: the cookie is SameSite=Strict and the UI is served same-origin
# (nginx proxies /api), so no CSRF token is used. Do not relax SameSite
# without adding one.
SESSION_COOKIE = "apex_session"
SESSION_MAX_AGE = 30 * 24 * 3600
_SESSION_SECRET = secrets.token_bytes(32)


def session_token() -> str:
    return hmac.new(_SESSION_SECRET, API_KEY.encode(), hashlib.sha256).hexdigest()


def set_session_cookie(response) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        session_token(),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=True, samesite="strict")


def header_key_valid(api_key: str | None) -> bool:
    return bool(api_key) and hmac.compare_digest(api_key, API_KEY)


def session_valid(request: Request) -> bool:
    cookie = request.cookies.get(SESSION_COOKIE)
    return bool(cookie) and hmac.compare_digest(cookie, session_token())


# Best-effort in-memory throttle for failed auth attempts per client IP
_AUTH_FAIL_LIMIT = 10
_AUTH_FAIL_WINDOW = 60.0  # seconds
_auth_failures: dict[str, list[float]] = {}
_auth_failures_lock = threading.Lock()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_auth_throttle(ip: str) -> None:
    now = time.monotonic()
    with _auth_failures_lock:
        recent = [t for t in _auth_failures.get(ip, []) if now - t < _AUTH_FAIL_WINDOW]
        if recent:
            _auth_failures[ip] = recent
        else:
            _auth_failures.pop(ip, None)
        if len(recent) >= _AUTH_FAIL_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Try again later.",
            )


def record_auth_failure(ip: str) -> None:
    with _auth_failures_lock:
        _auth_failures.setdefault(ip, []).append(time.monotonic())
    logger.warning("Auth failure from %s", ip)


async def verify_api_key(request: Request, api_key: str = Security(api_key_header)):
    ip = client_ip(request)
    check_auth_throttle(ip)

    if session_valid(request) or header_key_valid(api_key):
        return API_KEY

    record_auth_failure(ip)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="403 Forbidden No Auth.",
    )
