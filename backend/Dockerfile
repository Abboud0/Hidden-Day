# backend/Dockerfile
FROM python:3.11-slim

# system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# workdir in container
WORKDIR /app

# copy and install deps to leverage Docer layer caching
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copy backend code
COPY backend/ ./

# Env defaults (render will inject real ones, safe fallbacks here)
ENV APP_HOST=0.0.0.0
ENV APP_PORT=8000
# render sets PORT, prefer if present
ENV PORT=8000

# expose port (docs only, render maps auto)
EXPOSE 8000

# start with uvicorn through Python module path (gunicorn optional later)
CMD ["bash", "-lc", "python -m uvicorn backend.main:app --host ${APP_HOST} --port ${PORT:-$APP_PORT}"]