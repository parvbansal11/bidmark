import uuid


def new_id() -> str:
    return str(uuid.uuid4())


def new_ref(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"
