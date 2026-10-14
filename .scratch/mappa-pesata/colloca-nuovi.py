"""colloca-nuovi.py — il JOB NOTTURNO: i titoli che non sono nel grafo, collocati in una bolla.

Scelta dell'utente (14/10/2026): il collocatore **non** va in linea dentro `src/`. Gira come job
offline, scrive un file, e quel file si legge prima di applicarlo. Reversibile, ispezionabile, e il
servizio non si tocca.

COSA FA, in ordine:
  1. trova i titoli che stanno nel parquet TMDB ma **non** nel canone (`ROW_OF` non li conosce):
     sono i titoli arrivati dopo la costruzione del grafo, o quelli che i filtri avevano escluso;
  2. li colloca col `colloca-finale.py` (coseno sui centroidi, vocabolario congelato, regola di
     medium simmetrica);
  3. scrive `bolle-nuovi.json` — una riga per titolo, con la bolla, la confidenza, e quanti termini
     sono finiti fuori vocabolario — **e un riassunto leggibile** in testa;
  4. **non applica niente.** La partizione non si tocca: il file si legge, si controlla, e solo dopo
     si decide.

I filtri, dichiarati perche' sono una scelta e non un fatto:
  · `vote_count >= 5`: sotto quella soglia un titolo ha metadati troppo magri per essere collocato, e
    il coseno lo direbbe comunque con una confidenza bassissima;
  · si colloca anche cio' che ha pochi termini nel vocabolario, ma il numero **e' nel file**: un
    titolo con 1 termine su 20 e' una collocazione debole e va vista come tale.

LA CONFIDENZA E' IL COSENO, e va letta con la taratura del ticket 05: i successi misurati stanno fra
0,11 e 0,46, gli errori fra 0,02 e 0,06. Sotto 0,08 la collocazione e' un'ipotesi, non una risposta.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import colloca_finale as CF   # il modulo: niente trattino nel nome, cosi' si importa

T0 = time.time()
PO = QUI / "bolle-nuovi.json"
PQ = pathlib.Path(".cache/tmdb")
SOGLIA_VOTI = 5
SOGLIA_CONF = 0.08


def CF_anno(dd):
    """L'anno, senza crashare su `nan`. La prima versione del job e' morta qui: una `release_date`
    che e' la STRINGA "nan" (pandas), e `int("nan")` solleva. Undici righe di controlli e il crash
    era in una riga di formattazione."""
    v = dd.get("release_date") or dd.get("first_air_date")
    try:
        a = int(str(v)[:4])
        return a if 1800 < a < 2100 else 0
    except Exception:
        return 0
print("=" * 100)
print("JOB NOTTURNO — COLLOCARE I TITOLI CHE NON SONO NEL GRAFO")
print("=" * 100, flush=True)

S = CF.carica()
import bolle as B
print(f"  collocatore pronto: {len(S['vocab']):,} termini, {len(S['TUTTE']):,} bolle candidate",
      flush=True)

# ---------------------------------------------------------------- chi manca dal grafo
print(f"\n  1. cerco i titoli del parquet che il canone non conosce")
fuori = []
PARQ = {
    "movie": (PQ / "movies.parquet", "title"),
    "tv": (PQ / "tv.parquet", "name"),
}
LETTI = {}
for tipo, (f, col) in PARQ.items():
    d = pd.read_parquet(f)
    LETTI[tipo] = d
    quanti = 0
    for riga in d.itertuples(index=False):
        dd = riga._asdict()
        if B.ROW_OF.get(f"{tipo}:{int(dd['id'])}") is not None:
            continue
        if (dd.get("vote_count") or 0) < SOGLIA_VOTI:
            continue
        fuori.append((tipo, dd))
        quanti += 1
    print(f"     {tipo}: {len(d):,} righe nel parquet · fuori dal canone con >= {SOGLIA_VOTI} voti: "
          f"{quanti:,}", flush=True)
print(f"  totale da collocare: {len(fuori):,} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- la collocazione
print(f"\n  2. colloco", flush=True)
ris = []
for n, (tipo, dd) in enumerate(fuori):
    b, conf, ntok, fuori_voc = CF.colloca(dd, tipo, S)
    nome = str(dd.get("title") or dd.get("name") or "")[:70]
    # il livello MICRO: i dieci titoli piu' vicini (ticket 05 di mappa-pesata)
    idx = [S["vocab"][t] for t in CF.tokenizza(dd, tipo) if t in S["vocab"]]
    vic = []
    if idx:
        vv = sp.csr_matrix(([float(S["idf"][i]) for i in idx], ([0] * len(idx), idx)),
                           shape=(1, S["TFIDF"].shape[1]), dtype=np.float32)
        vv = vv.multiply(1.0 / (float(np.sqrt(vv.multiply(vv).sum())) + 1e-9))
        vic = CF.vicini_titoli(vv, S, 10)
    ris.append(dict(id=int(dd["id"]), tipo=tipo, nome=nome,
                    bolla=None if b is None else int(b),
                    vicini=[{"i": i, "cos": round(c, 4)} for i, c in vic],
                    confidenza=round(float(conf), 4), termini=int(ntok), fuori_vocabolario=int(fuori_voc),
                    voti=int(dd.get("vote_count") or 0),
                    anno=CF_anno(dd))))
    if (n + 1) % 5000 == 0:
        print(f"     {n+1:,}/{len(fuori):,} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il file
ok = [r for r in ris if r["bolla"] is not None]
conf = np.array([r["confidenza"] for r in ok])
forti = [r for r in ok if r["confidenza"] >= SOGLIA_CONF]
riassunto = {
    "generato": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "partizione": "bolle-nitrile-V8.npy",
    "candidati": len(fuori),
    "collocati": len(ok),
    "non_collocabili": len(ris) - len(ok),
    "sopra_la_soglia_di_confidenza": len(forti),
    "soglia_confidenza": SOGLIA_CONF,
    "soglia_voti": SOGLIA_VOTI,
    "confidenza": {
        "mediana": float(np.median(conf)) if len(conf) else 0.0,
        "10° percentile": float(np.percentile(conf, 10)) if len(conf) else 0.0,
        "90° percentile": float(np.percentile(conf, 90)) if len(conf) else 0.0,
    },
    "fuori_vocabolario": {
        "mediana": float(np.median([r["fuori_vocabolario"] for r in ok])) if ok else 0,
        "mediana_su_termini": float(np.median([r["fuori_vocabolario"] / max(r["termini"], 1)
                                               for r in ok])) if ok else 0,
    },
    "titoli": sorted(ris, key=lambda r: -r["confidenza"]),
}
with open(PO, "w", encoding="utf-8") as f:
    json.dump(riassunto, f, ensure_ascii=False, indent=1)

print(f"\n  3. scritto {PO.name} ({PO.stat().st_size/1024/1024:.1f} MB)", flush=True)
print(f"\n" + "=" * 100)
print("RIASSUNTO")
print("=" * 100)
print(f"  candidati {len(fuori):,} · collocati {len(ok):,} · non collocabili {len(ris)-len(ok):,} "
      f"(nessun termine nel vocabolario)")
print(f"  sopra la soglia di confidenza {SOGLIA_CONF}: {len(forti):,} ({100*len(forti)/max(len(ok),1):.1f}%)")
print(f"  confidenza: mediana {riassunto['confidenza']['mediana']:.3f} · "
      f"10° {riassunto['confidenza']['10° percentile']:.3f} · "
      f"90° {riassunto['confidenza']['90° percentile']:.3f}")
print(f"  termini fuori vocabolario: mediana {riassunto['fuori_vocabolario']['mediana']:.0f} su "
      f"{np.median([r['termini'] for r in ok]) if ok else 0:.0f} "
      f"({100*riassunto['fuori_vocabolario']['mediana_su_termini']:.0f}%)")

print(f"\n  LE VENTI COLLOCAZIONI PIU' SICURE, con la bolla e chi ci sta:")
TIT, VOT = B.titoli_leggibili()
for r in sorted(ok, key=lambda z: -z["confidenza"])[:20]:
    m_ = [TIT[x][:20] for x in np.where(S["mem"] == r["bolla"])[0][:3]]
    print(f"    {r['confidenza']:.3f}  {r['nome'][:44]:<46} -> {r['bolla']:>4} ({int(S['sz'][r['bolla']]):>3} tit.) "
          f"{m_}")

print(f"\n  E LE DIECI PIU' DEBOLI, che il file dichiara invece di nascondere:")
for r in sorted(ok, key=lambda z: z["confidenza"])[:10]:
    print(f"    {r['confidenza']:.3f}  {r['nome'][:44]:<46} -> {r['bolla']:>4} "
          f"({r['fuori_vocabolario']} termini fuori vocabolario su {r['termini']})")

# quante collocazioni cadono dove non dovrebbero
print(f"\n  CONTROLLO: un titolo fuori dal grafo e' quasi sempre recente.")
anni = np.array([r["anno"] for r in ok])
recenti = ok and np.median(anni)
print(f"     anno mediano dei collocati: {np.median(anni):.0f} · "
      f"quanti dal 2020 in poi: {int((anni >= 2020).sum()):,}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
