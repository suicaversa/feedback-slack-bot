// job/test-feedback-job.js
// このスクリプトは、aiService.processMediaFile を直接呼び出して
// 'waltz_feedback' モードの動作をテストします。

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import aiService from '../services/ai-service.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テスト用パラメータ
const testFilePath = path.join(__dirname, '../tmp/failed_sample.mp4'); // テスト用音声ファイル
const testFileType = 'mp3';
const testCommand = process.argv[2] || 'waltz_feedback'; // コマンドライン引数対応
const testAdditionalContext = 'これはテスト用の追加コンテキストです。'; // 必要に応じて設定
const testChannelId = 'C12345TEST'; // ダミー値
const testThreadTs = '1234567890.123456'; // ダミー値

async function runTest() {
  logger.info('--- Waltz Feedback Test Script Start ---');
  logger.info(`テストファイル: ${testFilePath}`);
  logger.info(`コマンド: ${testCommand}`);

  try {
    const result = await aiService.processMediaFile({
      filePath: testFilePath,
      fileType: testFileType,
      command: testCommand,
      additionalContext: testAdditionalContext,
      channelId: testChannelId, // ログ用
      threadTs: testThreadTs,   // ログ用
    });

    logger.info('--- AI Service Result ---');
    console.log(result); // 結果をコンソールに出力
    logger.info('-------------------------');

  } catch (error) {
    logger.error('テスト実行中にエラーが発生しました:', error);
  } finally {
    logger.info('--- Waltz Feedback Test Script End ---');
  }
}

// テストを実行
runTest();
