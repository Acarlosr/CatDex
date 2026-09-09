from fastapi import APIRouter, HTTPException, Request, Response, Security, status
from pydantic import BaseModel

from backend.core.security import (
    api_key_header,
    check_auth_throttle,
    clear_session_cookie,
    client_ip,
    header_key_valid,
    record_auth_failure,
    session_valid,
    set_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    api_key: str


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    ip = client_ip(request)
    check_auth_throttle(ip)
    if not header_key_valid(body.api_key.strip()):
        record_auth_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key.")
    set_session_cookie(response)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(request: Request, api_key: str | None = Security(api_key_header)):
    # Session probe on every page load — deliberately not counted as a
    # failed attempt, so it never feeds the per-IP throttle.
    if session_valid(request) or header_key_valid(api_key):
        return {"ok": True}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
