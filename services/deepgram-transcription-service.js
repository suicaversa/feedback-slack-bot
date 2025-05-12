import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  throw new Error('DEEPGRAM_API_KEY is not set.');
}

// Deepgram対応拡張子→Content-Type判定
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.mp4': return 'audio/mp4';
    case '.m4a': return 'audio/mp4';
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.flac': return 'audio/flac';
    default:
      throw new Error(`未対応または不明な拡張子です: ${ext}`);
  }
}

/**
 * Deepgramで日本語・話者分離付きで文字起こしを行い、話者ごとに整形済みテキストを返す
 * @param {string} filePath - 音声ファイルのパス
 * @returns {Promise<string>} - 話者ごとに整形済みの文字起こしテキスト
 */
export async function transcribeWithSpeakerDiarization(filePath) {
  logger.info(`Deepgram文字起こし開始: ${filePath}`);
  const audioBuffer = fs.readFileSync(filePath);
  const url = 'https://api.deepgram.com/v1/listen?punctuate=true&language=ja&diarize=true&utterances=true&model=nova-2';

  const contentType = getContentType(filePath);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': contentType,
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error('Deepgram APIエラー', { status: response.status, errText });
    throw new Error(`Deepgram API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  // console.log('Deepgram APIレスポンス:', JSON.stringify(data, null, 2));
  // 話者分離結果を整形
  const utterances = data.results.utterances;
  if (!utterances || utterances.length === 0) {
    logger.warn('Deepgram: 話者分離付きの発話が見つかりませんでした。');
    return '';
  }
  // 例: [SPEAKER 1] こんにちは。\n[SPEAKER 2] はい、どうぞ。
  const formatted = utterances.map(u => `[SPEAKER ${u.speaker}] ${u.transcript.replace(/ /g, '')}`).join('\n');
  logger.info('Deepgram文字起こし完了');
  return formatted;
}

export default { transcribeWithSpeakerDiarization }; 