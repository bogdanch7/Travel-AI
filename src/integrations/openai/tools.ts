import OpenAI from 'openai';

/**
 * Tool definitions exposed to the OpenAI model.
 * These define what the AI agent can invoke.
 */
export const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_trip_context',
      description: 'Retrieve the current trip planning context for a chat. Returns existing preferences, destinations, dates, and user-specific notes.',
      parameters: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'The chat ID to retrieve context for',
          },
        },
        required: ['chatId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_trip_context',
      description: 'Update the trip planning context with new information extracted from the conversation. Use this to save destinations, dates, preferences, etc.',
      parameters: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'The chat ID to update context for',
          },
          origin: { type: 'string', description: 'Departure city or airport code. ALWAYS use the English name or IATA code (e.g. "Bucharest" or "OTP") even if the user writes in another language.' },
          destinations: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of potential destination cities. ALWAYS use the English names (e.g. "Madrid", "Sofia") even if the user writes in another language.',
          },
          departureDate: { type: 'string', description: 'Departure date in YYYY-MM-DD format' },
          returnDate: { type: 'string', description: 'Return date in YYYY-MM-DD format' },
          passengers: { type: 'number', description: 'Number of passengers' },
          budget: { type: 'string', description: 'Budget description (e.g. "under 200 EUR")' },
          flexibility: { type: 'string', description: 'Date flexibility (e.g. "+-3 days")' },
          baggage: { type: 'string', description: 'Baggage requirements' },
          tripType: { type: 'string', enum: ['one_way', 'round_trip'], description: 'Trip type' },
          notes: { type: 'string', description: 'Additional notes or preferences' },
        },
        required: ['chatId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description: 'Search for flights on vola.ro. Returns real-time pricing and availability. ALWAYS use this tool before presenting any flight prices or options to the user. Never fabricate flight data.',
      parameters: {
        type: 'object',
        properties: {
          origin: {
            type: 'string',
            description: 'Origin city or airport code. ALWAYS use the English name or IATA code (e.g. "Sofia" or "SOF") even if the user writes in another language.',
          },
          destination: {
            type: 'string',
            description: 'Destination city or airport code. ALWAYS use the English name or IATA code (e.g. "Milan" or "MIL") even if the user writes in another language.',
          },
          departureDate: {
            type: 'string',
            description: 'Departure date in YYYY-MM-DD format. IMPORTANT: Must be a future date (current year is 2026). Max 1 year in the future.',
          },
          returnDate: {
            type: 'string',
            description: 'Return date in YYYY-MM-DD format (omit for one-way). Must be after departureDate.',
          },
          passengers: {
            type: 'number',
            description: 'Number of passengers (default: 1)',
          },
          baggage: {
            type: 'string',
            description: 'Baggage requirements (e.g. "cabin_only", "checked")',
          },
          flexibility: {
            type: 'string',
            description: 'Date flexibility (e.g. "+-3 days")',
          },
        },
        required: ['origin', 'destination', 'departureDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_booking_image',
      description: 'Analyze a screenshot of a flight/hotel booking to extract key details and compare with current market prices. Use this when a user sends a booking screenshot for a "trip check".',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: {
            type: 'string',
            description: 'The base64 data URI or URL of the booking screenshot',
          },
        },
        required: ['imageUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'identify_destination_from_image',
      description: 'Identify the travel destination shown in a photo. Use this when a user sends a travel/landscape photo and wants to know the location or find flights there.',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: {
            type: 'string',
            description: 'The base64 data URI or URL of the travel image',
          },
        },
        required: ['imageUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_user_preference',
      description: 'Record or update an individual user\'s travel preferences in a group trip. Use this in group chats when a specific user states their preference (destination, budget, dates, travel style). This keeps preferences separate per user and enables conflict detection.',
      parameters: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'The group chat ID',
          },
          userId: {
            type: 'string',
            description: 'The user\'s unique ID',
          },
          userName: {
            type: 'string',
            description: 'The user\'s display name',
          },
          preferredDestinations: {
            type: 'array',
            items: { type: 'string' },
            description: 'User\'s preferred destinations',
          },
          budget: { type: 'string', description: 'User\'s budget (e.g. "under 300 EUR")' },
          origin: { type: 'string', description: 'User\'s preferred departure city' },
          departureDate: { type: 'string', description: 'User\'s preferred departure date (YYYY-MM-DD)' },
          returnDate: { type: 'string', description: 'User\'s preferred return date (YYYY-MM-DD)' },
          travelStyle: { type: 'string', description: 'Travel style preference (e.g. "beach", "city break", "adventure")' },
          priority: { type: 'string', description: 'What matters most (e.g. "budget", "direct flights", "short travel time")' },
          notes: { type: 'string', description: 'Any additional notes from the user' },
        },
        required: ['chatId', 'userId', 'userName'],
      },
    },
  },
];
