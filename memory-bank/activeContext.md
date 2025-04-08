# アクティブコンテキスト

*このドキュメントは、現在の作業フォーカス、最近の変更、次のステップ、および進行中の決定を追跡します。*

## 現在のフォーカス

*   **アーキテクチャ変更の実装:** Cloud Functions (Gen 2) から Cloud Run Job を非同期に起動する構成に変更する。
*   Memory Bank の更新 (完了)。

## 最近の変更

*   Memory Bank の全ファイルを更新し、現在の技術スタック (Gemini使用, GCS/STT不使用) と新しいアーキテクチャ計画 (Function + Job) を反映させた。

## 次のステップ

*   **Cloud Functions (Gen 2) コード修正:**
    *   `@google-cloud/run` 依存関係を追加。
    *   `index.js` (またはエントリーポイント) を修正し、Cloud Run Admin API で Job を起動するように変更。重い処理ロジックを削除。
*   **Cloud Run Job コード作成:**
    *   `job/` ディレクトリと関連ファイルを作成。
    *   `package.json` を設定。
    *   環境変数からパラメータを受け取り、ファイルダウンロード、ffmpeg処理、Gemini API呼び出し、Slack投稿、一時ファイル削除を行うロジックを実装。
    *   `Dockerfile` を作成。
*   **インフラ設定:** (ユーザーによる実施が必要)
    *   Job 用サービスアカウント作成と権限設定。
    *   Function のサービスアカウントへの Job 起動権限付与。
*   **デプロイ:** Function と Job をデプロイ。
*   **既存 TODO:** Slack 署名検証の有効化。

## アクティブな決定と考慮事項

*   **アーキテクチャ:** Cloud Functions (Gen 2) + Cloud Run Job を採用。
*   **Job 起動方法:** Cloud Run Admin API を使用。
*   **AI:** Vertex AI Gemini を使用 (音声認識含む)。
*   **ストレージ:** Cloud Run Job のローカルファイルシステムを使用。GCS/STT は不使用。
*   **エラーハンドリング:** Job の起動失敗、実行時エラーのハンドリングを実装する必要がある。

## 重要なパターンと設定

*   **非同期処理:** Function は Job を起動して即時応答。Job で重い処理を実行。
*   **サービス分割:** 既存の `services/` を Job 側で再利用/参照する。
*   **ストラテジーパターン:** `services/ai-strategies/` を Job 側で利用。
*   **設定管理:** `config/config.js` と `.env` ファイル。
*   **インフラ:** Google Cloud Functions (Gen 2), Cloud Run Job, Vertex AI。
*   **動画処理:** `ffmpeg` (Job コンテナ内)。

## 学びとプロジェクトの洞察

*   ユーザーとの対話を通じて、プロジェクトの現状 (使用技術、デプロイ先) を正確に把握することが重要。
*   Memory Bank は、変更点を追跡し、一貫したコンテキストを維持するために役立つ。
*   Cloud Functions と Cloud Run Job の組み合わせは、Slack Bot のようなイベント駆動型アプリケーションで非同期処理を実現する一般的なパターンの一つ。
