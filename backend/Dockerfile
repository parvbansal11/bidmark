FROM python:3.12-slim

WORKDIR /app

# Tesseract reads scanned certificates; poppler-free because pdfplumber renders with pdfium.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////app/data/bidmark.db \
    UPLOAD_DIRECTORY=/app/data/uploads \
    TRUST_ROOTS_DIR=/app/data/trust-roots \
    DEMO_CA_DIR=/app/data/demo-ca \
    SANDBOX_REGISTRY_PATH=/app/data/sandbox_registry.json

RUN mkdir -p /app/data && chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
