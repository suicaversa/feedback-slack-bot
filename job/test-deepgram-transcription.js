// job/test-deepgram-transcription.js
// Deepgram話者分離付き文字起こしサービスのテスト
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { DeepgramTranscriptionStrategy } from '../services/transcription-strategies/DeepgramTranscriptionStrategy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テスト用音声ファイル（wav/mp3/oggなどDeepgram対応形式）
const testFilePath = path.join(__dirname, '../tmp/sample.mp4'); // mp4ファイルに変更

async function runTest() {
  logger.info('--- Deepgram Transcription Test Start ---');
  logger.info(`テストファイル: ${testFilePath}`);

  try {
    const strategy = new DeepgramTranscriptionStrategy();
    const result = await strategy.transcribe(testFilePath);
    logger.info('--- Transcription Result ---');
    console.log(result);
    logger.info('---------------------------');
  } catch (error) {
    logger.error('文字起こしテスト中にエラーが発生しました:', error);
  } finally {
    logger.info('--- Deepgram Transcription Test End ---');
  }
}

runTest(); 