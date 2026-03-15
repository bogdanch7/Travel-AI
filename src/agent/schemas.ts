import { z } from 'zod';

/** Schema for search_flights tool arguments */
export const searchFlightsArgsSchema = z.object({
  origin: z.string().min(2).max(50),
  destination: z.string().min(2).max(50),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.number().int().min(1).max(9).optional().default(1),
  baggage: z.string().optional(),
  flexibility: z.string().optional(),
});

/** Schema for get_trip_context tool arguments */
export const getTripContextArgsSchema = z.object({
  chatId: z.string().min(1),
});

/** Schema for update_trip_context tool arguments */
export const updateTripContextArgsSchema = z.object({
  chatId: z.string().min(1),
  origin: z.string().optional(),
  destinations: z.array(z.string()).optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  passengers: z.number().optional(),
  budget: z.string().optional(),
  flexibility: z.string().optional(),
  baggage: z.string().optional(),
  tripType: z.enum(['one_way', 'round_trip']).optional(),
  notes: z.string().optional(),
});

/** Schema for analyze_booking_image tool arguments */
export const analyzeBookingImageArgsSchema = z.object({
  imageUrl: z.string().min(1),
});

/** Schema for identify_destination_from_image tool arguments */
export const identifyDestinationArgsSchema = z.object({
  imageUrl: z.string().min(1),
});

/** Schema for update_user_preference tool arguments (group chats) */
export const updateUserPreferenceArgsSchema = z.object({
  chatId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  preferredDestinations: z.array(z.string()).optional(),
  budget: z.string().optional(),
  origin: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  travelStyle: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
});

/** Schema for clear_trip_context tool arguments */
export const clearTripContextArgsSchema = z.object({
  chatId: z.string().min(1),
});


export type SearchFlightsArgs = z.infer<typeof searchFlightsArgsSchema>;
export type GetTripContextArgs = z.infer<typeof getTripContextArgsSchema>;
export type UpdateTripContextArgs = z.infer<typeof updateTripContextArgsSchema>;
export type AnalyzeBookingImageArgs = z.infer<typeof analyzeBookingImageArgsSchema>;
export type IdentifyDestinationArgs = z.infer<typeof identifyDestinationArgsSchema>;
export type UpdateUserPreferenceArgs = z.infer<typeof updateUserPreferenceArgsSchema>;
export type ClearTripContextArgs = z.infer<typeof clearTripContextArgsSchema>;

