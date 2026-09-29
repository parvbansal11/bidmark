FROM python:3.11-slim

WORKDIR /app

# System deps needed by pypdf / scikit-learn wheels build tooling on some platforms
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

ENV PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////app/data/gem_compliance.db \
    UPLOAD_DIRECTORY=/app/uploads

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
