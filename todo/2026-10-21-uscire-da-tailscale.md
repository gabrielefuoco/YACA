# Uscire da Tailscale — piano e fatti misurati

> **Data**: 21/10/2026 · **Stato**: in attesa dell'acquisto del dominio · **Chi**: Gabriele
> **Origine**: il 20/10/2026 YACA non era raggiungibile dal telefono per un guasto transitorio della
> tailnet (si è risolto da solo). Il PC continuava a funzionare perché è sulla tailnet; il telefono,
> con Tailscale attivo ma bloccato, no.
>
> **Obiettivo dichiarato**: *«non voglio che YACA dipenda da Tailscale»* — e, più in generale, avere un
> **nome stabile** che sopravviva a qualunque cambio di infrastruttura sotto.

---

## 1. La situazione di partenza (verificata, non ricordata)

| fatto | valore | come è stato verificato |
|---|---|---|
| Unico ingresso pubblico | `https://mate.hyena-alphard.ts.net` via **Tailscale Funnel** (443 → `127.0.0.1:7860`; `/gym/` → `127.0.0.1:8090`) | `sudo tailscale funnel status` |
| `HOST_URL` dell'app | `https://mate.hyena-alphard.ts.net` (in `/srv/yaca/.env`) | `grep HOST_URL /srv/yaca/.env` |
| Il nome tailscale nel codice | **nessuno**: solo `.env` e la documentazione | `grep -rn "ts.net" --include=*.js` |
| IPv4 pubblico del mate | `5.88.203.93` — **vero**, non CGNAT (sarebbe 100.64/10) | `curl ifconfig.me` dal mate |
| Salute della tailnet | DERP raggiungibili (Francoforte ~? ms), `Health: []`, UDP ok | `tailscale netcheck`, `tailscale status --json` |
| Funnel raggiungibile dall'esterno | **sì**: un lettore server-side (`api.microlink.io`) ha aperto `/health` e letto il titolo | test esterno, 21/10 |
| Test «falsi negativi» | jina.ai e allorigins fallivano per motivi loro (browser headless, nginx 500); i miei test con `--resolve` all'IP pubblico erano **hairpin NAT** (il PC è sulla stessa LAN: `192.168.1.7`, gateway `192.168.1.1`) | — |

**Conclusione sul guasto**: non era YACA. Il telefono aveva Tailscale attivo ma la sessione/rete non
funzionava; il nome `*.ts.net` risolve al'IP tailnet e senza tunnel attivo non è raggiungibile. È la
**classe di guasto** che questa migrazione deve eliminare: oggi c'è un solo percorso, e quando quel percorso
si incaglia il servizio sparisce — anche se l'app è sana.

---

## 2. Cosa significa «non dipendere da Tailscale»

Tre livelli, in ordine di importanza:

1. **Un nome tuo** (`*.tuodominio`) che punta dove vuoi. È il livello che conta di più: con un nome tuo,
   cambiare infrastruttura in futuro **non tocca i client Stremio**.
2. **Un ingresso pubblico che non passa da un nodo di casa**. Tailscale Funnel dipende dal nodo `mate`
   essere online e registrato; se quel legame si rompe, il servizio sparisce.
3. **Tailscale resta utilissimo per l'accesso privato** (SSH, NAS, admin): non va buttato, va **tolto dal
   percorso pubblico**.

---

## 3. Le strade possibili

| # | strada | costo | porte aperte | IP di casa | chi vede il traffico | note |
|---|---|---|---|---|---|---|
| **A** | **Dominio + Cloudflare Tunnel** (`cloudflared` sul mate) | ~10-12 €/anno | **nessuna** | **nascosto** | Cloudflare (TLS termina lì) | consigliata |
| B | Sottodominio gratuito `*.duckdns.org` + port forward 443 + Caddy/Let's Encrypt | 0 | **443** | **esposto** | nessuno | dipende da router e ISP; DNS a un fornitore gratuito |
| C | Dominio + port forward 443 + Let's Encrypt | ~10-12 €/anno | **443** | **esposto** | nessuno | massima indipendenza, più lavoro di gestione |
| D | Restare su Tailscale + monitoraggio esterno | 0 | nessuna | nascosto | Tailscale | non risolve la dipendenza, mitiga il «non me ne accorgo» |

**Scelta presa**: **A** (dominio + Cloudflare Tunnel), con **B/C scartate** perché mettono l'IP di casa e il
router sulla frontiera senza un vantaggio concreto per un addon Stremio. **Tailscale resta** come accesso
privato e come rete di sicurezza durante la migrazione.

**Perché serve un dominio**: Cloudflare Tunnel senza dominio non dà un nome pubblico usabile (`*.cfargotunnel.com`
esiste ma non è pensato per i client finali). Il dominio è anche il pezzo che rende tutto il resto
sostituibile: comprato una volta, vale per tutte le app.

---

## 4. Il disegno dei nomi (una volta comprato `tuodominio`)

| nome | cosa serve | dove vive |
|---|---|---|
| `tuodominio` (apex) | il **portfolio**, pubblico | **Cloudflare Pages** (statico, gratis, veloce, **non tocca casa**) |
| `www.tuodominio` | redirect 301 → apex | Cloudflare |
| **`yaca.tuodominio`** | addon Stremio + dashboard | Tunnel → mate `127.0.0.1:7860` |
| `gym.tuodominio` | la palestra | Tunnel → mate `127.0.0.1:8090` |
| `app3.tuodominio` … | altre app personali | Tunnel, eventualmente con **Cloudflare Access** |
| `nas.tuodominio` | il NAS | **meglio solo tailnet**, non pubblico |

