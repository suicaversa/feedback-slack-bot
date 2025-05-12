// services/storage-service.js
import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Google Cloud Storageクライアントの初期化
const storage = new Storage();
const bucketName = config.GCS_BUCKET_NAME;

/**
 * ファイルをGCSにアップロードする
 * @param {string} filePath - ローカルファイルパス
 * @param {string} channelId - チャンネルID
 * @param {string} threadTs - スレッドタイムスタンプ
 * @returns {Promise<string>} - GCSファイルURI
 */
async function uploadFile(filePath, channelId, threadTs) {
  try {
    logger.info(`GCSアップロード開始: ${path.basename(filePath)}, channel=${channelId}, thread=${threadTs}`);
    
    // バケットの存在確認
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      throw new Error(`バケットが存在しません: ${bucketName}`);
    }
    
    // ファイル名衝突を避けるためにUUIDを使用し、チャンネル/スレッド情報をパスに含める
    // スレッドTSには '.' が含まれるため、ファイルシステムで安全な文字に置換 (例: '_')
    const safeThreadTs = threadTs.replace(/\./g, '_');
    const fileExtension = path.extname(filePath);
    const destFileName = `slack-processing/${channelId}-${safeThreadTs}/${uuidv4()}${fileExtension}`;
    
    // ファイルをアップロード
    await bucket.upload(filePath, {
      destination: destFileName,
      metadata: {
        cacheControl: 'private, max-age=0',
      },
    });
    
    const gcsUri = `gs://${bucketName}/${destFileName}`;
    logger.info(`GCSアップロード完了: ${gcsUri}`);
    
    return gcsUri;
  } catch (error) {
    logger.error(`GCSアップロード中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * GCSからファイルをダウンロードする
 * @param {string} gcsUri - GCSファイルURI
 * @param {string} [destPath] - 保存先パス（省略時は一時ディレクトリ）
 * @returns {Promise<string>} - ローカルファイルパス
 */
export async function downloadFile(gcsUri, destPath) {
  try {
    logger.info(`GCSダウンロード開始: ${gcsUri}`);
    
    // GCS URIをパース
    const parsedUri = parseGcsUri(gcsUri);
    if (!parsedUri) {
      throw new Error(`無効なGCS URI: ${gcsUri}`);
    }
    
    const { bucketName, fileName } = parsedUri;
    
    // 保存先ファイルパスを決定
    let localFilePath;
    if (destPath) {
      localFilePath = destPath;
    } else {
      const tempDir = path.join(require('os').tmpdir(), 'slack-bot-files');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      localFilePath = path.join(tempDir, path.basename(fileName));
    }
    
    // ファイルをダウンロード
    await storage
      .bucket(bucketName)
      .file(fileName)
      .download({ destination: localFilePath });
    
    logger.info(`GCSダウンロード完了: ${localFilePath}`);
    
    return localFilePath;
  } catch (error) {
    logger.error(`GCSダウンロード中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * GCSからファイルを削除する
 * @param {string} gcsUri - GCSファイルURI
 * @returns {Promise<void>}
 */
export async function deleteFile(gcsUri) {
  try {
    logger.info(`GCS削除開始: ${gcsUri}`);
    
    // GCS URIをパース
    const parsedUri = parseGcsUri(gcsUri);
    if (!parsedUri) {
      throw new Error(`無効なGCS URI: ${gcsUri}`);
    }
    
    const { bucketName, fileName } = parsedUri;
    
    // ファイルを削除
    await storage
      .bucket(bucketName)
      .file(fileName)
      .delete();
    
    logger.info(`GCS削除完了: ${gcsUri}`);
  } catch (error) {
    // 削除エラーはログに記録するが、処理は継続
    logger.warn(`GCS削除中にエラーが発生しました: ${error.message}`, { error });
  }
}

/**
 * GCS URIをパースする
 * @param {string} gcsUri - GCSファイルURI (例: gs://bucket-name/path/to/file.txt)
 * @returns {Object|null} - バケット名とファイル名のオブジェクト、または無効な場合はnull
 */
function parseGcsUri(gcsUri) {
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  
  return {
    bucketName: match[1],
    fileName: match[2],
  };
}

export default { uploadFile };
