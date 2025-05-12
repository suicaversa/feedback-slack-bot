// controllers/slack-controller.js
import { JobsClient } from '@google-cloud/run';
import slackService from '../services/slack-service.js';
import fileService from '../services/file-service.js';
// const aiService = require('../services/ai-service.js'); // Job側で使うので削除
import commandParser from '../utils/command-parser.js';
import logger from '../utils/logger.js';

// ★ Instantiate JobsClient
const jobsClient = new JobsClient();

/**
 * Slackからのイベントを処理する
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 */
const handleSlackEvent = async (req, res) => {
  // 即時レスポンスを返す（Slackのタイムアウト対策）
  res.status(200).send();

  const { event } = req.body;

  // app_mentionイベント以外は無視
  if (event.type !== 'app_mention') {
    return;
  }

  logger.info(`メンションを受信: ${event.text}`, { eventId: req.body.event_id });

  // イベント情報を取得
  const {
    channel,
    text,
    ts: threadTs,
    thread_ts: parentThreadTs
  } = event;

  // スレッドIDを特定（親メッセージか返信か）
  const threadId = parentThreadTs || threadTs;

  try { // ★ Job起動までの処理をtry...catchで囲む

    // ★ Job起動に必要な環境変数を取得 (Functionの環境変数として設定されている想定)
    const projectId = process.env.GCP_PROJECT_ID;
    const jobName = process.env.CLOUD_RUN_JOB_NAME;
    const jobRegion = process.env.CLOUD_RUN_JOB_REGION;

    if (!projectId || !jobName || !jobRegion) {
      logger.error('Job起動に必要な環境変数 (GCP_PROJECT_ID, CLOUD_RUN_JOB_NAME, CLOUD_RUN_JOB_REGION) が設定されていません。');
      // ここでSlackにエラー通知しても良いが、設定ミスなのでログのみ
      return;
    }

    // コマンドの解析
    const command = commandParser.parseCommand(text);
    if (!command.isValid) {
      await slackService.postMessage({
        channel,
        text: '❌ 有効なコマンドではありません。`@bot 要約して` のように指定してください。',
        thread_ts: threadId
      });
      return;
    }

    // --- Job起動 ---
    // ファイル取得・特定ロジックはJob側に移動したため削除

    // ★ Cloud Run Job を起動する
    logger.info(`Cloud Run Job (${jobName}) の起動を開始します。`, { channel, threadId });

    const jobParent = `projects/${projectId}/locations/${jobRegion}/jobs/${jobName}`;

    const runJobRequest = {
      name: jobParent,
      overrides: {
        containerOverrides: [
          {
            env: [ // Jobに渡すパラメータを環境変数として設定
              { name: 'SLACK_CHANNEL_ID', value: channel }, // channelは引き続き渡す
              { name: 'SLACK_THREAD_TS', value: threadId }, // threadIdは引き続き渡す
              { name: 'SLACK_COMMAND_ACTION', value: command.action }, // commandも渡す
              { name: 'SLACK_COMMAND_CONTEXT', value: command.context || '' },
              { name: 'SLACK_EVENT_JSON', value: JSON.stringify(event) }, // ★ Slack Event全体をJSON文字列で渡す
              // SLACK_BOT_TOKEN は Job 側の環境変数で設定済み
            ],
          },
        ],
        taskCount: 1, // 実行するタスク数
        // timeout: '3600s', // Job のタイムアウトはデプロイ時に設定するため、ここでのオーバーライドは削除
      },
    };

    const runJobOptions = {
      maxRetries: 3
    };

    try {
          // ★ 一時返信を投稿
          await slackService.postMessage({
            channel,
            text: `⏳ リクエストを受け付けました。処理を開始します... (コマンド: ${command.action || 'デフォルト'})`,
            thread_ts: threadId
          });

          const [operation] = await jobsClient.runJob(runJobRequest, runJobOptions);
          logger.info(`Cloud Run Job の起動リクエストを送信しました。Operation: ${operation.name}`, { channel, threadId });
          // Jobの完了待機はしない (非同期起動)

          // 必要であれば、Job起動を受け付けた旨をSlackに通知しても良い
          // await slackService.postMessage({
          //   channel,
          //   text: `✅ リクエストを受け付け、バックグラウンド処理を開始しました。完了までしばらくお待ちください。`,
      //   thread_ts: threadId
      // });

    } catch (jobError) {
      logger.error(`Cloud Run Job の起動に失敗しました: ${jobError.message}`, { error: jobError, channel, threadId });
      // Job起動失敗をSlackに通知
      await slackService.postMessage({
        channel,
        text: '❌ 処理の開始に失敗しました。システム管理者に連絡してください。',
        thread_ts: threadId
      });
    }

  } catch (error) { // ★ Job起動前のエラー (コマンド解析、ファイル特定など)
    logger.error(`イベント処理中にエラーが発生しました (Job起動前): ${error.message}`, { error, event });
    // エラーが発生した場合、Slackにエラーメッセージを送信 (既存のcatchブロックと同様)
    if (req.body.event) {
      const { channel, thread_ts, ts } = req.body.event;
      const threadId = thread_ts || ts; // 再度threadIdを取得

      await slackService.postMessage({
        channel,
        text: '❌ 処理中に予期せぬエラーが発生しました。',
        thread_ts: threadId
      }).catch(err => {
        logger.error(`エラーメッセージの送信に失敗しました: ${err.message}`);
      });
    }
  }
};

export default { handleSlackEvent };
