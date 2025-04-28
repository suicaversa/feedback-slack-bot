const path = require('path');
const MediaEditingService = require('./services/media-editing-service');
const { extractTimeRangesFromText } = require('./services/time-extraction-service');
const logger = require('./utils/logger');

// --- Configuration ---
const inputText = "5秒から10秒までと、15秒から20秒までを切り抜いてください。"; // Sample user text in Japanese
const inputFile = path.join(__dirname, 'assets', 'sample.mp3'); // Path to your sample media file
const outputDir = path.join(__dirname, 'output'); // Directory to save the output segments
const outputPrefix = 'integrated_cut';
// --- End Configuration ---

async function runIntegrationTest() {
    logger.info('--- Starting Integration Test (Time Extraction + Media Editing) ---');
    logger.info(`Input text: "${inputText}"`);
    logger.info(`Input file: ${inputFile}`);
    logger.info(`Output directory: ${outputDir}`);

    // Ensure API key is available for time extraction
    if (!process.env.GEMINI_API_KEY && !require('./config/config.js').GEMINI_API_KEY) {
        logger.error('GEMINI_API_KEY is not set. Skipping integration test.');
        logger.info('--- Integration Test Finished (Skipped) ---');
        return;
    }

    const mediaEditingService = new MediaEditingService(outputDir);

    try {
        // 1. Extract time ranges from text
        logger.info('Step 1: Extracting time ranges...');
        const timeRanges = await extractTimeRangesFromText(inputText);
        logger.info(`Extracted time ranges: ${JSON.stringify(timeRanges)}`);

        if (!timeRanges || timeRanges.length === 0) {
            logger.warn('No time ranges extracted from the text. Skipping media cutting.');
            logger.info('--- Integration Test Finished (No Ranges Found) ---');
            return;
        }

        // 2. Ensure output directory exists
        await mediaEditingService.ensureTempDirExists(); // Using the service's method
        logger.info(`Ensured output/temp directory exists: ${outputDir}`);

        // 3. Cut media based on extracted ranges
        logger.info('Step 2: Cutting media segments...');
        const outputPaths = await mediaEditingService.cutMedia(inputFile, timeRanges, outputPrefix);

        if (outputPaths && outputPaths.length > 0) {
            logger.info('--- Integration Test Successful ---');
            logger.info(`Created ${outputPaths.length} segment file(s):`);
            outputPaths.forEach((p, index) => logger.info(`  Segment ${index}: ${p}`));
            logger.info('Please check the output files.');
        } else {
            logger.warn('--- Integration Test Completed ---');
            logger.warn('Media cutting did not produce any files, even though time ranges were extracted.');
        }

    } catch (error) {
        logger.error('--- Integration Test Failed ---');
        logger.error(`Error: ${error.message}`);
        if (error.stack) {
            logger.error(`Stack trace: ${error.stack}`);
        }
    } finally {
        logger.info('--- Integration Test Finished ---');
    }
}

// Execute the integration test function
runIntegrationTest();
