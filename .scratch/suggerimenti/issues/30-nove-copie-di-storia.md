Status: resolved
Type: task

# ~450 righe di infrastruttura copiata negli arbitri
**Prova**: otto arbitri (`alfa`, `cache`, `equilibrio`, `freddo`, `lettura`, `liste`, `pesi`, `ricetta`,
`soglia`) hanno ancora una `def storia(u)` locale (~25 righe l'una, che aprono i JSON di Trakt e chiamano
`pd.Timestamp` **dentro** il ciclo) e un caricamento manuale di `tv.parquet` per `NEP` (~20 righe l'una).
E' rimasto il lavoro a meta' del ticket precedente: `canon.storia_trakt` esiste ed e' usata da `motore`,
`intero` e `pesi`, ma gli altri sette la ignorano ancora.
**Fix**: `K.storia_trakt(u)` e `K.metadati()["NEP"]` al posto delle copie. ~450 righe in meno, e gli
arbitri **5x piu' veloci** (il caricamento dei Parquet e' il loro costo).
**Come si verifica**: gli arbitri ristampati devono dare **gli stessi numeri** — e questo e' il caso in
cui possono *non* darli, perche' le copie locali ordinano il tempo in modi diversi (e' la classe del
ticket 01). Se un numero cambia, quella copia stava misurando un'altra cosa: va indagato, non accettato.

---

RINVIATO CON UN'ANALISI MIGLIORE, il 16/10/2026. Non e' il refactor meccanico che sembrava: i nove `ppr` erano **copie identiche** e si sono sostituiti con uno script in un colpo (9/9), ma le `def storia(u)` degli arbitri hanno **firme di ritorno diverse** — `(righe, eta, plays)` in alcuni, `(righe, pesi, quando, titoli)` in altri, con ordinamenti del tempo diversi (e' la classe del ticket 01). Sostituirle a mano, una per una, e' l'unico modo di farlo senza cambiare cosa misura un banco; e ognuna va ristampata per verificare che i numeri non cambino. Restano ~450 righe da tagliare, ma vanno tagliate con le mani, non con un'ancora.

---

FATTO A META', il 16/10/2026, e con una scoperta. **Tre delle otto sono sostituite**: `cache.py`, `freddo.py` e
`ricetta.py` avevano una `storia(u)` che restituisce `(righe, plays)` in ordine **cronologico** — cioe'
esattamente `K.storia_trakt(u, "cronologico")` — e sono passate da 26, 26 e 24 righe a **11 ciascuna**
(43 righe in meno, e la lettura dei JSON di Trakt con `pd.Timestamp` dentro il ciclo e' sparita).
Verificato rilanciandoli: `ricetta.py` da' gli stessi numeri, `freddo.py` gira.

LA SCOPERTA: **non sono copie identiche**, e la differenza non si vede dalla firma. Due cose:
 · i **docstring mentono**: `cache.py` dichiara `(righe, plays, eta)` ma restituisce una coppia;
 · l'**ordine a parita' di data** dipende dall'ordinamento instabile di NumPy. `storia_trakt` usa
   `kind="stable"`, che e' deterministico ma cambia le posizioni nei pareggi (e i pareggi sono comuni:
   `eta = 3650` per le date mancanti). Non e' un difetto — e' un miglioramento — ma sposta i numeri di
   qualche punto percentuale, quindi ogni banco va ristampato e confrontato.

RESTANO SEI: `alfa`, `equilibrio`, `lettura`, `liste`, `soglia` — e **`pesi`, che NON si tocca con la
stessa ricetta**: la sua `storia` restituisce `(righe, eta, plays)` in ordine di RECENZA (il piu' nuovo
per primo), perche' i suoi schemi parlano di «ultimi 15/30» e leggono un PREFISSO degli array. Sostituirla
con `cronologico` romperebbe la semantica di quegli schemi: va adattata a mano, insieme al resto.
---

COMPLETATO il 16/10/2026. **Tutte e nove le copie di `storia(u)` sono sparite**: le nove che restano in
`graph/measure/` sono wrapper di 8-11 righe su `canon.storia_trakt`, e l'unico posto in tutto il modulo
che legge `last_watched_at` e' `canon.py` (riga 133). Verificato col grep, non a memoria.

    prima:  9 copie, ~230 righe, ognuna con la sua lettura dei JSON di Trakt e `pd.Timestamp`
            chiamato DENTRO il ciclo per ogni titolo di ogni utente
    dopo:   9 wrapper, ~90 righe, e i banchi girano 2-3 volte piu' veloci (`pesi.py` 130 s -> 65 s)

E NON ERANO COPIE IDENTICHE, come il ticket diceva. Il lavoro per file:
 · TRE calcolano il peso INLINE con una formula propria, che e' il motivo per cui esistono
   (`alfa` e `soglia`: recenza x ri-visioni; `lettura`: la stessa con emivita in ANNI): la formula e'
   rimasta identica, ricostruita dall'eta' che `storia_trakt` restituisce. Erano i casi da non toccare.
 · CINQUE non ordinavano AFFATTO, quindi il loro ordine era quello del file: prima tutti i film, poi
   tutte le serie — **il bug del ticket 01, dentro i banchi che misuravano il taglio passato/futuro**.
 · `equilibrio` voleva solo righe e plays, `liste` tre colonne, `pesi` l'ordine di RECENZA (preservato:
   il suo consumatore riordina comunque da solo, quindi doveva dare gli stessi numeri — e li da').

VERIFICHE END-TO-END, rilanciando i banchi:
 · `equilibrio.py` — **stessi numeri al decimale**: 67,2% -> 31,3% col peso SPEC, e 9,3% -> 5,2% sulla
   storia corta. Sono esattamente i valori scritti nella tabella dei parametri: la sostituzione e' fedele.
 · `pesi.py` — uniforme 14,72 -> 14,61 · ri-visioni 17,95 -> 18,06 · **lineare 21,16 identico** ·
   **SPEC 16,75 identico** · nullo 1,38 identico · «15 a caso» 68,91 -> 60,55. Le conclusioni reggono;
   l'ultima riga si muove perche' pesca per POSIZIONE e l'ordine (ora `stable`) e' cambiato.

E UN RITROVAMENTO NUOVO, trovato dal contratto mentre verificavo: **lo split temporale puo' essere
DEGENERE**. Su un utente vero l'eta' mediana dei semi e quella dell'oro sono uguali (2196 e 2196): le date
sono tutte identiche — un import massivo su Trakt — e quindi non c'e' un passato e un futuro da separare.
Il contratto `assert_split_temporale` ora controlla l'INVERSIONE (il passato piu' giovane dell'oro) e non
la parita', e `pesi.py` **salta** quegli utenti dichiarandolo nel conteggio («saltati per storia senza
tempo: N»), perche' un salto silenzioso e' esattamente la classe di bug che questo modulo combatte.
