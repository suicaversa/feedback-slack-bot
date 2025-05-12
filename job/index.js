import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import slackService from '../services/slack-service.js';
import fileService from '../services/file-service.js';
import aiService from '../services/ai-service.js';
import mediaClippingService from '../services/media-clipping-service.js';
import logger from '../utils/logger.js';

// Cloud Run Job 特有の環境変数
const taskIndex = process.env.CLOUD_RUN_TASK_INDEX || 0;
const attemptIndex = process.env.CLOUD_RUN_TASK_ATTEMPT || 0;

// Functionから渡された環境変数
const channelId = process.env.SLACK_CHANNEL_ID;
const threadTs = process.env.SLACK_THREAD_TS;
const commandAction = process.env.SLACK_COMMAND_ACTION;
const commandContext = process.env.SLACK_COMMAND_CONTEXT;
const slackEventJson = process.env.SLACK_EVENT_JSON;
const slackBotToken = process.env.SLACK_BOT_TOKEN;

// メイン処理関数
async function main() {
  logger.info(`Cloud Run Job開始: Task ${taskIndex}, Attempt ${attemptIndex}`, { channelId, threadTs });

  // --- パラメータチェック ---
  // ★ targetFileUrl, targetFileType の代わりに slackEventJson をチェック
  if (!channelId || !threadTs || !commandAction || !slackEventJson || !slackBotToken) {
    logger.error('必要な環境変数が不足しています。', {
      channelId: !!channelId,
      threadTs: !!threadTs,
      commandAction: !!commandAction,
      slackEventJson: !!slackEventJson, // ★ チェック対象変更
      slackBotToken: !!slackBotToken
    });
    // ここで処理を中断すべき。Cloud Run Jobは失敗として終了する。
    throw new Error('必要な環境変数が不足しています。');
  }

  let localFilePath = null; // finallyで使うため外で宣言
  // let createdSegmentPaths = []; // 不要になったため削除
  let event; // ★ eventオブジェクトを格納する変数

  try {
    // ★ Event JSONをパース
    try {
      event = JSON.parse(slackEventJson);
    } catch (parseError) {
      logger.error('SLACK_EVENT_JSON のパースに失敗しました。', { error: parseError, json: slackEventJson });
      throw new Error('Slackイベントデータの形式が不正です。');
    }

    // --- 処理開始を通知 ---
    await slackService.postMessage({
      channel: channelId,
      text: `✅ バックグラウンド処理を開始しました... (コマンド: ${commandAction})`,
      thread_ts: threadTs
    });

    // --- スレッド内のファイル取得 ---
    logger.info('スレッド内のファイルを取得します。', { channelId, threadId: threadTs });
    const files = await slackService.getFilesInThread(channelId, threadTs);
    if (!files || files.length === 0) {
      // Function側でチェックしなくなったのでJob側でエラーハンドリング
      logger.warn('処理対象のファイルが見つかりません。', { channelId, threadId: threadTs });
      await slackService.postMessage({
        channel: channelId,
        text: '❌ このスレッドに処理対象のファイルが見つかりません。音声または動画ファイルをアップロードしてください。',
        thread_ts: threadTs
      });
      return; // Jobは正常終了とする（エラーではないため）
    }

    // --- 対象ファイルを特定 ---
    logger.info('ダウンロード対象のファイルを特定します。');
    const targetFile = fileService.findTargetMediaFile(files);
    if (!targetFile) {
      // Function側でチェックしなくなったのでJob側でエラーハンドリング
      logger.warn('対応する音声または動画ファイルが見つかりません。', { channelId, threadId: threadTs });
      await slackService.postMessage({
        channel: channelId,
        text: '❌ 対応する音声または動画ファイルが見つかりません。',
        thread_ts: threadTs
      });
      return; // Jobは正常終了とする（エラーではないため）
    }
    logger.info('対象ファイルを特定しました。', { fileId: targetFile.id, fileName: targetFile.name });


    // --- ファイルダウンロード ---
    logger.info('ファイルのダウンロードを開始します。', { url: targetFile.url_private_download });
    // ★ downloadFileには取得した targetFile オブジェクトを渡す
    localFilePath = await fileService.downloadFile(targetFile, channelId, threadTs); // channelId, threadTsはログ用
    logger.info(`ファイルのダウンロード完了: ${localFilePath}`);

    // --- 処理分岐: Functionから渡された commandAction に基づく ---
    switch (commandAction) {
      case 'clip':
        logger.info(`アクションタイプ '${commandAction}' を検出しました。メディア切り抜きサービスを呼び出します。`);
        // mediaClippingService を呼び出す (戻り値は不要)
        await mediaClippingService.handleClippingRequest({
            commandContext, // 時間抽出のためにコンテキスト全体を渡す
            localFilePath,
            channelId,
            threadTs,
        });
        // 切り抜き処理が成功した場合、この Job のタスクは完了 (結果はサービス内で Slack に投稿済み)
        logger.info('メディア切り抜きサービスによる処理が完了しました。');
        break; // switch から抜ける

      case 'feedback':
      case 'matsuura_feedback':
      default: // デフォルトも通常のAI処理とする
        logger.info(`アクションタイプ '${commandAction}' (またはデフォルト) を検出しました。通常のAI処理を実行します。`);
        const aiResult = await aiService.processMediaFile({
            filePath: localFilePath,
            fileType: targetFile.filetype,
            command: commandAction, // action をそのまま渡す (aiService内で再度判定される)
            additionalContext: commandContext,
            channelId: channelId,
            threadTs: threadTs
        });
        logger.info('AI処理完了。');
        if (typeof aiResult === 'string') {
            logger.info('AIからの応答(aiResult):\n', aiResult);
        } else {
            logger.warn('aiResultが文字列でないため、ログ出力をスキップします。', { type: typeof aiResult });
        }

        // --- 結果をSlackに投稿 ---
        const footerMessage = `\n\n---\n*これはβ版のAIフィードバックです。*\nコマンドを指定しない場合、デフォルトのフィードバックが実行されます。\n特定のフィードバック（例：過去のフィードバックを学習したAI）が必要な場合は、「@営業クローンBOT 松浦さんAIでフィードバック」のようにコマンドを指定してください。`;
        // 結果メッセージのアクション名を明確にする
        const resultActionName = commandAction === 'matsuura_feedback' ? '松浦さんAIフィードバック' : 'フィードバック';
        const messageToSend = `✨ ${resultActionName}の結果:\n\n${aiResult}${footerMessage}`;

        logger.info('結果をSlackに投稿します。');
        await slackService.postMessage({
            channel: channelId,
            text: messageToSend,
            thread_ts: threadTs
        });
        logger.info('Slackへの投稿完了。');
        break; // switch から抜ける
    } // --- switch (commandAction) 終了 ---

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
    // ダウンロードした元のファイル
    if (localFilePath) {
        logger.info(`ダウンロードした一時ファイルを削除します: ${localFilePath}`);
        try {
            await fs.unlink(localFilePath);
            logger.info(`fs.unlinkで一時ファイルを削除しました: ${localFilePath}`);
        } catch (cleanupError) {
            // ファイルが存在しない場合のエラーは無視しても良い場合がある (ENOENT)
            if (cleanupError.code !== 'ENOENT') {
                logger.error(`ダウンロードした一時ファイルの削除に失敗しました: ${cleanupError.message}`, { filePath: localFilePath, error: cleanupError });
            } else {
                 logger.warn(`ダウンロードした一時ファイルが見つかりませんでした（削除済みか？）: ${localFilePath}`);
            }
        }
    }
    // 切り抜きセグメントファイルのクリーンアップは mediaClippingService 内で行われるため、ここでの処理は不要
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
