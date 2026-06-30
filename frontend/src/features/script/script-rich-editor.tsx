"use client";

/**
 * `ScriptRichEditor` —— 脚本正文的内置富文本编辑器(T-019 / L4,SPEC §3.4 + §5.1)。
 *
 * 用 **TipTap**(ProseMirror,headless,OSS)替原先的「每段一个 textarea + 装饰工具栏」。
 * 真能用的富文本:加粗/斜体/删除线、标题 H1-H3、无序/有序列表、引用 —— 全部走 TipTap
 * 原生命令,工具栏按钮的 `aria-pressed` 反映当前选区的真实激活态。
 *
 * 编辑器 ↔ artifact 桥(script-editor-bridge,纯函数):
 *   - 初值:`initialHtml`(route 读侧从 `contentData.html` 或 `sections` 拼出,见
 *     loadScriptEditorData)。AI 初稿(script.draft,只产 sections)和历史保存都能灌进来。
 *   - 保存:`editor.getHTML()` → htmlToSections() → client.createArtifactVersion({
 *       contentText(纯文本), contentData:{ html(富文本真值), sections(派生,给大纲/金句+AI兼容) }
 *     })→ router.refresh() 重读当前版本。**不破坏现有分镜落库/版本机制**(同一条
 *     createArtifactVersion 路径,版本回滚仍复用 script-version-restore)。
 *
 * DOM 外壳保持与旧编辑器一致(`rich-text-editor` / `editor-toolbar` role=toolbar /
 * `script-document` / `editor-status-bar` + 字数/保存状态 slot),让页面结构契约延续。
 *
 * SSR:`immediatelyRender:false`(Next 服务端不立即渲染,避免 hydration mismatch)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import { htmlToSections } from "./script-editor-bridge";

type SaveStatus = "saved" | "saving" | "dirty";

export interface ScriptRichEditorProps {
  /** 编辑器初始 HTML(route 读侧从 artifact 当前版本拼出)。空 → 空文档占位。 */
  readonly initialHtml: string;
  /**
   * 分镜脚本 artifact id。保存按钮把 `getHTML()` 派生的 contentText + contentData
   * append 成新 ArtifactVersion。null(fixture-only 渲染 / 结构测试)→ 保存只走本地态。
   */
  readonly artifactId?: string | null;
  /**
   * 编辑器实例就绪回调(选填)。TipTap 在 jsdom 下不能靠鼠标坐标定位光标(无 layout),
   * 测试用它拿到 editor 句柄,直接走 `editor.commands` 驱动编辑(TipTap 官方推荐的测试方式)。
   * 生产代码不传 —— 编辑全走 UI。
   */
  readonly onEditorReady?: (editor: Editor) => void;
}

// ---------------------------------------------------------------------------
// 工具栏描述(声明式;每个控件绑一个 TipTap 命令 + isActive 判定)
// ---------------------------------------------------------------------------

interface MarkButton {
  readonly id: string;
  readonly format: "bold" | "italic" | "strike";
  readonly label: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const MARK_BUTTONS: ReadonlyArray<MarkButton> = [
  {
    id: "fmt-bold",
    format: "bold",
    label: "加粗",
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "fmt-italic",
    format: "italic",
    label: "斜体",
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "fmt-strike",
    format: "strike",
    label: "删除线",
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
];

interface BlockButton {
  readonly id: string;
  // 复用 mark 的 data-format 契约位(测试只断言存在 aria-pressed + 至少一个 bold)。
  readonly format: "bold";
  readonly label: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const HEADING_BUTTONS: ReadonlyArray<BlockButton> = [
  {
    id: "fmt-h1",
    format: "bold",
    label: "标题 1",
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "fmt-h2",
    format: "bold",
    label: "标题 2",
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "fmt-h3",
    format: "bold",
    label: "标题 3",
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
];

interface InsertButton {
  readonly id: string;
  readonly label: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const INSERT_BUTTONS: ReadonlyArray<InsertButton> = [
  {
    id: "tool-list-bullet",
    label: "•",
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "tool-list-ordered",
    label: "1.",
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "tool-quote",
    label: "“",
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

// ---------------------------------------------------------------------------
// 编辑器
// ---------------------------------------------------------------------------

export function ScriptRichEditor({
  initialHtml,
  artifactId = null,
  onEditorReady,
}: ScriptRichEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved");
  const [wordCount, setWordCount] = React.useState(0);
  // 订阅 editor 的事务,强制工具栏 aria-pressed 随选区刷新。
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 链接/图片等暂不需要;脚本正文用标题/列表/加粗足够。保留默认其余 nodes。
      }),
    ],
    content: initialHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // 编辑区可访问标签 + 测试钩子;ProseMirror 会在内部挂 contenteditable。
        "aria-label": "脚本正文编辑器",
        "data-slot": "script-prosemirror",
        class:
          "tiptap-script prose-script min-h-[280px] focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      setSaveStatus("dirty");
      setWordCount(ed.getText().length);
    },
    onSelectionUpdate: () => forceTick(),
    onTransaction: () => forceTick(),
  });

  // 把外部 initialHtml(router.refresh 后读到的新版本)同步进 TipTap —— editor 是命令式外部
  // 系统,这正是 effect 该做的「向外部系统推最新 state」。用 ref 记住已应用的值,仅在真正变化时
  // setContent + 重置派生 UI(回「已保存」、刷字数),避免每次渲染都跑、也避免打断本地编辑。
  const appliedHtmlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!editor) return;
    const next = initialHtml || "<p></p>";
    if (appliedHtmlRef.current === next) return;
    appliedHtmlRef.current = next;
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    // setContent(emitUpdate:false) 不触发 onUpdate,故在此显式同步派生态(刚载入 = 已保存)。
    setSaveStatus("saved");
    setWordCount(editor.getText().length);
  }, [initialHtml, editor]);

  // 把 editor 句柄交给可选回调(测试用;生产不传)。仅在实例创建后触发一次。
  React.useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const handleSave = React.useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const contentText = editor.getText();
    if (!artifactId) {
      // fixture-only 渲染(无 artifactId,结构测试)→ 不打契约,仅本地翻「已保存」。
      setSaveStatus("saved");
      return;
    }
    const sections = htmlToSections(html);
    setSaveStatus("saving");
    startTransition(async () => {
      try {
        await client.createArtifactVersion({
          params: { artifactId },
          query: undefined,
          body: {
            contentText,
            // html = 富文本真值(忠实往返);sections = 派生(大纲/金句读侧 + AI 兼容)。
            contentData: { html, sections },
            changeSummary: "编辑脚本",
          },
        });
        setSaveStatus("saved");
        router.refresh();
      } catch {
        // 失败保留 dirty,用户可重试。
        setSaveStatus("dirty");
      }
    });
  }, [artifactId, editor, router]);

  return (
    <div data-slot="rich-text-editor">
      <SectionCard
        title="主脚本"
        description="TipTap 富文本编辑器:可改标题/加粗/列表，承载脚本正文"
      >
        <EditorToolbar
          editor={editor}
          onSave={handleSave}
          saveStatus={saveStatus}
          saving={pending}
        />
        <div
          data-slot="script-document"
          className="tiptap-script-document mt-3 rounded-control border border-border bg-surface p-3.5"
        >
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <p className="text-sm text-muted-foreground">编辑器加载中…</p>
          )}
        </div>
        <EditorStatusBar wordCount={wordCount} saveStatus={saveStatus} />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工具栏(真命令 + 真激活态)
