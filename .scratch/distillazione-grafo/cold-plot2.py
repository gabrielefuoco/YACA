"""Embedding trama film nuovi via transformers (last-token pooling = stesso del canone)."""
import json, sys, urllib.request, numpy as np, torch
from transformers import AutoTokenizer, AutoModel
def key():
    for f in (".env","secrets.env"):
        for line in open(f,encoding="utf-8",errors="ignore"):
            if line.strip().startswith("TMDB_API_KEY="): return line.split("=",1)[1].strip()
    raise SystemExit("no key")
tids=[int(x) for x in sys.argv[1:]] or [1368337,1283515]
k=key(); texts=[]; meta={}
for tid in tids:
    with urllib.request.urlopen(f"https://api.themoviedb.org/3/movie/{tid}?api_key={k}&language=en-US",timeout=30) as r: j=json.load(r)
    meta[str(tid)]={"title":j.get("title"),"overview":j.get("overview") or "","release":j.get("release_date")}
    texts.append(f"{j.get('title')}. {(j.get('overview') or '').strip()}")
tok=AutoTokenizer.from_pretrained("Qwen/Qwen3-Embedding-0.6B",trust_remote_code=True)
m=AutoModel.from_pretrained("Qwen/Qwen3-Embedding-0.6B",trust_remote_code=True).to("cuda").eval()
inp=tok(texts,return_tensors="pt",truncation=True,max_length=512,padding=True).to("cuda")
with torch.no_grad(): out=m(**inp).last_hidden_state
pos=(inp["attention_mask"].sum(1)-1)
v=out[torch.arange(len(texts)),pos].float(); v=torch.nn.functional.normalize(v,dim=1).cpu().numpy().astype(np.float32)
np.savez("services/graph_dense/data/cold-plot.npz",tids=np.array(tids),emb=v)
json.dump(meta,open("services/graph_dense/data/cold-meta.json","w",encoding="utf-8"),ensure_ascii=False)
print("plot ok",v.shape)
