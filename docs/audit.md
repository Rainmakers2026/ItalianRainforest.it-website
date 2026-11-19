# Phase 0 — Audit (22/10/2026)

Fonti analizzate: sito legacy `italian-innovation-map.vercel.app` (IT/EN, embed), sito Rainmakers (`rainmakers-cs7ixhvw2-rainmakers3.vercel.app/it`), presentazione `260126_IRF_Overview.pdf`, 4 immagini di riferimento, PRD "Italian Rainforest 2.0".

## 1. Sorgente dati legacy

| Voce | Esito |
|---|---|
| Dove sono i dati | I record Airtable grezzi sono **embedded nel payload RSC** della pagina legacy (prop `records`). Esiste anche una shared view pubblica Airtable (`appclGHOJ6BcDnXoS / shr9H8maUkI7SHoYu`) usata come iframe. |
| Accesso usato | Solo **GET** pubblici. Nessuna chiamata di scrittura, nessun token. (Snapshot legacy sostituito il 16/11/2026 dal database IRF: vedi §4c.) |
| Record | **467** (412 attivi, 54 inattivi, 1 senza stato) → 464 dopo deduplica. |
| Colonne pubbliche | `Company Name`, `Status`, `Website`, `Countries of investment`, `Stage of Investment/Development`, `Hashtags`, `Account Type`, `Created`. **Solo queste 8.** |
| Geografia | **Assente.** Nessun campo città/regione/provincia/coordinate. Il filtro "Country" del legacy è in realtà *Countries of investment* (dove il player investe), non la sede. |
| Descrizioni, loghi, contatti | **Assenti** nella view pubblica. |
| "Ultimo aggiornamento" legacy | È la data del giorno di rendering, non una vera data di aggiornamento dati. |

### Qualità dati rilevata (gestita in `src/lib/data/normalize.ts`)
- Nomi con spazi/newline spuri (es. `"Hub 48                 Siglabile  Hub48 "`, `"Opengra    Del    3"`) → spazi collassati; i casi anomali restano da correggere a monte.
- Duplicati esatti: *Techbricks*, *Feedel Ventures* → deduplicati (stesso nome + stesso dominio).
- 25 record senza categoria → categoria **"Da classificare"** (non assegnata arbitrariamente).
- Tag sinonimi (`IA`/`AI`, `HealthCare`/`Healthcare`, `Internet Of Things`/`IOT`, `Decentralized Finance`/`DeFi`) → unificati; `TBD` rimosso.
- Siti con parametri di tracking o refusi (`www.wekancode.coom`) → normalizzati quando possibile; i refusi restano da correggere a monte.
- Stage numerati (`3. Early Revenue`) → chiavi canoniche ordinate.

## 2. Contenuti legacy da NON ripubblicare
- "Partner 1…4": segnaposto → sezione partner nascosta finché non arrivano loghi verificati.
- "Already featured in: TechCrunch, Wired, StartupItalia, Il Sole 24 Ore": nessuna fonte → sezione nascosta.
- Recensione "Community member / Innovation enabler": non verificabile → non pubblicata.
- "© Italian Rainforest. All rights reserved." contraddice la licenza copyleft → rimosso.

## 3. Rapporto Rainmakers ↔ Italian Rainforest
- Rainmakers: innovation advisor e open venture builder, Milano, dal 2011; "meaningful innovation". Nella sua architettura IRF è il ramo **Foundation / giveback**.
- Token brand Rainmakers rilevati: navy `#1b3a5c`, indigo/Savoia `#4b61d1`, periwinkle `#7b92e8`, cyan `#2596be`, deep `#0a1828`, font Roboto. Il sito Rainmakers è dark.
- Scelta: IRF condivide famiglia cromatica e tono, ma usa un sistema proprio (superfici chiare editoriali/dati, Manrope, metafora rete→nodi→radici), con "Un'iniziativa di Rainmakers" in hero, Who e footer.

## 4. Immagini (aggiornato su richiesta del cliente)
Si usano **esattamente le immagini fornite**, senza modifiche all'artwork (`npm run images:prepare <cartella>`):
| Immagine | Sezione | Trattamento |
|---|---|---|
| Albero luminoso (4.webp) | Perché | Copiata così com'è; bordi sfumati via CSS |
| Italia con i player (1.webp) | Come | Già trasparente, copiata così com'è |
| Ecosistema IT / EN (3.webp, 2.webp) | Per chi | Rimosso solo lo sfondo bianco esterno (flood fill dai bordi + color-to-alpha); cerchio centrale ed etichette intatti. Variante per lingua. |

