/**
 * @typedef {import('./transcription-strategies/TranscriptionStrategy.js').TranscriptionStrategy} TranscriptionStrategy
 */

export class TranscriptionService {
  /**
   * @param {TranscriptionStrategy} strategy
   */
  constructor(strategy) {
    this.strategy = strategy;
  }

  /**
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async transcribe(filePath) {
    return await this.strategy.transcribe(filePath);
  }
} 