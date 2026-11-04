Status: ready-for-agent
Type: task

# Dev set: micro-liste Trakt cross-genere in holdout

## Perché

Il banco tonale (`banco-casi/banco.json`, 200 semi, 3.870 link) è il **test set cieco**: non si può
usare per scegliere pesi, soglie o quali tipi tenere. Ma senza un dev set non possiamo sviluppare
niente — ogni confronto diventerebbe una violazione.

Serve un secondo insieme, **umano e disgiunto**: 20% degli autori di liste Trakt tenuti fuori sia da
`LIST.npz` sia da `LISTSEM.npz` (§protocollo del senior, risp3.md §3).

## Cosa fare

1. Split deterministico degli autori di `.cache/trakt/lists/` con `rng = np.random.default_rng(777)`:
   20% = **autori holdout**, esclusi da ogni tipo costruito.
2. Dalle loro liste, tenere solo quelle che soddisfano **tre criteri di puro tono**:
   - dimensione 8-35 titoli;
   - entropia di genere ≥ 1,6 bit e almeno 3 decenni distinti;
   - zero coppie con lo stesso regista dentro la lista.
3. Per ogni micro-lista (~250 attese): seme = il titolo più votato (se non è già uno dei 200 semi del
   banco tonale), target = gli altri titoli **che non condividono né genere primario né regista col seme**.
4. Scrivere `dev-set.json` nello schema di `banco.json`, più un `dev-report.json` con la distribuzione
   (dimensioni, entropia, decenni, copertura nel canone).

## Criteri di accettazione

- Nessun autore holdout compare in `LIST`/`LISTSEM` (verifica esplicita nel test).
- Nessun seme del dev set coincide con un seme del banco tonale.
- ≥ 200 micro-liste con ≥ 3 target validi ciascuna.

## Perché è il dev set giusto

È scritto da esseri umani veri (non dagli agenti LLM del banco), misura esattamente i salti
cross-genere/cross-decennio, ed è 100% holdout rispetto alla costruzione del grafo.

## Blocca

14 (LISTSEM), 15 (COV_RES), 19 (equilibrio topk), 20 (V15 sul canone nuovo): senza dev set non si
può decidere niente senza contaminare il test.
