Status: ready-for-agent
Type: task

# ~450 righe di infrastruttura copiata negli arbitri
**Prova**: otto arbitri (`alfa`, `cache`, `equilibrio`, `freddo`, `lettura`, `liste`, `pesi`, `ricetta`,
`soglia`) hanno ancora una `def storia(u)` locale (~25 righe l'una, che aprono i JSON di Trakt e chiamano
`pd.Timestamp` **dentro** il ciclo) e un caricamento manuale di `tv.parquet` per `NEP` (~20 righe l'una).
E' rimasto il lavoro a meta' del ticket precedente: `canon.storia_trakt` esiste ed e' usata da `motore`,
`intero` e `pesi`, ma gli altri sette la ignorano ancora.
**Fix**: `K.storia_trakt(u)` e `K.metadati()["NEP"]` al posto delle copie. ~450 righe in meno, e gli
arbitri **5x piu' veloci** (il caricamento dei Parquet e' il loro costo).
**Come si verifica**: gli arbitri ristampati devono dare **gli stessi numeri** — e questo e' il caso in
cui possono *non* darli, perche' le copie locali ordinano il tempo in modi diversi (e' la classe del
ticket 01). Se un numero cambia, quella copia stava misurando un'altra cosa: va indagato, non accettato.

---

RINVIATO CON UN'ANALISI MIGLIORE, il 16/10/2026. Non e' il refactor meccanico che sembrava: i nove `ppr` erano **copie identiche** e si sono sostituiti con uno script in un colpo (9/9), ma le `def storia(u)` degli arbitri hanno **firme di ritorno diverse** — `(righe, eta, plays)` in alcuni, `(righe, pesi, quando, titoli)` in altri, con ordinamenti del tempo diversi (e' la classe del ticket 01). Sostituirle a mano, una per una, e' l'unico modo di farlo senza cambiare cosa misura un banco; e ognuna va ristampata per verificare che i numeri non cambino. Restano ~450 righe da tagliare, ma vanno tagliate con le mani, non con un'ancora.

---

FATTO A META', il 16/10/2026, e con una scoperta. **Tre delle otto sono sostituite**: `cache.py`, `freddo.py` e
`ricetta.py` avevano una `storia(u)` che restituisce `(righe, plays)` in ordine **cronologico** — cioe'
esattamente `K.storia_trakt(u, "cronologico")` — e sono passate da 26, 26 e 24 righe a **11 ciascuna**
(43 righe in meno, e la lettura dei JSON di Trakt con `pd.Timestamp` dentro il ciclo e' sparita).
Verificato rilanciandoli: `ricetta.py` da' gli stessi numeri, `freddo.py` gira.

LA SCOPERTA: **non sono copie identiche**, e la differenza non si vede dalla firma. Due cose:
 · i **docstring mentono**: `cache.py` dichiara `(righe, plays, eta)` ma restituisce una coppia;
 · l'**ordine a parita' di data** dipende dall'ordinamento instabile di NumPy. `storia_trakt` usa
   `kind="stable"`, che e' deterministico ma cambia le posizioni nei pareggi (e i pareggi sono comuni:
   `eta = 3650` per le date mancanti). Non e' un difetto — e' un miglioramento — ma sposta i numeri di
   qualche punto percentuale, quindi ogni banco va ristampato e confrontato.

RESTANO SEI: `alfa`, `equilibrio`, `lettura`, `liste`, `soglia` — e **`pesi`, che NON si tocca con la
stessa ricetta**: la sua `storia` restituisce `(righe, eta, plays)` in ordine di RECENZA (il piu' nuovo
per primo), perche' i suoi schemi parlano di «ultimi 15/30» e leggono un PREFISSO degli array. Sostituirla
con `cronologico` romperebbe la semantica di quegli schemi: va adattata a mano, insieme al resto.
