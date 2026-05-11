import type { APIRoute } from "astro";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "../../lib/auth/helpers";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = getEnv(locals);
    const sql = neon(env.DATABASE_URL);

    let recentAuthErrors: unknown[] = [];
    try {
      await sql`CREATE TABLE IF NOT EXISTS auth_error_log (
        id SERIAL PRIMARY KEY,
        name TEXT,
        message TEXT,
        cause TEXT,
        stack TEXT,
        extra TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      recentAuthErrors = (await sql`
        SELECT id, name, message, cause, stack, extra, created_at
        FROM auth_error_log
        ORDER BY id DESC
        LIMIT 5
      `) as unknown[];
    } catch (e: any) {
      recentAuthErrors = [{ readError: e?.message ?? String(e) }];
    }

    // 現在のセッションユーザに紐づく DB 行をダンプして M1b 不具合調査を行う。
    const session = locals.session;
    const userId = session?.user
      ? (session.user as { id?: string }).id ?? null
      : null;

    let userRow: unknown = null;
    let accountRows: unknown[] = [];
    let memberRow: unknown = null;
    let memberRoleRows: unknown[] = [];

    if (userId) {
      try {
        const userRows = (await sql`
          SELECT id, name, email, image FROM users WHERE id = ${userId}
        `) as unknown[];
        userRow = userRows[0] ?? null;

        accountRows = (await sql`
          SELECT provider, provider_account_id, type, scope,
                 (access_token IS NOT NULL) AS has_access_token,
                 (refresh_token IS NOT NULL) AS has_refresh_token,
                 expires_at
          FROM accounts WHERE user_id = ${userId}
        `) as unknown[];

        const memberRows = (await sql`
          SELECT id, nickname, joined_at, last_role_sync_at, bio
          FROM members WHERE user_id = ${userId}
        `) as unknown[];
        memberRow = memberRows[0] ?? null;

        if (memberRow) {
          const memberId = (memberRow as { id: string }).id;
          memberRoleRows = (await sql`
            SELECT r.id, r.name, r.color, r.discord_role_id, r.sort_order
            FROM member_roles mr
            JOIN roles r ON r.id = mr.role_id
            WHERE mr.member_id = ${memberId}
            ORDER BY r.sort_order ASC, r.name ASC
          `) as unknown[];
        }
      } catch (e: any) {
        userRow = { readError: e?.message ?? String(e) };
      }
    }

    return new Response(
      JSON.stringify(
        {
          status: "ok",
          hasDiscordClientId: !!env.DISCORD_CLIENT_ID,
          hasDiscordSecret: !!env.DISCORD_CLIENT_SECRET,
          hasAuthSecret: !!env.AUTH_SECRET,
          hasGuildId: !!env.GUILD_ID,
          hasDbUrl: !!env.DATABASE_URL,
          session: {
            isAuthenticated: !!session,
            userIdFromSession: userId,
            userNameFromSession: session?.user?.name ?? null,
          },
          db: {
            userRow,
            accountRows,
            memberRow,
            memberRoleRows,
          },
          recentAuthErrors,
        },
        null,
        2,
      ),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
