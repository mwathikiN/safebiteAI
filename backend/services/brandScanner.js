// services/brandScanner.js
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const z = require('zod');

// ---------------- Robust Output Schema ----------------
const DrinkAnalysisSchema = z.object({
  brandName: z.string().min(1, "brandName required"),
  productType: z.string().min(1, "productType required"),
  manufacturer: z.string().optional(),
  keyIngredients: z.array(z.string()).min(1, "at least one ingredient required"),
  expiryDate: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  confidenceScore: z.number().min(0).max(100),
  localizedAdvice: z.string().optional(),
  promotionalNote: z.string().optional()
});

// ---------------- Vertex AI Setup ----------------
const vertexAI = new VertexAI({
  project: 'workshop-genai-477501',
  location: 'us-central1'
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash-image' // multimodal capable
});

// ---------------- Helpers ----------------
function cleanJsonResponse(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove code fences and any language hints, then trim
  return text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

// Safely try multiple paths to get the model text
function extractModelText(response) {
  if (!response || typeof response !== 'object') return null;

  // Try known structures seen in logs
  try {
    // 1) Modern structure: candidates[0].content.parts[0].text
    const p1 = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (p1) return p1;

    // 2) Some SDKs produce content as an array: candidates[0].content[0].text
    const p2 = response?.response?.candidates?.[0]?.content?.[0]?.text;
    if (p2) return p2;

    // 3) Direct response object (already parsed JSON)
    const maybeObj = response?.response?.candidates?.[0]?.content?.parts?.[0];
    if (maybeObj && typeof maybeObj === 'object' && !maybeObj.text) {
      // sometimes content.parts[0] is already an object
      return JSON.stringify(maybeObj);
    }

    // 4) As a fallback, attempt to stringify a candidate content (last resort)
    const candidate = response?.response?.candidates?.[0];
    if (candidate) {
      // try to locate any text inside candidate recursively
      const seen = JSON.stringify(candidate);
      return seen;
    }
  } catch (err) {
    // ignore and return null below
  }

  return null;
}

// ---------------- Brand Scanner using Vertex ----------------
// Updated to accept mimeType
async function analyzeDrinkWithVertex(localFilePath, mimeType) {
  let aiErrorReason = null; // Variable to store specific API error reason

  try {
    const imgBuffer = fs.readFileSync(localFilePath);
    const imgBase64 = Buffer.from(imgBuffer).toString('base64');

    // --- Hardened Prompt ---
    const prompt = `
You are a professional food product label reader and safety analyst.

You MUST:
- Read all visible text from the label
- Detect brand, ingredients, expiry date and warnings
- NEVER return empty arrays
- NEVER return empty strings
- If unsure, make your BEST logical guess
- Always return at least one ingredient
- confidenceScore must be between 40 and 100

Return STRICT JSON ONLY:

{
  "brandName": "string",
  "productType": "string",
  "manufacturer": "string",
  "keyIngredients": ["string"],
  "expiryDate": "string",
  "warnings": ["string"],
  "confidenceScore": 40,
  "localizedAdvice": "string",
  "promotionalNote": "string"
}
`;

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imgBase64
              }
            }
          ]
        }
      ],
      // asking for JSON, but model may still return fenced JSON — we handle it
      config: { responseMimeType: 'application/json' }
    });

    // 🎯 Logging: Raw response (helps debug extraction path issues)
    console.log('--- RAW GEMINI RESPONSE START ---');
    console.log(JSON.stringify(response, null, 2));
    console.log('--- RAW GEMINI RESPONSE END ---');

    // 🎯 NEW ERROR CHECK: Extract detailed failure reason from the response if present
    const feedback = response?.response?.promptFeedback;
    if (feedback && (feedback.blockReason || feedback.safetyRatings)) {
      aiErrorReason = `API feedback: ${JSON.stringify(feedback)}`;
    } else if (response?.response?.candidates?.[0]?.finishReason
               && response.response.candidates[0].finishReason !== 'STOP') {
      aiErrorReason = `Generation stopped: ${response.response.candidates[0].finishReason}`;
    }

    // --- Extract text safely ---
    const rawTextCandidate = extractModelText(response);
    if (!rawTextCandidate) {
      aiErrorReason = aiErrorReason || 'No candidate text found in AI response';
    }

    const cleaned = rawTextCandidate ? cleanJsonResponse(rawTextCandidate) : '';

    // Try parsing JSON. The response might already be a JSON object string or raw JSON
    let parsed = null;
    try {
      // If cleaned looks like JSON object, parse it
      if (cleaned && (cleaned.trim().startsWith('{') || cleaned.trim().startsWith('['))) {
        parsed = JSON.parse(cleaned);
      } else {
        // Maybe the candidate was already an object serialized differently; try to eval-safe by JSON.parse fallback
        // Try to find a JSON snippet inside the string (regex) as a last resort
        const jsonMatch = cleaned.match(/\{[\s\S]*\}$/m);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (err) {
      console.error('❌ Vertex AI returned malformed JSON (parse error):', err.message);
      aiErrorReason = aiErrorReason || `Malformed JSON returned by AI: ${err.message}`;
      parsed = null;
    }

    // If parsed is null but response.response.candidates[0].content might already be an object:
    if (!parsed) {
      // attempt to see if any candidate content element is an object already (not a string)
      const candidateContent = response?.response?.candidates?.[0]?.content;
      if (candidateContent && Array.isArray(candidateContent)) {
        // search array for an object with fields matching our schema
        for (const el of candidateContent) {
          if (typeof el === 'object' && el !== null) {
            // try to use it directly if it looks like the payload
            if (el.brandName || el.productType || el.keyIngredients) {
              parsed = el;
              break;
            }
            // sometimes el.parts contains object parts
            if (el.parts && Array.isArray(el.parts)) {
              for (const p of el.parts) {
                if (typeof p === 'object' && p !== null && (p.text === undefined)) {
                  // candidate that might be already a structured object
                  parsed = p;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Final fallback: try to read response.response.candidates[0].content.parts[0] if it's an object
    if (!parsed) {
      const maybeObj = response?.response?.candidates?.[0]?.content?.parts?.[0];
      if (maybeObj && typeof maybeObj === 'object' && Object.keys(maybeObj).length > 0) {
        parsed = maybeObj;
      }
    }

    // Validate parsed object with Zod if we have something
    let validated = null;
    if (parsed) {
      const valid = DrinkAnalysisSchema.safeParse(parsed);
      if (valid.success) {
        validated = valid.data;
      } else {
        // validation failed — capture reasons but still expose parsed for debugging
        const zodErrors = valid.error.format ? JSON.stringify(valid.error.format(), null, 2) : valid.error.message;
        aiErrorReason = aiErrorReason || `Schema validation failed: ${zodErrors}`;
      }
    }

    // Build normalized response
    if (validated) {
      // Return exactly the validated structure + metadata
      return {
        error: false,
        message: null,
        ...validated
      };
    } else {
      // If no validated data, return parsed info (if any) but mark error and include helpful diagnostics.
      // Coerce the fields into safe shapes so the caller can still consume.
      const safeParsed = parsed || {};
      const normalized = {
        error: true,
        message: aiErrorReason || 'AI parsing/validation failed',
        brandName: typeof safeParsed.brandName === 'string' ? safeParsed.brandName : '',
        productType: typeof safeParsed.productType === 'string' ? safeParsed.productType : '',
        manufacturer: typeof safeParsed.manufacturer === 'string' ? safeParsed.manufacturer : '',
        keyIngredients: Array.isArray(safeParsed.keyIngredients) && safeParsed.keyIngredients.length > 0
          ? safeParsed.keyIngredients
          : ['ingredient_unavailable'],
        expiryDate: typeof safeParsed.expiryDate === 'string' ? safeParsed.expiryDate : '',
        warnings: Array.isArray(safeParsed.warnings) ? safeParsed.warnings : [],
        confidenceScore: typeof safeParsed.confidenceScore === 'number' ? safeParsed.confidenceScore : 0,
        localizedAdvice: typeof safeParsed.localizedAdvice === 'string' ? safeParsed.localizedAdvice : '',
        promotionalNote: typeof safeParsed.promotionalNote === 'string' ? safeParsed.promotionalNote : ''
      };

      return normalized;
    }
  } catch (err) {
    console.error('❌ Brand Scanner Vertex AI Error:', err);
    // Return safe defaults on catastrophic failure
    return {
      error: true,
      message: err.message || 'AI analysis failed',
      details: err.stack,
      brandName: '',
      productType: '',
      manufacturer: '',
      keyIngredients: ['ingredient_unavailable'],
      expiryDate: '',
      warnings: [],
      confidenceScore: 0,
      localizedAdvice: '',
      promotionalNote: ''
    };
  }
}

module.exports = { analyzeDrinkWithVertex };
