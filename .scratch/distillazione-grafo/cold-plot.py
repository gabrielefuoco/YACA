"""Embedding trama dei film nuovi (processo separato: evita il segfault con le classi torch)."""
import json, sys, urllib.request, numpy as np
from sentence_transformers import SentenceTransformer
ROOT="."
def key():
    for f in (".env","secrets.env"):
        for line in open(f,encoding="utf-8",errors="ignore"):
            if line.strip().startswith("TMDB_API_KEY="): return line.split("=",1)[1].strip()
    raise SystemExit("no key")
tids=[int(x) for x in sys.argv[1:]] or [1368337,1283515]
k=key(); texts=[]; meta={}
for tid in tids:
    u=f"https://api.themoviedb.org/3/movie/{tid}?api_key={k}&language=en-US"
    with urllib.request.urlopen(u,timeout=30) as r: j=json.load(r)
    meta[str(tid)]={"title":j.get("title"),"overview":j.get("overview") or "","release":j.get("release_date")}
    texts.append(f"{j.get('title')}. {(j.get('overview') or '').strip()}")
m=SentenceTransformer("Qwen/Qwen3-Embedding-0.6B",device="cuda",trust_remote_code=True)
E=m.encode(texts,normalize_embeddings=True,convert_to_numpy=True).astype(np.float32)
np.savez("services/graph_dense/data/cold-plot.npz",tids=np.array(tids),emb=E)
json.dump(meta,open("services/graph_dense/data/cold-meta.json","w",encoding="utf-8"),ensure_ascii=False)
print("plot ok",E.shape)
