# bolle-nitrile — riparare la COSTRUZIONE delle bolle

Aperta il 14/10/2026. Nasce da una critica al codice, non da un'idea nuova: la seconda risposta
dell'esperto (`blank.pdf`, `Ottimizzazione e Futuro del Grafo YACA`, ri-esportata dopo due scambi)
ha letto `canone.py` e `07-componenti.py` riga per riga e ha indicato **quattro difetti meccanici**
nella matrice che diamo a Leiden, più **nove interventi** e un banco di validazione.

Verificati da me contro il codice: **tutti**. E uno dei quattro l'avevo **già trovato** nel ticket 05
di `grafo-servibile` — c'è il commento in `05-diagnostiche.py:186` — **e non l'ho propagato a chi
costruisce le bolle**.

## Destination

Le bolle devono diventare **nitide da leggere**: un mondo nominabile per bolla, gli intrusi fuori,
le nicchie delicate intatte. Non «più bolle» e non «modularità più alta» — quelli sono gli
indicatori che ci hanno tradito **quattro volte su quattro** (`grafo-servibile`, ticket 05, 07, 08
e il conteggio in generale).

Il giudice è **la lettura di 20 titoli sentinella, prima e dopo** — resa ripetibile dal ticket 01.
Gli indicatori strutturali si registrano **come secondari**, e se contraddicono la lettura vince
la lettura.

Etichetta di lavoro (dall'esperto, e ci sta): *«i triangoli non mentono mai»*.

## Decisioni prese

| | |
|---|---|
| **Il primo ticket è lo strumento, non il rimedio** | senza il banco sonda non saprei dire se un intervento migliora: è l'errore che ci ha fatto sbagliare quattro volte |
| **I tre difetti senza parametri si applicano e basta** | `n_iterations=-1`, la simmetrizzazione e lo shrinkage L2 non sono scelte: sono correzioni di bug. Non si «provano», si correggono |
| **`canone.py` NON si tocca** | è la canonica, e i numeri di `grafo-servibile` (21, 24) dipendono da com'è. Le funzioni nuove vivono **accanto**, in `bolle.py` |
| **La lettura vince sugli indicatori** | quarta volta che lo scriviamo, ed è la regola che ci ha salvato nell'08 |
| **La potatura al nucleo NON dissolve bolle** | è la differenza esplicita rispetto al ticket 08, che aveva distrutto mondi nominabili. Qui si espellono i parassiti, non si sciolgono le bolle |
| **`LIST` si prova QUI e non nel recupero** | nel recupero abbassava la coda perché copre il 14,8% del catalogo. Nelle bolle il difetto non c'è: le liste Trakt **sono già** cluster curati a mano. Non l'avevamo mai provato |

## Non ancora specificato

- **Se la partizione nuova entra in produzione**: la mappa (`grafo-servibile` ticket 12) è costruita
  sulla partizione vecchia. Va ricostruita (ticket 10) e poi **riletta**.
- **Se il recupero ne beneficia**: no — il recupero **non usa le bolle** (la camminata gira sul
  grafo). Le bolle servono ai **caroselli** e agli slot della mappa. Chi se lo aspetta sbaglia.
- **Quanti interventi sono troppi**: se sei interventi si sommano e il canary peggiora, non sapremo
  quale ha fatto male. Il ticket 02 li applica in blocco (sono correzioni), gli altri **uno alla
  volta cumulativamente**, e il canary li separa.

## Fuori scope

- **Il recupero** (`grafo-servibile` 21/24): la ricetta finale è decisa lì e non si tocca qui.
- **La curatela come supervisione** (ticket 19 di `grafo-servibile`): +8,38 al @500, resta.
- **Il bridge film↔serie**: è un problema di catalogo servito, non di bolle.
- **La gerarchia a tre livelli**: il ticket 11 di `grafo-servibile` l'ha dichiarata impossibile sulla
  sparsificazione. Qui non si riapre.
- **YACA in produzione**: `src/` non si tocca. Mai.