Logo: è il marchio di rainmakers.it (stessa geometria, misurata su `/brand/logo-mark-white.png`) con il manico sostituito da tronco e radici. Usato in header, footer, favicon (`src/app/icon.svg`) e apple-icon.

## 4b. Player reali georeferenziati
10 player del dataset hanno indirizzo, coordinate e descrizione verificati su fonti pubbliche (`data/enrichment/verified-players.json`, con fonti e data di verifica): CDP Venture Capital, H-Farm, Cariplo Factory, I3P, PoliHub, LVenture Group, Italian Angels for Growth, Fondazione Toscana Life Sciences, Nana Bianca, Impact Hub Bari. Le posizioni dimostrative sono disattivate (`IRF_GEO_DEMO=false`): sulla mappa compaiono solo dati reali.

## 4c. Database IRF (16/11/2026)
Il dataset legacy e l’arricchimento editoriale sono stati sostituiti dall’export del database IRF (`data/source/irf-database.csv`, stesse colonne della base Airtable "Rainmakers OS"): **621 abilitatori unici** (export del 17/11/2026: 623 righe, 2 righe modello scartate), 15 tipologie di player, 522 loghi verificati (493 file unici), 469 player georeferenziati (371 da indirizzo, 70 da città, 28 da regione), 152 senza regione. Dettaglio e righe da correggere in [data-quality.md](data-quality.md); schema in [data-schema.md](data-schema.md).

## 5. Primo audit copy / SEO / GEO (pre-copy)
Problemi del copy legacy:
- H1 "The Italian Rainforest map and database" non contiene l'entità né l'intento ("ecosistema italiano dell'innovazione").
- Titoli "WHY we are doing it" in inglese anche nella versione italiana; traduzione EN letterale ("valorization", "self-aware").
- Nessuna definizione breve e citabile; numeri assenti dal testo (solo nella UI client-side).
- FAQ con 4 domande senza risposta indicizzabile.

Decisioni applicate:
- **H1 IT** "La mappa viva dell'ecosistema italiano dell'innovazione" / **EN** "The living map of Italy's innovation ecosystem": entità + cluster principale, senza keyword stuffing.
- **Definizione factual** in apertura della sezione Perché, con numeri live (organizzazioni attive, categorie) e autore (Rainmakers) — risposta diretta a *What is / Who created Italian Rainforest*.
- Sezione Cosa con **definizioni delle categorie + conteggi** server-rendered (risponde a *How are organizations categorized / How many*).
- FAQ da 11 domande (incluse tutte quelle del PRD §37/§48) con risposte complete, data di aggiornamento e numeri dinamici.
- Cluster coperti in modo naturale: ecosistema italiano dell'innovazione, venture capital, incubatori/acceleratori, business angel, investitori startup Italia, open innovation (EN: Italian innovation ecosystem, startup ecosystem Italy, venture capital Italy, incubators/accelerators).
- EN scritto in inglese internazionale (organisation/programme), non tradotto parola per parola.

## 6. Blocker (PRD §63) — da fornire, non inventati
1. **Airtable**: Base/Table/View read-only + PAT con solo `data.records:read`.
2. **Campi geografici** (Region, Province, City, Latitude, Longitude): senza questi la mappa usa posizioni dimostrative (`IRF_GEO_DEMO`).
3. Classificazione **campi pubblici vs sensibili** (oggi non esistono campi contatto).
4. Descrizioni IT/EN e loghi.
5. **Privacy policy definitiva** (oggi bozza `noindex`).
6. **Licenza esatta** (il legacy dice solo "copyleft, uso non commerciale").
7. **Destinazione lead/CRM** (`LEAD_WEBHOOK_URL`).
8. **Provider analytics**.
9. Press, testimonial e partner **verificati**.
10. **Dominio finale** (ipotesi `www.italianrainforest.it`).
11. Fuori scope di questa release (dalla presentazione): agente social, agente di popolamento DB, embed counter Sanarico, infografica periodica, newsletter.
