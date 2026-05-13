/**
 * Wiki Repository
 *
 * wiki_pages / wiki_revisions / wiki_visibility テーブルの読み取りをカプセル化。
 * 編集系（書き込み・楽観ロック・サニタイズ）は M3c で追加予定。
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { wikiPages, wikiRevisions, wikiVisibility } from "@ayakashi/db";
import { renderWikiContent, type TocEntry } from "../wiki/render";
import {
  canEditWiki,
  WIKI_EDITOR_ALIAS,
} from "../auth/permissions";

// 後方互換: permissions.ts に集約したものを再エクスポート
export { WIKI_EDITOR_ALIAS };
/** ユーザーが Wiki 編集権限を持つか（admin も含む） */
export const hasWikiEditorPermission = canEditWiki;

export interface WikiPageListItem {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  updatedAt: Date;
}

export interface WikiPageDetail extends WikiPageListItem {
  /** 保存されている生の content（Tiptap JSON 文字列 or レガシープレーンテキスト） */
  content: string;
  /** サーバーサイドでレンダリング済みの HTML（描画用） */
  contentHtml: string;
  /** H2/H3 から抽出した目次 */
  toc: TocEntry[];
  /** ルート→現在ページのパンくず（自身を末尾に含む） */
  breadcrumbs: WikiCrumb[];
  revisionCreatedAt: Date | null;
}

export interface WikiCrumb {
  id: string;
  slug: string;
  title: string;
}

export interface WikiTreeNode extends WikiPageListItem {
  children: WikiTreeNode[];
}

/**
 * 閲覧可否の SQL 条件: visibility 行が無い（public）か、
 * いずれかの required_role_alias がユーザーの alias 集合に含まれる。
 *
 * drizzle-orm の exists/notExists ヘルパは subquery を () で包まないため
 * 生 SQL で組み立てる。
 */
