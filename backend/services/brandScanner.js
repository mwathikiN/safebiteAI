// services/brandScanner.js

const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const z = require('zod');

// ---------------- Robust Output Schema ----------------
const DrinkAnalysisSchema = z.object({
  brandName: z.string(),
  productType: z.string(),
  manufacturer: z.string().optional(),
  keyIngredients: z.array(z.string()),
  expiryDate: z.string().optional(),
  warnings: z.array(z.string()),
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

// ---------------- Helper ----------------
function cleanJsonResponse(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

// ---------------- Brand Scanner using Vertex ----------------
async function analyzeDrinkWithVertex(localFilePath) {
  try {
    const imgBuffer = fs.readFileSync(localFilePath);
    const imgBase64 = Buffer.from(imgBuffer).toString('base64');

    // --- Improved Prompt: AI encouraged to guess instead of Unknown ---
    const prompt = `
You are a highly specialized African beverage expert. Analyze the following image of a drink bottle.
Identify brand, product type, manufacturer, key ingredients, expiry date, and warnings.
Provide friendly localized advice and promotional notes.
If unsure about any field, give your best guess, do not leave it blank or "Unknown".

Return strictly valid JSON matching this schema:

{
  "brandName": "...",
  "productType": "...",
  "manufacturer": "...",
  "keyIngredients": ["..."],
  "expiryDate": "...",
  "warnings": ["..."],
  "confidenceScore": 0-100,
  "localizedAdvice": "...",
  "promotionalNote": "..."
}

Only return JSON. No explanations or extra text.
`;

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imgBase64
              }
            }
          ]
        }
      ],
      config: { responseMimeType: 'application/json' }
    });

    const raw = response.response.candidates?.[0]?.content?.[0]?.text || '{}';
    const cleaned = cleanJsonResponse(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error('❌ Vertex AI returned malformed JSON:', raw);
      parsed = {};
    }

    // --- Ensure all fields are present with safe defaults ---
    const normalized = {
      brandName: parsed.brandName || "Unknown",
      productType: parsed.productType || "Unknown",
      manufacturer: parsed.manufacturer || "",
      keyIngredients: Array.isArray(parsed.keyIngredients) ? parsed.keyIngredients : [],
      expiryDate: parsed.expiryDate || "",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      confidenceScore: typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : 0,
      localizedAdvice: parsed.localizedAdvice || "",
      promotionalNote: parsed.promotionalNote || ""
    };

    return normalized;

  } catch (err) {
    console.error('❌ Brand Scanner Vertex AI Error:', err);
    // Return safe defaults on failure
    return {
      error: true,
      message: err.message || 'AI analysis failed',
      details: err.stack,
      brandName: "Unknown",
      productType: "Unknown",
      manufacturer: "",
      keyIngredients: [],
      expiryDate: "",
      warnings: [],
      confidenceScore: 0,
      localizedAdvice: "",
      promotionalNote: ""
    };
  }
}

module.exports = { analyzeDrinkWithVertex };
