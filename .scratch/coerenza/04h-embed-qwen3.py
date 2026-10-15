"""04h-embed-qwen3.py — l'embedding del catalogo con qwen3-embedding:0.6b, via Ollama.

Differenze dal primo tentativo, imparate a spese mie:
  · **scrittura incrementale**: salva ogni 2.000 trame, cosi' un kill non butta il lavoro. Il job
    delle collocazioni e' morto in silenzio al 40% perche' scriveva solo alla fine, e la stessa cosa
    era scritta anche qui. Non la ripeto.
  · **ripresa**: salta quelle gia' fatte.
  · **lotti da 200**: una richiesta da 1.500 testi a Ollama risponde 400.
  · il modello e' locale: i vettori restano in `.cache/movielens/04-trama-qwen3.*`, accanto a quelli
    di bge-small (che restano, per il confronto).
"""
import json, pathlib, sys, time, urllib.request
import numpy as np, pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0, LOTTO, OGNI = time.time(), 200, 2000
ML = K.ML
MOD = "qwen3-embedding:0.6b"
# PAYLOAD B: "titolo. trama". Misurato su due test (ticket 04i): sul test dei gemelli la separazione
# passa da +0,314 a +0,342 e soprattutto il caso peggiore si chiude — la coppia simile piu' bassa
# (0,515) sta sopra la diversa piu' alta (0,435), mentre con la sola trama si sovrapponevano.
# Il titolo e' l'unica informazione che il collocatore NON usa, quindi non rende la metrica circolare.
# Le keyword restano fuori apposta: il collocatore vive di quelle.
# L'anno NON aiuta (0,319 contro 0,342): provato e scartato.
MEM = ML / "04-trama-qwen3b.npy"
IDX = ML / "04-trama-qwen3b-idx.npy"

print("=" * 96)
print(f"EMBEDDING DEL CATALOGO CON {MOD}")
print("=" * 96, flush=True)

PQ = pathlib.Path(".cache/tmdb")
RIGA = {}
# I due parquet hanno colonne DIVERSE: i film hanno `title`/`title_en`, le serie `name`/`name_en`.
# Chiedere `title` a tv.parquet fa fallire pyarrow con ArrowInvalid: le colonne vanno per tipo.
PARQ = {"movie": ("movies.parquet", "title", "title_en"),
        "tv": ("tv.parquet", "name", "name_en")}
for typ, (f, col, col_en) in PARQ.items():
    d = pd.read_parquet(PQ / f, columns=["id", "overview", col, col_en])
    for r in d.itertuples(index=False):
        o = str(r.overview or "").strip()
        if len(o) > 40:
            riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
            if riga is not None:
                # `title_en` e' NaN, non vuoto: `NaN or title` restituisce NaN. Serve il controllo.
                ten = getattr(r, col_en, None)
                ten = ten if isinstance(ten, str) and ten.strip() else None
                tit = ten or str(getattr(r, col, None) or "")
                RIGA[int(riga)] = f"{tit}. {o}"
chiavi = np.array(sorted(RIGA), dtype=np.int32)
print(f"  trame nel canone: {len(chiavi):,} ({time.time()-T0:.0f}s)", flush=True)

E = np.load(MEM) if MEM.exists() else np.zeros((len(chiavi), 1024), np.float32)
fatti = set(int(x) for x in np.load(IDX)) if IDX.exists() else set()
da_fare = [int(r) for r in chiavi if int(r) not in fatti]
print(f"  già fatte: {len(fatti):,} · da fare: {len(da_fare):,}", flush=True)


def embed(testi):
    corpo = json.dumps({"model": MOD, "input": testi}).encode()
    req = urllib.request.Request("http://localhost:11434/api/embed", data=corpo,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return np.array(json.loads(r.read())["embeddings"], dtype=np.float32)


pos = {int(r): k for k, r in enumerate(chiavi)}
nuovi = 0
t = time.time()
for k in range(0, len(da_fare), LOTTO):
    blocco = da_fare[k:k + LOTTO]
    V = embed([RIGA[r] for r in blocco])
    for j, r in enumerate(blocco):
        E[pos[r]] = V[j]
    nuovi += len(blocco)
    if nuovi % OGNI < LOTTO:
        np.save(MEM, E)
        np.save(IDX, np.array(sorted(fatti | set(da_fare[:nuovi])), dtype=np.int32))
        vel = nuovi / (time.time() - t)
        print(f"  {nuovi:>6,}/{len(da_fare):,} · {vel:.0f} trame/s · restano "
              f"{(len(da_fare)-nuovi)/vel/60:.1f} min", flush=True)

np.save(MEM, E)
np.save(IDX, np.array(sorted(fatti | set(da_fare)), dtype=np.int32))
print(f"\n  salvate {len(chiavi):,} × 1024 in 04-trama-qwen3.npy "
      f"({MEM.stat().st_size/1048576:.1f} MB) in {time.time()-T0:.0f}s", flush=True)
print("FINE", flush=True)
