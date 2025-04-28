const path = require('path');
const MediaEditingService = require('./services/media-editing-service');
const logger = require('./utils/logger'); // Assuming logger exists

// --- Configuration ---
const inputFile = path.join(__dirname, 'assets', 'sample.mp3'); // Path to your sample media file
const outputDir = path.join(__dirname, 'output'); // Directory to save the output file
const timeRanges = [
    { start: '00:00:05', end: '00:00:10' }, // Cut from 5s to 10s
    { start: '00:00:15', end: '00:00:20' }  // Cut from 15s to 20s
];
const outputPrefix = 'test_cut';
// --- End Configuration ---

async function runTest() {
    logger.info('--- Starting Media Editing Test ---');
    logger.info(`Input file: ${inputFile}`);
    logger.info(`Output directory: ${outputDir}`);
    logger.info(`Time ranges: ${JSON.stringify(timeRanges)}`);

    // Use the output directory as the temporary directory for this test
    const mediaEditingService = new MediaEditingService(outputDir);

    try {
        // Ensure output directory exists (it doubles as temp dir here)
        await mediaEditingService.ensureTempDirExists();
        logger.info(`Ensured output/temp directory exists: ${outputDir}`);

        // Perform the cut operation - expects an array of output paths now
        const outputPaths = await mediaEditingService.cutMedia(inputFile, timeRanges, outputPrefix);

        if (outputPaths && outputPaths.length > 0) {
            logger.info('--- Media Editing Test Successful ---');
            logger.info(`Created ${outputPaths.length} segment file(s):`);
            outputPaths.forEach((p, index) => logger.info(`  Segment ${index}: ${p}`));
            logger.info('Please check the output files for correctness.');
        } else {
            // This case might happen if no valid time ranges resulted in cuts
            logger.warn('--- Media Editing Test Completed ---');
            logger.warn('No output files were generated. This might be expected if no valid segments were cut.');
        }

    } catch (error) {
        logger.error('--- Media Editing Test Failed ---');
        logger.error(`Error: ${error.message}`);
        if (error.stack) {
            logger.error(`Stack trace: ${error.stack}`);
        }
        // Log ffmpeg stderr if available in the error message (based on service implementation)
        if (error.message.includes('ffmpeg stderr')) {
             logger.error(`FFmpeg Error Details: ${error.message}`);
        }
    } finally {
        logger.info('--- Media Editing Test Finished ---');
    }
}

// Execute the test function
runTest();