**Sottodomini, non percorsi**: la dashboard è un export statico di Next che presume di stare alla radice
(`/`); servirla su `/yaca/` richiederebbe `basePath` e la riscrittura dei riferimenti interni. Il
sottodominio non tocca una riga di codice. Le **path** restano identiche a oggi
(`/manifest.json`, `/`, `/api/...`): cambia **solo il nome host**.

---

## 5. Sicurezza: cosa è esposto, con le parole giuste

### Con il tunnel (strada A)

- **Nessuna porta aperta sul router**: `cloudflared` apre una connessione **solo in uscita**. Dall'esterno
  non c'è niente da scansionare.
- **Raggiungibile solo ciò che mappi**: `yaca.tuodominio` → `127.0.0.1:7860`. NAS, stampante, router e altri
  dispositivi **non sono raggiungibili**.
- **Cloudflare vede il traffico in chiaro** (termina il TLS). Per un addon Stremio e una dashboard personale
  è un compromesso accettabile; per dati sensibili no.

### Il rischio che vale in tutti i casi

**Non è la rete: è l'app.** Se YACA viene compromessa, l'attaccante è **dentro casa**: di default un
container esce NATtato dall'host e raggiunge `192.168.1.0/24` (NAS, router). **Questo vale anche oggi** con
Tailscale: cambia la porta d'ingresso, non cosa c'è dietro.

### Il segreto che è già pubblico

L'URL dell'addon **è** la credenziale:

```
https://yaca.tuodominio/:userHandle/:configVersion/manifest.json
```

Chi ha quel link legge i cataloghi di quel profilo (le scritture vogliono la sessione). Va trattato come una
password: non condividerlo, non metterlo in screenshot. Non peggiora con il dominio, ma non migliora
nemmeno — è il punto debole strutturale di ogni addon Stremio.

### Le quattro misure che rendono «abbastanza sicuro»

1. **Isolare il container dalla LAN**: regole `DOCKER-USER` (nftables/iptables) che permettono l'uscita
   verso internet e verso Mongo, e **bloccano** `192.168.1.0/24`. L'app non ha motivo di parlare col NAS.
2. **Segreti**: niente credenziali di NAS/router sul mate. Stato attuale: `.env` è `600 gabri`,
   `secrets/` è `700` — la forma è giusta, va rivisto il contenuto con questo criterio.
3. **Dominio**: **2FA + registrar lock** sull'account. Un dominio rubato è peggio di un server bucato:
   perdi tutti i nomi insieme.
4. **Cloudflare Access davanti alla dashboard** (login), lasciando pubblico **solo** l'endpoint dell'addon,
   che Stremio deve leggere senza autenticarsi. Più regole WAF/rate limit sull'hostname pubblico.

---

## 6. Il piano, quando si riprende (checklist)

1. **Comprare il dominio** (~10-12 €/anno): Cloudflare Registrar (prezzo di costo) oppure Porkbun/Namecheap.
   Poi mettere i DNS su **Cloudflare** (gratis) — serve per il Tunnel.
2. **2FA + registrar lock** sull'account, subito dopo l'acquisto.
3. **Installare `cloudflared` sul mate** come servizio systemd (`cloudflared service install <token>`),
   con un tunnel dedicato e le mappature:
   - `yaca.tuodominio` → `http://127.0.0.1:7860`
   - `gym.tuodominio` → `http://127.0.0.1:8090`
4. **Verificare** con un lettore esterno (microlink o simili) che l'hostname risponda **prima** di toccare
   l'app: non fidarsi dei test da dentro la LAN (hairpin NAT → falsi negativi, come il 21/10).
5. **Cambiare `HOST_URL`** nel `/srv/yaca/.env` e riavviare l'app (`docker compose up -d app`).
6. **Convivenza**: lasciare **acceso** il Funnel `*.ts.net` finché non sono stati riconfigurati tutti i
   client. Poi spegnerlo (`sudo tailscale funnel --https=443 off`) e valutare se rimuovere Tailscale del
   tutto (io consiglio di **tenerla** per SSH/NAS: non è nel percorso pubblico, è solo accesso privato).
7. **Riconfigurare i client Stremio** con il nuovo URL e il telefono.
8. **Le quattro misure** del §5, in un ticket a parte: isolamento LAN, Access, rate limit, revisione segreti.
9. **Portfolio**: caricarlo su Cloudflare Pages (o GitHub Pages) con il dominio apex. Non serve il mate.

### Da NON fare

- Port forwarding «tanto per provare»: apre una porta che poi resta.
- Mettere il portfolio sul server di casa: è statico, non ha senso esporre casa per servirlo.
- Spegnere il Funnel prima di aver migrato i client: si perde l'accesso senza avere il sostituto pronto.
- Fidarsi dei test di raggiungibilità fatti dalla LAN (hairpin NAT).

---

## 7. Domande aperte

- **Quale dominio** (estensione, registrar)? Da decidere al momento dell'acquisto.
- **Il portfolio** ha già una casa (GitHub Pages, Netlify)? Va solo spostato sotto il dominio.
- **Access sulla dashboard**: serve davvero un login per l'uso quotidiano, o si tiene pubblica come oggi e si
  protegge solo l'admin?
- **Altre app**: quali devono essere pubbliche, quali solo con login, quali solo tailnet?

---

## 8. Riferimenti nel repo

- `docs/DEPLOYMENT_HOME_SERVER.md` §0-bis — come si deploya oggi (app + grafo via immagini, frontend
  nell'immagine dal ticket 24), e il diagramma con Tailscale Funnel.
- `.scratch/righe-vive/map.md` — stato del cantiere di prodotto (chiuso il 20/10/2026).
- Il 20/10/2026 la produzione è stata esposta anche con **Cloudflare** in prova? No: solo Funnel. Il primo
  test esterno affidabile è stato `api.microlink.io`.
