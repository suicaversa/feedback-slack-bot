// services/ai-strategies/default-feedback-strategy.js
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger.js'); // パスを修正

/**
 * デフォルトフィードバック用のプロンプトパーツを準備する
 * @param {Array<Object>} uploadedFiles - Gemini APIにアップロードされたファイルの配列
 *                                      (想定される順序: evaluate.pdf, sales.pdf, mediaFile)
 * @param {string} commandContext - コマンドの追加コンテキスト (現在は未使用)
 * @returns {Array<Object>} - Gemini APIに渡す parts 配列
 */
function preparePromptParts(uploadedFiles, commandContext) {
  logger.info('Preparing prompt parts for Default Feedback Strategy...');

  if (uploadedFiles.length < 3) {
    // 必要なファイルが不足している場合のエラー処理
    logger.error('DefaultFeedbackStrategy requires at least 3 uploaded files (2 PDFs + 1 media).');
    throw new Error('Insufficient files for default feedback strategy.');
  }

  const promptFilePath = path.join(__dirname, '../../prompts/main_prompt.txt'); // パスを修正
  const mainPromptText = fs.readFileSync(promptFilePath, 'utf-8');

  const promptParts = [
    { // ドキュメント1 (evaluate.pdf)
      fileData: {
        mimeType: uploadedFiles[0].mimeType,
        fileUri: uploadedFiles[0].uri,
      },
    },
    { // ドキュメント2 (sales.pdf)
      fileData: {
        mimeType: uploadedFiles[1].mimeType,
        fileUri: uploadedFiles[1].uri,
      },
    },
    { // Slackからのファイル (音声/動画)
      fileData: {
        mimeType: uploadedFiles[2].mimeType,
        fileUri: uploadedFiles[2].uri,
      },
    },
    // 指示プロンプト
    { text: mainPromptText },
  ];

  // TODO: commandContext をプロンプトに追加する処理 (必要であれば)

  return promptParts;
}

module.exports = {
  preparePromptParts,
  // 必要であれば、この戦略固有の generationConfig を返す関数なども定義できる
  // getGenerationConfig: () => ({ temperature: 0.8, ... })
};
