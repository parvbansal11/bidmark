DOCUMENT_CATEGORIES = [
    "GST", "PAN", "UDYAM", "INCOME_TAX", "MCA", "STARTUP_INDIA", "NSIC",
    "EPFO", "ESIC", "OEM_AUTHORIZATION", "LOCAL_CONTENT", "EXPERIENCE_CERTIFICATE",
    "FINANCIAL", "OTHER",
]

CATEGORY_TO_REGISTRY = {
    "GST": "GST",
    "PAN": "PAN",
    "UDYAM": "UDYAM",
    "INCOME_TAX": "INCOME_TAX",
    "MCA": "MCA",
    "STARTUP_INDIA": "STARTUP_INDIA",
    "NSIC": "NSIC",
    "EPFO": "EPFO",
    "ESIC": "ESIC",
    "OEM_AUTHORIZATION": "OEM_AUTHORIZATION",
    "LOCAL_CONTENT": "LOCAL_CONTENT",
}

REQUIRED_FIELDS_BY_CATEGORY = {
    "GST": ["company_name", "gstin"],
    "PAN": ["company_name", "pan"],
    "UDYAM": ["company_name", "registration_number"],
    "INCOME_TAX": ["pan"],
    "MCA": ["company_name", "cin"],
    "STARTUP_INDIA": ["registration_number"],
    "NSIC": ["registration_number"],
    "EPFO": ["registration_number"],
    "ESIC": ["registration_number"],
    "OEM_AUTHORIZATION": ["company_name"],
    "LOCAL_CONTENT": ["registration_number"],
    "EXPERIENCE_CERTIFICATE": ["company_name"],
    "FINANCIAL": ["company_name", "turnover_crore"],
    "OTHER": [],
}

REQUIREMENT_TYPES = [
    "GST", "PAN", "UDYAM", "INCOME_TAX", "MCA", "STARTUP_INDIA", "NSIC",
    "EPFO", "ESIC", "OEM_AUTHORIZATION", "LOCAL_CONTENT", "DEBARMENT",
    "TURNOVER", "DIGILOCKER", "CUSTOM",
]

ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".txt"}
