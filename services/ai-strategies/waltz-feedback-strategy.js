// services/ai-strategies/waltz-feedback-strategy.js
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptFilePath = path.join(__dirname, '../../prompts/waltz_prompt.txt');

/**
 * Waltzフィードバック用のプロンプトパーツを準備する
 * @param {Array<Object>} uploadedFiles - アップロードされたファイル情報 (Gemini APIレスポンス形式)
 *                                        この戦略ではメディアファイルのみが含まれる想定
 * @param {string | null} additionalContext - Slackメッセージからの追加コンテキスト
 * @returns {Array<Object>} - Gemini APIに渡すプロンプトパーツの配列
 */
function preparePromptParts(uploadedFiles, additionalContext) {
  logger.info('Preparing prompt parts for Waltz Feedback Strategy...');

  if (!uploadedFiles || uploadedFiles.length === 0) {
    logger.error('WaltzFeedbackStrategy: No uploaded files provided.');
    throw new Error('WaltzFeedbackStrategy requires at least one uploaded file.');
  }

  // この戦略ではメディアファイルのみを期待する
  const mediaFile = uploadedFiles.find(file => file && file.uri); // file.uri を持つものを探す (修正)
  if (!mediaFile) {
    logger.error('WaltzFeedbackStrategy: Valid media file not found in uploadedFiles.', { uploadedFiles });
    throw new Error('WaltzFeedbackStrategy could not find a valid media file.');
  }
  logger.info(`WaltzFeedbackStrategy: Using media file: ${mediaFile.fileUri}`);

  let promptText;
  try {
    promptText = fs.readFileSync(promptFilePath, 'utf8');
    logger.info(`Waltz prompt loaded successfully from ${promptFilePath}`);
  } catch (error) {
    logger.error(`Waltzプロンプトファイルの読み込みに失敗しました: ${promptFilePath}`, error);
    throw new Error(`Failed to read Waltz prompt file: ${error.message}`);
  }

  // 追加コンテキストがあればプロンプトに追記する（任意、必要に応じて調整）
  if (additionalContext) {
    promptText += `\n\n追加コンテキスト:\n${additionalContext}`;
    logger.info('Added additional context to the Waltz prompt.');
  }

  // Gemini APIの期待する形式でパーツを構築
  const promptParts = [
    {
      fileData: {
        mimeType: mediaFile.mimeType,
        fileUri: mediaFile.uri, // file.uri を使用 (修正)
      },
    },
    {
      text: promptText,
    },
  ];

  logger.info('Waltz prompt parts prepared successfully.');
  return promptParts;
}

export default {
  preparePromptParts,
};
