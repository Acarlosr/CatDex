from fastapi import APIRouter, Depends

from backend.core.security import verify_api_key
from backend.engine.indicator_registry import registry_payload

router = APIRouter(
    prefix="/api/indicators",
    tags=["Indicators"],
    dependencies=[Depends(verify_api_key)]
)


@router.get("")
async def list_indicators():
    """Indicator palette for the strategy builder, generated from the backend registry."""
    return registry_payload()
