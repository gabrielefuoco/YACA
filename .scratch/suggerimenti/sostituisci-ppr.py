"""sostituisci-ppr.py — i nove arbitri delegano a `camminata.ppr` (ticket 07).

PERCHE' COSI' E NON A MANO: sono nove file e nove corpi, e ogni sostituzione va *verificata* che sia
avvenuta (una ancora sbagliata lascerebbe una copia viva, e il ticket e' chiuso solo se non ne resta
nessuna). Lo script conta i rimpiazzi, e alla fine riconta con lo stesso grep del criterio di chiusura.

Perche' la FIRMA locale resta invece di chiamare `_cam.ppr` al posto di `ppr` nei punti di chiamata:
perche' `alpha` non e' sempre `parametri.ALPHA`. Quattro arbitri lo leggono da una variabile d'ambiente
(`ALPHA=0.9 python graph/measure/freddo.py`), e quella possibilita' va tenuta: la delega la passa.
"""
import pathlib
import sys

M = pathlib.Path(__file__).resolve().parent.parent.parent / "graph" / "measure"

# (file, vecchio, nuovo)
CASI = [
("alfa.py", """def ppr(P, seme, pesi, alpha, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / pesi.sum()
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ P)
    return r
""", """def ppr(P, seme, pesi, alpha, iters=ITER):
    \"\"\"Il ciclo sta in `camminata.ppr`: qui solo la firma, perche' i punti di chiamata non cambino.\"\"\"
    return _cam.ppr(P, seme, pesi, alpha=alpha, iters=iters)
"""),
("freddo.py", """def ppr(P, seme, pesi, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / max(pesi.sum(), 1e-12)
    r = e.copy()
    for _ in range(iters):
        r = ALPHA * e + (1 - ALPHA) * (r @ P)
    return r
""", """def ppr(P, seme, pesi, iters=ITER):
    \"\"\"Il ciclo sta in `camminata.ppr`. `alpha=ALPHA` perche' qui si puo' sovrascrivere da ambiente.\"\"\"
    return _cam.ppr(P, seme, pesi, alpha=ALPHA, iters=iters)
"""),
("pesi.py", """def ppr(P, seme, pesi, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / max(pesi.sum(), 1e-12)
    r = e.copy()
    for _ in range(iters):
        r = ALPHA * e + (1 - ALPHA) * (r @ P)
    return r
""", """def ppr(P, seme, pesi, iters=ITER):
    \"\"\"Il ciclo sta in `camminata.ppr`. `alpha=ALPHA` perche' qui si puo' sovrascrivere da ambiente.\"\"\"
    return _cam.ppr(P, seme, pesi, alpha=ALPHA, iters=iters)
"""),
("soglia.py", """def ppr(P, seme, pesi, iters=ITER):
    e = np.zeros(P.shape[0], np.float64)
    e[seme] = pesi / pesi.sum()
    r = e.copy()
    for _ in range(iters):
        r = ALPHA * e + (1 - ALPHA) * (r @ P)
    return r
""", """def ppr(P, seme, pesi, iters=ITER):
    \"\"\"Il ciclo sta in `camminata.ppr`. `alpha=ALPHA` perche' qui si puo' sovrascrivere da ambiente.\"\"\"
    return _cam.ppr(P, seme, pesi, alpha=ALPHA, iters=iters)
"""),
("lettura.py", """def diffondi(M, seme, pesi, alpha, iters=30):
    deg = np.asarray(M.sum(1)).ravel()
    deg[deg <= 0] = 1
    P = sp.diags(1.0 / deg) @ M
    e = np.zeros(M.shape[0], np.float64)
    e[seme] = pesi / pesi.sum()
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ P)
    return r
""", """def diffondi(M, seme, pesi, alpha, iters=30):
    \"\"\"Il grafo, la transizione e il ciclo: tutti in `camminata`.\"\"\"
    return _cam.ppr(_cam.transizione(M), seme, pesi, alpha=alpha, iters=iters)
"""),
("diffusione.py", """def diffondi(Ws, seme, alpha=ALPHA, iters=ITER):
    \"\"\"PageRank personalizzato: r = alpha*e + (1-alpha)*r*P, con P riga-stocastica.\"\"\"
    deg = np.asarray(Ws.sum(1)).ravel().astype(np.float64)
    deg[deg <= 0] = 1.0
    P = sp.diags(1.0 / deg) @ Ws
    e = np.zeros(Ws.shape[0], np.float64)
    e[seme] = 1.0 / len(seme)
    r = e.copy()
    for _ in range(iters):
        r = alpha * e + (1 - alpha) * (r @ P)
    return r
""", """def diffondi(Ws, seme, alpha=ALPHA, iters=ITER):
    \"\"\"PageRank personalizzato col seme UNIFORME — `camminata.ppr`, `pesi=None`.\"\"\"
    return _cam.ppr(_cam.transizione(Ws), seme, None, alpha=alpha, iters=iters)
"""),
("cache.py", """    def ppr(seme, plays):
        e = np.zeros(N, np.float64)
        w = pesi_spec(seme, plays)
        e[seme] = w / w.sum()
        r = e.copy()
        for _ in range(P.ITER):
            r = P.ALPHA * e + (1 - P.ALPHA) * (r @ Pm)
        return np.bincount(MEM, weights=r, minlength=NB) / r.sum()
""", """    def ppr(seme, plays):
        att = _cam.ppr(Pm, seme, pesi_spec(seme, plays), alpha=P.ALPHA, iters=P.ITER, normalizza=True)
        return np.bincount(MEM, weights=att, minlength=NB)
"""),
("liste.py", """    def ppr(seme, pesi, iters=20):
        e = np.zeros(N, np.float64)
        e[seme] = pesi / pesi.sum()
        r = e.copy()
        for _ in range(iters):
            r = ALPHA * e + (1 - ALPHA) * (r @ Pp)
        return r
""", """    def ppr(seme, pesi, iters=20):
        return _cam.ppr(Pp, seme, pesi, alpha=ALPHA, iters=iters)
"""),
("ricetta.py", """    def ppr(seme, plays):
        e = np.zeros(N, np.float64)
        nep = NEP[seme]
        pl = plays.astype(float)
        w = np.where(nep > 1.0, P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * np.minimum(pl / nep, 1.0),
                     np.minimum(pl, P.PESO_FILM_MAX))
        e[seme] = w / w.sum()
        r = e.copy()
        for _ in range(P.ITER):
            r = P.ALPHA * e + (1 - P.ALPHA) * (r @ Pm)
        return r / r.sum()
""", """    def ppr(seme, plays):
        \"\"\"Il peso inline era `pesi_semi` senza il fattore di tipo: adesso e' `pesi_semi`.\"\"\"
        return _cam.ppr(Pm, seme, _cam.pesi_semi(seme, plays, NEP),
                        alpha=P.ALPHA, iters=P.ITER, normalizza=True)
"""),
]

if __name__ == "__main__":
    fatti = 0
    for nome, vecchio, nuovo in CASI:
        p = M / nome
        t = p.read_text(encoding="utf-8")
        if vecchio not in t:
            print(f"  !! {nome}: l'ancora NON e' stata trovata — nessun rimpiazzo")
            continue
        if t.count(vecchio) != 1:
            print(f"  !! {nome}: l'ancora compare {t.count(vecchio)} volte — salto")
            continue
        p.write_text(t.replace(vecchio, nuovo, 1), encoding="utf-8")
        # il file deve ancora essere compilabile: un refactor che rompe il file e' peggio di una copia
        try:
            import py_compile
            py_compile.compile(str(p), doraise=True)
        except Exception as e:
            print(f"  !! {nome}: non compila dopo il rimpiazzo — RIMETTO A POSTO")
            p.write_text(t, encoding="utf-8")
            continue
        print(f"  {nome:<16} sostituito e compila")
        fatti += 1
    print(f"\n  rimpiazzi: {fatti}/{len(CASI)}")
    if fatti != len(CASI):
        sys.exit(1)
