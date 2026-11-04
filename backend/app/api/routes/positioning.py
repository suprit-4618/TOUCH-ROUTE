from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.positioning import (
    PositionUpdatePayload,
    PositionUpdateResult,
    RelocalizeRequest,
)
from app.services.navigation.positioning import positioning_engine

router = APIRouter()


@router.post(
    "/update",
    response_model=PositionUpdateResult,
    summary="Process real-time or simulated indoor positioning update with safety checks",
)
def update_position(payload: PositionUpdatePayload, db: Session = Depends(get_db)):
    """
    CRITICAL REAL-TIME SAFETY GATE:
    Evaluates current estimated position against verified building topology.
    If cross-track deviation exceeds tolerance or confidence drops,
    it flags POSITION_UNCERTAIN or POSITION_LOST, and generates an emergency
    voice stop alert instead of misleading the blind user.
    """
    return positioning_engine.process_position_update(db=db, payload=payload)


@router.post(
    "/relocalize",
    response_model=PositionUpdateResult,
    summary="Re-establish verified position via physical marker scan or confirmed landmark",
)
def relocalize_position(payload: RelocalizeRequest, db: Session = Depends(get_db)):
    """
    Immediately resets positioning state to POSITION_CONFIRMED with 1.0 confidence
    once the user touches a tactile Braille marker, scans an NFC tag, or confirms
    a prominent landmark with staff.
    """
    return positioning_engine.relocalize(db=db, payload=payload)

