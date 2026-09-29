"""
MockDocumentProvider — deterministic, seeded document intelligence. Used
whenever LocalOCRProvider cannot find a usable text layer (which, for a
hackathon prototype where most demo documents are placeholder uploads, is the
common path). Fields are derived from the bidder's own on-file data so
cross-document checks and compliance evaluation have something meaningful to
compare, with an occasional deterministic "minor variation" to make the
consistency-checking layer demonstrable.
"""
import hashlib
import random
from datetime import date, timedelta
from typing import Any, Optional

from app.providers.document.base import DocumentExtractionProvider
from app.providers.government.fake_data import fake_cin, fake_gstin, fake_pan, fake_udyam
from app.utils.ids import new_ref


def _rng_for(document_id: str) -> random.Random:
    seed = int(hashlib.sha256(document_id.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


NAME_VARIANTS = [
    lambda n: n,
    lambda n: n.replace("Pvt Ltd", "Private Limited") if "Pvt Ltd" in n else n + " Limited",
    lambda n: n.replace("Pvt Ltd", "Ltd") if "Pvt Ltd" in n else n,
]


class MockDocumentProvider(DocumentExtractionProvider):
    def extract(self, document, bidder, file_path: Optional[str] = None) -> dict[str, Any]:
        rng = _rng_for(document.id)
        category = document.category
        base_name = (bidder.legal_name or bidder.company_name) if bidder else "Registered Entity"

        # ~12% of the time, simulate a minor legal-name variation on this
        # particular document (drives the cross-document consistency layer).
        variant_fn = rng.choice(NAME_VARIANTS) if rng.random() < 0.12 else NAME_VARIANTS[0]
        company_name = variant_fn(base_name)

        pan = (bidder.pan_number if bidder else None) or fake_pan(rng)
        gstin = (bidder.gstin if bidder else None) or fake_gstin(rng, pan)
        cin = (bidder.cin if bidder else None) or fake_cin(rng)
        udyam = (bidder.udyam_number if bidder else None) or fake_udyam(rng)

        registration_number = {
            "GST": gstin,
            "PAN": pan,
            "UDYAM": udyam,
            "MCA": cin,
            "INCOME_TAX": pan,
            "STARTUP_INDIA": f"DIPP{rng.randint(10000,99999)}",
            "NSIC": f"NSIC{rng.randint(100000,999999)}",
            "EPFO": f"EPFO{rng.randint(1000000,9999999)}",
            "ESIC": f"ESIC{rng.randint(1000000,9999999)}",
            "OEM_AUTHORIZATION": new_ref("OEM"),
            "LOCAL_CONTENT": new_ref("LC"),
            "FINANCIAL": new_ref("FIN"),
        }.get(category, new_ref("DOC"))

        issue_date = date.today() - timedelta(days=int(rng.uniform(30, 1200)))
        # ~10% chance the document is already expired, to exercise that status.
        if rng.random() < 0.10:
            validity_date = date.today() - timedelta(days=int(rng.uniform(1, 200)))
        else:
            validity_date = date.today() + timedelta(days=int(rng.uniform(60, 900)))

        return {
            "company_name": company_name,
            "registration_number": registration_number,
            "pan": pan,
            "gstin": gstin,
            "cin": cin,
            "address": (bidder.registered_address if bidder else None) or "Registered Office Address, India",
            "turnover_crore": round(rng.uniform(2, 150), 2),
            "issue_date": issue_date.isoformat(),
            "validity_date": validity_date.isoformat(),
            "document_number": new_ref("DOC"),
            "raw_extracted_fields": {
                "simulated": True,
                "note": "Synthetic extraction produced by MockDocumentProvider for prototype purposes.",
            },
            "extraction_confidence": round(rng.uniform(0.82, 0.99), 2),
            "extraction_provider": "MockDocumentProvider",
        }
