// index.js - メインエントリーポイント
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import slackController from './controllers/slack-controller.js';
import slackVerifier from './utils/slack-verifier.js';
import logger from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 8080;

// リクエストボディのパース
app.use(bodyParser.json());

// Slack署名検証ミドルウェア (一時的に無効化)
// app.use('/api/slack/events', slackVerifier.verifySlackRequest);

// URL検証チャレンジ (Slack Events API用 - 先に処理)
app.post('/api/slack/events', (req, res, next) => {
  if (req.body && req.body.type === 'url_verification') {
    logger.info('URL検証チャレンジを受信');
    return res.json({ challenge: req.body.challenge });
  }
  // url_verificationでなければ次のハンドラへ
  next();
});

// Slackイベントエンドポイント (url_verification以外を処理)
app.post('/api/slack/events', slackController.handleSlackEvent);

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// エラーハンドリング
app.use((err, req, res, next) => {
  logger.error(`エラーが発生しました: ${err.message}`, { error: err });
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

// サーバー起動部分は Functions Framework が担当するため削除
// app.listen(PORT, () => {
//   logger.info(`サーバーが起動しました: ポート ${PORT}`);
// });

// Express アプリケーションインスタンスをエクスポート
export default app;
