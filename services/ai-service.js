// services/aiService.js
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import DefaultFeedbackStrategy from "./ai-strategies/default-feedback-strategy.js";
import MatsuuraFeedbackStrategy from "./ai-strategies/matsuura-feedback-strategy.js";
import WaltzFeedbackStrategy from "./ai-strategies/waltz-feedback-strategy.js"; // Waltz戦略を読み込む
import * as geminiFileService from "./gemini-file-service.js";

const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY; // config経由または直接環境変数から取得
if (!apiKey) {
  logger.error('GEMINI_API_KEY が設定されていません。');
  throw new Error('GEMINI_API_KEY is not set.');
}

const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * コマンドに基づいて適切なAI処理戦略を選択する
 * @param {string} commandAction - 解析されたコマンドアクション
 * @returns {Object} - 選択された戦略オブジェクト
 */
function selectStrategy(commandAction) {
  // commandAction は command-parser.js の 'action' が渡される想定
  switch (commandAction) {
    case 'matsuura_feedback': // command-parser.js の action 名に合わせる
      logger.info('Selecting Matsuura AI Feedback Strategy.');
      return MatsuuraFeedbackStrategy;
    case 'waltz_feedback': // 新しい action 名
      logger.info('Selecting Waltz Feedback Strategy.');
      return WaltzFeedbackStrategy;
    case 'feedback': // デフォルト含む
    default:
      logger.info('Selecting Default Feedback Strategy.');
      return DefaultFeedbackStrategy;
  }
}

// --- private関数群 ---
function getFileSizeInMegabytes(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function selectModelName(fileSizeInMegabytes) {
  return fileSizeInMegabytes > 50 ? 'gemini-1.5-pro-latest' : 'gemini-2.5-pro-preview-03-25';
}

function detectMimeType(fileType) {
  if (isAudioFile(fileType)) {
    if (fileType === 'mp3') return 'audio/mpeg';
    if (fileType === 'wav') return 'audio/wav';
    if (fileType === 'm4a') return 'audio/mp4';
    if (fileType === 'ogg') return 'audio/ogg';
    if (fileType === 'flac') return 'audio/flac';
    return `audio/${fileType}`;
  } else if (isVideoFile(fileType)) {
    if (fileType === 'mp4') return 'video/mp4';
    if (fileType === 'mov') return 'video/quicktime';
    if (fileType === 'avi') return 'video/x-msvideo';
    if (fileType === 'webm') return 'video/webm';
    if (fileType === 'mkv') return 'video/x-matroska';
    return `video/${fileType}`;
  }
  return 'application/octet-stream';
}

function decideFilesToUpload(command, filePath, detectedMimeType) {
  if (command === 'matsuura_feedback' || command === 'waltz_feedback') {
    return [
      { path: filePath, mimeType: detectedMimeType },
    ];
  } else {
    return [
      { path: "assets/how_to_evaluate.pdf", mimeType: "application/pdf" },
      { path: "assets/how_to_sales.pdf", mimeType: "application/pdf" },
      { path: filePath, mimeType: detectedMimeType },
    ];
  }
}

async function uploadFiles(filesToUploadConfig) {
  return await Promise.all(
    filesToUploadConfig.map(file => geminiFileService.uploadFile(file.path, file.mimeType))
  );
}

async function waitForFilesActive(uploadedFiles) {
  await geminiFileService.waitForFilesActive(uploadedFiles);
}

function preparePromptParts(strategy, uploadedFiles, additionalContext) {
  return strategy.preparePromptParts(uploadedFiles, additionalContext);
}

async function generateGeminiContent(modelName, promptParts, generationConfig) {
  return await genAI.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts: promptParts }],
    generationConfig,
  });
}

function validateAndFormatResponse(result, modelName) {
  const responseText = result.text;
  if (!responseText || responseText.length === 0) {
    logger.error('Gemini API response is empty or invalid.', { result });
    throw new Error('Gemini API did not return valid content.');
  }
  logger.info(`Gemini Result Text (first 100 chars): ${responseText.substring(0,100)}...`);
  const debugMessage = `\n\n\u007f\u007f\u007f\nDebug: Used model: ${modelName}\n\u007f\u007f\u007f`;
  return responseText + debugMessage;
}

