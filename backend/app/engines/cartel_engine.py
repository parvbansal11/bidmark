"""Proxy-bidder and cartel detection for one tender.

Two independent lines of evidence:

1. Links. Bidders that claim to be separate companies but share a device, a
   network, a document author, a director, a contact or the exact same file.
   Links are grouped into rings with union-find.

2. Price screens from the bid-rigging literature (Imhof, Karagok and Rutz,
   2018; OECD guidance on bid rigging). Coordinated bids tend to be tighter
   than competitive ones (low coefficient of variation) and cover bids sit in
   a cluster above the designated winner (relative distance above 1).

Neither line proves collusion. Two linked bidders whose prices also fit a
cover pattern are what an officer should look at first.
"""
from __future__ import annotations

import re
import statistics
from collections import Counter, defaultdict
from itertools import combinations

from sqlalchemy.orm import Session

from app.forensics import names
from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.document import Document
from app.models.telemetry import SubmissionEvent
from app.models.tender import Tender, TenderBidder

LINK_WEIGHTS = {
    "SHARED_DEVICE": 3, "SHARED_DIRECTOR": 3, "IDENTICAL_FILE": 3, "SHARED_IP": 2, "SHARED_DOCUMENT_AUTHOR": 2,
    "SHARED_PHONE": 2, "SHARED_EMAIL": 2, "SHARED_ADDRESS": 2, "SHARED_EMAIL_DOMAIN": 1, "SHARED_NETWORK": 1,
    "SYNCHRONIZED_SUBMISSION": 1,
}
PUBLIC_MAIL = {"gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "rediffmail.com", "icloud.com", "proton.me", "protonmail.com"}
GENERIC_AUTHORS = {"", "admin", "user", "owner", "administrator", "unknown", "pc", "hp", "dell", "lenovo", "microsoft", "windows user"}
RING_THRESHOLD = 3


def _addr(a: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (a or "").lower())


def _doc_authors(db: Session, bidder_ids: list[str]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = defaultdict(set)
    docs = db.query(Document).filter(Document.bidder_id.in_(bidder_ids), Document.is_deleted == False).all()  # noqa: E712
    for d in docs:
        insp = ((d.extraction.raw_extracted_fields or {}).get("inspection") if d.extraction else None) or {}
        meta = (insp.get("structure") or {}).get("metadata") or {}
        author = (meta.get("author") or "").strip()
        if author:
            out[d.bidder_id].add(author)
    return out


def find_links(db: Session, tender_id: str) -> list[dict]:
    bidder_ids = sorted({l.bidder_id for l in db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id)} |
                        {b.bidder_id for b in db.query(BidSubmission).filter(BidSubmission.tender_id == tender_id)})
    if len(bidder_ids) < 2:
        return []
    bidders = {b.id: b for b in db.query(Bidder).filter(Bidder.id.in_(bidder_ids))}
    links: list[dict] = []

    def link(a, b, kind, detail, evidence=None):
        a, b = sorted((a, b))
        links.append({"a": a, "b": b, "type": kind, "weight": LINK_WEIGHTS[kind], "detail": detail, "evidence": evidence or {}})

    # Telemetry: device, exact IP, /24 network. Counted across all of each bidder's events.
    events = db.query(SubmissionEvent).filter(SubmissionEvent.bidder_id.in_(bidder_ids)).all()
    by_key: dict[tuple[str, str], set[str]] = defaultdict(set)
    for e in events:
        for kind, val in (("SHARED_DEVICE", e.device_hash), ("SHARED_IP", e.ip_hash), ("SHARED_NETWORK", e.network_hash)):
            if val:
                by_key[(kind, val)].add(e.bidder_id)
    strong_pairs = set()
    for kind in ("SHARED_DEVICE", "SHARED_IP", "SHARED_NETWORK"):
        for (k, val), members in by_key.items():
            if k != kind or len(members) < 2 or len(members) > 6:
                continue  # a network shared by many bidders is a public ISP or a cyber cafe, not a link
            for a, b in combinations(sorted(members), 2):
                if kind == "SHARED_NETWORK" and (a, b) in strong_pairs:
                    continue
                label = {"SHARED_DEVICE": "the same browser/device", "SHARED_IP": "the same IP address",
                         "SHARED_NETWORK": "the same /24 network"}[kind]
                link(a, b, kind, f"Both bidders acted from {label}.", {"hash": val[:12]})
                strong_pairs.add((a, b))

    # Document authorship metadata. Authors common across the platform are templates, not people.
    authors = _doc_authors(db, bidder_ids)
    freq = Counter(a for s in authors.values() for a in s)
    for a, b in combinations(bidder_ids, 2):
        shared = {x for x in authors.get(a, set()) & authors.get(b, set()) if x.lower() not in GENERIC_AUTHORS and freq[x] <= 3}
        if shared:
            link(a, b, "SHARED_DOCUMENT_AUTHOR", f"PDFs from both bidders carry the author '{sorted(shared)[0]}'.",
                 {"authors": sorted(shared)})

    # Identical files across bidders.
    docs = db.query(Document).filter(Document.bidder_id.in_(bidder_ids), Document.is_deleted == False).all()  # noqa: E712
    by_hash: dict[str, set[str]] = defaultdict(set)
    for d in docs:
        if d.file_hash_sha256:
            by_hash[d.file_hash_sha256].add(d.bidder_id)
    for h, members in by_hash.items():
        for a, b in combinations(sorted(members), 2):
            link(a, b, "IDENTICAL_FILE", "Both bidders uploaded a byte-identical file.", {"sha256": h[:16]})

    # Declared profile data.
    for a, b in combinations(bidder_ids, 2):
        A, B = bidders.get(a), bidders.get(b)
        if not A or not B:
            continue
        dins_a = {d.get("din") for d in (A.directors or []) if d.get("din")}
        dins_b = {d.get("din") for d in (B.directors or []) if d.get("din")}
        common = dins_a & dins_b
        if not common:
            na = {names.normalize(d.get("name")) for d in (A.directors or []) if d.get("name")}
            nb = {names.normalize(d.get("name")) for d in (B.directors or []) if d.get("name")}
            common = na & nb
        if common:
            link(a, b, "SHARED_DIRECTOR", f"Both companies list director {sorted(common)[0]}.", {"directors": sorted(common)})
        if A.contact_phone and B.contact_phone and re.sub(r"\D", "", A.contact_phone)[-10:] == re.sub(r"\D", "", B.contact_phone)[-10:]:
            link(a, b, "SHARED_PHONE", "Both bidders registered the same phone number.")
        ea, eb = (A.contact_email or "").lower(), (B.contact_email or "").lower()
        if ea and ea == eb:
            link(a, b, "SHARED_EMAIL", "Both bidders registered the same email address.")
        elif ea and eb and ea.split("@")[-1] == eb.split("@")[-1] and ea.split("@")[-1] not in PUBLIC_MAIL:
            link(a, b, "SHARED_EMAIL_DOMAIN", f"Both bidders use the private mail domain {ea.split('@')[-1]}.")
        if _addr(A.registered_address) and _addr(A.registered_address) == _addr(B.registered_address):
            link(a, b, "SHARED_ADDRESS", "Both bidders declare the same registered address.")

    # Submission timing.
    bids = {b.bidder_id: b for b in db.query(BidSubmission).filter(BidSubmission.tender_id == tender_id) if b.submitted_at}
    for a, b in combinations(sorted(bids), 2):
        gap = abs((bids[a].submitted_at - bids[b].submitted_at).total_seconds())
        if gap <= 300:
            link(a, b, "SYNCHRONIZED_SUBMISSION", f"Bids submitted {int(gap)} seconds apart.", {"seconds": int(gap)})
    return links


def rings(links: list[dict]) -> list[dict]:
    pair_weight: dict[tuple[str, str], int] = defaultdict(int)
    pair_links: dict[tuple[str, str], list] = defaultdict(list)
    for l in links:
        pair_weight[(l["a"], l["b"])] += l["weight"]
        pair_links[(l["a"], l["b"])].append(l)
    parent: dict[str, str] = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for (a, b), w in pair_weight.items():
        if w >= RING_THRESHOLD:
            parent[find(a)] = find(b)
    groups: dict[str, set[str]] = defaultdict(set)
    for (a, b), w in pair_weight.items():
        if w >= RING_THRESHOLD:
            groups[find(a)] |= {a, b}
    out = []
    for members in groups.values():
        inner = [l for (a, b), ls in pair_links.items() if a in members and b in members for l in ls]
        out.append({
            "members": sorted(members),
            "strength": sum(l["weight"] for l in inner),
            "link_types": sorted({l["type"] for l in inner}),
            "links": inner,
        })
    return sorted(out, key=lambda r: -r["strength"])


def price_screens(prices: dict[str, float], estimate: float | None = None) -> dict:
    vals = sorted(prices.values())
    n = len(vals)
    out = {"n_bids": n, "flags": [], "per_bidder": defaultdict(list)}
    if estimate:
        for bid, p in prices.items():
            if p < 0.7 * estimate:
                out["per_bidder"][bid].append({"code": "ABNORMALLY_LOW_BID", "severity": "MEDIUM",
                                               "detail": f"Quoted {p:,.0f} is {100 - p / estimate * 100:.0f}% below the estimate {estimate:,.0f}."})
    counts = Counter(round(p, 2) for p in vals)
    for price, c in counts.items():
        if c > 1:
            same = [b for b, p in prices.items() if round(p, 2) == price]
            out["flags"].append({"code": "IDENTICAL_PRICES", "severity": "HIGH", "bidders": same,
                                 "detail": f"{c} bidders quoted exactly {price:,.2f}."})
    if n < 3:
        out["note"] = "Price screens need at least three bids."
        out["per_bidder"] = dict(out["per_bidder"])
        return out
    mean = statistics.mean(vals)
    sd = statistics.pstdev(vals)
    cv = sd / mean if mean else 0
    losers = vals[1:]
    # Relative distance needs a spread among the losing bids; two points don't make one.
    sd_losers = statistics.pstdev(losers) if len(losers) >= 3 else 0
    rd = (vals[1] - vals[0]) / sd_losers if sd_losers else None
    ratios = [vals[i + 1] / vals[i] for i in range(n - 1) if vals[i]]
    out.update({"mean": round(mean, 2), "cv": round(cv, 4), "relative_distance": round(rd, 3) if rd is not None else None,
                "step_ratios": [round(r, 4) for r in ratios]})
    if cv < 0.03:
        out["flags"].append({"code": "LOW_PRICE_DISPERSION", "severity": "MEDIUM",
                             "detail": f"Bids vary by only {cv * 100:.1f}% around the mean. Competitive bids on this kind of tender are usually more spread out."})
    if rd is not None and rd > 1:
        out["flags"].append({"code": "COVER_BID_GAP", "severity": "MEDIUM",
                             "detail": f"The gap between the two lowest bids is {rd:.1f}x the spread of the losing bids, the shape cover bidding leaves."})
    if len(ratios) >= 2 and statistics.pstdev(ratios) < 0.002 and statistics.mean(ratios) > 1.005:
        out["flags"].append({"code": "PRICE_LADDER", "severity": "HIGH",
                             "detail": f"Each bid is {(statistics.mean(ratios) - 1) * 100:.1f}% above the previous one. Independent bidders don't space prices evenly."})
    out["per_bidder"] = dict(out["per_bidder"])
    return out


def analyse_tender(db: Session, tender_id: str) -> dict:
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise ValueError("Tender not found")
    links = find_links(db, tender_id)
    found = rings(links)
    bids = {b.bidder_id: b.quoted_price for b in db.query(BidSubmission).filter(BidSubmission.tender_id == tender_id)
            if b.quoted_price and b.status != "WITHDRAWN"}
    screens = price_screens(bids, tender.estimated_value)

    # Linked bidders who all bid above one linked member are the textbook cover.
    if bids:
        lowest = min(bids, key=bids.get)
        for r in found:
            priced = [m for m in r["members"] if m in bids]
            if len(priced) >= 2:
                low = min(priced, key=bids.get)
                covers = [m for m in priced if m != low]
                r["cover_pattern"] = {
                    "designated_low": low, "covers": covers, "low_is_tender_lowest": low == lowest,
                    "detail": "Linked bidders all priced above one linked member" + (", who is the lowest bidder on the tender." if low == lowest else "."),
                }

    names_by_id = {b.id: b.company_name for b in db.query(Bidder).filter(Bidder.id.in_(list({l["a"] for l in links} | {l["b"] for l in links} | set(bids))))}
    per_bidder: dict[str, list] = defaultdict(list)
    for r in found:
        for m in r["members"]:
            others = [names_by_id.get(x, x) for x in r["members"] if x != m]
            per_bidder[m].append({"code": "LINKED_BIDDER_RING", "severity": "HIGH",
                                  "detail": f"Linked to {', '.join(others)} through {', '.join(t.lower().replace('_', ' ') for t in r['link_types'])}."})
            if r.get("cover_pattern") and m in r["cover_pattern"]["covers"]:
                per_bidder[m].append({"code": "POSSIBLE_COVER_BID", "severity": "HIGH", "detail": r["cover_pattern"]["detail"]})
    for bid_id, flags in screens.get("per_bidder", {}).items():
        per_bidder[bid_id] += flags
    for f in screens["flags"]:
        for m in f.get("bidders", []):
            per_bidder[m].append({"code": f["code"], "severity": f["severity"], "detail": f["detail"]})

    return {
        "tender_id": tender_id,
        "links": links,
        "rings": found,
        "price_screens": {k: v for k, v in screens.items() if k != "per_bidder"},
        "per_bidder": dict(per_bidder),
        "bidder_names": names_by_id,
        "disclaimer": "Links and price patterns are leads for review. They do not establish collusion.",
    }
