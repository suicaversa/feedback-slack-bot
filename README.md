# Slack Bot × Google AI Studio Integration (Cloud Run 版)

## 概要

このリポジトリは、Slackに投稿された音声ファイルや動画ファイルの内容を、Google CloudのAIサービス（Vertex AI Gemini, Speech-to-Text）を利用して処理し、結果をSlackのスレッドに返信するBotのソースコードです。

ユーザーがSlackチャンネルに音声または動画ファイルをアップロードし、そのファイルが含まれるスレッドでBotにメンション（例: `@bot 要約して`）を送ると、Botがファイルを処理し、要約や文字起こしなどの結果を同じスレッドに投稿します。

このアプリケーションは、Google Cloud Run上での動作を想定して構築されています。

## アーキテクチャ

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

**主要コンポーネント:**

*   **Slack App**:
    *   ユーザーからのファイルアップロードとメンションを受け付けます。
    *   `app_mention` イベントをCloud Runに送信します。
    *   ファイルのダウンロードURLを提供し、処理結果を表示します。
*   **Cloud Run Application (Node.js/Express)**:
    *   SlackからのWebhookリクエスト（イベント通知）を受け取ります。
    *   Slack署名を検証してリクエストの正当性を確認します。
    *   Slack APIを利用してファイル情報を取得し、ファイルをダウンロードします。
    *   必要に応じてファイルをGoogle Cloud Storage (GCS) にアップロードします。
    *   Google Cloud Speech-to-Text APIを利用して音声ファイルの文字起こしを行います。
    *   `ffmpeg` を利用して動画ファイルから音声やフレーム画像を抽出します。
    *   Vertex AI Gemini API (Pro / Pro Vision) を利用して、文字起こし結果や画像に基づき、ユーザーのコマンド（要約、議事録作成など）に応じた処理を実行します。
    *   処理結果をSlack APIを利用して元のスレッドに投稿します。
    *   一時ファイル（ローカル、GCS）をクリーンアップします。
*   **Google Cloud Services**:
    *   **Vertex AI (Gemini Pro / Pro Vision)**: テキスト生成、要約、動画内容の理解などのAI処理を担当します。
    *   **Speech-to-Text**: 音声ファイルの文字起こしを担当します。
    *   **Cloud Storage**: 音声ファイルなどを一時的に保存するために使用されます（Speech-to-Text APIの要件など）。
*   **ffmpeg**: 動画ファイルから音声やフレーム画像を抽出するために、Cloud Runコンテナ内にインストールされている必要があります。

## 機能

*   Slackの `app_mention` イベントをトリガーとして動作します。
*   メンションが送られたスレッド内の最新の音声ファイルまたは動画ファイルを処理対象とします。
*   メンション内のテキストからコマンド（例: `要約して`, `議事録作成`, `分析して`）を解析し、それに応じたAI処理を実行します。
    *   デフォルトのコマンドは「要約」です。
*   処理の開始、完了、エラー発生をユーザーに通知します。
*   処理結果を元のSlackスレッドにメッセージとして投稿します。
*   対応ファイル形式:
    *   音声: `mp3`, `m4a`, `wav`, `ogg`, `flac`
    *   動画: `mp4`, `mov`, `avi`, `webm`, `mkv`

## 使用技術

*   **言語**: Node.js
*   **フレームワーク**: Express.js
*   **実行環境**: Google Cloud Run (Dockerコンテナ)
*   **AI**:
    *   Google Vertex AI Gemini Pro
    *   Google Vertex AI Gemini Pro Vision
    *   Google Cloud Speech-to-Text
*   **ストレージ**: Google Cloud Storage (一時利用)
*   **API**:
    *   Slack Events API
    *   Slack Web API
*   **ライブラリ**:
    *   `@google-cloud/vertexai`
    *   `@google-cloud/speech`
    *   `@google-cloud/storage`
    *   `@slack/bolt` または `axios` (Slack API通信用 - ※現状はaxiosが使われているようです)
    *   `express`
    *   `body-parser`
    *   `dotenv`
    *   `axios` (ファイルダウンロード用)
    *   `uuid`
    *   `winston` (ロギング用 - ※現状は`logger.js`でカスタム実装されているようです)
*   **その他**:
    *   `ffmpeg` (動画処理に必要)
    *   Docker

## セットアップと実行

### 1. 前提条件

*   Node.js (開発環境)
*   Google Cloud SDK (gcloud CLI)
*   Docker
*   `ffmpeg` (Cloud Runコンテナに含める必要あり)
*   Slack Appの作成と設定
*   Google Cloudプロジェクトと必要なAPIの有効化 (Vertex AI, Speech-to-Text, Cloud Storage)
*   サービスアカウントの作成とキーの取得 (Cloud RunからGCP APIへのアクセス用)

