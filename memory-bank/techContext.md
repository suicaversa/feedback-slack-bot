# 技術コンテキスト

*このドキュメントは、使用されている技術、開発セットアップ、技術的制約、依存関係、およびツールの使用パターンを詳述します。*

## 使用技術

*   **言語:** Node.js
*   **フレームワーク:** Express.js (Cloud Functions側)
*   **実行環境:** Google Cloud Functions (Gen 2), Google Cloud Run Job (Dockerコンテナ)
*   **AI:** Google Vertex AI Gemini (音声認識含む)
*   **ストレージ:** なし (ローカル一時ファイルのみ)
*   **API:**
    *   Slack Events API
    *   Slack Web API
    *   Google Cloud APIs (Vertex AI: Gemini, Cloud Run Admin API)
    *   @google-cloud/run（Cloud FunctionsからJob起動用）
*   **その他:**
    *   Docker（Job用Dockerfileでffmpegを含める）
    *   ffmpeg（再エンコードによる正確な切り抜き）

## 開発セットアップ

*   **前提:** Node.js, Google Cloud SDK (`gcloud`), Docker
*   **設定:** `.env` ファイルに環境変数 (Slack Tokens, GCP Project ID 等) を設定。 (`.env.example`参照)
*   **依存関係:** `npm install` でインストール。
*   **ローカル実行 (Function):** `npm start` (ngrok等での外部公開が必要)。
*   **ビルド (Docker):** `docker build -t <image_name> .` (Dockerfileが必要)。
*   **デプロイ:**
    *   Cloud Functions (Gen 2): `deploy.sh` スクリプトを使用 (環境変数のエクスポートが必要)。
    *   Cloud Run Job: Dockerイメージをビルドし、`gcloud run jobs deploy` コマンドでデプロイ。

## 技術的制約

*   **Slack APIタイムアウト:** イベント通知への応答は3秒以内。Cloud FunctionsからCloud Run Jobへの非同期起動が必須。
*   **GCP認証:** Cloud FunctionsおよびCloud Run JobからGCP API (Vertex AI, Cloud Run Admin) を呼び出すための適切なサービスアカウントとIAMロール設定が必要。
*   **コスト:** 各GCPサービス (Cloud Functions, Cloud Run Job, Vertex AI) の利用料金が発生。Jobの実行時間・リソース利用の最適化が重要。
*   **ローカルストレージ:** Cloud Run Jobのローカルディスク容量には制限があるため、巨大なファイルの扱いや同時処理数に注意が必要。

## 依存関係

*   **主要ライブラリ (想定):**
    *   `@google-cloud/vertexai` (Job側)
    *   `@google-cloud/run` (Function側)
    *   `express` (Function側)
    *   `body-parser` (Function側)
    *   `dotenv`
    *   `axios` (Slack API通信、ファイルダウンロード用)
    *   `uuid`
    *   `winston` (または `utils/logger.js` のカスタムロガー)
    *   `ffmpeg-static` などffmpegバイナリ
*   **管理:** `npm` (`package.json`, `