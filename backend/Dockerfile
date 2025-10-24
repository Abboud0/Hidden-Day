# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && pip install -r requirements.txt

# Copy backend source code
COPY . ./

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8000
ENV PORT=8000

EXPOSE 8000

# Launch FastAPI
CMD ["bash", "-lc", "python -m uvicorn main:app --host ${APP_HOST} --port ${PORT:-$APP_PORT}"]