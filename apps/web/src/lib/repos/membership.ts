/**
 * Membership Repository
 *
 * members / roles / member_roles テーブルの操作をカプセル化。
 * MVP段階では Discord OAuth ログイン時の同期処理を担う。
 */

import { eq, inArray, asc } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { members, roles, memberRoles } from "@ayakashi/db";

export interface MemberWithRoles {
  nickname: string | null;
  joinedAt: Date | null;
  bio: string | null;
  roles: { id: string; name: string; color: string | null; sortOrder: number }[];
}

/**
 * users.id から本人のメンバー情報（ニックネーム・入鯖日・ロール一覧）を取得する。
 * Bot 同期前でも OAuth ログイン時の syncGuildMember で書かれている前提。
 */
export async function getMemberWithRoles(
  db: NeonHttpDatabase<any>,
  userId: string,
): Promise<MemberWithRoles | null> {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.userId, userId))
    .limit(1);

  if (!member) return null;

  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      color: roles.color,
      sortOrder: roles.sortOrder,
    })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(eq(memberRoles.memberId, member.id))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  return {
    nickname: member.nickname,
    joinedAt: member.joinedAt,
    bio: member.bio,
    roles: rows,
  };
}

/**
 * ログイン時に Discord のメンバー情報を DB に同期する
 */
export async function syncGuildMember(
  db: NeonHttpDatabase<any>,
  userId: string, // users.id (UUID)
  discordMember: { nick: string | null; joined_at: string; roles: string[] }
) {
  // 1. members テーブルの Upsert
  const [member] = await db
    .insert(members)
    .values({
      userId,
      nickname: discordMember.nick,
      joinedAt: new Date(discordMember.joined_at),
      lastRoleSyncAt: new Date(),
    })
    .onConflictDoUpdate({
      target: members.userId,
      set: {
        nickname: discordMember.nick,
        lastRoleSyncAt: new Date(),
      },
    })
    .returning();

  // 2. roles テーブルの解決（未登録のロールはプレースホルダーとして作成）
  if (discordMember.roles.length > 0) {
    const existingRoles = await db
      .select({ id: roles.id, discordRoleId: roles.discordRoleId })
      .from(roles)
      .where(inArray(roles.discordRoleId, discordMember.roles));

    const existingDiscordRoleIds = new Set(existingRoles.map(r => r.discordRoleId));
    const missingDiscordRoleIds = discordMember.roles.filter(id => !existingDiscordRoleIds.has(id));

    let allRoles = [...existingRoles];

    if (missingDiscordRoleIds.length > 0) {
      // Bot がまだ詳細を取り込んでいない未知のロールの場合、IDだけで仮登録する
      const insertedRoles = await db
        .insert(roles)
        .values(
          missingDiscordRoleIds.map(id => ({
            discordRoleId: id,
            name: `Unknown Role (${id})`,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: roles.id, discordRoleId: roles.discordRoleId });

      allRoles = [...allRoles, ...insertedRoles];

      // onConflictDoNothing によって returning が漏れた場合の再取得
      if (allRoles.length < discordMember.roles.length) {
        allRoles = await db
          .select({ id: roles.id, discordRoleId: roles.discordRoleId })
          .from(roles)
          .where(inArray(roles.discordRoleId, discordMember.roles));
      }
    }

    // 3. member_roles テーブルの洗い替え
    await db.delete(memberRoles).where(eq(memberRoles.memberId, member.id));
    
    if (allRoles.length > 0) {
      await db.insert(memberRoles).values(
        allRoles.map(r => ({
          memberId: member.id,
          roleId: r.id,
        }))
      );
    }
  } else {
    // ロールが一つもない場合
    await db.delete(memberRoles).where(eq(memberRoles.memberId, member.id));
  }
}
