"""uscite.py — LA PORTA D'INGRESSO DELLE USCITE (Ticket 10).

IL PROBLEMA CHE RISOLVE. Il canone del grafo è **storico**: 66.259 nodi di co-visione Trakt/MovieLens.
Le uscite 2025–2026 dei Parquet TMDB (117.000 righe) dentro il canone **non ci sono quasi mai**, e la
riga «uscite nuove» le cercava solo fra le 1–4 bolle del profilo. Risultato: una riga vuota quasi
sempre.

COME. `collocator.colloca` sa mettere un titolo nuovo in una bolla dai suoi metadati TMDB. Qui quella
porta si usa **offline, una volta sola**: si leggono i Parquet, si tengono le uscite recenti che passano
un pavimento permissivo (i recenti hanno pochi voti), si collocano, e si salva tutto in
`graph/data/uscite-collocate.npz`. A runtime si legge la cache e si calcola:

    score_nuovo(y) = att_s[b_y] * confidenza(y) * qualità(y)

con `qualità` = il voto bayesiano di TMDB (`canon.voto_bayesiano`, gli stessi `BAYESIAN_M/C` del motore)
normalizzato su `RANKING_BAYES_BASE`: nessun numero nuovo, nessuna matrice ricostruita. L'esponente
`RANKING_BAYES_EXP` del ranking delle altre righe **non** si applica: qui la qualità moltiplica, non
ordina da sola, e applicarlo sarebbe una decisione in più non presa dal ticket.

LA CONFIDENZA NON SI IGNORA: la collocazione è una **stima**, e moltiplicarla nel punteggio è il modo di
dire «questo titolo è del tuo mondo, ma non ne sono certo». Il peso va in proporzione, non in un taglio.

LA CACHE SI DICHIARA, e si difende da sola:
  · senza cache la riga non sparisce, lo dice (`motivo`, `fonte`, conteggi);
  · se i Parquet o la **partizione** o i **parametri** sono cambiati, la cache non vale più: si ignora e
    lo si dichiara (le bolle salvate sarebbero id di un'altra partizione);
  · ogni membro mancante o illeggibile → `None`, mai un'eccezione: il servizio parte lo stesso.

DOVE SI GENERA. `python -m graph.uscite` va eseguito **dove ci sono i Parquet TMDB e gli artefatti dei
centroidi** (il mate), e il file prodotto va depositato in `services/graph/data/` — che è montato
read-only nel container, quindi il servizio non può generarlo da solo. Senza quel passo la cache non
esiste e la riga degrada dichiarandolo.
"""
import argparse
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
SCHEMA = int(P.USCITE_COLLOCATE_SCHEMA)
MEMBRI = ("chiavi", "bolle", "confidenza", "voti", "voto", "anno")

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


def percorso_predefinito():
    return K.DATA / NOME


# ------------------------------------------------------------------ le impronte
def impronta_partizione():
    """L'impronta della partizione: le bolle sono metà del contenuto della cache.

    Se `bolle-eterogeneo-subvoti.npy` cambia e i Parquet no, gli id di bolla salvati non vogliono più
    dire niente — e senza questa impronta il runtime li userebbe lo stesso. In un checkout senza
    artefatti l'impronta è `None`: la cache non si può verificare, e lo si dichiara.
    """
    try:
        return K.sha_file("bolle-eterogeneo-subvoti.npy")
    except Exception:
        return None


