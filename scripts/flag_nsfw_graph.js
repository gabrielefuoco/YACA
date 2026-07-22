const fs = require('fs');

const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

// Parole chiave trigger estreme (Estesa per futuri dump da 1M+ di film TMDB)
const BAD_KEYWORDS = [
    // --- ABUSI E VIOLENZA SESSUALE ---
    'rape', 'gang rape', 'statutory rape', 'male rape', 'rape and revenge', 'rape attempt',
    'sexual abuse', 'child abuse', 'child sexual abuse', 'sexual assault', 'sexual violence', 
    'sexual harassment', 'sexual torture', 'sexual predator', 'sexual murder', 'incest', 
    'mother son incest', 'father daughter incest', 'brother sister incest', 'pedophilia', 'pedophile',
    
    // --- PORNOGRAFIA E PROSTITUZIONE EXTREME ---
    'pornography', 'porn', 'child pornography', 'internet porn', 'hardcore', 'hardcore porn',
    'softcore', 'softcore porn', 'sex tape', 'snuff', 'snuff film', 'bestiality', 'necrophilia',
    'child prostitution', 'forced prostitution', 'illegal prostitution', 'prostitution', 'sex slavery',
    'sex trafficking', 'sexploitation', 'roman porno', 'pink eiga',
    
    // --- ESTREMISMI, GORE E TORTURA ---
    'torture porn', 'video nasty', 'snuff movie', 'sadism', 'masochism', 'sadomasochism', 
    'sadistic', 'extreme violence', 'dismemberment', 'castration', 'emasculation', 'mutilation',
    'evisceration', 'blood splatter', 'gore', 'splatter', 'school shooting', 'mass shooting',
    'animal abuse', 'animal cruelty',
    
    // --- CONTENUTI SESSUALI ESPLICITI (Opzionali se si vuole filtrare tutto l'R-Rated) ---
    'sex toy', 'bdsm', 'bondage', 'fetish', 'nymphomaniac', 'orgasm', 'masturbation', 
    'voyeurism', 'peeping tom', 'swingers', 'cuckold', 'brothel', 'strip club', 'stripper'
];

// Reset di tutti i flag nsfw
for (const [id, node] of Object.entries(graph.L1)) delete node.nsfw;
for (const [id, node] of Object.entries(graph.L2)) delete node.nsfw;
for (const [id, node] of Object.entries(graph.L3)) delete node.nsfw;
for (const [id, node] of Object.entries(graph.L4)) delete node.nsfw;

let flaggedL1 = 0;
let flaggedL2 = 0;
let flaggedL3 = 0;

// Propaga il flag NSFW dal basso verso l'alto (Fino a L3)
for (const [id, node] of Object.entries(graph.L1)) {
    if (node.keywords.some(kw => BAD_KEYWORDS.some(bad => kw.toLowerCase().includes(bad)))) {
        node.nsfw = true;
        flaggedL1++;
    }
}

for (const [id, node] of Object.entries(graph.L2)) {
    let hasNsfw = false;
    if (node.children_L1) {
        for (const child of node.children_L1) {
            if (graph.L1[child]?.nsfw) {
                hasNsfw = true;
                break;
            }
        }
    }
    if (hasNsfw) {
        node.nsfw = true;
        flaggedL2++;
    }
}

for (const [id, node] of Object.entries(graph.L3)) {
    let hasNsfw = false;
    if (node.children_L2) {
        for (const child of node.children_L2) {
            if (graph.L2[child]?.nsfw) {
                hasNsfw = true;
                break;
            }
        }
    }
    if (node.top_keywords.some(kw => BAD_KEYWORDS.some(bad => kw.toLowerCase().includes(bad)))) {
        hasNsfw = true;
    }
    
    if (hasNsfw) {
        node.nsfw = true;
        flaggedL3++;
        console.log(`L3 BANNATO DAL FUNNEL: ${node.ui_emoji} ${node.ui_name} (Medoid: ${node.medoid})`);
    }
}

fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
console.log(`\nGrafo aggiornato con successo!`);
console.log(`Statistiche BAN (NSFW):`);
console.log(`L1 flaggati: ${flaggedL1}`);
console.log(`L2 flaggati: ${flaggedL2}`);
console.log(`L3 flaggati: ${flaggedL3}`);
