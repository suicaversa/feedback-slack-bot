import slackService from './slack-service.js';
import fileService from './file-service.js';
import mediaClippingService from './media-clipping-service.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';

const MediaClipFromSlackStrategy = {
  /**
   * Slackスレッドからファイルを取得し、メディア切り抜き→通知まで一貫して担当
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
      // 4. メディア切り抜き処理
      await mediaClippingService.handleClippingRequest({
        commandContext,
        localFilePath,
        channelId,
        threadTs,
      });
      // （Slack通知はmediaClippingService側で実施済み想定）
    } catch (error) {
      logger.error(`MediaClipFromSlackStrategy: エラー発生: ${error.message}`, { error });
      await slackService.postMessage({
        channel: channelId,
        text: `❌ メディア切り抜き中にエラーが発生しました。\n${error.message}`,
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

export default MediaClipFromSlackStrategy; 