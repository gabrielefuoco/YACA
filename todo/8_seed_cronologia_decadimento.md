# Obiettivo: i seed della cronologia oltre il tetto di 15 — decadimento temporale *e* di rango

Idea dell'umano (15/10/2026), registrata qui perché la misura che la giustifica **esiste già** e non è
mai stata applicata. Contesto completo: `.scratch/qc-cataloghi/ricerche/05-segnale-cronologia.md`
(07/10/2026) e `04-hero-cold-start.md`.

## Il problema, misurato

In `src/engines/hybrid/catalogStrategies.js:82`:

```javascript
const SEED_SIGNAL_LIMITS = Object.freeze({ loved: 20, liked: 15, watched: 15, library: 15 });
```

I titoli della cronologia vengono ordinati per data decrescente e ne vengono presi **i primi 15 e
basta**. Conseguenza misurata: **un utente con 50 visioni e uno con 100 (coi 15 recenti coincidenti)
ricevono la stessa lista, identica al 100% (Jaccard = 1,000)**. Tutta la cronologia dal 16° titolo in
poi è **cieca per il motore**.

E il difetto gemello, dal report 04: per un profilo **senza onboarding** `seed_network` esegue il
fallback `fetchTopRatedPeriodFallbackIds` e mostra i migliori film degli ultimi 60 mesi
**presentandoli come «La Rete dei tuoi Preferiti»**. Promessa tradita, con i numeri: voto mediano 8,0 e
nessun rapporto con l'utente.

## La decisione

**Togliere il tetto e sostituirlo con due pesi che si moltiplicano.**

### 1. Decadimento temporale continuo — l'**Opzione E** già misurata

`half-life 60 giorni`, applicato a **tutte** le visioni e non alle prime 15. È la raccomandazione del
report 05, coi numeri che la sostengono:

| criterio | Opzione E | oggi (tetto 15) |
|---|---|---|
| **copertura** della storia attiva | **100%** (50/50 e 25/25) | 30–60% secondo la variante |
| **monotonia** fra utente 50 e utente 100 | Jaccard **0,600** | **1,000** (liste identiche) |
| **stabilità** all'aggiunta di una visione | **0 su 20 (100%)** | — |
| **costo** | 2,99 s su 50 semi | 927 ms su 15 semi |

Il trade-off è misurato e va accettato consapevolmente: la latenza sale di ~2 s. Per storie molto lunghe
(200+ film) il report indica il rimedio: un **floor** `w ≥ 0,20` (~180 giorni) o un **cap a 60 semi**.

### 2. Peso di **rango** — l'idea nuova da provare accanto

Il decadimento temporale pesa **quanto è vecchia** una visione. Il rango pesa **dove sta** nella
sequenza: non è la stessa cosa, e il caso che le distingue è il binge — un film visto dieci giorni fa
può essere il quarantesimo di una maratona, e il tempo da solo non lo sa.

Due forme candidate, da **confrontare** e non da scegliere a intuito:

| forma | peso | carattere |
|---|---|---|
| **logaritmica** | `w_i = 1 / log₂(2 + i)` | gentile: il 16° titolo pesa ancora ~0,22, il 100° ~0,11 |
| **inversa** | `w_i = 1 / i` | severa: il 16° pesa 0,062, il 100° 0,01 |

Il peso finale è il prodotto: `w_i = 2^(−età_i / 60) · f(i)`.

**Perché la logaritmica ha un argomento a favore**: su una cronologia lunga la penalità inversa è
quasi un tetto mascherato (il 100° titolo pesa un centesimo, cioè non conta), mentre la logaritmica
lascia che il fondo della storia dica ancora qualcosa. Ma è un'ipotesi, e va misurata come le altre.

**Nota di coerenza**: `1/(k + rango)` è esattamente la forma dell'**RRF** che il progetto già usa nella
fusione a due stadi (report 58-62 di `.scratch/ml-collaborativo/`). Adottarlo qui non introduce un
meccanismo nuovo: ne riusa uno che in questo repo ha già vinto una misura.

## Come si verifica

Il metodo è quello del report 05, e va ripetuto perché sia confrontabile: **stesso profilo simulato**
(`Otaku Hardcore`, contesto `1c1da0af`), **6 varianti** (oggi · E · E+log · E+inversa · floor 0,20 ·
cap 60), le stesse metriche (copertura, monotonia, stabilità, costo) e il **verdetto a occhio** sui
primi 20 titoli di ogni variante.

L'occhio non è un lusso: il 15/10/2026, su un altro cantiere, ha corretto le metriche **sei volte** in
una sera. Le misure dicono se una cosa cambia; solo la lettura dice se cambia **in meglio**.

## Cosa non è deciso

- quale delle due forme di rango (log o inversa), e se **entrambe** servano
- se il peso di rango vada applicato anche a `loved`, `liked` e `library`, che hanno lo stesso tetto
- se il floor a 180 giorni basti a tenere la latenza sotto i 4 secondi su storie da 200+ film
- se il peso di rango debba dipendere dal **tempo** invece che dall'indice — cioè ordinare per data e
  pesare la *posizione nella sequenza ordinata*, che è la stessa cosa finché non si aggiungono visioni
  vecchie a posteriori
