// job/index.js
require('dotenv').config({ path: '../.env' }); // ルートの.envを参照する場合
const path = require('path');
const fs = require('fs').promises; // cleanupTempFileで使うため

// サービスとユーティリティをインポート (パスを調整)
const slackService = require('../services/slack-service.js');
const fileService = require('../services/file-service.js');
const aiService = require('../services/ai-service.js');
const logger = require('../utils/logger.js'); // loggerもルートから参照

// Cloud Run Job 特有の環境変数
const taskIndex = process.env.CLOUD_RUN_TASK_INDEX || 0;
const attemptIndex = process.env.CLOUD_RUN_TASK_ATTEMPT || 0;

// Functionから渡された環境変数
const channelId = process.env.SLACK_CHANNEL_ID;
const threadTs = process.env.SLACK_THREAD_TS;
const commandAction = process.env.SLACK_COMMAND_ACTION;
const commandContext = process.env.SLACK_COMMAND_CONTEXT;
const targetFileUrl = process.env.TARGET_FILE_URL;
const targetFileType = process.env.TARGET_FILE_TYPE;
const slackBotToken = process.env.SLACK_BOT_TOKEN; // Jobの環境変数 or Secret Managerから取得

// メイン処理関数
async function main() {
  logger.info(`Cloud Run Job開始: Task ${taskIndex}, Attempt ${attemptIndex}`, { channelId, threadTs });

  // --- パラメータチェック ---
  if (!channelId || !threadTs || !commandAction || !targetFileUrl || !targetFileType || !slackBotToken) {
    logger.error('必要な環境変数が不足しています。', {
      channelId: !!channelId,
      threadTs: !!threadTs,
      commandAction: !!commandAction,
      targetFileUrl: !!targetFileUrl,
      targetFileType: !!targetFileType,
      slackBotToken: !!slackBotToken
    });
    // ここで処理を中断すべき。Cloud Run Jobは失敗として終了する。
    throw new Error('必要な環境変数が不足しています。');
  }

  let localFilePath = null; // finallyで使うため外で宣言

  try {
    // --- 処理開始を通知 ---
    await slackService.postMessage({
      channel: channelId,
      text: `✅ バックグラウンド処理を開始しました... (コマンド: ${commandAction})`,
      thread_ts: threadTs
    });

    // --- ファイルダウンロード ---
    logger.info('ファイルのダウンロードを開始します。', { url: targetFileUrl });
    // downloadFileはファイル情報オブジェクトを引数に取る想定だったため、URLとタイプから簡易オブジェクトを作成
    const pseudoTargetFile = {
        url_private_download: targetFileUrl,
        filetype: targetFileType,
        // downloadFile内でnameが必要ならuuid等で生成するか、Functionから渡す
        name: `downloaded_file_${Date.now()}` // 仮の名前
    };
    localFilePath = await fileService.downloadFile(pseudoTargetFile, channelId, threadTs); // channelId, threadTsはログ用
    logger.info(`ファイルのダウンロード完了: ${localFilePath}`);

    // --- AI処理 ---
    logger.info('AI処理を開始します。', { command: commandAction });
    const aiResult = await aiService.processMediaFile({
      filePath: localFilePath,
      fileType: targetFileType,
      command: commandAction,
      additionalContext: commandContext,
      channelId: channelId, // ログや内部処理で使う可能性
      threadTs: threadTs    // ログや内部処理で使う可能性
    });
    logger.info('AI処理完了。');
     // ★ Geminiからの応答内容をログ出力 (aiResultが文字列の場合のみ)
    if (typeof aiResult === 'string') {
      logger.info('AIからの応答(aiResult):\n', aiResult);
    } else {
      logger.warn('aiResultが文字列でないため、ログ出力をスキップします。', { type: typeof aiResult });
    }


    // --- 結果をSlackに投稿 ---
     // ★ 固定メッセージを追加 (Function側から移動)
    const footerMessage = `\n\n---\n*これはβ版のAIフィードバックです。*\nコマンドを指定しない場合、デフォルトのフィードバックが実行されます。\n特定のフィードバック（例：過去のフィードバックを学習したAI）が必要な場合は、「@営業クローンBOT 松浦さんAIでフィードバック」のようにコマンドを指定してください。`;
    const messageToSend = `✨ ${commandAction}の結果:\n\n${aiResult}${footerMessage}`;

    logger.info('結果をSlackに投稿します。');
    await slackService.postMessage({
      channel: channelId,
      text: messageToSend,
      thread_ts: threadTs
    });
    logger.info('Slackへの投稿完了。');

  } catch (error) {
    logger.error(`Cloud Run Job処理中にエラーが発生しました: ${error.message}`, { error, channelId, threadTs });
    // エラーをSlackに通知
    try {
      await slackService.postMessage({
        channel: channelId,
        text: `❌ 処理中にエラーが発生しました。\n\`\`\`${error.message}\`\`\``,
        thread_ts: threadTs
      });
    } catch (slackError) {
      logger.error(`Slackへのエラー通知に失敗しました: ${slackError.message}`, { slackError });
    }
    // エラーを再スローしてJobを失敗させる
    throw error;
  } finally {
    // --- 一時ファイルのクリーンアップ ---
    if (localFilePath) {
      logger.info(`一時ファイルを削除します: ${localFilePath}`);
      // fileService.cleanupTempFile は非同期のはずなので await をつける
      // また、cleanupTempFile がなければ fs.unlink を直接使う
      try {
          if (fileService.cleanupTempFile) {
             await fileService.cleanupTempFile(localFilePath);
          } else {
             await fs.unlink(localFilePath); // cleanupTempFileがない場合のフォールバック
             logger.info(`fs.unlinkで一時ファイルを削除しました: ${localFilePath}`);
          }
      } catch (cleanupError) {
          logger.error(`一時ファイルの削除に失敗しました: ${cleanupError.message}`, { filePath: localFilePath, error: cleanupError });
          // クリーンアップ失敗はJobの成否に影響させないことが多いが、ログには残す
      }
    }
  }

  logger.info(`Cloud Run Job正常終了: Task ${taskIndex}, Attempt ${attemptIndex}`, { channelId, threadTs });
}

// メイン処理を実行
main().catch((error) => {
  // main関数内でキャッチされなかったエラー、または再スローされたエラー
  logger.error(`Cloud Run Jobが最終的に失敗しました: ${error.message}`, { error });
  // Cloud Run Job は非ゼロの終了コードで終了し、失敗としてマークされる
  process.exit(1);
});
