const fs = require('fs');

function run() {
    const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

    let md = '# Livelli L3 e L2 del Grafo\n\n';
    
    md += '## Livello L3 (12 Nodi)\n\n';
    for (const [id, data] of Object.entries(graph.L3 || {})) {
        const top = data.top_keywords.slice(0, 5).join(', ');
        md += `- **[${id}]**: ${top}\n`;
    }

    md += '\n## Livello L2 (563 Nodi)\n\n';
    md += '*(I nodi sono raggruppati per il loro genitore L3)*\n\n';

    for (const [l3Id, l3Data] of Object.entries(graph.L3 || {})) {
        md += `### Figli di L3 [${l3Id}] (${l3Data.top_keywords[0]})\n`;
        const children = l3Data.children_L2 || [];
        if (children.length === 0) {
            md += `- *Nessun figlio L2*\n`;
        } else {
            children.forEach(l2Id => {
                const l2Data = graph.L2[l2Id];
                if (l2Data) {
                    const top = l2Data.top_keywords.slice(0, 4).join(', ');
                    md += `- **[${l2Id}]**: ${top}\n`;
                }
            });
        }
        md += '\n';
    }

    fs.writeFileSync('./todo/L2_L3_List.md', md);
    console.log("Done");
}

run();
