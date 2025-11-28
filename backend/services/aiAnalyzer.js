const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');

// IMPORTANT: Ensure this project ID and location are correct for your Vertex AI setup
const vertexAI = new VertexAI({
  project: 'workshop-genai-477501', 
  location: 'us-central1'
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash-image'
});

// --- HELPER: Clean JSON returned by AI ---
function cleanJsonResponse(text) {
  return text
    .replace(/```json/gi, '') // Remove ```json
    .replace(/```/g, '')      // Remove ``` closing fences
    .trim();                   // Trim whitespace
}

async function analyzeImageWithVertex(localFilePath, userProfile) {
  try {
    const imgBuffer = fs.readFileSync(localFilePath);
    const imgBase64 = Buffer.from(imgBuffer).toString('base64');

    // --- SAFELY ENSURE ARRAYS ---
    const allergies = Array.isArray(userProfile.allergicFoods) ? userProfile.allergicFoods : [];
    const healthConditions = Array.isArray(userProfile.healthConditions) ? userProfile.healthConditions : [];

    // =========================================================================
    // HACKATHON WINNING PROMPT ENGINEERING (UPDATED FOR HEALTH ADVICE)
    // =========================================================================
    const prompt = `
You are a highly specialized and culturally sensitive food safety expert for the SafeBite African community. Your primary goal is to provide **actionable, localized, and context-aware advice**.

### AFRICAN CULTURAL CONTEXT & FOOD KNOWLEDGE:
* **Always** use African food names first, followed by the English translation in parentheses (e.g., 'Wali (Rice)', 'Nduma (Arrowroot)', 'Sukuma Wiki (Collard Greens)', 'Nyama (Meat)').
* **Prioritize** local, affordable swaps: Nduma, Ngwaci, Minji, Ndengu, Omena, Tilapia, Matoke, Kachumbari, Githeri.
* **Understand** the African Plate Model (for health risks): A healthy meal requires balance. High starch portions (e.g., Ugali, Wali) are risks, but protein (Nyama) and green vegetables (Mboga) mitigate this risk.

### RISK SCORING & DECISION LOGIC:
DO NOT use "SAFE" or "NOT SAFE". Use the following 3-tiered system based on the analysis of the image relative to the User Profile:

1.  **CRITICAL:** If a **direct allergen** is clearly visible OR if the meal presents an **extreme, undeniable health risk** (e.g., pure heavy starch for a diabetic). This means STOP.
2.  **MODERATE:** If the meal is **suboptimal** due to poor portioning (too much starch, too much oil) or moderate risk health factors. This means ADJUST.
3.  **SAFE:** If the meal is well-balanced or poses no risk. This means ENJOY.

### REQUIRED OUTPUT (STRICT JSON FORMAT):
Your ENTIRE response **must ONLY be valid JSON** with NO extra text, comments, or preamble. The JSON MUST contain EXACTLY the following keys:

{
  "risk_level": "CRITICAL" or "MODERATE" or "SAFE",
  "risk_score": 1-10 (10 being highest risk),
  "localized_visible_ingredients": [
    "List of items using local names (e.g., Wali, Nyama) with their risk tag: (RISK/ALLERGY/SAFE)",
    "Example: Wali (White Rice) (RISK/ALLERGY)",
    "Example: Sukuma Wiki (Collard Greens) (SAFE)"
  ],
  "hidden_ingredients": ["list of possible hidden ingredients"],
  "allergy_risk_summary": "short sentence (localized if possible)",
  "health_risk_summary": "short sentence (localized if possible)",
  "expert_take_paragraph": "2–3 friendly, localized sentences",
  "safe_swaps": [
    "suggestion 1 (Localized & Affordable)", 
    "suggestion 2 (Localized & Affordable)", 
    "suggestion 3 (Localized & Affordable)"
  ],
  "localized_actionable_fixes": [
    "The most important, immediate fix, especially for MODERATE risk (e.g., 'Eat the beef, avoid most rice.')",
    "A second quick fix (e.g., 'Add a side of Kachumbari for fiber.')"
  ],
  "health_consumption_advice": [
    "Based on the user's Health Conditions (${healthConditions.join(", ")}), provide 2-3 specific, localized tips on how to consume THIS MEAL (e.g., portion control, eating less of a specific component, consumption technique) to maximize health."
  ]
}

User Allergies: ${allergies.join(", ")}
User Health Conditions: ${healthConditions.join(", ")}
`;
    // =========================================================================
    // END PROMPT ENGINEERING
    // =========================================================================

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
      config: { responseMimeType: "application/json" }
    });

    // --- CLEAN AI RESPONSE BEFORE PARSING ---
    const raw = response.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = cleanJsonResponse(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ AI returned malformed JSON:", raw);
      return { error: true, message: "AI returned malformed JSON", rawResponse: raw };
    }

    // --- CONSOLIDATED & SAFER RESPONSE OBJECT (This is the correctly fixed block) ---
    const safeJson = {
      // NEW REQUIRED FIELDS
      risk_level: parsed.risk_level || "CRITICAL", // Default to high risk if AI fails
      risk_score: parsed.risk_score || 10,
      localized_actionable_fixes: Array.isArray(parsed.localized_actionable_fixes) ? parsed.localized_actionable_fixes : ["No immediate action needed."],
      
      // THE CRITICAL LINE THAT MUST BE INCLUDED:
      health_consumption_advice: Array.isArray(parsed.health_consumption_advice) ? parsed.health_consumption_advice : ["No specific consumption advice available."],

      // CORE FIELDS
      localized_visible_ingredients: Array.isArray(parsed.localized_visible_ingredients) ? parsed.localized_visible_ingredients : [],
      hidden_ingredients: Array.isArray(parsed.hidden_ingredients) ? parsed.hidden_ingredients : [],
      allergy_risk_summary: parsed.allergy_risk_summary || "Hakuna hatari (No specific allergy risks detected).",
      health_risk_summary: parsed.health_risk_summary || "Hakuna hatari kubwa (No major health risks noted).",
      expert_take_paragraph: parsed.expert_take_paragraph || "Inaonekana nzuri! (Looks good!) Here's what we think about your meal.",
      safe_swaps: Array.isArray(parsed.safe_swaps) ? parsed.safe_swaps : ["Jaribu mlo mwepesi (Try a lighter alternative next time)."]
    };

    // --- FRONTEND-READY RETURN ---
    return {
      status: "Scan analyzed",
      scanId: Date.now().toString(),
      imageUrl: localFilePath,
      aiResult: safeJson // Contains the new, localized JSON structure
    };

  } catch (err) {
    console.error("Vertex AI error:", err);
    return { error: true, message: err.message || 'AI analysis failed', details: err.stack };
  }
}

module.exports = { analyzeImageWithVertex };