# 妖ポータル（ayakashi-portal）

Discord サーバーの世界観を表現する和風神話コンセプト Web サイト。

## 概要

- **対象**: Discord サーバー（運営 ~30名、閲覧 ~500名）
- **コンセプト**: 和風神話・妖（あやかし）・黄泉平坂
- **方針**: Web 単独で MVP 完結、Bot は後付け

## ワークスペース構成

```
ayakashi-portal/
├─ apps/
│   ├─ web/          Astro SSR（Cloudflare Pages）
│   └─ bot/          Discord Bot（後付け、M6 以降）
├─ packages/
│   ├─ db/           Drizzle ORM schema（Web/Bot 共有）
│   └─ shared/       共通型定義・ユーティリティ
├─ pnpm-workspace.yaml
└─ package.json
```

| パッケージ | 名前 | 説明 |
|---|---|---|
| `apps/web` | `@ayakashi/web` | Astro + Cloudflare + Tailwind CSS |
| `apps/bot` | `@ayakashi/bot` | discord.js（未実装） |
| `packages/db` | `@ayakashi/db` | Drizzle schema 定義 |
| `packages/shared` | `@ayakashi/shared` | 共通型・ユーティリティ |

## 技術スタック

| 役割 | 技術 |
|---|---|
| Web フレームワーク | Astro 5 (SSR) + @astrojs/cloudflare |
| 認証 | Auth.js (Discord provider) |
| ORM | Drizzle |
| DB | Neon (Serverless Postgres) |
| CSS | Tailwind CSS v3 + Astro scoped CSS |
| ログイン演出 | 純 HTML / CSS / SVG (D 案ハイブリッド、Three.js は不採用) |
| 音再生 | Web Audio API シンセ (プレースホルダ、本番化時 Howler.js + 素材に置換) |
| ホスティング | Cloudflare Pages |
| パッケージ管理 | pnpm workspace |

## 前提環境

- **Node.js**: 20.x（`.nvmrc` 参照）
- **pnpm**: 9.x
- **OS**: Windows / macOS / Linux

## セットアップ

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd ayakashi-portal

# 2. Node.js バージョンを合わせる（nvm 使用時）
nvm use

# 3. 依存関係をインストール
pnpm install

# 4. 環境変数を設定
cp .env.example .env
# .env を編集して各キーを埋める

# 5. 開発サーバーを起動
pnpm dev
```

## 主要コマンド

| コマンド | 説明 |
|---|---|
| `pnpm dev` | Web 開発サーバー起動（`apps/web`） |
| `pnpm build` | Web プロダクションビルド |
| `pnpm lint` | ESLint 実行（全ワークスペース） |
| `pnpm format` | Prettier でフォーマット |
| `pnpm format:check` | フォーマットチェック（CI 用） |

## 環境変数

`.env.example` を参照してください。主なキー:

| 変数 | 用途 |
|---|---|
| `DISCORD_CLIENT_ID` | Discord OAuth アプリの Client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth アプリの Client Secret |
| `GUILD_ID` | 対象 Discord サーバーの ID |
| `AUTH_SECRET` | Auth.js のセッション署名キー |
| `DATABASE_URL` | Neon Postgres の接続文字列 |
| `TOKEN_ENCRYPTION_KEY` | access_token 暗号化キー |

## デプロイ

- **Web**: GitHub → Cloudflare Pages 連携（push 自動デプロイ）
- **DB マイグレーション**: Drizzle Kit

## マイルストーン

詳細は `引き継ぎ資料v3.md` §20 を参照。

- **M0a**: モノレポ雛形 ← **現在ここ**
- **M0b**: Drizzle schema 全テーブル定義
- **M0c**: Cloudflare Pages デプロイ
- **M1a〜c**: 認証・マイページ基盤
- **M2**: マイページ完成
- **M3a〜c**: Wiki
- **M4a〜e**: Three.js ログイン画面
- **M5**: ハブ・ダッシュボード・エラーページ
- **M6〜**: Bot 後付け（任意）

## ライセンス

Private（非公開）
