const fs = require('fs');

const rawResponse = `{
  "m_0": {
    "name": "Giallo Criminale",
    "emoji": "🔪"
  },
  "m_1": {
    "name": "Dramma Familiare",
    "emoji": "👨‍👩‍👧"
  },
  "m_2": {
    "name": "Ambiente Estremo",
    "emoji": "🌍"
  },
  "m_3": {
    "name": "Corti Animati",
    "emoji": "🎨"
  },
  "m_4": {
    "name": "Drama Estremo",
    "emoji": "🔥"
  },
  "m_5": {
    "name": "Politica e Potere",
    "emoji": "⚖️"
  },
  "m_6": {
    "name": "Horror Demoniaco",
    "emoji": "👹"
  },
  "m_7": {
    "name": "Eroi Giapponesi",
    "emoji": "🦸"
  },
  "m_8": {
    "name": "Musica Live",
    "emoji": "🎤"
  },
  "m_9": {
    "name": "Regalità e Intrighi",
    "emoji": "👑"
  },
  "m_10": {
    "name": "Conflitti Sociali",
    "emoji": "⚠️"
  },
  "m_11": {
    "name": "Calcio Emozionante",
    "emoji": "⚽"
  },
  "m_12": {
    "name": "Psiche Oscura",
    "emoji": "🧠"
  },
  "m_13": {
    "name": "Giornalismo Audace",
    "emoji": "📰"
  },
  "m_14": {
    "name": "Viaggio On the Road",
    "emoji": "🚗"
  },
  "m_15": {
    "name": "Lavoro e Industria",
    "emoji": "🏭"
  },
  "m_16": {
    "name": "Amore per Lettere",
    "emoji": "✉️"
  },
  "m_17": {
    "name": "Feste e Dolci",
    "emoji": "🎂"
  },
  "m_18": {
    "name": "Portogallo in Commedia",
    "emoji": "🇵🇹"
  },
  "m_19": {
    "name": "Lotta alla Dipendenza",
    "emoji": "💉"
  },
  "m_20": {
    "name": "Avventura Australiana",
    "emoji": "🏜️"
  },
  "m_21": {
    "name": "Ricominciare in Belgio",
    "emoji": "🇧🇪"
  },
  "m_22": {
    "name": "Scrivere per Vivere",
    "emoji": "✍️"
  },
  "m_23": {
    "name": "Uguaglianza di Genere",
    "emoji": "🌈"
  },
  "m_24": {
    "name": "Segreti e Vendette",
    "emoji": "🗝️"
  },
  "m_25": {
    "name": "Amore e Rivalità",
    "emoji": "❤️"
  },
  "m_26": {
    "name": "Tempeste Scozzesi",
    "emoji": "🌩️"
  },
  "m_27": {
    "name": "Teatro Cinese",
    "emoji": "🎭"
  },
  "m_28": {
    "name": "Cinema del Futuro",
    "emoji": "🎥"
  },
  "m_29": {
    "name": "Cortometraggi",
    "emoji": "🎬"
  },
  "m_30": {
    "name": "Drama Estremo",
    "emoji": "🔥"
  },
  "m_31": {
    "name": "Mistero Russo",
    "emoji": "🇷🇺"
  },
  "m_32": {
    "name": "Storie dell'Orrore",
    "emoji": "👻"
  },
  "m_33": {
    "name": "Commedia Indonesiana",
    "emoji": "🇮🇩"
  }
}`;

const generatedData = JSON.parse(rawResponse);
const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

let count = 0;
for (const [m_id, res] of Object.entries(generatedData)) {
    if (graph.L4[m_id]) {
        graph.L4[m_id].ui_name = res.name;
        graph.L4[m_id].ui_emoji = res.emoji;
        console.log(`  - [${m_id}] ${graph.L4[m_id].medoid} -> ${res.emoji} ${res.name}`);
        count++;
    }
}

fs.writeFileSync(graphPath, JSON.stringify(graph));
console.log(`[DONE] Aggiornate con successo ${count} Macro-Vibes!`);
