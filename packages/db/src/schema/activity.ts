/**
 * 活動量テーブル（Bot 用、MVP は空運用）
 *
 * Bot が日次集計して書き込む。MVP 段階ではテーブルだけ存在し、
 * リポジトリ層は null を返して UI 側で「準備中」と表示する。
 */

import {
  pgTable,
  timestamp,
  uuid,
  integer,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { members } from "./members";

// ─── activity_daily ──────────────────────────────────────
export const activityDaily = pgTable(
  "activity_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    reactionCount: integer("reaction_count").notNull().default(0),
  },
  (table) => ({
    uniqueMemberDate: uniqueIndex("activity_daily_member_date_idx").on(
      table.memberId,
      table.date,
    ),
  }),
);
