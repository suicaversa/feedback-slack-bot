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
    // PDFファイルパス
    const files = [
      path.join(this.__dirname, '../../assets/how_to_evaluate.pdf'),
      path.join(this.__dirname, '../../assets/how_to_sales.pdf'),
    ];
    // プロンプト
    const promptFilePath = path.join(this.__dirname, '../../prompts/main_prompt.txt');
    const mainPromptText = fs.readFileSync(promptFilePath, 'utf-8');
    const contents = [
      {
        role: 'user',
        parts: [
          { text: mainPromptText },
          { text: transcript }
        ]
      }
    ];
    return await this.geminiService.generateContent({ contents, files });
  }
} 