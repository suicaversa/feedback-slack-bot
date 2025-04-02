// index.js - メインエントリーポイント
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const slackController = require('./controllers/slack-controller.js');
const slackVerifier = require('./utils/slack-verifier.js');
const logger = require('./utils/logger.js');

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

// サーバー起動
app.listen(PORT, () => {
  logger.info(`サーバーが起動しました: ポート ${PORT}`);
});

module.exports = app;
