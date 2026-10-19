Status: ready-for-agent
Type: task
Blocked by: 03

# 17 — Il tipo dedotto dal peso (e lo score gonfiato del ripescato)

Debito dichiarato dalla review di chiusura del ticket **02** (19/10/2026). Due rilievi, il primo dei quali è più
di uno smell: è la **causa strutturale** di un problema che il ticket 02 ha curato per sintomo.

## 1. Il tipo si deduce da un numero, invece di essere portato

`convertiSemiPerGrafo` (`src/pool/index.js`) costruisce `{ tmdbId, medium, tipo }` a partire dal **peso numerico**
del seme, con soglie cablate:

```
w >= 4  → 'loved'
w >= 3  → 'liked'
w === 1 → 'watched' | 'library'
```

È la ragione per cui il ticket 02 ha dovuto **smettere di mandare il peso esplicito**: finché quel peso viaggiava,
era lui a decidere il tipo — e quindi `PESO_TIPO` non contava. Il ticket 02 ha tolto il sintomo (il pool non manda
più `peso`); qui si toglie la causa: **il tipo deve viaggiare come dato**, non essere indovinato da un numero.

Cosa deve uscire:
1. `semiDi` (`src/library/seeds.js`) **sa** già se un seme è `loved` / `liked` / `watched` / `library`: porti il
   tipo nell'oggetto del seme (o affianchi al valore una struttura che lo porta), invece di lasciarlo dedurre.
2. `convertiSemiPerGrafo` **usi il tipo** e smetta di dedurlo. Le soglie cablate spariscono.
3. Se in qualche percorso il tipo **non** è disponibile, il codice lo **dichiara** (un `console.warn`, un conteggio,
   un valore esplicito `sconosciuto`) e non ricade in silenzio sul numero: una deduzione silenziosa è il difetto,
   non la soluzione.

## 2. Lo score del titolo ripescato

`motore.py` espone `titoli_rip = [(B.KEYS[x], float(r[x]))]`: il titolo ripescato dalla watchlist porta quindi a
valle `r[x]`, che è **gonfiato** da `ALPHA * e_init[x]` — cioè proprio la massa di restart che il ripescaggio serviva
a neutralizzare. Il piazzamento in testa è voluto (il ticket 02 chiedeva "nelle prime posizioni"), ma il **numero**
non è onesto: chi lo ordina a valle crede che quel titolo sia più affine di quanto sia.

Cosa deve uscire: esporre `r_indotta[x]` (lo score vero) e ottenere il piazzamento in testa **per costruzione**
(inserendoli in testa alla lista), non per merito di uno score gonfiato. Se serve un ordinamento interno fra i
ripescati, si ordina per `r_indotta`.

## La prova

- Un caso in cui il tipo di un seme **non** coincide con quello che le vecchie soglie dedurrebbero (es. un `library`
  il cui peso numerico fosse 4): prima del fix verrebbe classificato `loved`, dopo `library`. Il test deve prendere
  il caso.
- Il titolo ripescato esce con `punteggio == r_indotta[x]` (verificabile confrontando i due valori nel test), e sta
  comunque in testa.
- Suite alla baseline e i due hash del manifest invariati.
- Il servizio del grafo importa e risponde (si tocca `motore.py`).

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse**: se il codice dice altro, fermati e dichiara la divergenza.
- **Verificare eseguendo, non leggendo.**
- **Nell'Esito, ogni numero sta dentro un blocco di output incollato, con il comando sopra.** Se un numero non è in
  un blocco, non è un risultato. (Regola nata da due Esiti che riportavano numeri che il codice non produceva.)
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite) — salvo che i ticket
  precedenti l'abbiano deliberatamente cambiata, e in quel caso il numero nuovo è scritto nel loro Esito.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo.
- Commit in steps, ognuno con la sua prova.
