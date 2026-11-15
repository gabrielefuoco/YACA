# Onda 3 — vetrina e pulizia (03, 05, 08, 09)

**Branch**: `hardening/onda-3` · **Deploy**: 2026-11-15 20:5x, immagine `6256fa95`

| Ticket | Agent | Commit | Diff |
|---|---|---|---|
| 03 soglie TMDB | `t03-soglie` | `ad31f13a` + `68825291` | 4 file, +303/−43 |
| 05 matching doppiaggi | `t05-matching` | `3a7b564d` + `9fa926df` | 3 file, +294/−22 poi revert |
| 08 versione poster | `t08-poster-version` | `3b8c68a1` + `b9787ae4` | 10 file, +526/−31 |
| 09 GC poster | `t09-gc-poster` | `264ae752` | 4 file, +371 |
| (review) | io | 3 commit | `/data`→`/data/tmdb`, `poster_path` nel prefill, script di migrazione con hardlink |

Test finali: **jest 199 suite / 1982 test**, servizi **246/246**.

## Le tre decisioni che i numeri hanno cambiato

### 03 — la soglia 0.6 è stata **rimossa** prima del merge della parte utile

Campione reale sull'export TMDB (500 serie tirate a sorte, dati veri da TMDB):

| fascia | campione | `voti ≥ 10` | con la regola nuova |
|---|---:|---:|---:|
| 0.6 – 1.0 | 500 | **9 (1,8%)** | 10 (2,0%) |
| ≥ 1.0 (controllo) | 250 | **55 (22%)** | 56 (22,4%) |

La fascia bassa è 12× meno produttiva: entrare a 0.6 voleva dire ~29.113 chiamate per **~583 serie**.
Cosa resta del ticket e perché: l'inclusione forzata dei doppiatti mancanti (**81** id: 4 film, 77 serie —
misurati contro il catalogo) e il pavimento voti 3 per i titoli italiani/doppiati. Zero costo, guadagno
mirato.

### 05 — la guardia di lunghezza era **mia** ed era sbagliata

Dry-run su dati reali (cache AG + catalogo veri, 25.858 schede): il matcher completo dava 19.605 `true`
contro i 19.792 di prima, con perdite legittime:

- `"Mila e Shiro"` vs `"Mila e Shiro - Due cuori nella Pallavolo"` → rapporto 0,40 → scartato;
- `"Jem"` vs `"Jem e le Holograms"` → token di 3 caratteri → scartato;
- `"Ippo"` vs `"Hajime no Ippo"`, `"Miyuki"` vs `"Miyuki-chan in Wonderland"`: idem.

Il problema strutturale: un sottotitolo aggiunto da TMDB è indistinguibile da un titolo corto contenuto in
un titolo lungo, e i due errori non costano uguale (un `true` perso toglie un badge a un doppiaggio vero).
Quindi: **guardia rimossa** (containment torna byte-identico a prima), **regola dell'anno tenuta**.

Verifica in produzione dopo il rilascio:

| | prima | dopo |
|---|---:|---:|
| AG `true` | 19.500 | **19.563** (+63) |
| AG `null` | 2.145 | 2.112 (−33) |
| `true` totali | 19.577 | **19.632** (+55) |
| diff del giro | — | 59 cambi (57 nuovi doppiati, 2 persi) |

### 08 — la mappa non si scrive nel percorso caldo

La prima versione faceva `readFileSync` + `JSON.stringify` + `writeFileSync` dell'intero
`sorgenti.json` (118.039 voci, 5,8 MB) **a ogni card formattata**. Riscritto: mappa in RAM con controllo
mtime ogni 60 s, letture a costo zero; **unico scrittore il prefill offline**. Test che lo inchioda: 1.000
letture → **una sola** `readFileSync`.

Migrazione al deploy (105.840 file, 98.944 nomi nuovi): un container una tantum con lo script
`scripts/migra-poster-versione-sorgente.js`, che crea i nomi nuovi come **hardlink**. Così durante la
finestra di deploy il nome vecchio risponde ancora 200 — verificato: `tmdb-movie-1000058.jpg` e
`tmdb-movie-100-006985a7_ITA.jpg` sono entrambi 200, e il disco non è cresciuto (hardlink, stesso inode).
I nomi vecchi li raccoglierà il GC.

## Altre cose emerse

- **`/data` era una trappola**: un test ha creato `C:\data`, e da quel momento i 10 moduli che fanno
  `existsSync('/data')` puntavano a una cartella vuota → DuckDB senza parquet → 4 suite rosse. Ora la
  condizione è `existsSync('/data/tmdb')` (su Linux non cambia nulla). `C:\data` rimosso.
- **09**: il GC è pronto (2 regole: `.tmp` orfani > 15 min, TTL 60 giorni sul mtime; barriera 60 min;
  nomi non interpretabili mai toccati) con timer 05:00 **non installato**. Raccomandazione dell'agente,
  condivisa: il volume ha 16 GB di arretrato, e con `maxDelete 500` il timer tiene la crescita a zero ma
  non lo smaltisce — per l'arretrato serve una passata una tantum con cap alto, **da decidere**.
- Coda poster: i 59 cambi dell'ultimo giro sono in coda e si smaltiscono in ~1 ora.

## Stato dei ticket

| Ticket | Stato |
|---|---|
| 03 | ✅ in produzione (parte utile) |
| 05 | ✅ in produzione, +63 badge misurati |
| 08 | ✅ in produzione, migrazione applicata |
| 09 | ✅ codice + unità systemd pronte, **timer non installato** |
| 11 | ⬜ onda 4 |
