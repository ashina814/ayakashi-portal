/**
 * 通知キューテーブル（Bot 用、MVP は空運用）
 *
 * Web が通知を DB に enqueue → Bot が poll して Discord へ送信。
 * Bot が居ない MVP 段階では溜まるだけで配信されない。
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── notification_status enum ────────────────────────────
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

// ─── notifications ───────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  payload: jsonb("payload").notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  error: text("error"),
});
