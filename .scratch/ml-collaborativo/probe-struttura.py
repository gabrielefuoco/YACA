"""Quanto della verita' e' una CONTINUAZIONE di qualcosa che l'utente ha gia' visto?
Saga/collezione, stesso titolo-radice (sequel), stesso regista. Non e' similarita': e' struttura.
Uso: python .scratch/ml-collaborativo/probe-struttura.py"""
import json, pathlib, re
import pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[2]; CACHE, PQ = ROOT/".cache"/"movielens", ROOT/".cache"/"tmdb"
mv = pd.read_parquet(PQ/"movies.parquet")
print("colonne movies:", [c for c in mv.columns if c in ("id","title","belongs_to_collection","collection","director","credits","cast","keywords","release_date")] or mv.columns.tolist()[:25])
def stem(t):
    s = str(t).lower()
    s = re.sub(r"\(\d{4}\)", " ", s)
    s = re.sub(r"\b(ii|iii|iv|v|vi|vii|viii|ix|x|part|parte|chapter|capitolo|episode)\b.*$", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+\d+$", " ", s)
    return " ".join(s.split()[:3])
mv["stem"] = mv["title"].map(stem)
col = None
for c in ("belongs_to_collection", "collection"):
    if c in mv.columns: col = c; break
def cid(v):
    if col is None or v is None: return None
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: return None
    if isinstance(v, dict): return v.get("id") or v.get("name")
    return None
if col: mv["coll"] = mv[col].map(cid)
stem_of = {f"movie:{int(i)}": s for i, s in zip(mv["id"], mv["stem"])}
coll_of = {f"movie:{int(i)}": c for i, c in zip(mv["id"], mv["coll"])} if col else {}
print(f"collezione usata: {col} · titoli con collezione: {sum(1 for v in coll_of.values() if v):,}")
trials = json.loads((CACHE/"graph-candidates-full.json").read_text())
tot=g_stem=g_coll=g_both=cand_n=cand_g=0
for t in trials:
    seeds=t["seeds"]; gold=[k for k in t["gold"] if k in stem_of]
    S={stem_of.get(k) for k in seeds if stem_of.get(k)}
    C={coll_of.get(k) for k in seeds if coll_of.get(k)}
    for k in gold:
        tot+=1
        s=stem_of.get(k) in S; c=coll_of.get(k) in C if coll_of.get(k) else False
        g_stem+=s; g_coll+=c; g_both+= (s or c)
    # quanti candidati sarebbero "continuazioni" (per il profilo) e quanti sono giusti
    for k,s2 in stem_of.items():
        if s2 in S and k not in seeds:
            cand_n+=1; cand_g+= 1 if k in set(t["gold"]) else 0
print(f"\nverita' analizzata: {tot:,} titoli")
print(f"  stesso titolo-radice (sequel/saga per nome): {100*g_stem/tot:.1f}%")
print(f"  stessa collezione TMDB:                      {100*g_coll/tot:.1f}%")
print(f"  ALMENO UNO dei due (continuazione):          {100*g_both/tot:.1f}%")
print(f"\nse proponessi TUTTE le continuazioni dei titoli visti: {cand_n:,} candidati, di cui giusti {cand_g:,} = {100*cand_g/max(1,cand_n):.2f}% (contro 0,89% del candidato medio)")
