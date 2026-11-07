FROM python:3.11-slim

WORKDIR /app

# Installa dipendenze del modulo
# Il contesto di build è questa cartella (v. docker-compose.yml): i percorsi sono relativi a services/graph.
COPY requirements.txt /app/services/graph/
RUN pip install --no-cache-dir -r /app/services/graph/requirements.txt

# Copia codice del modulo (i volumi dati vengono montati separatamente in /app/services/graph/data)
COPY . /app/services/graph

ENV PYTHONPATH=/app/services
ENV PORT=7862
ENV V45_TRANSIZIONE_PATH=/app/services/graph/data/v45-transizione/transizione-pota16.npz
ENV V45_VICINI_PATH=/app/services/graph/data/v45-vicini100/vicini-top100.npz
ENV ASSI_CANONE_PATH=/app/services/graph/data/assi-canone.npz
ENV KW_TFIDF_DIR=/app/services/graph/data/kw-tfidf

EXPOSE 7862

HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7862/health').getcode() == 200 else 1)"

CMD ["python", "-m", "graph.servizio"]
