"""uscite.py — LA PORTA D'INGRESSO DELLE USCITE (Ticket 10).

IL PROBLEMA CHE RISOLVE. Il canone del grafo è **storico**: 66.259 nodi di co-visione Trakt/MovieLens.
Le uscite 2025–2026 dei Parquet TMDB (117.000 righe) dentro il canone **non ci sono quasi mai**, e la
riga «uscite nuove» le cercava solo fra le 1–4 bolle del profilo: 50–80 titoli su 66.259. Risultato:
una riga vuota quasi sempre, e — prima del Ticket 07 — muta.

COME. `collocator.colloca` esiste già e sa mettere un titolo nuovo in una bolla dai suoi metadati TMDB.
Qui quella porta si usa **offline, una volta sola**: si leggono i Parquet, si tengono le uscite recenti
che passano un pavimento permissivo (i recenti hanno pochi voti), si collocano, e si salva tutto in
`graph/data/uscite-collocate.npz`. A runtime si legge la cache e si calcola:

    score_nuovo(y) = att_s[b_y] * confidenza(y) * qualità(y)

con `qualità` = il voto bayesiano di TMDB degli stessi parametri del motore (`BAYESIAN_M/C`,
`RANKING_BAYES_BASE`): nessun numero nuovo, nessuna matrice ricostruita, latenza di un ordinamento.

LA CONFIDENZA NON SI IGNORA: la collocazione è una **stima**, e moltiplicarla nel punteggio è il modo di
dire «questo titolo è del tuo mondo, ma non ne sono certo». Il peso va in proporzione, non in un taglio.

DUE REGOLE, e sono le lezioni di questo cantiere:
  · **La cache si dichiara.** Se manca, la riga non sparisce: lo dice, col motivo e coi conteggi.
  · **Nessun numero inventato.** La soglia dei voti e del voto sono in `parametri.py`, con lo stato.
"""
import datetime
import json
import pathlib
import sys

import numpy as np
import pandas as pd

from . import bubbles as B
from . import canon as K
from . import parametri as P

NOME = "uscite-collocate.npz"
SCHEMA = 1

# Le colonne che il collocatore sa leggere (`collocator.PREFISSO`), piu' quelle che servono a
# scegliere e a punteggiare. `directors` e `created_by` sono la stessa cosa per il collocatore.
COLS = {
    "movie": ["id", "vote_count", "vote_average", "title", "release_date",
              "keywords", "genres", "production_companies", "production_countries",
              "original_language", "cast", "directors"],
    "tv": ["id", "vote_count", "vote_average", "name", "first_air_date",
           "keywords", "genres", "networks", "production_companies", "production_countries",
           "original_language", "cast", "created_by"],
}
FILE = {"movie": "movies.parquet", "tv": "tv.parquet"}


def percorso_predefinito():
    return K.DATA / NOME


