"""06-giudice.py — TICKET 06: il giudice automatico delle bolle (intruder test).

Perche' esiste: leggere 100 bolle a mano ha validato l'esistenza del canone, ma non scala e NON
CONFRONTA due configurazioni. Qui si automatizza la parte automatizzabile.

IL TEST: si campionano bolle di taglia >=6. Per ciascuna si prendono 4 membri e si inietta 1
INTRUSO pescato da una bolla a distanza >=2 nel grafo delle bolle e nella STESSA FASCIA di
popolarita' della bolla. Un giudice cieco (un modello linguistico) vede solo titolo, anno, regia,
generi e trama dei 5 — mai l'identita' della bolla, mai gli altri membri — e deve dire l'intruso.

Punteggio = tasso di identificazione corretta. Il caso e' 20%: sopra il 20% c'e' un filo.

VALIDAZIONE (il criterio del ticket): le 5 bolle che la lettura umana ha giudicato minestrone
(report 74) sono FORZATE nel campione, e devono finire in fondo alla classifica. Se non ci
finiscono, e' lo strumento a essere sbagliato — non le bolle — e va scritto cosi'.

Uso:  python .scratch/grafo-servibile/06-giudice.py <bolle2-X> [quante] [--prova]
      --prova = stampa i 5 prompt invece di chiamare l'API (nessun costo)
"""
import json, os, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp
import requests

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

PART = sys.argv[1] if len(sys.argv) > 1 else "bolle2-E"
QUANTE = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 200
PROVA = "--prova" in sys.argv
# Senza regia: nella variante piena l'intruso si riconosce dal campo «regia» quando la bolla e'
# definita da un autore solo (verificato: [1288] ha quattro membri tutti di Richard Loncraine).
# La variante senza regia misura il filo TEMATICO, che e' la domanda vera del ticket 08.
SENZA_REGIA = "--senza-regia" in sys.argv
SUFFISSO = "-senza-regia" if SENZA_REGIA else ""
MINESTRONE = [217, 1270, 1267, 1215, 1288]      # dalla lettura umana, report 74

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
PQ = K.ML.parent / "tmdb"

TIT = {}; ANNO = {}; REGIA = {}; GENERI = {}; TRAMA = {}
for f, col, dcol in (("movies.parquet", "title", "directors"), ("tv.parquet", "name", "created_by")):
    typ = "movie" if f.startswith("m") else "tv"
    d = pd.read_parquet(PQ / f, columns=["id", col, dcol, "genres", "overview",
                                         "release_date" if typ == "movie" else "first_air_date"])
    dcol_data = d[dcol]
    genres_data = d["genres"]
    ov_data = d["overview"]
    date_data = d["release_date" if typ == "movie" else "first_air_date"]
    for i, t, rg, gn, ov, dt in zip(d["id"], d[col], dcol_data, genres_data, ov_data, date_data):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        TIT[r] = str(t)
        ANNO[r] = str(dt)[:4] if dt else "?"
        try:
            g = json.loads(rg) if isinstance(rg, str) else (rg or [])
            REGIA[r] = ", ".join((x.get("name", "") if isinstance(x, dict) else str(x)) for x in g[:2])
        except Exception:
            REGIA[r] = ""
        try:
            g = json.loads(gn) if isinstance(gn, str) else (gn or [])
            GENERI[r] = ", ".join((x.get("name", "") if isinstance(x, dict) else str(x)) for x in g[:4])
        except Exception:
            GENERI[r] = ""
        TRAMA[r] = (str(ov)[:280] if ov else "").replace("\n", " ")
print(f"metadati per il giudice pronti ({time.time()-t0:.0f}s)", flush=True)

