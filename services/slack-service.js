// services/slack-service.js
import { WebClient } from '@slack/web-api';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

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
async function postMessage({ channel, text, thread_ts, blocks }) {
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
}

/**
 * Slackにファイルをアップロードする
 * @param {object} options - アップロードオプション
 * @param {string} options.channels - 投稿先のチャンネルID (カンマ区切りも可)
 * @param {string} [options.thread_ts] - 投稿するスレッドのタイムスタンプ
 * @param {string} options.filePath - アップロードするファイルのローカルパス
 * @param {string} [options.filename] - Slack上でのファイル名 (指定なければ元ファイル名)
 * @param {string} [options.initial_comment] - ファイルに添えるコメント
 * @param {string} [options.title] - ファイルのタイトル
 * @returns {Promise<object>} - Slack APIレスポンス (files.uploadV2)
 */
export async function uploadFile({ channels, thread_ts, filePath, filename, initial_comment, title }) {
  try {
    const fileReadStream = fs.createReadStream(filePath);
    const effectiveFilename = filename || path.basename(filePath);
    logger.info(`ファイルアップロード開始: channels=${channels}, thread=${thread_ts || 'なし'}, filename=${effectiveFilename}`);

    // files.uploadV2 を使用 (推奨)
    const result = await web.files.uploadV2({
      channel_id: channels, // v2では channel_id を使用
      thread_ts: thread_ts,
      file: fileReadStream,
      filename: effectiveFilename,
      initial_comment: initial_comment,
      title: title,
    });

    // uploadV2 のレスポンス構造は upload と異なる場合があるため注意
    // 成功した場合、result.files 配列にアップロードされたファイル情報が含まれることが多い
    if (result.ok && result.files && result.files.length > 0) {
        logger.info(`ファイルアップロード成功: fileId=${result.files[0].id}, permalink=${result.files[0].permalink}`);
    } else if (result.ok) {
        // レスポンス構造が予期しない場合
        logger.warn('ファイルアップロードは成功しましたが、レスポンス構造が予期したものではありませんでした。', { result });
    } else {
        // APIがエラーを返した場合
        logger.error('ファイルアップロードAPIがエラーを返しました。', { result });
        throw new Error(`ファイルアップロードに失敗しました: ${result.error || 'Unknown error'}`);
    }

    return result;
  } catch (error) {
    logger.error(`ファイルアップロード中にエラーが発生しました: ${error.message}`, { error, filePath });
    // エラーオブジェクトに Slack API からの詳細が含まれているか確認
    if (error.data) {
        logger.error('Slack API Error Data:', error.data);
    }
    throw error;
  }
};

/**
 * スレッド内のファイルを取得する
 * @param {string} channel - チャンネルID
 * @param {string} threadTs - スレッドID
 * @returns {Promise<Array>} - ファイルオブジェクトの配列
 */
export async function getFilesInThread(channel, threadTs) {
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
export async function getFileDownloadUrl(fileId) {
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

export default { postMessage, getFilesInThread, getFileDownloadUrl, uploadFile };