### 2. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下の環境変数を設定します。(`env-example.txt` を参考にしてください)

```
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# Google Cloud
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=your-gcp-region # 例: us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json # ローカル実行時 or Dockerビルド時に含める場合
GCS_BUCKET_NAME=your-gcs-bucket-name # 一時ファイル用

# アプリケーション設定
PORT=8080
LOG_LEVEL=info
```

**注意:** `GOOGLE_APPLICATION_CREDENTIALS` は、Cloud Run環境では通常、実行サービスアカウントにロールを付与することで自動的に認証されます。ローカルでのテストや、キーファイルをコンテナに含める場合にのみ設定が必要です。

### 3. 依存関係のインストール

```bash
npm install
```

### 4. ローカルでの実行 (テスト用)

```bash
npm start
```
別途、ngrokなどのツールを使用して、ローカルサーバーを外部公開し、Slack AppのRequest URLに設定する必要があります。

### 5. Dockerイメージのビルド

`dockerfile.txt` を `Dockerfile` にリネームし、内容を確認・調整してください（特に `ffmpeg` のインストール部分）。

```bash
docker build -t your-image-name .
```

### 6. Cloud Runへのデプロイ

Google Artifact Registryなどにイメージをプッシュし、Cloud Runサービスを作成または更新します。

```bash
# Artifact Registryにプッシュ (例)
docker tag your-image-name gcr.io/${GCP_PROJECT_ID}/your-image-name:latest
docker push gcr.io/${GCP_PROJECT_ID}/your-image-name:latest

# Cloud Runにデプロイ
gcloud run deploy your-service-name \
  --image gcr.io/${GCP_PROJECT_ID}/your-image-name:latest \
  --platform managed \
  --region ${GCP_LOCATION} \
  --allow-unauthenticated \ # SlackからのWebhookを受け付けるため
  --set-env-vars SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN},SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET},GCP_PROJECT_ID=${GCP_PROJECT_ID},GCP_LOCATION=${GCP_LOCATION},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},LOG_LEVEL=info \
  --service-account your-service-account-email@your-gcp-project-id.iam.gserviceaccount.com # 必要な権限を持つサービスアカウント
```
**注意:** 環境変数はCloud Runのシークレットマネージャーを利用することを推奨します。

デプロイ後、Cloud RunサービスのエンドポイントURLをSlack Appのイベントサブスクリプション設定（Request URL）に登録します。

## 設定

いくつかの設定は `config/config.js` で管理されています。

*   `GCP_PROJECT_ID`, `GCP_LOCATION`: Google Cloudの設定。
*   `GCS_BUCKET_NAME`: 一時ファイル保存用のGCSバケット名。
*   Geminiモデルの設定 (`generation_config`) など。

## コマンド例

Slackのスレッド内で、Botに対して以下のようにメンションします。

*   `@<bot名> 要約して`
*   `@<bot名> この会議の内容で議事録を作成して`
*   `@<bot名> 分析`
*   `@<bot名>` (デフォルトで要約を実行)

## 注意点

*   **ffmpeg**: 動画ファイルを処理する場合、実行環境（Cloud Runコンテナ）に `ffmpeg` がインストールされている必要があります。Dockerfileに必要なインストール手順を含めてください。
*   **Google Cloud認証**: Cloud RunからGoogle Cloud API（Vertex AI, Speech-to-Text, GCS）を呼び出すための認証設定が必要です。推奨される方法は、Cloud Runサービスに適切なIAMロール（Vertex AIユーザー、Speech-to-Textユーザー、Storageオブジェクト作成者/閲覧者/削除者など）を持つサービスアカウントを割り当てることです。
*   **Slack App設定**:
    *   **イベントサブスクリプション**: `app_mention` イベントを購読する必要があります。
    *   **権限スコープ**: Bot Token Scopesに `app_mentions:read`, `chat:write`, `files:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history` などが必要です。
*   **タイムアウト**: Slackはイベント通知に対して3秒以内に応答することを期待します。そのため、アプリケーションはまず `200 OK` を返し、実際の処理は非同期で行う必要があります（実装済み）。
*   **コスト**: Google Cloudの各サービス（Vertex AI, Speech-to-Text, Cloud Storage, Cloud Run）には利用料金が発生します。料金体系を確認してください。
*   **エラーハンドリング**: エラーが発生した場合、基本的なエラーメッセージがSlackに投稿されますが、詳細はCloud Loggingなどで確認する必要があります。