def impronta_parquet():
    """L'impronta degli ingressi (dimensione e mtime dei Parquet): una cache vecchia si dichiara.

    Non si rigenera da sola a runtime — la collocazione costa minuti e non e' un lavoro del servizio —
    ma se i Parquet sono cambiati la cache lo dice invece di servire in silenzio titoli di un'altra
    epoca. E' lo stesso patto di `camminata.transizione_pronta`.
    """
    import hashlib
    h = hashlib.sha256()
    for tipo in ("movie", "tv"):
        f = K.ROOT / ".cache" / "tmdb" / FILE[tipo]
        if not f.exists():
            return None
        st = f.stat()
        h.update(f"{f.name}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:16]


def leggi_parquet(tipo, colonne=None):
    """Il Parquet TMDB del tipo, o `None` DICHIARANDOLO: in CI i Parquet non ci sono."""
    f = K.ROOT / ".cache" / "tmdb" / FILE[tipo]
    if not f.exists():
        print(f"  uscite-collocate: {f} assente, niente collocazione per {tipo} "
              f"(la cache resta quella di prima, se c'e')", file=sys.stderr)
        return None
    # SI LEGGE SOLO CIO' CHE C'E': i Parquet TMDB cambiano forma fra un export e l'altro (una colonna
    # che c'e' oggi domani non c'e'). Un `columns=` con una colonna assente fa fallire TUTTO il file, e
    # un medium intero sparirebbe in silenzio — l'errore che questo modulo esiste per non fare.
    colonne = colonne or COLS[tipo]
    try:
        import pyarrow.parquet as pq
        disponibili = set(pq.read_schema(f).names)
        colonne = [c for c in colonne if c in disponibili]
    except Exception:
        pass
    try:
        return pd.read_parquet(f, columns=colonne)
    except Exception as e:  # parquet illeggibile: si dichiara, non si esplode
        print(f"  uscite-collocate: {f} illeggibile ({e})", file=sys.stderr)
        return None


def _anno(serie):
    """L'anno dalle date TMDB: stringa ISO troncata, come fa `canon.metadati`."""
    return pd.to_numeric(serie.astype("string").str.slice(0, 4), errors="coerce")


def costruisci(percorso=None, dal=None, voti_min=None, voto_min=None,
               colloca_fn=None, movie=None, tv=None, mem=None, generato=None):
    """Costruisce la cache delle uscite collocate. Restituisce il numero di titoli salvati.

    Tutto iniettabile, perché in CI non ci sono né i Parquet né gli artefatti dei centroidi:
      · `movie`/`tv` — DataFrame al posto dei Parquet;
      · `colloca_fn(dd, tipo) -> (bolla, confidenza)` — al posto di `collocator.colloca`;
      · `mem` — la partizione (array nodo -> bolla), al posto di `bolle-eterogeneo-subvoti.npy`.

    `dal` è l'anno di taglio (default `USCITE_NUOVE_DAL`): la stessa soglia della riga a runtime, perché
    allargarla per far comparire titoli sarebbe barare sul significato della riga.
    """
    dal = int(P.USCITE_NUOVE_DAL if dal is None else dal)
    voti_min = int(P.USCITE_COLLOCATE_VOTI_MIN if voti_min is None else voti_min)
    voto_min = float(P.USCITE_COLLOCATE_VOTO_MIN if voto_min is None else voto_min)
    percorso = pathlib.Path(percorso) if percorso is not None else percorso_predefinito()

    if mem is None:
        try:
            mem = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
        except Exception:
            mem = None
            print("  uscite-collocate: partizione assente, i titoli già nel canone non si leggono da li' "
                  "(si passa tutto dal collocatore)", file=sys.stderr)

    chiavi, bolle, confidenze, voti, voti_medi, anni = [], [], [], [], [], []
    scartati = {"vecchi": 0, "pochi_voti": 0, "voto_basso": 0, "non_collocati": 0}
    per_tipo = {}

    for tipo in ("movie", "tv"):
        df = movie if tipo == "movie" else tv
        if df is None:
            df = leggi_parquet(tipo)
        if df is None or len(df) == 0:
            continue
        colonna_data = "release_date" if tipo == "movie" else "first_air_date"
        mancanti = {"id", "vote_count", "vote_average", colonna_data} - set(df.columns)
        if mancanti:
            print(f"  uscite-collocate: {FILE[tipo]} senza le colonne {sorted(mancanti)}: "
                  f"niente collocazione per {tipo}", file=sys.stderr)
            continue
        anni_tipo = _anno(df[colonna_data]) if colonna_data in df.columns else pd.Series(np.nan, index=df.index)
        voti_serie = pd.to_numeric(df["vote_count"], errors="coerce")
        voto_serie = pd.to_numeric(df["vote_average"], errors="coerce")

        recenti = anni_tipo >= dal
        for motivo, maschera in (
            ("vecchi", ~recenti),
            ("pochi_voti", recenti & ~(voti_serie >= voti_min)),
            ("voto_basso", recenti & (voti_serie >= voti_min) & ~(voto_serie >= voto_min)),
        ):
            scartati[motivo] += int(maschera.fillna(False).sum())

        tenuti = recenti & (voti_serie >= voti_min) & (voto_serie >= voto_min)
        n_tipo = 0
        for i in np.nonzero(tenuti.fillna(False).to_numpy())[0]:
            riga = df.iloc[i]
            chiave = f"{tipo}:{int(riga['id'])}"
            bolla, confidenza = None, 0.0
            # Se il titolo è già nel canone si legge la sua bolla: la stima non serve.
            if mem is not None and chiave in B.ROW_OF:
                nodo = B.ROW_OF[chiave]
                if nodo < len(mem):
                    bolla, confidenza = int(mem[nodo]), 1.0
            if bolla is None:
                if colloca_fn is None:
                    scartati["non_collocati"] += 1
                    continue
                dd = {c: riga[c] for c in COLS[tipo] if c in df.columns}
                bolla, confidenza = colloca_fn(dd, tipo)
            if bolla is None:
                scartati["non_collocati"] += 1
                continue
            chiavi.append(chiave)
            bolle.append(int(bolla))
            confidenze.append(float(confidenza))
            voti.append(int(riga["vote_count"]))
            voti_medi.append(float(riga["vote_average"]))
            anni.append(int(anni_tipo.iloc[i]) if pd.notna(anni_tipo.iloc[i]) else 0)
            n_tipo += 1
        per_tipo[tipo] = n_tipo

    if not chiavi:
        print("  uscite-collocate: NESSUNA uscita collocata (parquet assenti o nessun titolo sopra il "
              f"pavimento dal {dal}: {json.dumps(scartati, ensure_ascii=False)}). Cache non scritta.",
              file=sys.stderr)
        return 0

    meta = {
        "schema": SCHEMA,
        "dal": dal,
        "voti_min": voti_min,
        "voto_min": voto_min,
        "generato": generato or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "per_tipo": per_tipo,
        "scartati": scartati,
        "impronta_parquet": impronta_parquet(),
    }
    percorso.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        percorso,
        chiavi=np.array(chiavi, dtype=object),
        bolle=np.array(bolle, dtype=np.int32),
        confidenza=np.array(confidenze, dtype=np.float32),
        voti=np.array(voti, dtype=np.int32),
        voto=np.array(voti_medi, dtype=np.float32),
        anno=np.array(anni, dtype=np.int32),
        meta=np.array(json.dumps(meta, ensure_ascii=False)),
    )
    print(f"  uscite-collocate: {len(chiavi)} titoli salvati in {percorso} "
          f"({json.dumps(per_tipo, ensure_ascii=False)}) · scartati {json.dumps(scartati, ensure_ascii=False)}",
          file=sys.stderr)
    return len(chiavi)


