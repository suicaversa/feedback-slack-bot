const { extractTimeRangesFromText } = require('./services/time-extraction-service');
const logger = require('./utils/logger'); // Assuming logger exists

// --- Test Cases ---
const testTexts = [
    "10分から12分まで切り抜いてください。",
    "5:15から20:30と、あと1時間5分10秒から1時間10分5秒の部分をお願いします。",
    "最初の5分間だけお願いします。", // This should not extract a range
    "30秒から1分までと、最後の10秒間", // "最後の10秒間" is ambiguous
    "切り抜きは不要です。", // No time ranges
    "00:01:30から00:02:00まで、それと 00:03:00-00:03:30 も。", // Different formats
    "1時間から1時間半まで", // "1時間半" might be tricky, let's see
    "invalid time format 99:99:99 to 11:11:11", // Invalid format
    "", // Empty string
    "5分から10分、15分から20分、25分から30分", // Multiple ranges
];
// --- End Test Cases ---

async function runTest() {
    logger.info('--- Starting Time Extraction Test ---');

    // Ensure API key is available (the service checks internally, but good practice)
    if (!process.env.GEMINI_API_KEY && !require('./config/config.js').GEMINI_API_KEY) {
        logger.error('GEMINI_API_KEY is not set. Skipping test.');
        logger.info('--- Time Extraction Test Finished (Skipped) ---');
        return;
    }

    for (let i = 0; i < testTexts.length; i++) {
        const text = testTexts[i];
        logger.info(`\n[Test Case ${i + 1}] Input Text: "${text}"`);
        try {
            const timeRanges = await extractTimeRangesFromText(text);
            logger.info(`[Test Case ${i + 1}] Extracted Ranges: ${JSON.stringify(timeRanges)}`);
            // Basic validation check (array is expected)
            if (!Array.isArray(timeRanges)) {
                 logger.error(`[Test Case ${i + 1}] FAILED: Result is not an array!`);
            } else {
                 logger.info(`[Test Case ${i + 1}] PASSED (Format Check)`);
            }
        } catch (error) {
            logger.error(`[Test Case ${i + 1}] FAILED with error: ${error.message}`);
            if (error.stack) {
                 logger.error(`Stack trace: ${error.stack}`);
            }
        }
    }

    logger.info('\n--- Time Extraction Test Finished ---');
}

// Execute the test function
runTest();
