# ERDB sul Legion — il costruttore dei poster (una tantum)

Questa cartella serve a **costruire l'istanza ERDB patchata** e a farle rendere il giro
grosso dei poster sul Legion. Non è una cosa che gira sempre: la mappa `poster-erdb` ha
deciso che il Legion fa **una passata una tantum** (~117k poster, ~2 ore, ~13 GB), poi
esce dal processo. Il mate serve i file e lavora solo sugli eventi.

## 1. La patch — perché esiste, e dov'era

L'ERDB pubblico **non sa disegnare `ITA`** (verificato: le uniche occorrenze della
stringa nei chunk di Next.js sono dentro `WEB_V<ITA>LS`, un falso allarme). Quindi il
badge può venire **solo** da un'istanza nostra con la patch.

La patch non è mai stata committata da nessuna parte: è vissuta **come modifiche non
committate** in un clone locale, cioè a un `git checkout` dalla sparizione. Da lì è stata
salvata qui, in [`patch/erdb-badge.patch`](patch/erdb-badge.patch).

Cosa fa (36 righe, tre file):

- `app/[type]/[...id]/route.ts` — legge `customBadge` dalla config del token **oppure**
  dal parametro `?badge=` dell'URL, sanificato (spazi collassati, `trim`, **max 16
  caratteri**) e lo mette **nella chiave di cache**, così due badge diversi non si
  pestano;
- `lib/imageRenderer.ts` — lo disegna come overlay SVG in stile `glass` in alto a
  sinistra, con la larghezza **limitata** allo spazio interno del poster e un
  **rettangolo di ingombro** registrato, così gli altri overlay non ci finiscono sopra;
- `lib/routeTypes.ts` — il tipo.

Essendo un **testo**, ci sta anche `ITA 5`: badge e numero di episodio in una passata
sola, che è la decisione 1 della mappa.

Base: `949f64f` (`docs(changelog): update CHANGELOG for v0.7.5`) — **v0.7.5**.

## 2. Costruire l'immagine

Serve un clone dell'upstream **fissato a `949f64f`** e non a `:latest`: l'autore taglia
4-6 release al giorno e la patch è additiva su righe precise, quindi su un albero più
nuovo potrebbe non applicarsi pulita.

```bash
git clone https://github.com/realbestia1/erdb && cd erdb
git checkout 949f64f
git apply /percorso/di/ops/erdb-legion/patch/erdb-badge.patch
docker build -t erdb-patch:0.7.5 .
```

## 3. Far girare l'istanza

Vedi [`compose.yml`](compose.yml). I dati stanno in `./dati` (SQLite + cache immagini +
dataset IMDb), montati su `/app/data`.

Configurazione già decisa dalla mappa, e già di fatto rispettata dalla config di prova:

- **nessun provider di stream** → i badge di risoluzione (`4K`, `HDR`, `Dolby VISION`)
  **non** si vogliono: erano spesso falsati e costavano i check sui torrent;
- **MDBList spento** — è il provider che da solo faceva 5-25,9 s, ed è la decisione che
  rende il prefetch possibile (da ~840 ore a **~2 ore**);
- **un solo voto** basta: IMDb (dal dataset **locale**, zero rete) o TMDB;
- **TMDB** per poster e voto;
- lingua `it-IT`.

## 4. Il token

`accounts.db` tiene i token; **la configurazione sta nel token**, non in variabili
d'ambiente. Vedi [`inserisci-token.js`](inserisci-token.js), che si esegue **dentro** il
contenitore (usa `better-sqlite3`, che c'è già nell'immagine):

```bash
docker compose exec erdb node /app/inserisci-token.js
```

## 5. Provare che il badge c'è (la prova che conta)

[`prova-badge.sh`](prova-badge.sh) chiede **lo stesso poster due volte**, con e senza
`?badge=ITA`, e confronta i byte: se l'immagine è identica, la patch **non** è attiva e
tutto il resto è inutile. È la stessa prova fatta quando la patch è nata
(146.266 byte senza badge, 147.958 con: **+1.692**, che è il badge).

## 6. Dopo il giro

L'output (la cartella dei poster composti) va copiato sul mate nel volume servito da
`/erdb-poster/`. Da lì in poi lavora solo il mate, sugli eventi. Il Legion si spegne.
