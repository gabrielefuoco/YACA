FROM python:3.11-slim

WORKDIR /app

# Installa dipendenze del modulo
COPY services/graph/requirements.txt /app/services/graph/
RUN pip install --no-cache-dir -r /app/services/graph/requirements.txt

# Copia codice del modulo (il volume dati viene montato separatamente in /app/services/graph/data)
COPY services/graph /app/services/graph

ENV PYTHONPATH=/app/services
ENV PORT=7862

EXPOSE 7862

HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7862/health').getcode() == 200 else 1)"

CMD ["python", "-m", "graph.servizio"]
