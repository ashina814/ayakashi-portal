/**
 * カレンダーイベント
 *
 * 運営（admin）が登録・編集する単発イベント。繰り返しは持たない。
 * 公開カレンダー（/calendar）が starts_at の月で引いて表示する。
 *
 * - all_day=true の時は時刻を無視して「終日」表示。
 * - category は自由テキスト（定例 / 雑談 / 大集会 / システム 等）。
 * - highlight=true は映え用の暖色強調（満月祭のような大きな集い）。
 */

import {
  pgTable,
  text,
  uuid,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** 開始日時（終日イベントでも日付の基準として使う） */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    /** 区分ラベル（チップ表示）。空可 */
    category: text("category"),
    /** 補足説明（アジェンダのメタ行）。空可 */
    description: text("description"),
    /** 暖色強調（大きな集い） */
    highlight: boolean("highlight").notNull().default(false),
    /** 作成した運営の users.id（任意） */
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    startsAtIdx: index("calendar_events_starts_at_idx").on(table.startsAt),
  }),
);
