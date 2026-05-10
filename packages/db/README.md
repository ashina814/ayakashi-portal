# @ayakashi/db

Drizzle ORM スキーマ定義パッケージ。Web（Astro）と Bot（discord.js）で共有する。

## スキーマ構成

```
src/schema/
├── auth.ts           Auth.js 用テーブル（users / accounts / sessions / verification_tokens）
├── members.ts        メンバー・ロール（members / roles / member_roles / role_aliases）
├── wiki.ts           Wiki（wiki_pages / wiki_revisions / wiki_visibility）
├── activity.ts       日次活動量（activity_daily）— MVP は空運用
├── notifications.ts  通知キュー（notifications）— MVP は空運用
└── audit.ts          監査ログ（audit_log）
```

## テーブル一覧

| テーブル | 主な用途 | Bot 必要 |
|---------|---------|---------|
| `users` | Auth.js ユーザー | 不要 |
| `accounts` | OAuth トークン保管 | 不要 |
| `sessions` | セッション管理 | 不要 |
| `verification_tokens` | メール検証用 | 不要 |
| `members` | Discord guild member 情報 | 不要 |
| `roles` | Discord ロールのキャッシュ | 不要 |
| `member_roles` | members ↔ roles 中間テーブル | 不要 |
| `role_aliases` | alias → role マッピング | 不要 |
| `wiki_pages` | Wiki ページメタ | 不要 |
| `wiki_revisions` | Wiki 履歴（immutable） | 不要 |
| `wiki_visibility` | ページの閲覧制限 | 不要 |
| `activity_daily` | 日次活動量集計 | **Bot 必須** |
| `notifications` | Web → Discord 通知キュー | **Bot 必須** |
| `audit_log` | 操作の監査記録 | 不要 |

## 型の方針

| 項目 | 方針 |
|------|------|
| Auth.js テーブルの id | `text`（Auth.js adapter 既定の cuid） |
| 独自テーブルの id | `uuid`（`gen_random_uuid()`） |
| 日時カラム | `timestamptz`（`timestamp { withTimezone: true }`） |
| 日付のみカラム | `date`（`activity_daily.date`） |
| テーブル名 | snake_case で統一 |

## コマンド

```bash
# migration SQL の生成（DB 接続不要）
pnpm db:generate

# migration の適用（DATABASE_URL 必要）
pnpm db:migrate

# Drizzle Studio 起動（DATABASE_URL 必要）
pnpm db:studio
```

`packages/db` ディレクトリから直接実行する場合：

```bash
pnpm generate
pnpm migrate
pnpm studio
```

## DB 接続

CF Workers 環境用に `@neondatabase/serverless` の HTTP ドライバを使用：

```ts
import { createDb } from '@ayakashi/db/client';

const db = createDb(env.DATABASE_URL);
const allUsers = await db.select().from(users);
```

## 設計上の注意点

### 循環参照の回避

`wiki_pages.current_revision_id` → `wiki_revisions.id` は論理的には FK だが、
`wiki_revisions.page_id` → `wiki_pages.id` との循環を避けるため DB 制約なし。
整合性は楽観ロック（`WHERE current_revision_id = :clientRevId`）で保証する。

### トークン暗号化

`accounts.access_token` / `refresh_token` は M1a で app-level 暗号化を実装予定。
M0b 時点では `text` カラムとして定義のみ。

### Drizzle Relations

M0b では Drizzle の `relations()` 定義は未実装。
M1c（リポジトリ層導入）で必要に応じて追加する。
