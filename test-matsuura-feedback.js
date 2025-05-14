import 'dotenv/config';
import { MatsuuraFeedbackPromptStrategy } from './services/prompt-strategies/MatsuuraFeedbackPromptStrategy.js';

async function main() {
  // サンプルの文字起こしテキスト
  const transcript = `
  こんにちは。本日はお時間いただきありがとうございます。まず、現状の課題をお伺いできればと思います。
  ...
  `;

  const strategy = new MatsuuraFeedbackPromptStrategy();

  try {
    const feedback = await strategy.generateFeedback(transcript);
    console.log('--- 松浦フィードバック生成結果 ---');
    console.log(feedback);
    console.log('-----------------------------');
  } catch (err) {
    console.error('エラー:', err);
  }
}

main(); 