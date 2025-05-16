// utils/command-parser.js
import logger from './logger.js';

/**
 * メンションメッセージからコマンドを解析する
 * @param {string} text - メンションメッセージテキスト
 * @returns {Object} - コマンド情報 { isValid: boolean, action: string | null, context: string | null }
 *                    action: 'clip', 'feedback', 'matsuura_feedback', 'transcribe_and_summarize', or null if invalid
 */
function parseCommand(text) {
  try {
    // メンション部分を除去
    const mentionRegex = /<@[A-Z0-9]+>/;
    const cleanedText = text.replace(mentionRegex, '').trim();

    // デフォルトアクションを設定
    const defaultAction = 'feedback';
    let action = defaultAction;
    let context = cleanedText;
    let isValid = true;

    // 1行目・2行目以降で分割
    const [firstLine, ...restLines] = cleanedText.split(/\r?\n/).map(line => line.trim());
    const restText = restLines.join('\n').trim();

    // コマンドキーワードとアクションタイプを定義
    const commandMappings = [
      { action: 'transcribe_and_summarize', keywords: ['文字起こし', '文字起こしして', 'transcribe', 'transcription'] },
      { action: 'clip', keywords: ['切り抜き', 'カット', 'cut', 'clip'] },
      { action: 'matsuura_feedback', keywords: ['松浦さんAIでフィードバック', '松浦さんAI', '松浦さん'] },
      { action: 'waltz_feedback', keywords: ['ワルツ', 'アポアポ'] },
      { action: 'feedback', keywords: ['フィードバック', 'FB', 'fb'] },
    ];

    // メンションのみの場合の処理
    if (!cleanedText) {
      action = defaultAction;
      context = null;
      logger.info(`コマンド解析 (メンションのみ): action=${action}`);
      return { isValid, action, context };
    }

    // 1行目でコマンド判定
    for (const mapping of commandMappings) {
      if (mapping.keywords.some(keyword => firstLine.includes(keyword))) {
        action = mapping.action;
        // 文字起こし系のみ2行目以降をcontextに
        if (action === 'transcribe_and_summarize') {
          context = restText || null;
        } else {
          context = cleanedText;
        }
        break;
      }
    }

    logger.info(`コマンド解析: action=${action}, context=${context}`);
    return { isValid, action, context };
  } catch (error) {
    logger.error(`コマンド解析中にエラーが発生しました: ${error.message}`);
    return { isValid: false, action: null, context: null };
  }
}

export default { parseCommand };
