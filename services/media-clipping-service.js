// services/media-clipping-service.js
import path from 'path';
import fs from 'fs/promises';
import timeExtractionService from './time-extraction-service.js';
import MediaEditingService from './media-editing-service.js';
import slackService from './slack-service.js';
import logger from '../utils/logger.js';

/**
 * Handles the media clipping workflow.
 * Extracts time ranges, cuts the media, uploads segments to Slack.
 * @param {object} options - Options for the clipping process.
 * @param {string} options.commandContext - The user's text message containing time ranges.
 * @param {string} options.localFilePath - Path to the downloaded media file.
 * @param {string} options.channelId - Slack channel ID.
 * @param {string} options.threadTs - Slack thread timestamp.
 * @returns {Promise<Array<string>>} - Array of paths to the created segment files (for cleanup).
 * @throws {Error} If any critical step fails (time extraction, cutting, upload).
 */
async function handleClippingRequest({ commandContext, localFilePath, channelId, threadTs }) {
    logger.info('メディア切り抜き処理を開始します。', { channelId, threadTs });
    const mediaEditingService = new MediaEditingService(); // Uses default /tmp
    let segmentFilePaths = []; // To keep track of created files for cleanup

    try {
        // 1. Extract time ranges
        logger.info('時間範囲を抽出します...', { commandContext });
        const timeRanges = await timeExtractionService.extractTimeRangesFromText(commandContext);
        logger.info(`抽出された時間範囲: ${JSON.stringify(timeRanges)}`);

        if (!timeRanges || timeRanges.length === 0) {
            await slackService.postMessage({
                channel: channelId,
                text: '⚠️ テキストから切り抜き時間範囲を抽出できませんでした。HH:MM:SS形式で指定してください。',
                thread_ts: threadTs
            });
            logger.warn('時間範囲が抽出できなかったため、切り抜き処理を中止します。');
            return []; // Return empty array, indicating no segments were created
        }

        // 2. Cut media
        logger.info('メディアの切り抜き処理を実行します...', { localFilePath });
        segmentFilePaths = await mediaEditingService.cutMedia(localFilePath, timeRanges, 'cut_segment');
        logger.info(`メディアの切り抜き完了。生成されたファイル数: ${segmentFilePaths.length}`);

        if (!segmentFilePaths || segmentFilePaths.length === 0) {
            await slackService.postMessage({
                channel: channelId,
                text: '❌ メディアの切り抜きに失敗しました。時間指定やファイル形式を確認してください。',
                thread_ts: threadTs
            });
            logger.error('メディア切り抜きでファイルが生成されませんでした。');
            throw new Error('メディア切り抜きでファイルが生成されませんでした。');
        }

        // 3. Upload segments to Slack
        logger.info('切り抜いたファイルをSlackにアップロードします...');
        await slackService.postMessage({
            channel: channelId,
            text: `✂️ 切り抜き処理が完了しました。${segmentFilePaths.length}個のファイルをアップロードします...`,
            thread_ts: threadTs
        });

        for (const segmentPath of segmentFilePaths) {
            const fileName = path.basename(segmentPath);
            try {
                await slackService.uploadFile({
                    channels: channelId,
                    thread_ts: threadTs,
                    filePath: segmentPath,
                    filename: fileName,
                    initial_comment: `切り抜きファイル: ${fileName}`
                });
                logger.info(`ファイル ${fileName} をアップロードしました。`);
            } catch (uploadError) {
                logger.error(`セグメントファイル ${fileName} のアップロードに失敗しました: ${uploadError.message}`, { uploadError });
                // 一つのファイルのアップロード失敗で全体を止めるか、続けるか検討。ここでは続ける。
                await slackService.postMessage({
                    channel: channelId,
                    text: `⚠️ ファイル ${fileName} のアップロードに失敗しました。`,
                    thread_ts: threadTs
                });
            }
        }
        logger.info('すべての切り抜きファイルのアップロード処理が完了しました。');

        return segmentFilePaths; // Return paths for potential cleanup by the caller

    } catch (error) {
        logger.error(`メディア切り抜き処理中にエラーが発生しました: ${error.message}`, { error });
        // Attempt to clean up any segments created before the error
        logger.info('エラー発生のため、生成された可能性のあるセグメントファイルをクリーンアップします...');
        for (const segmentPath of segmentFilePaths) {
            try {
                await fs.unlink(segmentPath);
                logger.info(`エラークリーンアップ: セグメントファイルを削除しました: ${segmentPath}`);
            } catch (cleanupError) {
                logger.error(`エラークリーンアップ: セグメントファイルの削除に失敗しました: ${cleanupError.message}`, { filePath: segmentPath, error: cleanupError });
            }
        }
        // Re-throw the error to be caught by the job's main try-catch
        throw error;
    }
}

export default { handleClippingRequest };
