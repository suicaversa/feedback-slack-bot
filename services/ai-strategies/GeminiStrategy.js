import { GenerationAIStrategy } from './GenerationAIStrategy.js';
import { GoogleGenAI } from '@google/genai';

export class GeminiStrategy extends GenerationAIStrategy {
  /**
   * @param {string} apiKey
   * @param {string} [modelName]
   */
  constructor(apiKey, modelName = 'gemini-1.5-pro') {
    super();
    this.genAI = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async generateText(prompt) {
    const config = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: 'text/plain',
    };
    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];
    const responseStream = await this.genAI.models.generateContentStream({
      model: this.modelName,
      config,
      contents,
    });
    let responseText = '';
    for await (const chunk of responseStream) {
      if (chunk.text) responseText += chunk.text;
    }
    return responseText;
  }
} 