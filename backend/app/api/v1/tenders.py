from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_officer
from app.models.bidder import Bidder
from app.models.tender import Requirement, Tender, TenderBidder
from app.models.user import User
from app.schemas.tender import RequirementCreate, RequirementOut, TenderCreate, TenderDetailOut, TenderOut, TenderUpdate
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/tenders", tags=["Tenders"])


@router.post("")
def create_tender(payload: TenderCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(Tender).filter(Tender.tender_number == payload.tender_number).first():
        raise HTTPException(status_code=409, detail=f"A tender with reference number '{payload.tender_number}' already exists")
    if db.query(Tender).filter(Tender.gem_tender_id == payload.gem_tender_id).first():
        raise HTTPException(status_code=409, detail=f"A tender with GeM tender ID '{payload.gem_tender_id}' already exists")
    data = payload.model_dump(exclude={"requirements"})
    tender = Tender(**data, created_by=current_user.id)
    db.add(tender)
    db.flush()
    for req in payload.requirements:
        db.add(Requirement(tender_id=tender.id, **req.model_dump()))
    db.commit()
    db.refresh(tender)
    log_action(db, action="TENDER_CREATED", actor=current_user, entity_type="Tender", entity_id=tender.id, tender_id=tender.id, description=f"Tender created: {tender.title}")
    return success(_detail(db, tender), "Tender created")


def _detail(db: Session, tender: Tender) -> dict:
    reqs = db.query(Requirement).filter(Requirement.tender_id == tender.id).all()
    out = TenderDetailOut.model_validate(tender).model_dump()
    out["requirements"] = [RequirementOut.model_validate(r).model_dump() for r in reqs]
    return out


@router.get("")
def list_tenders(status: str | None = None, q: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Tender)
    if status:
        query = query.filter(Tender.status == status)
    if q:
        query = query.filter(Tender.title.ilike(f"%{q}%"))
    tenders = query.order_by(Tender.created_at.desc()).all()
    return success([TenderOut.model_validate(t).model_dump() for t in tenders], "Tenders retrieved")


@router.get("/{tender_id}")
def get_tender(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    return success(_detail(db, tender), "Tender retrieved")


@router.put("/{tender_id}")
def update_tender(tender_id: str, payload: TenderUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tender, field, value)
    db.commit()
    db.refresh(tender)
    log_action(db, action="TENDER_UPDATED", actor=current_user, entity_type="Tender", entity_id=tender.id, tender_id=tender.id, description=f"Tender updated: {tender.title}")
    return success(_detail(db, tender), "Tender updated")


@router.post("/{tender_id}/requirements")
def add_requirement(tender_id: str, payload: RequirementCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    req = Requirement(tender_id=tender_id, **payload.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    log_action(db, action="REQUIREMENT_ADDED", actor=current_user, entity_type="Requirement", entity_id=req.id, tender_id=tender_id, description=f"Requirement added: {req.requirement_type}")
    return success(RequirementOut.model_validate(req).model_dump(), "Requirement added")


@router.get("/{tender_id}/requirements")
def list_requirements(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reqs = db.query(Requirement).filter(Requirement.tender_id == tender_id).all()
    return success([RequirementOut.model_validate(r).model_dump() for r in reqs], "Requirements retrieved")


@router.post("/{tender_id}/bidders/{bidder_id}")
def add_bidder_to_tender(tender_id: str, bidder_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not tender or not bidder:
        raise HTTPException(status_code=404, detail="Tender or Bidder not found")
    existing = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id, TenderBidder.bidder_id == bidder_id).first()
    if existing:
        return success({"tender_id": tender_id, "bidder_id": bidder_id}, "Bidder already associated with tender")
    link = TenderBidder(tender_id=tender_id, bidder_id=bidder_id, invited_at=datetime.now(timezone.utc))
    db.add(link)
    db.commit()
    log_action(db, action="BIDDER_ADDED_TO_TENDER", actor=current_user, entity_type="TenderBidder", tender_id=tender_id, bidder_id=bidder_id, description=f"{bidder.company_name} added to tender {tender.title}")
    return success({"tender_id": tender_id, "bidder_id": bidder_id}, "Bidder added to tender")


@router.get("/{tender_id}/bidders")
def list_tender_bidders(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    links = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
    bidder_ids = [l.bidder_id for l in links]
    bidders = db.query(Bidder).filter(Bidder.id.in_(bidder_ids)).all() if bidder_ids else []
    from app.schemas.bidder import BidderOut

    return success([BidderOut.model_validate(b).model_dump() for b in bidders], "Tender bidders retrieved")


@router.post("/{tender_id}/flag")
def flag_tender(
    tender_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_officer),
):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    
    flagged = payload.get("is_flagged", True)
    reason = payload.get("reason", "Flagged for compliance review")
    
    tender.is_flagged = flagged
    tender.flagged_reason = reason if flagged else None
    if flagged and tender.status == "ACTIVE":
        tender.status = "FLAGGED"
    elif not flagged and tender.status == "FLAGGED":
        tender.status = "ACTIVE"
        
    db.commit()
    db.refresh(tender)
    
    action = "TENDER_FLAGGED" if flagged else "TENDER_UNFLAGGED"
    log_action(
        db,
        action=action,
        actor=current_user,
        entity_type="Tender",
        entity_id=tender.id,
        tender_id=tender.id,
        description=f"Tender {tender.tender_number} {'flagged' if flagged else 'unflagged'}: {reason}",
    )
    return success(_detail(db, tender), f"Tender {'flagged' if flagged else 'unflagged'} successfully")

