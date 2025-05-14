/**
 * @interface
 */
export class TranscriptionStrategy {
  /**
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async transcribe(filePath) {
    throw new Error('Not implemented');
  }
} 