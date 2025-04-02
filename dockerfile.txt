# ベースイメージ
FROM node:18-slim

# 作業ディレクトリ
WORKDIR /app

# ffmpegとその依存関係をインストール
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係のインストール
RUN npm ci --only=production

# アプリケーションファイルをコピー
COPY . .

# ポート番号を指定
ENV PORT=8080
EXPOSE 8080

# アプリケーションの起動
CMD [ "node", "src/index.js" ]
