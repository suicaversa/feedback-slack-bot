import { GoogleGenAI } from '@google/genai';
import * as geminiFileService from '../gemini-file-service.js';

export class GeminiService {
  /**
   * @param {string} apiKey
   * @param {string} [modelName]
   */
  constructor(apiKey, modelName = 'gemini-2.5-pro-preview-05-06') {
    this.genAI = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  /**
   * @param {Object[]} contents - Gemini APIのcontents構造
   * @param {Object} [options]
   * @param {string[]} [options.files] - アップロードしたいファイルパス配列
   * @param {Object} [options.config] - 追加の生成パラメータ
   * @returns {Promise<string>}
   */
  async generateContent({ contents, files = [], config = {} }) {
    let uploadedFiles = [];
    try {
      // ファイルアップロード
      if (files.length > 0) {
        uploadedFiles = await Promise.all(
          files.map(filePath => geminiFileService.uploadFile(filePath))
        );
        // 最後のrole: 'user'のpartsにfileDataを追加
        const lastUserContent = [...contents].reverse().find(c => c.role === 'user');
        if (lastUserContent && lastUserContent.parts) {
          uploadedFiles.forEach(f => {
            lastUserContent.parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.uri } });
          });
        }
      }
      const defaultConfig = {
        temperature: 1,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain',
      };
      const mergedConfig = { ...defaultConfig, ...config };
      const responseStream = await this.genAI.models.generateContentStream({
        model: this.modelName,
        config: mergedConfig,
        contents,
      });
      let responseText = '';
      for await (const chunk of responseStream) {
        if (chunk.text) responseText += chunk.text;
      }
      return responseText;
    } finally {
      // アップロードファイルのクリーンアップ
      if (uploadedFiles.length > 0) {
        await geminiFileService.deleteFiles(uploadedFiles);
      }
    }
  }
} 