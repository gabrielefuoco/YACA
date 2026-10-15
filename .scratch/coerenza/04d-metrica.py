"""04d-metrica.py — TICKET 04, la metrica: la trama come arbitro indipendente.

Il collocatore usa generi, keyword, cast, registi, reti, case, paesi — **mai il testo della trama**.
Quindi la similarità fra le trame e' l'unica misura che **non puo' essere circolare**: se V3 sceglie
film che raccontano storie piu' simili di quelli scelti da V1, allora il banco che lo punisce sta
misurando un'altra cosa.

    Sim_trama(i, V) = media della similarita' coseno fra la trama di i e quelle dei suoi 10 vicini
                      piu' prossimi secondo la variante V

Gli embedding sono quelli di `04-trama-emb.npy` (35.829 trame, `bge-small-en-v1.5`, lo stesso
embedder delle keyword di `build_graph.py`), conservati e ripresi.

ATTENZIONE AL CAMPIONE, e va dichiarato: solo il 42,3% dei titoli ha una trama, e i vicini senza
trama si saltano. Quindi la Sim_trama si calcola su un sottoinsieme del banco, e le due varianti
vanno confrontate **sugli stessi casi**, altrimenti il confronto e' fra campioni diversi.
"""
import json
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("TICKET 04d — LA TRAMA COME ARBITRO: V1 CONTRO V3")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
IS_TV = B.IS_TV

# gli embedding, indicizzati per riga del canone
# GLI EMBEDDING NUOVI: qwen3-embedding:0.6b, payload "titolo. trama", 1024 dimensioni.
# I vecchi (bge-small-en, 384 dim, solo trama) restano in `04-trama-emb.npy` per il confronto:
# erano loro a comprimere tutto in 0,74 ± 0,01, non l'idea della metrica.
IDX = np.load(ML / "04-trama-qwen3b-idx.npy")
E = np.load(ML / "04-trama-qwen3b.npy")
POS = {int(r): k for k, r in enumerate(IDX)}
print(f"  embedding: {E.shape} (qwen3, payload titolo+trama) · trame {len(IDX):,} ({time.time()-T0:.0f}s)", flush=True)

# il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])

TF3 = sp.load_npz(ML / "05-tfidf.npz").tocsr()
TF1 = sp.load_npz(ML / "04-tfidf.npz").tocsr()


def vicini(tolti_, TF, quanti=10):
    V = np.asarray((TF[tolti_] @ TF.T).todense())
    np.fill_diagonal(V[:, tolti_], -1)
    return np.argpartition(-V, quanti, axis=1)[:, :quanti]


def sim_trama(idx_vicini, queries):
    """Media della similarita' di trama coi vicini CHE HANNO una trama. NaN se nessuno ce l'ha."""
    out = np.full(len(queries), np.nan)
    for k, i in enumerate(queries):
        if int(i) not in POS:
            continue
        ei = E[POS[int(i)]]
        vs = [E[POS[int(x)]] for x in idx_vicini[k] if int(x) in POS]
        if vs:
            out[k] = float(np.mean([ei @ v for v in vs]))
    return out


print("\n  calcolo i vicini (V1 e V3) e la loro similarita' di trama...", flush=True)
NV1 = vicini(tolti, TF1)
NV3 = vicini(tolti, TF3)
S1 = sim_trama(NV1, tolti)
S3 = sim_trama(NV3, tolti)
print(f"  fatto ({time.time()-T0:.0f}s)", flush=True)

# i casi misurabili in ENTRAMBE le varianti — il confronto deve essere sugli stessi
m = ~np.isnan(S1) & ~np.isnan(S3)
print(f"\n  casi con una trama E almeno un vicino con trama: {int(m.sum())}/600 "
      f"({100*m.mean():.1f}%) — il campione e' questo")

# le prestazioni di bolla delle due varianti (dal ticket 05, col LOO esatto)
pred_v3 = np.asarray(np.load(ML / "06c-voto.npz", allow_pickle=True)["previste"])
ok_v3 = pred_v3 == vere

print("\n" + "=" * 100)
print("IL CONFRONTO")
print("=" * 100)
print(f"  {'variante':<26} {'Sim_trama media':>16} {'mediana':>10}")
print(f"  {'V1 (pesi grezzi)':<26} {np.nanmean(S1[m]):>16.4f} {np.nanmedian(S1[m]):>10.4f}")
print(f"  {'V3 (pesi per tipo)':<26} {np.nanmean(S3[m]):>16.4f} {np.nanmedian(S3[m]):>10.4f}")

d = S3[m] - S1[m]
print(f"\n  differenza V3 - V1: media {d.mean():+.4f} · mediana {np.median(d):+.4f} · "
      f"positiva nel {100*(d > 0).mean():.1f}% dei casi")
# test di segno: quanti casi a favore di V3 contro quanti a favore di V1
fav_v3 = int((d > 0.01).sum())
fav_v1 = int((d < -0.01).sum())
pari = int(len(d) - fav_v3 - fav_v1)
print(f"  casi con un vantaggio netto (>0,01): V3 avanti {fav_v3} · V1 avanti {fav_v1} · "
      f"pari {pari}")

# e il controllo incrociato: i casi che il banco dà giusti hanno trame piu' simili?
print("\n" + "=" * 100)
print("E IL CONTROLLO INCROCIATO")
print("=" * 100)
for nome, S, ok in (("V1", S1, None), ("V3", S3, ok_v3)):
    if ok is None:
        # per V1 il banco non l'ha mai misurato: si usa la sua stessa predizione
        C4 = np.load(ML / "04-centroidi.npz")
        b1 = C4["bolle_serie"]
        # `uniforme` e' un array DENSO: il prodotto e' gia' un ndarray, niente `.todense()`
        T1 = np.asarray(TF1[tolti] @ C4["uniforme"].T) / (np.linalg.norm(C4["uniforme"], axis=1)[None, :] + 1e-9)
        p1 = np.array([int(b1[int(np.argmax(T1[k]))]) for k in range(600)])
        ok = p1 == vere
    mm = m & ok
    print(f"  {nome}: Sim_trama sui casi che il banco dà GIUSTI {np.nanmean(S[mm]):.4f} "
          f"({int(mm.sum())} casi) · sugli SBAGLIATI {np.nanmean(S[m & ~ok]):.4f} "
          f"({int((m & ~ok).sum())} casi)")

print("\n" + "=" * 100)
print("IL VERDETTO")
print("=" * 100)
print(f"  Il banco dice: V1 63,0% nella propria bolla, V3 35,3%.")
print(f"  La trama dice: V1 {np.nanmean(S1[m]):.4f}, V3 {np.nanmean(S3[m]):.4f}.")
if d.mean() > 0.005:
    print("  -> V3 sceglie vicini con trame PIU' simili: il banco lo punisce ma la trama lo assolve.")
elif d.mean() < -0.005:
    print("  -> V1 sceglie vicini con trame piu' simili: il banco aveva ragione, e non e' un artefatto")
    print("     della co-visione — e' proprio la semantica.")
else:
    print("  -> le due varianti sono indistinguibili sulla trama: V3 non porta niente di semantico")
    print("     in piu', e il banco aveva ragione a punirlo.")
print(f"\nFINE ({time.time()-T0:.0f}s)")
