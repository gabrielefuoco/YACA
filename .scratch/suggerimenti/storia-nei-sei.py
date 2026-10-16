"""storia-nei-sei.py — le ultime sei copie di `storia(u)` (ticket 30).

NON sono copie identiche, e il ticket lo dice: hanno firme diverse, TRE calcolano il peso inline con
formule proprie (e sono il motivo per cui esistono: `alfa` pesa la recenza, `soglia` prova la soglia,
`lettura` usa una emivita in ANNI), e CINQUE non ordinano affatto — quindi il loro ordine e' quello del
file: prima tutti i film, poi tutte le serie. E' il bug del ticket 01, e questi banchi lo contenevano.

Cosa fa questo script, per ognuno: sostituisce il blocco `def storia(u):` con una versione che legge da
`canon.storia_trakt` e RICOSTRUISCE la stessa formula di prima dall'eta' che quella restituisce. Quindi i
PESI restano identici; l'ORDINE cambia (da ordine-di-file a cronologico), ed e' il punto: quei banchi
misuravano un passato che era «i film» e un futuro che era «le serie».
"""
import pathlib
import re
import py_compile

M = pathlib.Path("graph/measure")

VECCHIO = 'def storia(u):'
NUOVE = {
"alfa.py": '''def storia(u):
    """(righe, pesi) — il peso e' recenza x ri-visioni, ma la lettura sta in `canon.storia_trakt`.

    Il peso e' LA STESSA formula di prima (1 + log(plays)) x 0,5^(eta/EMIVITA), ricostruita dall'eta' che
    `storia_trakt` restituisce. Quello che cambia e' l'ORDINE: prima era l'ordine del file — tutti i film
    e poi tutte le serie — e questo banco ci misurava sopra il taglio passato/futuro.
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
    pesi = (1 + np.log(plays.astype(float))) * 0.5 ** (eta / EMIVITA)
    return righe, pesi
''',
"equilibrio.py": '''def storia(u):
    """(righe, plays) — l'equilibrio del seme, dall'unica lettura della storia (`canon.storia_trakt`).

    Non ordina e non pesa: gli servono solo i titoli e i plays, e li prende dall'ordine CRONOLOGICO
    perche' e' quello che la storia ha davvero. Prima l'ordine era quello del file: film, poi serie.
    """
    _ch, righe, plays, _eta = K.storia_trakt(u, ordine="cronologico")
    return righe, plays.astype(np.float64)
''',
"lettura.py": '''def storia(u):
    """(righe, pesi, quando) — il peso e' recenza x ri-visioni con emivita in ANNI, dall'unica lettura.

    La formula e' quella di prima, ricostruita dall'eta'. L'ordine ora e' cronologico: prima era quello
    del file (film, poi serie) e questo banco ne legge le DATE per stampare i portafogli lungo la scala.
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
    pesi = (1 + np.log(plays.astype(float))) * 0.5 ** (eta / (365 * EMIVITA_ANNI))
    return righe, pesi, eta.astype(float)
''',
"liste.py": '''def storia(u):
    """(righe, plays, eta) in ordine CRONOLOGICO — la lettura sta in `canon.storia_trakt`, una sola.

    Prima l'ordine era quello del file: prima tutti i film, poi tutte le serie. Questo banco ci costruiva
    sopra il taglio passato/futuro, quindi non separava il tempo — separava i MEDIUM (e' il ticket 01).
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
    return righe, plays.astype(np.float64), eta.astype(float)
''',
"soglia.py": '''def storia(u):
    """(righe, pesi) — il peso e' recenza x ri-visioni, la stessa formula di prima, dall'unica lettura.

    L'ordine cambia: era l'ordine del file (film, poi serie), adesso e' cronologico.
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
    pesi = (1 + np.log(plays.astype(float))) * 0.5 ** (eta / EMIVITA)
    return righe, pesi
''',
# `pesi` NON cambia comportamento: la sua `storia` e' in ordine di RECENZA, e il suo consumatore
# riordina comunque da solo (`o = np.argsort(-eta)`). La sostituzione serve solo a togliere la copia.
"pesi.py": '''def storia(u):
    """(righe, eta, plays) in ordine di RECENZA — la lettura sta in `canon.storia_trakt`, una sola.

    L'ordine e' quello di prima (il piu' recente per primo) e il consumatore comunque riordina da solo
    (`o = np.argsort(-eta)`, il taglio esplicito nel tempo): quindi questo banco deve dare gli STESSI
    numeri di prima — ed e' la verifica di questo ticket.
    """
    _ch, righe, plays, eta = K.storia_trakt(u, ordine="recente")
    return righe, eta, plays
''',
}

if __name__ == "__main__":
    fatti = 0
    for nome, nuova in NUOVE.items():
        p = M / nome
        t = p.read_text(encoding="utf-8")
        m = re.search(r"^def storia\(u\):\n(?:.*?\n)*?(?=\n\ndef )", t, re.M)
        if not m:
            print(f"  !! {nome}: blocco non trovato")
            continue
        vecchie = m.group(0).count("\n")
        t2 = t[:m.start()] + nuova + t[m.end():]
        p.write_text(t2, encoding="utf-8")
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as e:
            p.write_text(t, encoding="utf-8")
            print(f"  !! {nome}: non compila, RIMESSO ({str(e)[:60]})")
            continue
        print(f"  {nome:<16} {vecchie} righe -> {nuova.count(chr(10))}")
        fatti += 1
    print(f"\n  sostituite: {fatti}/6")