function buildVisibilityFilter(aliases: string[]) {
  if (aliases.length === 0) {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
    )`;
  }
  return sql`(
    NOT EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
    )
    OR EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
        AND ${inArray(wikiVisibility.requiredRoleAlias, aliases)}
    )
  )`;
}

/**
 * 全ページの総数（admin ダッシュ用、visibility 無視）。
 */
export async function countAllPages(
  db: NeonHttpDatabase<any>,
): Promise<number> {
  const rows = await db.select({ id: wikiPages.id }).from(wikiPages);
  return rows.length;
}

/**
 * 直近 N 件の編集（wiki_revisions 降順、ページタイトル付き）。
 */
export async function listRecentRevisions(
  db: NeonHttpDatabase<any>,
  limit = 5,
): Promise<
  { revisionId: string; pageId: string; slug: string; title: string; authorId: string; at: Date }[]
> {
  return await db
    .select({
      revisionId: wikiRevisions.id,
      pageId: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      authorId: wikiRevisions.authorId,
      at: wikiRevisions.createdAt,
    })
    .from(wikiRevisions)
    .innerJoin(wikiPages, eq(wikiPages.id, wikiRevisions.pageId))
    .orderBy(desc(wikiRevisions.createdAt))
    .limit(limit);
}

/**
 * 閲覧可能なページの一覧（更新日時降順、フラット）。
 */
export async function listPages(
  db: NeonHttpDatabase<any>,
  aliases: string[],
): Promise<WikiPageListItem[]> {
  return await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      parentId: wikiPages.parentId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(buildVisibilityFilter(aliases))
    .orderBy(desc(wikiPages.updatedAt));
}

/**
 * 閲覧可能なページを階層ツリーで返す。同階層内はタイトル昇順。
 * 親が閲覧不可で子が閲覧可の「迷子」はルート扱いに浮上させる。
 */
export async function getWikiTree(
  db: NeonHttpDatabase<any>,
  aliases: string[],
): Promise<WikiTreeNode[]> {
  const flat = await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      parentId: wikiPages.parentId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(buildVisibilityFilter(aliases))
    .orderBy(asc(wikiPages.title));

  const byId = new Map<string, WikiTreeNode>(
    flat.map((p) => [p.id, { ...p, children: [] }]),
  );

  const roots: WikiTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * ルートから対象ページまでのパンくずを返す。深さ制限あり（無限ループ防止）。
 */
async function getBreadcrumbs(
  db: NeonHttpDatabase<any>,
  pageId: string,
): Promise<WikiCrumb[]> {
  const crumbs: WikiCrumb[] = [];
  let currentId: string | null = pageId;
  for (let depth = 0; depth < 10 && currentId; depth += 1) {
    const [row] = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        parentId: wikiPages.parentId,
      })
      .from(wikiPages)
      .where(eq(wikiPages.id, currentId))
      .limit(1);
    if (!row) break;
    crumbs.unshift({ id: row.id, slug: row.slug, title: row.title });
    currentId = row.parentId;
  }
  return crumbs;
}

export interface UpdateContentResult {
  ok: boolean;
  /** 競合時は最新の current_revision_id を返す */
  currentRevisionId: string | null;
}

/**
 * ページの本文を新しい revision として保存し、wiki_pages.current_revision_id を
 * 楽観ロックで更新する。expectedRevisionId が現在の DB 値と一致しない場合は
 * 競合扱いで { ok: false } を返す。
 */
export async function updatePageContent(
  db: NeonHttpDatabase<any>,
  args: {
    pageId: string;
    content: string;
    authorId: string;
    /** 編集開始時点の current_revision_id（null なら未保存状態を期待） */
    expectedRevisionId: string | null;
  },
): Promise<UpdateContentResult> {
  const [page] = await db
    .select({ currentRevisionId: wikiPages.currentRevisionId })
    .from(wikiPages)
    .where(eq(wikiPages.id, args.pageId))
    .limit(1);

  if (!page) {
    return { ok: false, currentRevisionId: null };
  }

  if ((page.currentRevisionId ?? null) !== (args.expectedRevisionId ?? null)) {
    return { ok: false, currentRevisionId: page.currentRevisionId ?? null };
  }

  const [rev] = await db
    .insert(wikiRevisions)
    .values({
      pageId: args.pageId,
      content: args.content,
      authorId: args.authorId,
    })
    .returning({ id: wikiRevisions.id });

  await db
    .update(wikiPages)
    .set({
      currentRevisionId: rev.id,
      updatedAt: new Date(),
    })
    .where(eq(wikiPages.id, args.pageId));

  return { ok: true, currentRevisionId: rev.id };
}

/**
 * 対象ページの閲覧制限 alias 一覧を返す（空配列なら public）。
 */
export async function getPageVisibility(
  db: NeonHttpDatabase<any>,
  pageId: string,
): Promise<string[]> {
  const rows = await db
    .select({ alias: wikiVisibility.requiredRoleAlias })
    .from(wikiVisibility)
    .where(eq(wikiVisibility.pageId, pageId))
    .orderBy(asc(wikiVisibility.requiredRoleAlias));
  return rows.map((r) => r.alias);
}

/**
 * 対象ページの閲覧制限 alias を replace-all で置き換える。
 * 空配列を渡すと public（行を全削除）になる。
 */
export async function setPageVisibility(
  db: NeonHttpDatabase<any>,
  pageId: string,
  aliases: string[],
): Promise<void> {
  // alias を正規化（重複・空白除去）
  const unique = Array.from(
    new Set(aliases.map((a) => a.trim()).filter((a) => a.length > 0)),
  );

  await db.delete(wikiVisibility).where(eq(wikiVisibility.pageId, pageId));
  if (unique.length > 0) {
    await db.insert(wikiVisibility).values(
      unique.map((alias) => ({ pageId, requiredRoleAlias: alias })),
    );
  }
}

/**
 * ページを削除する。wiki_revisions / wiki_visibility は ON DELETE CASCADE で
 * 自動的に消える。子ページの parent_id は ON DELETE SET NULL でルートに昇格する。
 */
export async function deletePage(
  db: NeonHttpDatabase<any>,
  pageId: string,
): Promise<{ deleted: boolean }> {
  const result = await db
    .delete(wikiPages)
    .where(eq(wikiPages.id, pageId))
    .returning({ id: wikiPages.id });
  return { deleted: result.length > 0 };
}

/**
 * 新しいページを作成し、初回 revision も同時に作る。
 * slug が衝突する場合は例外を投げる（呼び出し側でハンドリング）。
 */
export async function createPage(
  db: NeonHttpDatabase<any>,
  args: {
    slug: string;
    title: string;
    parentId: string | null;
    content: string;
    authorId: string;
  },
): Promise<{ id: string; slug: string }> {
  const [page] = await db
    .insert(wikiPages)
    .values({
      slug: args.slug,
      title: args.title,
      parentId: args.parentId,
    })
    .returning({ id: wikiPages.id, slug: wikiPages.slug });

  const [rev] = await db
    .insert(wikiRevisions)
    .values({
      pageId: page.id,
      content: args.content,
      authorId: args.authorId,
    })
    .returning({ id: wikiRevisions.id });

  await db
    .update(wikiPages)
    .set({ currentRevisionId: rev.id, updatedAt: new Date() })
    .where(eq(wikiPages.id, page.id));

  return page;
}

/**
 * slug からページを取得。閲覧権限が無ければ null を返す（404 と同等）。
 */
export async function getPageBySlug(
  db: NeonHttpDatabase<any>,
  slug: string,
  aliases: string[],
): Promise<WikiPageDetail | null> {
  const [page] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.slug, slug), buildVisibilityFilter(aliases)))
    .limit(1);

  if (!page) return null;

  let content = "";
  let revisionCreatedAt: Date | null = null;
  if (page.currentRevisionId) {
    const [rev] = await db
      .select({
        content: wikiRevisions.content,
        createdAt: wikiRevisions.createdAt,
      })
      .from(wikiRevisions)
      .where(eq(wikiRevisions.id, page.currentRevisionId))
      .limit(1);
    if (rev) {
      content = rev.content;
      revisionCreatedAt = rev.createdAt;
    }
  }

  const rendered = renderWikiContent(content);
  const breadcrumbs = await getBreadcrumbs(db, page.id);

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    updatedAt: page.updatedAt,
    content,
    contentHtml: rendered.html,
    toc: rendered.toc,
    breadcrumbs,
    revisionCreatedAt,
  };
}
