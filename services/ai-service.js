// services/aiService.js
// Vertex AI SDK (旧実装) はコメントアウトまたは削除 - Gemini API (generative-ai SDK) を使用
// const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require('fs');
const path = require('path');
// storageService は Gemini API ファイルアップロードを使うため不要になる可能性あり
// const storageService = require('./storage-service.js');
const logger = require('../utils/logger.js');
const config = require('../config/config.js');
// Strategy を読み込む
const DefaultFeedbackStrategy = require('./ai-strategies/default-feedback-strategy.js');
const MatsuuraFeedbackStrategy = require('./ai-strategies/matsuura-feedback-strategy.js');

// Gemini API クライアントの初期化
// TODO: config.js で GEMINI_API_KEY を必須にするか検討
const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY; // config経由または直接環境変数から取得
if (!apiKey) {
  logger.error('GEMINI_API_KEY が設定されていません。');
  // 起動時にエラーにするか、処理時にエラーにするか検討
  // throw new Error('GEMINI_API_KEY is not set.');
}
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// Vertex AI クライアントの初期化 (旧実装 - コメントアウト)
/*
const vertexai = new VertexAI({
  project: config.GCP_PROJECT_ID, // Vertex AI SDK を使う場合は必要
  location: config.GCP_LOCATION, // Vertex AI SDK を使う場合は必要
});
*/

// --- Gemini API モデル設定 ---
// モデル名はサンプルスクリプトに合わせて変更
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro-exp-03-25", // "gemini-1.5-pro-latest" やサンプルで使用されていた "gemini-1.5-pro-exp-03-25" など、利用可能なモデルを指定
});

// 生成設定もサンプルスクリプトに合わせる (必要に応じて調整)
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192, // サンプルより少し減らす場合など調整
  responseMimeType: "text/plain",
};
// --- ここまで Gemini API モデル設定 ---

// --- ヘルパー関数 (サンプルスクリプトから移植) ---
/**
 * Uploads the given file to Gemini.
 */
async function uploadToGemini(filePath, mimeType) {
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: path.basename(filePath), // パス全体ではなくファイル名を表示
  });
  const file = uploadResult.file;
  logger.info(`Uploaded file ${file.displayName} as: ${file.name} (URI: ${file.uri})`);
  return file;
}

/**
 * Waits for the given files to be active.
 */
async function waitForFilesActive(files) {
  logger.info("Waiting for file processing...");
  let allFilesReady = true;
  for (const name of files.map((file) => file.name)) {
    process.stdout.write(`  - ${name}: `);
    let file = await fileManager.getFile(name);
    let retries = 0;
    const maxRetries = 6; // 約1分待機
    while (file.state === "PROCESSING" && retries < maxRetries) {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 10_000)); // 10秒待機
      file = await fileManager.getFile(name);
      retries++;
    }
    if (file.state === "ACTIVE") {
      process.stdout.write(" ACTIVE\n");
    } else {
      process.stdout.write(` ${file.state}\n`); // PROCESSING 以外の状態 (FAILEDなど) を表示
      logger.error(`File ${file.name} failed to process or timed out. State: ${file.state}`);
      allFilesReady = false;
      // エラー処理: 特定のファイルが失敗した場合、処理を中断するかどうか検討
      // throw Error(`File ${file.name} failed to process`);
    }
  }
  if (allFilesReady) {
    logger.info("...all files ready for prompting.\n");
  } else {
    logger.error("...some files failed processing. See logs above.\n");
    // 必要に応じてエラーをスローするなど、後続処理を中断する
    throw new Error("One or more files failed to process.");
  }
}
// --- ここまでヘルパー関数 ---


/**
 * コマンドに基づいて適切なAI処理戦略を選択する
 * @param {string} commandAction - 解析されたコマンドアクション
 * @returns {Object} - 選択された戦略オブジェクト
 */
