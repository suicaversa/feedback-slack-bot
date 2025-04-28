import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'List 3 popular cookie recipes.',
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        'recipeName': {
                            type: Type.STRING,
                            description: 'Name of the recipe',
                            nullable: false,
                        },
                    },
                    required: ['recipeName'],
                },
            },
        },
    });

    console.debug(response.text);
}

main();

// Response Example:
// [
//     {
//       "recipeName": "Chocolate Chip Cookies"
//     },
//     {
//       "recipeName": "Peanut Butter Cookies"
//     },
//     {
//       "recipeName": "Sugar Cookies"
//     },
//     {
//       "recipeName": "Oatmeal Raisin Cookies"
//     }
//   ]