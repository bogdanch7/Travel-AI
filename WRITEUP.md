# Vola Travel AI Challenge — Implementation Details & Fallback Architecture

## API Integration & Anti-Bot Protections

During the development of the Vola.ro data integration (`src/integrations/vola`), we successfully reverse-engineered the primary flight search API gateway (`api.ith.toys`). The standard browser request cycle involves:
1. `POST /gateway/discover` — passing origin, destination, dates, and luggage options to acquire a `discoveryId`.
2. `GET /gateway/discover/fetch/{discoveryId}` — polling the backend until the search status is `COMPLETED`.

However, Vola.ro correctly employs strict **Cloudflare Anti-Bot** protections (`___cf_bm`, JS challenges, forced interstitial pages, and rigorous TLS/header fingerprinting). As a result, direct server-to-server API calls (or even Node.js headless browser rendering via Playwright) frequently encounter `HTTP 403 Forbidden` responses.

### The Architectural Fallback (Challenge Requirement)

The Challenge Brief explicitly asks:
> *"What happens when vola.ro changes its API structure or rate-limits my requests? How do I prevent the agent from hallucinating flight prices? What's my fallback if live data fetching fails mid-conversation?"*

To directly address this product constraint, we implemented a **Hybrid Scraper & Deep-Link Fallback mechanism**.

Instead of hallucinating fake prices or allowing the bot to crash when Cloudflare blocks the API, `searchFlights.ts` catches the failure and degrades gracefully through two fallback layers.

**Example Fallback Flow:**
1. User requests flights `OTP` to `ATH` for `April 1st` to `April 5th`.
2. Bot attempts `POST /gateway/discover` and receives `403 Forbidden` from Cloudflare.
3. **Layer 1 Fallback (Playwright Scraper):** The bot instantly launches a headless Chromium instance, navigates to the dynamically generated Vola deep-link, bypasses basic anti-bot checks by rendering the DOM, and scrapes the live price (e.g., 150€).
4. **Layer 2 Fallback (Static Link):** If the scraper also times out or fails to parse the DOM, the bot falls back to the ultimate safety net:
   "I couldn't retrieve live flight prices at the moment. You can check current prices directly on vola.ro: [Click here to book](https://www.vola.ro/bilete-avion/otp-ath?from=2026-04-01&to=2026-04-05&adults=1)"

**Benefits of this approach:**
- **Zero Hallucination:** The agent explicitly admits it lacks live pricing.
- **Actionable UX:** The user receives a 1-click booking link with their dates/destinations pre-filled.
- **Resilience:** Protects the AI product from brittle backend UI/API changes.

---

## WhatsApp Group Constraint and Practical Workaround

### The Constraint

The Vola Travel AI Challenge expects the bot to participate in WhatsApp group conversations, responding only when explicitly tagged or clearly addressed. However, Twilio's WhatsApp Business Platform does **not** provide native support for real user-created WhatsApp groups. A Twilio WhatsApp business number cannot reliably:

- Join a normal WhatsApp group created by regular users
- Receive webhook deliveries for group traffic
- Act as a full participant alongside human group members

This is a documented platform limitation, not a bug in this implementation.

### The Workaround: Mention-Based Trigger Detection

Instead of pretending that Twilio supports full group participation, this implementation takes an honest, practical approach:

| Flow | Behavior |
|---|---|
| **Direct messages (1:1)** | Bot responds to every message — fully production-ready via Twilio |
| **Group-like contexts** | Bot responds only when explicitly mentioned (`@VolaBot`, `VolaBot`, `hey VolaBot`, etc.) |

The mention detection is implemented in `src/integrations/whatsapp/groupPolicy.ts` and provides:

- **`containsBotMention(text)`** — standalone reusable check for any bot mention pattern
- **`shouldRespondToMessage(message)`** — clean top-level trigger decision API
- **`evaluateGroupPolicy(message)`** — full policy evaluation with confidence scores, noise filtering, cooldowns, and cleaned text

### Why This Is the Right Approach

1. **Honesty over illusion**: We do not claim that Twilio supports features it does not. This avoids fragile hacks and misleading demo behavior.

2. **Challenge compliance**: The challenge requirement — *"do not reply to every message; only reply when explicitly tagged or clearly addressed"* — is directly satisfied by the mention-based trigger policy, regardless of the transport layer.

3. **Production stability**: Direct messaging via Twilio is fully functional and reliable. The mention detection logic is deterministic, tested, and easy to audit.

4. **Portable architecture**: The `groupPolicy.ts` module works identically with both Meta Cloud API (which does support real groups) and Twilio (where it applies to the DM flow). Switching providers requires no policy changes.

### What Is Real vs. Simulated

| Capability | Status |
|---|---|
| DM conversation via Twilio | ✅ Real, production-ready |
| Mention-based trigger detection | ✅ Real, deterministic, tested |
| Native WhatsApp group participation via Twilio | ❌ Not supported by platform |
| Native WhatsApp group participation via Meta Cloud API | ✅ Supported if configured |

