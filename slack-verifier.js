// utils/slackVerifier.js
const crypto = require('crypto');
const config = require('../config/config');
const logger = require('./logger');

/**
 * Slackリクエストの署名を検証するミドルウェア
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
exports.verifySlackRequest = (req, res, next) => {
  try {
    // URL検証チャレンジの場合は検証をスキップ
    if (req.body && req.body.type === 'url_verification') {
      return next();
    }
    
    const slackSignature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];
    
    if (!slackSignature || !timestamp) {
      logger.warn('Slack署名またはタイムスタンプがリクエストに含まれていません');
      return res.status(401).send('Unauthorized');
    }
    
    // タイムスタンプが古すぎる場合（5分以上前）はリプレイ攻撃の可能性あり
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > 300) {
      logger.warn(`タイムスタンプが古すぎます: ${timestamp}, 現在: ${currentTime}`);
      return res.status(401).send('Unauthorized');
    }
    
    // リクエストボディをJSON文字列化（既にパース済みの場合）
    const body = req.rawBody || JSON.stringify(req.body);
    
    // 署名の計算
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', config.SLACK_SIGNING_SECRET);
    const calculatedSignature = `v0=${hmac.update(baseString).digest('hex')}`;
    
    // 署名の検証
    if (crypto.timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(slackSignature)
    )) {
      logger.info('Slack署名の検証に成功しました');
      return next();
    } else {
      logger.warn('Slack署名の検証に失敗しました');
      return res.status(401).send('Unauthorized');
    }
  } catch (error) {
    logger.error(`署名検証中にエラーが発生しました: ${error.message}`, { error });
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Express.jsでreq.rawBodyを取得するためのミドルウェア
 * (slackVerifier.verifySlackRequestの前に使用する)
 * @param {Object} req - リクエストオブジェクト
 * @param {Object} res - レスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
exports.captureRawBody = (req, res, next) => {
  let data = '';
  
  req.on('data', (chunk) => {
    data += chunk;
  });
  
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};