def carica(percorso=None):
    """La cache, o `None` DICHIARANDOLO. Non solleva: un servizio che non parte è peggio di una riga vuota."""
    percorso = pathlib.Path(percorso) if percorso is not None else percorso_predefinito()
    if not percorso.exists():
        print(f"  uscite-collocate: cache assente ({percorso.name}); la riga delle uscite usera' il canone "
              f"storico e lo dichiarera'", file=sys.stderr)
        return None
    try:
        z = np.load(percorso, allow_pickle=True)
        meta = json.loads(str(z["meta"]))
    except Exception as e:
        print(f"  uscite-collocate: cache illeggibile ({e})", file=sys.stderr)
        return None
    if int(meta.get("schema", -1)) != SCHEMA:
        print(f"  uscite-collocate: cache con schema {meta.get('schema')}, atteso {SCHEMA}: si ignora",
              file=sys.stderr)
        return None
    attuale = impronta_parquet()
    if attuale and meta.get("impronta_parquet") and meta["impronta_parquet"] != attuale:
        print(f"  uscite-collocate: ATTENZIONE, i Parquet sono cambiati dopo la cache "
              f"({meta['impronta_parquet']} -> {attuale}): rigenera con `python -m graph.uscite`",
              file=sys.stderr)
    chiavi = [str(k) for k in z["chiavi"]]
    return {
        "chiavi": chiavi,
        "sel": {
            "movie": np.array([i for i, k in enumerate(chiavi) if k.startswith("movie:")], np.int64),
            "series": np.array([i for i, k in enumerate(chiavi) if k.startswith("tv:")], np.int64),
        },
        "bolle": z["bolle"].astype(np.int32),
        "confidenza": z["confidenza"].astype(np.float32),
        "voti": z["voti"].astype(np.float64),
        "voto": z["voto"].astype(np.float64),
        "anno": z["anno"].astype(np.int32),
        "meta": meta,
    }