def impronta_parquet():
    """Dimensione e mtime dei Parquet. Vive dove i Parquet esistono (il mate): in produzione il
    container non li monta, quindi questo confronto è un servizio al generatore, non un gate."""
    import hashlib
    h = hashlib.sha256()
    for tipo in ("movie", "tv"):
        f = K.ROOT / ".cache" / "tmdb" / ("movies.parquet" if tipo == "movie" else "tv.parquet")
        if not f.exists():
            return None
        st = f.stat()
        h.update(f"{f.name}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:16]


# ------------------------------------------------------------------ il builder
def leggi_parquet(tipo, colonne=None):
    """Il Parquet TMDB del tipo, o `None` DICHIARANDOLO: in CI i Parquet non ci sono."""
    f = K.ROOT / ".cache" / "tmdb" / ("movies.parquet" if tipo == "movie" else "tv.parquet")
    if not f.exists():
        print(f"  uscite-collocate: {f} assente, niente collocazione per {tipo} "
              f"(la cache resta quella di prima, se c'e')", file=sys.stderr)
        return None
    # SI LEGGE SOLO CIO' CHE C'E': i Parquet TMDB cambiano forma fra un export e l'altro, e un
    # `columns=` con una colonna assente fa fallire tutto il file — un medium intero sparirebbe in
    # silenzio, che è l'errore che questo modulo esiste per non fare.
    colonne = colonne or COLS[tipo]
    try:
        import pyarrow.parquet as pq
        disponibili = set(pq.read_schema(f).names)
        colonne = [c for c in colonne if c in disponibili]
    except Exception:
        pass
    try:
        return pd.read_parquet(f, columns=colonne)
    except Exception as e:
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
        except FileNotFoundError:
            mem = None
            print("  uscite-collocate: partizione assente, i titoli già nel canone non si leggono da lì "
                  "(si passa tutto dal collocatore)", file=sys.stderr)

    chiavi, bolle, confidenze, voti, voti_medi, anni = [], [], [], [], [], []
    scartati = {"vecchi": 0, "pochi_voti": 0, "voto_basso": 0, "senza_collocatore": 0, "non_collocati": 0}
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
            print(f"  uscite-collocate: {tipo} senza le colonne {sorted(mancanti)}: niente collocazione",
                  file=sys.stderr)
            continue
        anni_tipo = _anno(df[colonna_data])
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
                    scartati["senza_collocatore"] += 1
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
        "impronta_partizione": impronta_partizione(),
    }
    percorso.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        percorso,
        chiavi=np.array(chiavi, dtype=str),
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


# ------------------------------------------------------------------ il runtime
def carica(percorso=None):
    """La cache, o `None` DICHIARANDOLO. Non solleva: un servizio che non parte è peggio di una riga vuota."""
    percorso = pathlib.Path(percorso) if percorso is not None else percorso_predefinito()
    if not percorso.exists():
        print(f"  uscite-collocate: cache assente ({percorso.name}); la riga delle uscite usera' il "
              f"canone storico e lo dichiarera'", file=sys.stderr)
        return None
    try:
        z = np.load(percorso, allow_pickle=False)
        # TUTTO dentro il try: un membro mancante era un KeyError che arrivava fino a `Motore.__init__`
        # e impediva al servizio di partire.
        mancanti = [m for m in MEMBRI if m not in z]
        if mancanti:
            raise ValueError(f"membri mancanti: {mancanti}")
        meta = json.loads(str(z["meta"]))
        if not isinstance(meta, dict):
            raise ValueError("meta non è un oggetto")
        dati = {
            "chiavi": [str(k) for k in z["chiavi"]],
            "bolle": z["bolle"].astype(np.int32),
            "confidenza": z["confidenza"].astype(np.float32),
            "voti": z["voti"].astype(np.float64),
            "voto": z["voto"].astype(np.float64),
            "anno": z["anno"].astype(np.int32),
            "meta": meta,
        }
    except Exception as e:
        print(f"  uscite-collocate: cache illeggibile ({e})", file=sys.stderr)
        return None

    if int(meta.get("schema", -1)) != SCHEMA:
        print(f"  uscite-collocate: cache con schema {meta.get('schema')}, atteso {SCHEMA}: si ignora",
              file=sys.stderr)
        return None
    # I PARAMETRI CON CUI È STATA COSTRUITA: se il taglio o i pavimenti sono cambiati, la cache non
    # risponde più alla domanda di oggi.
    for campo, valore in (("dal", int(P.USCITE_NUOVE_DAL)),
                          ("voti_min", int(P.USCITE_COLLOCATE_VOTI_MIN)),
                          ("voto_min", float(P.USCITE_COLLOCATE_VOTO_MIN))):
        if campo in meta and meta[campo] != valore:
            print(f"  uscite-collocate: cache costruita con {campo}={meta[campo]}, oggi {valore}: "
                  f"si ignora (rigenera con `python -m graph.uscite`)", file=sys.stderr)
            return None
    # LA PARTIZIONE È METÀ DEL DATO: bolle di un'altra partizione non vogliono dire niente.
    partizione = impronta_partizione()
    if partizione and meta.get("impronta_partizione") and meta["impronta_partizione"] != partizione:
        print(f"  uscite-collocate: la partizione è cambiata dopo la cache "
              f"({meta['impronta_partizione']} -> {partizione}): le bolle salvate non valgono più, "
              f"si ignora (rigenera con `python -m graph.uscite`)", file=sys.stderr)
        return None
    parquet = impronta_parquet()
    if parquet and meta.get("impronta_parquet") and meta["impronta_parquet"] != parquet:
        print(f"  uscite-collocate: ATTENZIONE, i Parquet sono cambiati dopo la cache "
              f"({meta['impronta_parquet']} -> {parquet}): rigenera con `python -m graph.uscite`",
              file=sys.stderr)

    chiavi = dati["chiavi"]
    dati["sel"] = {
        "movie": np.array([i for i, k in enumerate(chiavi) if k.startswith("movie:")], np.int64),
        "series": np.array([i for i, k in enumerate(chiavi) if k.startswith("tv:")], np.int64),
    }
    return dati


