# Demo Script — Vola Travel AI

All 4 challenge capabilities + group chat conflict handling.

## Prerequisites

```bash
# Terminal 1: Start Redis + Postgres (via Docker or locally)
# Terminal 2: Start server
pnpm dev
# Verify
curl http://localhost:3000/health
```

Required `.env` vars: `OPENAI_API_KEY`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `DATABASE_URL`.

---

## 1. Trip Planning (DM)

User asks for travel suggestions → bot gathers preferences → searches flights.

```bash
# Step 1: User asks broad question
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m1", "from": "4412345678", "timestamp": "1710400000",
        "type": "text",
        "text": {"body": "Hi! We want somewhere warm in April, 4 nights, not too expensive, flying from Bucharest."}}]
    }}]}]
  }'
```

**Expected:** Bot saves context (origin: Bucharest, dates: April, 4 nights, budget: affordable), suggests 2–3 destinations with reasoning.

```bash
# Step 2: User picks a destination
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m2", "from": "4412345678", "timestamp": "1710400010",
        "type": "text",
        "text": {"body": "Barcelona sounds great. Can you search flights for April 15-19?"}}]
    }}]}]
  }'
```

**Expected:** Bot calls `search_flights(OTP, BCN, 2026-04-15, 2026-04-19)`, returns formatted flight options with prices from vola.ro, airline, stops, baggage, and booking link.

---

## 2. Flight Pricing

Direct flight price query → bot searches and returns results.

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m3", "from": "4412345678", "timestamp": "1710400020",
        "type": "text",
        "text": {"body": "How much are flights from Bucharest to Rome on April 20, returning April 24?"}}]
    }}]}]
  }'
```

**Expected:** Bot calls `search_flights(OTP, FCO, 2026-04-20, 2026-04-24)`, returns top 3 options sorted by price.

---

## 3. Trip Check (Booking Screenshot)

User sends a booking screenshot → bot extracts details → compares with live prices.

```bash
# Send image with caption (simulates image message)
# Note: In real WhatsApp, the bot downloads the image via getMediaUrl.
# Here we simulate with an image_id — the bot will attempt to download it.
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m4", "from": "4412345678", "timestamp": "1710400030",
        "type": "image",
        "image": {"id": "IMG_BOOKING_001", "mime_type": "image/jpeg",
          "caption": "Is this a good deal?"}}]
    }}]}]
  }'
```

**Expected:**
- Bot calls `analyze_booking_image` → extracts route, dates, price, airline, confidence
- If flight booking: automatically searches vola.ro for same route
- Returns comparison verdict: 💡 Better deal found / ✅ Good deal / 👍 Fair price

---

## 4. Destination Identification

User sends a travel photo → bot identifies the destination → offers to search flights.

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m5", "from": "4412345678", "timestamp": "1710400040",
        "type": "image",
        "image": {"id": "IMG_DESTINATION_001", "mime_type": "image/jpeg",
          "caption": "Where is this? Can I fly there from Bucharest?"}}]
    }}]}]
  }'
```

**Expected:**
- Bot calls `identify_destination_from_image` → returns destination name, country, airport code, confidence
- Shows alternates if confidence is not high
- Offers to search flights from user's origin

---

## 5. Group Chat — Multi-User Conflict Handling

### 5a. Bot ignores unaddressed messages

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m6", "from": "GROUP_001", "timestamp": "1710400050",
        "type": "text", "participant": "4412345678",
        "text": {"body": "Hey everyone, lunch at 1?"}}]
    }}]}]
  }'
```

**Expected:** Bot does NOT respond (no trigger, not mentioned).

### 5b. User A states preference via @mention

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m7", "from": "GROUP_001", "timestamp": "1710400060",
        "type": "text", "participant": "4412345678",
        "text": {"body": "@VolaBot I want a beach trip under 300 EUR from Bucharest in May"}}]
    }}]}]
  }'
```

**Expected:** Bot responds, uses `update_user_preference` to record Alice's preferences (beach, budget: 300 EUR, origin: Bucharest, dates: May).

### 5c. User B states conflicting preference

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "5598765432", "profile": {"name": "Bob"}}],
      "messages": [{"id": "m8", "from": "GROUP_001", "timestamp": "1710400070",
        "type": "text", "participant": "5598765432",
        "text": {"body": "@VolaBot I prefer a city break with direct flights, budget up to 600 EUR"}}]
    }}]}]
  }'
```

**Expected:**
- Bot records Bob's preferences separately (city break, budget: 600 EUR, priority: direct flights)
- Detects conflicts (budget, destination style, priority)
- Summarizes disagreements
- Presents 2–3 options:
  - Option A (fits Alice): beach in Antalya/Crete, ~250 EUR
  - Option B (fits Bob): city break in Vienna/Barcelona, ~400 EUR direct
  - Option C (compromise): Barcelona has both beach + city, ~350 EUR
- Asks group to vote

### 5d. Bot ignores noise during cooldown

```bash
# Right after the bot responded, send noise — should be ignored
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m9", "from": "GROUP_001", "timestamp": "1710400080",
        "type": "text", "participant": "4412345678",
        "text": {"body": "haha nice options"}}]
    }}]}]
  }'
```

**Expected:** Bot does NOT respond (noise filter + cooldown active).

### 5e. Quoted reply to bot message → responds

```bash
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "1234567890", "phone_number_id": "PH_ID"},
      "contacts": [{"wa_id": "4412345678", "profile": {"name": "Alice"}}],
      "messages": [{"id": "m10", "from": "GROUP_001", "timestamp": "1710400090",
        "type": "text", "participant": "4412345678",
        "context": {"from": "BOT_NUMBER", "id": "m8_reply"},
        "text": {"body": "What about Lisbon instead? Is it cheaper?"}}]
    }}]}]
  }'
```

**Expected:** Bot responds (quoted reply to a bot message, substantive question). Addresses Alice by name.

---

## Webhook Verification

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Expected: "test123"
```

## Health Check

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","redis":"connected","postgres":"connected"}
```
