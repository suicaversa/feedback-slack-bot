// index.js - メインエントリーポイント
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const slackController = require('./controllers/slackController');
const slackVerifier = require('./utils/slackVerifier');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8080;

// リクエストボディのパース
app.use(bodyParser.json());

// Slack署名検証ミドルウェア
app.use('/api/slack/events', slackVerifier.verifySlackRequest);

// Slackイベントエンドポイント
app.post('/api/slack/events', slackController.handleSlackEvent);

// URL検証チャレンジ (Slack Events API用)
app.post('/api/slack/events', (req, res) => {
  if (req.body.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }
  res.status(200).send(); // イベントへの即時応答
});

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
