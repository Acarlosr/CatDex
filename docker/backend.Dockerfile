FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
        gosu \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 10001 apex && useradd -u 10001 -g apex -M -s /usr/sbin/nologin apex

ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY STRATEGY_CONTEXT.md ./

COPY docker/backend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/data && chown apex:apex /app /app/data

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
