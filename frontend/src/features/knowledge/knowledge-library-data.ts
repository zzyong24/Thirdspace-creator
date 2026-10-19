/** 仅装配资料元数据；正文按真实选择读取，归属由后台服务处理。 */
export interface LibraryItem {
  id: string;
  title: string;
  knowledgeType: string;
  status: string;
  folderId: string | null;
  assetId: string | null;
  currentRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  sourceNote?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  usedCount?: number;
}
export interface LibraryFolder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface LibraryVm {
  items: LibraryItem[];
  folders: LibraryFolder[];
  error: string | null;
  folderError: string | null;
}
export interface LibraryReader {
  listKnowledge(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listKnowledgeFolders(input: {
    params: undefined;
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}
export async function readLibrary(reader: LibraryReader): Promise<LibraryVm> {
  const [items, folders] = await Promise.allSettled([
    // knowledge.list现有transport全量返回；合法请求100，不截断，也不拿假meta循环。
    reader.listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    }),
    reader.listKnowledgeFolders({
      params: undefined,
      query: undefined,
      body: undefined,
    }),
  ]);
  const validItems = items.status === "fulfilled" && Array.isArray(items.value);
  const validFolders =
    folders.status === "fulfilled" && Array.isArray(folders.value);
  return {
    // SEMANTIC_BOUNDARY_ALLOW: 只按系统登记的课程来源与实体状态隐藏内置课，未做内容分类。
    items: validItems
      ? (items.value as LibraryItem[])
          .filter(
            (x) =>
              x.status === "active" &&
              x.sourceMetadata?.origin !== "win-video-tutor",
          )
          .sort(
            (a, b) =>
              b.updatedAt.localeCompare(a.updatedAt) ||
              b.id.localeCompare(a.id),
          )
      : [],
    folders: validFolders ? (folders.value as LibraryFolder[]) : [],
    error: validItems ? null : "资料读取失败，请重试。已保存的资料不会丢失。",
    folderError: validFolders
      ? null
      : "文件夹读取失败，请重试；仍可查看全部资料。",
  };
}
/** 真分页接口（项目/引用）专用，不用于knowledge.list。 */
export async function readPagedRows<T extends { id: string }>(
  read: (page: number) => Promise<unknown>,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const raw = await read(page);
    if (!Array.isArray(raw)) throw Error("列表读取失败");
    const rows = raw as T[];
    // SEMANTIC_BOUNDARY_ALLOW: 按真实ID核对分页进展，避免异常重复页，不判断内容语义。
    for (const row of rows) {
      if (!row.id || seen.has(row.id)) throw Error("列表分页未前进，请重试");
      seen.add(row.id);
      result.push(row);
    }
    if (rows.length < 100) return result;
  }
}
export function filterLibrary(
  items: LibraryItem[],
  filter: { type: string; folder: string; q: string },
): LibraryItem[] {
  // SEMANTIC_BOUNDARY_ALLOW: 用户明确选择类型/文件夹及标题文本查找，非智能分类或创作选择。
  const q = filter.q.trim().toLocaleLowerCase();
  return items.filter(
    (x) =>
      (filter.type === "all" || x.knowledgeType === filter.type) &&
      (filter.folder === "all" ||
        (filter.folder === "unfiled"
          ? x.folderId === null
          : x.folderId === filter.folder)) &&
      (!q || x.title.toLocaleLowerCase().includes(q)),
  );
}
export const LIBRARY_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "reference", label: "参考资料" },
  { value: "note", label: "笔记" },
  { value: "claim", label: "观点" },
  { value: "evidence", label: "证据" },
  { value: "quote", label: "金句" },
  { value: "qa", label: "观众问题" },
  { value: "inspiration", label: "灵感" },
  { value: "snippet", label: "片段" },
  { value: "transcript", label: "逐字稿" },
];
export const libraryTypeLabel = (type: string) =>
  LIBRARY_TYPES.find((x) => x.value === type)?.label ?? "资料";
