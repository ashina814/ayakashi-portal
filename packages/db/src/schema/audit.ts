/**
 * 監査ログテーブル
 *
 * 重要操作（ロール変更、Wiki 編集、運営操作など）を記録。
 * target は操作対象の詳細を JSON で保持する。
 */

import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth";

// ─── audit_log ───────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  target: jsonb("target"),
  at: timestamp("at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
