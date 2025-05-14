// test-feedback-service.js
import 'dotenv/config';
import { FeedbackService } from './services/FeedbackService.js';
import { TranscriptionService } from './services/TranscriptionService.js';
import { DeepgramTranscriptionStrategy } from './services/transcription-strategies/DeepgramTranscriptionStrategy.js';
import { GenerateFeedbackTextService } from './services/GenerateFeedbackTextService.js';
import { GeminiStrategy } from './services/ai-strategies/GeminiStrategy.js';

async function main() {
  // テスト用ファイルパスとコマンドをコマンドライン引数から取得
  const filePath = process.argv[2];
  const command = process.argv[3] || 'feedback';
  if (!filePath) {
    console.error('使い方: node test-feedback-service.js <音声/動画ファイルパス> [コマンド]');
    process.exit(1);
  }

  // サービス初期化
  const feedbackService = new FeedbackService();

  try {
    const feedback = await feedbackService.generateFeedback(filePath, command);
    console.log('--- フィードバック生成結果 ---');
    console.log(feedback);
    console.log('-----------------------------');
  } catch (err) {
    console.error('エラー:', err);
  }
}

main(); 