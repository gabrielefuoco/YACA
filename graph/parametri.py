"""parametri.py — GLI IPERPARAMETRI DEL MECCANISMO, in un posto solo.

Perche' esiste. In una sessione di lavoro si prendono decine di decisioni numeriche, e senza un posto
dove vivono succede questo: la prossima volta non si sa piu' **quali sono scelte di prodotto, quali
sono misurate, e quali sono state inventate di fretta**.

**La tabella qui sotto e' la fonte unica.** I nomi dei parametri nascono da lei (l'ultima riga del
modulo li pubblica come costanti), quindi non possono divergere: se un numero va cambiato, si cambia
qui e basta.

Tre stati, e sono la cosa piu' importante di questo file:

  · **MISURATO**   c'e' un arbitro che l'ha deciso. Non si tocca senza rifare la misura.
  · **DICHIARATO** scelta di prodotto. Si cambia con una decisione, non con un test.
  · **INVENTATO**  messo a mano senza misura. **E' la prima cosa da rivedere.**

    python graph/parametri.py          # stampa la tabella
"""
import os

# # nome, valore, stato, perche', dove
#
# ATTENZIONE, e questa nota sta qui perche' l'errore e' stato fatto TRE volte in una sera: **niente
# stringhe multi-riga dentro questa tabella**. Sono tuple: una stringa spezzata su due righe senza
# concatenazione esplicita e' un SyntaxError, e il file non si carica piu' — quindi non falliscono solo
# le descrizioni, falliscono TUTTI gli arbitri che importano di qui. Se serve piu' spazio, si usa la
# concatenazione implicita (stringhe adiacenti), come nella voce CATALOGHI_MIN_RIPETIZIONI.
SCHEDA = [
    # NOTA: ogni stringa sta su UNA riga, o e' concatenata con stringhe adiacenti. Vedi l'avviso in testa.
    # ---------------------------------------------------------------- diffusione
    ("POTA_PER_RIGA", 16, "MISURATO",
     "Archi tenuti per ogni titolo. Tiene il 12% degli archi, costa 8,7x meno, e RAFFORZA i legami "
     "forti invece di perderli: la massa che resta sui compagni di saga sale da 26,6% a 47,8%, contro "
     "lo 0,011% di un titolo qualunque. Sotto il top-16 un arco non porta massa misurabile: e' la "
     "soglia che decide se un legame esiste per la camminata.",
     "measure/diffusione.py"),
    ("ALPHA", 0.60, "MISURATO",
     "Il restart: quanta luce torna ai titoli di partenza ad ogni giro. Da 0,60 a 0,90 il guadagno sale "
     "di +8,5% (dentro il rumore) mentre la luce sprecata sui gia' visti va dal 65% al 91%, e il rango "
     "dei mondi nascosti ha il massimo proprio a 0,60. Il valore messo a intuito era 0,15: peggio "
     "(20,7x contro 29,3x).",
     "measure/alfa.py (120 utenti)"),
    ("ITER", 20, "NUMERICO",
     "Iterazioni di PageRank. A 20 la massa e' convergita: cambiarlo non muove niente di misurabile.",
     "tutti gli arbitri della diffusione"),
    ("SOGLIA_PORTAFOGLIO", None, "DICHIARATO ASSENTE",
     "NON esiste una soglia per dire quali mondi sono «accesi». Una storia CASUALE della stessa "
     "lunghezza ne accende PIU' di una vera, a ogni soglia (0,9x costante): «quanti mondi si accendono» "
     "misura la lunghezza della storia, non il gusto. Il numero di liste lo decide chi invoca.",
     "measure/soglia.py"),

    # ---------------------------------------------------------------- semi
    ("PESO_FILM_MAX", 3.0, "DICHIARATO",
     "Tetto del peso di un film (sul numero di ri-visioni): «i plays vanno limitati». La misura che lo "
     "sostiene e' l'EQUILIBRIO, non il lift: con il cap a 20, a un utente di soli film le serie "
     "prendevano il 67% del peso del seme (fino all'85%); con la specifica, il 31%.",
     "measure/equilibrio.py (253 utenti)"),
    ("PESO_SERIE_BASE", 1.0, "DICHIARATO",
     "Il peso minimo di una serie. Insieme a PESO_SERIE_FASCIA definisce «una serie di 100 episodi "
     "deve valere come 2/3 film, non come 100».", "measure/pesi.py"),
    ("PESO_SERIE_FASCIA", 2.0, "DICHIARATO",
     "Quanto aggiunge la frazione di episodi visti: peso = 1 + 2 x frazione. Le PUNTATE non contano "
     "mai come play: contano come QUANTO della serie hai visto. Intervallo risultante: [1, 3]. Su storia "
     "corta il titolo piu' pesante prende il 5,2% del seme, contro il 20,8% di min(plays,20).",
     "measure/equilibrio.py"),
    ("NIENTE_RECENZA", True, "MISURATO E RIMOSSO",
     "La recenza NON entra come peso: `recenza x ri-visioni` fa identico a `plays` da solo (18,12x "
     "contro 18,17x). Non reintrodurla senza una misura nuova.",
     "measure/pesi.py"),
    ("NIENTE_RANGO", True, "MISURATO E RIMOSSO",
     "Il decadimento di rango (1/i, 1/log) e' PEGGIO di non far niente: 15,9x e 11,2x contro 18,2x. "
     "Era la proposta del todo/8.", "measure/pesi.py"),
    ("NIENTE_BOOST", True, "MISURATO E RIMOSSO",
     "Il boost ai recenti (+10%, +20%, +50% sugli ultimi 5-10) e' VUOTO: 17,85 -> 17,9-18,1. La recenza "
     "conta come SELEZIONE, non come peso: i soli ultimi 15 fanno 47,5x perche' buttano via il resto.",
     "measure/pesi.py"),
    ("FREDDO_SOTTO", 3, "DICHIARATO",
     "Sotto quanti titoli il profilo e' «freddo» e serve il seme dai cataloghi. La misura dice che il "
     "segnale c'e' gia' da UN titolo (36,9x contro lo 0,6x di un titolo a caso), ma il proprietario "
     "sceglie piu' prudenza.", "measure/freddo.py"),

    # ---------------------------------------------------------------- semi dai cataloghi (i piu' deboli)
    ("CATALOGHI_MIN_RIPETIZIONI", 2, "MISURATO VUOTO, PER PROGETTO",
     "«Titoli presenti in piu' di un catalogo». Misurato sulla famiglia «Registi» (11 cataloghi, "
     "measure/cataloghi.py): 0 titoli su 220 in piu' di uno, sovrapposizione mediana fra coppie 0. "
     "NOTA DEL PROPRIETARIO: la disgiunzione e' il risultato di un suo lavoro di CURATELA — i cataloghi "
     "sono disgiunti apposta. Quindi la prima strada e' vuota PER PROGETTO, e i top 2-3 di ogni catalogo "
     "non sono un ripiego qualunque: sono semi CURATI, scelti da una persona. Le altre famiglie "
     "(genere, marca) non si valutano: deciso cosi'.",
     "measure/cataloghi.py"),
    ("CATALOGHI_QUANTI", 10, "INVENTATO",
     "Quanti titoli prendere dai cataloghi attivi come seme sintetico.", "da costruire"),
    ("CATALOGHI_TOP_PER_CATALOGO", 3, "INVENTATO",
     "La ricaduta quando non ci sono titoli ripetuti: i primi 2-3 di ogni catalogo.", "da costruire"),

    # ---------------------------------------------------------------- liste
    ("NICCHIA_POPOLARITA_MAX", 20.0, "DICHIARATO (del PRODOTTO)",
     "HIDDEN_GEMS_MAX_POPULARITY di src/engines/hybrid/dataFetchers.js. Usato invece di inventarne un "
     "secondo: se il prodotto cambia la sua soglia, questa segue.", "src/engines/hybrid/dataFetchers.js"),
    ("NICCHIA_VOTO_MIN", 7.0, "DICHIARATO",
     "Voto medio minimo per la nicchia di qualita'. Il 90° percentile del catalogo e' 7,3, quindi 7,0 e' "
     "gia' selettivo (6.734 titoli su 49.709 film). Scelto guardando la distribuzione: si puo' tarare.",
     "measure/liste.py"),
    ("NICCHIA_BONUS_LISTE", 0.3, "INVENTATO",
     "Quanto sale un titolo se compare nelle liste di altri utenti. E' un nudge messo a mano, e va "
     "giustificato o tolto: le Trakt-liste coprono solo il 15% del catalogo (grado mediano 0), quindi "
     "l'assenza del marcatore non significa niente e il bonus avvantaggia chi sta in quel 15%.",
     "measure/liste.py"),
    ("MONDI_DIVERSI_QUANTI", 3, "DICHIARATO",
     "Quanti cataloghi extra, uno per ogni mondo diverso.", "measure/liste.py"),
    ("MONDI_DIVERSI_SOGLIA_FASCIA", 0.5, "INVENTATO",
     "Differenza minima fra due mondi perche' siano «diversi»: |log(voti medi)| > 0,5 (un fattore ~1,65) "
     "oppure medium diverso. La distanza in HOP non serve: sulla mappa la mediana e' 3 e il massimo 5. "
     "Il criterio vero e' fascia x medium, ma la soglia e' inventata. E serve un GUARDIANO DELLA "
     "COERENZA: senza, un mondo «lontano» puo' essere un contenitore eterogeneo (misurato: Star Crystal, "
     "2016: Obama's America, Destructors, Fair Game, New York Doll nello stesso mondo).",
     "measure/liste.py"),
    ("USCITE_NUOVE_DAL", 2025, "DICHIARATO",
     "Da che anno un titolo e' «uscita nuova»: l'anno in corso e quello prima. La lista e' l'unico "
     "lavoro della porta d'ingresso nel meccanismo, quindi questo numero e' visibile.",
     "measure/liste.py"),
    ("SAGHE_ROTTE_SU_SERIE", True, "MISURATO",
     "Le collezioni TMDB esistono solo per i film, quindi la lista «saghe» e' VUOTA per i mondi "
     "televisivi (verificato su due utenti su due). O si costruisce diversamente, o non si propone.",
     "measure/liste.py"),

    # ---------------------------------------------------------------- banco (misura, non prodotto)
    ("TAGLIO_TEMPORALE", 0.70, "BANCO",
     "Il 70% piu' vecchio della storia semina, il 30% piu' nuovo e' l'oro.", "measure/pesi.py"),
    ("BANCO_MIN_TITOLI", 40, "BANCO",
     "Sotto questo numero di titoli in canone, l'utente non entra nel banco.", "tutti gli arbitri"),
    ("BANCO_UTENTI", int(os.environ.get("UTENTI", 100)), "BANCO",
     "Quanti utenti Trakt. Usati finora: 60 (freddo), 100 (pesi), 120 (alfa, soglia), 253 (equilibrio).",
     "tutti gli arbitri"),
    ("EQUILIBRIO_UTENTI", 300, "ANALISI",
     "Utenti per la misura dell'EQUILIBRIO (la quota di peso delle serie). E' piu' alta degli altri "
     "banchi perche' il sottogruppo «utenti di soli film» e' minoritario: con 100 utenti ne restano 3, "
     "e la mediana non dice piu' niente.",
     "measure/equilibrio.py"),
    ("EQUILIBRIO_MIN_TITOLI", 20, "ANALISI",
     "Titoli minimi per entrare nella misura dell'equilibrio: piu' basso del banco (40) perche' qui "
     "interessa anche chi ha una storia sottile — ed e' proprio il caso sbilanciato.",
     "measure/equilibrio.py"),
    ("FILM_HEAVY_SOTTO", 0.30, "ANALISI",
     "«Utente di soli film» = meno del 30% di serie nella storia. Taglio di analisi, non regola.",
     "measure/equilibrio.py"),
    ("STORIA_CORTA_SOTTO", 60, "ANALISI",
     "«Storia corta» = meno di 60 titoli. Taglio di analisi, non regola.", "measure/equilibrio.py"),
]

