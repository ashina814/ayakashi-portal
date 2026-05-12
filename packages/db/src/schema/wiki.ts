/**
 * Wiki 関連テーブル
 *
 * - wiki_pages : ページのメタ情報（slug, title, current_revision_id, parent_id）
 * - wiki_revisions : immutable な履歴レコード
 * - wiki_visibility : ページの閲覧制限（role alias ベース）
 *
 * 階層について:
 *   parent_id は wiki_pages.id への自己参照。null = ルート、それ以外 = 親の子。
 *   親が削除された場合は SET NULL でルートに昇格させる（onDelete: "set null"）。
 *
 * 循環参照について:
 *   wiki_pages.current_revision_id → wiki_revisions.id は論理的には FK だが、
 *   wiki_revisions.page_id → wiki_pages.id との循環を避けるため、
 *   current_revision_id には DB レベルの FK 制約を付けない。
 *   整合性は楽観ロック（WHERE current_revision_id = :clientRevId）で保証する。
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// ─── wiki_pages ──────────────────────────────────────────
export const wikiPages = pgTable("wiki_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  /** 階層親への自己参照（ルートは null）。親削除時はルートに昇格 */
  parentId: uuid("parent_id").references(
    (): AnyPgColumn => wikiPages.id,
    { onDelete: "set null" },
  ),
  /** wiki_revisions.id への論理 FK（DB 制約なし、循環回避） */
  currentRevisionId: uuid("current_revision_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

// ─── wiki_revisions ──────────────────────────────────────
export const wikiRevisions = pgTable("wiki_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => wikiPages.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

// ─── wiki_visibility ─────────────────────────────────────
export const wikiVisibility = pgTable(
  "wiki_visibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    requiredRoleAlias: text("required_role_alias").notNull(),
  },
  (table) => ({
    uniquePageAlias: uniqueIndex("wiki_visibility_page_alias_idx").on(
      table.pageId,
      table.requiredRoleAlias,
    ),
  }),
);