// ---------------------------------------------------------------------------

function EditorToolbar({
  editor,
  onSave,
  saveStatus,
  saving,
}: {
  editor: Editor | null;
  onSave: () => void;
  saveStatus: SaveStatus;
  saving: boolean;
}) {
  return (
    <div
      role="toolbar"
      data-slot="editor-toolbar"
      aria-label="脚本编辑器工具栏"
      className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-subtle/70 p-1.5"
    >
      <ToolbarGroup label="格式">
        {MARK_BUTTONS.map((button) => (
          <ToolbarCommandButton
            key={button.id}
            editor={editor}
            id={button.id}
            format={button.format}
            label={button.label}
            active={editor ? button.isActive(editor) : false}
            onRun={() => editor && button.run(editor)}
          />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="标题">
        {HEADING_BUTTONS.map((button) => (
          <ToolbarCommandButton
            key={button.id}
            editor={editor}
            id={button.id}
            format={button.format}
            label={button.label}
            active={editor ? button.isActive(editor) : false}
            onRun={() => editor && button.run(editor)}
          />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="插入">
        {INSERT_BUTTONS.map((button) => (
          <ToolbarGlyphButton
            key={button.id}
            id={button.id}
            label={button.label}
            active={editor ? button.isActive(editor) : false}
            onRun={() => editor && button.run(editor)}
          />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <button
        type="button"
        data-slot="editor-save-button"
        onClick={onSave}
        disabled={saveStatus === "saved" || saving}
        className="ml-auto inline-flex h-7 items-center rounded-md border border-transparent bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        保存
      </button>
    </div>
  );
}

function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="editor-toolbar-group"
      className="flex items-center gap-1"
    >
      {children}
    </div>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      data-slot="editor-toolbar-divider"
      className="mx-1 h-5 w-px bg-border"
    />
  );
}

// 真富文本命令按钮:aria-pressed = TipTap isActive(选区真实态);点击跑 toggle 命令。
function ToolbarCommandButton({
  editor,
  id,
  format,
  label,
  active,
  onRun,
}: {
  editor: Editor | null;
  id: string;
  format: "bold" | "italic" | "strike";
  label: string;
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-button"
      data-format={format}
      data-button-id={id}
      aria-pressed={active}
      disabled={!editor}
      onMouseDown={(e) => {
        // 防止按钮抢焦点导致选区丢失(富文本工具栏常规处理)。
        e.preventDefault();
      }}
      onClick={onRun}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand disabled:opacity-40"
      data-pressed={active}
    >
      {label}
    </button>
  );
}

function ToolbarGlyphButton({
  id,
  label,
  active,
  onRun,
}: {
  id: string;
  label: string;
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-glyph"
      data-glyph-id={id}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
      data-pressed={active}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 状态栏(字数 + 保存状态;slot 与旧编辑器一致)
// ---------------------------------------------------------------------------

function EditorStatusBar({
  wordCount,
  saveStatus,
}: {
  wordCount: number;
  saveStatus: SaveStatus;
}) {
  return (
    <div
      data-slot="editor-status-bar"
      className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground"
    >
      <span data-slot="editor-status-word-count" className="tabular-nums">
        字数 {wordCount.toLocaleString("zh-CN")}
      </span>
      <span
        data-slot="editor-status-save-status"
        data-save-status={saveStatus}
        className={saveStatusToneClass(saveStatus)}
      >
        {saveStatusLabel(saveStatus)}
      </span>
    </div>
  );
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "saved":
      return "已保存";
    case "saving":
      return "保存中…";
    case "dirty":
      return "有未保存的修改";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "已保存";
    }
  }
}

function saveStatusToneClass(status: SaveStatus): string {
  switch (status) {
    case "saved":
      return "text-success";
    case "saving":
      return "text-warning";
    case "dirty":
      return "text-danger";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "text-muted-foreground";
    }
  }
}
