// services/slackService.js
const { WebClient } = require('@slack/web-api');
const config = require('../config/config.js');
const logger = require('../utils/logger.js');

// Slack WebClient初期化
const web = new WebClient(config.SLACK_BOT_TOKEN);

/**
 * Slackにメッセージを投稿する
 * @param {Object} options - メッセージオプション
 * @param {string} options.channel - チャンネルID
 * @param {string} options.text - メッセージテキスト
 * @param {string} [options.thread_ts] - スレッドID
 * @param {Array} [options.blocks] - ブロックキット
 * @returns {Promise<Object>} - Slack APIレスポンス
 */
exports.postMessage = async ({ channel, text, thread_ts, blocks }) => {
  try {
    logger.info(`メッセージ投稿: channel=${channel}, thread=${thread_ts || 'なし'}`);
    
    const result = await web.chat.postMessage({
      channel,
      text,
      thread_ts,
      blocks,
    });
    
    logger.info(`メッセージ投稿完了: ts=${result.ts}`);
    return result;
  } catch (error) {
    logger.error(`メッセージ投稿中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
};

/**
 * スレッド内のファイルを取得する
 * @param {string} channel - チャンネルID
 * @param {string} threadTs - スレッドID
 * @returns {Promise<Array>} - ファイルオブジェクトの配列
 */
exports.getFilesInThread = async (channel, threadTs) => {
  try {
    logger.info(`スレッド内のファイル取得: channel=${channel}, thread=${threadTs}`);
    
    // スレッド内のメッセージを取得
    const conversationResult = await web.conversations.replies({
      channel,
      ts: threadTs,
    });
    
    if (!conversationResult.messages || conversationResult.messages.length === 0) {
      logger.warn('スレッド内にメッセージが見つかりません');
      return [];
    }
    
    // スレッド内の全メッセージからファイルを収集
    const files = [];
    
    for (const message of conversationResult.messages) {
      if (message.files && message.files.length > 0) {
        files.push(...message.files);
      }
    }
    
    logger.info(`スレッド内のファイル数: ${files.length}`);
    return files;
  } catch (error) {
    logger.error(`ファイル取得中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
};

/**
 * ファイルのダウンロードURLを取得する
 * @param {string} fileId - ファイルID
 * @returns {Promise<string>} - ダウンロードURL
 */
exports.getFileDownloadUrl = async (fileId) => {
  try {
    logger.info(`ファイル情報取得: fileId=${fileId}`);
    
    const result = await web.files.info({
      file: fileId
    });
    
    if (!result.file || !result.file.url_private_download) {
      throw new Error('ファイルのダウンロードURLが取得できませんでした');
    }
    
    return result.file.url_private_download;
  } catch (error) {
    logger.error(`ファイル情報取得中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
};
