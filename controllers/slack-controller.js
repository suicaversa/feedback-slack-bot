// controllers/slack-controller.js
const { JobsClient } = require('@google-cloud/run').v2; // ★ Import JobsClient
const slackService = require('../services/slack-service.js');
const fileService = require('../services/file-service.js');
// const aiService = require('../services/ai-service.js'); // Job側で使うので削除
const commandParser = require('../utils/command-parser.js');
const logger = require('../utils/logger.js');

// ★ Instantiate JobsClient
const jobsClient = new JobsClient();

/**
 * Slackからのイベントを処理する
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 */
exports.handleSlackEvent = async (req, res) => {
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

    // スレッド内のファイルを取得
    const files = await slackService.getFilesInThread(channel, threadId);

    if (!files || files.length === 0) {
      await slackService.postMessage({
        channel,
        text: '❌ このスレッドに処理対象のファイルが見つかりません。音声または動画ファイルをアップロードしてください。',
        thread_ts: threadId
      });
      return;
    }

    // 対象ファイルを特定（最新の音声/動画ファイル）
    const targetFile = fileService.findTargetMediaFile(files);
    if (!targetFile) {
      await slackService.postMessage({
        channel,
        text: '❌ 対応する音声または動画ファイルが見つかりません。',
        thread_ts: threadId
      });
      return;
    }

    // --- ここから下の処理をJob起動に置き換え ---

    // ★ Cloud Run Job を起動する
    logger.info(`Cloud Run Job (${jobName}) の起動を開始します。`, { channel, threadId });

    const jobParent = `projects/${projectId}/locations/${jobRegion}/jobs/${jobName}`;

    const runJobRequest = {
      name: jobParent,
      overrides: {
        containerOverrides: [
          {
            env: [ // Jobに渡すパラメータを環境変数として設定
              { name: 'SLACK_CHANNEL_ID', value: channel },
              { name: 'SLACK_THREAD_TS', value: threadId },
              { name: 'SLACK_COMMAND_ACTION', value: command.action },
              { name: 'SLACK_COMMAND_CONTEXT', value: command.context || '' },
              { name: 'TARGET_FILE_URL', value: targetFile.url_private_download },
              { name: 'TARGET_FILE_TYPE', value: targetFile.filetype },
              // SLACK_BOT_TOKEN は Job 側の環境変数 or Secret Manager で設定する想定
            ],
          },
        ],
        taskCount: 1, // 実行するタスク数
        // timeout: '3600s', // Job のタイムアウトはデプロイ時に設定するため、ここでのオーバーライドは削除
      },
    };

    try {
      const [operation] = await jobsClient.runJob(runJobRequest);
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
