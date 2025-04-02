// utils/commandParser.js
const logger = require('./logger');

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
    
    if (!cleanedText) {
      return {
        isValid: false,
        action: null,
        context: null
      };
    }
    
    // コマンドキーワード（複数パターンに対応）
    const commands = {
      '要約': ['要約', '要約して', 'サマリー', 'まとめて'],
      '議事録': ['議事録', '議事録作成', '議事録を作成', 'minutes'],
      '分析': ['分析', '分析して', '解析', 'analyze'],
      'トランスクリプト': ['テキスト化', '文字起こし', 'トランスクリプト', '書き起こし']
    };
    
    // デフォルトコマンド（何も指定がない場合）
    let action = '要約';
    let isValid = true;
    
    // コマンドの判定
    for (const [cmd, keywords] of Object.entries(commands)) {
      for (const keyword of keywords) {
        if (cleanedText.includes(keyword)) {
          action = cmd;
          break;
        }
      }
    }
    
    // コマンド以外のコンテキスト部分を抽出
    let context = cleanedText;
    for (const [_, keywords] of Object.entries(commands)) {
      for (const keyword of keywords) {
        context = context.replace(keyword, '').trim();
      }
    }
    
    if (context === cleanedText) {
      // キーワードが見つからなかった場合、全体をコンテキストとして扱う
      context = cleanedText;
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
