# Vola Travel AI — WhatsApp Travel Assistant

A WhatsApp-native AI travel assistant built for the Vola Travel AI Challenge. It supports trip planning, booking screenshot analysis, live flight pricing from vola.ro, and destination identification from images.

## Architecture

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

### Requirements

* Node.js ≥ 20
* pnpm (`npm install -g pnpm`)
* Redis (local or cloud)
* PostgreSQL (local or cloud)
* A WhatsApp account (for QR scan authentication)
* OpenAI API key

### Installation

```bash
git clone https://github.com/bogdanch7/Travel-AI.git
cd Travel-AI
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

| Variable              | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `PORT`                | Server port (default: 3000)                                        |
| `WHATSAPP_PROVIDER`   | Set to `bridge`                                                    |
| `WHATSAPP_BRIDGE_URL` | URL where the bridge is running (default: `http://localhost:3001`) |
| `OPENAI_API_KEY`      | OpenAI API key                                                     |
| `OPENAI_MODEL`        | Chat model (default: `gpt-4o`)                                     |
| `REDIS_URL`           | Redis connection string                                            |
| `DATABASE_URL`        | PostgreSQL connection string                                       |
| `VOLA_BASE_URL`       | `https://www.vola.ro`                                              |

### Running the Project

The project requires two active processes:

1. **Start the Bridge (WhatsApp Web):**

```bash
pnpm bridge
```

Scan the QR code shown in the terminal using the WhatsApp app on your phone.

2. **Start the Backend Server:**

```bash
pnpm dev
```

The server starts at `http://localhost:3000`. Database tables are created automatically on first run.

## Demo Features

Send the following messages to your WhatsApp bot:

**Trip Planning:**

> "We want somewhere warm in April, 4 nights, medium budget, departing from Bucharest"

**Flight Pricing:**

> "Search flights Bucharest - Barcelona, April 15-19, 2 passengers"

**Trip Check (Price Validation):**

> [Send a booking screenshot] + "Is this a good price?"

**Destination Identification:**

> [Send a landscape photo] + "Where is this? Can I fly there from Bucharest?"

## Technical Details

### Deduplication System

We use **Redis** to ensure each message is processed only once, even if WhatsApp re-sends the event (deduplication by message ID and content hash).

### Group Handling

Through a custom bridge, the assistant can actively participate in group chats, detect mentions, and handle preference conflicts across multiple users.

## Limitations

* **Bridge Session**: Requires the phone to be online occasionally to keep the WhatsApp Web session active.
* **Vola.ro API**: The integration relies on public search endpoints; if vola.ro is down, live results may be affected.

