Status: ready-for-agent
Type: task
Blocked by: —

# Lo scarto parla: il conteggio esiste già e viene buttato

## Il fatto

Il motore **sa** quanti semi ha scartato. Li conta, e poi butta il numero.

```python
# services/graph/runtime/engine.py:522-535
def _prepara_semi_vettore(self, semi):
    """Returns: (final_rows, final_pesi, semi_fuori_canone)."""
    ...
            semi_fuori_canone += 1
```

`_righe_da_chiavi` fa lo stesso (`engine.py:466-516`). Ma `esegui_scaffali` non legge quel terzo
valore: la risposta non lo contiene e i log non lo nominano. In produzione, un seme fuori canone
**sparisce senza lasciare traccia** — né quale titolo, né quanti.

Conseguenza pratica: oggi non sappiamo nemmeno *quanto spesso* succede. Il ticket 20 misura la
collocazione, ma prima serve sapere se il caso si presenta.

## Cosa fare

1. **Al punto di scarto, il nome.** `_parse_seme` ritorna `None` perdendo la chiave: va catturata
   prima, così il log può dire `movie:1266798`, non solo «1 scarto».
2. **Nel payload.** `esegui_scaffali` porta `semi_fuori_canone` nella risposta (`diagnostica` o
   accanto a `semi`), insieme alle chiavi scartate — così il lato Node può decidere se loggare.
3. **Nei log del servizio.** Una riga sola per richiesta, a `WARNING`, **solo se il conteggio è > 0**:
   niente rumore quando va tutto bene.
4. **Conteggio giornaliero.** Un contatore che si legge da `/health` (o riga di riepilogo periodica):
   quanti semi fuori canone al giorno, distinti fra film e serie.

## La prova che conta

- una richiesta con un film del 2026 **fuori canone** → una riga di log che nomina la chiave, e
  `semi_fuori_canone: 1` nella risposta;
- una richiesta con soli titoli in canone → **nessuna** riga di log, contatore invariato;
- il resto della risposta **identico** a prima (la modifica non tocca la diffusione: golden
  `0.000e+00`).

## Fuori scope

Nessuna collocazione, nessun artefatto nuovo, nessuna modifica a `vicini-top100`. Questo ticket
compra **visibilità**, non rimedio: se dopo una settimana il contatore dice zero, i ticket 20-22
hanno un motivo in meno per esistere.
