# TODOリスト

## Slack署名検証の有効化

-   **ファイル:** `index.js`
-   **現状:** Slack署名検証ミドルウェアの行がコメントアウトされています (`// app.use('/api/slack/events', slackVerifier.verifySlackRequest);`)。
-   **背景:** ローカル環境での `curl` や `ngrok` を使ったテストを容易にするため、一時的に無効化しました。Slackからのリクエストの正当性を検証する重要なセキュリティ機能です。
-   **対応:** 本番環境へのデプロイ前や、セキュリティが確保されたテスト環境では、必ずこの行のコメントアウトを解除し、署名検証を**有効化**してください。`.env` ファイルの `SLACK_SIGNING_SECRET` が正しく設定されていることも確認が必要です。

## AI処理の実装/復元 (対応済み)

-   **ファイル:** `services/ai-service.js`
-   **対応内容:**
    -   `@google/generative-ai` SDK を使用するように変更。
    -   `processMediaFile` 関数を修正し、Gemini API にファイル（ドキュメント2種 + Slackからの音声/動画）をアップロードし、指定されたプロンプトで処理を実行するように実装。
    -   ファイルアップロード処理 (`uploadToGemini`) と処理待機 (`waitForFilesActive`) のヘルパー関数を移植。
    -   アップロードしたファイルの後処理（削除）を追加。
-   **残課題/TODO:**
    -   `fileType` から `mimeType` への変換ロジックの精緻化 (現在は基本的な拡張子のみ対応)。
    -   エラーハンドリングの強化（ファイル処理失敗時の挙動など）。
    -   動画ファイルの処理 (現在は `isAudioFile` のみ考慮されているが、`isVideoFile` の分岐は未実装)。
    -   `config.js` で `GEMINI_API_KEY` を必須として読み込むように修正済み。`.env` ファイルに正しいキーが設定されていることを確認。
