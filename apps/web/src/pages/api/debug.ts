import type { APIRoute } from "astro";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "../../lib/auth/helpers";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = getEnv(locals);

    let recentAuthErrors: unknown[] = [];
    try {
      const sql = neon(env.DATABASE_URL);
      recentAuthErrors = (await sql`
        SELECT id, name, message, cause, stack, extra, created_at
        FROM auth_error_log
        ORDER BY id DESC
        LIMIT 5
      `) as unknown[];
    } catch (e: any) {
      recentAuthErrors = [{ readError: e?.message ?? String(e) }];
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        hasDiscordClientId: !!env.DISCORD_CLIENT_ID,
        hasDiscordSecret: !!env.DISCORD_CLIENT_SECRET,
        hasAuthSecret: !!env.AUTH_SECRET,
        hasGuildId: !!env.GUILD_ID,
        hasDbUrl: !!env.DATABASE_URL,
        recentAuthErrors,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
