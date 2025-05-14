/**
 * @interface
 */
export class GenerationAIStrategy {
  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async generateText(prompt) {
    throw new Error('Not implemented');
  }
} 