"""motore.py — IL MOTORE: entra una storia, escono le liste.

E' il pezzo che mancava. Fino a ieri il meccanismo esisteva **solo dentro gli arbitri**: la diffusione,
la potatura e i pesi dei semi erano riscritti in dodici file, quindi si poteva MISURARE il meccanismo ma
non USARLO. Qui stanno in un posto solo, coi valori di `parametri.py`.

COSA ENTRA
  · una **storia**: `[("movie:603", plays), ("tv:1396", plays), ...]` — le chiavi sono quelle del
    canone (`graph.bubbles.KEY`/`ROW_OF`), o una **utente Trakt** per nome (`da_trakt`)
  · gli **slider** (tre, e vedi `slider()` per il perche' dei nomi): `largo`, `lontano`, `cozy`, `canone`

COSA ESCE — il contratto di ritorno deciso nella mappa (§2b):
  {
    "versioni":  {artefatto, ricetta}          le due impronte che vanno nella chiave della cache
    "profilo":   {canone, forma, freddo}       gli assi DEDOTTI dalla storia
    "semi":      {n, da_catalogo}              quanti e da dove
    "mondi":     [{bolla, attivazione, titoli, voti_mediani, vicini}, ...]
    "liste":     [{tipo, mondo, titoli: [(chiave, attivazione), ...]}, ...]
  }

LE LISTE (§3d): il tuo mondo · un passo fuori · le uscite nuove · la nicchia di qualita' — piu' un
catalogo per ogni mondo diverso.

E LA REGOLA DEGLI ASSI (§13), che qui e' codice e non opinione: **un asse non sostituisce l'attivazione,
la modula.** Filtrare i titoli dentro un mondo o riordinare i mondi fa crollare il portafoglio a 3-14
titoli con copertura 0,0%; modulare lo tiene pieno (32) e giusto (2,3-2,6%).

    python -m graph.motore --utente coldlocals
    python -m graph.motore --storia storia.json
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import camminata as C
from graph import canon as K
from graph import parametri as P

T0 = time.time()

# ============================================================================================
# GLI SLIDER — i nomi dicono la RICHIESTA, non la persona (§13)
# ============================================================================================
SLIDER_DEFAULT = {
    "largo": 4,        # quante liste: 2 = «resta nel tuo mondo», 8 = «esci»
    "lontano": 0.0,    # 0 = i mondi piu' accesi · 1 = i piu' diversi per fascia e medium
    "cozy": 0.0,       # -1 = impegnativo · 0 = indifferente · +1 = cozy
    "canone": 0.0,     # -1 = nicchia · 0 = come la storia dice · +1 = popolare
}


class Motore:
    """Tutto caricato una volta. Il costo e' il caricamento (~20 s), non la risposta."""

    def __init__(self, silenzioso=False):
        q = np.load(K.A("bolle-eterogeneo-V10-p1.0-triangolo.npz"))
        self.N = int(q["indptr"].shape[0]) - 1
        W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(self.N, self.N)).tocsr()
        self.Wp = C.pota((W + W.T).tocsr())
        self.Tr = C.transizione(self.Wp)
        self.MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
        self.NB = int(self.MEM.max()) + 1
        self.SZ = np.bincount(self.MEM)
        self.MEMBRI = [np.where(self.MEM == b)[0] for b in range(self.NB)]
        M = np.load(K.A("mappa-finale-6-2.npz"), allow_pickle=True)
        self.INTRA = M["intra"]
        self.artefatto = K.sha_file("bolle-eterogeneo-subvoti.npy")
        # TUTTI I METADATI IN UN COLPO: `canon.metadati()` li costruisce una volta, vettorizzato, e li
        # salva in `graph/data/`. Qui prima c'erano DUE passate complete sui Parquet TMDB iterate riga per
        # riga (`d.iloc[k]` su ~117.000 righe): erano il costo vero dell'avvio — **51 secondi** misurati,
        # non i 20 che diceva il commento — e la matrice sparsa non c'entrava niente.
        m = K.metadati()
        self.TIT, self.VOT = m["TIT"], m["VOT"]
        self.VAVE, self.POP, self.ANNO = m["VAVE"], m["POP"], m["ANNO"]
        self.NEP = m["NEP"].astype(np.float32)          # (il denominatore del peso delle serie)
        self.COZY, self.IMP = m["COZY"], m["IMP"]       # gli assi, dalle impronte dei generi
        self._generi = {int(x) for x in P.ASSE_COZY_GENERI.split(",")}
        self._generi_imp = {int(x) for x in P.ASSE_IMPEGNATIVO_GENERI.split(",")}
        self.VOTMED = np.array([float(np.median(self.VOT[self.MEMBRI[b]]))
                                if len(self.MEMBRI[b]) else 0.0 for b in range(self.NB)])
        # la componente LISTE di Trakt: corroborazione per la nicchia di qualita'
        z = np.load(K.A("nuovo-LIST.npz"))
        n = len(z["indptr"]) - 1
        self.LISTDEG = np.asarray((sp.csr_matrix((z["data"], z["indices"], z["indptr"]),
                                                  shape=(n, n)) > 0).sum(1)).ravel().astype(float)
        if not silenzioso:
            print(f"  motore pronto: {self.NB:,} mondi · {self.N:,} titoli · "
                  f"artefatto {self.artefatto} ({time.time()-T0:.0f}s)", file=sys.stderr)

    @staticmethod
    def _pota(M, k):
        """Vedi `graph/camminata.py`: la camminata sta in un posto solo."""
        return C.pota(M, k)

    # ------------------------------------------------------------------ i semi
    def pesi_semi(self, righe, plays, tipi=None):
        """Vedi `camminata.pesi_semi`: film min(plays,3), serie 1+2x(frazione episodi), volte il tipo."""
        return C.pesi_semi(righe, plays, self.NEP, tipi)

    def diffondi(self, righe, plays, tipi=None):
        """PageRank personalizzato: l'attivazione PER MONDO e quella PER TITOLO."""
        r = C.diffondi(self.Tr, righe, plays, self.NEP, tipi=tipi)
        return C.attiva_per_mondo(r, self.MEM, self.NB), r

    def deduci(self, righe):
        """Gli assi che la storia dice da sola: canone (voti mediani) e forma (quanti mondi pieni)."""
        voti = self.VOT[righe]
        voti = voti[voti > 0]
        canone = float(np.median(voti)) if len(voti) else 0.0
        bolle, conta = np.unique(self.MEM[righe], return_counts=True)
        forma = int((conta >= max(2, 0.02 * len(righe))).sum())
        return {"canone": canone, "forma": forma, "freddo": len(righe) < P.FREDDO_SOTTO}

    # ------------------------------------------------------------------ gli assi
    def _quota_per_mondo(self, maschera):
        q = np.zeros(self.NB)
        for b in range(self.NB):
            m = self.MEMBRI[b]
            q[b] = float(maschera[m].mean()) if len(m) else 0.0
        return q

    def modula(self, att, slider, dedotto):
        """GLI ASSI MODULANO L'ATTIVAZIONE, non la sostituiscono (§13)."""
        out = att.copy()
        if slider.get("cozy"):
            quota = (self._quota_per_mondo(self.COZY) * slider["cozy"]
                     - self._quota_per_mondo(self.IMP) * slider["cozy"])
            out = out * np.exp(P.ASSE_PESO * quota)
        if slider.get("canone"):
            # LA FASCIA E' UNA FINESTRA CHE SI SPOSTA, NON UN RIORDINO VERSO L'ESTREMO.
            # Qui c'era `abs(q - c) * abs(s) * np.sign(q - c) * s`: ma `abs(x)*sign(x)` E' IDENTICO a
            # `x`, quindi l'esponente era `-(q-c)*s*|s|` — una RETTA, non una campana. Con s>0 premiava
            # i mondi mainstream in assoluto, con s<0 i contenitori a 0 voti: esattamente il riordino
            # verso l'estremo che il commento diceva di evitare (e che in ricetta.py faceva crollare la
            # copertura allo 0,3%). Ora il centro si sposta: +1 = piu' popolare, -1 = piu' di nicchia,
            # e nessuno dei due estremi puo' premiare un mondo a zero voti (P.DELTA_FASCIA).
            q = np.log(np.maximum(self.VOTMED, 1.0))
            c = np.log(max(dedotto["canone"], 1.0)) + slider["canone"] * P.DELTA_FASCIA
            out = out * np.exp(-P.ASSE_PESO * np.abs(q - c))
        return out

    # ------------------------------------------------------------------ la selezione
    def scegli_mondi(self, att, slider):
        quante = int(slider.get("largo", 4))
        lontano = float(slider.get("lontano", 0.0))
        ordine = list(np.argsort(-att)[:60])
        diverse = int(round(quante * lontano))
        scelti = []

        def diverso_da(cb, scelti):
            meio = B.IS_TV[self.MEM == cb].mean() > 0.5
            return all(abs(np.log(max(self.VOTMED[cb], 1) / max(self.VOTMED[bb], 1)))
                       > P.MONDI_DIVERSI_SOGLIA_FASCIA
                       or meio != (B.IS_TV[self.MEM == bb].mean() > 0.5) for bb in scelti)

        # i primi `quante - diverse` per attivazione, gli altri per diversita'
        for cb in ordine:
            cb = int(cb)
            if len(scelti) >= quante:
                break
            if len(scelti) >= quante - diverse or diverso_da(cb, scelti):
                if cb not in scelti:
                    scelti.append(cb)
        return scelti

    def titoli_di(self, bolle, r, visti, quanti_per_mondo=10):
        """I titoli non visti di queste bolle, ordinati per attivazione — SENZA RIPETIZIONI.

        Il dedup non e' un dettaglio: due mondi vicini hanno membri in comune, e concatenando le loro
        liste lo stesso titolo compariva due volte (e lo stesso mondo pure: 733 e 1519 davano le stesse
        voci). Trovato leggendo il documento della lettura, non da un test.
        """
        fuori, gia = [], set()
        for b in bolle:
            m = np.setdiff1d(self.MEMBRI[b], list(visti))
            if len(m):
                for x in m[np.argsort(-r[m])][:quanti_per_mondo].tolist():
                    if x not in gia:
                        gia.add(x)
                        fuori.append(x)
        return fuori

    # ------------------------------------------------------------------ IL METODO
    def lista(self, storia, slider=None):
        """Una storia e' una lista di `(chiave, plays)` OPPURE di `(chiave, plays, tipo)`.

        Il `tipo` e' il segnale del prodotto: "loved", "liked", "watched", "library". Senza tipo si
        assume "watched": il comportamento di prima, bit per bit.
        """
        slider = {**SLIDER_DEFAULT, **(slider or {})}
        voci = []
        for voce in storia:
            ch, pl = voce[0], voce[1]
            tp = voce[2] if len(voce) > 2 else "watched"
            if ch in B.ROW_OF:
                voci.append((ch, pl, tp))
        if not voci:
            return {"errore": "nessun titolo della storia e' nel canone", "liste": []}
        righe = np.array([B.ROW_OF[ch] for ch, _, _ in voci], np.int64)
        plays = np.array([pl for _, pl, _ in voci], float)
        tipi = [tp for _, _, tp in voci]
        dedotto = self.deduci(righe)
        att, r = self.diffondi(righe, plays, tipi)
        att_s = self.modula(att, slider, dedotto)
        bolle = self.scegli_mondi(att_s, slider)
        visti = set(righe.tolist())
        # LA LIBRERIA E' INTENZIONE, NON VISIONE: un titolo che l'utente ha messo in libreria NON va
        # escluso dai suggerimenti come se l'avesse visto. Si escludono i soli titoli visti/amati.
        if any(t == "library" for t in tipi):
            visti = {int(r_) for r_, t in zip(righe, tipi) if t != "library"}
        # I MONDI TROPPO PICCOLI non valgono come catalogo a se' (parametri.MIN_TITOLI_MONDO). Il PRIMO
        # resta sempre, anche se e' piccolo: e' il mondo del profilo. Nato dal motore: il mondo 3379
        # (4 titoli) produceva una lista di UN titolo.
        if bolle:
            tenuti = [bolle[0]]
            for b in bolle[1:]:
                if len(np.setdiff1d(self.MEMBRI[b], list(visti))) >= P.MIN_TITOLI_MONDO:
                    tenuti.append(b)
            bolle = tenuti
        primo = bolle[0] if bolle else None
        vicini = [int(x) for x in self.INTRA[primo] if x >= 0][:3] if primo is not None else []

        def righe_titoli(bs, quanti=10):
            return [(B.KEYS[r_], float(r[r_])) for r_ in self.titoli_di(bs, r, visti, quanti)]

        liste = []
        liste.append({"tipo": "il_tuo_mondo", "mondo": primo, "titoli": righe_titoli([primo])})
        liste.append({"tipo": "un_passo_fuori", "mondo": None, "titoli": righe_titoli(vicini)})
        # le uscite nuove: 2025+ dentro i mondi accesi (la porta d'ingresso lavora di notte)
        nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0]
                 if int(self.MEM[x]) in set(bolle) and x not in visti]
        liste.append({"tipo": "uscite_nuove", "mondo": None,
                      "titoli": [(B.KEYS[x], float(r[x])) for x in nuove[:10]]})
        # la nicchia di qualita': non iper-popolare, ben votata, meglio se in liste di altri
        cand = [x for x in self.titoli_di(bolle + vicini, r, visti, 20)]
        nic = [x for x in cand if self.POP[x] <= P.NICCHIA_POPOLARITA_MAX
               and self.VAVE[x] >= P.NICCHIA_VOTO_MIN]
        nic.sort(key=lambda x: -(self.VAVE[x] + (P.NICCHIA_BONUS_LISTE if self.LISTDEG[x] > 0 else 0)))
        liste.append({"tipo": "nicchia_di_qualita", "mondo": None,
                      "titoli": [(B.KEYS[x], float(r[x])) for x in nic[:10]]})
        for b in bolle[1:]:
            liste.append({"tipo": f"mondo_{b}", "mondo": int(b), "titoli": righe_titoli([b], 8)})

        return {"versioni": {"artefatto": self.artefatto, "ricetta": P.impronta()},
                "slider": slider,
                "profilo": dedotto,
                "semi": {"n": int(len(righe)), "da_catalogo": bool(dedotto["freddo"])},
                "mondi": [{"bolla": int(b), "attivazione": float(att[b]), "titoli": int(self.SZ[b]),
                           "voti_mediani": float(self.VOTMED[b]),
                           "quota_serie": float(B.IS_TV[self.MEM == b].mean()),
                           "vicini": [int(x) for x in self.INTRA[b] if x >= 0][:6]} for b in bolle],
                "liste": liste}


