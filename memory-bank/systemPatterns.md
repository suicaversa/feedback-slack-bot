# システムパターン

*このドキュメントは、システムアーキテクチャ、主要な技術的決定、使用されているデザインパターン、およびコンポーネント間の関係を概説します。*

## システムアーキテクチャ

*   **概要:** Slackからのイベントを受け取り、ファイルを処理（文字起こし、フレーム抽出）、Google AIサービス（Vertex AI, Speech-to-Text）で分析し、結果をSlackに返すCloud Runアプリケーション。
*   **図:**
    ```mermaid
    graph TD
        A[User] -- 1. Upload File & Mention --> B(Slack);
        B -- 2. Event Notification (app_mention) --> C{Cloud Run App};
        C -- 3. Verify Signature --> C;
        C -- 4. Get File Info & Download URL --> B;
        B -- 5. Provide File Info & URL --> C;
        C -- 6. Download File --> B;
        B -- 7. Provide File Content --> C;
        C -- 8. Upload to GCS (if audio/video) --> D[Google Cloud Storage];
        D -- 9. Provide GCS URI --> C;
        C -- 10. Request Transcription (Audio) --> E[Google Speech-to-Text];
        E -- 11. Provide Transcription --> C;
        C -- 12. Extract Frames (Video) --> F[ffmpeg];
        F -- 13. Provide Frames --> C;
        C -- 14. Request AI Processing (Text/Frames + Prompt) --> G[Vertex AI Gemini Pro / Vision];
        G -- 15. Provide Result --> C;
        C -- 16. Post Result Message --> B;
        B -- 17. Display Result --> A;
        C -- 18. Delete Temp Files (Local/GCS) --> D;
    ```
*   **主要コンポーネント:**
    *   **Slack App:** ユーザーインターフェース、イベント送信元、結果表示。
    *   **Cloud Run Application (Node.js/Express):** メイン処理ロジック。イベント受信、署名検証、ファイル取得、外部API連携（Slack, GCS, Speech-to-Text, Vertex AI）、結果投稿、ファイルクリーンアップ。
    *   **Google Cloud Storage (GCS):** 一時的なファイル保管場所（特にSpeech-to-Text連携用）。
    *   **Google Speech-to-Text:** 音声ファイルの文字起こし。
    *   **ffmpeg:** 動画ファイルからの音声/フレーム抽出（Cloud Runコンテナ内で実行）。
    *   **Vertex AI (Gemini Pro / Pro Vision):** テキスト/画像に基づいたAI処理（要約、議事録作成など）。

## 主要な技術的決定

*   **実行環境:** Google Cloud Runを選択（スケーラビリティ、コンテナベース、従量課金）。
*   **AIモデル:** Google Vertex AI Gemini (Pro/Vision) を利用（マルチモーダル対応、高性能）。
*   **音声認識:** Google Cloud Speech-to-Textを利用（高精度、多言語対応）。
*   **フレームワーク:** Node.js/Expressを使用（非同期処理に適している、一般的なWebフレームワーク）。
*   **Slack連携:** Slack Events API (`app_mention`) と Web APIを使用（標準的な連携方法）。`axios` を直接利用してAPI通信を行っている模様（`@slack/bolt` ではない）。
*   **動画処理:** `ffmpeg` をコンテナに含めて利用（標準的な動画処理ツール）。

## デザインパターン

*   **非同期処理:** Slackの3秒タイムアウトルールに対応するため、Webhookリクエスト受信後すぐに`200 OK`を返し、実際の重い処理（ファイルダウンロード、API呼び出し）は非同期で実行する。
*   **サービス分割:** 処理ロジックが `services/` ディレクトリ内の各サービス（AI, File, Slack, Storage）に分割されている（関心の分離）。
*   **ストラテジーパターン:** AI処理ロジックが `services/ai-strategies/` に分離されており、コマンドに応じて異なる戦略（プロンプト）を適用可能（例: `default-feedback-strategy.js`, `matsuura-feedback-strategy.js`）。
*   **設定管理:** `config/config.js` で設定値を一元管理。
*   **ロギング:** `utils/logger.js` でカスタムロガーを提供。

## コンポーネントの関係

*   **データフロー:** 上記アーキテクチャ図を参照。ユーザーのメンションから始まり、Slack -> Cloud Run -> 各GCPサービス -> Cloud Run -> Slack という流れ。
*   **依存関係:**
    *   Cloud Run AppはSlack API, GCS API, Speech-to-Text API, Vertex AI APIに依存。
    *   Cloud Run Appはコンテナ内の`ffmpeg`に依存（動画処理時）。
    *   ユーザーはSlack Appに依存。

## クリティカルな実装パス

*   **イベントハンドリング:** `controllers/slack-controller.js` での `app_mention` イベントの受信、署名検証、非同期処理の開始。
*   **ファイル処理:** `services/file-service.js` でのファイル情報の取得、ダウンロード、GCSへのアップロード/削除。
*   **音声文字起こし:** `services/ai-service.js` (または関連モジュール) での Speech-to-Text API 呼び出し。
*   **動画フレーム抽出:** `services/file-service.js` (または関連モジュール) での `ffmpeg` 実行。
*   **AI処理実行:** `services/ai-service.js` と `services/ai-strategies/` での適切なプロンプト選択と Vertex AI API 呼び出し。
*   **結果投稿:** `services/slack-service.js` での Slack Web API 呼び出しによるメッセージ投稿。
