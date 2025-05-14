/**
 * @typedef {Object} GenerateFeedbackTextParams
 * @property {string} transcript
 * @property {string} [command]
 * @property {string} [additionalContext]
 */

export class GenerateFeedbackTextService {
  /**
   * @param {import('./ai-strategies/GenerationAIStrategy.js').GenerationAIStrategy} strategy
   */
  constructor(strategy) {
    this.strategy = strategy;
  }

  /**
   * @param {Object} params
   * @param {string} params.transcript
   * @returns {Promise<string>}
   */
  async generateFeedbackText(params) {
    const { transcript } = params;
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('文字起こしテキストが空です');
    }
    const prompt = this.buildPrompt(transcript);
    return await this.strategy.generateText(prompt);
  }

  /**
   * @private
   */
  buildPrompt(transcript) {
    let prompt = `以下は営業トークの文字起こしです。良かった点・改善点をフィードバックしてください。\n\n${transcript}`;
    return prompt;
  }
} 