"""01-contratti.py — TICKET 01: i tre contratti relazionali, e la prova che servono.

§4 del senior. Ognuno ha un incidente **reale** di questa sessione come banco di prova:
  · `assert_loo_esatto`      il 55,8% che era 33,2% (leak sui top-5 esemplari), e il 63,7% che era 35,3%
  · `assert_universo`        le 94 serie «escluse», e il `caso 58,27%` su una misura che valeva 0,33%
  · `assert_allineamento_spazi`  l'autore di questi contratti che carica gli idf grezzi mentre il
                             corpus e' pesato per tipo

Un contratto che non fallisce su un bug vero non e' un contratto: qui ognuno deve **accendersi**.
"""
import hashlib
import json
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
from graph import canon as K

ML = K.ML
print("=" * 100)
print("TICKET 01 — I TRE CONTRATTI RELAZIONALI")
print("=" * 100, flush=True)

ESITI = []


def prova(nome, cosa, azione, deve_accendersi=True):
    try:
        r = azione()
        acceso = False
        msg = f"passa, valore {r}" if r is not None else "passa"
    except AssertionError as e:
        acceso = True
        msg = f"ACCESO — {str(e)[:88]}"
    ok = "OK  " if acceso == deve_accendersi else "!!  "
    print(f"  {ok}{nome}\n      {cosa}\n      {msg}")
    ESITI.append((nome, acceso, deve_accendersi))
    return acceso


# ============================================================ 1. assert_loo_esatto
print("\n1. `assert_loo_esatto` — contro il data leakage nel leave-one-out")
print("-" * 100)
rng = np.random.default_rng(7)
X = rng.random((40, 60), dtype=np.float32)
X /= np.linalg.norm(X, axis=1, keepdims=True)
MEMBRI = {0: list(range(0, 12)), 1: list(range(12, 26)), 2: list(range(26, 40))}
i, b = 5, 0

# il punteggio VELOCE, sbagliato apposta: il centroide include ancora i (il bug classico)
mu_sporco = X[MEMBRI[b]].mean(0)
mu_sporco /= np.linalg.norm(mu_sporco)
veloce_sbagliato = float(X[i] @ mu_sporco)
prova("centroide che include l'item", "il LOO vettorizzato non ha tolto i",
      lambda: K.assert_loo_esatto(X, MEMBRI, i, b, veloce_sbagliato, nome="sintetico"))

# e quello giusto: passa
mu_puro = X[[m for m in MEMBRI[b] if m != i]].mean(0)
mu_puro /= np.linalg.norm(mu_puro)
veloce_giusto = float(X[i] @ mu_puro)
prova("centroide che lo esclude", "il LOO e' completo",
      lambda: K.assert_loo_esatto(X, MEMBRI, i, b, veloce_giusto, nome="sintetico"),
      deve_accendersi=False)

# il caso VERO del ticket 06: l'auto-similarita' nei top-5 esemplari
print("\n      il caso vero (ticket 06): i top-5 esemplari di una bolla contengono la serie stessa,")
print("      che fa 1,0 di coseno con se'. Il contratto qui non vede il top-5 — vede il centroide —")
print("      quindi la protezione sta nell'azzerare la diagonale PRIMA, e il contratto la verifica")
print("      sul lato centroide. Sono due protezioni, e servivano tutte e due.")
Xbig = rng.random((600, 80), dtype=np.float32)
Xbig /= np.linalg.norm(Xbig, axis=1, keepdims=True)
MB = {0: list(range(0, 40))}
leak = float(Xbig[3] @ (Xbig[MB[0]].mean(0) / np.linalg.norm(Xbig[MB[0]].mean(0))))
prova("auto-similarita' dentro il centroide", "il 55,8% del ticket 06 aveva questa forma",
      lambda: K.assert_loo_esatto(Xbig, MB, 3, 0, leak, nome="il caso del ticket 06"))

# ============================================================ 2. assert_universo
print("\n2. `assert_universo` — il tetto va dichiarato insieme al risultato")
print("-" * 100)
vero = np.array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
cand = np.array([1, 2, 3, 4, 5, 6, 7, 8, 99, 100])          # il caso delle 94
tetto, dentro = K.assert_universo(vero, cand, "sintetico")
prova("copertura incompleta", "il caso delle 94 serie: due bolle fuori dai candidati",
      lambda: K.assert_universo(vero, cand, "", stampa=False), deve_accendersi=False)
print(f"      ^ non e' un assert, e' una STAMPA obbligatoria: il tetto esce sempre. "
      f"Qui vale {100*tetto:.0f}%.")

# il tasso base calcolato con la stessa funzione di perdita, non a parte
print("\n      e il tasso base con la stessa metrica:")
pred = np.array([1, 2, 3, 4, 5, 99, 7, 8, 9, 100])
acc = float((pred == vero).mean())
print(f"      accordo {100*acc:.0f}% · col contratto: ", end="")
K.stampa_tasso("sintetico (etichette, non flag)", pred, vero)
print("      ^ con `vero` passato, il caso lo calcola la PERMUTAZIONE. Senza, la formula della")
print("        prevalenza darebbe un numero che sembra un caso e non lo e' (58,27% contro 0,33%).")

# ============================================================ 3. assert_allineamento_spazi
print("\n3. `assert_allineamento_spazi` — l'idf e il vocabolario si congelano INSIEME")
print("-" * 100)
vocab = json.load(open(K.A("05-vocab.json"), encoding="utf-8"))
idf = np.load(K.A("05-idf.npy")).astype(np.float32)
impronte = K.assert_allineamento_spazi(idf, vocab, {}, nome="05-*")
print(f"      impronte calcolate: idf {impronte['idf']} · vocab {impronte['vocab']}")
prova("idf e vocabolario coerenti", "gli artefatti salvati insieme",
      lambda: K.assert_allineamento_spazi(idf, vocab, impronte, nome="05-*"),
      deve_accendersi=False)
prova("idf rigenerato senza rigenerare i pesi", "il bug vero di `colloca_finale.carica()`",
      lambda: K.assert_allineamento_spazi(idf * 1.5 + 1e-6, vocab, impronte, nome="05-*"))
prova("vocabolario cambiato", "un termine aggiunto a mano al vocabolario",
      lambda: K.assert_allineamento_spazi(idf, {**vocab, "kw:nuovo": len(vocab)}, impronte,
                                          nome="05-*"))

# salvo le impronte, cosi' il collocatore puo' verificarle all'avvio
json.dump(impronte, open(K.A("05-impronte.json"), "w", encoding="utf-8"))
print(f"\n  impronte salvate in `05-impronte.json`: il collocatore le verifichera' all'avvio.")

# ============================================================ verdetto
print("\n" + "=" * 100)
print("VERDETTO")
print("=" * 100)
accesi = [e for e in ESITI if e[1] and e[2]]
non_accesi = [e for e in ESITI if not e[1] and e[2]]
falsi = [e for e in ESITI if e[1] and not e[2]]
print(f"  casi che il contratto DEVE fermare: {len([e for e in ESITI if e[2]])} · "
      f"fermati: {len(accesi)} · mancati: {len(non_accesi)} · falsi allarmi: {len(falsi)}")
for nome, acceso, deve in ESITI:
    stato = ("fermato" if acceso else "NON FERMATO") if deve else ("ALLARME INDEBITO" if acceso else "nessun allarme (giusto)")
    print(f"    {nome:<44} {stato}")
