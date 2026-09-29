from abc import ABC, abstractmethod
from typing import Any, Optional


class DocumentExtractionProvider(ABC):
    """
    DocumentExtractionProvider
      ├── MockDocumentProvider   (deterministic synthetic extraction — default)
      └── LocalOCRProvider       (best-effort real text extraction when the
                                  uploaded file actually contains readable
                                  text, e.g. a text-layer PDF)
    """

    @abstractmethod
    def extract(self, document, bidder, file_path: Optional[str] = None) -> dict[str, Any]:
        ...
