"""Una fotografia di una parte del grafo, per il senior: la matrice, i pesi, il contesto.

Produce:
  fotografia-grafo.md   la lettura (tabelle + domande)
  fotografia-grafo.csv  l'elenco degli archi in formato lungo (seeds top-20 + bolla 1395 + Inkheart->674)

Uso: ../../offline_graph_builder/venv/Scripts/python.exe 07-fotografia.py
"""
import csv
import json
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "services" / "graph" / "data"
OUT = Path(__file__).resolve().parent

z = np.load(DATA / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, year = z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: i for i, k in enumerate(keys)}
titoli = np.array((DATA / "titoli-canone.txt").read_text(encoding="utf-8").split("\n"), dtype=object)
meta = np.load(DATA / "metadati-canone.npz")
VOT = meta["VOT"].astype(float)
VAVE = meta["VAVE"].astype(float)
COLL = meta["COLL"]
DIR = meta["DIR"]
NEP = meta["NEP"]
b = json.load(open(DATA / "bolle.json", encoding="latin-1"))
bid = np.array([b["titoli"][k] for k in keys])

T = np.load(DATA / "bolle-eterogeneo-V10-p1.0-triangolo.npz")
N = len(keys)
S = sp.csr_matrix((T["data"], T["indices"], T["indptr"]), shape=(N, N))
S = (S + S.T).tocsr()
deg = np.diff(S.indptr)

SEEDS = [
    ("Spider-Man (2002)", "movie:557"),
    ("Inkheart (2008)", "movie:2309"),
    ("Un ponte per Terabithia (2007)", "movie:1265"),
    ("Inception (2010)", "movie:27205"),
    ("Perfetti sconosciuti (2016)", "movie:381341"),
    ("Breaking Bad (2008)", "tv:1396"),
]

def nome(i):
    return titoli[i]

def anno(i):
    return int(year[i]) if np.isfinite(year[i]) else 0

def bolla(i):
    return int(bid[i])

def termes(bid_):
    return ", ".join(b["bolle"][str(bid_)]["termini"][:4])

def riga_csv(sezione, rank, i, j, w, rowsum, wmax):
    return {
        "sezione": sezione, "rank": rank,
        "src_key": keys[i], "src_title": nome(i), "src_bubble": bolla(i),
        "src_bubble_n": b["bolle"][str(bolla(i))]["n"], "src_year": anno(i),
        "src_vot": int(VOT[i]), "src_vave": round(float(VAVE[i]), 2), "src_degree": int(deg[i]),
        "dst_key": keys[j], "dst_title": nome(j), "dst_bubble": bolla(j),
        "dst_bubble_n": b["bolle"][str(bolla(j))]["n"], "dst_year": anno(j),
        "dst_vot": int(VOT[j]), "dst_vave": round(float(VAVE[j]), 2), "dst_degree": int(deg[j]),
        "w_raw": round(float(w), 6),
        "w_norm": round(float(w) / rowsum, 6) if rowsum else 0,
        "w_pct_max": round(100 * float(w) / wmax, 2) if wmax else 0,
        "same_bubble": int(bid[i] == bid[j]),
        "same_coll": int(COLL[i] == COLL[j] and COLL[i] > 0),
        "same_dir": int(DIR[i] == DIR[j] and DIR[i] > 0),
        "same_medium": int(tipo[i] == tipo[j]),
        "year_gap": abs(anno(i) - anno(j)) if anno(i) and anno(j) else "",
    }

righe = []
for etichetta, chiave in SEEDS:
    i = row_of[chiave]
    r = S.getrow(i)
    o = np.argsort(-r.data)
    cols, vals = r.indices[o], r.data[o]
    for rank, (j, w) in enumerate(zip(cols[:20], vals[:20]), 1):
        righe.append(riga_csv("seed_top20", rank, i, int(j), w, float(r.data.sum()), float(vals[0])))

# la bolla 1395, per intero: tutte le coppie interne con peso > 0
MEM = [i for i in range(N) if bid[i] == 1395]
pairs = []
for a in range(len(MEM)):
    for b_ in range(a + 1, len(MEM)):
        i, j = MEM[a], MEM[b_]
        w = float(S[i, j])
        if w > 0:
            pairs.append((w, i, j))
pairs.sort(reverse=True)
for rank, (w, i, j) in enumerate(pairs, 1):
    righe.append(riga_csv("bolla_1395", rank, i, j, w, float(S.getrow(i).data.sum()), float(S.getrow(i).data.max())))

# Inkheart -> bolla 674 (il grappolo tedesco), per il contrasto
i0 = row_of["movie:2309"]
r0 = S.getrow(i0)
o0 = np.argsort(-r0.data)
n674 = 0
for j0, w0 in zip(r0.indices[o0], r0.data[o0]):
    if int(bid[j0]) == 674:
        n674 += 1
        righe.append(riga_csv("inkheart_674", n674, i0, int(j0), w0, float(r0.data.sum()), float(r0.data.max())))

