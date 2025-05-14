// test-generate-feedback-text.js
import 'dotenv/config';
import { GenerateFeedbackTextService } from './services/GenerateFeedbackTextService.js';
import { GeminiStrategy } from './services/ai-strategies/GeminiStrategy.js';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY が環境変数に設定されていません');
    process.exit(1);
  }

  // サンプルの文字起こしテキスト
  const transcript = `
  こんにちは。本日はお時間いただきありがとうございます。弊社のサービスについてご説明させていただきます。
  まず、現状の課題をお伺いできればと思います。
  ...
  `;

  // Strategyとサービスのインスタンス化
  const strategy = new GeminiStrategy(apiKey);
  const service = new GenerateFeedbackTextService(strategy);

  try {
    const feedback = await service.generateFeedbackText({ transcript });
    console.log('--- フィードバック生成結果 ---');
    console.log(feedback);
    console.log('-----------------------------');
  } catch (err) {
    console.error('エラー:', err);
  }
}

main(); 