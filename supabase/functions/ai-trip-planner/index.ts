import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helper functions
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof str === 'string' && uuidRegex.test(str);
}

function isValidDateString(str: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(str)) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

function sanitizeString(str: string, maxLength: number): string {
  if (typeof str !== 'string') return '';
  // Remove potentially dangerous characters and limit length
  return str.slice(0, maxLength).replace(/[<>{}]/g, '');
}

function validateTripInput(body: unknown): {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: number | null;
  preferences: string[];
} {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const data = body as Record<string, unknown>;

  // Validate tripId (required, UUID format)
  if (!data.tripId || !isValidUUID(String(data.tripId))) {
    throw new Error('Invalid or missing tripId');
  }

  // Validate destination (required, max 200 chars)
  if (!data.destination || typeof data.destination !== 'string' || data.destination.trim().length === 0) {
    throw new Error('Destination is required');
  }
  if (data.destination.length > 200) {
    throw new Error('Destination must be less than 200 characters');
  }

  // Validate startDate (required, YYYY-MM-DD format)
  if (!data.startDate || !isValidDateString(String(data.startDate))) {
    throw new Error('Invalid or missing startDate (format: YYYY-MM-DD)');
  }

  // Validate endDate (required, YYYY-MM-DD format)
  if (!data.endDate || !isValidDateString(String(data.endDate))) {
    throw new Error('Invalid or missing endDate (format: YYYY-MM-DD)');
  }

  // Validate date logic
  const startDate = new Date(String(data.startDate));
  const endDate = new Date(String(data.endDate));
  if (endDate < startDate) {
    throw new Error('End date must be after start date');
  }

  // Maximum trip duration: 90 days
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (durationDays > 90) {
    throw new Error('Trip duration cannot exceed 90 days');
  }

  // Validate travelers (optional, default 1, range 1-20)
  let travelers = 1;
  if (data.travelers !== undefined) {
    travelers = Number(data.travelers);
    if (isNaN(travelers) || travelers < 1 || travelers > 20 || !Number.isInteger(travelers)) {
      throw new Error('Travelers must be an integer between 1 and 20');
    }
  }

  // Validate budget (optional, positive number)
  let budget: number | null = null;
  if (data.budget !== undefined && data.budget !== null) {
    budget = Number(data.budget);
    if (isNaN(budget) || budget < 0 || budget > 100000000) {
      throw new Error('Budget must be a positive number');
    }
  }

  // Validate preferences (optional, array of strings, max 15 items, each max 50 chars)
  let preferences: string[] = [];
  if (data.preferences !== undefined) {
    if (!Array.isArray(data.preferences)) {
      throw new Error('Preferences must be an array');
    }
    if (data.preferences.length > 15) {
      throw new Error('Maximum 15 preferences allowed');
    }
    preferences = data.preferences
      .filter((p): p is string => typeof p === 'string')
      .map(p => sanitizeString(p, 50))
      .filter(p => p.length > 0);
  }

  return {
    tripId: String(data.tripId),
    destination: sanitizeString(String(data.destination), 200),
    startDate: String(data.startDate),
    endDate: String(data.endDate),
    travelers,
    budget,
    preferences,
  };
}

// Attempts to make common LLM "almost-JSON" outputs parseable.
// This is defensive: we still ask the model for strict JSON, but it can
// occasionally return arithmetic expressions or notes inside numeric fields.
function normalizeJsonText(input: string): string {
  let text = input;

  // Remove trailing commas before closing braces/brackets
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Remove control characters that break JSON.parse
  text = text.replace(/[\x00-\x1F\x7F]/g, '');

  // Only fix *very* safe arithmetic cases where the whole value is a pure expression.
  // Example: "estimatedCost": 230 * 6,
  text = text.replace(
    /:\s*(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)(?=\s*[\n,}\]])/g,
    (_m, a, b) => {
      const n = Number(a) * Number(b);
      return `: ${Number.isFinite(n) ? Math.round(n) : 0}`;
    }
  );

  // Strip parenthetical notes ONLY when they come after a number and before a separator.
  // Example: "estimatedCost": 2000 (Taxi...) ,
  text = text.replace(/:\s*(\d+(?:\.\d+)?)(?:\s*\([^)]*\))(?=\s*[\n,}\]])/g, (_m, num) => `: ${num}`);

  return text;
}

function extractJsonCandidate(text: string): string {
  const cleaned = text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response');
  }
  return cleaned.slice(start, end + 1);
}

async function callLovableAi(messages: Array<{ role: string; content: string }>, apiKey: string) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages,
      max_tokens: 8000,
      temperature: 0.2,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('Lovable AI error:', text);
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch (_e) {
    // Extremely defensive: gateway should return JSON, but if it doesn't, throw.
    throw new Error('Lovable AI gateway returned non-JSON response');
  }
}

