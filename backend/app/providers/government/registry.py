"""
GovernmentVerificationProvider — the single dispatcher the rest of the
application talks to. It hides the fact that there are 13 separate mock
registries behind one lookup, and is the seam where real integrations would
be plugged in later.
"""
from app.providers.government import sandbox
from app.providers.government.debarment import DebarmentProvider
from app.providers.government.digilocker import DigiLockerProvider
from app.providers.government.epfo import EPFOProvider
from app.providers.government.esic import ESICProvider
from app.providers.government.gst import GSTProvider
from app.providers.government.income_tax import IncomeTaxProvider
from app.providers.government.local_content import LocalContentProvider
from app.providers.government.mca import MCAProvider
from app.providers.government.nsic import NSICProvider
from app.providers.government.oem import OEMProvider
from app.providers.government.pan import PANProvider
from app.providers.government.startup import StartupIndiaProvider
from app.providers.government.udyam import UdyamProvider

PROVIDERS = {
    "GST": GSTProvider(),
    "PAN": PANProvider(),
    "UDYAM": UdyamProvider(),
    "INCOME_TAX": IncomeTaxProvider(),
    "MCA": MCAProvider(),
    "STARTUP_INDIA": StartupIndiaProvider(),
    "NSIC": NSICProvider(),
    "EPFO": EPFOProvider(),
    "ESIC": ESICProvider(),
    "OEM_AUTHORIZATION": OEMProvider(),
    "LOCAL_CONTENT": LocalContentProvider(),
    "DEBARMENT": DebarmentProvider(),
    "DIGILOCKER": DigiLockerProvider(),
}


class GovernmentVerificationProvider:
    """Facade over every registry-specific mock provider."""

    @staticmethod
    def verify(registry: str, identifier: str, context: dict | None = None) -> dict:
        provider = PROVIDERS.get(registry.upper())
        if not provider:
            raise ValueError(f"Unknown government registry: {registry}")
        return sandbox.lookup(registry, identifier) or provider.verify(identifier, context)

    @staticmethod
    def available_registries() -> list[str]:
        return list(PROVIDERS.keys())
