// services/ai-strategies/matsuura-feedback-strategy.js
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 松浦さんAIフィードバック用のプロンプトパーツを準備する
 * @param {Array<Object>} uploadedFiles - Gemini APIにアップロードされたファイルの配列
 *                                      (想定される順序: mediaFile)
 * @param {string} commandContext - コマンドの追加コンテキスト (現在は未使用)
 * @returns {Array<Object>} - Gemini APIに渡す parts 配列
 */
function preparePromptParts(uploadedFiles, commandContext) {
  logger.info('Preparing prompt parts for Matsuura AI Feedback Strategy...');

  if (uploadedFiles.length < 1) {
    // 必要なファイルが不足している場合のエラー処理
    logger.error('MatsuuraFeedbackStrategy requires at least 1 uploaded file (media file).');
    throw new Error('Insufficient files for Matsuura AI feedback strategy.');
  }

  const promptFilePath = path.join(__dirname, '../../prompts/matsuura_prompt.txt'); // パスを修正
  const matsuuraPromptText = fs.readFileSync(promptFilePath, 'utf-8');

  const promptParts = [
    { // Slackからのファイル (音声/動画)
      fileData: {
        mimeType: uploadedFiles[0].mimeType, // 配列の最初の要素がメディアファイルと想定
        fileUri: uploadedFiles[0].uri,
      },
    },
    // 指示プロンプト
    { text: matsuuraPromptText },
  ];

  // TODO: commandContext をプロンプトに追加する処理 (必要であれば)

  return promptParts;
}

export default {
  preparePromptParts,
  // 必要であれば、この戦略固有の generationConfig を返す関数なども定義できる
  // getGenerationConfig: () => ({ temperature: 0.5, ... })
};