def da_trakt(utente):
    """La storia di un utente Trakt in cache: [(chiave, plays), ...] IN ORDINE CRONOLOGICO.

    Prima questa funzione ciclava `movie` poi `show` senza leggere `last_watched_at`, quindi l'array era
    **tutti i film e poi tutte le serie**: chi tagliava a meta' credendo di separare passato e futuro
    separava i MEDIUM. Ora la storia arriva gia' ordinata da `canon.storia_trakt`, che e' l'unico posto
    dove questi JSON si leggono. I file sono troncati a 300 voci.
    """
    chiavi, _righe, plays, _eta = K.storia_trakt(utente, ordine="cronologico")
    return [(c, int(p)) for c, p in zip(chiavi, plays)]


def stampa(esito):
    if esito.get("errore"):
        print(f"  ERRORE: {esito['errore']}")
        return
    pr = esito["profilo"]
    print(f"\n  versione artefatto {esito['versioni']['artefatto']} · ricetta "
          f"{esito['versioni']['ricetta']} · slider {esito['slider']}")
    print(f"  profilo DEDOTTO: canone {pr['canone']:,.0f} voti · forma {pr['forma']} mondi · "
          f"{'FREDDO' if pr['freddo'] else 'caldo'} · semi {esito['semi']['n']}")
    print(f"\n  i mondi accesi ({len(esito['mondi'])}, col loro peso e la loro fascia):")
    for m in esito["mondi"]:
        vs = "serie" if m.get("quota_serie", 0) > 0.5 else "film"
        print(f"    mondo {m['bolla']:>5} · acceso {100*m['attivazione']:>5.2f}% · {m['titoli']:>4} titoli · "
              f"{vs} · voti mediani {m['voti_mediani']:>7,.0f}")
    print(f"\n  LE LISTE:")
    for li in esito["liste"]:
        if not li["titoli"]:
            print(f"    {li['tipo']:<20} —  (vuota)")
            continue
        print(f"    {li['tipo']:<20} ({len(li['titoli'])} titoli)")
        print(f"      " + " · ".join(f"{TITOLI.get(k, k)[:26]}" for k, _ in li["titoli"][:8]))


