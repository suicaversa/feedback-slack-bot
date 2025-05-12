import 'dotenv/config';
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

// --- 追加: 責務ごとのプライベート関数 ---
function checkRequiredEnvVars(vars) {
  const { channelId, threadTs, commandAction, slackEventJson, slackBotToken } = vars;
  if (!channelId || !threadTs || !commandAction || !slackEventJson || !slackBotToken) {
    logger.error('必要な環境変数が不足しています。', {
      channelId: !!channelId,
      threadTs: !!threadTs,
      commandAction: !!commandAction,
      slackEventJson: !!slackEventJson,
      slackBotToken: !!slackBotToken
    });
    throw new Error('必要な環境変数が不足しています。');
  }
}

function parseSlackEventJson(slackEventJson) {
  try {
    return JSON.parse(slackEventJson);
  } catch (parseError) {
    logger.error('SLACK_EVENT_JSON のパースに失敗しました。', { error: parseError, json: slackEventJson });
    throw new Error('Slackイベントデータの形式が不正です。');
  }
}

async function notifyStart(channelId, threadTs, commandAction) {
  await slackService.postMessage({
    channel: channelId,
    text: `✅ バックグラウンド処理を開始しました... (コマンド: ${commandAction})`,
    thread_ts: threadTs
  });
}

async function getFilesInThreadOrNotify(channelId, threadTs) {
  logger.info('スレッド内のファイルを取得します。', { channelId, threadId: threadTs });
  const files = await slackService.getFilesInThread(channelId, threadTs);
  if (!files || files.length === 0) {
    logger.warn('処理対象のファイルが見つかりません。', { channelId, threadId: threadTs });
    await slackService.postMessage({
      channel: channelId,
      text: '❌ このスレッドに処理対象のファイルが見つかりません。音声または動画ファイルをアップロードしてください。',
      thread_ts: threadTs
    });
    return null;
  }
  return files;
}

function findTargetFileOrNotify(files, channelId, threadTs) {
  logger.info('ダウンロード対象のファイルを特定します。');
  const targetFile = fileService.findTargetMediaFile(files);
  if (!targetFile) {
    logger.warn('対応する音声または動画ファイルが見つかりません。', { channelId, threadId: threadTs });
    slackService.postMessage({
      channel: channelId,
      text: '❌ 対応する音声または動画ファイルが見つかりません。',
      thread_ts: threadTs
    });
    return null;
  }
  logger.info('対象ファイルを特定しました。', { fileId: targetFile.id, fileName: targetFile.name });
  return targetFile;
}

async function downloadTargetFile(targetFile, channelId, threadTs) {
  logger.info('ファイルのダウンロードを開始します。', { url: targetFile.url_private_download });
  const localFilePath = await fileService.downloadFile(targetFile, channelId, threadTs);
  logger.info(`ファイルのダウンロード完了: ${localFilePath}`);
  return localFilePath;
}

// --- strategy関数群 ---
async function clipStrategy({ commandContext, localFilePath, channelId, threadTs }) {
  logger.info(`アクションタイプ 'clip' を検出しました。メディア切り抜きサービスを呼び出します。`);
  await mediaClippingService.handleClippingRequest({
    commandContext,
    localFilePath,
    channelId,
    threadTs,
  });
  logger.info('メディア切り抜きサービスによる処理が完了しました。');
}

async function feedbackStrategy({ localFilePath, targetFile, commandAction, commandContext, channelId, threadTs }) {
  logger.info(`アクションタイプ 'feedback' を検出しました。通常のAI処理を実行します。`);
  const aiResult = await aiService.processMediaFile({
    filePath: localFilePath,
    fileType: targetFile.filetype,
    command: commandAction,
    additionalContext: commandContext,
    channelId,
    threadTs
  });
  logger.info('AI処理完了。');
  if (typeof aiResult === 'string') {
    logger.info('AIからの応答(aiResult):\n', aiResult);
  } else {
    logger.warn('aiResultが文字列でないため、ログ出力をスキップします。', { type: typeof aiResult });
  }
  const footerMessage = `\n\n---\n*これはβ版のAIフィードバックです。*\nコマンドを指定しない場合、デフォルトのフィードバックが実行されます。\n特定のフィードバック（例：過去のフィードバックを学習したAI）が必要な場合は、「@営業クローンBOT 松浦さんAIでフィードバック」のようにコマンドを指定してください。`;
  const resultActionName = commandAction === 'matsuura_feedback' ? '松浦さんAIフィードバック' : 'フィードバック';
  const messageToSend = `✨ ${resultActionName}の結果:\n\n${aiResult}${footerMessage}`;
  logger.info('結果をSlackに投稿します。');
  await slackService.postMessage({
    channel: channelId,
    text: messageToSend,
    thread_ts: threadTs
  });
  logger.info('Slackへの投稿完了。');
}

const commandStrategies = {
  clip: clipStrategy,
  feedback: feedbackStrategy,
  matsuura_feedback: feedbackStrategy,
  waltz_feedback: feedbackStrategy,
  default: feedbackStrategy,
};

async function handleCommandAction({ commandAction, ...params }) {
  const strategy = commandStrategies[commandAction] || commandStrategies.default;
  await strategy({ commandAction, ...params });
}

async function notifyErrorToSlack(channelId, threadTs, error) {
  try {
    await slackService.postMessage({
      channel: channelId,
      text: `❌ 処理中にエラーが発生しました。\n\${error.message}\`,
      thread_ts: threadTs
    });
  } catch (slackError) {
    logger.error(`Slackへのエラー通知に失敗しました: ${slackError.message}`, { slackError });
  }
}

async function cleanupLocalFile(localFilePath) {
  if (localFilePath) {
    logger.info(`ダウンロードした一時ファイルを削除します: ${localFilePath}`);
    try {
      await fs.unlink(localFilePath);
      logger.info(`fs.unlinkで一時ファイルを削除しました: ${localFilePath}`);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        logger.error(`ダウンロードした一時ファイルの削除に失敗しました: ${cleanupError.message}`, { filePath: localFilePath, error: cleanupError });
      } else {
        logger.warn(`ダウンロードした一時ファイルが見つかりませんでした（削除済みか？）: ${localFilePath}`);
      }
    }
  }
}

// メイン処理関数
async function main() {
  logger.info(`Cloud Run Job開始: Task ${taskIndex}, Attempt ${attemptIndex}`, { channelId, threadTs });

  // --- パラメータチェック ---
  checkRequiredEnvVars({ channelId, threadTs, commandAction, slackEventJson, slackBotToken });

  let localFilePath = null;
  let event;

  try {
    // --- Event JSONをパース ---
    event = parseSlackEventJson(slackEventJson);

    // --- 処理開始を通知 ---
    await notifyStart(channelId, threadTs, commandAction);

    // --- スレッド内のファイル取得 ---
    const files = await getFilesInThreadOrNotify(channelId, threadTs);
    if (!files) return;

    // --- 対象ファイルを特定 ---
    const targetFile = findTargetFileOrNotify(files, channelId, threadTs);
    if (!targetFile) return;

    // --- ファイルダウンロード ---
    localFilePath = await downloadTargetFile(targetFile, channelId, threadTs);

    // --- 処理分岐 ---
    await handleCommandAction({ commandAction, commandContext, localFilePath, targetFile, channelId, threadTs });

  } catch (error) {
    logger.error(`Cloud Run Job処理中にエラーが発生しました: ${error.message}`, { error, channelId, threadTs });
    await notifyErrorToSlack(channelId, threadTs, error);
    throw error;
  } finally {
    await cleanupLocalFile(localFilePath);
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
