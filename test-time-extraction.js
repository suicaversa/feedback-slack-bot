import timeExtractionService from './services/time-extraction-service.js';
import logger from './utils/logger.js';

async function runTimeExtractionTest() {
    const testCases = [
        '切り抜き 62:01-68:02', // 62分1秒から68分2秒のケース
        '切り抜き 80:10-90:10', // 80分10秒から90分10秒のケース
        '切り抜き 100:10-122:00', // 100分10秒から122分0秒のケース
        '切り抜き 120:00-130:00', // 120分から130分のケース
        '切り抜き 150:30-160:45', // 150分30秒から160分45秒のケース
        '切り抜き 200:00-210:00', // 200分から210分のケース
        '切り抜き 250:15-260:30', // 250分15秒から260分30秒のケース
    ];

    logger.info('--- 時間抽出テスト開始 ---');
    for (const testText of testCases) {
        logger.info(`テストテキスト: ${testText}`);
        try {
            const timeRanges = await timeExtractionService.extractTimeRangesFromText(testText);
            logger.info('抽出結果:');
            logger.info(JSON.stringify(timeRanges, null, 2));
        } catch (error) {
            logger.error('時間抽出テストでエラー:', error);
        }
    }
    logger.info('--- 時間抽出テスト終了 ---');
}

runTimeExtractionTest();
