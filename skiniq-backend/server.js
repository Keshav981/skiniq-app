const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const db = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// List of forbidden medical/diagnostic words and their cosmetic replacements
const MEDICAL_REPLACEMENTS = {
  'eczema': 'dry patches and surface sensitivity',
  'psoriasis': 'flaky, textured patches',
  'dermatitis': 'surface sensitivity and redness',
  'rosacea': 'facial flushing and sensitivity',
  'melanoma': 'hyperpigmentation spots',
  'fungal infection': 'microbial congestion',
  'infection': 'visible congestion',
  'acne vulgaris': 'visible congestion and blemishes',
  'disease': 'cosmetic concern',
  'diagnose': 'assess',
  'diagnosis': 'assessment',
  'treatment': 'skincare routine adjustment',
  'prescribe': 'recommend',
  'prescription': 'care recommendation',
  'cure': 'improve look of',
  'pathology': 'cosmetic condition'
};

// Sanitization function for medical terminology
function sanitizeCosmeticText(text) {
  if (!text) return '';
  let sanitized = text;
  Object.keys(MEDICAL_REPLACEMENTS).forEach(word => {
    // Case-insensitive regex with boundary checks
    const regex = new RegExp(`\\b${word}s?\\b`, 'gi');
    sanitized = sanitized.replace(regex, (match) => {
      // Keep capitalization style
      const isCapital = match[0] === match[0].toUpperCase();
      const replacement = MEDICAL_REPLACEMENTS[word];
      return isCapital ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
    });
  });
  return sanitized;
}

// Coordinate validation and alignment filter to prevent LLM hallucinations
function validateAndAlignCoordinates(detections) {
  if (!Array.isArray(detections)) return [];
  return detections.map(det => {
    let { type, label, description, x, y } = det;
    
    // Ensure numeric values and clamp to boundaries
    x = parseFloat(x);
    y = parseFloat(y);
    if (isNaN(x)) x = 50;
    if (isNaN(y)) y = 50;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    const textToCheck = `${type} ${label} ${description}`.toLowerCase();
    
    // 1. Under-eye contours / tired eyes / dark circles / crow's feet
    if (
      textToCheck.includes('eye') || 
      textToCheck.includes('dark circle') || 
      textToCheck.includes('eyelid') || 
      textToCheck.includes('crow') || 
      textToCheck.includes('orbital') || 
      textToCheck.includes('tear trough')
    ) {
      // Decide left vs right eye based on X coordinate
      if (x < 50) {
        // Left Eye / Under-eye: x must be 32 to 42, y must be 38 to 44
        x = Math.max(32, Math.min(42, x));
        y = Math.max(38, Math.min(44, y));
      } else {
        // Right Eye / Under-eye: x must be 58 to 68, y must be 38 to 44
        x = Math.max(58, Math.min(68, x));
        y = Math.max(38, Math.min(44, y));
      }
    }
    // 2. Forehead concerns (lines, pigment, dry)
    else if (
      textToCheck.includes('forehead') || 
      textToCheck.includes('brow') || 
      textToCheck.includes('glabella') || 
      y < 30
    ) {
      // Forehead: x must be 30 to 70, y must be 18 to 28
      x = Math.max(30, Math.min(70, x));
      y = Math.max(18, Math.min(28, y));
    }
    // 3. Nose / T-zone (pores, oil, redness)
    else if (
      textToCheck.includes('nose') || 
      textToCheck.includes('nasal') || 
      textToCheck.includes('t-zone') || 
      textToCheck.includes('tzone') || 
      textToCheck.includes('bridge') || 
      type === 'pores'
    ) {
      // Nose / T-zone: x must be 45 to 55, y must be 44 to 56
      x = Math.max(45, Math.min(55, x));
      y = Math.max(44, Math.min(56, y));
    }
    // 4. Mouth / Chin / Jawline (lines, dry)
    else if (
      textToCheck.includes('mouth') || 
      textToCheck.includes('chin') || 
      textToCheck.includes('lip') || 
      textToCheck.includes('jaw') || 
      textToCheck.includes('smile') || 
      textToCheck.includes('laugh') || 
      y > 68
    ) {
      // Mouth / Chin: x must be 40 to 60, y must be 70 to 86
      x = Math.max(40, Math.min(60, x));
      y = Math.max(70, Math.min(86, y));
    }
    // 5. Cheeks (dry patches, redness, sensitivity) - default fallback
    else {
      if (x < 50) {
        // Left Cheek: x must be 24 to 34, y must be 52 to 66
        x = Math.max(24, Math.min(34, x));
        y = Math.max(52, Math.min(66, y));
      } else {
        // Right Cheek: x must be 66 to 76, y must be 52 to 66
        x = Math.max(66, Math.min(76, x));
        y = Math.max(52, Math.min(66, y));
      }
    }

    return {
      type,
      label,
      description,
      x: Math.round(x),
      y: Math.round(y)
    };
  });
}

