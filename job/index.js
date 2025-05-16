import 'dotenv/config';
import logger from '../utils/logger.js';
import FeedbackFromSlackStrategy from '../services/FeedbackFromSlackStrategy.js';
import MediaClipFromSlackStrategy from '../services/MediaClipFromSlackStrategy.js';
import TranscribeAndSummarizeFromSlackStrategy from '../services/TranscribeAndSummarizeFromSlackStrategy.js';

const STRATEGY_MAP = {
  feedback: FeedbackFromSlackStrategy,
  matsuura_feedback: FeedbackFromSlackStrategy,
  waltz_feedback: FeedbackFromSlackStrategy,
  clip: MediaClipFromSlackStrategy,
  transcribe_and_summarize: TranscribeAndSummarizeFromSlackStrategy,
};

async function main() {
  // --- インプット精査 ---
  const channelId = process.env.SLACK_CHANNEL_ID;
  const threadTs = process.env.SLACK_THREAD_TS;
  const commandAction = process.env.SLACK_COMMAND_ACTION;
  const commandContext = process.env.SLACK_COMMAND_CONTEXT;
  const slackEventJson = process.env.SLACK_EVENT_JSON;
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

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

  // --- Strategy選択・委譲 ---
  const Strategy = STRATEGY_MAP[commandAction] || FeedbackFromSlackStrategy;
  try {
    await Strategy.execute({ channelId, threadTs, commandAction, commandContext, slackEventJson, slackBotToken });
    logger.info('処理が正常に完了しました。');
  } catch (error) {
    logger.error(`処理中にエラーが発生しました: ${error.message}`, { error });
    // Strategy側でエラー通知も担う想定
    process.exit(1);
  }
}

main();
