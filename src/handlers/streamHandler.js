/**
 * streamHandler.js
 *
 * NOTA (01/10/2026). Questo handler esisteva per **una sola cosa**: alimentare il badge ITA.
 * Interrogava Torrentio (e ICV come ripiego), cercava parole chiave italiane nel nome dei torrent e
 * scriveva `streambadges` — **scartando gli stream**: restituiva sempre `{ streams: [] }`.
 *
 * Il badge ora nasce dalla colonna `ita`, cioè dalle annotazioni di `services/doppiaggi-source`
 * (mappa `.scratch/doppiaggio-ita`, ticket 04 e 06), quindi la sonda non ha più ragione di esistere:
 * non restituiva stream e non serviva a nient'altro. Toglierla toglie anche due richieste di rete per
 * ogni apertura di un titolo.
 *
 * Qui resta il guscio, che continua a rispondere `{ streams: [] }` **esattamente come prima**: la rotta
 * non cambia comportamento. Eliminare il file farebbe rispondere 500 dove oggi risponde vuoto, quindi
 * la sua eventuale rimozione è una decisione a sé, da prendere guardando la rotta.
 *
 * `TORRENTIO_URL` resta in `.env`: è la configurazione che servirebbe se un giorno YACA dovesse
 * restituire stream veri. Oggi non è letta da nessuno.
 */

/**
 * Guscio senza logica: lista vuota, come la versione con la sonda torrent.
 * @param {{id: string, type: string}} args
 * @param {object} userConfig
 * @returns {Promise<{streams: Array}>}
 */
async function streamHandler(args, userConfig) { // eslint-disable-line no-unused-vars
    return { streams: [] };
}

module.exports = { streamHandler };