def qualita(voti, voto):
    """La qualità di un titolo nuovo: il voto bayesiano del motore (`canon.voto_bayesiano`), normalizzato.

    `vote_count` è l'unico proxy del comportamento per un titolo che il comportamento non ce l'ha
    ancora. I recenti hanno pochi voti: la formula bayesiana li tira verso `BAYESIAN_C` — non è un
    bonus, è il motivo per cui serve. L'esponente del ranking non si applica (vedi il docstring del
    modulo): qui la qualità moltiplica.
    """
    return np.maximum(K.voto_bayesiano(voti, voto), 0.0) / float(P.RANKING_BAYES_BASE)


def _manca_attivazione(bolle, att_s):
    """Le posizioni delle bolle fuori dalla partizione corrente (difesa in profondità)."""
    return np.nonzero(bolle >= len(att_s))[0] if len(att_s) else np.arange(len(bolle))


def candidati(cache, att_s, bacino, medium, visti):
    """I titoli della cache nel bacino acceso, col loro punteggio. Restituisce `(titoli, stato)`.

    `bacino` è unione delle bolle accese e dei loro vicini: un'uscita in un mondo che l'utente non
    accende non entra, una in un mondo vicino pesa quanto quel mondo è acceso.
    """
    chiavi = cache["chiavi"]
    if medium is None:
        # `medium` assente = entrambi, come faceva il canone: prima qui si sceglieva "movie" e le serie
        # sparivano in silenzio.
        sel = np.arange(len(chiavi), dtype=np.int64)
    else:
        # `carica` preindicizza per medium; il ripiego serve alle cache iniettate (le sonde), che non
        # passano da `carica`.
        sel = (cache.get("sel") or {}).get(medium)
        if sel is None:
            prefisso = "tv:" if medium == "series" else "movie:"
            sel = np.array([i for i, k in enumerate(chiavi) if k.startswith(prefisso)], np.int64)
    bolle = cache["bolle"][sel]
    scartati_pavimento = int(sum((cache.get("meta") or {}).get("scartati", {}).values()))
    stato = {"candidati": int(len(sel)), "nel_bacino": 0, "fonte": "collocate", "motivo": None,
             "gia_visti": 0, "senza_attivazione": 0, "scartati_pavimento": scartati_pavimento}
    if len(sel) == 0:
        stato["motivo"] = "uscite_nuove: la cache non ha titoli per questo medium"
        return [], stato

    fuori = _manca_attivazione(bolle, att_s)
    if len(fuori):
        print(f"  uscite-collocate: {len(fuori)} uscite con una bolla fuori dalla partizione corrente: "
              f"si scartano", file=sys.stderr)
        valide = np.ones(len(sel), dtype=bool)
        valide[fuori] = False
        sel, bolle = sel[valide], bolle[valide]

    dentro = np.isin(bolle, np.fromiter(bacino, np.int32, len(bacino)) if bacino else np.array([], np.int32))
    sel, bolle = sel[dentro], bolle[dentro]
    stato["nel_bacino"] = int(len(sel))
    if len(sel) == 0:
        stato["motivo"] = (f"uscite_nuove: {stato['candidati']} uscite collocate, nessuna nei mondi "
                           f"accesi o vicini")
        return [], stato

    visti_chiavi = np.array([B.KEYS[int(x)] for x in visti if 0 <= int(x) < len(B.KEYS)], dtype=str)
    gia_visti = np.isin(np.array(chiavi, dtype=str)[sel], visti_chiavi) if len(visti_chiavi) else np.zeros(len(sel), bool)
    score = (att_s[bolle].astype(np.float64)
             * cache["confidenza"][sel].astype(np.float64)
             * qualita(cache["voti"][sel], cache["voto"][sel]))
    buoni = ~gia_visti & (score > 0.0)
    stato["gia_visti"] = int(gia_visti.sum())
    stato["senza_attivazione"] = int(((~gia_visti) & (score <= 0.0)).sum())
    sel, score = sel[buoni], score[buoni]
    if len(sel) == 0:
        stato["motivo"] = (f"uscite_nuove: {stato['nel_bacino']} collocate nei mondi accesi, "
                           f"{stato['gia_visti']} già viste e {stato['senza_attivazione']} senza "
                           f"attivazione")
        return [], stato
    ordine = np.argsort(-score, kind="stable")
    titoli = [(chiavi[sel[i]], float(score[i])) for i in ordine]
    return titoli, stato


