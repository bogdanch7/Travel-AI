# Vola Travel AI — WhatsApp Travel Assistant

A WhatsApp-native AI travel assistant built for the Vola Travel AI Challenge. Supports trip planning, booking screenshot analysis, live flight pricing from vola.ro, and destination identification from images.

## Architecture

```
WhatsApp (Meta or Twilio)
    ↓ webhook (/webhook or /webhooks/twilio/whatsapp)
Fastify Server
    ↓ parse + verify + group policy
Agent Orchestrator
    ↓ AI Provider (OpenAI or Featherless.ai)
    ├── get_trip_context / update_trip_context → Redis + Postgres
    ├── search_flights → Vola.ro API → normalize → cache
    ├── analyze_booking_image → Vision → extract + compare
    └── identify_destination_from_image → Vision → identify
    ↓ format response
WhatsApp (Meta or Twilio) (reply)
```

**Tech Stack**: Node.js, TypeScript, Fastify, OpenAI, ioredis, pg, Playwright, pnpm

## Setup

### Prerequisites
- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- Redis (local or cloud)
- PostgreSQL (local or cloud)
- WhatsApp Business API account
- OpenAI API key

### Installation

```bash
git clone <repo-url>
cd vola-travel-ai
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `WHATSAPP_PROVIDER` | `meta` or `twilio` (default: `meta`) |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_API_TOKEN` | Meta WhatsApp Cloud API bearer token |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_NUMBER` | Twilio sandbox or approved number (e.g., `whatsapp:+14155238886`) |
| `TWILIO_WEBHOOK_BASE_URL` | Your public ngrok URL for signature validation |
| `OPENAI_API_KEY` | OpenAI or Featherless API key |
| `OPENAI_BASE_URL` | Custom base URL (e.g., `https://api.featherless.ai/v1`) |
| `OPENAI_MODEL` | Chat model (default: gpt-4o) |
| `OPENAI_VISION_MODEL` | Vision model (default: gpt-4o) |
| `REDIS_URL` | Redis connection string |
| `DATABASE_URL` | PostgreSQL connection string |
| `VOLA_BASE_URL` | Vola.ro base URL |
| `VOLA_SEARCH_CACHE_TTL` | Cache TTL in seconds (default: 300) |

### Local Development

**Start Redis:**
```bash
# Docker
docker run -d -p 6379:6379 redis:alpine

# Or use local Redis
redis-server
```

**Start PostgreSQL:**
```bash
# Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=vola_travel postgres:16-alpine

# Or use local Postgres
createdb vola_travel
```

**Run the server:**
```bash
pnpm dev
```

The server starts at `http://localhost:3000`. Database tables are auto-created on first run.

### Connecting the WhatsApp Webhook

#### Meta WhatsApp Cloud API
1. Set up a Meta Developer account and create a WhatsApp Business app.
2. Configure your webhook URL: `https://your-domain.com/webhook`.
3. Set the verify token to match `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` webhook field.

#### Twilio WhatsApp
1. Set up a Twilio account and go to the WhatsApp Sandbox.
2. Set the "When a message comes in" URL to: `https://your-domain.com/webhooks/twilio/whatsapp`.
3. Ensure `WHATSAPP_PROVIDER=twilio` in your `.env`.
4. (Optional) Set `TWILIO_VALIDATE_SIGNATURE=false` for easier local testing.

For local development, use [ngrok](https://ngrok.com/): `ngrok http 3000`.

### WhatsApp Provider Support Scope

| Capability | Meta Cloud API | Twilio |
|---|---|---|
| **Direct messages (DM)** | ✅ Full support | ✅ Full support |
| **Native group participation** | ✅ Supported via participant field | ❌ Not reliably supported |
| **Mention-based trigger** | ✅ Works in groups | ✅ Applied to all messages |

> **Note:** Twilio's WhatsApp Business Platform does not provide native support for real user-created WhatsApp groups. The bot cannot reliably join and respond inside normal WhatsApp groups as a participant through Twilio. Instead, this implementation uses **mention-based trigger detection** to satisfy the challenge requirement: *"only respond when tagged or clearly addressed."*
>
> In direct messages, the bot responds to every message. In group-like contexts (Meta provider), the bot responds only when explicitly mentioned (`@VolaBot`, `VolaBot`, `hey VolaBot`, etc.).

#### Testing Mention Detection

```bash
# Run the mention detection and group policy test suite
npx tsx tests/groupPolicy.test.ts
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check with Redis/Postgres status |
| `GET` | `/webhook` | WhatsApp webhook verification |
| `POST` | `/webhook` | Incoming WhatsApp messages |

## Demo Commands

Send these messages to your WhatsApp bot:

**Trip Planning:**
> "We want somewhere warm in April, 4 nights, not too expensive, flying from Bucharest"

**Flight Pricing:**
> "Find flights from Bucharest to Barcelona, April 15-19, 2 passengers"

**Trip Check:**
> [Send a booking screenshot] + "Is this a good deal?"

**Destination ID:**
> [Send a travel photo] + "Where is this? Can I fly there from Bucharest?"

## Deployment

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway up
```

### Render
1. Connect your GitHub repo
2. Set build command: `pnpm install && pnpm build`
3. Set start command: `pnpm start`
4. Add environment variables

## Limitations

- **Vola.ro integration**: The reverse-engineered API endpoints may change without notice. A deep-link fallback is provided when live data is unavailable.
- **WhatsApp group support**: Native group participation is only available via the Meta Cloud API. Twilio does not reliably deliver group messages. The bot uses mention-based trigger detection as a practical workaround (see [WRITEUP.md](WRITEUP.md) for details).
- **Session persistence**: Redis is used for short-term context; a Redis restart loses active sessions (Postgres has persistent history).
- **Rate limits**: No global rate limiter implemented — relies on per-request retry logic.
- **Processing timeout**: A 60-second overall timeout prevents the bot from hanging on slow API calls.
