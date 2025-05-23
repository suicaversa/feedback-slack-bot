import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { TranscriptionStrategy } from './TranscriptionStrategy.js';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  throw new Error('DEEPGRAM_API_KEY is not set.');
}

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

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export class DeepgramTranscriptionStrategy extends TranscriptionStrategy {
  /**
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async transcribe(filePath) {
    logger.info(`Deepgram文字起こし開始: ${filePath}`);
    const audioBuffer = fs.readFileSync(filePath);
    const url = 'https://api.deepgram.com/v1/listen?punctuate=true&language=multi&diarize=true&utterances=true&model=nova-3';
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
    const utterances = data.results.utterances;
    if (!utterances || utterances.length === 0) {
      logger.warn('Deepgram: 話者分離付きの発話が見つかりませんでした。');
      return '';
    }
    const formatted = utterances.map(u => {
      const time = formatTime(u.start);
      return `[${time}] [SPEAKER ${u.speaker}] ${u.transcript.replace(/ /g, '')}`;
    }).join('\n');
    logger.info('Deepgram文字起こし完了');
    return formatted;
  }
} 