# La tabella pubblica i nomi: cosi' non possono divergere da essa.
for _nome, _valore, _stato, _perche, _dove in SCHEDA:
    globals()[_nome] = _valore


def stato_di(nome):
    for n, v, s, p, d in SCHEDA:
        if n == nome:
            return s
    raise KeyError(nome)


def da_rivedere():
    """Gli iperparametri INVENTATI: la lista delle cose da sistemare per prime."""
    return [(n, v, d) for n, v, s, _p, d in SCHEDA if s.startswith("INVENTATO")]


def impronta():
    """L'IMPRONTA DELLA RICETTA: cambia se cambia qualunque iperparametro di questa tabella.

    Serve nella chiave della cache delle liste. Senza, cambiare un valore (per esempio
    `MONDI_DIVERSI_SOGLIA_FASCIA`) continuerebbe a servire liste costruite coi valori vecchi — **in
    silenzio**, e senza che niente vada in errore. E' **la stessa trappola della partizione** (l'artefatto
    e il parametro che si disallineano), e si chiude allo stesso modo: con un'impronta.
    """
    import hashlib
    import json
    grezzo = json.dumps([[n, str(v), s] for n, v, s, _p, _d in SCHEDA], sort_keys=True)
    return hashlib.sha256(grezzo.encode()).hexdigest()[:16]


if __name__ == "__main__":
    print("=" * 104)
    print("GLI IPERPARAMETRI DEL MECCANISMO — valore, stato, perche'")
    print("=" * 104)
    for nome, val, stato, perche, dove in SCHEDA:
        print(f"\n  {nome} = {val!r}")
        print(f"    [{stato}]  ({dove})")
        for riga in perche.split(". "):
            if riga.strip():
                print(f"      {riga.strip().rstrip('.')}.")
    print("\n" + "=" * 104)
    print("  MISURATO   = c'e' un arbitro che l'ha deciso: non si tocca senza rifare la misura")
    print("  DICHIARATO = scelta di prodotto: si cambia con una decisione, non con un test")
    print("  INVENTATO  = messo a mano senza misura: e' la prima cosa da rivedere")
    print("=" * 104)
    print("\n  DA RIVEDERE:")
    for n, v, d in da_rivedere():
        print(f"    · {n} = {v!r}  ({d})")