TITOLI = {}


def carica_titoli():
    """Riempie TITOLI (chiave -> nome) per la stampa. Separato perche' serve solo a MOSTRARE."""
    import pandas as pd
    for f, tipo, col in (("movies.parquet", "movie", "title"), ("tv.parquet", "tv", "name")):
        d = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
        for i, t in zip(d["id"], d[col]):
            TITOLI[f"{tipo}:{int(i)}"] = str(t)
    return TITOLI


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Il motore: entra una storia, escono le liste")
    ap.add_argument("--utente", help="un utente Trakt in cache")
    ap.add_argument("--storia", help="un JSON: [[chiave, plays], ...]")
    ap.add_argument("--largo", type=int, default=SLIDER_DEFAULT["largo"])
    ap.add_argument("--lontano", type=float, default=SLIDER_DEFAULT["lontano"])
    ap.add_argument("--cozy", type=float, default=SLIDER_DEFAULT["cozy"])
    ap.add_argument("--canone", type=float, default=SLIDER_DEFAULT["canone"])
    ap.add_argument("--json", action="store_true", help="stampa l'esito completo in JSON")
    a = ap.parse_args()

    M = Motore()
    carica_titoli()

    if a.storia:
        storia = [(k, p) for k, p in json.load(open(a.storia, encoding="utf-8"))]
    elif a.utente:
        storia = da_trakt(a.utente)
    else:
        ap.error("serve --utente o --storia")
    esito = M.lista(storia, {"largo": a.largo, "lontano": a.lontano,
                             "cozy": a.cozy, "canone": a.canone})
    if a.json:
        print(json.dumps(esito, ensure_ascii=False, indent=1))
    else:
        stampa(esito)
