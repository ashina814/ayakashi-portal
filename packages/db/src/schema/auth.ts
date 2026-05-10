/**
 * Auth.js 用テーブル群
 *
 * @auth/drizzle-adapter の標準スキーマに準拠。
 * テーブル名は snake_case で統一し、adapter 側でマッピングする。
 *
 * - access_token / refresh_token は M1a で app-level 暗号化を追加予定。
 *   M0b 時点ではカラム定義のみ（text 型）。
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── users ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey().notNull(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", {
    withTimezone: true,
    mode: "date",
  }),
  image: text("image"),
});

// ─── accounts ────────────────────────────────────────────
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

// ─── sessions ────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

// ─── verification_tokens ─────────────────────────────────
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);
