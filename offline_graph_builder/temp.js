
        let rawData = null;
        let graphData = null;
        let network = null;
        let edgeWeightMin = Infinity;
        let edgeWeightMax = -Infinity;
        
        let currentCenter = null;
        let currentLevel = 1; // 1=L1, 2=L2, 3=L3

        fetch('/src/data/hierarchical_graph.json')
            .then(response => {
                if(!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                rawData = data;
                
                // Convert to old format to reuse physics and UI logic
                graphData = {
                    cluster_adjacency: data.L1_adjacency || {},
                    cluster_members: {},
                    keyword_to_cluster: data.kw_to_L1 || {}
                };
                
                for(const id in data.L1) {
                    graphData.cluster_members[id] = data.L1[id].keywords;
                }

                for (const cId of Object.keys(graphData.cluster_adjacency)) {
                    for (const w of Object.values(graphData.cluster_adjacency[cId])) {
                        if (w < edgeWeightMin) edgeWeightMin = w;
                        if (w > edgeWeightMax) edgeWeightMax = w;
                    }
                }
                
                document.getElementById('info').innerHTML = `✅ Grafo Caricato: <b>${Object.keys(data.L1).length} L1</b> | <b>${Object.keys(data.L2).length} L2</b>`;
                document.getElementById('searchInput').value = 'space';
                searchKeyword();
            })
            .catch(err => {
                document.getElementById('info').innerHTML = `<span style="color:#f85149">❌ Errore caricamento grafo: ${err.message}</span>`;
                console.error(err);
            });

        function updateLevelIndicator() {
            let label = "L1 (Micro-Cluster)";
            if (currentLevel === 2) label = "L2 (Topos Narrativo)";
            if (currentLevel === 3) label = "L3 (Macro-Vibe)";
            document.getElementById('activeLevel').innerText = label;
        }

        function searchKeyword() {
            if(!graphData) return;
            const rawInput = document.getElementById('searchInput').value.toLowerCase().trim();
            if(!rawInput) return;

            const kws = rawInput.split(',').map(s => s.trim()).filter(s => s);
            const clusterIds = [];
            const validKws = [];
            
            for(const kw of kws) {
                const cId = graphData.keyword_to_cluster[kw];
                if(cId) {
                    clusterIds.push(cId);
                    validKws.push(kw.toUpperCase());
                } else {
                    alert(`Keyword '${kw}' non trovata nel grafo!`);
                }
            }

            if(clusterIds.length > 0) {
                currentLevel = 1;
                updateLevelIndicator();
                buildAndDraw(clusterIds, validKws);
            }
        }

        function navigateUp() {
            if (!currentCenter) return;
            if (currentLevel === 3) {
                alert("Sei già al vertice dell'albero (L3 Macro-Vibe)!");
                return;
            }

            let parentId = null;
            if (currentLevel === 1) {
                const cData = rawData.L1[currentCenter];
                if (cData && cData.parent) parentId = cData.parent;
            } else if (currentLevel === 2) {
                const tData = rawData.L2[currentCenter];
                if (tData && tData.parent) parentId = tData.parent;
            }

            if (parentId) {
                currentLevel++;
                updateLevelIndicator();
                drawLevelNode(parentId);
            }
        }

        function navigateDown() {
            if (!currentCenter) return;
            if (currentLevel === 1) {
                alert("Sei già al dettaglio massimo (L1 Micro-Cluster)!");
                return;
            }

            // Prendiamo il figlio più "pesante" o semplicemente il primo per fare drill-down
            let firstChild = null;
            if (currentLevel === 3) {
                for(const [tId, tData] of Object.entries(rawData.L2)) {
                    if (tData.parent === currentCenter) { firstChild = tId; break; }
                }
            } else if (currentLevel === 2) {
                for(const [cId, cData] of Object.entries(rawData.L1)) {
                    if (cData.parent === currentCenter) { firstChild = cId; break; }
                }
            }

            if (firstChild) {
                currentLevel--;
                updateLevelIndicator();
                if (currentLevel === 1) {
                    buildAndDraw([firstChild], rawData.L1[firstChild].keywords);
                } else {
                    drawLevelNode(firstChild);
                }
            }
        }

        function drawLevelNode(nodeId) {
            currentCenter = nodeId; // L2 o L3
            
            // Trova tutti gli L1 figli (ricorsivamente se è L3)
            let targetL1s = [];
            if (currentLevel === 2) {
                for(const [cId, cData] of Object.entries(rawData.L1)) {
                    if (cData.parent === nodeId) targetL1s.push(cId);
                }
            } else if (currentLevel === 3) {
                const tIds = [];
                for(const [tId, tData] of Object.entries(rawData.L2)) {
                    if (tData.parent === nodeId) tIds.push(tId);
                }
                for(const [cId, cData] of Object.entries(rawData.L1)) {
                    if (tIds.includes(cData.parent)) targetL1s.push(cId);
                }
            }

            // Usa la logica di Multi-Search (Super-Nodo) per unificare l'intero livello
            buildAndDraw(targetL1s, [nodeId.toUpperCase()]);
            currentCenter = nodeId; // Ripristiniamo perché buildAndDraw lo sovrascrive
        }

        function buildAndDraw(clusterIds, customLabels) {
            if(clusterIds.length === 1) {
                currentCenter = clusterIds[0];
                drawNetwork(clusterIds[0]);
            } else if (clusterIds.length > 1) {
                // Generazione Super-Nodo Virtuale (Vector Merge Simulation)
                const virtualId = "VIRTUAL_" + clusterIds.join('_');
                const combinedAdj = {};
                
                for (const cId of clusterIds) {
                    const adj = graphData.cluster_adjacency[cId] || {};
                    for (const [nId, weight] of Object.entries(adj)) {
                        if (clusterIds.includes(nId)) continue; // Evita loop interni al supernodo
                        
                        if (!combinedAdj[nId]) combinedAdj[nId] = 0;
                        combinedAdj[nId] += weight; // Somma vettoriale
                    }
                }
                
                // Inietta temporaneamente nel dataset
                graphData.cluster_members[virtualId] = [customLabels.join(' + ')];
                graphData.cluster_adjacency[virtualId] = combinedAdj;
                
                currentCenter = virtualId;
                drawNetwork(virtualId);
            }
        }

        function drawNetwork(centerNodeId) {
            const centerClusterIds = [centerNodeId];
            const nodesData = new Map(); 
            const edgesData = new Map(); 

            for(const cId of centerClusterIds) {
                nodesData.set(cId, { minDistance: 0, sources: new Set([cId]) });
            }

            const maxHops = 3;
            const branchingLimits = [15, 8, 4]; 

            // Esegue una BFS INDIPENDENTE
            for(const startCId of centerClusterIds) {
                let currentLevelSet = new Set([startCId]);
                for(let hop = 0; hop < maxHops; hop++) {
                    let nextLevel = new Set();
                    const limit = branchingLimits[hop];

                    for(const nodeId of currentLevelSet) {
                        const adj = graphData.cluster_adjacency[nodeId] || {};
                        const neighbors = Object.entries(adj).sort((a,b) => b[1] - a[1]).slice(0, limit);

                        for(const [nId, weight] of neighbors) {
                            if(!nodesData.has(nId)) {
                                nodesData.set(nId, { minDistance: hop + 1, sources: new Set() });
                            }
                            const nData = nodesData.get(nId);
                            nData.sources.add(startCId);
                            nData.minDistance = Math.min(nData.minDistance, hop + 1);

                            const edgeId = [nodeId, nId].sort().join('-');
                            if(!edgesData.has(edgeId)) {
                                edgesData.set(edgeId, { from: nodeId, to: nId, weight: weight, hop: hop });
                            } else {
                                edgesData.get(edgeId).hop = Math.min(edgesData.get(edgeId).hop, hop);
                            }

                            nextLevel.add(nId);
                        }
                    }
                    currentLevelSet = nextLevel;
                }
            }

            const nodes = [];
            const edges = [];
            const keptNodes = new Set();
            
            for(const [id, data] of nodesData.entries()) {
                const members = graphData.cluster_members[id] || [id];
                let label = members[0].toUpperCase();
                const isCenter = centerClusterIds.includes(id);
                const isMultiSearch = centerClusterIds.length > 1;
                const isIntersection = !isCenter && data.sources.size > 1;
                const isDust = isMultiSearch && !isCenter && !isIntersection;
                
                if (isDust && data.minDistance >= 2) continue;
                if (isDust) label = ''; 
                keptNodes.add(id);
                
                const titleElement = document.createElement('div');
                titleElement.innerHTML = `
                    <div style="padding: 10px; font-family: sans-serif; background: #161b22; color: #c9d1d9; border-radius: 8px; border: 1px solid #30363d;">
                        <b style="color: ${isIntersection ? '#e3b341' : '#58a6ff'}; font-size: 16px;">${members[0].toUpperCase()}</b><br>
                        <hr style="border-color: #30363d;">
                        <b>ID:</b> ${id}<br>
                        ${isIntersection ? `<b style="color:#e3b341">PONTE SEMANTICO:</b> Connesso a ${data.sources.size} nodi base.<br>` : ''}
                        <b>Keyword L0 incluse:</b><br>
                        <span style="color:#8b949e;">${members.join(', ')}</span>
                    </div>
                `;

                let bgColor, borderColor, size, fontCol, fontSize, strokeW, opac;
                const dist = data.minDistance;
                opac = isDust ? 0.15 : 1.0;
                
                if(isCenter) {
                    if (currentLevel === 1) { bgColor = `rgba(255, 71, 87, ${opac})`; borderColor = `rgba(255, 107, 129, ${opac})`; }
                    else if (currentLevel === 2) { bgColor = `rgba(31, 111, 235, ${opac})`; borderColor = `rgba(56, 139, 253, ${opac})`; }
                    else { bgColor = `rgba(227, 179, 65, ${opac})`; borderColor = `rgba(241, 224, 90, ${opac})`; }
                    size = 35 + (currentLevel * 10); 
                    fontCol = '#ffffff'; fontSize = 22; strokeW = 2;
                } 
                else if(isIntersection) {
                    bgColor = `rgba(227, 179, 65, ${opac})`; borderColor = `rgba(241, 224, 90, ${opac})`; size = 30; 
                    fontCol = '#000000'; fontSize = 20; strokeW = 3;
                }
                else {
                    size = isDust ? 10 : Math.max(10, 25 - (dist * 5));
                    fontCol = isDust ? 'rgba(255,255,255,0)' : '#ffffff'; fontSize = dist === 1 ? 16 : 12; strokeW = isDust ? 0 : 2;
                    if(dist === 1) { bgColor = `rgba(30, 144, 255, ${opac})`; borderColor = `rgba(112, 161, 255, ${opac})`; }
                    else if(dist === 2) { bgColor = `rgba(155, 89, 182, ${opac})`; borderColor = `rgba(175, 122, 197, ${opac})`; }
                    else { bgColor = `rgba(46, 213, 115, ${opac})`; borderColor = `rgba(123, 237, 159, ${opac})`; }
                }

                nodes.push({
                    id: id,
                    label: label,
                    title: titleElement,
                    color: {
                        background: bgColor,
                        border: borderColor,
                        highlight: { border: '#ffffff', background: bgColor }
                    },
                    font: {
                        color: fontCol, 
                        face: 'Segoe UI', 
                        size: fontSize,
                        strokeWidth: strokeW,
                        strokeColor: isIntersection ? '#ffffff' : '#000000',
                        bold: isIntersection || isCenter
                    },
                    shape: 'dot', 
                    size: size,
                    borderWidth: isCenter || isIntersection ? 4 : (isDust ? 1 : 2),
                    shadow: { enabled: !isDust, color: bgColor, size: isIntersection ? 15 : 10, x: 0, y: 0 } 
                });
            }

            const nodeEdgeRanks = new Map();
            const edgesByNode = new Map();
            for(const [edgeId, edgeInfo] of edgesData.entries()) {
                if (!keptNodes.has(edgeInfo.from) || !keptNodes.has(edgeInfo.to)) continue;
                for(const nodeId of [edgeInfo.from, edgeInfo.to]) {
                    if(!edgesByNode.has(nodeId)) edgesByNode.set(nodeId, []);
                    edgesByNode.get(nodeId).push({ edgeId, weight: edgeInfo.weight });
                }
            }

            for(const [nodeId, nodeEdges] of edgesByNode.entries()) {
                nodeEdges.sort((a, b) => b.weight - a.weight);
                const n = nodeEdges.length;
                nodeEdges.forEach((e, rank) => {
                    const t = n > 1 ? 1.0 - (rank / (n - 1)) : 1.0;
                    const prev = nodeEdgeRanks.has(e.edgeId) ? nodeEdgeRanks.get(e.edgeId) : 1.0;
                    nodeEdgeRanks.set(e.edgeId, Math.min(prev, t));
                });
            }

            for(const [edgeId, edgeInfo] of edgesData.entries()) {
                const isMultiSearch = centerClusterIds.length > 1;
                if (!keptNodes.has(edgeInfo.from) || !keptNodes.has(edgeInfo.to)) continue;

                const fromData = nodesData.get(edgeInfo.from);
                const toData = nodesData.get(edgeInfo.to);
                const fromDust = isMultiSearch && !centerClusterIds.includes(edgeInfo.from) && fromData.sources.size === 1;
                const toDust = isMultiSearch && !centerClusterIds.includes(edgeInfo.to) && toData.sources.size === 1;
                const isDustEdge = fromDust || toDust;

                const fromDist = fromData.minDistance;
                const toDist = toData.minDistance;
                const isCenterEdge = fromDist === 0 || toDist === 0;
                const isLateral = fromDist === toDist && !isCenterEdge;
                
                const tRaw = nodeEdgeRanks.get(edgeId) || 0;
                const t = Math.pow(tRaw, 2.5);
                
                let r, g, b, baseWidth;
                if (isCenterEdge) {
                    if (currentLevel === 1) { r=255; g=71; b=87; }
                    else if (currentLevel === 2) { r=31; g=111; b=235; }
                    else { r=227; g=179; b=65; }
                    baseWidth = 5.0;
                } else if (!isLateral && (fromDist === 1 || toDist === 1)) {
                    r=30; g=144; b=255; baseWidth = 3.0;
                } else if (!isLateral) {
                    r=155; g=89; b=182; baseWidth = 1.5;
                } else {
                    r=139; g=148; b=158; baseWidth = 0.3;
                }
                
                const opacity = (isDustEdge || isLateral) ? 0.02 : Math.max(0.10, t);
                const edgeWidth = (isDustEdge || isLateral) ? 0.1 : baseWidth * (0.15 + t * 0.85);
                
                const rgbaColor = `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(3)})`;
                
                edges.push({
                    from: edgeInfo.from,
                    to: edgeInfo.to,
                    title: `Peso: ${edgeInfo.weight.toFixed(2)} | Rango: ${t.toFixed(2)}`,
                    color: { color: rgbaColor, highlight: '#ffffff' },
                    width: edgeWidth,
                    smooth: false
                });
            }

            const container = document.getElementById('mynetwork');
            const dataObj = { nodes: nodes, edges: edges };
            const options = {
                physics: {
                    barnesHut: { 
                        springLength: 300,
                        springConstant: 0.03,
                        centralGravity: 0.05,
                        damping: 0.09,
                        avoidOverlap: 1
                    },
                    stabilization: { iterations: 150 }
                },
                interaction: { hover: true, tooltipDelay: 100 }
            };
            
            if(network) network.destroy();
            network = new vis.Network(container, dataObj, options);
            
            network.on("doubleClick", function (params) {
                if(params.nodes.length > 0) {
                    const clickedNode = params.nodes[0];
                    if (clickedNode.startsWith("VIRTUAL_")) return; // Cannot drill into virtual
                    currentLevel = 1;
                    updateLevelIndicator();
                    currentCenter = clickedNode;
                    const members = graphData.cluster_members[clickedNode] || [clickedNode];
                    document.getElementById('searchInput').value = members[0];
                    drawNetwork(clickedNode);
                }
            });
            
            network.on("hoverNode", function (e) { network.canvas.body.container.style.cursor = 'pointer'; });
            network.on("blurNode", function (e) { network.canvas.body.container.style.cursor = 'default'; });
        }
    