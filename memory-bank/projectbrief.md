# プロジェクト概要

*このドキュメントはプロジェクトの基盤であり、他のすべてのメモリバンクファイルを形成します。*

## コア要件と目標

*   **目的:** Slackに投稿された音声/動画ファイルの内容をGoogle AIサービスで処理し、結果をSlackスレッドに返すBotを開発・運用する。
*   **成果物:** Google Cloud Run上で動作するSlack Botアプリケーション。
*   **成功基準:** ユーザーがSlackでファイルをアップロードし、Botにメンションすると、適切な処理（要約、文字起こしなど）の結果がスレッドに返信されること。

## スコープ

*   **範囲内:**
    *   Slackの`app_mention`イベントをトリガーとする。
    *   スレッド内の最新の音声/動画ファイルを処理対象とする。
    *   メンション内のコマンド（要約、議事録作成、分析など）に応じたAI処理（**注: 現在は Vertex AI / Speech-to-Text は不使用**）を実行する。
    *   処理結果を元のSlackスレッドに投稿する。
    *   対応ファイル形式: 音声 (`mp3`, `m4a`, `wav`, `ogg`, `flac`), 動画 (`mp4`, `mov`, `avi`, `webm`, `mkv`)。
    *   Google Cloud Functions (Gen 2) および Cloud Run Job 上で動作。
    *   一時ファイルの管理（ローカル）。
*   **範囲外:** (READMEからは明確でないため、初期設定)
    *   リアルタイム処理。
    *   Google Cloud Speech-to-Text の利用。
    *   Google Vertex AI の利用。
    *   Google Cloud Storage の利用。
    *   Slack以外のプラットフォーム連携。
    *   複雑な対話機能。

## 主要なステークホルダー

*   **ユーザー:** Slackでファイル共有とAI処理（要約、文字起こし等）を行いたい人。
*   **開発者/運用者:** Botの機能開発、デプロイ、メンテナンスを行う人。

## 現状のアーキテクチャ

現在、SlackイベントをGoogle Cloud Functions (Gen 2) で受信し、Cloud Run Jobを非同期で起動する構成へ移行中。Job側でファイル処理・AI処理・Slack投稿を実施する。
AIはVertex AI Geminiを利用し、GCS/Speech-to-Textは不使用。

## 今後の計画

- Cloud Run Job用コード・Dockerfileの作成
- Cloud FunctionsのJob起動ロジック修正
- Slack署名検証の有効化
- エラーハンドリング・コスト最適化
