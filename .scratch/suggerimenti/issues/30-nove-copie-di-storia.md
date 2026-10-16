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
