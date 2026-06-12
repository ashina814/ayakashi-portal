# @ayakashi/bot — LUXEL ポータル Bot

ロール同期に特化した軽量 Discord Bot。Discord ギルドのロール（名前・色・並び順）と、
ポータルにログイン済みメンバーのロール所属を Neon DB に同期する。

OAuth ログインだけだとロール ID しか取れず roles テーブルが「Unknown Role」に
なるため、その名前・色を埋めるのがこの bot の主目的。

## やること

- **起動時**: ギルドの全ロールを `roles` テーブルに upsert（消えたロールは削除）。
  ログイン済みメンバーの `member_roles` を同期。
- **常駐**: ロール作成/更新/削除、メンバーのロール変更をリアルタイム反映。

> member_roles はポータルにログイン済み（`accounts` に Discord 連携がある）
> メンバーのみ更新する。未ログインのメンバーは対象外。

## 必要なもの

- Node.js 20+
- 専用の Discord Bot アプリケーション（後述）
- Web と同じ Neon の `DATABASE_URL`

## セットアップ

### 1. Discord アプリ（Bot）を新規作成

1. https://discord.com/developers/applications → **New Application**（例: `LUXEL Sync`）
2. 左メニュー **Bot** → **Add Bot**
3. **Privileged Gateway Intents** で **SERVER MEMBERS INTENT** を **ON**（メンバーイベント用）。
   - MESSAGE CONTENT は不要。
4. **Reset Token** でトークンを取得 → `.env` の `DISCORD_BOT_TOKEN` に。

> 既存の賭博 bot とは別アプリにすること。権限とインテントを分離でき、賭博 bot に
> 影響を与えずに済む。

### 2. サーバーに招待

OAuth2 → URL Generator で:
- **Scopes**: `bot`
- **Bot Permissions**: 最小でよい（ロール/メンバーの**読み取り**しかしない）。
  `View Channels` 程度で可。ロールの管理権限は不要。

生成された URL を開いて LUXEL サーバーに追加。

### 3. 環境変数

```bash
cp .env.example .env
# .env を編集:
#   DISCORD_BOT_TOKEN=<手順1のトークン>
#   GUILD_ID=1508173654788411554
#   DATABASE_URL=<Web と同じ Neon の接続文字列>
```

### 4. 依存インストール & 起動

リポジトリルートで:

```bash
pnpm install
pnpm --filter @ayakashi/bot start
```

起動すると `synced N roles` / `synced roles for M portal-linked members` が出る。
これで roles テーブルの「Unknown Role」が実名・色に置き換わる。

開発時はファイル監視:

```bash
pnpm --filter @ayakashi/bot dev
```

## VPS（systemd）運用

軽量（イベント駆動・WebSocket 1 本・メンバー全キャッシュなし）なので、
既存 bot と同居しても負荷は小さい（目安: メモリ 80〜150MB、CPU ほぼ 0）。

`/etc/systemd/system/luxel-bot.service` の例:

```ini
[Unit]
Description=LUXEL portal role-sync bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/ayakashi-portal/apps/bot
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/ayakashi-portal/apps/bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now luxel-bot
sudo systemctl status luxel-bot
journalctl -u luxel-bot -f    # ログ追跡
```

> VPS の空き確認: `free -h`（空きメモリ 200MB 以上あれば余裕）。

## トラブルシュート

- **`guild ... に参加していません`** → 招待 URL でサーバーに追加できていない。
- **メンバーイベントが来ない** → SERVER MEMBERS INTENT が OFF。手順 1 を確認。
- **member_roles が増えない** → 対象メンバーがまだポータルに未ログイン（`accounts` に
  Discord 連携が無い）。ログインすれば次回同期で反映される。

## 状態

Web（Astro）は Bot なしでも OAuth API 経由で単独動作する。Bot はロール名・色の
解決とリアルタイム同期を担う補助。停止しても Web は落ちない（ロール名が
「Unknown Role」に戻るだけ）。
