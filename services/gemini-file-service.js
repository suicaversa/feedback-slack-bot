// services/gemini-file-service.js
import { GoogleGenAI, createPartFromUri } from "@google/genai";
import path from "path";
import logger from "../utils/logger.js";
import config from "../config/config.js";

const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.error("GEMINI_API_KEY is not configured for GeminiFileService.");
}
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * ファイルをGemini APIにアップロードする
 * @param {string} filePath - ローカルファイルパス
 * @param {string} mimeType - MIMEタイプ
 * @returns {Promise<object>} - アップロードされたファイルオブジェクト
 */
export async function uploadFile(filePath, mimeType) {
  if (!ai) throw new Error("GeminiFileService requires GEMINI_API_KEY to be configured.");
  try {
    const uploadResult = await ai.files.upload({
      file: filePath,
      config: { mimeType, displayName: path.basename(filePath) },
    });
    logger.info(`Uploaded file ${uploadResult.displayName} as: ${uploadResult.name} (URI: ${uploadResult.uri})`);
    return uploadResult;
  } catch (error) {
    logger.error(`Failed to upload file ${filePath} to Gemini: ${error.message}`, error);
    throw error;
  }
}

/**
 * 複数ファイルがACTIVEになるまで待機
 * @param {Array<object>} files - uploadFileの返り値配列
 * @param {number} timeoutSeconds - 最大待機秒数（デフォルト1800秒）
 */
export async function waitForFilesActive(files, timeoutSeconds = 1800) {
  if (!ai) throw new Error("GeminiFileService requires GEMINI_API_KEY to be configured.");
  if (!files || files.length === 0) {
    logger.info("No files provided to waitForFilesActive.");
    return;
  }
  logger.info("Waiting for file processing...");
  const pollIntervalMs = 10000;
  const maxRetries = Math.ceil((timeoutSeconds * 1000) / pollIntervalMs);

  const filePromises = files.map(async (initialFile) => {
    let file = initialFile;
    let retries = 0;
    process.stdout.write(`  - ${file.name}: `);
    // すでにACTIVEなら即return
    if (file.state === "ACTIVE") {
      process.stdout.write(" ACTIVE (initial)\n");
      return true;
    }
    // ポーリング
    while (file.state === "PROCESSING" && retries < maxRetries) {
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      try {
        file = await ai.files.get({ name: file.name });
      } catch (getError) {
        logger.error(`Error fetching status for file ${file.name}: ${getError.message}`);
        process.stdout.write(" ERROR_FETCHING_STATUS\n");
        return false;
      }
      retries++;
    }
    if (file.state === "ACTIVE") {
      process.stdout.write(" ACTIVE\n");
      return true;
    } else {
      process.stdout.write(` ${file.state}\n`);
      logger.error(`File ${file.name} failed to process or timed out after ${retries * pollIntervalMs / 1000}s. Final State: ${file.state}`);
      return false;
    }
  });
  const results = await Promise.all(filePromises);
  const allFilesReady = results.every((status) => status === true);
  if (allFilesReady) {
    logger.info("...all files ready for prompting.\n");
  } else {
    logger.error("...some files failed processing or timed out. See logs above.\n");
    throw new Error("One or more files failed to process or timed out.");
  }
}

/**
 * 複数ファイルをGemini APIから削除
 * @param {Array<object>} files - uploadFileの返り値配列
 */
export async function deleteFiles(files) {
  if (!ai) {
    logger.warn("Cannot delete files, GeminiFileService requires GEMINI_API_KEY.");
    return;
  }
  if (!files || files.length === 0) {
    logger.info("No files provided to deleteFiles.");
    return;
  }
  logger.info("Deleting uploaded files from Gemini API...");
  await Promise.all(
    files.map(async (file) => {
      if (file && file.name) {
        try {
          await ai.files.delete({ name: file.name });
          logger.info(`Deleted file ${file.name} from Gemini API.`);
        } catch (err) {
          logger.warn(`Failed to delete file ${file.name} from Gemini API: ${err.message}`);
        }
      } else {
        logger.warn("Attempted to delete an invalid file object:", file);
      }
    })
  );
  logger.info("Finished attempting to delete uploaded files.");
}