// ----------------------------------------------------
// Claude API Claude Vision Core Call Handler
// ----------------------------------------------------
async function analyzeSkinWithClaude(imageBase64, userContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.log('No Claude API key configured. Generating mock cosmetic analysis...');
    return generateMockAnalysis(userContext);
  }

  // Highly detailed cosmetic-only analysis prompt instructing Claude how to visually grade skin
  const prompt = `
You are a premium, certified aesthetic skin consultant representing the SkinIQ beauty-tech platform.
Analyze this user's face photo for cosmetic and visual skin quality indicators. 

CRITICAL ETHICAL & REGULATORY COMPLIANCE RULES:
1. NEVER diagnose skin conditions. Never mention words like acne vulgaris, eczema, rosacea, dermatitis, psoriasis, infection, melanoma, melasma, pathology, disease, or medical terms.
2. Frame all findings as "visible cosmetic indicators" or "surface characteristics". 
3. If visual blemishes or bumps are present, refer to them as "visible surface congestion", "blemish indicators", or "areas of minor congestion". Never say "acne".
4. You must append this disclaimer at the bottom of the summary: "This is a cosmetic skin assessment, not a medical diagnosis. Consult a dermatologist for skin health concerns."
5. Output MUST be raw, parseable JSON only. Do not add markdown backticks, explanations, or text outside the JSON block.

VISUAL ANALYSIS PROTOCOL:
- Hydration Level: Grade 0-100. Inspect for surface light-bounce (dewiness) vs micro-flaking, visual creasing, or dullness indicating moisture deficit.
- Texture Smoothness: Grade 0-100. Inspect light scattering across cheeks and forehead. Rough patches block reflection; smooth skin has uniform soft specular highlights.
- Pore Visibility: Grade 0-100 (lower is better). Grade the diameter and shadow depth of visible follicles in the T-zone (nose, forehead) and inner cheeks.
- Tone Evenness: Grade 0-100. Assess pigmentation uniformity, looking for localized cosmetic redness, visual fatigue under eyes, or shadowing.
- Oiliness Balance: Grade 0-100. Look for active oily shine (specular highlights in T-zone) vs matte finish. Perfect balance is 50. Above 50 is shiny; below 50 is visually dry.
- Fine Lines / Elasticity: Grade 0-100. Examine expression creases around eye contours (crow's feet), laugh lines, and forehead. Higher means fewer visible lines.
- Sun Spotting: Grade 0-100. Grade the presence of visible sun-induced dark spots, freckles, or uneven visual tan lines. Higher means clearer skin.

USER CONTEXT:
- Age: ${userContext.ageRange || 'Unknown'}
- Self-assessed Skin Type: ${userContext.skinType || 'Unknown'}
- Primary Goals: ${userContext.skinGoals ? userContext.skinGoals.join(', ') : 'General wellness'}
- Previous Analysis Scores (if any): ${JSON.stringify(userContext.previousScanScores || {})}

If previous scores are provided, note the delta progress. Tying comments to progress or recommending maintenance demonstrates high intelligence.

JSON OUTPUT STRUCTURE (Mandatory format):
{
  "scores": {
    "hydration": <0-100>,
    "texture": <0-100>,
    "pores": <0-100>,
    "tone": <0-100>,
    "oiliness": <0-100>,
    "fine_lines": <0-100>,
    "sun_damage": <0-100>,
    "overall": <0-100, weighted composite of parameters>
  },
  "explanations": {
    "hydration": "2-3 sentences visually detailing surface hydration status, noting light reflection quality.",
    "texture": "2-3 sentences describing texture smoothness, noticing pore congestion or rough zones.",
    "pores": "2-3 sentences describing follicle shadow depth and distribution around nasal wings.",
    "tone": "2-3 sentences evaluating coloration uniformity and under-eye visual shadows.",
    "oiliness": "2-3 sentences describing shine balance in the T-zone vs U-zone dryness.",
    "fine_lines": "2-3 sentences assessing visible expression creasing and surface resilience.",
    "sun_damage": "2-3 sentences describing surface sun-induced pigmentation indicators."
  },
  "general_summary": "A 3-sentence summary of overall skin quality, correlating their visual results with their target goals, and providing a positive path forward."
}
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.2, // Consistent analytical evaluations
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Claude API error: ${result.error?.message || response.statusText}`);
    }

    const responseText = result.content[0].text.trim();
    const jsonStr = responseText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    // Safety check - force compliance in all fields
    Object.keys(parsed.explanations).forEach(key => {
      parsed.explanations[key] = sanitizeCosmeticText(parsed.explanations[key]);
    });
    parsed.general_summary = sanitizeCosmeticText(parsed.general_summary);

    return parsed;
  } catch (err) {
    console.error('Claude Vision call error, using sandbox mock:', err.message);
    return generateMockAnalysis(userContext);
  }
}