async function repairJsonWithAi(rawContent: string, apiKey: string): Promise<string> {
  const repairPrompt = `You returned an itinerary but it was NOT valid JSON.

Fix it and return ONLY valid JSON (no markdown, no explanations).

Rules:
- Ensure the JSON is syntactically valid.
- All numeric fields must be plain numbers (no \"230 * 6\", no \"2000 (Taxi...)\", no extra commas).
- Keep the same structure and content as much as possible.

Here is the broken JSON to fix (verbatim):\n\n${rawContent}`;

  const repaired = await callLovableAi([{ role: 'user', content: repairPrompt }], apiKey);
  const content = (repaired as any).choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('No content found in AI repair response');
  }
  return content;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTHENTICATION ===
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.error('Invalid Authorization header format');
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token format' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Create client to verify user token
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // === INPUT VALIDATION ===
    let validatedInput;
    try {
      const body = await req.json();
      validatedInput = validateTripInput(body);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return new Response(JSON.stringify({ 
        error: validationError instanceof Error ? validationError.message : 'Invalid input' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { tripId, destination, startDate, endDate, travelers, budget, preferences } = validatedInput;

    // === AUTHORIZATION: Verify trip ownership ===
    const { data: trip, error: tripError } = await supabaseClient
      .from('trips')
      .select('user_id')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      console.error('Trip not found:', tripError?.message);
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (trip.user_id !== user.id) {
      console.error('Unauthorized access attempt: user', user.id, 'tried to access trip belonging to', trip.user_id);
      return new Response(JSON.stringify({ error: 'Unauthorized: You do not own this trip' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Planning trip:', { tripId, destination, startDate, endDate, travelers, budget, preferences: preferences.length + ' items' });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('Lovable AI API key not configured');
    }

    // Calculate trip duration
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Sanitize inputs for AI prompt
    const sanitizedDestination = sanitizeString(destination, 200);
    const sanitizedPreferences = preferences.map(p => sanitizeString(p, 50)).join(', ') || 'General sightseeing';

    // Create detailed prompt for AI trip planning
    const prompt = `Create a detailed travel itinerary for ${sanitizedDestination} from ${startDate} to ${endDate} (${durationDays} days) for ${travelers} ${travelers === 1 ? 'person' : 'people'}. ${budget ? `Budget: ₹${budget}.` : 'Budget is flexible.'} 

Traveler interests: ${sanitizedPreferences}

IMPORTANT: All costs and prices should be in Indian Rupees (₹). Use ₹ symbol for all monetary values.
CRITICAL JSON RULES:
- Return ONLY valid JSON (no markdown/code fences).
- All numeric fields MUST be plain numbers (e.g., 1380). Do NOT use expressions like "230 * 6".
- Do NOT add notes inside a numeric field like "2000 (Taxi...)" — put notes in a separate string field if needed.

${durationDays > 1 ? `CRITICAL: For multi-day trips (${durationDays} days), you MUST provide specific accommodation/lodge recommendations with:
- Name of each recommended lodge/hotel
- Location/area of the lodge
- Estimated cost per night in ₹
- Google Maps link for each accommodation (format: https://www.google.com/maps/search/?api=1&query=ACCOMMODATION_NAME+LOCATION)
- Brief description of amenities
These accommodations should fit within the budget of ₹${budget || 'flexible amount'}.` : ''}

Please provide a comprehensive itinerary that includes:
1. Daily activities and attractions with crowd size information
2. Restaurant recommendations for each meal
3. Transportation suggestions
4. Specific accommodation recommendations WITH Google Maps links (required for multi-day trips)
5. Budget breakdown (if budget provided)
6. Local tips and cultural insights
7. Weather considerations and best time to visit
8. Packing suggestions
9. Eco-friendly spots and sustainable travel options
10. Crowd size expectations for each attraction (Low/Medium/High)
11. Best times to visit specific attractions to avoid crowds
12. Google Maps link for each place/attraction (format: https://www.google.com/maps/search/?api=1&query=LOCATION_NAME)

CRITICAL: Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text. Start with { and end with }. Format the response as a detailed JSON object with the following structure:
{
  "overview": "Brief trip summary",
  "bestTimeToVisit": {
    "months": ["March", "April", "May"],
    "weather": "Pleasant weather with temperatures around 25-30°C",
    "crowdLevel": "Medium",
    "reason": "Ideal weather conditions with moderate tourist activity"
  },
  "ecoFriendlySpots": [
    {
      "name": "Location name",
      "description": "Why it's eco-friendly",
      "activities": ["Sustainable activity 1", "Activity 2"],
      "tips": "How to visit responsibly"
    }
  ],
  "dailyItinerary": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "time": "9:00 AM",
          "activity": "Activity name",
          "description": "Detailed description",
          "location": "Address or area",
          "estimatedCost": 50,
          "tips": "Local tips",
          "crowdSize": "Low/Medium/High",
          "bestTimeToAvoidCrowds": "Early morning or late afternoon",
          "isEcoFriendly": true
        }
      ],
      "meals": {
        "breakfast": { "restaurant": "Name", "cuisine": "Type", "estimatedCost": 20 },
        "lunch": { "restaurant": "Name", "cuisine": "Type", "estimatedCost": 30 },
        "dinner": { "restaurant": "Name", "cuisine": "Type", "estimatedCost": 50 }
      }
    }
  ],
  "accommodation": {
    "recommendations": [
      {
        "name": "Hotel/Lodge Name",
        "location": "Area/Address",
        "estimatedCostPerNight": 150,
        "description": "Brief description of amenities",
        "googleMapsLink": "https://www.google.com/maps/search/?api=1&query=HOTEL_NAME+LOCATION"
      }
    ],
    "areas": ["Best area 1", "Best area 2"],
    "ecoFriendlyOptions": ["Eco Hotel 1", "Sustainable Lodge 2"]
  },
  "transportation": {
    "recommendations": ["Metro", "Taxi", "Walking"],
    "estimatedDailyCost": 25,
    "ecoFriendlyOptions": ["Public transport", "Cycling", "Walking"]
  },
  "budgetBreakdown": {
    "accommodation": 1050,
    "meals": 700,
    "activities": 400,
    "transportation": 175,
    "total": 2325
  },
  "packingList": ["Item 1", "Item 2"],
  "localTips": ["Tip 1", "Tip 2"],
  "weather": "Weather expectations and clothing recommendations",
  "sustainabilityTips": ["Use reusable water bottles", "Choose local guides", "Respect local customs"]
}`;

    const data = await callLovableAi(
      [{
        role: 'user',
        content: `You are an expert travel planner with deep knowledge of destinations worldwide. Create detailed, practical, and personalized travel itineraries.\n\n${prompt}`,
      }],
      LOVABLE_API_KEY
    );
    console.log('Lovable AI response received');

     let itinerary;
     let rawContent: string | null = null;
    try {
      // Check for top-level error payloads from Lovable AI
      if ((data as any).error) {
        console.error('Lovable AI error payload:', (data as any).error);
        throw new Error((data as any).error.message || 'Lovable AI internal error');
      }

      // Check for error embedded in choices (rate limit errors can appear here)
      const choiceError = (data as any).choices?.[0]?.error;
      if (choiceError) {
        console.error('Lovable AI choice error:', choiceError);
        const rawMetadata = choiceError.metadata?.raw;
        if (rawMetadata) {
          try {
            const parsed = JSON.parse(rawMetadata);
            if (parsed.error?.status === 'RESOURCE_EXHAUSTED' || parsed.error?.code === 429) {
              throw new Error('AI service is temporarily busy. Please try again in a few minutes.');
            }
          } catch (e) {
            // Ignore parse errors for metadata
          }
        }
        throw new Error(choiceError.message || 'AI service error. Please try again.');
      }

       rawContent = (data as any).choices?.[0]?.message?.content;
      if (!rawContent || typeof rawContent !== 'string') {
        throw new Error('No content found in AI response');
      }

       // 1) Try parse as-is (with safe normalization)
       let jsonText = extractJsonCandidate(rawContent);
       jsonText = normalizeJsonText(jsonText);
       itinerary = JSON.parse(jsonText);
       console.log('Successfully parsed itinerary from AI response');
    } catch (parseError) {
       console.error('Itinerary parse error (first pass):', parseError);
       console.log('Raw response:', JSON.stringify(data, null, 2));
      
      // Check if it's a rate limit error we detected
      const errorMessage = parseError instanceof Error ? parseError.message : '';
      if (errorMessage.includes('temporarily busy') || errorMessage.includes('try again')) {
        // Return proper error response instead of fallback
        return new Response(JSON.stringify({ 
          error: errorMessage,
          success: false,
          retryable: true
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
       // 2) Second pass: ask the model to repair its own JSON
       try {
         if (!rawContent) throw new Error('Missing rawContent for repair');
         const repairedContent = await repairJsonWithAi(rawContent, LOVABLE_API_KEY);
         let repairedJsonText = extractJsonCandidate(repairedContent);
         repairedJsonText = normalizeJsonText(repairedJsonText);
         itinerary = JSON.parse(repairedJsonText);
         console.log('Successfully parsed itinerary after AI repair');
       } catch (repairError) {
         console.error('Itinerary repair failed:', repairError);
         // Store a retryable error and preserve the raw model output for inspection.
         itinerary = {
           error: 'AI returned an invalid itinerary format. Please tap Generate/Regenerate Itinerary to try again.',
           rawContent: rawContent || null,
         };
       }
    }

    // Update the trip using service role client for database update
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const nextStatus = itinerary?.error ? 'draft' : 'planned';

    const { error: updateError } = await supabaseAdmin
      .from('trips')
      .update({
        ai_itinerary: itinerary,
        status: nextStatus
      })
      .eq('id', tripId)
      .eq('user_id', user.id); // Extra safety: ensure we only update if user owns the trip

    if (updateError) {
      console.error('Supabase update error:', updateError);
      throw new Error(`Failed to update trip: ${updateError.message}`);
    }

    console.log('Trip updated successfully with AI itinerary');

    const success = !itinerary?.error;
    return new Response(JSON.stringify({
      success,
      itinerary,
      ...(success
        ? { message: 'Trip planned successfully with AI!' }
        : { error: itinerary.error, retryable: true }
      ),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in AI trip planner:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
