import slackService from './slack-service.js';
import fileService from './file-service.js';
import { TranscriptionService } from './TranscriptionService.js';
import { DeepgramTranscriptionStrategy } from './transcription-strategies/DeepgramTranscriptionStrategy.js';
import { GeminiService } from './ai-services/GeminiService.js';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TranscribeAndSummarizeFromSlackStrategy = {
  /**
   * Slackスレッドからファイルを取得し、文字起こし＋要約→テキストファイルでアップロードまで一貫して担当
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
    let transcriptTextPath = null;
    let summaryTextPath = null;
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
      // 4. 文字起こし
      const transcriptionService = new TranscriptionService(new DeepgramTranscriptionStrategy());
      const transcript = await transcriptionService.transcribe(localFilePath);
      // 5. 要約（GeminiServiceを直接利用）
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiService = new GeminiService(geminiApiKey);
      const summaryPrompt = buildSummaryPrompt(transcript, commandContext);
      const contents = [
        {
          role: 'user',
          parts: [
            { text: summaryPrompt }
          ]
        }
      ];
      const summary = await geminiService.generateContent({ contents });
      // 6. テキストファイルとして保存
      const tempDir = path.join(os.tmpdir(), 'slack-processing', `${channelId}-${threadTs.replace(/\./g, '_')}`);
      await fs.mkdir(tempDir, { recursive: true });
      transcriptTextPath = path.join(tempDir, 'transcript.txt');
      summaryTextPath = path.join(tempDir, 'summary.txt');
      await fs.writeFile(transcriptTextPath, transcript, 'utf-8');
      await fs.writeFile(summaryTextPath, summary, 'utf-8');
      // 7. Slackにアップロード
      await slackService.uploadFile({
        channels: channelId,
        thread_ts: threadTs,
        filePath: transcriptTextPath,
        filename: 'transcript.txt',
        initial_comment: '📝 文字起こし結果です'
      });
      await slackService.uploadFile({
        channels: channelId,
        thread_ts: threadTs,
        filePath: summaryTextPath,
        filename: 'summary.txt',
        initial_comment: '📝 要約結果です'
      });
    } catch (error) {
      logger.error(`TranscribeAndSummarizeFromSlackStrategy: エラー発生: ${error.message}`, { error });
      await slackService.postMessage({
        channel: channelId,
        text: `❌ 文字起こし・要約処理中にエラーが発生しました。\n${error.message}`,
        thread_ts: threadTs
      });
    } finally {
      // 一時ファイルクリーンアップ
      for (const filePath of [localFilePath, transcriptTextPath, summaryTextPath]) {
        if (filePath) {
          try {
            await fs.unlink(filePath);
            logger.info(`一時ファイル削除: ${filePath}`);
          } catch (cleanupError) {
            logger.warn(`一時ファイル削除失敗: ${cleanupError.message}`);
          }
        }
      }
    }
  }
};

function buildSummaryPrompt(transcript, context) {
  if (context && context.trim().length > 0) {
    return `要約の観点: ${context}\n\n文字起こし:\n${transcript}`;
  } else {
    return `以下の文字起こしを要約してください。\n\n${transcript}`;
  }
}

export default TranscribeAndSummarizeFromSlackStrategy; 