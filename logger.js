// utils/logger.js
const winston = require('winston');
const { LoggingWinston } = require('@google-cloud/logging-winston');

// 環境変数からログレベルを取得（デフォルトはinfo）
const logLevel = process.env.LOG_LEVEL || 'info';

// Cloud Loggingの設定
const loggingWinston = new LoggingWinston({
  projectId: process.env.GCP_PROJECT_ID,
  logName: 'slack-bot-log',
  // Production環境以外では認証情報は自動検出
  keyFilename: process.env.NODE_ENV === 'production' ? undefined : process.env.GCP_KEY_FILE,
});

// 開発環境用のコンソールフォーマッタ
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...rest }) => {
    const restString = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    return `${timestamp} ${level}: ${message} ${restString}`;
  })
);

// トランスポートの設定
const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  })
];

// 本番環境の場合はCloud Loggingも追加
if (process.env.NODE_ENV === 'production') {
  transports.push(loggingWinston);
}

// Winstonロガーの作成
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports,
  // エラーが発生した場合に例外を投げない
  exitOnError: false
});

module.exports = logger;
