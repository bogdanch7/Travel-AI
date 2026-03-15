// ─── Intent Categories ───────────────────────────────────────────────
export type Intent =
  | 'trip_planning'
  | 'flight_pricing'
  | 'trip_check'
  | 'destination_id'
  | 'small_talk'
  | 'unsupported';

// ─── WhatsApp Message ────────────────────────────────────────────────
export interface WhatsAppMessage {
  messageId: string;
  chatId: string;        // phone number or group ID
  senderId: string;      // individual sender phone
  senderName: string;
  timestamp: number;
  isGroup: boolean;
  /** Chat type discriminator: 'dm' for 1:1, 'group' for group chats, 'unknown' if undetermined */
  chatType: 'dm' | 'group' | 'unknown';
  text?: string;
  imageId?: string;      // media ID for images
  imageUrl?: string;     // downloaded URL
  imageMimeType?: string;
  mentions?: string[];   // mentioned phone numbers
  quotedMessageId?: string;
  /** True when the quoted message was authored by this bot */
  quotedMessageAuthorIsBot?: boolean;
}

// ─── Trip Context ────────────────────────────────────────────────────
export interface TripContext {
  chatId: string;
  origin?: string;
  destinations?: string[];
  departureDate?: string;
  returnDate?: string;
  passengers?: number;
  budget?: string;
  preferences?: Record<string, UserPreference>;
  flexibility?: string;
  baggage?: string;
  tripType?: 'one_way' | 'round_trip';
  notes?: string;
  lastUpdated: number;
}

export interface UserPreference {
  userId: string;
  userName: string;
  preferredDestinations?: string[];
  budget?: string;
  origin?: string;
  departureDate?: string;
  returnDate?: string;
  travelStyle?: string;       // e.g. "beach", "city break", "adventure"
  priority?: string;          // what matters most: "budget", "direct flights", "short travel time"
  notes?: string;
  updatedAt: number;
}

// ─── Group Conflict Detection ───────────────────────────────────────
export interface GroupConflict {
  field: string;              // which field conflicts: "budget", "destination", "dates", etc.
  positions: ConflictPosition[];
}

export interface ConflictPosition {
  userName: string;
  value: string;
}

// ─── Group Option (for structured multi-user replies) ───────────────
export interface GroupOption {
  label: string;              // "Option A", "Option 1"
  description: string;        // "Beach trip to Crete — fits Alice's budget"
  targetUsers: string[];      // which user(s) this option satisfies
  estimatedBudget?: string;
}

// ─── Flight Result (normalized) ─────────────────────────────────────
export interface FlightResult {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  priceAmount: number;
  currency: string;
  airline: string;
  stops: number;
  baggageIncluded: boolean;
  deeplinkOrReference: string;
  notes?: string;
}

// ─── Booking Extraction ─────────────────────────────────────────────
export interface BookingExtraction {
  travelType: 'flight' | 'hotel' | 'package' | 'unknown';
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  airline?: string;
  hotelName?: string;
  city?: string;
  totalPrice?: number;
  currency?: string;
  passengerCount?: number;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

// ─── Destination Identification ─────────────────────────────────────
export interface DestinationResult {
  likelyDestinationName: string;
  country: string;
  airportCodeIfKnown?: string;
  confidence: 'high' | 'medium' | 'low';
  alternates: Array<{
    name: string;
    country: string;
    airportCode?: string;
  }>;
  rationale: string;
}

// ─── Flight Search Params ───────────────────────────────────────────
export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  baggage?: string;
  flexibility?: string;
}

// ─── Conversation Turn ──────────────────────────────────────────────
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  intent?: Intent;
  toolsUsed?: string[];
}

// ─── Audit Entry ─────────────────────────────────────────────────────
export interface AuditEntry {
  correlationId: string;
  chatId: string;
  userId: string;
  intent: Intent;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolLatencyMs?: number;
  error?: string;
  timestamp: number;
}

// ─── Orchestrator Result ─────────────────────────────────────────────
export interface OrchestratorResult {
  response: string;
  intent: Intent;
  toolsUsed: string[];
}
