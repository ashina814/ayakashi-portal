import type { APIRoute } from "astro";
import { getEnv } from "../../lib/auth/helpers";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = getEnv(locals);
    return new Response(
      JSON.stringify({
        status: "ok",
        hasDiscordClientId: !!env.DISCORD_CLIENT_ID,
        hasDiscordSecret: !!env.DISCORD_CLIENT_SECRET,
        hasAuthSecret: !!env.AUTH_SECRET,
        hasGuildId: !!env.GUILD_ID,
        hasDbUrl: !!env.DATABASE_URL,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
