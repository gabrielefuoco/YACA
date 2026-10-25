"""Dataset target completo: 7 pool + filtro morbido, 50 parallele, checkpoint a ogni film, ripresa."""
import json, os, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi

B = D.basic(); ro = B["row_of"]; N = B["N"]; is_tv = B["is_tv"]
date = np.load(C.DATA / "uscite-ordinali.npy")
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Bp = np.load(C.DATA / "trama-qwen3b.npy").astype(np.float32)
Bp /= (np.linalg.norm(Bp, axis=1, keepdims=True) + 1e-9)
Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)
Bm = np.load(C.DATA / "meta-jl.npz")["Bm"].astype(np.float32)
CONT = np.concatenate([Bp, np.sqrt(0.5) * Bk, np.sqrt(0.5) * Bm], 1)
CONT /= (np.linalg.norm(CONT, axis=1, keepdims=True) + 1e-9)
S = D.triangle()
ov = pd.read_parquet(C.DATA / "overview-en.parquet")
ovm = {str(r.chiave): r.overview for r in ov.itertuples()}
INFO = {}
for tipo, f, cr in (("movie", "movies.parquet", "directors"), ("tv", "tv.parquet", "created_by")):
    d = pd.read_parquet(C.TMDB / f, columns=["id", "genres", "runtime", "original_language", cr,
                                             "cast", "production_companies", "keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"] = {
            "gen": ", ".join(_nomi(r.genres)), "rt": getattr(r, "runtime", None),
            "lg": getattr(r, "original_language", ""), "crew": _nomi(getattr(r, cr))[:2],
            "cast": _nomi(getattr(r, "cast"))[:5], "co": _nomi(getattr(r, "production_companies"))[:3],
            "kw": _nomi(getattr(r, "keywords"))[:8]}
_rev = {r: k for k, r in ro.items()}


def yr(i):
    return int(date[i] // 365.25 + 1970) if date[i] > 0 else "?"


def de(j):
    j = int(j); k = _rev.get(j); I = INFO.get(k, {})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] ({I.get('rt','?')} min) — {(ovm.get(k,'') or '')[:70]}"


def card(k, i):
    I = INFO.get(k, {})
    s = f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\n"
    for lab, key in (("DIRECTOR/CREATOR", "crew"), ("CAST", "cast"), ("COMPANIES", "co"), ("KEYWORDS", "kw")):
        if I.get(key):
            s += f"{lab}: {', '.join(I[key])}\n"
    return s + f"OVERVIEW: {(ovm.get(k,'') or '')[:350]}\n"


CR = {"graph": "The platform knowledge graph's own neighborhood (teacher).",
      "cov": "Same MovieLens audience.", "trama": "Plot-summary similarity.", "kw": "Shared keywords.",
      "meta": "Same cast, crew, studio, collection, era.", "cont": "Blend plot+keywords+metadata.",
      "combo": "Blend co-vision+content.", "none": "None is good."}
KEY = os.environ["OPENROUTER_API_KEY"]
MODEL = os.environ.get("JEV_MODEL", "inception/mercury-decide:free")
OUT = C.DATA / "mercury-target.jsonl"
FAIL = C.DATA / "mercury-fail.jsonl"
NPZ = C.DATA / "mercury-target.npz"
lock = threading.Lock()
STAT = {"ok": 0, "429": 0, "err": 0, "retry": 0}


def ask(state, questions):
    for t in range(8):
        try:
            b = {"model": MODEL, "state": state, "questions": questions}
            req = urllib.request.Request(
                "https://openrouter.ai/api/alpha/decisions", data=json.dumps(b).encode(),
                headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=240) as r:
                with lock:
                    STAT["ok"] += 1
                return json.load(r)["answers"]
        except urllib.error.HTTPError as e:
            with lock:
                if e.code == 429:
                    STAT["429"] += 1
                else:
                    STAT["err"] += 1
                STAT["retry"] += 1
            time.sleep((0.5 + 0.5 * t) if e.code == 429 else (0.5 + 0.5 * t))
        except Exception:
            with lock:
                STAT["err"] += 1
                STAT["retry"] += 1
            time.sleep(1 + t)
    raise RuntimeError("ask failed")


def scores(i):
    cov = Yc[i] @ Yc.T; cov[i] = -1e4
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
        cov[near] *= 0.2
    tr = Bp[i] @ Bp.T; tr[i] = -1e4
    kw = Bk[i] @ Bk.T; kw[i] = -1e4
    me = Bm[i] @ Bm.T; me[i] = -1e4
    co = CONT[i] @ CONT.T; co[i] = -1e4
    cb = 0.5 * (cov / (cov.max() + 1e-9)) + 0.5 * (co / (co.max() + 1e-9)); cb[i] = -1e4
    row = S.getrow(i); gs = np.zeros(N, np.float32); gs[row.indices] = row.data; gs[i] = -1e4
    return {"graph": gs, "cov": cov, "trama": tr, "kw": kw, "meta": me, "cont": co, "combo": cb}, \
        bool(np.linalg.norm(Yc[i]) > 1e-6)


def one(k):
    i = ro[k]; S7, has = scores(i)
    lists = {n: ([de(j) for j in np.argsort(-sc)[:8]] if (n != "cov" or has) else ["(no MovieLens co-vision)"])
             for n, sc in S7.items()}
    st = card(k, i)
    for n in ("graph", "cov", "trama", "kw", "meta", "cont", "combo"):
        st += f"\nLIST {n.upper()}:\n" + "\n".join("- " + x for x in lists[n])
    a1 = ask(st, {"best": {"type": "choice", "instructions": "Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. The GRAPH list is the platform's own knowledge graph and may be right when the others are not. If none is good, choose none.", "criteria": CR}})["best"]
    pr = a1.get("probabilities", {})
    valid = {x: v for x, v in pr.items() if x != "none" and (x != "cov" or has) and v > 0}
    if not valid:
        valid = {"cont": 1.0}
    tot = sum(valid.values()); mix = np.zeros(N, np.float32)
    for x, v in valid.items():
        sc = S7[x].copy(); sc[i] = -1e4
        mix += (v / tot) * (sc / (sc.max() + 1e-9))
    mix[i] = -1e4
    cand = np.argsort(-mix)[:50]
    st2 = card(k, i) + "\nCANDIDATI:\n" + "\n".join(f"{q+1}. {de(j)}" for q, j in enumerate(cand))
    a2 = ask(st2, {f"c{q+1}": {"type": "noul", "instructions": f"Is candidate {q+1} a good similar film for the film described (theme, tone, style, intended audience)? Same broad popularity or same release window is not enough."} for q in range(50)})
    p = np.array([a2[f"c{q+1}"]["noul"] for q in range(50)], np.float32)
    soft = mix[cand] * (0.2 + p); o = np.argsort(-soft)
    idx = cand[o]; w = soft[o]; w = w / (w.sum() + 1e-9)
    return {"key": k, "row": int(i), "titolo": B["titoli"][i], "choice": a1.get("choice"), "prob": pr,
            "none": pr.get("none", 0), "conf": a1.get("confidence"), "kept": int((p >= 0.3).sum()),
            "maxp": float(p.max()), "empty": bool(p.max() < 0.2), "idx": idx.tolist(), "w": w.tolist()}


def load_rows():
    rows = {}
    if OUT.exists():
        for line in open(OUT, encoding="utf-8"):
            try:
                r = json.loads(line)
                if "idx" in r:
                    rows[r["key"]] = r
            except Exception:
                pass
    return rows


def snapshot(rows):
    idx = np.full((N, 50), -1, np.int32)
    w = np.zeros((N, 50), np.float16)
    choice = np.empty(N, dtype=object); choice[:] = None
    none = np.zeros(N, np.float32); kept = np.zeros(N, np.int16); mx = np.zeros(N, np.float32)
    for r in rows.values():
        i = r["row"]; idx[i] = r["idx"]; w[i] = r["w"]
        choice[i] = r.get("choice"); none[i] = r.get("none", 0)
        kept[i] = r.get("kept", 0); mx[i] = r.get("maxp", 0)
    np.savez_compressed(NPZ, idx=idx, w=w, choice=choice.astype(str), none=none, kept=kept, maxp=mx)


def main():
    t0 = time.time(); rows = load_rows()
    print(f"ripresa: {len(rows):,} gia' fatti", flush=True)
    todo = [k for k in ro if k not in rows]
    if os.environ.get("LIMIT"):
        todo = todo[:int(os.environ["LIMIT"])]
    print(f"da fare: {len(todo):,} · parallele 50 · modello {MODEL}", flush=True)
    f = open(OUT, "a", encoding="utf-8"); ff = open(FAIL, "a", encoding="utf-8")
    n = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        fut = {ex.submit(one, k): k for k in todo}
        for futr in as_completed(fut):
            k = fut[futr]
            try:
                r = futr.result()
            except Exception as e:
                ff.write(json.dumps({"key": k, "errore": str(e)[:300]}) + "\n"); ff.flush()
                continue
            rows[r["key"]] = r
            f.write(json.dumps(r, ensure_ascii=False) + "\n"); f.flush()
            n += 1
            if n % 100 == 0:
                os.fsync(f.fileno())
            if n % 100 == 0:
                el = time.time() - t0; rate = n / el; eta = (len(todo) - n) / max(rate, 1e-9)
                print(f"  {n:,}/{len(todo):,} · {rate:.2f}/s · ETA {eta/3600:.1f}h · 429 {STAT['429']} err {STAT['err']}", flush=True)
            if n % 2000 == 0:
                snapshot(rows)
                print(f"  snapshot {len(rows):,}", flush=True)
    f.close(); ff.close(); snapshot(rows)
    print(f"FINE {len(rows):,} · t {(time.time()-t0)/60:.1f}min · azioni {STAT}", flush=True)


if __name__ == "__main__":
    main()
