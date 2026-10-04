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
salvata qui, in [`patch/`](patch/), in due pezzi separati perché siano leggibili uno per uno.

### `erdb-badge.patch` — il badge `ITA`

36 righe, tre file:

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

### `erdb-formato.patch` — il formato delle immagini

5 righe. `pickOutputFormat` **accetta** un `acceptHeader` e **non lo legge mai**: serve
sempre WebP, qualunque cosa chieda il client. Il chiamante glielo passa già, e la
risposta porta `X-Content-Type-Options: nosniff` — quindi un client che parla solo JPEG
**rifiuta** l'immagine, pur avendola chiesta come `.jpg`.

Perché conta: il percorso vecchio componeva con **sharp**, che converte per estensione,
quindi produceva JPEG veri. Il percorso nuovo avrebbe scritto **~13 GB di WebP chiamati
`.jpg`**, senza che niente desse errore — e ce ne saremmo accorti a giro finito. La patch
fa la negoziazione come si deve: chi preferisce WebP lo ottiene, chi no riceve JPEG, e
**nel dubbio si sceglie JPEG** (la parte sicura: è ciò che il servizio produceva prima, ed
è quello che assomigliano i file già in cache).

Verificato dal vivo: senza `Accept`, con `Accept: image/jpeg` e con il `*/*` di curl, il
magic number è `ff d8` — JPEG vero; con `Accept: image/webp` è `RIFF` — WebP.

Base di entrambe: `8251427` (`badge custom (ITA / numero episodio) via ?badge= o customBadge nel token`) — cioè **v0.7.5 più quella commit**, non v0.7.5 da sola.

> **Verificato il 04/10/2026.** Il documento diceva `949f64f`, che è il **genitore** di `8251427`:
sbagliato, e chi avesse ricostruito seguendo questa pagina avrebbe trovato conflitti. La prova: le
due patch **annullano esattamente** le modifiche presenti nel clone (`git apply --reverse --check`
pulito su entrambe) e il loro codice **usa** `customBadge`, il campo che `8251427` introduce in
`lib/routeTypes.ts`. La commit tocca gli stessi tre file di `erdb-badge.patch`
(`app/[type]/[...id]/route.ts`, `lib/imageRenderer.ts`, `lib/routeTypes.ts`): è la sua base.

## 2. Costruire l'immagine

Serve un clone dell'upstream **fissato a `8251427`** e non a `:latest`: l'autore taglia
4-6 release al giorno e la patch è additiva su righe precise, quindi su un albero più
nuovo potrebbe non applicarsi pulita.

```bash
git clone https://github.com/realbestia1/erdb && cd erdb
git checkout 8251427
git apply /percorso/di/ops/erdb-legion/patch/erdb-badge.patch
git apply /percorso/di/ops/erdb-legion/patch/erdb-formato.patch
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

## 7. Il giro grosso sul Legion — e le due trappole che l'hanno rallentato di 15 volte

L'harness è [`costruisci.js`](costruisci.js): avvolge `build.js` con un **timeout per richiesta**
(`build.js` non ne ha: una richiesta appesa bloccherebbe un worker per sempre), logga l'avanzamento ogni
minuto ed **esce** se non cresce il numero di file (il rilancio è di chi sta sopra). La ripresa è del
costruttore: un file presente e non vuoto viene saltato, quindi ogni rilancio non ricomincia da capo.

**Trappola 1 — il provider di stream.** ERDB, per disegnare i badge di risoluzione (`4K`, `HDR`), interroga
**un provider di stream per ogni poster**: `lib/routeConfig.ts` lo ha come *default scritto nel codice*
(`icv.stremio-italia.eu/...`). Misurato: **4 tentativi per poster, ~2 s l'uno**, con la CPU al 2% — il giro
girava a **1,7 poster/s** (cioè ~20 ore) *aspettando i torrent*, non calcolando. Spegnere `streamBadges` nel
token **non basta**: ferma il disegno, non la chiamata.

Rimedio: un **interlocutore finto** che risponde all'istante "nessuno stream"
([`finto-provider.js`](finto-provider.js)) e la variabile
`ERDB_STREAM_BADGES_PROVIDER_URL=http://host.docker.internal:3112/`. Così non c'è nessun ritentativo, nessuna
chiamata esce verso l'esterno, e il risultato è **esattamente la decisione 6 della mappa**: zero badge di
risoluzione. Effetto: **1,7 → 9,2 poster/s**.

**Trappola 2 — la concorrenza oltre il punto buono peggiora.** Misurato sullo stesso giro:

| worker ERDB | resa |
|---|---|
| 12 | ~4,5/s |
| **16** | **~9/s** ← il punto buono |
| 24 | ~6,9/s (CPU *più bassa*: è contesa, non mancanza di muscolo) |
| 32 | ~4,4/s e centinaia di fallimenti |

La contesa è su SQLite (ogni worker scrive la sua cache in `erdb.db`). Oltre ~16 il sistema si rallenta da
solo. Non alzare "perché sembra vuoto": la CPU bassa era sintomo di attesa, non di margine.

**Numeri veri, per chi rifà il conto:** 125.270 titoli, ~138 KB per poster → **~17 GB** (la stima della mappa
diceva 13-14). Circa **4 ore** a 9/s su questa macchina. I fallimenti sono ~4% e sono **puliti** (zero file
`.tmp`, zero file vuoti: titoli che davvero non esistono su TMDB), e la ripresa li ritenta.

**A prova di spegnimento.** Il contenitore gira con `--restart unless-stopped` (Docker Desktop si riavvia da
solo con Windows), il sorvegliante ha un **candelotto** per non partire doppio ed è nella cartella *Esecuzione
automatica*. Un riavvio non fa perdere niente: i poster già scritti restano e vengono saltati.
