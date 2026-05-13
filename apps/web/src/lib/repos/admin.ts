/**
 * Admin Repository
 *
 * role_aliases テーブル（alias → role_id マッピング）の管理。
 * UI は /admin/aliases、権限は ADMIN_ALIAS で保護される（呼び出し側で検証）。
 */

import { asc, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { roleAliases, roles } from "@ayakashi/db";

export interface RoleAliasRow {
  id: string;
  alias: string;
  roleId: string;
  roleName: string;
  discordRoleId: string;
}

export interface RoleRow {
  id: string;
  name: string;
  discordRoleId: string;
}

/** 全 alias を取得（alias 名 ASC）。alias → role の人間が読める形で返す。 */
export async function listRoleAliases(
  db: NeonHttpDatabase<any>,
): Promise<RoleAliasRow[]> {
  return await db
    .select({
      id: roleAliases.id,
      alias: roleAliases.alias,
      roleId: roleAliases.roleId,
      roleName: roles.name,
      discordRoleId: roles.discordRoleId,
    })
    .from(roleAliases)
    .innerJoin(roles, eq(roles.id, roleAliases.roleId))
    .orderBy(asc(roleAliases.alias));
}

/** 既知のロール一覧（フォームの select 用）。 */
export async function listAllRoles(
  db: NeonHttpDatabase<any>,
): Promise<RoleRow[]> {
  return await db
    .select({
      id: roles.id,
      name: roles.name,
      discordRoleId: roles.discordRoleId,
    })
    .from(roles)
    .orderBy(asc(roles.name));
}

/** alias を追加。unique 制約違反は呼び出し側で 409 にしてください。 */
export async function createRoleAlias(
  db: NeonHttpDatabase<any>,
  alias: string,
  roleId: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(roleAliases)
    .values({ alias, roleId })
    .returning({ id: roleAliases.id });
  return row;
}

/** alias を1件削除する */
export async function deleteRoleAlias(
  db: NeonHttpDatabase<any>,
  id: string,
): Promise<{ deleted: boolean }> {
  const result = await db
    .delete(roleAliases)
    .where(eq(roleAliases.id, id))
    .returning({ id: roleAliases.id });
  return { deleted: result.length > 0 };
}
