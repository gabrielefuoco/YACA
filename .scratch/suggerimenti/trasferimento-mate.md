# Il mate: cosa c'e' adesso, e cosa resta

**FATTO il 16/10/2026.** Il mate e' operativo: l'app serve la rotta del grafo, e il modulo colloca i
titoli. Qui c'e' cosa e' stato messo e cosa manca.

## 1. L'app — deployata e allineata al commit

L'immagine `ghcr.io/gabrielefuoco/yaca:latest` viene costruita dalla CI (`.github/workflows/deploy.yml`,
sul push a main) e **watchtower la tira giu' da solo**: il container `yaca-app` e' stato riavviato da
solo dopo il push, e dentro ci sono il nostro artefatto e la nostra rotta. Verificato **dentro** il
container, non dedotto:

    src/data/bolle.json        3.266.688 byte   PRESENTE
    src/api/bolle.js                            PRESENTE
    src/api/stremio.js:263-266  🌍 Il tuo mondo · 🔭 Un passo fuori (film e serie)

E la rotta risponde, sulla porta mappata (7860):

    GET  /            → 200
    POST /api/bolle   → 401 {"ok":false,"errore":"sessione assente o scaduta"}

**Non serve forzare niente**: il percorso e' push → CI → ghcr → watchtower.

## 2. Il modulo — in `/srv/yaca/modulo`, 138 MB di dati

| cosa | dove | peso |
|---|---|---|
| il repo clonato (commit `ed402f5`) | `/srv/yaca/modulo` | — |
| gli artefatti del modulo | `graph/data/` | 138 M |
| i parquet TMDB | `.cache/tmdb/` | 111 M |
| l'ambiente python | `.venv/` (numpy, pandas, scipy, pyarrow) | 385 M |

**I parquet TMDB sono quelli dell'app**, copiati dal suo volume `yaca_tmdb`: hanno **tutte le colonne**
che il collocatore legge (verificato con duckdb, per film e serie: nessuna mancante) ed e' lo stesso
dump (57,3 MB contro i 56,7 del portatile, 9,0 contro 8,9). Sono una COPIA, non un collegamento: il
volume e' di root e il modulo non puo' leggerlo. **Vanno riallineati**, ed e' una riga:

    docker run --rm -v yaca_tmdb:/v -v /srv/yaca/modulo/.cache/tmdb:/out alpine         sh -c "cp /v/movies.parquet /v/tv.parquet /out/"

## 3. Le prove, eseguite sul mate

    .venv/bin/python -m graph.pipeline stato          → canone: 66.259 titoli
    .venv/bin/python -m graph.pipeline build          → da rifare: 0 su 8
    .venv/bin/python -m graph.collocator              → 10 titoli collocati in 6 s
        Insidious - Fuori dall'Altrove  → bolla 2403 (5 titoli: TUTTI gli Insidious)
        Spider-Man: Brand New Day       → bolla 2273 (Doctor Strange, Black Widow, Shang-Chi)
        Verity                          → bolla 1682 (la stessa del portatile: coerenza fra macchine)
    Motore()                                          → 0,60 s · 3.497 mondi · 66.259 titoli

**Il mate NON ricostruisce il grafo**, e non deve: gli manca l'embedding delle trame (`04-trama-qwen3b.npy`,
140 MB) e i due triangoli. Per questo il DAG e' stato **registrato** (`build --registra`) — e' una
dichiarazione esplicita, non una verifica: dice «questi sono gli artefatti, non chiedermi di rifarli».
Un nodo che SERVE non ricostruisce.

## 4. Cosa resta

1. **il refresh dei parquet TMDB** (la riga sopra) — da mettere nel giro notturno, altrimenti un'uscita
   nuova non arriva al collocatore;
2. **il lavoro periodico**: non c'e' ancora un timer che lanci `esporta --colloca`. Con l'ambiente
   pronto e' una riga di systemd o di cron — e va deciso *quando* (una volta al giorno? a che ora?);
3. **le righe nuove nell'interfaccia**: come tutti gli hero, si vedono se il profilo le ha fra i
   `selectedPresets`. La UI di configurazione deve offrirle: e' il pezzo che il proprietario sta per
   testare.

## 5. Cosa NON e' stato copiato, e perche'

    .cache/movielens/          4,4 G   il dataset grezzo: serve solo a ricostruire da zero
    .cache/trakt/users/        1,2 G   le storie pubbliche: servono ai BANCHI, non alla collocazione
    i due triangoli, l'embedding, la miscela   ~560 M   materiale di costruzione
    due copie parziali di trakt  870 M   `users/` e' quella viva
