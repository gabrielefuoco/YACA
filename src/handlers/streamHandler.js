/**
 * Handler per l'endpoint di stream. 
 * Viene usato nativamente solo per il sistema "YACA Profiling Video Workaround".
 */

/**
 * Gestisce la logica di stream per Stremio.
 * Genera il finto stream che intercetta la selezione del profilo.
 *
 * @param {Object} args { type, id }
 * @param {Object} userConfig La configurazione dell'utente 
 * @param {string} hostUrl L'URL root host del servizio
 * @param {string} configVersion La versione della config (opzionale)
 */
async function streamHandler(args, userConfig, hostUrl, configVersion = '') {
    const { id } = args;

    if (id.startsWith('yaca-profile-')) {
        const profileId = id.replace('yaca-profile-', '');

        // Questo è il link magico che modificherà lo stato del server YACA e chiederà alla cache remota di syncarsi.
        const streamUrl = `${hostUrl}/api/users/${userConfig.userId}/switch-profile/${profileId}`;

        return {
            streams: [
                {
                    title: `\nAttiva questo profilo\nSync in background`,
                    url: streamUrl,
                    behaviorHints: {
                        notWebReady: false
                    }
                }
            ]
        };
    }

    // Rispondi vuoto per qualsiasi altra cosa
    return { streams: [] };
}

module.exports = { streamHandler };