function selectStrategy(commandAction) {
  switch (commandAction) {
    case '松浦さんAIでフィードバック':
      logger.info('Selecting Matsuura AI Feedback Strategy.');
      return MatsuuraFeedbackStrategy;
    case 'フィードバック': // デフォルト含む
    default:
      logger.info('Selecting Default Feedback Strategy.');
      return DefaultFeedbackStrategy;
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
exports.processMediaFile = async ({ filePath, fileType, command, additionalContext, channelId, threadTs }) => {
  logger.info(`メディアファイル処理開始: ${path.basename(filePath)}, コマンド: ${command}, channel=${channelId}, thread=${threadTs}`);

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  try {
    // 1. コマンドに基づいて戦略を選択
    const strategy = selectStrategy(command);

    // 2. ファイルを Gemini API にアップロード (戦略に応じてアップロードするファイルを変える)
    let filesToUploadConfig;
    let detectedMimeType = 'application/octet-stream'; // デフォルト

    // MimeType 判定 (共通処理)
    // TODO: mime-types ライブラリを使うなど、より堅牢な判定方法を検討
    if (isAudioFile(fileType)) {
      if (fileType === 'mp3') detectedMimeType = 'audio/mpeg';
      else if (fileType === 'wav') detectedMimeType = 'audio/wav';
      else if (fileType === 'm4a') detectedMimeType = 'audio/mp4'; // M4A often uses mp4 container
      else if (fileType === 'ogg') detectedMimeType = 'audio/ogg';
      else if (fileType === 'flac') detectedMimeType = 'audio/flac';
      else detectedMimeType = `audio/${fileType}`;
    } else if (isVideoFile(fileType)) {
      if (fileType === 'mp4') detectedMimeType = 'video/mp4';
      else if (fileType === 'mov') detectedMimeType = 'video/quicktime';
      else if (fileType === 'avi') detectedMimeType = 'video/x-msvideo';
      else if (fileType === 'webm') detectedMimeType = 'video/webm';
      else if (fileType === 'mkv') detectedMimeType = 'video/x-matroska';
      else detectedMimeType = `video/${fileType}`;
    }
    logger.info(`Detected MimeType: ${detectedMimeType} for fileType: ${fileType}`);

    // 戦略に応じてアップロードするファイルを決定
    if (command === '松浦さんAIでフィードバック') {
      filesToUploadConfig = [
        { path: filePath, mimeType: detectedMimeType }, // メディアファイルのみ
      ];
    } else {
      filesToUploadConfig = [
        { path: "assets/how_to_evaluate.pdf", mimeType: "application/pdf" },
        { path: "assets/how_to_sales.pdf", mimeType: "application/pdf" },
        { path: filePath, mimeType: detectedMimeType }, // ドキュメント + メディアファイル
      ];
    }

    // ファイルアップロード実行 (共通処理)
    const uploadedFiles = await Promise.all(
        filesToUploadConfig.map(file => uploadToGemini(file.path, file.mimeType))
    );

    // 3. ファイル処理待機 (共通処理)
    await waitForFilesActive(uploadedFiles);

    // 4. プロンプト準備 (戦略に委譲)
    const promptParts = strategy.preparePromptParts(uploadedFiles, additionalContext);

    // 5. Gemini API 呼び出し (共通処理)
    logger.info('Generating content with Gemini API...');
    // const chatSession = model.startChat({ // サンプルのstartChatを使う場合
    //   generationConfig,
    //   history: [{ role: "user", parts: promptParts.slice(0, -1) }], // ファイル部分をhistoryに
    // });
    // const result = await chatSession.sendMessage(promptParts[promptParts.length - 1].text); // テキストプロンプトを送信

    // generateContent を使う場合 (より直接的)
    const result = await model.generateContent({
        contents: [{ role: "user", parts: promptParts }],
        generationConfig,
    });

    logger.info('Gemini API response received.');
    const response = result.response;

    // TODO: サンプルにあったレスポンス内のファイル書き出し処理は不要なら削除
    // const candidates = response.candidates;
    // ... (ファイル書き出し部分) ...

    // 6. 結果テキストを返す (共通処理)
    // エラーハンドリング: candidatesがない、または空の場合など
    if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
        logger.error('Gemini API response is empty or invalid.', { response });
        throw new Error('Gemini API did not return valid content.');
    }
    // シンプルに最初のテキストパートを返すことを想定
    const responseText = response.candidates[0].content.parts[0].text;
    logger.info(`Gemini Result Text (first 100 chars): ${responseText.substring(0,100)}...`);

    // 7. アップロードしたファイルを削除 (クリーンアップ) (共通処理)
    //    waitForFilesActiveの後、かつ結果取得後に実行
    logger.info('Deleting uploaded files from Gemini API...');
    await Promise.all(
        uploadedFiles.map(file => fileManager.deleteFile(file.name).catch(err => {
            // 削除エラーはログに残すが、処理は継続させる
            logger.warn(`Failed to delete file ${file.name} from Gemini API: ${err.message}`);
        }))
    );
    logger.info('Uploaded files deleted.');


    return responseText;

  } catch (error) {
    // エラーメッセージに加えて、エラーオブジェクト全体をログに出力する
    // JSON.stringify を使うことで、ネストされた情報も確認しやすくなる可能性がある
    // 第3引数に 2 を指定して整形する
    logger.error(`AI処理中にエラーが発生しました: ${error.message}`, {
      errorMessage: error.message,
      errorStack: error.stack, // スタックトレースを追加
      errorCause: error.cause, // fetchエラーの場合、causeに詳細が含まれることがある
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error), 2) // エラーオブジェクトの全プロパティを文字列化
    });
    // error.errorDetails は Google API エラーでよく使われるプロパティなので残しておく
    if (error.errorDetails) {
      logger.error('Gemini API Error Details:', error.errorDetails);
    }
    throw error; // エラーを再スローして呼び出し元で処理させる
  }
}; // exports.processMediaFile の閉じ括弧を追加

/* --- 元の処理 (コメントアウト) ---
*/

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
