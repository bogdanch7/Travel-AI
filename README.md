# Vola Travel AI – WhatsApp Travel Assistant with AI, Visual Analysis, and Flight Search Integration

This project is an AI-powered travel assistant built for the **Vola Travel AI Challenge**. It combines trip planning, live flight search, booking screenshot analysis, and conversational interaction directly inside WhatsApp, using a Node.js/TypeScript backend, OpenAI integration, and caching/persistence services.

---

## Features

- Trip planning through natural language directly in WhatsApp
- Live flight search using data from **Vola.ro**
- Booking screenshot analysis and comparison with live flight results
- Destination identification from images and related flight suggestions
- Support for both direct messages and group conversations through a custom WhatsApp bridge
- Trip context management for conversation continuity
- Caching and deduplication for safe and efficient message handling
- Context-aware AI responses based on both text and image inputs

---

## Components Used

- **WhatsApp Web Bridge (whatsapp-web.js)** – receives and sends WhatsApp messages
- **Fastify Server** – handles webhooks, backend logic, and responses
- **Agent Orchestrator** – coordinates AI flows and internal tools
- **OpenAI GPT-4o** – conversational reasoning and vision capabilities
- **Redis** – caching, quick context access, and deduplication
- **PostgreSQL** – persistence for conversation history and trip context
- **Vola.ro integration** – flight search and result normalization

---

## Technologies and Libraries

- Node.js
- TypeScript
- Fastify
- OpenAI API
- ioredis
- pg
- whatsapp-web.js
- pnpm

---

## How It Works

Messages are received from WhatsApp, processed through a custom bridge, and forwarded to the Fastify backend, which interprets the request and calls the AI components or internal tools as needed.

## Main Flow

- The user sends a text message or image through WhatsApp
- The WhatsApp bridge forwards the event to the backend
- The backend parses the message, verifies group policy, and checks existing context
- The Agent Orchestrator decides whether the request requires:
  - trip context retrieval or update
  - flight search
  - booking screenshot analysis
  - destination identification from an image
- The final response is generated and sent back to WhatsApp

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

Setup 

Requirements

Node.js ≥ 20

pnpm (npm install -g pnpm)

Redis (local or cloud)

PostgreSQL (local or cloud)

A WhatsApp account for QR-based authentication

OpenAI API key

Installation
git clone https://github.com/bogdanch7/Travel-AI.git
cd Travel-AI
pnpm install
Environment Variables

Copy .env.example to .env and fill in the required values:

cp .env.example .env
Variable	Description
PORT	Server port (default: 3000)
WHATSAPP_PROVIDER	Set to bridge
WHATSAPP_BRIDGE_URL	URL where the bridge is running (default: http://localhost:3001)
OPENAI_API_KEY	OpenAI API key
OPENAI_MODEL	Model used by the assistant (default: gpt-4o)
REDIS_URL	Redis connection string
DATABASE_URL	PostgreSQL connection string
VOLA_BASE_URL	Base URL for search (https://www.vola.ro)
Running the Project

The project requires two active processes:

Start the WhatsApp bridge

pnpm bridge

Scan the QR code shown in the terminal using the WhatsApp app on your phone.

Start the backend server

pnpm dev

The server starts by default at http://localhost:3000. Database tables are created automatically on first run.

Example Use Cases
Trip Planning

We want somewhere warm in April, 4 nights, medium budget, departing from Bucharest

Flight Search

Search flights Bucharest - Barcelona, April 15-19, 2 passengers

Trip Check

[Send a booking screenshot] + "Is this a good price?"

Destination Identification

[Send a landscape photo] + "Where is this? Can I fly there from Bucharest?"

Technical Details
Deduplication System

Redis is used to prevent the same message from being processed more than once, even if the event is re-sent by WhatsApp. Deduplication is based on both message ID and content hash.

Group Handling

Through the custom bridge, the assistant can actively participate in group chats, detect mentions, and manage different preferences across multiple users.

Context and Persistence

Redis is used for fast context access and caching

PostgreSQL is used for storing conversation history and longer-term trip context

Limitations

Bridge session: the phone must occasionally remain online to keep the WhatsApp Web session active

Vola.ro integration: flight search currently relies on public search flows, so changes on Vola’s side may affect reliability

Vision features: image identification and screenshot analysis depend on image quality and the context provided by the user

Screenshots / Demo

<img width="1375" height="743" alt="image" src="https://github.com/user-attachments/assets/4d4c6d3e-068f-4208-a745-fcda154f886b" />

Project created by bogdanch7

This project was created for educational and demonstration purposes as part of a hackathon.