with open(OUT / "fotografia-grafo.csv", "w", newline="", encoding="utf-8") as f:
    wr = csv.DictWriter(f, fieldnames=list(righe[0]))
    wr.writeheader()
    wr.writerows(righe)

# ---------------------------------------------------------------- statistiche globali
co = sp.triu(S).tocoo()
tot = float(co.data.sum())
same_b = bid[co.row] == bid[co.col]
same_c = (COLL[co.row] == COLL[co.col]) & (COLL[co.row] > 0)
same_d = (DIR[co.row] == DIR[co.col]) & (DIR[co.row] > 0)
same_m = tipo[co.row] == tipo[co.col]
yg = np.abs(np.nan_to_num(year[co.row], nan=0) - np.nan_to_num(year[co.col], nan=0))
ok_y = (year[co.row] > 0) & (year[co.col] > 0)
both50 = (VOT[co.row] >= 50) & (VOT[co.col] >= 50)

def share(mask):
    return 100 * mask.mean(), 100 * co.data[mask].sum() / tot

# copertura del peso di riga con i top-k
def copertura(k):
    out = []
    for i in range(N):
        r = S.getrow(i)
        s = r.data.sum()
        if r.nnz >= k and s > 0:
            v = np.partition(-r.data, k - 1)[:k]
            out.append(-v.sum() / s)
    return np.array(out)

COV = {k: copertura(k) for k in (10, 20, 30, 50)}

# righe: i 6 seed + il campione
def riga_stat(i):
    r = S.getrow(i)
    v = np.sort(r.data)[::-1]
    if len(v) < 20:
        return None
    return (r.nnz, v.sum(), v[0], v[4], v[9], v[19], v[29] if len(v) >= 30 else np.nan,
            v[0] / v.sum(), v[:5].sum() / v.sum(), v[:20].sum() / v.sum())

rng = np.random.default_rng(42)
sample = [x for x in (riga_stat(i) for i in rng.choice(N, 400, replace=False)) if x]
sample = np.array(sample)

def tab(etichetta, chiave, wmax=20):
    i = row_of[chiave]
    r = S.getrow(i)
    o = np.argsort(-r.data)[:wmax]
    s = r.data.sum()
    print(f"\n### {etichetta} — bolla {bolla(i)} ({b['bolle'][str(bolla(i))]['n']} membri) · "
          f"{termes(bolla(i))}")
    print(f"  grado {r.nnz} · somma pesi {s:.2f} · max {r.data.max():.2f} · "
          f"top1 {100*r.data.max()/s:.1f}% · top5 {100*r.data[o[:5]].sum()/s:.1f}% · "
          f"top20 {100*r.data[o[:20]].sum()/s:.1f}%")
    print("  | # | peso | norma | %max | bolla | titolo | anno | voti | voto | stesso? |")
    print("  |---:|---:|---:|---:|---:|---|---:|---:|---:|---|")
    for rank, (j, w) in enumerate(zip(r.indices[o], r.data[o]), 1):
        j = int(j)
        flags = []
        if bid[i] == bid[j]: flags.append("bolla")
        if COLL[i] == COLL[j] and COLL[i] > 0: flags.append("coll")
        if DIR[i] == DIR[j] and DIR[i] > 0: flags.append("regia")
        if tipo[i] == tipo[j]: flags.append("medium")
        print(f"  | {rank} | {w:.3f} | {100*w/s:.2f}% | {100*w/r.data.max():.1f}% | "
              f"{bolla(j)} | {nome(j)} ({anno(j)}) | {anno(j)} | {int(VOT[j])} | {VAVE[j]:.1f} | "
              f"{', '.join(flags)} |")

print("# Fotografia di una parte del grafo\n")
print("**Data**: 21/10/2026 · **Artefatto**: triangolo V10 + `bolle.json` + `metadati-canone.npz`.")
print("**CSV**: `fotografia-grafo.csv` (l'elenco completo: 6 seed × top-20, tutte le coppie interne")
print("della bolla 1395, gli archi Inkheart → bolla 674).\n")
print("Questa non è una descrizione: è **un pezzo del grafo vero**, con i pesi e il contesto, per")
print("decidere **come costruire i pesi** della matrice N×20. I numeri sono quelli del triangolo;")
print("`w_norm` è il peso normalizzato sulla somma della riga, `w_pct_max` è il peso in percentuale")
print("del massimo della riga.\n")
print("---\n")
print("## 1. Il grafo in una tabella\n")
print("| proprietà | archi | peso |")
print("|---|---:|---:|")
for etichetta, mask in (("stessa bolla", same_b), ("stessa collezione (saga)", same_c),
                        ("stesso regista", same_d), ("stesso medium (film/film, serie/serie)", same_m),
                        ("anno entro 2", ok_y & (yg <= 2)), ("anno entro 5", ok_y & (yg <= 5)),
                        ("anno entro 10", ok_y & (yg <= 10)), ("anno oltre 10", ok_y & (yg > 10)),
                        ("entrambi ≥ 50 voti", both50)):
    pa, pp = share(mask)
    print(f"| {etichetta} | {pa:.1f}% | {pp:.1f}% |")