async function cleanupUploadedFiles(uploadedFiles) {
  await geminiFileService.deleteFiles(uploadedFiles);
}

function logError(error) {
  logger.error(`AI処理中にエラーが発生しました: ${error.message}`, {
    errorMessage: error.message,
    errorStack: error.stack,
    errorCause: error.cause,
    errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
  });
  if (error.errorDetails) {
    logger.error('Gemini API Error Details:', error.errorDetails);
  }
}

/**
 * メディアファイルを処理する
 * @param {Object} options - 処理オプション
 * @param {string} options.filePath - ファイルパス
 * @param {string} options.fileType - ファイルタイプ
 * @param {string} options.command - 実行コマンド
 * @param {string} options.additionalContext - 追加コンテキスト
 * @param {string} options.channelId - チャンネルID (追加)
 * @param {string} options.threadTs - スレッドタイムスタンプ (追加)
 * @returns {Promise<string>} - 処理結果
 */
export const processMediaFile = async ({ filePath, fileType, command, additionalContext, channelId, threadTs }) => {
  logger.info(`メディアファイル処理開始: ${path.basename(filePath)}, コマンド: ${command}, channel=${channelId}, thread=${threadTs}`);

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  let uploadedFiles = null;
  try {
    // ファイルサイズを取得 (MB)
    const fileSizeInMegabytes = getFileSizeInMegabytes(filePath);
    logger.info(`File size: ${fileSizeInMegabytes.toFixed(2)} MB`);

    // ファイルサイズに基づいてモデル名を決定
    const modelName = selectModelName(fileSizeInMegabytes);
    logger.info(`Selected model based on file size: ${modelName}`);

    // 生成設定
    const generationConfig = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
    };

    // 1. コマンドに基づいて戦略を選択
    const strategy = selectStrategy(command);

    // 2. MimeType 判定
    const detectedMimeType = detectMimeType(fileType);
    logger.info(`Detected MimeType: ${detectedMimeType} for fileType: ${fileType}`);

    // 3. 戦略に応じてアップロードするファイルを決定
    const filesToUploadConfig = decideFilesToUpload(command, filePath, detectedMimeType);

    // 4. ファイルアップロード
    uploadedFiles = await uploadFiles(filesToUploadConfig);

    // 5. ファイル処理待機
    await waitForFilesActive(uploadedFiles);

    // 6. プロンプト準備
    const promptParts = preparePromptParts(strategy, uploadedFiles, additionalContext);

    // 7. Gemini API 呼び出し
    logger.info('Generating content with Gemini API...');
    const result = await generateGeminiContent(modelName, promptParts, generationConfig);
    logger.info('Gemini API response received.');

    // 8. レスポンス検証・整形
    const finalResponseText = validateAndFormatResponse(result, modelName);

    // 9. アップロードしたファイルを削除 (クリーンアップ)
    await cleanupUploadedFiles(uploadedFiles);

    return finalResponseText;

  } catch (error) {
    logError(error);
    // エラー発生時にもファイルの削除を試みる
    if (uploadedFiles) {
      await cleanupUploadedFiles(uploadedFiles);
    }
    throw error;
  }
};

// extractTimeRangesFromText は time-extraction-service.js に移動

/**
 * 音声ファイルかどうかを判定
 * @param {string} fileType - ファイルタイプ
 * @returns {boolean} - 音声ファイルかどうか
 */
function isAudioFile(fileType) {
  const audioTypes = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
  return audioTypes.includes(fileType.toLowerCase());
}

/**
 * 動画ファイルかどうかを判定
 * @param {string} fileType - ファイルタイプ
 * @returns {boolean} - 動画ファイルかどうか
 */
function isVideoFile(fileType) {
  const videoTypes = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
  return videoTypes.includes(fileType.toLowerCase());
}

export default { processMediaFile };
