# 進捗状況

*このドキュメントは、何が機能しているか、何がまだ構築されていないか、現在のステータス、既知の問題、およびプロジェクトの決定の進化を追跡します。*

## 機能しているもの

*   **現状 (Cloud Functions Gen 2):**
    *   Slackからの`app_mention`イベント受信と署名検証 (ただし署名検証は現在無効化されている可能性あり)。
    *   基本的なファイル情報取得とローカルへのダウンロード。
    *   Vertex AI Gemini API連携 (音声認識含む)。
    *   `ffmpeg`による動画処理。
    *   Slackへの結果投稿。
    *   **Waltzフィードバックモード:** コマンド (`ワルツ`, `アポアポ`) による呼び出しと、専用プロンプト (`prompts/waltz_prompt.txt`) を使用したAI処理 (ローカルテスト済み)。
    *   **一時返信機能:** Slackメンション時に一時的な返信メッセージを投稿する機能を追加 (`controllers/slack-controller.js`)。
    *   **ffmpeg切り抜き修正:** `-c copy` を削除し再エンコードを行うことで、キーフレームに依存せず正確な時間での切り抜きを実現。ただし処理時間は増加。
*   **注記:** 詳細な動作確認、特にエラーハンドリングや大規模ファイルでの挙動、再エンコードによる処理時間の影響は未確認。

## 残っている作業

*   **アーキテクチャ変更 (Function + Job):**
    *   Cloud Run Job 用のコードベース作成 (ファイル処理、AI処理、Slack投稿ロジック含む)。
    *   Cloud Run Job 用の Dockerfile 作成。
    *   Cloud Functions (Gen 2) のコード修正 (Cloud Run Admin API で Job を起動、重い処理を削除)。
    *   Cloud Run Job 用のサービスアカウント作成と権限設定。
    *   Cloud Functions のサービスアカウントに Job 起動権限を付与。
    *   Cloud Functions と Cloud Run Job のデプロイ。
    *   関連ドキュメント (Memory Bank, README等) の更新。
*   **既存の TODO:**
    *   **Slack署名検証の有効化:** `index.js` でコメントアウトされている署名検証を有効化する。
*   **その他:**
    *   Cloud Run Job のエラーハンドリングとリトライ戦略の実装。
    *   Cloud Run Job のローカルストレージ管理 (一時ファイル削除の確実化)。
    *   テストコードの実装 (Function, Job 双方)。
    *   コスト監視と最適化 (特に Job の実行時間)。

## 現在のステータス

*   **メモリバンク:** プロジェクトの現状 (Gemini使用、GCS/STT不使用、Functionトリガー) と計画 (Function+Jobアーキテクチャ) を反映済み。
*   **プロジェクト:** 現在は Cloud Functions (Gen 2) で同期的に処理を実行中。Cloud Run Job を導入して非同期処理に移行する計画段階。
*   **マイルストーン/期限:** 不明。

## 既知の問題

*   **TODOリストより:**
    *   **Slack署名検証が無効化されている:** `index.js` で検証ミドルウェアがコメントアウトされている。
*   **潜在的な問題 (新アーキテクチャ):**
    *   Cloud Run Job の起動失敗時のハンドリング。
    *   Cloud Run Job の実行時エラーのハンドリングと通知。
    *   Cloud Run Job のローカルディスク容量制限。
*   **その他:**
    *   `ffmpeg`のインストールと動作確認 (Jobコンテナ環境)。
    *   GCP認証設定 (Function, Job双方)。
    *   Slack App設定（イベント、スコープ）の確認。
    *   GCPコスト (Function, Job, Vertex AI)。

## プロジェクト決定の進化

*   **初期:** Cloud Functions (Gen 2) で同期処理。Vertex AI Gemini, ffmpeg を利用。
*   **変更点:**
    *   GCS, Speech-to-Text は使用しないことを確認。
    *   音声認識も Vertex AI Gemini で行うことを確認。
    *   時間のかかる処理 (ファイル処理、AI処理、Slack投稿) を Cloud Run Job に分離し、Cloud Functions から Cloud Run Admin API で非同期に起動するアーキテクチャに変更することを決定。
*   **Slack連携ライブラリ:** `axios`を直接利用。
*   **ロギング:** カスタムロガー (`utils/logger.js`) を利用。
*   **AI戦略:** `services/ai-strategies/` で管理 (デフォルト、松浦さんAI、Waltzフィードバック)。