print(f"\n- archi: **{S.nnz:,}** · peso: **{tot:,.1f}** · grado (simmetrico): mediana **{np.median(deg):.0f}**, "
      f"p90 **{np.percentile(deg,90):.0f}**, max **{deg.max():,}**")
print(f"- peso per arco: mediana **{np.median(S.data):.4f}**, p90 **{np.percentile(S.data,90):.3f}**, "
      f"max **{S.data.max():.2f}**")
print(f"- copertura del peso di riga con i top-k: "
      f"top-10 **{100*np.median(COV[10]):.1f}%** · top-20 **{100*np.median(COV[20]):.1f}%** · "
      f"top-30 **{100*np.median(COV[30]):.1f}%** · top-50 **{100*np.median(COV[50]):.1f}%** "
      f"(mediane; p10 top-20 {100*np.percentile(COV[20],10):.1f}%, p90 {100*np.percentile(COV[20],90):.1f}%)")
print("\n**Come si legge**: il 10,8% degli archi sta dentro una bolla e porta il **52,8%** del peso;")
print("lo 0,2% degli archi è una saga e porta il **17,4%**; il **92,9%** del peso è sullo stesso medium.")
print("Il grafo è **concentrato**: la potatura top-16 tiene l'11,5% degli archi e il 70,4% della massa")
print("intra-bolla. Non è un grafo di similarità puro: è una miscela di co-visione, keyword, cast,")
print("regia, collezioni, trama e liste Trakt.\n")
print("---\n")
print("## 2. I primi 20 vicini, in chiaro\n")
for etichetta, chiave in SEEDS:
    tab(etichetta, chiave)
print("\n---\n")
print("## 3. Una bolla intera: la 1395 (22 membri)\n")
print("Membri:", " · ".join(nome(i) for i in MEM))
print("\nCoppie interne più pesanti (tutte nel CSV):\n")
print("| # | A | B | peso | % del max di A | stessa coll. | stesso regista | anno |")
print("|---:|---|---|---:|---:|---|---|---:|")
for rank, (w, i, j) in enumerate(pairs[:25], 1):
    print(f"| {rank} | {nome(i)} | {nome(j)} | {w:.3f} | {100*w/S.getrow(i).data.max():.1f}% | "
          f"{'sì' if COLL[i]==COLL[j] and COLL[i]>0 else ''} | "
          f"{'sì' if DIR[i]==DIR[j] and DIR[i]>0 else ''} | {anno(i)}/{anno(j)} |")
print("\nE il ponte strano: Inkheart → bolla **674** (comedy/TV tedesca), **17 archi in tutta la riga**\n(11 nei primi 100), pesi 0,13-0,19")
print("contro un massimo di 12,32. Sono l'1,0-1,5% del massimo, ma occupano i ranghi 41-58. Il CSV")
print("li ha tutti nella sezione `inkheart_674`.\n")
print("---\n")
print("## 4. Le righe: quanto è concentrata una riga?\n")
print("| nodo | grado | somma | max | 5° | 10° | 20° | 30° | top1 | top5 | top20 |")
print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
for etichetta, chiave in SEEDS:
    i = row_of[chiave]
    st = riga_stat(i)
    print(f"| {etichetta} | {st[0]} | {st[1]:.1f} | {st[2]:.2f} | {st[3]:.2f} | {st[4]:.2f} | "
          f"{st[5]:.2f} | {st[6]:.2f} | {100*st[7]:.1f}% | {100*st[8]:.1f}% | {100*st[9]:.1f}% |")
med = [np.nanmedian(sample[:, c]) for c in range(10)]
print(f"| *campione ({len(sample)} nodi)* | *{med[0]:.0f}* | *{med[1]:.1f}* | "
      f"*{med[2]:.2f}* | *{med[3]:.2f}* | *{med[4]:.2f}* | "
      f"*{med[5]:.2f}* | *{med[6]:.2f}* | "
      f"*{100*med[7]:.1f}%* | *{100*med[8]:.1f}%* | "
      f"*{100*med[9]:.1f}%* |")
