import path from 'path';
import { fileURLToPath } from 'url';
import MediaEditingService from './services/media-editing-service.js';
import logger from './utils/logger.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const inputFile = path.join(__dirname, 'tmp', 'failed_sample.mp4'); // Path to your sample media file
const outputDir = path.join(__dirname, 'tmp', 'output'); // Directory to save the output file
const timeRanges = [
    // { start: '00:00:05', end: '00:00:10' }, // Cut from 5s to 10s
    // { start: '00:00:15', end: '00:00:20' },  // Cut from 15s to 20s
    // { start: '00:18:05', end: '00:19:37' }
    // { start: '01:01:53', end: '01:16:05' }
    // 18:05-19:37を切り抜き
    { start: '00:18:05', end: '00:19:37' }

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
        await fs.mkdir(outputDir, { recursive: true });
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
