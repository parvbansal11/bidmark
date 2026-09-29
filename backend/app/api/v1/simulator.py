from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.engines.simulator_engine import simulate
from app.models.user import User
from app.schemas.simulator import SimulateRequest
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/simulator", tags=["Simulator"])


@router.post("/{tender_id}")
def run_simulation(tender_id: str, payload: SimulateRequest, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        result = simulate(db, tender_id, [o.model_dump(exclude_none=True) for o in payload.overrides], payload.bidder_ids)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(
        db, action="WHAT_IF_SIMULATION", actor=current_user, entity_type="Tender", entity_id=tender_id, tender_id=tender_id,
        description=f"What-If simulation run with {len(payload.overrides)} override(s) across {len(result['bidders'])} bidder(s)",
    )
    return success(result, "Simulation completed (no tender data was modified)")
