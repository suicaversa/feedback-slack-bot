// services/gemini-file-service.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const path = require('path');
const logger = require('../utils/logger.js');
const config = require('../config/config.js');

// Initialize Gemini API clients specifically for file operations
const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  // Log error but allow service to load, throw error during operation if key is missing
  logger.error('GEMINI_API_KEY is not configured for GeminiFileService.');
}
// Create fileManager instance only if apiKey exists
const fileManager = apiKey ? new GoogleAIFileManager(apiKey) : null;

/**
 * Uploads a file to the Gemini API.
 * @param {string} filePath - Path to the local file.
 * @param {string} mimeType - Mime type of the file.
 * @returns {Promise<object>} - The uploaded file object from Gemini API.
 * @throws {Error} If API key is missing or upload fails.
 */
async function uploadFile(filePath, mimeType) {
  if (!fileManager) {
    throw new Error('GeminiFileService requires GEMINI_API_KEY to be configured.');
  }
  try {
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: path.basename(filePath),
    });
    const file = uploadResult.file;
    logger.info(`Uploaded file ${file.displayName} as: ${file.name} (URI: ${file.uri})`);
    return file;
  } catch (error) {
    logger.error(`Failed to upload file ${filePath} to Gemini: ${error.message}`, error);
    throw error; // Re-throw after logging
  }
}

/**
 * Waits for multiple Gemini API files to become active.
 * @param {Array<object>} files - Array of file objects returned by uploadFile.
 * @param {number} timeoutSeconds - Maximum time to wait in seconds. Defaults to 1800 (30 minutes).
 * @throws {Error} If any file fails to process or the timeout is reached.
 */
async function waitForFilesActive(files, timeoutSeconds = 1800) {
    if (!fileManager) {
        throw new Error('GeminiFileService requires GEMINI_API_KEY to be configured.');
    }
    if (!files || files.length === 0) {
        logger.info('No files provided to waitForFilesActive.');
        return;
    }

    logger.info("Waiting for file processing...");
    const pollIntervalMs = 10000; // 10 seconds
    const maxRetries = Math.ceil(timeoutSeconds * 1000 / pollIntervalMs);
    let allFilesReady = true;

    const filePromises = files.map(async (initialFile) => {
        const name = initialFile.name;
        process.stdout.write(`  - ${name}: `);
        let file = initialFile; // Start with the initially uploaded file object
        let retries = 0;

        // Check initial state first
        if (file.state !== "PROCESSING") {
             if (file.state === "ACTIVE") {
                 process.stdout.write(" ACTIVE (initial)\n");
                 return true; // Already active
             } else {
                 process.stdout.write(` ${file.state} (initial)\n`);
                 logger.error(`File ${name} initial state is not PROCESSING or ACTIVE: ${file.state}`);
                 return false; // Failed state initially
             }
        }

        // Poll if processing
        while (file.state === "PROCESSING" && retries < maxRetries) {
            process.stdout.write(".");
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            try {
                file = await fileManager.getFile(name);
            } catch (getError) {
                logger.error(`Error fetching status for file ${name}: ${getError.message}`);
                // Consider this a failure for this file
                process.stdout.write(` ERROR_FETCHING_STATUS\n`);
                return false;
            }
            retries++;
        }

        if (file.state === "ACTIVE") {
            process.stdout.write(" ACTIVE\n");
            return true;
        } else {
            process.stdout.write(` ${file.state}\n`); // Show final state (e.g., FAILED, TIMEOUT)
            logger.error(`File ${name} failed to process or timed out after ${retries * pollIntervalMs / 1000}s. Final State: ${file.state}`);
            return false;
        }
    });

    const results = await Promise.all(filePromises);
    allFilesReady = results.every(status => status === true);

    if (allFilesReady) {
        logger.info("...all files ready for prompting.\n");
    } else {
        logger.error("...some files failed processing or timed out. See logs above.\n");
        throw new Error("One or more files failed to process or timed out.");
    }
}


/**
 * Deletes multiple files from the Gemini API.
 * @param {Array<object>} files - Array of file objects returned by uploadFile.
 */
async function deleteFiles(files) {
  if (!fileManager) {
    logger.warn('Cannot delete files, GeminiFileService requires GEMINI_API_KEY.');
    return; // Don't throw, just warn and return if key is missing
  }
   if (!files || files.length === 0) {
        logger.info('No files provided to deleteFiles.');
        return;
    }

  logger.info('Deleting uploaded files from Gemini API...');
  await Promise.all(
    files.map(file => {
      if (file && file.name) {
        return fileManager.deleteFile(file.name)
          .then(() => logger.info(`Deleted file ${file.name} from Gemini API.`))
          .catch(err => {
            // Log deletion errors but don't let them stop the overall process
            logger.warn(`Failed to delete file ${file.name} from Gemini API: ${err.message}`);
          });
      } else {
        logger.warn('Attempted to delete an invalid file object:', file);
        return Promise.resolve(); // Resolve immediately for invalid entries
      }
    })
  );
  logger.info('Finished attempting to delete uploaded files.');
}

module.exports = {
  uploadFile,
  waitForFilesActive,
  deleteFiles,
};
