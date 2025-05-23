import { GeminiService } from '../ai-services/GeminiService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export class DefaultFeedbackPromptStrategy {
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
    const promptFilePath = path.join(this.__dirname, '../../prompts/main_prompt.txt');
    let mainPromptText = fs.readFileSync(promptFilePath, 'utf-8');
    // <transcript> を transcript で置換
    mainPromptText = mainPromptText.replace(/<transcript>/g, transcript);
    const contents = [
      {
        role: 'user',
        parts: [
          { text: mainPromptText }
        ]
      }
    ];
    console.debug('prompt', mainPromptText);
    return await this.geminiService.generateContent({ contents });
  }
} 