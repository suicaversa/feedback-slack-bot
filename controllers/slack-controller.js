// controllers/slack-controller.js
const slackService = require('../services/slack-service.js');
const fileService = require('../services/file-service.js');
const aiService = require('../services/ai-service.js');
const commandParser = require('../utils/command-parser.js');
const logger = require('../utils/logger.js');

/**
 * Slackからのイベントを処理する
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 */
exports.handleSlackEvent = async (req, res) => {
  try {
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
    
    // メッセージを処理中であることを通知
    await slackService.postMessage({
      channel,
      text: '✅ リクエストを受け付けました。処理中です...',
      thread_ts: threadId
    });
    
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
    
    // ファイルをダウンロード (チャンネルIDとスレッドIDを渡す)
    const localFilePath = await fileService.downloadFile(targetFile, channel, threadId);
    
    // コマンドに応じたAI処理 (チャンネルIDとスレッドIDを渡す)
    const aiResult = await aiService.processMediaFile({
      filePath: localFilePath,
      fileType: targetFile.filetype,
      command: command.action,
      additionalContext: command.context,
      channelId: channel,
      threadTs: threadId
    });

    // ★ Geminiからの応答内容をログ出力
    logger.info('Geminiからの応答(aiResult):\n', aiResult);

    // 結果を返信
    await slackService.postMessage({
      channel,
      text: `✨ ${command.action}の結果:\n\n${aiResult}`,
      thread_ts: threadId
    });
    
    // 一時ファイルのクリーンアップ
    await fileService.cleanupTempFile(localFilePath);
    
  } catch (error) {
    logger.error(`イベント処理中にエラーが発生しました: ${error.message}`, { error });
    
    // エラーが発生した場合は、Slackにエラーメッセージを送信
    if (req.body.event) {
      const { channel, thread_ts, ts } = req.body.event;
      const threadId = thread_ts || ts;
      
      await slackService.postMessage({
        channel,
        text: '❌ 処理中にエラーが発生しました。しばらく経ってからもう一度お試しください。',
        thread_ts: threadId
      }).catch(err => {
        logger.error(`エラーメッセージの送信に失敗しました: ${err.message}`);
      });
    }
  }
};