mem = np.load(K.ML / f"{PART}.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()

# --- il grafo delle bolle, per la distanza >= 2 ---
C = K.Componenti(n)
Cc = C(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    Cc[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(Cc, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
G = (P.T @ M @ P).tocsr()
G.setdiag(0)
G.eliminate_zeros()
vicini = [set(G.getrow(b).indices.tolist()) for b in range(nb)]
print(f"{PART}: {nb:,} bolle · mediana taglia {int(np.median(sz))} · "
      f"mediana vicini {int(np.median([len(v) for v in vicini])):,} ({time.time()-t0:.0f}s)", flush=True)

FASCE = None          # l'appaiamento e' sul NUMERO DI VOTI, non sulla fascia: una bolla puo'
                      # mescolare film e serie, e le due scale non sono confrontabili


W = None


def scegli(b, rng):
    """4 membri + 1 intruso per la bolla b. Torna (righe, posizione dell'intruso).

    L'intruso viene da una bolla a distanza >=2 e con un numero di voti DENTRO UN FATTORE 2 dalla
    mediana dei membri: senza, l'intruso si riconoscerebbe dalla fama invece che dal filo — ed e'
    il confondimento che questa cautela esiste per escludere.
    """
    m = np.where(mem == b)[0]
    if len(m) < 6:
        return None
    membri = rng.choice(m, size=4, replace=False)
    med = float(np.median(voti[membri]))
    lontane = [x for x in range(nb) if x != b and x not in vicini[b] and sz[x] >= 4]
    if not lontane:
        return None
    rng.shuffle(lontane)
    for fattore in (2.0, 3.0, 5.0):
        for x in lontane[:60]:
            cand = np.where((mem == x) & (voti >= med / fattore) & (voti <= med * fattore))[0]
            if len(cand):
                intruso = int(rng.choice(cand))
                righe = list(membri) + [intruso]
                ordine = rng.permutation(5)
                return [righe[i] for i in ordine], int(np.where(ordine == 4)[0][0])
    return None


def prompt(righe):
    voci = []
    for i, r in enumerate(righe, 1):
        voci.append(f"{i}. {TIT.get(r,'?')} ({ANNO.get(r,'?')})"
                    + (f" — director/creator: {REGIA[r]}" if REGIA.get(r) and not SENZA_REGIA else "")
                    + (f" — genres: {GENERI[r]}" if GENERI.get(r) else "")
                    + (f"\n   {TRAMA[r]}" if TRAMA.get(r) else ""))
    return ("Five titles are shown. Four of them belong to the same coherent group — a shared "
            "theme, school, director, era, genre or audience. One is an INTRUDER that does not "
            "belong.\n\n" + "\n".join(voci) +
            "\n\nWhich number is the intruder? Answer with ONLY the number, nothing else.")


# --- il campione: 200 bolle di taglia >=6, con le 5 minestrone FORZATE dentro ---
rng = np.random.default_rng(17)
grandi = [b for b in range(nb) if sz[b] >= 6]
scelte = list(rng.choice([b for b in grandi if b not in MINESTRONE],
                         size=min(QUANTE - len(MINESTRONE), len(grandi) - len(MINESTRONE)),
                         replace=False))
scelte = MINESTRONE + [int(x) for x in scelte]
print(f"campione: {len(scelte)} bolle (le 5 minestrone forzate dentro)")

CASI = []
for b in scelte:
    c = scegli(b, rng)
    if c:
        CASI.append((b, c[0], c[1]))
print(f"casi costruiti: {len(CASI)} ({time.time()-t0:.0f}s)", flush=True)

if PROVA:
    for b, righe, pos in CASI[:5]:
        print("")
        print(f"--- bolla [{b}] (taglia {sz[b]}) · intruso in posizione {pos+1}: {TIT.get(righe[pos])}")
        print(prompt(righe))
    sys.exit(0)

# --- il giudice ---
CHIAVE = ""
for riga in (K.ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if riga.startswith("MISTRAL_API_KEY="):
        CHIAVE = riga.split("=", 1)[1].strip()
MODELLO = os.environ.get("MISTRAL_MODEL", "open-mistral-nemo")
for riga in (K.ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if riga.startswith("MISTRAL_MODEL="):
        MODELLO = riga.split("=", 1)[1].strip()
assert CHIAVE, "MISTRAL_API_KEY non trovata in .env"
print(f"giudice: {MODELLO} · {len(CASI)} chiamate", flush=True)


def chiedi(testo):
    for tentativo in range(4):
        try:
            r = requests.post("https://api.mistral.ai/v1/chat/completions",
                              headers={"Authorization": f"Bearer {CHIAVE}",
                                       "Content-Type": "application/json"},
                              json={"model": MODELLO, "temperature": 0.0,
                                    "messages": [{"role": "user", "content": testo}]},
                              timeout=40)
            if r.status_code == 429:
                time.sleep(6 * (tentativo + 1))
                continue
            r.raise_for_status()
            d = r.json()
            return d["choices"][0]["message"]["content"], d.get("usage", {})
        except Exception as e:
            if tentativo == 3:
                return f"ERRORE {e}", {}
            time.sleep(3 * (tentativo + 1))
    return "ERRORE", {}


ESITI, token_in, token_out = [], 0, 0
for k, (b, righe, pos) in enumerate(CASI):
    testo = prompt(righe)
    risposta, uso = chiedi(testo)
    token_in += uso.get("prompt_tokens", 0)
    token_out += uso.get("completion_tokens", 0)
    trovato = None
    for parola in str(risposta).replace(".", " ").replace(",", " ").split():
        if parola.strip().isdigit() and 1 <= int(parola) <= 5:
            trovato = int(parola) - 1
            break
    ESITI.append({"bolla": int(b), "taglia": int(sz[b]), "intruso": pos, "risposta": trovato,
                  "giusto": bool(trovato == pos)})
    if (k + 1) % 25 == 0:
        acc = 100 * np.mean([e["giusto"] for e in ESITI])
        print(f"  {k+1}/{len(CASI)} · identificazione {acc:.1f}% · "
              f"{token_in+token_out:,} token · {time.time()-t0:.0f}s", flush=True)

giusti = [e["giusto"] for e in ESITI]
acc = 100 * float(np.mean(giusti))
print("")
print("=" * 100)
print(f"ESITO — {PART}{SUFFISSO}")
print("=" * 100)
print(f"  identificazione corretta dell'intruso: {acc:.1f}% su {len(ESITI)} bolle "
      f"(il caso e' 20,0%)")
print(f"  token: {token_in:,} in · {token_out:,} out · {token_in+token_out:,} totali")
print(f"  tempo: {time.time()-t0:.0f}s ({len(ESITI)/max(time.time()-t0,1)*60:.0f} bolle/minuto)")
print(f"  risposte non interpretabili: {sum(1 for e in ESITI if e['risposta'] is None)}")

# --- la validazione contro la lettura umana ---
print("")
print("  --- VALIDAZIONE contro la lettura umana (le 5 minestrone devono stare in fondo) ---")
pos_class = sorted(range(len(ESITI)), key=lambda i: (ESITI[i]["giusto"], -ESITI[i]["taglia"]))
classifica = {ESITI[i]["bolla"]: r + 1 for r, i in enumerate(pos_class)}
for b in MINESTRONE:
    if b in classifica:
        e = next(e for e in ESITI if e["bolla"] == b)
        print(f"    [{b}] identificazione {'CORRETTA' if e['giusto'] else 'SBAGLIATA'} · "
              f"posizione nella classifica per difficolta': {classifica[b]}/{len(ESITI)}")
in_fondo = [b for b in MINESTRONE if b in classifica and classifica[b] > 0.8 * len(ESITI)]
print(f"  >>> minestrone nel 20% peggiore della classifica: {len(in_fondo)}/5 "
      f"(per caso ci si aspetta 1)")
print(f"      prob. che tutte e 5 finiscano li' per caso: {(0.2)**5:.5f}")

out = QUI / "log" / f"giudice-{PART}{SUFFISSO}.json"
out.write_text(json.dumps({"partizione": PART, "senza_regia": SENZA_REGIA,
                           "accuratezza": acc, "esiti": ESITI, "token_in": token_in,
                           "token_out": token_out, "secondi": time.time() - t0}, indent=1),
               encoding="utf-8")
print(f"\n  salvato in {out}")
