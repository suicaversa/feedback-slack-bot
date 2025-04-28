const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger'); // Assuming logger exists

class MediaEditingService {
    /**
     * Constructor for MediaEditingService.
     * @param {string} tempDir - Directory for temporary files. Defaults to '/tmp'.
     */
    constructor(tempDir = '/tmp') {
        this.tempDir = tempDir;
        logger.info(`MediaEditingService initialized with temp directory: ${this.tempDir}`);
    }

    /**
     * Ensures the temporary directory exists.
     */
    async ensureTempDirExists() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            logger.info(`Ensured temporary directory exists: ${this.tempDir}`);
        } catch (error) {
            logger.error(`Failed to create temporary directory ${this.tempDir}: ${error.message}`);
            throw error; // Re-throw to indicate failure
        }
    }

    /**
     * Cuts a media file into multiple segments based on the provided time ranges.
     * @param {string} inputPath - Path to the input media file.
     * @param {Array<object>} timeRanges - Array of time ranges, e.g., [{ start: '00:10:00', end: '00:12:00' }, { start: '00:20:00', end: '00:25:00' }]
     * @param {string} outputFileNamePrefix - Prefix for the output file names. Defaults to 'cut'.
     * @returns {Promise<Array<string>>} - Array of paths to the created segment files.
     * @throws {Error} - If ffmpeg command fails for any segment, no valid time ranges are provided, or temp dir cannot be created.
     */
    async cutMedia(inputPath, timeRanges, outputFileNamePrefix = 'cut') {
        logger.info(`Starting media segment cutting for: ${inputPath}`);
        logger.info(`Time ranges: ${JSON.stringify(timeRanges)}`);

        if (!timeRanges || timeRanges.length === 0) {
            logger.error('No valid time ranges provided.');
            throw new Error('No valid time ranges provided.');
        }

        await this.ensureTempDirExists(); // Ensure temp directory is ready

        const outputSegmentPaths = [];
        const uniqueId = uuidv4();
        // listFilePath and finalOutputPath are no longer needed for concatenation

        try {
            // 1. Cut individual segments
            logger.info('Starting individual segment cutting...');
            for (let i = 0; i < timeRanges.length; i++) {
                const range = timeRanges[i];
                // Validate time format roughly (HH:MM:SS or HH:MM:SS.ms)
                if (!/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(range.start) || !/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(range.end)) {
                     logger.warn(`Invalid time format in range ${i}: start=${range.start}, end=${range.end}. Skipping.`);
                     continue; // Skip invalid ranges
                }

                const segmentOutputPath = path.join(this.tempDir, `${outputFileNamePrefix}_${uniqueId}_segment_${i}${path.extname(inputPath)}`);
                // Use -c copy for faster, lossless cutting if format allows. Add -avoid_negative_ts make_zero for compatibility.
                // Removed -to, using -ss and -t (duration) or just -ss and -to might be more reliable depending on ffmpeg version and format.
                // Let's stick with -ss and -to for now as it's generally intuitive.
                // Added quotes around paths to handle spaces.
                const command = `ffmpeg -i "${inputPath}" -ss ${range.start} -to ${range.end} -c copy -avoid_negative_ts make_zero "${segmentOutputPath}"`;
                logger.info(`Executing ffmpeg command for segment ${i}: ${command}`);

                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            // Log detailed error information
                            logger.error(`ffmpeg segment cutting error (segment ${i}): ${error.message}`);
                            logger.error(`ffmpeg stderr (segment ${i}): ${stderr}`);
                            logger.error(`ffmpeg stdout (segment ${i}): ${stdout}`);
                            // Reject with a more informative error
                            reject(new Error(`Failed to cut segment ${i} [${range.start}-${range.end}]: ${stderr || error.message}`));
                            return;
                        }
                        // Log success information
                        logger.info(`ffmpeg segment cutting stdout (segment ${i}): ${stdout}`);
                        if (stderr) { // Log stderr even on success as it might contain warnings
                            logger.warn(`ffmpeg segment cutting stderr (segment ${i}): ${stderr}`);
                        }
                        logger.info(`Successfully cut segment ${i} to ${segmentOutputPath}`);
                        outputSegmentPaths.push(segmentOutputPath); // Store the path of the created segment
                        resolve();
                    });
                });
            } // End of loop

            if (outputSegmentPaths.length === 0) {
                logger.error('No segments were successfully cut. Check time ranges and input file.');
                // Consider if throwing an error or returning empty array is better
                // throw new Error('No segments were successfully cut.');
                return []; // Return empty array if no segments were cut
            }
            logger.info(`Successfully cut ${outputSegmentPaths.length} segments.`);

            // No concatenation needed. Return the paths of the created segments.
            logger.info(`Media segment cutting complete. Output paths: ${JSON.stringify(outputSegmentPaths)}`);
            return outputSegmentPaths;

        } catch (error) {
            // Catch and log any error from the process
            logger.error(`Error during media segment cutting process: ${error.message}`, error.stack);
            // Attempt to clean up any segments that might have been created before the error
            logger.info('Attempting cleanup after error...');
            for (const segmentPath of outputSegmentPaths) {
                 try {
                     // Check if file exists before unlinking
                     if (await fs.stat(segmentPath).catch(() => false)) {
                         await fs.unlink(segmentPath);
                         logger.info(`Cleaned up temporary segment file after error: ${segmentPath}`);
                     }
                 } catch (cleanupError) {
                     logger.warn(`Failed to clean up temporary segment file ${segmentPath} after error: ${cleanupError.message}`);
                 }
            }
            throw error; // Re-throw the error after logging and attempting cleanup
        }
        // No finally block needed here as cleanup is handled in catch or after successful return
    }
}

module.exports = MediaEditingService;
