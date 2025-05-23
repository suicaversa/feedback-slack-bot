import 'dotenv/config';
import { DefaultFeedbackPromptStrategy } from './services/prompt-strategies/DefaultFeedbackPromptStrategy.js';

async function main() {
  // サンプルの文字起こしテキスト
  const transcript = `
  こんにちは。本日はお時間いただきありがとうございます。まず、現状の課題をお伺いできればと思います。
  ...
  `;

  const strategy = new DefaultFeedbackPromptStrategy();

  try {
    const feedback = await strategy.generateFeedback(transcript);
    console.log('--- Defaultフィードバック生成結果 ---');
    console.log(feedback);
    console.log('-----------------------------');
  } catch (err) {
    console.error('エラー:', err);
  }
}

main(); 