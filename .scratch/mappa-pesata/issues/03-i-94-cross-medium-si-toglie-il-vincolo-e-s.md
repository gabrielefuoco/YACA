Status: resolved
Type: task

# 03 — I 94 cross-medium: si toglie il vincolo e si misura

Togliere il vincolo di medium dal voto diretto e misurare quanto sale, sapendo che il tetto passa da
84,3% a 100%.

Tre configurazioni, sulle stesse 600 serie e con lo stesso leave-one-out esatto del ticket 06c:
1. **solo bolle-serie** (com'e' adesso): 35,3%, tetto 84,3%;
2. **tutte le bolle** (serie e film): tetto 100% — quanto sale, e quanto sale **sulle 94**?
3. una via di mezzo da decidere: per esempio il film solo se il punteggio batte il migliore dei
   candidati-serie di un margine, oppure un peso diverso per i due medium.

E le 94 vanno **lette**: chi sono, in che bolle stanno, e se hanno un segnale comune (paese, rete,
genere, decennio) che li renda riconoscibili a freddo. Se il segnale c'e', la regola si puo' scrivere
invece di sperare nel punteggio.

Serve la stessa macchina del ticket 04/06c ma coi centroidi anche delle bolle-**film** (1.189): si
tengono **sparsi**, come al ticket 06, perche' densi sarebbero 580 MB.

Esito: `03-cross.py` + `ricerche/03-cross.md`.

## Esito

IL VINCOLO DI MEDIUM NON COSTA NIENTE, e la premessa del ticket era un'inferenza sbagliata MIA. Con i centroidi anche delle 1.189 bolle-film, TUTTE e 600 le serie hanno la bolla vera fra i candidati (nel ticket 05 erano 506 fra le sole bolle-serie, e ne avevo dedotto che le 94 fossero escluse 'a causa del medium': sono escluse da quella LISTA per definizione, non da quel METODO). Misurato: A (solo serie) 35,3%, B (tutte) 35,3%. Le 94 passano da 0,0% a 10,6%, le 506 da 41,9% a 39,9%: netto zero. Le 94 sono serie intrappolate in MINESTRONI GENERICI DI FILM (65 bolle, da 16 a 151 titoli, mediana 68, col 26% di serie): non e' il medium a nasconderle, e' che il loro mondo non esiste come bolla. La regola C (il film ammesso solo se batte il migliore serie di un margine) da' +1% e va in produzione.