print("\n**Come si legge**: per un nodo tipico il top-20 prende il **58,5%** del peso di riga (p10")
print("39,2%, p90 82,9%); il top-30 il **71,9%**. Per i seed-hub (Spider-Man, Breaking Bad) il top-1")
print("da solo prende il 37-63%. Una matrice N×20 **butta via il 41% del peso** di una riga tipica: è")
print("una scelta di sparsità, non una fotografia completa. Il 20° peso è ancora il **20,9%** del")
print("massimo (mediana), il 30° il **14,2%**.\n")
print("---\n")
print("## 5. Come creare i pesi: cosa c'è sul tavolo\n")
print("Il peso attuale è una **somma di 10 componenti** (CF, CFst, B, KW, TV, CAST, DIR, COLL×3,")
print("LIST, TRAMA), già mescolata. Le opzioni che vedo, da scegliere e combinare:\n")
print("| leva | cosa fa | rischio |")
print("|---|---|---|")
print("| **peso grezzo** | tiene la forza assoluta (Spider-Man 260, Perfetti 2,5) | righe non comparabili; gli hub dominano |")
print("| **riga-normalizzato** | ogni riga somma 1; confrontabile | perde la forza assoluta; una riga piatta vale una riga concentrata |")
print("| **log / sqrt** | comprime la testa (260→5,6) | perde il segnale del \"molto più vicino\" |")
print("| **rank** | robusto alla scala | butta il gap 1°-2° (Spider-Man 260 vs 16) |")
print("| **PPMI / lift** | toglie la popolarità: quanto è più probabile del caso | serve il **supporto** (co-spettatori), che il triangolo non ha |")
print("| **supporto / confidenza** | giù gli archi con pochi voti/co-spettatori | serve il dato grezzo (CF upstream), non il triangolo |")
print("| **stessa bolla** | bonus agli archi interni (52,8% del peso) | circolare: la bolla è già un risultato del grafo |")
print("| **metadati** (coll, regia, medium, anno) | bonus a saga/regista/stesso medium | sono già componenti del teacher: doppio conteggio |")
print("| **trama** (coseno) | 54% di copertura, il segnale semantico più ricco | è già il componente TRAMA: doppio conteggio |")
print("| **appreso** | un piccolo modello impara il peso dalle feature | diventa lo studente, non il teacher |")
print("\n**La domanda**: per la matrice N×20, quale combinazione? E per il **cold start**? Un titolo")
print("nuovo non ha archi: il target può essere la **bolla** (centroide) o i vicini V3 del collocatore,")
print("non la riga mancante. Va costruito un target che esista anche senza comportamento.\n")
print("---\n")
print("## 6. Cosa ti chiedo su questa fotografia\n")
print("1. **Il peso**: grezzo, normalizzato, log, rank, PPMI/lift, supporto? E con quale pavimento?")
print("2. **La simmetria**: la matrice deve essere simmetrica (top-20 per riga + trasposta) o diretta?")
print("   Il grafo è simmetrico, ma la potatura top-16 è simmetrizzata e fa rientrare gli archi inversi.")
print("3. **Il supporto**: il triangolo non porta il numero di co-spettatori. Vale la pena recuperarlo")
print("   dall'upstream CF per calcolare un lift, o il peso attuale è già abbastanza?")
print("4. **Le feature condivise**: se il peso viene da keyword/cast/regia/trama, e lo studente usa le")
print("   stesse feature, come evito che il teacher e lo studente siano la stessa funzione?")
print("5. **Il cold start**: per un titolo senza archi, qual è il target? La bolla? I vicini V3? Un")
print("   centroide? E come si misura?")
print("6. **Top-20 vs top-30**: il top-20 copre il 58,5% del peso, il top-30 il 71,9%; il 20° peso è al")
print("   20,9% del massimo, il 30° al 14,2%. Cosa sceglieresti per il target, e con quale pavimento?")
print("\n---\n")
print("## 7. Il deliverable (vale per l'handoff)\n")
print("Al termine delle spiegazioni, **scrivi una bozza di script** che addestra la rete partendo da")
print("questa matrice: caricamento della N×20 (CSV/Parquet), costruzione del target, modello, training")
print("loop, validation, salvataggio dell'embedding. Scegli tu gli **iperparametri** (dimensione,")
print("learning rate, batch, epoche, loss, dropout, weight decay, floor, negative sampling) e")
print("**motiva ogni scelta** con un numero o un'ipotesi. Lo script deve girare su questa macchina")
print("(CPU, 8 GB) o su Colab; se serve una GPU, dillo e adatta il piano.\n")
print("Il codice deve essere **una bozza**, non un saggio: poche centinaia di righe, commentate,")
print("con un `if __name__ == \"__main__\"` e un blocco di costanti in testa. Meglio un baseline")
print("semplice che gira e un'ablazione chiara, che un transformer che non si può addestrare.\n")
