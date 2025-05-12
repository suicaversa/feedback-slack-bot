// test-ai-service.js
// ai-service.js の processMediaFile 関数を直接呼び出してテストするためのスクリプト
// 使い方: node test-ai-service.js <ファイルパス>

import 'dotenv/config'; // .env ファイルから環境変数を読み込む
import path from 'path';
import { processMediaFile } from './services/ai-service.js';
import logger from './utils/logger.js'; // ログ出力用にloggerも使う

// --- 設定 ---
const TEST_COMMAND = 'フィードバック'; // デフォルトのフィードバックコマンドを使用
// --------------------------------------------------------------------------

async function runTest() {
  // コマンドライン引数からファイルパスを取得
  const args = process.argv.slice(2); // node と スクリプト名を除いた引数を取得
  if (args.length === 0) {
    logger.error('エラー: テスト対象のファイルパスをコマンドライン引数として指定してください。');
    logger.info('使い方: node test-ai-service.js <ファイルパス>');
    return;
  }
  const TEST_FILE_PATH = args[0];

  if (!process.env.GEMINI_API_KEY) {
    logger.error('エラー: .env ファイルに GEMINI_API_KEY を設定してください。');
    return;
  }

  // ファイルパスからファイルタイプ (拡張子) を簡易的に推定
  const fileExtension = path.extname(TEST_FILE_PATH).substring(1).toLowerCase();
  if (!fileExtension) {
      logger.error(`エラー: ファイルパスから拡張子を取得できませんでした: ${TEST_FILE_PATH}`);
      return;
  }
  const fileType = fileExtension; // 例: 'mp4', 'mp3'

  logger.info(`テスト開始:`);
  logger.info(`  ファイル: ${TEST_FILE_PATH}`);
  logger.info(`  コマンド: ${TEST_COMMAND}`);
  logger.info(`  ファイルタイプ (推定): ${fileType}`);

  try {
    const result = await processMediaFile({
      filePath: TEST_FILE_PATH,
      fileType: fileType,
      command: TEST_COMMAND,
      additionalContext: 'ローカルテスト実行 (test-ai-service.js)', // コンテキストを追加
      channelId: 'LOCAL_TEST', // ダミー値
      threadTs: 'LOCAL_TEST_TS', // ダミー値
    });
    logger.info('テスト成功！ AIからの応答:');
    console.log("--- AI Response ---");
    console.log(result); // 結果をコンソールに出力
    console.log("-------------------");
  } catch (error) {
    // ai-service.js 内で詳細なエラーログが出力されるはずですが、
    // 念のためここでもエラー情報を出力します。
    logger.error('テスト中にエラーが発生しました。詳細は ai-service.js からのログを確認してください。', {
        errorMessage: error.message,
        // スタックトレースなども含めると冗長になる可能性があるため、主要なメッセージのみ表示
    });
    // エラーオブジェクト全体を見たい場合は、以下のコメントアウトを解除
    /*
    logger.error('エラーオブジェクト詳細:', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorCause: error.cause,
        errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
    */
  }
}

runTest();
