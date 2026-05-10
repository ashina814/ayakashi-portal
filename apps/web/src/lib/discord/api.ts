/**
 * Discord API クライアント (OAuth ユーザー権限用)
 */

export interface DiscordGuildMember {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  nick: string | null;
  roles: string[];
  joined_at: string;
}

/**
 * ユーザーの access_token を用いて対象サーバー内のメンバー情報を取得する。
 * guilds.members.read スコープが必要。
 */
export async function fetchGuildMember(
  accessToken: string,
  guildId: string
): Promise<DiscordGuildMember | null> {
  const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      // サーバーに参加していない
      return null;
    }
    throw new Error(`Failed to fetch Discord member: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
