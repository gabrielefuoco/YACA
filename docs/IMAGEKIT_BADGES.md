# ImageKit Badge Implementation Guide (ID iyr3i5hd3)

Questa guida documenta l'integrazione di ImageKit per generare badge dinamici (es. numeri di episodio) sulle locandine TMDB, ottimizzata per l'account `iyr3i5hd3`.

## Logica di Implementazione

Per garantire massima compatibilità ed evitare errori "Invalid Transformation", utilizziamo una sintassi "blindata" basata su coordinate relative e chiusura esplicita dei layer.

### 1. Proxying tramite Path
Invece di usare parametri query, passiamo l'URL sorgente (TMDB) come parte del percorso URL di ImageKit.
- **Formato**: `https://ik.imagekit.io/<ID>/tr:<TRANSFORMATIONS>/https://image.tmdb.org/...`
- **Nota**: È fondamentale mantenere il protocollo `https://` completo per questo specifico account.

### 2. Posizionamento Relativo (`lx-N10`)
Invece di affidarci al posizionamento automatico (`fo-top_right`), utilizziamo coordinate manuali relative al bordo destro.
- **lx-N10**: Posiziona il layer a 10 pixel dal bordo destro (N = Negative offset from right).
- **Vantaggio**: Il badge rimane perfettamente allineato a destra indipendentemente dalla lunghezza del testo ("Ep 1" vs "S10 Ep 22").

### 3. Trasparenza Bilanciata (`bg-00000066`)
La trasparenza è ottenuta aggiungendo il canale Alpha (in esadecimale) al colore di sfondo.
- **Canale 66**: Corrisponde a circa il **40% di opacità** (60% trasparente).
- **Perché**: È la "via di mezzo" perfetta che garantisce leggibilità senza essere troppo scura o troppo evanescente.

## Parametri Utilizzati

| Parametro | Valore | Significato |
| :--- | :--- | :--- |
| `l-text` | - | Inizia un layer di testo. |
| `ie` | Base64 | Contenuto del testo (es. `UzEgRTU` = "S1 E5"). |
| `co` | FFFFFF | Colore del testo (Bianco). |
| `bg` | 00000066 | Sfondo nero con **40% alpha**. |
| `pa` | 10 | Padding interno (10px). |
| `r` | 10 | Bordi arrotondati (10px). |
| `lx` | N10 | 10px dal bordo **destro**. |
| `ly` | 10 | 10px dal bordo **superiore**. |
| `l-end` | - | **Chiusura obbligatoria** del layer (evita errori "Invalid"). |

## Codice di Riferimento

La logica principale risiede in `src/utils/imageProcessor.js`:

```javascript
const b64 = Buffer.from(text).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
transformations += `,l-text,ie-${b64},co-FFFFFF,bg-00000066,pa-10,r-10,lx-N10,ly-10,l-end`;
```

## Verifica
Per testare la generazione degli URL senza avviare il server:
```bash
node tests/verifyImageKit.js
```
