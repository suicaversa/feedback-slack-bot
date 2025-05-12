// utils/command-parser.js
import logger from './logger.js';

/**
 * メンションメッセージからコマンドを解析する
 * @param {string} text - メンションメッセージテキスト
 * @returns {Object} - コマンド情報 { isValid: boolean, action: string | null, context: string | null }
 *                    action: 'clip', 'feedback', 'matsuura_feedback', or null if invalid
 */
function parseCommand(text) {
  try {
    // メンション部分を除去
    const mentionRegex = /<@[A-Z0-9]+>/;
    const cleanedText = text.replace(mentionRegex, '').trim();

    // デフォルトアクションを設定
    const defaultAction = 'feedback'; // Use action types
    let action = defaultAction;
    let context = cleanedText; // Default context is the entire cleaned text
    let isValid = true; // Assume valid if mention exists

    // コマンドキーワードとアクションタイプを定義
    // 優先度順に定義 (例: "切り抜きフィードバック" は "切り抜き" と判定)
    const commandMappings = [
      { action: 'clip', keywords: ['切り抜き', 'カット', 'cut', 'clip'] },
      { action: 'matsuura_feedback', keywords: ['松浦さんAIでフィードバック', '松浦さんAI', '松浦さん'] },
      { action: 'waltz_feedback', keywords: ['ワルツ', 'アポアポ'] }, // Waltzフィードバックを追加
      { action: 'feedback', keywords: ['フィードバック', 'FB', 'fb'] }, // 通常のフィードバック (優先度低)
    ];

    // メンションのみの場合の処理
    if (!cleanedText) {
      action = defaultAction;
      context = null; // No context
      logger.info(`コマンド解析 (メンションのみ): action=${action}`);
      return { isValid, action, context };
    }

    // コマンドの判定とコンテキスト抽出
    for (const mapping of commandMappings) {
      if (mapping.keywords.some(keyword => cleanedText.includes(keyword))) {
        action = mapping.action;
        break;
      }
    }
    context = cleanedText;

    logger.info(`コマンド解析: action=${action}, context=${context}`);
    return { isValid, action, context };
  } catch (error) {
    logger.error(`コマンド解析中にエラーが発生しました: ${error.message}`);
    return { isValid: false, action: null, context: null };
  }
}

export default { parseCommand };
