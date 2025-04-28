// services/time-extraction-service.js
// Use @google/genai package for structured output
const { GoogleGenAI, Type } = require("@google/genai");
const logger = require('../utils/logger.js');
const config = require('../config/config.js');

// Initialize Gemini API client using @google/genai
const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.error('GEMINI_API_KEY is not configured for TimeExtractionService.');
  // Service can load, but function will throw error if key is missing
}
// Create genAI instance using GoogleGenAI from @google/genai
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null; // Pass apiKey in constructor object

/**
 * Extracts time ranges from text using Gemini API with Structured Output.
 * @param {string} text - The user's text message.
 * @returns {Promise<Array<object>>} - An array of time range objects [{ start: 'HH:MM:SS', end: 'HH:MM:SS' }]. Returns empty array on failure or if no ranges found.
 * @throws {Error} - If the API key is not configured.
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
    // Model name for text processing - Change to gemini-2.0-flash as requested
    const modelName = 'gemini-2.0-flash'; // Or 'gemini-pro' or other compatible model

    // Define the response schema for structured output (using Type from @google/genai)
    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          start: {
            type: Type.STRING,
            description: '開始時間 (HH:MM:SS形式)',
            nullable: false,
          },
          end: {
            type: Type.STRING,
            description: '終了時間 (HH:MM:SS形式)',
            nullable: false,
          },
        },
        required: ['start', 'end'],
      },
    };

    // Separate generationConfig and config for structured output
    const generationConfig = {
      temperature: 0.1, // Standard generation params
      maxOutputTokens: 1024,
    };
    const structuredOutputConfig = {
        responseMimeType: "application/json", // Params specific to structured output
        responseSchema: responseSchema,
    };

    // Prompt focusing on extraction rules
    const prompt = `以下のテキストから、動画または音声を切り抜くための時間範囲を抽出し、JSON形式の配列 **のみ** を返してください。
時間は必ず "HH:MM:SS" 形式で表現してください。秒の小数点以下は無視してください。
抽出する時間は、テキスト内で明確に「開始」と「終了」がペアになっている区間のみを対象とします。
例えば「10分から12分まで」「10:00〜12:00」は開始 "00:10:00"、終了 "00:12:00" となります。
「5分15秒から20分30秒」は開始 "00:05:15"、終了 "00:20:30" となります。
「1時間5分10秒から1時間10分5秒」は開始 "01:05:10"、終了 "01:10:05" となります。
「5分時点」「5分から」のような単一の時間や、開始/終了が不明確な区間は無視してください。
時間範囲が見つからない場合は、必ず空の配列 \`[]\` のみを返してください。
**応答には説明や他のテキストを一切含めず、JSON配列の文字列だけを出力してください。**

テキスト:
"${text}"

テキスト:
"${text}"`; // Remove the explicit "JSON配列文字列:" part

    logger.info(`Generating time ranges with Gemini model: ${modelName} using Structured Output (@google/genai)`);
    // Use the genAI instance directly to call generateContent, passing config separately
    const result = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: generationConfig, // Pass standard generation config
        config: structuredOutputConfig,   // Pass structured output config
    });

    // @google/genai returns the response directly in result, not result.response
    // @google/genai returns the response directly in result, not result.response
    const response = result;

    // Access the response text using response.text as suggested by the example
    const jsonResponseText = response.text; // Use response.text directly

    // Validate if response text exists
    if (!jsonResponseText) {
         logger.warn('Gemini API response text is empty. Returning empty array.', { response });
         return [];
    }

    logger.info(`Gemini Raw Response Text: ${jsonResponseText}`);

    let timeRanges = [];
    try {
        // Directly parse the response text, assuming it's valid JSON as per the sample
        if (!jsonResponseText || jsonResponseText.trim() === '') {
            logger.info('JSON response text is empty, returning empty array.');
            return [];
        }
        const parsedResponse = JSON.parse(jsonResponseText);

        if (!Array.isArray(parsedResponse)) {
            logger.error('Parsed structured response is not an array.', { parsed: parsedResponse });
            return [];
        }

        // Validate each range format
        const validTimeRanges = [];
        const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
        for (const range of parsedResponse) {
            if (range && typeof range.start === 'string' && typeof range.end === 'string' &&
                timeRegex.test(range.start) && timeRegex.test(range.end)) {
                // Optional: Add start < end validation if needed
                validTimeRanges.push({ start: range.start, end: range.end });
            } else {
                logger.warn(`Invalid time range format found in structured response, skipping: ${JSON.stringify(range)}`);
            }
        }
        timeRanges = validTimeRanges;
        logger.info(`Successfully extracted and validated time ranges: ${JSON.stringify(timeRanges)}`);

    } catch (parseError) {
        // Log error if direct parsing fails
        logger.error(`Failed to parse JSON response from Gemini: ${parseError.message}`, { rawResponse: jsonResponseText });
        return []; // Return empty array on parse failure
    }

    return timeRanges;

  } catch (error) {
    // Handle API call errors
    logger.error(`時間範囲抽出中にエラーが発生しました (structured): ${error.message}`, {
      errorMessage: error.message,
      errorStack: error.stack,
      errorCause: error.cause,
    });
    if (error.errorDetails) {
      logger.error('Gemini API Error Details:', error.errorDetails);
    }
    return []; // Return empty array on API error
  }
}

module.exports = {
  extractTimeRangesFromText,
};
