// services/time-extraction-service.js
import { GoogleGenAI, Type } from "@google/genai";
import logger from '../utils/logger.js';
import config from '../config/config.js';

const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.error('GEMINI_API_KEY is not configured for TimeExtractionService.');
}
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * テキストから時間範囲を抽出
 * @param {string} text
 * @returns {Promise<Array<object>>}
 */
async function extractTimeRangesFromText(text) {
  logger.info(`テキストからの時間範囲抽出を開始 (Structured Output): "${text}"`);
  if (!genAI) {
    logger.error('TimeExtractionService requires GEMINI_API_KEY to be configured.');
    throw new Error('TimeExtractionService requires GEMINI_API_KEY to be configured.');
  }
  if (!text || text.trim() === '') {
      logger.warn('Input text for time extraction is empty, returning empty array.');
      return [];
  }
  try {
    const modelName = 'gemini-2.0-flash';
    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          start: { type: Type.STRING, description: '開始時間 (HH:MM:SS形式)', nullable: false },
          end: { type: Type.STRING, description: '終了時間 (HH:MM:SS形式)', nullable: false },
        },
        required: ['start', 'end'],
      },
    };
    const generationConfig = { temperature: 0.1, maxOutputTokens: 1024 };
    const structuredOutputConfig = {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
    };
    const prompt = `以下のテキストから、動画または音声を切り抜くための時間範囲を抽出し、JSON形式の配列 **のみ** を返してください。\n時間は必ず "HH:MM:SS" 形式で表現してください。秒の小数点以下は無視してください。\n抽出する時間は、テキスト内で明確に「開始」と「終了」がペアになっている区間のみを対象とします。\n例えば「10分から12分まで」「10:00〜12:00」は開始 "00:10:00"、終了 "00:12:00" となります。\n「5分15秒から20分30秒」は開始 "00:05:15"、終了 "00:20:30" となります。\n「1時間5分10秒から1時間10分5秒」は開始 "01:05:10"、終了 "01:10:05" となります。\n「5分時点」「5分から」のような単一の時間や、開始/終了が不明確な区間は無視してください。\n時間範囲が見つからない場合は、必ず空の配列 \`[]\` のみを返してください。\n**応答には説明や他のテキストを一切含めず、JSON配列の文字列だけを出力してください。**\n\nテキスト:\n"${text}"\n\nテキスト:\n"${text}"`;
    logger.info(`Generating time ranges with Gemini model: ${modelName} using Structured Output (@google/genai)`);
    const result = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: generationConfig,
        config: structuredOutputConfig,
    });
    const response = result;
    const jsonResponseText = response.text;
    if (!jsonResponseText) {
         logger.warn('Gemini API response text is empty. Returning empty array.', { response });
         return [];
    }
    logger.info(`Gemini Raw Response Text: ${jsonResponseText}`);
    let timeRanges = [];
    try {
        if (!jsonResponseText || jsonResponseText.trim() === '') {
            logger.info('JSON response text is empty, returning empty array.');
            return [];
        }
        const parsedResponse = JSON.parse(jsonResponseText);
        if (!Array.isArray(parsedResponse)) {
            logger.error('Parsed structured response is not an array.', { parsed: parsedResponse });
            return [];
        }
        const validTimeRanges = [];
        const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
        for (const range of parsedResponse) {
            if (range && typeof range.start === 'string' && typeof range.end === 'string' &&
                timeRegex.test(range.start) && timeRegex.test(range.end)) {
                validTimeRanges.push({ start: range.start, end: range.end });
            } else {
                logger.warn(`Invalid time range format found in structured response, skipping: ${JSON.stringify(range)}`);
            }
        }
        timeRanges = validTimeRanges;
        logger.info(`Successfully extracted and validated time ranges: ${JSON.stringify(timeRanges)}`);
    } catch (parseError) {
        logger.error(`Failed to parse JSON response from Gemini: ${parseError.message}`, { rawResponse: jsonResponseText });
        return [];
    }
    return timeRanges;
  } catch (error) {
    logger.error(`時間範囲抽出中にエラーが発生しました (structured): ${error.message}`, {
      errorMessage: error.message,
      errorStack: error.stack,
      errorCause: error.cause,
    });
    if (error.errorDetails) {
      logger.error('Gemini API Error Details:', error.errorDetails);
    }
    return [];
  }
}

export default { extractTimeRangesFromText };
