from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.engines.cross_bidder_graph_engine import build_relationship_graph
from app.engines.red_flag_cascade import build_red_flag_cascade
from app.models.user import User
from app.utils.responses import success

router = APIRouter(tags=["Cross-Bidder Intelligence"])


@router.get("/api/v1/cross-bidder/graph/{tender_id}")
def relationship_graph(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        graph = build_relationship_graph(db, tender_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return success(graph, "Cross-bidder relationship graph generated")


@router.get("/api/v1/red-flag-cascade/{bidder_id}/{tender_id}")
def red_flag_cascade(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    cascade = build_red_flag_cascade(db, bidder_id, tender_id)
    return success(cascade, "Red flag cascade generated")
