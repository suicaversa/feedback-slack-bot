# システムパターン

*このドキュメントは、システムアーキテクチャ、主要な技術的決定、使用されているデザインパターン、およびコンポーネント間の関係を概説します。*

## システムアーキテクチャ

*   **概要:** SlackからのイベントをCloud Functions (Gen 2)で受け取り、Cloud Run Jobを起動してファイルを処理（フレーム抽出など）、Vertex AI Geminiで分析し、結果をSlackに返すシステム。音声認識もGeminiで行う。
*   **図:**
    ```mermaid
    graph TD
        A[User] -- 1. Upload File & Mention --> B(Slack);
        B -- 2. Event Notification (app_mention) --> C{Cloud Function (Gen2)};
        C -- 3. Verify Signature & Send Ack (OK) --> B;
        C -- 4. Trigger Job (via Admin API) --> F{Cloud Run Job};
        F -- 5. Get File Info & Download URL --> B;
        B -- 6. Provide File Info & URL --> F;
        F -- 7. Download File to Local Disk --> B;
        B -- 8. Provide File Content --> F;
        subgraph "Local Processing within Job"
            F -- 9. Extract Frames (Video) --> H[ffmpeg];
            H -- 10. Provide Frames --> F;
            F -- 11. Request AI Processing (Audio/Video Frames) --> I[Vertex AI Gemini];
            I -- 12. Provide Result (incl. Transcription) --> F;
        end
        F -- 13. Post Result Message --> B;
        B -- 14. Display Result --> A;
        F -- 15. Delete Local Temp File --> F;


        subgraph "Immediate Response (Cloud Function Gen2)"
            C
        end
        subgraph "Async Processing (Cloud Run Job)"
            F
        end
    ```
*   **主要コンポーネント:**
    *   **Slack App:** ユーザーインターフェース、イベント送信元、結果表示。
    *   **Cloud Functions (Gen 2) (Node.js/Express):** Slackからのイベント受信、署名検証、Cloud Run Jobの起動。
    *   **Cloud Run Job (Node.js):** 時間のかかる処理を実行。ファイルダウンロード、`ffmpeg`による再エンコード処理（正確な切り抜き）、Vertex AI Geminiへのリクエスト、Slackへの結果投稿、ローカル一時ファイル削除。
    *   **ffmpeg:** 動画ファイルからの音声/フレーム抽出（Cloud Run Jobコンテナ内で実行）。
    *   **Vertex AI Gemini:** 音声/動画フレームに基づいたAI処理（要約、文字起こしなど）。

## 主要な技術的決定

*   **実行環境:** トリガーはCloud Functions (Gen 2)、非同期処理はCloud Run Jobを選択。
*   **AIモデル / 音声認識:** Google Vertex AI Gemini を利用。
*   **フレームワーク:** Node.js/Express (Cloud Functions側)、Node.js (Cloud Run Job側)。
*   **Slack連携:** Slack Events API (`app_mention`) と Web APIを使用。`axios` を直接利用。
*   **動画処理:** `ffmpeg` をコンテナに含めて利用。
*   **Job起動:** Cloud FunctionsからCloud Run Admin API経由でCloud Run Jobを起動。
*   **ファイル管理:** Cloud Run Jobのローカルファイルシステム (`/tmp`など) を一時領域として使用。

## デザインパターン

*   **非同期処理:** Slackの3秒タイムアウトルールに対応するため、Cloud FunctionsはJobを起動してすぐに`200 OK`を返す。重い処理はCloud Run Jobで実行。
*   **サービス分割:** 処理ロジックが `services/` ディレクトリ内の各サービス（AI, File, Slack）に分割されている。
*   **ストラテジーパターン:** AI処理ロジックが `services/ai-strategies/` に分離されており、コマンドに応じて異なる戦略（プロンプト）を適用可能 (例: `default`, `matsuura`, `waltz` など今後も拡張予定)。
*   **設定管理:** `config/config.js` で設定値を一元管理。
*   **ロギング:** `utils/logger.js` でカスタムロガーを提供。

## コンポーネントの関係

*   **データフロー:** 上記アーキテクチャ図を参照。Slack -> Cloud Functions -> Cloud Run Job -> Vertex AI Gemini -> Cloud Run Job -> Slack という流れ。
*   **依存関係:**
    *   Cloud FunctionsはSlack API, Cloud Run Admin APIに依存。
    *   Cloud Run JobはSlack API, Vertex AI API, コンテナ内の`ffmpeg`に依存。
    *   ユーザーはSlack Appに依存。

## クリティカルな実装パス

*   **イベントハンドリング:** Cloud Functionsでの `app_mention` イベントの受信、署名検証、Cloud Run Jobの起動。
*   **ファイル処理:** Cloud Run Jobでのファイル情報の取得、ローカルへのダウンロード、処理後の削除。
*   **動画フレーム抽出:** Cloud Run Jobでの `ffmpeg` 実行。
*   **AI処理実行:** Cloud Run Jobでの `services/ai-service.js` と `services/ai-strategies/` による Vertex AI Gemini API 呼び出し（ストラテジーパターンでAI戦略を切り替え）。
*   **結果投稿:** Cloud Run Jobでの `services/slack-service.js` によるSlack Web API呼び出し。
*   **Job起動失敗時のハンドリング:** Cloud Functions側でJob起動失敗時のエラー通知・リトライ戦略を実装予定。
