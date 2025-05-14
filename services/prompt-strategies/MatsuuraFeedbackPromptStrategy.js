import { GeminiService } from '../ai-services/GeminiService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export class MatsuuraFeedbackPromptStrategy {
  constructor() {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiService = new GeminiService(geminiApiKey);
    const __filename = fileURLToPath(import.meta.url);
    this.__dirname = path.dirname(__filename);
  }

  /**
   * @param {string} transcript
   * @returns {Promise<string>}
   */
  async generateFeedback(transcript) {
    // プロンプト
    const promptFilePath = path.join(this.__dirname, '../../prompts/matsuura_prompt.txt');
    const matsuuraPromptText = fs.readFileSync(promptFilePath, 'utf-8');
    const contents = [
      {
        role: 'user',
        parts: [
          { text: matsuuraPromptText },
          { text: transcript }
        ]
      }
    ];
    return await this.geminiService.generateContent({ contents });
  }
} 