import slackService from './slack-service.js';
import fileService from './file-service.js';
import { FeedbackService } from './FeedbackService.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';

const FeedbackFromSlackStrategy = {
  /**
   * Slackスレッドからファイルを取得し、AIフィードバック生成→通知まで一貫して担当
   * @param {Object} params
   * @param {string} params.channelId
   * @param {string} params.threadTs
   * @param {string} params.commandAction
   * @param {string} params.commandContext
   * @param {string} params.slackEventJson
   * @param {string} params.slackBotToken
   */
  async execute({ channelId, threadTs, commandAction, commandContext }) {
    let localFilePath = null;
    try {
      // 1. スレッド内のファイル取得
      const files = await slackService.getFilesInThread(channelId, threadTs);
      if (!files || files.length === 0) {
        await slackService.postMessage({
          channel: channelId,
          text: '❌ このスレッドに処理対象のファイルが見つかりません。音声または動画ファイルをアップロードしてください。',
          thread_ts: threadTs
        });
        return;
      }
      // 2. 対象ファイル特定
      const targetFile = fileService.findTargetMediaFile(files);
      if (!targetFile) {
        await slackService.postMessage({
          channel: channelId,
          text: '❌ 対応する音声または動画ファイルが見つかりません。',
          thread_ts: threadTs
        });
        return;
      }
      // 3. ファイルダウンロード
      localFilePath = await fileService.downloadFile(targetFile, channelId, threadTs);
      // 4. FeedbackServiceでAIフィードバック生成
      const feedbackService = new FeedbackService();
      const aiResult = await feedbackService.generateFeedback(localFilePath, commandAction);
      // 5. Slack通知
      const footerMessage = `\n\n---\n*これはβ版のAIフィードバックです。*\nコマンドを指定しない場合、デフォルトのフィードバックが実行されます。\n特定のフィードバック（例：過去のフィードバックを学習したAI）が必要な場合は、「@営業クローンBOT 松浦さんAIでフィードバック」のようにコマンドを指定してください。`;
      const resultActionName = commandAction === 'matsuura_feedback' ? '松浦さんAIフィードバック' : 'フィードバック';
      const messageToSend = `✨ ${resultActionName}の結果:\n\n${aiResult}${footerMessage}`;
      await slackService.postMessage({
        channel: channelId,
        text: messageToSend,
        thread_ts: threadTs
      });
    } catch (error) {
      logger.error(`FeedbackFromSlackStrategy: エラー発生: ${error.message}`, { error });
      await slackService.postMessage({
        channel: channelId,
        text: `❌ フィードバック生成中にエラーが発生しました。\n${error.message}`,
        thread_ts: threadTs
      });
    } finally {
      // 一時ファイルクリーンアップ
      if (localFilePath) {
        try {
          await fs.unlink(localFilePath);
          logger.info(`一時ファイル削除: ${localFilePath}`);
        } catch (cleanupError) {
          logger.warn(`一時ファイル削除失敗: ${cleanupError.message}`);
        }
      }
    }
  }
};

export default FeedbackFromSlackStrategy; 