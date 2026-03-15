# Vola Travel AI Challenge — Detalii Implementare & Arhitectură Bridge

## 1. Integrare API & Protecții Anti-Bot

În timpul dezvoltării integrării cu Vola.ro (`src/integrations/vola`), am reușit să gestionăm fluxul principal de căutare flights:
1. `POST /gateway/discover` — se obține un `discoveryId`.
2. `GET /gateway/discover/fetch/{discoveryId}` — polling până când statusul este `COMPLETED`.

Vola.ro folosește protecții **Cloudflare** avansate. Pentru a asigura stabilitatea, am implementat un sistem de fallback:
- **Fallback Deep-Link**: Dacă interogarea API eșuează sau este blocată, asistentul nu "halucinează" prețuri, ci oferă un link direct către Vola.ro cu toate criteriile deja completate pentru utilizator.

---

## 2. Arhitectura WhatsApp Bridge (Inovație)

### De ce un Bridge custom?
Provocarea majoră a fost suportul real pentru **grupuri WhatsApp**. API-urile oficiale (Meta Cloud API sau Twilio) au limitări mari pentru grupuri de utilizatori obișnuiți (necesită aprobări suplimentare, template-uri stricte și nu pot JOIN-ui grupuri spontane).

### Soluția: `whatsapp-web.js`
Am construit un bridge personalizat (`whatsapp-bridge.js`) care:
- **Emulează un client real**: Permite botului să vadă și să răspundă în orice grup în care este adăugat.
- **Deduplicare inteligentă**: Folosește Redis pentru a preveni procesarea dublă a mesajelor (cauzată de re-transmiterile automate ale bridge-ului).
- **Procesare Media**: Permite descărcarea instantanee a imaginilor pentru analizele Vision (Trip Check și Destination ID).

---

## 3. Logica de Grup & Politica de Detectare (Trigger)

Asistentul este programat să fie discret în grupuri. Logica din `groupPolicy.ts` asigură că acesta răspunde doar când:
1. Este menționat direct (`@VolaBot`).
2. I se răspunde la un mesaj anterior (Quoted Reply).
3. Este abordat direct prin nume în contextul unei întrebări de travel.

### Avantajele abordării noastre:
- **Zero Hallucination**: AI-ul este instruit să folosească mereu date reale sau să direcționeze utilizatorul către site.
- **Multilingvism**: Sistemul detectează automat limba (Română, Germană, Engleză) și ajustează tonul și salutul local.
- **Persistență**: Chiar dacă serverul repornește, contextul călătoriei este păstrat în PostgreSQL, permițând reluarea planificării.

---

## 4. Concluzie
Proiectul Vola Travel AI nu este doar un simplu chatbot, ci un ecosistem complet: un **Bridge de comunicare**, un **Orchestrator AI** și un **Adaptor de date travel**, toate integrate pentru a oferi cea mai naturală experiență de booking posibilă.
