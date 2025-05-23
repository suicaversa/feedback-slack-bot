// services/file-service.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import slackService from './slack-service.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * 対象の音声/動画ファイルを探す
 * @param {Array} files - ファイルオブジェクトの配列
 * @returns {Object|null} - 対象ファイルまたはnull
 */
function findTargetMediaFile(files) {
  if (!files || files.length === 0) {
    return null;
  }
  // 対応するメディアファイルの拡張子
  const mediaExtensions = [
    'mp3', 'm4a', 'wav', 'ogg', 'flac', // 音声
    'mp4', 'mov', 'avi', 'webm', 'mkv'  // 動画
  ];
  // 対象ファイルを探す（最新のもの優先）
  const mediaFiles = files
    .filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      return mediaExtensions.includes(extension);
    })
    // Sort by creation timestamp in ascending order (oldest first)
    .sort((a, b) => new Date(a.created) - new Date(b.created));
  // Return the first element, which is now the oldest media file
  return mediaFiles.length > 0 ? mediaFiles[0] : null;
}

/**
 * ファイルをダウンロードする
 * @param {Object} file - ファイルオブジェクト
 * @param {string} channelId - チャンネルID
 * @param {string} threadTs - スレッドタイムスタンプ
 * @returns {Promise<string>} - ローカルファイルパス
 */
async function downloadFile(file, channelId, threadTs) {
  try {
    logger.info(`ファイルダウンロード開始: ${file.name}, channel=${channelId}, thread=${threadTs}`);

    // ダウンロードURLを取得
    const downloadUrl = await slackService.getFileDownloadUrl(file.id);

    // 一時ファイルパスを作成 (チャンネルIDとスレッドTSを使用)
    // スレッドTSには '.' が含まれるため、ファイルシステムで安全な文字に置換 (例: '_')
    const safeThreadTs = threadTs.replace(/\./g, '_');
    const tempDir = path.join(os.tmpdir(), 'slack-processing', `${channelId}-${safeThreadTs}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.info(`一時ディレクトリ作成: ${tempDir}`);
    }

    // ファイル名衝突を避けるためにUUIDをプレフィックスとして使用
    const safeFileName = `${uuidv4()}-${path.basename(file.name)}`;
    const localFilePath = path.join(tempDir, safeFileName);

    // ファイルをダウンロード
    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${config.SLACK_BOT_TOKEN}`
      }
    });

    // ファイルを保存
    const writer = fs.createWriteStream(localFilePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        logger.info(`ファイルダウンロード完了: ${localFilePath}`);
        resolve(localFilePath);
      });
      writer.on('error', (err) => {
        logger.error(`ファイル保存中にエラーが発生しました: ${err.message}`, { error: err });
        reject(err);
      });
    });
  } catch (error) {
    logger.error(`ファイルダウンロード中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 一時ファイルをクリーンアップする
 * @param {string} filePath - ファイルパス
 * @returns {Promise<void>}
 */
async function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`一時ファイルを削除しました: ${filePath}`);
    }
  } catch (error) {
    // クリーンアップエラーはログに記録するが、処理は継続
    logger.warn(`一時ファイルの削除中にエラーが発生しました: ${error.message}`, { error });
  }
}

export default { findTargetMediaFile, downloadFile, cleanupTempFile };
