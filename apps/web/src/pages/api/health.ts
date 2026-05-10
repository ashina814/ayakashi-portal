/**
 * ヘルスチェックエンドポイント
 *
 * UptimeRobot 等の外部監視から定期的に ping される想定。
 * 200 を返せばサーバーは正常、DB 接続チェックは M1a 以降で追加。
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
