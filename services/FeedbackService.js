/**
 * @typedef {import('./TranscriptionService.js').TranscriptionService} TranscriptionService
 * @typedef {import('./GenerateFeedbackTextService.js').GenerateFeedbackTextService} GenerateFeedbackTextService
 */

import { TranscriptionService } from './TranscriptionService.js';
import { DeepgramTranscriptionStrategy } from './transcription-strategies/DeepgramTranscriptionStrategy.js';
import { GenerateFeedbackTextService } from './GenerateFeedbackTextService.js';
import { GeminiStrategy } from './ai-strategies/GeminiStrategy.js';
import { DefaultFeedbackPromptStrategy } from './prompt-strategies/DefaultFeedbackPromptStrategy.js';
import { MatsuuraFeedbackPromptStrategy } from './prompt-strategies/MatsuuraFeedbackPromptStrategy.js';
import { WaltzFeedbackPromptStrategy } from './prompt-strategies/WaltzFeedbackPromptStrategy.js';
import { GeminiService } from './ai-services/GeminiService.js';

export class FeedbackService {
  constructor() {
    this.transcriptionService = new TranscriptionService(new DeepgramTranscriptionStrategy());
    this.strategies = {
      feedback: new DefaultFeedbackPromptStrategy(),
      matsuura_feedback: new MatsuuraFeedbackPromptStrategy(),
      waltz_feedback: new WaltzFeedbackPromptStrategy(),
    };
  }

  /**
   * @param {string} filePath
   * @param {string} [command]
   * @returns {Promise<string>}
   */
  async generateFeedback(filePath, command = 'feedback') {
    const transcript = await this.transcriptionService.transcribe(filePath);
    const strategy = this.strategies[command];
    if (!strategy) throw new Error(`未対応のコマンドです: ${command}`);
    return await strategy.generateFeedback(transcript);
  }
} 