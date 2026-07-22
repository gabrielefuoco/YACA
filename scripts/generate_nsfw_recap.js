const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

let markdown = `# NSFW Ban Recap\n\n`;
markdown += `Questo documento elenca nel dettaglio tutto ciò che è stato "tagliato fuori" (bannato) dal Matchmaker ai livelli L1, L2 e L3 a causa della Blacklist Estrema.\n\n`;

markdown += `## 🔴 Livello L3 (Le Vibe Bannate dal Funnel)\n`;
markdown += `Questi cluster non appariranno **mai** tra le scelte dell'utente.\n\n`;
for (const [id, node] of Object.entries(graph.L3)) {
    if (node.nsfw) {
        markdown += `- **${node.ui_emoji} ${node.ui_name}** (\`${id}\`)\n`;
        markdown += `  - Medoid: \`${node.medoid}\`\n`;
        markdown += `  - Top 5 Keywords: ${node.top_keywords.slice(0,5).join(', ')}\n\n`;
    }
}

markdown += `---\n\n## 🟠 Livello L2 (I Sub-Cluster Infetti)\n`;
markdown += `Questi cluster intermedi sono stati infettati dai loro figli L1.\n\n`;
for (const [id, node] of Object.entries(graph.L2)) {
    if (node.nsfw) {
        markdown += `- **ID:** \`${id}\` | Medoid: \`${node.medoid}\`\n`;
        markdown += `  - Top 5 Keywords: ${node.top_keywords.slice(0,5).join(', ')}\n`;
    }
}

markdown += `\n---\n\n## 🟡 Livello L1 (Il Paziente Zero - Le singole Keyword)\n`;
markdown += `Questi sono i nodi radice (singole keyword e i loro sinonimi matematici) che contenevano la parola proibita e hanno innescato il contagio verso l'alto.\n\n`;

const BAD_KEYWORDS = [
    'rape', 'gang rape', 'statutory rape', 'male rape', 'rape and revenge', 'rape attempt',
    'sexual abuse', 'child abuse', 'child sexual abuse', 'sexual assault', 'sexual violence', 
    'sexual harassment', 'sexual torture', 'sexual predator', 'sexual murder', 'incest', 
    'mother son incest', 'father daughter incest', 'brother sister incest', 'pedophilia', 'pedophile',
    'pornography', 'porn', 'child pornography', 'internet porn', 'hardcore', 'hardcore porn',
    'softcore', 'softcore porn', 'sex tape', 'snuff', 'snuff film', 'bestiality', 'necrophilia',
    'child prostitution', 'forced prostitution', 'illegal prostitution', 'prostitution', 'sex slavery',
    'sex trafficking', 'sexploitation', 'roman porno', 'pink eiga',
    'torture porn', 'video nasty', 'snuff movie', 'sadism', 'masochism', 'sadomasochism', 
    'sadistic', 'extreme violence', 'dismemberment', 'castration', 'emasculation', 'mutilation',
    'evisceration', 'blood splatter', 'gore', 'splatter', 'school shooting', 'mass shooting',
    'animal abuse', 'animal cruelty',
    'sex toy', 'bdsm', 'bondage', 'fetish', 'nymphomaniac', 'orgasm', 'masturbation', 
    'voyeurism', 'peeping tom', 'swingers', 'cuckold', 'brothel', 'strip club', 'stripper'
];

for (const [id, node] of Object.entries(graph.L1)) {
    if (node.nsfw) {
        const offending = node.keywords.filter(kw => BAD_KEYWORDS.some(bad => kw.toLowerCase().includes(bad)));
        markdown += `- **ID:** \`${id}\` (Dimensione: ${node.keywords.length} keyword aggregate)\n`;
        markdown += `  - 🚨 **Trigger Trovati:** \`${offending.join(', ')}\`\n`;
        markdown += `  - Altre keyword nel nodo: ${node.keywords.filter(k => !offending.includes(k)).slice(0,5).join(', ')}...\n\n`;
    }
}

const outputPath = 'C:\\Users\\gabri\\.gemini\\antigravity\\brain\\a9f178ad-fbce-4d76-a6b0-8c429abfad3e\\nsfw_ban_recap.md';
fs.writeFileSync(outputPath, markdown);
console.log(`Recap salvato in ${outputPath}`);
