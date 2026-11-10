# Cataloghi attivi: riordino, pulizia e lo stesso widget di Esplora

Status: resolved
Type: prototype
Blocked by: 05

## Question

I "Cataloghi attivi" diventano l'elenco finale della dashboard, riordinabile, e devono usare esattamente lo stesso widget di lista di Esplora. Le correzioni richieste sono puntuali ma vanno viste insieme, perché il widget cambia forma.

Da fare e decidere guardando un prototipo:

1. **Correzioni certe** (non sono bivi, sono consegne): via il pulsante **Copia**; via la dicitura «Catalogo tematico preconfigurato e costantemente aggiornato»; via il badge con il numero dei filtri; il badge **film / serie / anime** sale accanto a «preset» e «anime».
2. **Il riordino** — trascinamento, frecce, o maniglie? Il drag è comodo ma su mobile è una trappola; le frecce sono brutte ma inequivocabili. Il prototipo mostra il comportamento su desktop e la versione mobile.
3. **L'ordine arriva a Stremio?** Il manifest dichiara i cataloghi in un ordine: se l'utente riordina, Stremio deve mostrare il nuovo ordine. Da verificare nel ticket 04; qui si decide cosa promette l'interfaccia.
4. **Cosa mostra un catalogo attivo ma non servibile nella modalità corrente** — in modalità Bambini, un catalogo film attivato prima: resta nell'elenco spento con una spiegazione, o sparisce dall'elenco pur restando attivo? La prima è onesta e confusa, la seconda è pulita e bugiarda. Scegliere.
5. **Il badge del tipo** — dopo lo spostamento, quanti badge tollera una riga prima di diventare illeggibile? Oggi: preset, anime, film/serie, più il numero dei filtri. Togliendo il numero restano tre: verificare che stiano su una riga anche a 360 px.
6. **Lo stato di accensione** — lo switch resta com'è, o diventa parte del widget di lista? Deve essere identico in Esplora e nei Cataloghi attivi, altrimenti l'utente non riconosce la stessa cosa in due posti.

Esito: il widget di lista definitivo, disegnato una volta, con il comportamento di riordino e lo stato "non servibile", e la conferma visiva che le sei correzioni non hanno rotto la leggibilità.

## Esito

Il widget dei cataloghi attivi è `ActiveCatalogsPanel`, con riordino e interruttori funzionanti in qualunque modalità.
