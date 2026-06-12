/**
 * DB 同期ロジック
 *
 * Discord ギルドの状態を Neon DB（roles / member_roles）に反映する。
 * Web の syncGuildMember（OAuth ログイン時）はロール ID しか持てないため
 * 「Unknown Role」のプレースホルダーになる。Bot はギルドの全ロールを
 * 名前・色・並び順つきで upsert して、それを上書き解消する。
 *
 * member_roles はポータルにログイン済み（accounts に discord 連携がある）
 * ユーザーについてのみ更新できる。未ログインのメンバーは members 行が
 * 無いので対象外（権限判定はログインユーザーにしか要らないため十分）。
 */

import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@ayakashi/db/client";
import { accounts, members, memberRoles, roles } from "@ayakashi/db";
import type { Guild, GuildMember, Role } from "discord.js";

/** Discord の色 int を "#rrggbb" に。0（色なし）は null。 */
function hexColor(role: Pick<Role, "color" | "hexColor">): string | null {
  return role.color === 0 ? null : role.hexColor;
}

/**
 * ギルドの全ロールを roles テーブルに upsert し、ギルドに存在しない
 * ロール行は削除する（@everyone は除外）。
 */
export async function syncAllRoles(db: Database, guild: Guild): Promise<number> {
  const guildRoles = [...guild.roles.cache.values()].filter(
    (r) => r.id !== guild.id, // @everyone を除外
  );

  for (const role of guildRoles) {
    await upsertRole(db, role);
  }

  // ギルドから消えたロールを DB からも削除
  const keepIds = guildRoles.map((r) => r.id);
  if (keepIds.length > 0) {
    await db.delete(roles).where(notInArray(roles.discordRoleId, keepIds));
  }

  return guildRoles.length;
}

/** 単一ロールの upsert（discord_role_id をキーに名前・色・並び順を更新）。 */
export async function upsertRole(db: Database, role: Role): Promise<void> {
  if (role.id === role.guild.id) return; // @everyone は無視
  await db
    .insert(roles)
    .values({
      discordRoleId: role.id,
      name: role.name,
      color: hexColor(role),
      sortOrder: role.position,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: roles.discordRoleId,
      set: {
        name: role.name,
        color: hexColor(role),
        sortOrder: role.position,
        updatedAt: new Date(),
      },
    });
}

/** ロール削除（member_roles は ON DELETE CASCADE で自動的に消える）。 */
export async function deleteRoleByDiscordId(
  db: Database,
  discordRoleId: string,
): Promise<void> {
  await db.delete(roles).where(eq(roles.discordRoleId, discordRoleId));
}

/**
 * Discord ユーザー ID → ポータルの members 行 ID を解決する。
 * accounts(provider=discord, providerAccountId) → users.id → members.userId。
 * 未ログイン（連携なし）の場合は null。
 */
async function resolveMemberId(
  db: Database,
  discordUserId: string,
): Promise<string | null> {
  const [acc] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "discord"),
        eq(accounts.providerAccountId, discordUserId),
      ),
    )
    .limit(1);
  if (!acc) return null;

  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.userId, acc.userId))
    .limit(1);
  return member?.id ?? null;
}

/**
 * 1 メンバーの member_roles を、現在の Discord ロール集合で置き換える。
 * ポータル未ログインのメンバーは何もしない（members 行が無い）。
 */
export async function syncMemberRoles(
  db: Database,
  member: GuildMember,
): Promise<boolean> {
  const memberId = await resolveMemberId(db, member.user.id);
  if (!memberId) return false;

  // Discord ロール ID（@everyone 除外）→ roles.id を解決
  const discordRoleIds = [...member.roles.cache.keys()].filter(
    (id) => id !== member.guild.id,
  );

  const roleRows =
    discordRoleIds.length > 0
      ? await db
          .select({ id: roles.id })
          .from(roles)
          .where(inArray(roles.discordRoleId, discordRoleIds))
      : [];

  // 置き換え（全削除 → 再挿入）
  await db.delete(memberRoles).where(eq(memberRoles.memberId, memberId));
  if (roleRows.length > 0) {
    await db
      .insert(memberRoles)
      .values(roleRows.map((r) => ({ memberId, roleId: r.id })))
      .onConflictDoNothing();
  }

  await db
    .update(members)
    .set({ nickname: member.nickname, lastRoleSyncAt: new Date() })
    .where(eq(members.id, memberId));

  return true;
}
