# プロダクトコンテキスト

*このドキュメントは、プロジェクトが存在する理由、解決する問題、および期待される動作を定義します。*

## プロジェクトの目的

*   **存在理由:** Slackでの音声/動画ファイルの共有は頻繁に行われるが、その内容を確認するには再生が必要で時間がかかる。AIを活用して内容の要約や文字起こしを自動化し、情報共有とアクセシビリティを向上させる。
*   **解決する問題:**
    *   音声/動画コンテンツの内容把握にかかる時間と手間の削減。
    *   会議の議事録作成などの定型作業の自動化。
    *   営業時の商談スキル向上のためのフィードバック自動化

## ユーザーエクスペリエンスの目標

*   **理想:** ユーザーはSlackにファイルをアップロードし、Botに簡単なコマンドでメンションするだけで、迅速かつ正確に必要な情報（要約、文字起こし等）をスレッド内で受け取れる。
*   **対話:**
    1.  ユーザーがSlackチャンネルに音声/動画ファイルをアップロードする。
    2.  そのファイルが含まれるスレッドで、ユーザーがBotにメンション（例: `@bot 要約して`）を送る。
    3.  Botがメンションを受け付けた旨の一時的なメッセージをスレッドに投稿する。
    4.  Botがバックグラウンドで処理を開始する（非同期処理）。
    5.  Botが処理結果（要約、文字起こし等）を同じスレッドに投稿する。

## 主要な機能

*   **ファイル処理トリガー:** Slackの`app_mention`イベント。
*   **対象ファイル特定:** メンションされたスレッド内の最新の音声/動画ファイル。
*   **コマンド解析:** メンション内のテキストから指示（要約、議事録作成、分析、松浦さんAIフィードバック、Waltzフィードバックなど）を抽出。デフォルトは「フィードバック」。キーワード（`松浦さん`, `ワルツ`, `アポアポ` など）で特定のフィードバックモードを指定可能。
    *   **AI戦略拡張:** `waltz_feedback`（ワルツ/アポアポ）など、今後もコマンド体系・AI戦略を拡張予定。
*   **音声処理:** （**注: 現在は Google Cloud Speech-to-Text は不使用**）
*   **動画処理:** `ffmpeg`による音声抽出とフレーム画像抽出。
*   **AI処理:** （**注: 現在は Vertex AI Gemini は不使用**）コマンドに応じたテキスト生成（要約、議事録、各種フィードバックなど）。
*   **結果通知:** 処理結果を元のSlackスレッドに投稿。
*   **ステータス通知:** 処理開始、完了、エラーをユーザーに通知。
*   **対応形式:**
    *   音声: `mp3`, `m4a`, `wav`, `ogg`, `flac`
    *   動画: `mp4`, `mov`, `avi`, `webm`, `mkv`