def da_canone(anno, mem, is_tv, vot, r, bacino, medium, visti, dal=None):
    """Il ripiego senza cache: il canone storico, con i vicini, e la riga che dichiara il perché.

    Vive qui e non in `Motore.lista` perché è la **stessa porta d'ingresso**: una sola funzione
    risponde alla domanda «quali uscite sono nuove per te», con la cache o senza.
    """
    dal = int(P.USCITE_NUOVE_DAL if dal is None else dal)
    bacino = set(int(b) for b in bacino)
    nuove = [int(x) for x in np.nonzero(np.asarray(anno) >= dal)[0]
             if int(mem[x]) in bacino and int(x) not in visti]
    if medium == "series":
        nuove = [x for x in nuove if bool(is_tv[x])]
    elif medium == "movie":
        nuove = [x for x in nuove if not bool(is_tv[x])]
    nuove.sort(key=lambda x: (-float(r[x]), -float(vot[x])))
    titoli = [(B.KEYS[x], float(r[x])) for x in nuove]
    stato = {
        "fonte": "canone",
        "candidati": int(len(titoli)),
        "nel_bacino": int(len(titoli)),
        "gia_visti": 0,
        "senza_attivazione": 0,
        "scartati_pavimento": 0,
        "motivo": ("uscite_nuove: cache uscite-collocate.npz assente, solo il canone storico "
                   "(che non ha quasi uscite 2025+)"),
    }
    return titoli, stato


def main(argv=None):
    """`python -m graph.uscite` — rigenera la cache dai Parquet veri (sul mate, non in CI)."""
    ap = argparse.ArgumentParser(description="Colloca le uscite recenti nella cache del grafo (Ticket 10).")
    ap.add_argument("--dal", type=int, default=int(P.USCITE_NUOVE_DAL), help="anno di taglio")
    ap.add_argument("--out", default=None, help="dove scrivere (default: graph/data/uscite-collocate.npz)")
    args = ap.parse_args(argv)

    from . import collocator as C

    print("uscite-collocate: collocazione delle uscite recenti (Ticket 10)", file=sys.stderr)
    try:
        S_v3 = C.carica(v3=True)
        S_v1 = C.carica(v3=False)
    except Exception as e:
        print(f"uscite-collocate: artefatti del collocatore assenti o illeggibili ({e}). "
              f"La cache si genera dove ci sono gli artefatti e i Parquet TMDB (il mate), non qui.",
              file=sys.stderr)
        return 1

    def colloca(dd, tipo):
        bolla, confidenza, _tok, _fuori = C.colloca(dd, tipo, S_v3, S_macro=S_v1)
        return bolla, confidenza

    n = costruisci(percorso=args.out, dal=args.dal, colloca_fn=colloca)
    return 0 if n > 0 else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
