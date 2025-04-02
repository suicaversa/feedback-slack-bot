// utils/commandParser.js
const logger = require('./logger.js');

/**
 * メンションメッセージからコマンドを解析する
 * @param {string} text - メンションメッセージテキスト
 * @returns {Object} - コマンド情報
 */
exports.parseCommand = (text) => {
  try {
    // メンション部分を除去
    const mentionRegex = /<@[A-Z0-9]+>/;
    const cleanedText = text.replace(mentionRegex, '').trim();

    // デフォルトコマンドを設定
    const defaultAction = 'フィードバック';
    let action = defaultAction;
    let context = cleanedText; // デフォルトでは cleanedText 全体をコンテキストとする
    let isValid = true; // 基本的にメンションがあれば有効とする

    // コマンドキーワードを定義（現在はフィードバックのみ）
    const commands = {
      'フィードバック': ['フィードバック', 'FB', 'fb'], // 必要に応じてキーワード追加
      // '松浦さんAIでフィードバック': ['松浦さんAI', '松浦さん'] // 将来の拡張用例
    };

    // メンションのみの場合の処理
    if (!cleanedText) {
      action = defaultAction;
      context = null; // コンテキストなし
      logger.info(`コマンド解析 (メンションのみ): action=${action}`);
      return { isValid, action, context };
    }

    // コマンドの判定とコンテキスト抽出
    let commandFound = false;
    for (const [cmd, keywords] of Object.entries(commands)) {
      for (const keyword of keywords) {
        // キーワードがテキストの先頭または末尾、あるいはスペースで区切られているか確認
        const regex = new RegExp(`(^|\\s)${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
        if (regex.test(cleanedText)) {
          action = cmd;
          // マッチしたキーワードと前後の空白を除去してコンテキストを抽出
          context = cleanedText.replace(regex, '$1$2').trim(); // マッチ部分を除去
          commandFound = true;
          break;
        }
      }
      if (commandFound) break;
    }

    // コマンドが見つからなかった場合、actionはデフォルトのまま、contextはcleanedTextのまま
    if (!commandFound) {
        action = defaultAction;
        context = cleanedText; // キーワードが含まれていないので全体がコンテキスト
    }

    logger.info(`コマンド解析: action=${action}, context=${context || 'なし'}`);
    
    return {
      isValid,
      action,
      context: context || null
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
