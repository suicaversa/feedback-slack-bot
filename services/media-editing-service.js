const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger'); // Assuming logger exists

class MediaEditingService {

    /**
     * Converts HH:MM:SS.ms time string to seconds.
     * @param {string} timeString - The time string.
     * @returns {number} - Time in seconds.
     * @throws {Error} - If the format is invalid.
     */
    _timeToSeconds(timeString) {
        const parts = timeString.split(':');
        if (parts.length !== 3) {
            throw new Error(`Invalid time format: ${timeString}`);
        }
        const secondsParts = parts[2].split('.');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(secondsParts[0], 10);
        // Handle cases like "1.234" or just "1"
        const millisecondsString = (secondsParts[1] || '').padEnd(3, '0');
        const milliseconds = parseInt(millisecondsString.slice(0, 3), 10);


        if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
            throw new Error(`Invalid time format: ${timeString}`);
        }
        const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
        // logger.debug(`Converted ${timeString} to ${totalSeconds} seconds`);
        return totalSeconds;
    }


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

                let startSeconds, endSeconds, duration;
                try {
                    startSeconds = this._timeToSeconds(range.start);
                    endSeconds = this._timeToSeconds(range.end);
                    duration = endSeconds - startSeconds;
                    // Add a small tolerance for floating point issues
                    if (duration <= 0.001) {
                        logger.warn(`Invalid time range (duration <= 0) in range ${i}: start=${range.start}, end=${range.end}, duration=${duration}. Skipping.`);
                        continue;
                    }
                    logger.debug(`Calculated duration for segment ${i}: ${duration} seconds`);
                } catch (timeError) {
                    logger.warn(`Error parsing time in range ${i}: ${timeError.message}. Skipping.`);
                    continue;
                }


                const segmentOutputPath = path.join(this.tempDir, `${outputFileNamePrefix}_${uniqueId}_segment_${i}${path.extname(inputPath)}`);
                // Re-add -c copy. Use -t (duration) and -copyts. Keep -avoid_negative_ts.
                const command = `ffmpeg -copyts -i "${inputPath}" -ss ${range.start} -t ${duration} -c copy -avoid_negative_ts make_zero "${segmentOutputPath}"`;
                logger.info(`Executing ffmpeg command for segment ${i}: ${command}`);

                await new Promise(async (resolve, reject) => { // Add async here
                    // Increased maxBuffer size for potentially large stderr/stdout, though streaming might be better for very verbose output.
                    exec(command, { maxBuffer: 1024 * 1024 * 5 }, async (error, stdout, stderr) => { // Add async here
                        // Check for explicit error first
                        if (error) {
                            logger.error(`ffmpeg segment cutting error (segment ${i}): ${error.message}`);
                            logger.error(`ffmpeg stderr (segment ${i}): ${stderr}`);
                            logger.error(`ffmpeg stdout (segment ${i}): ${stdout}`);
                            reject(new Error(`Failed to cut segment ${i} [${range.start}-${range.end}]: ${stderr || error.message}`));
                            return;
                        }

                        // Check stderr for potential warnings/errors even if exit code is 0
                        const stderrLower = stderr.toLowerCase();
                        // More specific keywords to avoid false positives on common info messages
                        const warningKeywords = [
                            'invalid', 'error', 'fail', 'non-monotonous', 'could not',
                            'unable to', 'past duration', 'impossible timestamp',
                            'correction', 'overflow', 'skipping', 'dropping'
                         ];
                        const hasWarning = warningKeywords.some(keyword => stderrLower.includes(keyword));

                        // Additionally check if the output file was actually created and has size > 0
                        // This check happens *after* potential warnings, as warnings might still produce a valid file sometimes.
                        let fileExistsAndNotEmpty = false;
                        try {
                            // Use async fs.stat from require('fs').promises
                            const stats = await fs.stat(segmentOutputPath);
                            fileExistsAndNotEmpty = stats.isFile() && stats.size > 0;
                            if (!fileExistsAndNotEmpty) {
                                logger.warn(`ffmpeg output file for segment ${i} is missing or empty: ${segmentOutputPath}`);
                            } else {
                                logger.info(`Output file check OK for segment ${i}: ${segmentOutputPath} (Size: ${stats.size} bytes)`);
                            }
                        } catch (statError) {
                            // Log specific error codes if available (e.g., ENOENT for file not found)
                            const errorCode = statError.code ? ` (${statError.code})` : '';
                            logger.warn(`Could not stat ffmpeg output file for segment ${i}${errorCode}: ${statError.message}`);
                            // fileExistsAndNotEmpty remains false
                        }


                        if (hasWarning || !fileExistsAndNotEmpty) {
                            logger.warn(`Potential issue or empty/missing file detected for segment ${i}. Rejecting. Stderr: ${stderr}`);
                            // Try to delete the potentially problematic file before rejecting
                            // Use async unlink from require('fs').promises
                            fs.unlink(segmentOutputPath).catch(unlinkErr => logger.warn(`Failed to delete potentially problematic segment file ${segmentOutputPath}: ${unlinkErr.message}`));
                            reject(new Error(`Potential issue, empty/missing file, or warning in segment ${i} [${range.start}-${range.end}]. Check ffmpeg logs. Stderr: ${stderr}`));
                            return;
                        }

                        // Log success information
                        logger.info(`ffmpeg segment cutting stdout (segment ${i}): ${stdout}`);
                        if (stderr) { // Log remaining stderr as warning
                            logger.warn(`ffmpeg segment cutting stderr (segment ${i}): ${stderr}`);
                        }
                        logger.info(`Successfully cut segment ${i} to ${segmentOutputPath}`);
                        outputSegmentPaths.push(segmentOutputPath);
                        resolve();
                    });
                });
            } // End of loop

            if (outputSegmentPaths.length === 0 && timeRanges.length > 0) { // Only error if timeRanges were provided but none succeeded
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
