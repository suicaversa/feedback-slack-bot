# Slack Bot 内部利用設定ガイド

このドキュメントは、Slack Botを貴社のSlackワークスペースで利用可能にするための設定手順を**Slack管理者向け**に説明します。

## 1. はじめに

このBotは、Slackに投稿された音声/動画ファイルを処理し、その結果（要約、文字起こしなど）をスレッドに返信します。このBotを利用するには、貴社のワークスペースに専用のSlack Appを作成・設定していただく必要があります。

## 2. 実施いただくことの概要

1.  **Slack Appの作成:** 提供されたマニフェストファイルを使ってSlack Appを作成します。
2.  **認証情報の共有:** 作成したAppの「Signing Secret」と「Bot User OAuth Token」を取得し、Bot開発担当者（エンジニア）に安全な方法で共有します。
3.  **Request URLの設定:** Bot開発担当者から提供される「Request URL」をSlack Appに設定します。
4.  **ワークスペースへのインストール:** 設定したAppをワークスペースにインストールします。

## 3. Slack Appの作成と認証情報の取得

以下の手順でSlack Appを作成し、必要な情報を取得してください。

1.  **Slack APIサイトへアクセス:** [https://api.slack.com/apps](https://api.slack.com/apps) を開き、右上の "Create New App" をクリックします。
2.  **"From an app manifest" を選択:** Appの作成方法としてマニフェストファイルを利用するオプションを選びます。
3.  **ワークスペースを選択:** Botをインストールしたいワークスペースを選び、"Next" をクリックします。
4.  **マニフェストを入力:** 以下のYAML形式のマニフェストをコピーし、"YAML" タブに貼り付けます。"Next" をクリックします。

    ```yaml
    display_information:
      name: 営業クローンBOT # 必要に応じて変更してください
      description: Analyzes audio/video files and provides feedback.
      background_color: "#2F4F4F"
    features:
      bot_user:
        display_name: 営業クローンBOT # 必要に応じて変更してください
        always_online: false
    oauth_config:
      scopes:
        bot:
          - app_mentions:read
          - channels:history # スレッドのメッセージ取得に必要
          - chat:write       # メッセージ投稿に必要
          - files:read       # ファイル読み取りに必要
          - reactions:write  # ステータス表示（任意）に必要
          - channels:join    # チャンネル参加に必要
    settings:
      event_subscriptions:
        request_url: https://asia-northeast1-opt-hanro-baieki-455601.cloudfunctions.net/slack-feedback-bot/api/slack/events # ★後ほどエンジニアから提供されるURLに置き換えます★
        bot_events:
          - app_mention
      interactivity:
        is_enabled: false
      org_deploy_enabled: false
      socket_mode_enabled: false
      token_rotation_enabled: false
    ```

5.  **内容を確認し作成:** 表示される設定内容を確認し、問題なければ "Create" をクリックしてAppを作成します。

6.  **認証情報の取得と共有:**
    *   App作成後、左側のメニューから "Settings" > "**Basic Information**" を選択します。
    *   "App Credentials" セクションにある "**Signing Secret**" を確認します ("Show" をクリックして表示)。
    *   左側のメニューから "Settings" > "**Install App**" を選択します。
    *   "Install to Workspace" ボタンをクリックし、表示される権限を確認して "Allow" をクリックします。（**注意:** この時点ではBotはまだ完全には機能しません）
    *   インストール後、"**Bot User OAuth Token**" が表示されます。これは `xoxb-` で始まるトークンです。
    *   上記で取得した **Signing Secret** と **Bot User OAuth Token** の両方を、**Bot開発担当者（エンジニア）に安全な方法で共有してください。** これらはBotアプリケーションの設定に必要です。

## 4. Request URLの設定 (エンジニアからの情報提供後)

Bot開発担当者がアプリケーションをデプロイし、設定を完了すると、**Request URL** (`https://asia-northeast1-opt-hanro-baieki-455601.cloudfunctions.net/slack-feedback-bot/api/slack/events`) が提供されます。以下の手順でSlack Appに設定してください。

1.  **Slack APIサイトへアクセス:** 再度 [https://api.slack.com/apps](https://api.slack.com/apps) で作成したAppの設定画面を開きます。
2.  **Event Subscriptionsを開く:** 左側のメニューから "Features" > "**Event Subscriptions**" を選択します。
3.  **Request URLを入力:** "Enable Events" が ON になっていることを確認し、"Request URL" の欄に、**Bot開発担当者から提供されたURL (`https://asia-northeast1-opt-hanro-baieki-455601.cloudfunctions.net/slack-feedback-bot/api/slack/events`)** を入力します。
4.  **検証を確認:** URLを入力すると、Slackが検証リクエストを送信します。Botアプリケーションが正しく起動していれば、"Verified" と緑色のチェックマークが表示されます。表示されない場合は、開発担当者に連絡してください。
5.  **変更を保存:** 画面右下の "Save Changes" をクリックします。

## 5. ワークスペースへの再インストール

Request URLを設定した後、Appをワークスペースに再インストールする必要があります。

1.  Slack APIサイトのApp設定画面で、左側のメニューから "Settings" > "**Install App**" を選択します。
2.  "**Reinstall to Workspace**" ボタンをクリックし、表示される権限を確認して "Allow" をクリックします。これでBotが利用可能な状態になります。

## 6. 動作確認

1.  **Botをチャンネルに招待:** Botを利用したいSlackチャンネルで、`/invite @営業クローンBOT` (Botの表示名に合わせてください) と入力してBotを招待します。
2.  **ファイルを投稿:** チャンネルにテスト用の音声ファイルまたは動画ファイルを投稿します。
3.  **Botにメンション:** 投稿したファイルのスレッド内で `@営業クローンBOT 要約して` のようにメンションを送ります。
4.  **結果を確認:** Botが反応し、処理結果（要約など）をスレッドに投稿すれば設定完了です。問題が発生した場合は、Bot開発担当者にご連絡ください。

## 7. トラブルシューティング

*   **"Verified" と表示されない (手順4-4):** Request URLが間違っているか、Botアプリケーションがまだ起動していない可能性があります。Bot開発担当者に連絡してください。
*   **Botがメンションに反応しない:** Botがチャンネルに招待されているか確認してください。それでも反応しない場合は、Bot開発担当者に連絡してください。
*   **その他:** 不明な点や問題が発生した場合は、Bot開発担当者にお問い合わせください。
