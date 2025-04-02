const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("node:fs");
const mime = require("mime-types");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

/**
 * Uploads the given file to Gemini.
 *
 * See https://ai.google.dev/gemini-api/docs/prompting_with_media
 */
async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}

/**
 * Waits for the given files to be active.
 *
 * Some files uploaded to the Gemini API need to be processed before they can
 * be used as prompt inputs. The status can be seen by querying the file's
 * "state" field.
 *
 * This implementation uses a simple blocking polling loop. Production code
 * should probably employ a more sophisticated approach.
 */
async function waitForFilesActive(files) {
  console.log("Waiting for file processing...");
  for (const name of files.map((file) => file.name)) {
    let file = await fileManager.getFile(name);
    while (file.state === "PROCESSING") {
      process.stdout.write(".")
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      file = await fileManager.getFile(name)
    }
    if (file.state !== "ACTIVE") {
      throw Error(`File ${file.name} failed to process`);
    }
  }
  console.log("...all files ready\n");
}

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro-exp-03-25",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  responseModalities: [
  ],
  responseMimeType: "text/plain",
};

async function run() {
  // TODO Make these files available on the local file system
  // You may need to update the file paths
  const files = [
    await uploadToGemini("assets/how_to_evaluate.pdf", "application/pdf"),
    await uploadToGemini("assets/how_to_sales.pdf", "application/pdf"),
    await uploadToGemini("assets/sample.mp3", "audio/mpeg"),
  ];

  // Some files have a processing delay. Wait for them to be ready.
  await waitForFilesActive(files);

  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              mimeType: files[0].mimeType,
              fileUri: files[0].uri,
            },
          },
          {
            fileData: {
              mimeType: files[1].mimeType,
              fileUri: files[1].uri,
            },
          },
          {
            fileData: {
              mimeType: files[2].mimeType,
              fileUri: files[2].uri,
            },
          },
        ],
      },
    ],
  });

  const result = await chatSession.sendMessage("あなたは営業トレーナーAIです。\n以下の商談情報と会話スクリプト（または録音文字起こし）をもとに、商談の進行フェーズを特定し、評価基準テンプレートに基づいてスコアリングと改善提案を行ってください。\nあわせて以下の処理を行ってください：\n会話内のノイズ（冗長なあいづち・雑談）を除去し、フィードバックに不要な情報を削ぎ落としてください。\nフィードバックの判断材料として特に重要な発言を\"2〜3個\"を抜粋してください。\n⚠️ 評価対象フェーズについて（音声データに基づく実行可能性で制限）\n以下のフェーズのみ、録音音声から評価・スコアリングを行ってください。\n※それ以外のフェーズ（例：リサーチ・資料準備・契約処理など）は音声に現れにくいため、評価対象外とします。\n🎧 評価対象フェーズ一覧（録音ベース）\n・初回接触・関係構築\n・ニーズヒアリング\n・提案・プレゼンテーション\n・交渉・クロージング\n・アフターフォロー（継続商談に限る）\n\n\n【出力フォーマット】\n🚦 フェーズ特定\nフェーズ名：{例：ニーズヒアリング}\n判断理由：{どのような会話や流れから該当フェーズだと判断したかを簡潔に記述}\n📊 スコアリングと改善提案\n※該当フェーズの評価項目の中から、重要と思われる3項目を選定し、以下の形式で記述してください。\n※各スコアには、その評価を裏付ける発言を必ず1〜2文、該当の評価項目ごとに抜粋してください。\n抜粋する会話は「そのスコアで評価した理由が明確に伝わる」発言に限定してください。\n※評価内容と引用が一致しない場合、出力しないでください。\n※十分な根拠が会話内に存在しないと判断した場合は、その評価項目のスコア記載は「保留」としてください。無理にスコア付けせず、改善提案のみ記載しても構いません。\n※抜粋する発言は「その発言だけを読んでも、なぜそのスコアなのかが理解できるような内容」である必要があります。\n{評価項目名1}\n⭐⭐⭐☆☆（スコア：3）\n評価：{評価の根拠となる会話引用と観察コメント}\n改善：{より良くするための具体的アドバイス}\n{評価項目名2}\n⭐⭐⭐⭐☆（スコア：4）\n評価：{...}\n改善：{...}\n{評価項目名3}\n⭐⭐☆☆☆（スコア：2）\n評価：{...}\n改善：{...}\n💡 次回へのアドバイス（簡潔に2〜3行）\n例：「今回のヒアリングで掘り下げが甘かったので、次回は『なぜ？』を繰り返す質問を意識しましょう。」\n✅ 次回までのタスク（任意・1〜2件）\n例：「競合サービスの評価ポイントを事前に収集し、比較資料に追加する」\n例：「次回は決裁者同席を打診するメールを送る」");
  // TODO: Following code needs to be updated for client-side apps.
  const candidates = result.response.candidates;
  for(let candidate_index = 0; candidate_index < candidates.length; candidate_index++) {
    for(let part_index = 0; part_index < candidates[candidate_index].content.parts.length; part_index++) {
      const part = candidates[candidate_index].content.parts[part_index];
      if(part.inlineData) {
        try {
          const filename = `output_${candidate_index}_${part_index}.${mime.extension(part.inlineData.mimeType)}`;
          fs.writeFileSync(filename, Buffer.from(part.inlineData.data, 'base64'));
          console.log(`Output written to: ${filename}`);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }
  console.log(result.response.text());
}

run();