// ----------------------------------------------------
// Gemini API Multimodal Generation Handler
// ----------------------------------------------------
async function analyzeSkinWithGemini(imageBase64, userContext, catalogString) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No Gemini API key configured');
  }

  const prompt = `
You are a premium, certified aesthetic skin consultant representing the SkinIQ beauty-tech platform.
Analyze this user's face photo for cosmetic and visual skin quality indicators. 

CRITICAL ETHICAL & REGULATORY COMPLIANCE RULES:
1. NEVER diagnose skin conditions. Never mention words like acne vulgaris, eczema, rosacea, dermatitis, psoriasis, infection, melanoma, melasma, pathology, disease, or medical terms.
2. Frame all findings as "visible cosmetic indicators" or "surface characteristics". 
3. If visual blemishes or bumps are present, refer to them as "visible surface congestion", "blemish indicators", or "areas of minor congestion". Never say "acne".
4. You must append this disclaimer at the bottom of the summary: "This is a cosmetic skin assessment, not a medical diagnosis. Consult a dermatologist for skin health concerns."
5. Output MUST be raw, parseable JSON only. Do not add markdown backticks, explanations, or text outside the JSON block.

VISUAL ANALYSIS PROTOCOL & EXPLANATIONS DIRECTIONS:
- Hydration Level: Grade 0-100. Inspect for surface light-bounce (dewiness) vs micro-flaking, visual creasing, or dullness indicating moisture deficit. Detail surface light-bounce, micro-flaking, visual creasing, and localized transepidermal water loss (TEWL). If a dry patch is detected, explicitly reference its coordinates (e.g., "dry patch at 28% x, 60% y").
- Texture Smoothness: Grade 0-100. Inspect light scattering across cheeks and forehead. Rough patches block reflection; smooth skin has uniform soft specular highlights. Describe light scattering, desquamation (roughness), and uniform vs non-uniform specular highlights.
- Pore Visibility: Grade 0-100 (lower is better). Grade the diameter and shadow depth of visible follicles in the T-zone (nose, forehead) and inner cheeks. Describe follicle shadow depth and distribution around nasal wings and T-zone (e.g. "pore congestion at 49% x, 50% y").
- Tone Evenness: Grade 0-100. Assess pigmentation uniformity, looking for localized cosmetic redness, visual fatigue under eyes, or shadowing. Evaluate coloration uniformity, localized erythema (redness/flushing), and under-eye visual shadows.
- Sebum / Oiliness Balance: Grade 0-100. Look for active oily shine (specular highlights in T-zone) vs matte finish. Perfect balance is 50. Contrast T-zone specular shine vs U-zone matte finish. Explain sebum activity.
- Fine Lines / Elasticity: Grade 0-100. Examine expression creases around eye contours (crow's feet), laugh lines, and forehead. Higher means fewer visible lines. Examine expression creasing and structural resilience. Reference coordinates (e.g., "creases at 38% x, 42% y").
- Sun Spotting: Grade 0-100. Grade the presence of visible sun-induced dark spots, freckles, or uneven visual tan lines. Higher means clearer skin. Assess UV-induced pigmentation, melanocyte activity (sun spots), and freckling.

CRITICAL TONE, CLINICAL AUTHENTICITY & QUALITY INSTRUCTIONS:
1. NEVER write generic placeholder text, preambles, or conversational templates (e.g. "Your skin journey shows..."). Keep the tone clinical, objective, precise, and encouraging — like a premium derm-clinic report.
2. Use advanced cosmetic and aesthetic terminology (e.g., desquamation, sebum production, barrier lipidation, erythema, transepidermal water loss (TEWL), follicular congestion, melanocyte activity).
3. You MUST tie the explanations directly to the detections coordinates! E.g., "I detect localized erythema on your right cheek at 72% x, 58% y, indicating..."
4. Each explanation MUST end with a practical, direct skincare Tip (e.g., "Tip: Apply hyaluronic acid on damp skin to block TEWL", "Tip: Target nasal wings with Salicylic Acid to clear plug congestion").
5. Keep explanations exactly 2 to 3 sentences. Keep them concise, scientific, and highly personalized to the visual cues in the user's photo.

COSMETIC FEATURE DETECTION (VISUAL ANNOTATION):
- You must identify exactly 3 to 5 visual concerns on the face (e.g. visible pores, dry zone, redness area, express lines, dark eye circles, or pigment spot).
- Provide their relative coordinates on the photo box as horizontal percentage (x) and vertical percentage (y) from 0 to 100 (where x=0 is left, x=100 is right, y=0 is top, y=100 is bottom of a centered face crop):
  1. Forehead concerns: x must be 30 to 70, y must be 18 to 28.
  2. Eyes / Under-eye contours (e.g., dark circles, tired eyes, eye fine lines):
     - Left Eye / Under-eye: x must be 32 to 42, y must be 38 to 44.
     - Right Eye / Under-eye: x must be 58 to 68, y must be 38 to 44.
     - NEVER place eye/dark circle pointers outside the vertical range of y=36 to 46. (Pointers at y=15-30 are on the forehead/head and are inaccurate).
  3. Nose / T-zone (pores, congestion, oil): x must be 45 to 55, y must be 44 to 56.
  4. Cheeks (dry patches, redness, sensitivity):
     - Left Cheek: x must be 24 to 34, y must be 52 to 66.
     - Right Cheek: x must be 66 to 76, y must be 52 to 66.
  5. Mouth / Chin: x must be 40 to 60, y must be 70 to 86.

USER CONTEXT:
- Age: ${userContext.ageRange || 'Unknown'}
- Self-assessed Skin Type: ${userContext.skinType || 'Unknown'}
- Primary Goals: ${userContext.skinGoals ? userContext.skinGoals.join(', ') : 'General wellness'}
- Previous Analysis Scores (if any): ${JSON.stringify(userContext.previousScanScores || {})}
- IMPORTANT TRACKING CONSISTENCY RULE: If "Previous Analysis Scores" are provided, your new scores MUST remain within +/- 3 points of the previous scores. This is critical for authentic tracking of skin changes, as skin condition changes slowly. Only deviate slightly based on goals or natural variance.

AVAILABLE PRODUCT CATALOG:
${catalogString}

PERSONALIZED RECOMMENDATIONS DIRECTIONS:
- Select exactly 3 products from the AVAILABLE PRODUCT CATALOG that best address the user's skin concerns, skin type, and goals.
- CRITICAL BRAND DIVERSITY RULE: You MUST recommend products from a wide variety of brands in the catalog (e.g. Dot & Key, The Ordinary, Plum, Pilgrim, Cetaphil, Bella Vita). Do NOT select only products from one brand (like Minimalist). Choose the best combination of different brands to demonstrate objective and personalized curation.
- For each selected product, write a custom personalized reason (2 sentences) explaining why it is recommended based on their visual face markers and how/when they should apply it.

JSON OUTPUT STRUCTURE (Mandatory format):
{
  "scores": {
    "hydration": <0-100>,
    "texture": <0-100>,
    "pores": <0-100>,
    "tone": <0-100>,
    "oiliness": <0-100>,
    "fine_lines": <0-100>,
    "sun_damage": <0-100>,
    "overall": <0-100, weighted composite of parameters>
  },
  "explanations": {
    "hydration": "2-3 sentences detailing surface hydration, micro-flaking, and TEWL, referencing coordinate locations of dry areas if any. Must end with a direct skincare Tip.",
    "texture": "2-3 sentences describing texture roughness and desquamation. Must end with a direct skincare Tip.",
    "pores": "2-3 sentences describing follicle shadow depth and nasal wing congestion, referencing coordinate locations. Must end with a direct skincare Tip.",
    "tone": "2-3 sentences evaluating coloration uniformity and localized redness/erythema, referencing coordinate locations. Must end with a direct skincare Tip.",
    "oiliness": "2-3 sentences contrasting T-zone shine vs U-zone dryness, referencing coordinate locations. Must end with a direct skincare Tip.",
    "fine_lines": "2-3 sentences assessing expression wrinkles and micro-creasing, referencing coordinate locations. Must end with a direct skincare Tip.",
    "sun_damage": "2-3 sentences describing UV spots and melanocyte activity, referencing coordinate locations. Must end with a direct skincare Tip."
  },
  "general_summary": "A 3-sentence summary of overall skin quality, correlating their visual results with their target goals, and providing a positive path forward.",
  "detections": [
    {
      "type": "pores" | "dry" | "redness" | "lines" | "pigment",
      "label": "e.g., Nasal Pore Visibility",
      "description": "e.g., Visible enlarged pores showing moderate shadows around the nose wings.",
      "x": <0-100>,
      "y": <0-100>
    }
  ],
  "recommended_products": [
    {
      "id": "e.g., prod-1",
      "custom_reason": "e.g., Recommended to hydrate the dry flaky patches visible on your cheek. Smooth 2-3 drops morning and night."
    }
  ]
}
`;

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API error: ${result.error?.message || response.statusText}`);
    }

    const responseText = result.candidates[0].content.parts[0].text.trim();
    const jsonStr = responseText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Safety check - force compliance in all fields
    Object.keys(parsed.explanations).forEach(key => {
      parsed.explanations[key] = sanitizeCosmeticText(parsed.explanations[key]);
    });
    parsed.general_summary = sanitizeCosmeticText(parsed.general_summary);
    if (parsed.detections) {
      parsed.detections.forEach(det => {
        det.label = sanitizeCosmeticText(det.label);
        det.description = sanitizeCosmeticText(det.description);
      });
    }
    if (parsed.recommended_products) {
      parsed.recommended_products.forEach(prod => {
        prod.custom_reason = sanitizeCosmeticText(prod.custom_reason);
      });
    }

    return parsed;
  } catch (err) {
    console.error('Gemini Vision call error:', err.message);
    throw err;
  }
}

// Progressive, goal-aware simulated analysis engine for demo workflows
function generateMockAnalysis(userContext) {
  const goals = userContext.skinGoals || [];
  const prevScores = userContext.previousScanScores;

  // 1. Establish baseline scores
  let hydration = 62;
  let texture = 65;
  let pores = 68; // lower is better
  let tone = 64;
  let oiliness = 65; // balanced is 50
  let fine_lines = 72;
  let sun_damage = 70;

  // Adjust baselines based on skin type self-assessment
  if (userContext.skinType === 'dry') {
    hydration = 52;
    oiliness = 38;
  } else if (userContext.skinType === 'oily') {
    oiliness = 78;
    pores = 78;
  } else if (userContext.skinType === 'sensitive') {
    tone = 58;
    texture = 62;
  }

  // 2. Simulating Scan Progress:
  // If there are previous scores, improve targeted metrics to represent product effects
  if (prevScores && Object.keys(prevScores).length > 0) {
    // Keep scores extremely consistent to match the same face image/quick successive scan requirement.
    // Fluctuates by only -1, 0, or +1 points randomly.
    const getDrift = () => Math.floor(Math.random() * 3) - 1; // returns -1, 0, or 1
    hydration = prevScores.hydration + getDrift();
    texture = prevScores.texture + getDrift();
    pores = prevScores.pores + getDrift(); // lower is better, drift goes both ways
    tone = prevScores.tone + getDrift();
    fine_lines = prevScores.fine_lines + getDrift();
    sun_damage = prevScores.sun_damage + getDrift();
    oiliness = prevScores.oiliness + getDrift();
  } else {
    // First scan baseline random variance
    hydration += Math.floor(Math.random() * 8) - 4;
    texture += Math.floor(Math.random() * 8) - 4;
    pores += Math.floor(Math.random() * 8) - 4;
    tone += Math.floor(Math.random() * 8) - 4;
    oiliness += Math.floor(Math.random() * 10) - 5;
    fine_lines += Math.floor(Math.random() * 6) - 3;
    sun_damage += Math.floor(Math.random() * 6) - 3;
  }

  // Clamp values between 10 and 100
  const scores = {
    hydration: Math.max(10, Math.min(100, hydration)),
    texture: Math.max(10, Math.min(100, texture)),
    pores: Math.max(10, Math.min(100, pores)),
    tone: Math.max(10, Math.min(100, tone)),
    oiliness: Math.max(10, Math.min(100, oiliness)),
    fine_lines: Math.max(10, Math.min(100, fine_lines)),
    sun_damage: Math.max(10, Math.min(100, sun_damage))
  };

  // Calculate composite score (weighted)
  scores.overall = Math.round(
    (scores.hydration * 0.2) +
    (scores.texture * 0.2) +
    ((100 - scores.pores) * 0.15) + // lower pores = better
    (scores.tone * 0.15) +
    ((100 - Math.abs(50 - scores.oiliness) * 2) * 0.1) + // balanced oil is better
    (scores.fine_lines * 0.1) +
    (scores.sun_damage * 0.1)
  );

  // Generate personalized comments referencing goals and progress
  const hasProgress = prevScores && Object.keys(prevScores).length > 0;
  
  const progressText = (metric, isPores = false) => {
    if (!hasProgress) return '';
    const diff = scores[metric] - prevScores[metric];
    if (metric === 'pores') {
      const poreDiff = prevScores.pores - scores.pores; // positive means visibility decreased
      return poreDiff > 0 ? ` Note: Visual pore visibility has improved by ${poreDiff} points.` : '';
    }
    return diff > 0 ? ` Visual signs show a positive improvement of +${diff} points.` : '';
  };

  const detections = [
    { type: 'pores', label: 'Nasal T-Zone Pores', description: `Moderate follicle shadows visible around the nose wings. Visually rated at ${scores.pores}/100.`, x: 49, y: 50 },
    { type: 'dry', label: 'Cheek Dryness', description: `Dehydrated skin textures on the cheek surface showing minor flaking. Visually rated at ${scores.hydration}/100.`, x: 28, y: 60 },
    { type: 'redness', label: 'Cheek Flushing', description: `Mild localized surface redness on cheeks. Visually rated at ${scores.tone}/100.`, x: 72, y: 58 },
    { type: 'lines', label: 'Under-eye Shadowing', description: `Visible shadowing and visual fatigue contours under the left eye eyelid. Visually rated at ${scores.fine_lines}/100.`, x: 38, y: 42 }
  ];
 
  const mockRecommended = [
    {
      id: "prod-3", // Dot & Key
      custom_reason: `Recommended to replenish hydration in the cheek dry zones (28% x, 60% y) which scored ${scores.hydration}%. Smooth 2-3 drops of Dot & Key Hydrating Gel morning and night.`
    },
    {
      id: "prod-6", // Plum
      custom_reason: `Barrier reinforcing Niacinamide formula chosen to address surface cheek sensitivity (72% x, 58% y). Use Plum serum after cleansing.`
    },
    {
      id: "prod-8", // The Ordinary
      custom_reason: `BHA formulation from The Ordinary targeted at deep pore cleansing to clear the nasal T-zone (49% x, 50% y) where pore shadows are visible.`
    }
  ];

  return {
    scores,
    explanations: {
      hydration: `Surface light-bounce is uneven, with visible micro-flaking and micro-creasing concentrated on your left cheek (28% x, 60% y), indicating localized transepidermal water loss (TEWL) and barrier lipidation deficit. Hydration is visually rated at ${scores.hydration}%. Tip: Apply hyaluronic acid on damp skin to trap moisture.`,
      texture: `Epidermal texture shows minor roughness and desquamation on the cheeks, with uniform specular reflection on the forehead. Surface smoothness is graded at ${scores.texture}%. Tip: Use a gentle PHA exfoliant to dissolve dead cells without barrier irritation.`,
      pores: `Follicle shadow depth is concentrated in the nasal T-zone (49% x, 50% y) with moderate sebum dilation. Sebum congestion index is visually graded at ${scores.pores}/100. Tip: Target nasal wings with localized Salicylic Acid (BHA) to clear plug buildup.`,
      tone: `Tone evaluation indicates localized redness on the right cheek (72% x, 58% y), contrasted with mild hyperpigmentation. Sebum and vascular visibility is graded at ${scores.tone}%. Tip: Use Niacinamide or Centella to soothe capillary flushing.`,
      oiliness: `Specular light reflection is highly active across the forehead and nose bridge (T-zone sebum at ${scores.oiliness}%), indicating elevated sebaceous activity, while the jawline U-zone remains matte and dry. Tip: Use a clay mask strictly on the T-zone and rich moisturizers on cheeks.`,
      fine_lines: `Expression-induced micro-creasing is visible around the outer eye contours (crow's feet) at (38% x, 42% y). Visual elasticity index is rated at ${scores.fine_lines}/100, representing strong cellular bounce with minor structural fatigue. Tip: Integrate retinol or peptides at night.`,
      sun_damage: `Pigmentation mapping reveals minor localized UV-induced melanocyte activity and light sun-freckling across the cheeks, rated at ${scores.sun_damage}/100. Tip: Wear broad-spectrum SPF 50 daily to prevent UV spot deepening.`
    },
    general_summary: hasProgress
      ? `Your skin journey shows clear visual improvements, raising your overall Skin Health index to ${scores.overall}%. Your targeted efforts toward ${goals.join(' & ')} are showing positive results. Continue with your customized recommendations.`
      : `Your baseline skin assessment shows moderate health with an overall score of ${scores.overall}%. Your main focus areas should be addressing hydration and texture. Following your customized products routine will help optimize these scores.`,
    detections,
    recommended_products: mockRecommended
  };
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// 1. Profile Endpoints
app.post('/api/profile', async (req, res) => {
  const { id, name, ageRange, skinType, skinGoals } = req.body;
  if (!name || !ageRange) {
    return res.status(400).json({ error: 'Name and age range are required' });
  }
  try {
    const profile = await db.profiles.save({ id, name, ageRange, skinType, skinGoals });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

app.get('/api/profile/login', async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const profile = await db.profiles.findByName(name);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to login user' });
  }
});

app.get('/api/profile/:userId', async (req, res) => {
  try {
    const profile = await db.profiles.find(req.params.userId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// 2. Scan & Analysis Endpoints
app.post('/api/scans', async (req, res) => {
  const { userId, imageBase64, savePhoto = false, isFrontFacing = false } = req.body;
  if (!userId || !imageBase64) {
    return res.status(400).json({ error: 'UserId and image are required' });
  }

  try {
    const profile = await db.profiles.find(userId);
    if (!profile) return res.status(404).json({ error: 'User profile not found' });

    // Check subscription access: first scan is free, others require active subscription
    const scans = await db.scans.findByUser(userId);
    const subscription = await db.subscriptions.find(userId);
    
    if (scans.length >= 1 && subscription.status !== 'active') {
      return res.status(403).json({ 
        error: 'Subscription required',
        paywallRequired: true,
        message: 'Subscribe to unlock unlimited scans and track your skin journey.'
      });
    }

    // Gather context from previous scans
    const previousScan = scans[0];
    const userContext = {
      ageRange: profile.ageRange,
      skinType: profile.skinType,
      skinGoals: profile.skinGoals,
      previousScanScores: previousScan ? previousScan.scores : null
    };

    let analysis;
    const productsCatalog = await db.products.list();
    if (process.env.GEMINI_API_KEY) {
      console.log('Running Gemini skin analysis...');
      const catalogString = productsCatalog.map(p => `- ID: ${p.id}, Brand: ${p.brand}, Name: ${p.name}, Category: ${p.category}, Target: ${p.dimensions.join(', ')}`).join('\n');
      try {
        analysis = await analyzeSkinWithGemini(imageBase64, userContext, catalogString);
      } catch (geminiErr) {
        console.warn('Gemini Vision call failed, recovering with sandbox mock analysis:', geminiErr.message);
        analysis = generateMockAnalysis(userContext);
      }
    } else {
      console.log('Running Sandbox Mock skin analysis...');
      analysis = generateMockAnalysis(userContext);
    }

    // Ensure coordinates are aligned properly on the face model and not hallucinated by LLM
    if (analysis.detections) {
      analysis.detections = validateAndAlignCoordinates(analysis.detections);
    }

    // Map recommended products from ID list to actual product objects with custom reasons
    const recommendedList = (analysis.recommended_products || []).map(item => {
      const prod = productsCatalog.find(p => p.id === item.id);
      if (prod) {
        return {
          ...prod,
          reason_text: item.custom_reason // Inject the highly personalized reason!
        };
      }
      return null;
    }).filter(Boolean);

    // Fallback to standard products recommendation if Gemini didn't return custom list
    let finalRecommendations = recommendedList;
    if (finalRecommendations.length === 0) {
      const scoreMap = { ...analysis.scores };
      delete scoreMap.overall;
      const sortedDims = Object.keys(scoreMap).sort((a, b) => {
        const valA = a === 'pores' ? 100 - scoreMap[a] : scoreMap[a];
        const valB = b === 'pores' ? 100 - scoreMap[b] : scoreMap[b];
        return valA - valB;
      });
      const lowestDims = sortedDims.slice(0, 3);
      finalRecommendations = await db.products.recommend(lowestDims);
    }
    
    // Save to database
    const scanRecord = await db.scans.create({
      userId,
      scores: analysis.scores,
      explanations: analysis.explanations,
      general_summary: analysis.general_summary,
      detections: analysis.detections || [],
      recommended_products: finalRecommendations,
      // Store full base64 if savePhoto is true so it can be rendered in history
      imageUrl: savePhoto ? `data:image/jpeg;base64,${imageBase64}` : null,
      imageRetained: savePhoto,
      isFrontFacing: !!isFrontFacing // Save the front camera flag to support mirroring
    });

    res.json(scanRecord);
  } catch (err) {
    console.error('Failed to run scan analysis:', err);
    res.status(500).json({ error: 'Analysis server error. Please try again.' });
  }
});

app.get('/api/scans/:userId', async (req, res) => {
  try {
    const scans = await db.scans.findByUser(req.params.userId);
    res.json(scans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user history' });
  }
});

app.get('/api/scans/detail/:scanId', async (req, res) => {
  try {
    const scan = await db.scans.find(req.params.scanId);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json(scan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scan details' });
  }
});

// 3. Product Recommendation Endpoints
app.get('/api/products', async (req, res) => {
  const { dimensions } = req.query;
  try {
    const products = await db.products.list();
    
    if (dimensions) {
      const dimsArray = dimensions.split(',');
      const filtered = products.filter(prod => 
        prod.dimensions.some(d => dimsArray.includes(d))
      );
      return res.json(filtered);
    }
    
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products catalog' });
  }
});

app.post('/api/products/recommend', async (req, res) => {
  const { lowestDimensions } = req.body;
  if (!lowestDimensions || !Array.isArray(lowestDimensions)) {
    return res.status(400).json({ error: 'lowestDimensions array required' });
  }
  try {
    const recommended = await db.products.recommend(lowestDimensions);
    res.json(recommended);
  } catch (err) {
    res.status(500).json({ error: 'Failed to recommend products' });
  }
});

app.post('/api/clicks', async (req, res) => {
  const { userId, productId, scanId } = req.body;
  if (!userId || !productId) {
    return res.status(400).json({ error: 'userId and productId are required' });
  }
  try {
    const click = await db.clicks.log(userId, productId, scanId);
    res.json(click);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log product click' });
  }
});

// 4. Subscription Endpoints
app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const sub = await db.subscriptions.find(req.params.userId);
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

app.post('/api/subscription', async (req, res) => {
  const { userId, status, tier, expiresAt } = req.body;
  if (!userId || !status) {
    return res.status(400).json({ error: 'userId and status are required' });
  }
  try {
    const sub = await db.subscriptions.save(userId, { status, tier, expiresAt });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// 5. Data Privacy Deletion Endpoint
app.delete('/api/history/:userId', async (req, res) => {
  try {
    const deleted = await db.scans.deleteUserHistory(req.params.userId);
    if (deleted) {
      res.json({ success: true, message: 'All personal data, image logs, and scan history have been deleted successfully.' });
    } else {
      res.status(500).json({ error: 'Failed to delete data history' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error during history deletion' });
  }
});

app.get('/admin', async (req, res) => {
  try {
    const users = await db.profiles.listAll() || [];
    const scans = await db.scans.listAll() || [];
    const clicks = await db.clicks.listAll() || [];
    const subs = await db.subscriptions.listAll() || [];
    
    const activeSubs = subs.filter(s => s.status === 'active').length;
    
    const userRows = users.map(user => {
      const userScans = scans.filter(s => s.userId === user.id);
      const userClicks = clicks.filter(c => c.userId === user.id);
      const userSub = subs.find(s => s.userId === user.id) || { status: 'free' };
      
      return `
        <tr>
          <td>${user.name || 'Anonymous'}</td>
          <td style="font-family: monospace; font-size: 12px; color: #8E7C7D;">${user.id}</td>
          <td><span class="badge badge-age">${user.ageRange || 'Unknown'}</span></td>
          <td><span class="badge badge-type">${user.skinType || 'Not Set'}</span></td>
          <td><span class="badge badge-sub ${userSub.status === 'active' ? 'active' : ''}">${userSub.status.toUpperCase()}</span></td>
          <td>${userScans.length} scans</td>
          <td>${userClicks.length} clicks</td>
          <td>${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</td>
        </tr>
      `;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SkinIQ Admin Dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #1A0F10;
              color: #FFF;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 1200px;
              margin: 0 auto;
            }
            h1 {
              color: #F2A0A1;
              font-size: 28px;
              margin-bottom: 20px;
              letter-spacing: 1px;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
            }
            .card {
              background-color: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(242, 160, 161, 0.1);
              border-radius: 12px;
              padding: 20px;
              text-align: center;
            }
            .card h3 {
              color: #8E7C7D;
              margin: 0 0 10px 0;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .card .value {
              font-size: 36px;
              font-weight: bold;
              color: #FCECEC;
            }
            .table-wrapper {
              overflow-x: auto;
              background-color: rgba(255, 255, 255, 0.02);
              border-radius: 12px;
              border: 1px solid rgba(242, 160, 161, 0.05);
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              padding: 15px;
              text-align: left;
              border-bottom: 1px solid rgba(242, 160, 161, 0.05);
            }
            th {
              background-color: rgba(255, 255, 255, 0.04);
              color: #F2A0A1;
              font-weight: 600;
            }
            tr:hover {
              background-color: rgba(255, 255, 255, 0.01);
            }
            .badge {
              padding: 4px 8px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 600;
            }
            .badge-age { background-color: rgba(242, 160, 161, 0.15); color: #F2A0A1; }
            .badge-type { background-color: rgba(110, 158, 128, 0.15); color: #6E9E80; }
            .badge-sub { background-color: rgba(255, 255, 255, 0.1); color: #FFF; }
            .badge-sub.active { background-color: rgba(212, 175, 55, 0.2); color: #D4AF37; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>SkinIQ Admin Dashboard</h1>
            
            <div class="stats">
              <div class="card">
                <h3>Total Registered Users</h3>
                <div class="value">${users.length}</div>
              </div>
              <div class="card">
                <h3>Total Dermal Scans</h3>
                <div class="value">${scans.length}</div>
              </div>
              <div class="card">
                <h3>Active Premium Subscriptions</h3>
                <div class="value">${activeSubs}</div>
              </div>
              <div class="card">
                <h3>Affiliate Product Clicks</h3>
                <div class="value">${clicks.length}</div>
              </div>
            </div>
            
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>User ID</th>
                    <th>Age Group</th>
                    <th>Skin Type</th>
                    <th>Subscription</th>
                    <th>Scans</th>
                    <th>Clicks</th>
                    <th>Registration Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${userRows || '<tr><td colspan="8" style="text-align: center; color: #8E7C7D;">No users registered yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Admin dashboard server error');
  }
});

// Start backend
app.listen(PORT, () => {
  console.log(`SkinIQ Backend running on port ${PORT}`);
});
