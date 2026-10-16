Status: wontfix
Type: task

# La calibrazione dei quattro tipi di segnale — non si può fare, e va detto

I quattro segnali del prodotto (like, love, libreria, voti) hanno in `parametri.py` dei moltiplicatori
marcati **INVENTATI**: `PESO_TIPO = {loved: 3.0, liked: 2.0, library: 1.5, watched: 1.0}`. Non c'è modo di
calibrarli offline, perché like, love, libreria e voti stanno nel **database del prodotto**, non nelle
cache Trakt con cui il modulo è stato misurato finora. L'unica cosa misurabile offline era un *proxy*
dichiarato (ri-visto ≥ 2 = «loved»).

---

CHIUSO `wontfix` il 16/10/2026, **su decisione del proprietario**: non ci sono utenti, e i segnali veri
non esistono in nessun database da cui attingere. Una calibrazione senza dati non è una calibrazione: è
inventare dei numeri con un'aria più autorevole di quelli che ci sono già.

**COS'È COMUNQUE IN ORDINE**, e non è poco:

1. i valori sono **in tabella** e marcati `INVENTATO`, quindi `parametri.da_rivedere()` li elenca e
   `impronta()` li copre: cambiarli invalida l'artefatto del prodotto e la cache. Prima erano fuori dalla
   tabella (ticket 33) e un cambio passava in silenzio;
2. il motore **li accetta già** e li applica per titolo (`camminata.pesi_semi` con `tipi=`);
3. e con le liste riparate (ticket 19, 20, 22) **i fattori ora spostano le cose**: la misura lo dice
   («i fattori di tipo spostano molto: la calibrazione conta»), mentre prima — con le liste sbagliate —
   sembrava che non contassero niente. Cioè: il giorno che ci saranno i dati, l'effetto da calibrare
   esiste già.

**COME SI CALIBRERÀ**, quando ci saranno utenti veri: il banco è `graph/measure/pesi.py`, che confronta gli
schemi di peso sul taglio temporale, e `graph/measure/equilibrio.py`, che misura lo sbilanciamento del
seme. Servono due cose che oggi non esistono: (a) le interazioni vere del prodotto classificate per tipo,
(b) abbastanza utenti perché il taglio temporale abbia un futuro da predire. La procedura è quella del
`todo/9_assi_del_profilo.md`, che resta il posto giusto dove riprenderla.
