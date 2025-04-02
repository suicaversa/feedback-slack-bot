// services/aiService.js
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const path = require('path');
const storageService = require('./storage-service.js');
const logger = require('../utils/logger.js');
const config = require('../config/config.js');

// Vertex AI クライアントの初期化
const vertexai = new VertexAI({
  project: config.GCP_PROJECT_ID,
  location: config.GCP_LOCATION,
});

// Gemini Proモデル
const generativeModel = vertexai.preview.getGenerativeModel({
  model: 'gemini-pro',
  generation_config: {
    max_output_tokens: 2048,
    temperature: 0.2,
  },
});

// 音声/動画処理用のモデル
const multimodalModel = vertexai.preview.getGenerativeModel({
  model: 'gemini-pro-vision',
  generation_config: {
    max_output_tokens: 2048,
    temperature: 0.2,
  },
});

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
  logger.info(`メディアファイル処理開始 (ダミーモード): ${path.basename(filePath)}, コマンド: ${command}, channel=${channelId}, thread=${threadTs}`);

  // --- 一時的にAI処理をスキップし、ダミーテキストを返す ---
  logger.warn('AI処理をスキップしてダミーテキストを返します。');
  return Promise.resolve(`ダミーの処理結果です (コマンド: ${command}, ファイルタイプ: ${fileType})`);
  // --- ここまで ---

  /* --- 元の処理 (コメントアウト) ---
  try {
    // 音声ファイルの場合は音声認識を行う
    if (isAudioFile(fileType)) {
      // channelId と threadTs を transcribeAudio に渡す
      const transcription = await transcribeAudio(filePath, channelId, threadTs);
      return await processTranscription(transcription, command, additionalContext);
    }

    // 動画ファイルの場合は動画処理を行う
    if (isVideoFile(fileType)) {
      return await processVideo(filePath, command, additionalContext);
    }
    
    throw new Error(`未対応のファイルタイプです: ${fileType}`);
  } catch (error) {
    logger.error(`AI処理中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
  */
};

/**
 * 音声ファイルの文字起こし
 * @param {string} filePath - 音声ファイルパス
 * @param {string} channelId - チャンネルID
 * @param {string} threadTs - スレッドタイムスタンプ
 * @returns {Promise<string>} - 文字起こし結果
 */
