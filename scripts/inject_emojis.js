const fs = require('fs');
const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');

const emojiMap = {
    'pop': '🌟',
    'top': '🏆',
    'new': '🆕',
    'anime_shonen': '🔥',
    'anime_seinen': '🍷',
    'anime_shoujo': '🌸',
    'anime_slice': '☕',
    'anime_mecha': '🤖',
    'anime_isekai': '🌀',
    'anime_dark': '💀',
    'anime_action': '💥',
    'anime_sports': '🏐',
    'anime_classic': '📺',
    'anime_00s': '💿',
    'anime_movies': '🎥',
    'anime_kids': '🧸',
    'anime': '🏮',
    'nolan': '⏳',
    'tarantino': '🩸',
    'scorsese': '🔫',
    'spielberg': '🦖',
    'kubrick': '👁️',
    'villeneuve': '🏜️',
    'fincher': '🔦',
    'burton': '✂️',
    'wesanderson': '🎨',
    'lynch': '☕',
    'scott': '👽',
    'actor': '⭐',
    'brad_pitt': '👊',
    'de_niro': '🚕',
    'johnny_depp': '🏴‍☠️',
    'denzel': '👮',
    'nicolas_cage': '🔥',
    'ghibli': '🍃',
    'pixar': '🧸',
    'a24': '💎',
    'marvel': '🦸',
    'dc': '🦇',
    'blumhouse': '🔪',
    'dreamworks': '🐉',
    'disney': '🏰',
    'kdrama': '🫰',
    'asian_action': '🥋',
    'coreano': '🇰🇷',
    'nordic': '❄️',
    'spanish': '🇪🇸',
    'british': '🇬🇧',
    'bollywood': '🇮🇳',
    'french': '🇫🇷',
    'italian': '🇮🇹',
    'german': '🇩🇪',
    '80s': '📼',
    '90s': '💽',
    '00s': '💿',
    'oscar': '🥇',
    'cult': '🙌',
    'blockbusters': '🍿',
    'mindfuck': '🤯',
    'feel_good': '😊',
    'comedy': '😂',
    'horror': '👻',
    'scary': '😨',
    'slasher': '🪓',
    'zomb': '🧟',
    'whodunit': '🔎',
    'survival': '🏕️',
    'cyberpunk': '🤖',
    'romance': '💔',
    'heist': '💰',
    'true_story': '📖',
    'videogame': '🎮',
    'stand_up': '🎤',
    'musical': '🎵',
    'war': '🪖',
    'western': '🤠',
    'epic': '⚔️',
    'spy': '🕵️',
    'noir': '🚬',
    'space': '🚀',
    'scifi': '🛸',
    'disaster': '🌋',
    'martial': '🥋',
    'time_travel': '⏱️',
    'mafia': '🕴️',
    'fantasy': '🧙',
    'dystopia': '👁️‍🗨️',
    'politics': '🏛️',
    'superheroes': '🦸‍♂️',
    'nature': '🌿',
    'docs': '🌍',
    'crime': '🚨',
    'sports': '⚽',
    'music': '🎸',
    'food': '🍔',
    'history': '📜',
    'tech': '💻',
    'sagas': '💍',
    'miniseries': '📺',
    'anthology': '📦',
    'sitcom': '🛋️',
    'medical': '🩺',
    'teen': '🎒',
    'legal': '⚖️',
    'thriller': '😱',
    'action': '💥',
    'hbo': '📺',
    'netflix': 'N',
    'amazon': 'A',
    'apple': '🍎',
    'paramount': '🏔️',
    'hulu': '🟩',
    'vampires': '🧛',
    'giant_monsters': '🦖',
    'family': '👨‍👩‍👧‍👦',
    'kids': '🧸',
    'fairy_tales': '🧚',
    'animal': '🐾'
};

function getEmojiForId(id) {
    for (const [key, emoji] of Object.entries(emojiMap)) {
        if (id.includes(key)) return emoji;
    }
    return '🎬';
}

let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes('{ id:') && !line.includes('emoji:')) {
        const idMatch = line.match(/id:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
            const id = idMatch[1];
            const emoji = getEmojiForId(id);
            // insert emoji right after name: '...'
            line = line.replace(/(name:\s*['"][^'"]+['"],)/, `$1 emoji: '${emoji}',`);
            lines[i] = line;
        }
    }
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Emojis injected successfully.');
