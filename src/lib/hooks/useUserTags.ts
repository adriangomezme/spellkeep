import { useQuery } from '@powersync/react';

export type TagWithCount = {
  id: string;
  name: string;
  color: string | null;
  scope_collection_id: string | null;
  card_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * Reactive tag catalog. If `collectionId` is passed, returns globals
 * plus the tags scoped to that collection. If omitted, returns only
 * globals — the right behavior for a management screen or any picker
 * without a binder context.
 */
export function useUserTags(collectionId?: string | null): {
  tags: TagWithCount[];
  isLoading: boolean;
} {
  const effectiveId = collectionId ?? null;
  const rows = useQuery<TagWithCount>(
    effectiveId === null
      ? `SELECT t.id, t.name, t.color, t.scope_collection_id,
                t.created_at, t.updated_at,
                (SELECT COUNT(*) FROM collection_card_tags cct WHERE cct.tag_id = t.id) AS card_count
           FROM tags t
          WHERE t.scope_collection_id IS NULL
          ORDER BY LOWER(t.name)`
      : `SELECT t.id, t.name, t.color, t.scope_collection_id,
                t.created_at, t.updated_at,
                (SELECT COUNT(*) FROM collection_card_tags cct WHERE cct.tag_id = t.id) AS card_count
           FROM tags t
          WHERE t.scope_collection_id IS NULL
             OR t.scope_collection_id = ?
          ORDER BY (t.scope_collection_id IS NOT NULL), LOWER(t.name)`,
    effectiveId === null ? [] : [effectiveId]
  );
  return {
    tags: rows.data ?? [],
    isLoading: rows.isLoading,
  };
}

export type TagWithMeta = TagWithCount & {
  scope_collection_name: string | null;
};

/**
 * All tags (globals + every scope the user has) with the scope's
 * collection name attached. Used by the tag-management screen to
 * group by scope and show "Only in {binder}" context. Separate from
 * `useUserTags` because most consumers don't need the JOIN overhead.
 */
export function useAllUserTags(): {
  tags: TagWithMeta[];
  isLoading: boolean;
} {
  const rows = useQuery<TagWithMeta>(
    `SELECT t.id, t.name, t.color, t.scope_collection_id,
            c.name AS scope_collection_name,
            t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM collection_card_tags cct WHERE cct.tag_id = t.id) AS card_count
       FROM tags t
       LEFT JOIN collections c ON c.id = t.scope_collection_id
      ORDER BY (t.scope_collection_id IS NOT NULL),
               LOWER(COALESCE(c.name, '')),
               LOWER(t.name)`
  );
  return {
    tags: rows.data ?? [],
    isLoading: rows.isLoading,
  };
}

/**
 * Reactive list of tag ids currently applied to a single
 * collection_cards row. Used to paint chips on the list view and to
 * diff on bulk-add operations.
 */
export function useCardTagIds(collectionCardId: string | null | undefined): string[] {
  const rows = useQuery<{ tag_id: string }>(
    `SELECT tag_id FROM collection_card_tags WHERE collection_card_id = ?`,
    [collectionCardId ?? '']
  );
  if (!collectionCardId) return [];
  return (rows.data ?? []).map((r) => r.tag_id);
}
