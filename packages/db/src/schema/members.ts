/**
 * メンバー・ロール関連テーブル
 *
 * - members : Discord guild member 情報（user_id は users.id への FK, unique）
 * - roles : Discord ロールのキャッシュ
 * - member_roles : members ↔ roles の中間テーブル
 * - role_aliases : アプリ内 alias → role_id マッピング（§11）
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// ─── members ─────────────────────────────────────────────
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }),
  nickname: text("nickname"),
  lastRoleSyncAt: timestamp("last_role_sync_at", {
    withTimezone: true,
    mode: "date",
  }),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

// ─── roles ───────────────────────────────────────────────
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordRoleId: text("discord_role_id").notNull().unique(),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

// ─── member_roles ────────────────────────────────────────
export const memberRoles = pgTable(
  "member_roles",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.memberId, table.roleId] }),
  }),
);

// ─── role_aliases ────────────────────────────────────────
export const roleAliases = pgTable("role_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  alias: text("alias").notNull().unique(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
