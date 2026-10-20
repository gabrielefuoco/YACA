Status: open
Type: research
Punto: P20
Blocked by: 02

# 10 — Arte delle collezioni: cover, backdrop, logo, focus

## Domanda

Come si genera l’arte di una collection Nuvio — `coverImageUrl`, `backdropImageUrl`, `heroBackdropUrl`,
`titleLogoUrl`, `focusGifUrl` — partendo dal contenuto reale della folder, e quanto costa? Servono
stili possibili, fonti immagini, resa, cache e limiti di copyright. L’arte è ciò che fa percepire il
prodotto “premium”: va trattata come parte del contratto, non come decorazione.

## Cosa deve uscire

Una nota in `ricerche/10-artwork-collezioni.md` con:

- **superfici Nuvio**: quali campi esistono, dimensioni/ratio attese, cosa mostra la UI (tile, hero,
  focus), cosa succede se manca un’immagine.
- **stili** (2–3 opzioni):
  1. **poster wall** — mosaico dai titoli reali della folder, con palette;
  2. **key art** — backdrop/logo del titolo rappresentativo;
  3. **minimal/emoji** — tile grafico con emoji/genere.
  Per ognuno: pro, contro, costo di rendering, quanto invecchia.
- **fonti**: TMDB images, logo, palette, poster dei titoli; cosa si può usare e con quali attribuzioni.
- **rendering**: Sharp/canvas in YACA vs Pictorium vs servizio esterno; cosa è già disponibile in
  `src/posters/`; qualità e cache.
- **aggiornamento**: quando rigenerare (nightly, on-change), come invalidare, cosa fa Nuvio se l’URL
  cambia.
- **costi**: storage, CPU, CDN, numero di immagini per profilo.
- **copyright/community rules**: niente loghi di streaming nelle immagini condivise; uso di artwork
  TMDB; attribuzione.

## Fonti primarie

- Nuvio docs Collections + `Collection.kt` (campi art).
- Nuvio wiki Collections (cover/backdrop/title logo).
- Pictorium: rendering e Nuvio guide (esempio di arte dinamica).
- Kaptain: asset/cover set e regole della community.
- Xperience: “supporter cover sets” e “dynamic showcase” per capire il valore percepito.
- YACA: `src/posters/*`, `src/api/staticPosters`, `src/stremio/formatters/StremioFormatter.js`.

## Come si chiude

La nota è pronta quando:

1. i campi Nuvio e le ratio sono chiari;
2. ci sono 2–3 stili con costo/qualità;
3. la scelta rendering è motivata (build vs integrate);
4. cache/refresh e copyright sono trattati;
5. c’è una raccomandazione per il primo set di arte.
