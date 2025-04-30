// utils/commandParser.js
const logger = require('./logger.js');

/**
 * メンションメッセージからコマンドを解析する
 * @param {string} text - メンションメッセージテキスト
 * @returns {Object} - コマンド情報 { isValid: boolean, action: string | null, context: string | null }
 *                    action: 'clip', 'feedback', 'matsuura_feedback', or null if invalid
 */
exports.parseCommand = (text) => {
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
    let commandFound = false;
    for (const mapping of commandMappings) {
      for (const keyword of mapping.keywords) {
        // キーワードがテキストのどこかに含まれているか確認 (より柔軟に)
        // 大文字小文字を区別しない
        if (cleanedText.toLowerCase().includes(keyword.toLowerCase())) {
          action = mapping.action;
          // コンテキストは、キーワードに関わらず cleanedText 全体とする
          // (切り抜きの場合、時間情報はコンテキスト全体から抽出するため)
          context = cleanedText;
          commandFound = true;
          logger.info(`キーワード "${keyword}" を検出、アクションを "${action}" に設定。`);
          break; // 最初に見つかった優先度の高いコマンドで決定
        }
      }
      if (commandFound) break;
    }

    // コマンドキーワードが見つからなかった場合
    if (!commandFound) {
      // キーワードが含まれていなくても、何らかのテキストがあればデフォルトアクションを実行
      action = defaultAction;
      context = cleanedText;
      logger.info(`特定のコマンドキーワードが見つかりません。デフォルトアクション "${action}" を使用します。`);
    }

    logger.info(`コマンド解析結果: action=${action}, context=${context || 'なし'}`);

    return {
      isValid,
      action, // 'clip', 'feedback', 'matsuura_feedback', 'waltz_feedback'
      context: context || null // Context is the full text after mention removal
    };
  } catch (error) {
    logger.error(`コマンド解析中にエラーが発生しました: ${error.message}`, { error });
    return {
      isValid: false,
      action: null,
      context: null
    };
  }
};
