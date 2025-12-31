
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";
import { Recipe, DietaryRestriction, StoreLocation } from "../types";

// --- Function Declarations for Voice Assistant ---
export const NAVIGATION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'navigateTo',
    parameters: {
      type: Type.OBJECT,
      description: 'Navigate the user to a specific section of the app.',
      properties: {
        view: {
          type: Type.STRING,
          description: 'The target view name.',
          enum: ['scan', 'recipes', 'shopping'],
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'cookingControl',
    parameters: {
      type: Type.OBJECT,
      description: 'Control the step-by-step cooking process.',
      properties: {
        action: {
          type: Type.STRING,
          description: 'The cooking navigation action.',
          enum: ['next', 'previous', 'repeat', 'finish'],
        },
      },
      required: ['action'],
    },
  },
];

// --- Existing Content Generation ---

export const analyzeFridgeImage = async (base64Image: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "List every visible food ingredient in this fridge photo as a simple comma-separated list. Be thorough but only list real food items." }
      ]
    }
  });
  const text = response.text || "";
  return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
};

export const generateRecipes = async (ingredients: string[], restrictions: DietaryRestriction[]): Promise<Recipe[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Generate 5 creative recipes using some or all of these ingredients: ${ingredients.join(', ')}. 
    Filter for these dietary restrictions: ${restrictions.join(', ')}. 
    Include detailed step-by-step instructions, calculated nutritional facts (per serving), and 3 realistic simulated user reviews for each recipe.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  amount: { type: Type.STRING }
                },
                required: ["name"]
              }
            },
            instructions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            difficulty: { type: Type.STRING },
            prepTime: { type: Type.STRING },
            calories: { type: Type.NUMBER },
            dietaryInfo: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            imagePrompt: { type: Type.STRING },
            nutritionalFacts: {
              type: Type.OBJECT,
              properties: {
                protein: { type: Type.STRING },
                carbs: { type: Type.STRING },
                fat: { type: Type.STRING },
                fiber: { type: Type.STRING }
              },
              required: ["protein", "carbs", "fat", "fiber"]
            },
            reviews: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  user: { type: Type.STRING },
                  rating: { type: Type.NUMBER },
                  comment: { type: Type.STRING }
                },
                required: ["user", "rating", "comment"]
              }
            }
          },
          required: ["id", "title", "description", "ingredients", "instructions", "difficulty", "prepTime", "calories", "dietaryInfo", "imagePrompt", "nutritionalFacts", "reviews"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse recipes JSON", e);
    return [];
  }
};

export const findNearbyStores = async (ingredient: string, lat?: number, lng?: number): Promise<StoreLocation[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find 3 nearby grocery stores or supermarkets where I can buy ${ingredient}.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: lat && lng ? { latitude: lat, longitude: lng } : undefined
        }
      }
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks.map((chunk: any) => ({
    name: chunk.maps?.title || "Store",
    address: "",
    uri: chunk.maps?.uri || "#"
  })).slice(0, 3);
};

// --- Audio Utilities ---

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const speak = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) return;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const buffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
};
