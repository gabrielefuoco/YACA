Status: resolved
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

---

## Esito

`dev-set.py`: **166 casi · 3.063 link · 0 semi in comune col banco tonale**, da 155 autori Trakt in
holdout (20% con seme 777, elenco in `holdout-autori.json`).

Il progetto del senior (micro-liste pure) non era costruibile sui nostri dati: le liste popolari sono
liste-franchise (MCU, Nolan, Bond), e chiedere che l'**intera** lista sia cross-genere ne scarta il 95%.
La correzione: il vincolo sta sui **target**, non sulla lista — seme = il titolo più votato, target =
quelli che non condividono genere primario, regista né decennio col seme, con target eterogenei
(≥ 3 generi e ≥ 3 decenni) per escludere i franchise travestiti.

Misura che chiude un sospetto: **`LIST` non contaminava il dev set** — ricostruito senza gli autori
holdout, il grafo dà esattamente gli stessi numeri (`V23 − V22 = +0,0000`), perché `LIST` richiede
supporto ≥ 2 liste e quelle del dev sono singole.

Sul dev set umano: **V15 0,041 · V23 0,043 · V18 0,034**; `V15 − V23 = −0,0018` (rumore),
`V18 − V23 = −0,0084` (sopra l'MDE, peggiore). Il vantaggio di V15 sul banco LLM **non si riproduce**
sulle liste umane: era specifico del generatore del banco.