def qualita(voti, voto):
    """La qualità di un titolo nuovo: lo stesso voto bayesiano del motore, normalizzato.

    `vote_count` è l'unico proxy del comportamento per un titolo che il comportamento non ce l'ha
    ancora. I recenti hanno pochi voti: la formula bayesiana li tira verso `BAYESIAN_C`, che è il
    motivo per cui serve — non un bonus.
    """
    m = float(P.BAYESIAN_M)
    c = float(P.BAYESIAN_C)
    bayes = (voti * voto + m * c) / np.maximum(voti + m, 1e-9)
    return np.maximum(bayes, 0.0) / float(P.RANKING_BAYES_BASE)


def candidati(cache, att_s, bacino, medium, visti):
    """I titoli della cache nel bacino acceso, col loro punteggio. Restituisce `(titoli, stato)`.

    `att_s` è l'attivazione dei mondi dell'utente (quella modulata, la stessa delle altre righe):
    un'uscita in un mondo che l'utente non accende non entra, e una in un mondo vicino entra pesando
    quanto quel mondo è acceso — è l'allargamento ai vicini che il ticket chiede.
    """
    if cache is None:
        return [], {"candidati": 0, "nel_bacino": 0, "fonte": "canone",
                    "motivo": "uscite_nuove: cache uscite-collocate.npz assente"}
    prefisso = "tv:" if medium == "series" else "movie:"
    chiavi = cache["chiavi"]
    sel = cache.get("sel", {}).get(medium)
    if sel is None:
        sel = np.array([i for i, k in enumerate(chiavi) if k.startswith(prefisso)], np.int64)
    stato = {"candidati": int(len(sel)), "nel_bacino": 0, "fonte": "collocate", "motivo": None}
    if len(sel) == 0:
        stato["motivo"] = f"uscite_nuove: la cache non ha titoli {prefisso[:-1]}"
        return [], stato

    bolle = cache["bolle"][sel]
    bacino = set(int(b) for b in bacino)
    dentro = np.array([int(b) in bacino for b in bolle], dtype=bool)
    sel = sel[dentro]
    stato["nel_bacino"] = int(len(sel))
    if len(sel) == 0:
        stato["motivo"] = (f"uscite_nuove: {stato['candidati']} uscite collocate, nessuna nei mondi "
                           f"accesi o vicini")
        return [], stato

    visti_chiavi = {B.KEYS[int(x)] for x in visti if 0 <= int(x) < len(B.KEYS)}
    score = (att_s[cache["bolle"][sel]].astype(np.float64)
             * cache["confidenza"][sel].astype(np.float64)
             * qualita(cache["voti"][sel], cache["voto"][sel]))
    buoni = np.array([chiavi[i] not in visti_chiavi and sc > 0.0 for i, sc in zip(sel, score)], dtype=bool)
    sel, score = sel[buoni], score[buoni]
    ordine = np.argsort(-score, kind="stable")
    titoli = [(chiavi[i], float(sc)) for i, sc in zip(sel[ordine], score[ordine])]
    stato["dopo_visti"] = len(titoli)
    if not titoli:
        stato["motivo"] = (f"uscite_nuove: {stato['nel_bacino']} uscite collocate nei mondi accesi, "
                           f"nessuna con attivazione")
    return titoli, stato


def main(argv=None):
    """`python -m graph.uscite` — rigenera la cache dai Parquet veri (sul mate, non in CI)."""
    from . import collocator as C

    print("uscite-collocate: collocazione delle uscite recenti (Ticket 10)", file=sys.stderr)
    S_v3 = C.carica(v3=True)
    S_v1 = C.carica(v3=False)

    def colloca(dd, tipo):
        bolla, confidenza, _tok, _fuori = C.colloca(dd, tipo, S_v3, S_macro=S_v1)
        return bolla, confidenza

    return 0 if costruisci(colloca_fn=colloca) > 0 else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