async function transcribeAudio(filePath, channelId, threadTs) {
  logger.info(`音声文字起こし開始: ${path.basename(filePath)}, channel=${channelId}, thread=${threadTs}`);

  try {
    // 音声ファイルをGCSにアップロード (チャンネルIDとスレッドTSを渡す)
    const gcsUri = await storageService.uploadFile(filePath, channelId, threadTs);

    // Speech-to-Text APIを使用して音声認識
    // 注: 実際の実装は別のサービスとして切り出すことも検討
    const { SpeechClient } = require('@google-cloud/speech');
    const speechClient = new SpeechClient();
    
    const audio = {
      uri: gcsUri,
    };
    
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    };
    
    const request = {
      audio: audio,
      config: config,
    };
    
    const [operation] = await speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();
    
    // 文字起こし結果を結合
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    
    logger.info(`音声文字起こし完了: ${transcription.substring(0, 100)}...`);
    
    // GCS上の一時ファイルを削除
    await storageService.deleteFile(gcsUri);
    
    return transcription;
  } catch (error) {
    logger.error(`音声文字起こし中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 動画ファイルの処理
 * @param {string} filePath - 動画ファイルパス
 * @param {string} command - 実行コマンド
 * @param {string} additionalContext - 追加コンテキスト
 * @returns {Promise<string>} - 処理結果
 */
async function processVideo(filePath, command, additionalContext) {
  logger.info(`動画処理開始: ${path.basename(filePath)}, コマンド: ${command}`);
  
  try {
    // 動画ファイルからオーディオを抽出して文字起こし
    const transcription = await extractAudioAndTranscribe(filePath);
    
    // 動画からフレームを抽出（数フレーム）
    const frameImagePaths = await extractFramesFromVideo(filePath);
    
    // マルチモーダルモデルでプロンプトを作成
    const prompt = createPromptForCommand(command, transcription, additionalContext);
    
    // 画像をBase64エンコード
    const imageContents = await Promise.all(
      frameImagePaths.map(async (imagePath) => {
        const imageBytes = fs.readFileSync(imagePath);
        return {
          inlineData: {
            data: imageBytes.toString('base64'),
            mimeType: 'image/jpeg',
          },
        };
      })
    );
    
    // Gemini API呼び出し (マルチモーダル)
    const result = await multimodalModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...imageContents,
          ],
        },
      ],
    });
    
    const response = result.response;
    const responseText = response.candidates[0].content.parts[0].text;
    
    // 一時ファイルのクリーンアップ
    frameImagePaths.forEach(framePath => {
      fs.unlinkSync(framePath);
    });
    
    return responseText;
  } catch (error) {
    logger.error(`動画処理中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 文字起こし結果をAIで処理
 * @param {string} transcription - 文字起こし結果
 * @param {string} command - 実行コマンド
 * @param {string} additionalContext - 追加コンテキスト
 * @returns {Promise<string>} - 処理結果
 */
async function processTranscription(transcription, command, additionalContext) {
  logger.info(`文字起こし結果の処理開始: コマンド=${command}`);
  
  try {
    // コマンドに応じたプロンプトを作成
    const prompt = createPromptForCommand(command, transcription, additionalContext);
    
    // Gemini APIを呼び出し
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    
    const response = result.response;
    return response.candidates[0].content.parts[0].text;
  } catch (error) {
    logger.error(`テキスト処理中にエラーが発生しました: ${error.message}`, { error });
    throw error;
  }
}

/**
 * コマンドに応じたプロンプトを生成
 * @param {string} command - 実行コマンド
 * @param {string} transcription - 文字起こし結果
 * @param {string} additionalContext - 追加コンテキスト
 * @returns {string} - プロンプト
 */
function createPromptForCommand(command, transcription, additionalContext) {
  const baseContext = `以下は音声または動画から抽出したテキスト内容です:\n\n${transcription}\n\n`;
  
  switch (command.toLowerCase()) {
    case '要約':
    case '要約して':
      return `${baseContext}上記の内容を簡潔に要約してください。${additionalContext || ''}`;
      
    case '議事録':
    case '議事録作成':
      return `${baseContext}上記の内容から議事録を作成してください。話者、主要な議題、決定事項、次のアクションアイテムなどを含めてください。${additionalContext || ''}`;
      
    case '分析':
    case '分析して':
      return `${baseContext}上記の内容を分析し、主要なポイント、トレンド、洞察を抽出してください。${additionalContext || ''}`;
      
    default:
      // デフォルトは要約
      return `${baseContext}上記の内容を要約してください。${additionalContext || ''}`;
  }
}

/**
 * 動画からオーディオを抽出して文字起こし
 * @param {string} videoPath - 動画ファイルパス
 * @returns {Promise<string>} - 文字起こし結果
 */
async function extractAudioAndTranscribe(videoPath) {
  // 動画からオーディオを抽出する処理
  // 実際にはffmpegなどを使用するが、ここでは簡略化
  const audioPath = `${videoPath}.wav`;
  
  // ffmpegを使用して動画からオーディオを抽出
  const { execSync } = require('child_process');
  execSync(`ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`);
  
  // 抽出したオーディオを文字起こし
  const transcription = await transcribeAudio(audioPath);
  
  // 一時ファイルを削除
  fs.unlinkSync(audioPath);
  
  return transcription;
}

/**
 * 動画からフレームを抽出
 * @param {string} videoPath - 動画ファイルパス
 * @param {number} frameCount - 抽出するフレーム数 (デフォルト: 3)
 * @returns {Promise<string[]>} - フレーム画像のパス配列
 */
async function extractFramesFromVideo(videoPath, frameCount = 3) {
  const outputDir = path.dirname(videoPath);
  const basename = path.basename(videoPath, path.extname(videoPath));
  const framePaths = [];
  
  // ffmpegを使用して動画からフレームを抽出
  const { execSync } = require('child_process');
  
  // 動画の長さを取得
  const durationOutput = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`).toString().trim();
  const duration = parseFloat(durationOutput);
  
  // フレーム抽出の間隔を計算
  const interval = duration / (frameCount + 1);
  
  // フレームを抽出
  for (let i = 1; i <= frameCount; i++) {
    const timestamp = interval * i;
    const outputPath = path.join(outputDir, `${basename}_frame_${i}.jpg`);
    
    execSync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`);
    framePaths.push(outputPath);
  }
  
  return framePaths;
}

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
