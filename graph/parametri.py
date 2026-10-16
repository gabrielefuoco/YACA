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
    ("PESO_TIPO", "loved 3 · liked 2 · library 1,5 · watched 1", "INVENTATO",
     "IL MOLTIPLICATORE DEL TIPO DI SEGNALE. Fino a ieri il motore conosceva UN SOLO tipo — «visto», "
     "pesato con le ri-visioni — e buttava via i segnali espliciti, che sono i piu' forti: un «love» e' "
     "l'utente che DICE una cosa, non che la fa. Il prodotto ne distingue quattro "
     "(SEED_SIGNAL_LIMITS = loved, liked, watched, library) e li usa gia'. "
     "I moltiplicatori qui sono INVENTATI: non c'e' modo di calibrarli offline, perche' like, love, "
     "libreria e voti stanno nel database del PRODOTTO, non nella cache Trakt. Vanno tarati quando i "
     "dati esisteranno — e allora la calibrazione di §3b va RIFATTA, perche' e' stata fatta sulle "
     "ri-visioni sole. NOTA: la libreria e' INTENZIONE, non visione — un titolo in libreria NON va "
     "escluso dai suggerimenti come se fosse visto.",
     "graph/camminata.py"),
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
    ("MIN_TITOLI_MONDO", 5, "INVENTATO",
     "Quanti titoli non visti deve avere un mondo perche' valga come catalogo a se'. Nato dal motore: "
     "la selezione prendeva il mondo 3379 (4 titoli) e la sua lista ne mostrava UNO. Il primo mondo, "
     "quello del profilo, resta sempre anche se e' piccolo.",
     "graph/motore.py"),
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
    ("FILTRO_VS_MODULAZIONE", "modulare", "MISURATO",
     "LA REGOLA DEGLI ASSI: un asse NON deve sostituire l'attivazione (filtrando i titoli dentro i mondi "
     "o riordinando i mondi), deve MODULARLA. Misurato su 60 utenti, 40 titoli per portafoglio: "
     "sostituendo, il riempimento crolla a 3-14 titoli e la copertura del futuro va a 0,0-0,7%; "
     "modulando, il riempimento resta 32 e la copertura 2,3-2,6%, e un terzo dei titoli cambia "
     "(Jaccard 0,67). Vale per tutti gli assi, fascia compresa.",
     "measure/ricetta.py"),
    ("ASSE_PESO", 0.5, "INVENTATO",
     "Quanto un asse extra modula l'attivazione: att x (1 + 0,5 x (quota - 0,5)). Misurato: a 0,5 il "
     "cozy cambia un terzo dei titoli (Jaccard 0,67) mentre l'impegnativo NON cambia niente "
     "(Jaccard 1,00) — le due liste di generi hanno prevalenze molto diverse (30.814 contro 8.279 "
     "titoli) e probabilmente vogliono pesi diversi.",
     "measure/ricetta.py"),
    ("DELTA_FASCIA", 1.0, "INVENTATO",
     "Di quanto lo slider `canone` sposta la finestra, in spazio LOGARITMICO dei voti: 1,0 = un fattore "
     "e (~2,7x). Serve a `motore.modula`: la fascia e' una finestra attorno al canone DEDOTTO, che si "
     "sposta con lo slider — non un riordino verso l'estremo. Prima qui non c'era niente perche' la "
     "formula era `abs(q-c)*sign(q-c)*s`, che e' algebricamente `(q-c)*s`: una retta, che con s>0 "
     "premiava i mondi mainstream in assoluto e con s<0 quelli a 0 voti. Da calibrare su ricetta.py.",
     "measure/ricetta.py"),
    ("ASSE_COZY_GENERI", "35,10751,10749,16", "DICHIARATO (curatela del proprietario)",
     "I generi dell'asse «cozy»: commedia, famiglia, romantico, animazione. Lista PROVVISORIA scritta "
     "dall'autore per provare l'asse: la curatela vera e' del proprietario, e i generi sono la parte "
     "grossolana — le keyword sarebbero piu' fini.",
     "measure/ricetta.py"),
    ("ASSE_IMPEGNATIVO_GENERI", "99,36,10752", "DICHIARATO (curatela del proprietario)",
     "I generi dell'asse «impegnativo»: documentario, storico, guerra. Provvisoria come sopra. NOTA: "
     "il genere «Dramma» (18) e' stato ESCLUSO di proposito — copre meta' del catalogo e non "
     "filtra niente.",
     "measure/ricetta.py"),
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

    # ================================================================ I PARAMETRI DI COSTRUZIONE
    # Questi NON governano la camminata: governano gli step che PRODUCONO gli artefatti (`graph/steps/`).
    # Stavano cablati dentro gli script, e due di loro — la tassonomia dei token e i pesi per tipo —
    # erano scritti DUE VOLTE (`steps/05_centroidi_v3.py` e `collocator.py`): cambiarne uno solo li
    # disallineava in silenzio, senza crash e senza numeri che protestassero. E' il ticket 13.
    #
    # ATTENZIONE, e vale per chi legge fra un anno: cambiare uno di questi valori cambia l'impronta
    # della ricetta, quindi invalida l'artefatto del prodotto e il fixture della parita' — ed e' giusto
    # che lo faccia, perche' un grafo ricostruito e' un grafo diverso. Gli script hanno ancora le loro
    # vie di scampo da riga di comando (`RES=100`, `python steps/03... 8 15`): qui ci sono i DEFAULT,
    # cioe' i valori con cui sono stati costruiti gli artefatti che stanno in `graph/data/`.
    ("MOD_EMBEDDING", "qwen3-embedding:0.6b", "TECNICO",
     "Il modello che produce le 35.829 trame (~17 min, 0,6 GB). Non si scarica da solo: "
     "`ollama pull qwen3-embedding:0.6b` prima.", "steps/00_embedding_trame.py"),
    ("TRAMA_TOPK", 30, "SCELTO",
     "I 30 vicini di trama per titolo. Da qui nascono gli 1,65M archi di `eterogeneo-TRAMA`: "
     "alzarlo gonfia un componente che pesa gia' molto.", "steps/01_componente_trama.py"),
    ("TRAMA_SOGLIA", 0.30, "SCELTO",
     "Sotto questa similarita' di trama l'arco non si tiene. Lo script stampa il grado a varie soglie "
     "prima di scegliere, apposta perche' il valore si guarda e non si indovina.",
     "steps/01_componente_trama.py"),
    ("TRAMA_BLOCCO", 2000, "TECNICO",
     "Le righe per blocco nel calcolo della similarita': serve alla memoria, non al risultato.",
     "steps/01_componente_trama.py"),
    ("PARTIZIONE_RES", 200, "SCELTO",
     "La risoluzione di Leiden. 200 e' la prova «bolle piu' piccole»: da qui vengono le 3.497 bolle "
     "finali, dopo la divisione per voti. Si sovrascrive con `RES=100 python steps/02_partizione.py`.",
     "steps/02_partizione.py"),
    ("PARTIZIONE_PESI", [1.0], "SCELTO",
     "I pesi dei componenti nella miscela, uno per argomento da riga di comando. `1.0` = i valori di "
     "base, ed e' quello che ha prodotto gli artefatti attuali.", "steps/02_partizione.py"),
    ("PARTIZIONE_MIN_SIM_KW", 0.12, "SCELTO",
     "Similarita' minima fra due titoli sul solo asse delle keyword, dentro lo shrinkage dei componenti.",
     "steps/02_partizione.py"),
    ("PARTIZIONE_MIN_SIM_CAST", 0.02, "SCELTO",
     "Come sopra, sul cast. E' piu' basso perche' il cast e' molto piu' sparpagliato.",
     "steps/02_partizione.py"),
    ("VOTI_SPREAD_MIN", 10.0, "SCELTO",
     "La divisione per voti: una bolla si spacca solo se lo spread p90/p10 dei SUOI voti supera "
     "questo valore (dopo aver imposto almeno 15 titoli a pezzo). E' la regola che ha prodotto le "
     "3.497 bolle finali: senza, l'eterogeneita' dei voti restava dentro le bolle.",
     "steps/03_divisione_voti.py"),
    ("VOTI_MIN_MEMBRI", 15, "SCELTO",
     "Titoli minimi perche' una bolla possa essere divisa. Sotto, la divisione fa piu' danno che bene.",
     "steps/03_divisione_voti.py"),
    ("VOTI_RISOLUZIONI", (0.05, 0.1, 0.2, 0.4, 0.8), "SCELTO",
     "Le risoluzioni provate IN ORDINE dentro una bolla da spaccare: la prima che regge vince. "
     "Fisse e dichiarate, non una ricerca libera — cosi' il risultato e' riproducibile.",
     "steps/03_divisione_voti.py"),
    ("CENTROIDI_MIN_MEMBRI", 5, "TECNICO",
     "Sotto i 5 titoli una bolla non ha un centroide: e' il motivo per cui l'artefatto del prodotto "
     "ha `termini` per 2.922 bolle su 3.497 e non per tutte.", "steps/04_centroidi.py"),
    ("V3_DF_MIN", 3, "SCELTO",
     "Document frequency minima perche' un token entri nel vocabolario V3: sotto, il token e' troppo "
     "raro per dire qualcosa. E' una delle tre differenze fra lo spazio V1 e il V3.",
     "steps/05_centroidi_v3.py"),
    ("V3_TETTO_IDF", 20.0, "SCELTO",
     "Tetto dell'idf: un token che compare in pochissimi titoli non deve pesare come se fosse "
     "l'unico indizio del catalogo.", "steps/05_centroidi_v3.py"),
    ("PESI_TOKEN", {"ge:": 1.5, "rt:": 1.5, "co:": 0.4, "ca:": 0.4, "di:": 0.8}, "SCELTO",
     "QUESTO VALORE ERA SCRITTO IN DUE POSTI — qui in `steps/05_centroidi_v3.py` e in "
     "`collocator.py` come `PESI_TIPO` — e i due lati del coseno devono parlare la stessa lingua: "
     "cambiarlo in un posto solo non faceva fallire niente, faceva scivolare i punteggi. Genere e "
     "rete contano molto, casa e cast poco, registi in mezzo.",
     "steps/05_centroidi_v3.py + collocator.py"),
    ("COLLOCA_MARGINE", 1.0, "SCELTO",
     "Di quanto un film deve battere la migliore serie per vincere la collocazione: la regola del "
     "medium, misurata nel ticket 03 di `eterogeneo`.", "collocator.py"),
    ("COLLOCA_FATTORE_VOTI", 10.0, "SCELTO",
     "La regola dei voti: si guardano le bolle con mediana dentro [V/10, V*10]. Sceglie il PIANO "
     "prima della stanza — senza, *Il gladiatore II* atterrava in una bolla con mediana 89.",
     "collocator.py"),
    ("MAPPA_INTRA", 6, "SCELTO",
     "I vicini intra-medium di ogni bolla sulla mappa navigabile. Con MAPPA_CROSS fanno i 6+2 archi.",
     "steps/06_mappa.py"),
    ("MAPPA_CROSS", 2, "SCELTO",
     "I ponti verso l'altro medium, scelti per peso. Sono i 2 archi che l'artefatto del prodotto "
     "buttava via prima del 16/10/2026, e senza i quali la diffusione non attraversava mai il confine.",
     "steps/06_mappa.py"),
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
