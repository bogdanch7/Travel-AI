# Vola Travel AI — WhatsApp Travel Assistant

A WhatsApp-native AI travel assistant built for the Vola Travel AI Challenge. Supports trip planning, booking screenshot analysis, live flight pricing from vola.ro, and destination identification from images.

## Arhitectură

```text
WhatsApp Account (Group or DM)
    ↓
WhatsApp Bridge (whatsapp-web.js)
    ↓ POST /webhook
Fastify Server (Backend)
    ↓ parse + verify + group policy
Agent Orchestrator
    ↓ AI Provider (OpenAI GPT-4o)
    ├── get_trip_context / update_trip_context → Redis + Postgres
    ├── search_flights → Vola.ro API → normalize → cache
    ├── analyze_booking_image → Vision → extract + compare
    └── identify_destination_from_image → Vision → identify
    ↓ format response
Fastify Server (Response)
    ↓ POST /trimite-raspuns
WhatsApp Bridge (whatsapp-web.js)
    ↓
WhatsApp (Reply)
```

## Setup 

### Cerințe
- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- Redis (local sau cloud)
- PostgreSQL (local sau cloud)
- Un cont de WhatsApp (pentru scanat QR)
- OpenAI API key

### Instalare

```bash
git clone https://github.com/bogdanch7/Travel-AI.git
cd Travel-AI
pnpm install
Environment Variables

### Variabile de Mediu

Copiați `.env.example` în `.env` și completați valorile:

cp .env.example .env
```

| Variabilă | Descriere |
|---|---|
| `PORT` | Portul serverului (default: 3000) |
| `WHATSAPP_PROVIDER` | Setat pe `bridge` |
| `WHATSAPP_BRIDGE_URL` | URL-ul unde rulează bridge-ul (default: `http://localhost:3001`) |
| `OPENAI_API_KEY` | Cheia API OpenAI |
| `OPENAI_MODEL` | Modelul chat (default: `gpt-4o`) |
| `REDIS_URL` | String conexiune Redis |
| `DATABASE_URL` | String conexiune PostgreSQL |
| `VOLA_BASE_URL` | `https://www.vola.ro` |

### Pornire Proiect

Proiectul necesită două procese active:

1. **Pornire Bridge (WhatsApp Web):**
```bash
pnpm bridge
```
*Scanați codul QR care apare în terminal folosind aplicația WhatsApp de pe telefon.*

2. **Pornire Server Backend:**
```bash
pnpm dev
```

Serverul pornește la `http://localhost:3000`. Tabelele bazei de date sunt create automat la prima rulare.

## Funcționalități Demo

Trimite aceste mesaje către botul tău de WhatsApp:

**Planificare Călătorie:**
> "Vrem undeva cald în aprilie, 4 nopți, buget mediu, plecare din București"

**Prețuri Zboruri:**
> "Caută zboruri București - Barcelona, 15-19 aprilie, 2 persoane"

**Trip Check (Verificare preț):**
> [Trimite un screenshot cu o rezervare] + "E un preț bun?"

**Identificare Destinație:**
> [Trimite o poză cu un peisaj] + "Unde e asta? Pot zbura acolo din București?"

## Detalii Tehnice

### Sistem de Deduplicare
Folosim **Redis** pentru a asigura că fiecare mesaj este procesat o singură dată, chiar dacă WhatsApp re-trimite evenimentul (deduplicare pe ID și pe Hash de conținut).

### Gestionare Grupuri
Prin bridge-ul custom, asistentul poate participa real în grupuri, detectând mențiunile și gestionând conflictele de preferințe între mai mulți utilizatori.

## Limitări
- **Sesiune Bridge**: Necesită ca telefonul să aibă conexiune la internet ocazional pentru a menține sesiunea WhatsApp Web activă.
- **Vola.ro API**: Integrarea se bazează pe endpoint-uri de căutare publice; o cădere a site-ului vola.ro poate afecta rezultatele live.

