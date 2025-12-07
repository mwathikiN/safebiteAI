// services/brandScanner.js

// Imports for Google Vertex AI, file system, and robust schema validation
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const z = require('zod');

// --- Schema Definition for Response Validation (Zod) ---
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

// --- Vertex AI Service Setup ---
const vertexAI = new VertexAI({
  project: 'workshop-genai-477501',
  location: 'us-central1'
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash-image' // Capable of handling images/multimodal
});

// --- Utility Functions ---

/**
 * Strips common AI-generated markdown fences from a JSON string.
 * @param {string} text - Raw text from the model.
 * @returns {string} Cleaned text.
 */
function cleanJsonResponse(text) {
  if (!text || typeof text !== 'string') return text;
  // Use a simple, slightly less 'perfect' regex pattern
  return text
    .replace(/```json|```/gi, '')
    .trim();
}

/**
 * Attempts to safely extract the model's text response from various SDK structures.
 * @param {object} response - The raw response object from the API call.
 * @returns {string | null} The extracted text content or null.
 */
function extractModelText(response) {
  if (!response || typeof response !== 'object') return null;

  try {
    // Path 1: candidates[0].content.parts[0].text (most common)
    const p1 = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (p1) return p1;

    // Path 2: candidates[0].content[0].text (older/alt SDK structure)
    const p2 = response?.response?.candidates?.[0]?.content?.[0]?.text;
    if (p2) return p2;

    // Path 3: Content is already a structured object (for debugging/rare cases)
    const maybeObj = response?.response?.candidates?.[0]?.content?.parts?.[0];
    if (maybeObj && typeof maybeObj === 'object' && !maybeObj.text) {
      return JSON.stringify(maybeObj); // Stringify the object if no 'text' field is present
    }

    // Path 4: Fallback, stringify the entire candidate
    const candidate = response?.response?.candidates?.[0];
    if (candidate) {
      return JSON.stringify(candidate);
    }
  } catch (err) {
    // Just return null if an error occurs during extraction (more human-like 'oops')
  }

  return null;
}

// --- Main Brand Scanner Logic ---

/**
 * Analyzes a local image file using the Gemini API.
 * @param {string} localFilePath - Path to the image file.
 * @param {string} mimeType - The MIME type of the image (e.g., 'image/jpeg').
 * @returns {Promise<object>} The validated analysis data or a detailed error object.
 */
async function analyzeDrinkWithVertex(localFilePath, mimeType) {
  let aiErrorReason = null; // Hold API-specific failure details

  try {
    const imgBuffer = fs.readFileSync(localFilePath);
    const imgBase64 = Buffer.from(imgBuffer).toString('base64');

    // --- Prompt Engineering (Slightly less formal intro) ---
    const prompt = `
You are a food product label reader and safety analyst.

Instructions for your response:
- Read ALL visible text from the label.
- Detect brand, ingredients, expiry date, and warnings.
- DO NOT return empty arrays or empty strings.
- If unsure, use your best logical guess.
- You must always return at least one ingredient.
- confidenceScore must be 40 <= score <= 100.

Return ONLY the STRICT JSON structure:

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
      // Request JSON output
      config: { responseMimeType: 'application/json' }
    });

    // Simple logging for debugging extraction issues
    console.log('--- RAW GEMINI RESPONSE (for debug) ---');
    console.log(JSON.stringify(response, null, 2));

    // Check for API-level errors (safety blocks, etc.)
    const feedback = response?.response?.promptFeedback;
    if (feedback && (feedback.blockReason || feedback.safetyRatings)) {
      aiErrorReason = `API feedback block: ${JSON.stringify(feedback)}`;
    } else if (response?.response?.candidates?.[0]?.finishReason
               && response.response.candidates[0].finishReason !== 'STOP') {
      aiErrorReason = `Generation incomplete, reason: ${response.response.candidates[0].finishReason}`;
    }

    // --- Extract and Clean Text ---
    const rawTextCandidate = extractModelText(response);
    if (!rawTextCandidate) {
      aiErrorReason = aiErrorReason || 'No response text/candidate found';
    }

    const cleanedText = rawTextCandidate ? cleanJsonResponse(rawTextCandidate) : '';

    // --- JSON Parsing Logic (Multiple Tries) ---
    let parsedData = null;
    
    try {
      // Attempt 1: Parse the cleaned string directly
      if (cleanedText && (cleanedText.trim().startsWith('{') || cleanedText.trim().startsWith('['))) {
        parsedData = JSON.parse(cleanedText);
      } else {
        // Attempt 2: Regex to find a JSON snippet inside the string (last resort)
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}$/m);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (err) {
      // Human-style error message for malformed JSON
      console.error('❌ Model returned bad JSON:', err.message);
      aiErrorReason = aiErrorReason || `Malformed JSON from AI: ${err.message}`;
      parsedData = null;
    }

    // Attempt 3: Check if the SDK already returned a structured object in the content array
    if (!parsedData) {
      const candidateContent = response?.response?.candidates?.[0]?.content;
      if (candidateContent && Array.isArray(candidateContent)) {
        for (const el of candidateContent) {
          if (typeof el === 'object' && el !== null) {
            if (el.brandName || el.productType || el.keyIngredients) { // Heuristic check
              parsedData = el;
              break;
            }
          }
        }
      }
    }

    // Attempt 4: Last check on the first part
    if (!parsedData) {
      const maybeObj = response?.response?.candidates?.[0]?.content?.parts?.[0];
      if (maybeObj && typeof maybeObj === 'object' && Object.keys(maybeObj).length > 0) {
        parsedData = maybeObj;
      }
    }

    // --- Validation (Zod) ---
    let validatedData = null;
    if (parsedData) {
      const valid = DrinkAnalysisSchema.safeParse(parsedData);
      if (valid.success) {
        validatedData = valid.data;
      } else {
        // Validation failed
        const zodErrors = valid.error.format ? JSON.stringify(valid.error.format(), null, 2) : valid.error.message;
        aiErrorReason = aiErrorReason || `Schema validation failed: ${zodErrors}`;
      }
    }

    // --- Final Response Building ---
    if (validatedData) {
      // Success path: return the clean, validated object
      return {
        error: false,
        message: null,
        ...validatedData
      };
    } else {
      // Failure path: return what we could parse, but flag the error
      const safeParsed = parsedData || {};
      
      // Ensure all fields are present with safe defaults for the consumer
      const normalizedError = {
        error: true,
        message: aiErrorReason || 'AI data parsing/validation failed',
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

      return normalizedError;
    }
  } catch (err) {
    // Catastrophic failure (e.g., file system error, network issue)
    console.error('❌ Brand Scanner Top-Level Error:', err);
    return {
      error: true,
      message: err.message || 'Fatal AI analysis error',
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