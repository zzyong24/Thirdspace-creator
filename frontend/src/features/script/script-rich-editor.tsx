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
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import {useCreationScope,creationScopeKey,readCreationScope} from "@/lib/creation-workspace-scope";
import { useDraftChatRequest,editorCanonical } from "@/features/draft-workbench/draft-chat-request";
import { ensureScriptArtifact } from "./ensure-script-artifact";
import { htmlToSections } from "./script-editor-bridge";
import { subscribeScriptWrite } from "./script-write-signal";

type SaveStatus = "saved" | "saving" | "dirty";

export interface ScriptRichEditorProps {
  /** 编辑器初始 HTML(route 读侧从 artifact 当前版本拼出)。空 → 空文档占位。 */
  readonly initialHtml: string;
  /**
   * 分镜脚本 artifact id。保存按钮把 `getHTML()` 派生的 contentText + contentData
   * append 成新 ArtifactVersion。
   * [T-053 断点①] null + 有 projectId → 保存时 ensureScriptArtifact getOrCreate 再落库
   * (真项目首存不再假成功);null + 无 projectId(结构测试)→ 保存只走本地态。
   */
  readonly artifactId?: string | null;
  /**
   * [T-053 断点①] 项目 id —— artifactId 为 null 时保存路径用它 getOrCreate 脚本
   * artifact(消掉「显示已保存但什么都没存」的假保存)。缺省(测试)保持旧本地态行为。
   */
  readonly projectId?: string | null;
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
  // [T-054 组B] 规范 §3:工具栏按钮用 lucide 图标 + tooltip,不用文字按钮。
  readonly icon: LucideIcon;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const MARK_BUTTONS: ReadonlyArray<MarkButton> = [
  {
    id: "fmt-bold",
    format: "bold",
    label: "加粗",
    icon: Bold,
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "fmt-italic",
    format: "italic",
    label: "斜体",
    icon: Italic,
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "fmt-strike",
    format: "strike",
    label: "删除线",
    icon: Strikethrough,
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
];

interface BlockButton {
  readonly id: string;
  // T-024 ③:data-format 反映按钮真实功能 —— heading 按钮 toggle 的是标题块,不是加粗,
  // 故如实标 "heading"(原先写死 "bold" 是迁就测试的假契约,已改真 + 同步改测试断言)。
  readonly format: "heading";
  readonly label: string;
  readonly icon: LucideIcon;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const HEADING_BUTTONS: ReadonlyArray<BlockButton> = [
  {
    id: "fmt-h1",
    format: "heading",
    label: "标题 1",
    icon: Heading1,
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "fmt-h2",
    format: "heading",
    label: "标题 2",
    icon: Heading2,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "fmt-h3",
    format: "heading",
    label: "标题 3",
    icon: Heading3,
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
];

interface InsertButton {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const INSERT_BUTTONS: ReadonlyArray<InsertButton> = [
  {
    id: "tool-list-bullet",
    label: "无序列表",
    icon: List,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "tool-list-ordered",
    label: "有序列表",
    icon: ListOrdered,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "tool-quote",
    label: "引用",
    icon: Quote,
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
  projectId = null,
  onEditorReady,
}: ScriptRichEditorProps) {
  const router = useRouter();
  const creationScope=useCreationScope(),scriptScopeKey=creationScopeKey(creationScope);
  // [T-108 v2] 稿面对话请求 context —— 编辑器把 flushSave 注册进去,让审核/盲预测按钮
  // 自动发前先 flush 保存最新内容(审最新版,非 DB 旧版)。稿面外(无 Provider)返回 no-op。
  const { registerFlush,registerScript } = useDraftChatRequest();
  const artifactIdRef=React.useRef<string|null>(artifactId);
  const generationRef=React.useRef(0);
  const savedVersionRef=React.useRef<string|null>(null);
  const [pending, startTransition] = React.useTransition();
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved");
  const [wordCount, setWordCount] = React.useState(0);
  // saveStatus 的 ref 镜像 —— flush 闭包读最新态(dirty 才真存,saved 则 no-op)。
  const saveStatusRef = React.useRef<SaveStatus>("saved");
  // eslint-disable-next-line react-hooks/refs -- latest-value ref 供事件/卸载回调读取，不参与渲染
  saveStatusRef.current = saveStatus;
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
      generationRef.current++;
      saveStatusRef.current = "dirty";
      setSaveStatus("dirty");
      setWordCount(ed.getText().length);
    },
    onSelectionUpdate: () => forceTick(),
    onTransaction: () => forceTick(),
  });

  // T-024 ②:保存在途窄竞态 —— 保存(patch artifact + router.refresh)在途时,外部 props
  // (refresh 后重读的 initialHtml)会同步进来。若此刻用户还在打字,setContent 会**覆盖正在打的字**
  // (refresh 带回的是刚存的旧内容,不含用户在途新键入)。抑制机制两道信号:
  //   ① savePendingRef —— 保存事务在途期间,吞掉外部 echo(不 setContent)。
  //   ② lastSavedHtmlRef —— 记刚存的 html;router.refresh 的 props 回流是**异步**的,常晚于
  //      事务的 finally(pending 已解除),故仅靠 ① 会漏掉这次 echo。此 ref 让「回流值 == 刚存值」
  //      的 echo 即便在 pending 解除后也被识别并吞掉,不覆盖用户在途新键入(timing 无关)。
  // 注意:只抑制这两类在途/回声覆盖,**不抑制首次 initialHtml 加载**(首帧两者皆空/false)。
  const savePendingRef = React.useRef(false);
  const lastSavedHtmlRef = React.useRef<string | null>(null);

  // 把外部 initialHtml(router.refresh 后读到的新版本)同步进 TipTap —— editor 是命令式外部
  // 系统,这正是 effect 该做的「向外部系统推最新 state」。用 ref 记住已应用的值,仅在真正变化时
  // setContent + 重置派生 UI(回「已保存」、刷字数),避免每次渲染都跑、也避免打断本地编辑。
  const appliedHtmlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!editor) return;
    const next = initialHtml || "<p></p>";
    if (appliedHtmlRef.current === next) return;
    // 保存在途,或这是刚存内容的 refresh echo:吞掉(标记已消费但不 setContent),防丢在途键入。
    // 仅当编辑器当前内容已与 echo 不同(用户在途改过)才需保护;相同则放行照常应用。
    const isSaveEcho =
      lastSavedHtmlRef.current === next && editor.getHTML() !== next;
    if (savePendingRef.current || isSaveEcho) {
      appliedHtmlRef.current = next;
      return;
    }
    appliedHtmlRef.current = next;
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    // 已应用一个新的外部值 → 清掉 echo 守卫,让「保存后又被外部合法带回同一内容」(如版本回滚
    // 到刚存的版本)不被误吞;echo 守卫只覆盖紧邻保存的那次回流窗口。
    lastSavedHtmlRef.current = null;
    // setContent(emitUpdate:false) 不触发 onUpdate,故在此显式同步派生态(刚载入 = 已保存)。
    setSaveStatus("saved");
    setWordCount(editor.getText().length);
  }, [initialHtml, editor]);

  // 把 editor 句柄交给可选回调(测试用;生产不传)。仅在实例创建后触发一次。
  React.useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // [T-268] 对话整稿「采纳写入稿面」的**局部刷新**:采纳后卡片发 SCRIPT_WRITE 信号带新整稿 HTML,
  // 这里直接 setContent 灌进编辑器(不 router.refresh 整页重挂 = 消掉「写入稿面卡顿」)。稿面只有
  // 一个编辑器,故 artifactId 有则校验、无(卡片默认 null)则直接应用。setContent 后同步派生态:
  // 标「已保存」(采纳已 append 新版本,editor 内容 == DB 当前版本)+ 刷字数 + 记 appliedHtmlRef
  // (避免随后的 initialHtml 回流被误判为外部新值再覆盖一次)。
  React.useEffect(() => {
    if (!editor) return;
    return subscribeScriptWrite((detail) => {
      if (
        detail.artifactId &&
        artifactId &&
        detail.artifactId !== artifactId
      ) {
        return; // 明确指向了别的 artifact(理论不会发生:稿面单编辑器)→ 不误灌。
      }
      const next = detail.html || "<p></p>";
      appliedHtmlRef.current = next;
      lastSavedHtmlRef.current = null;
      editor.commands.setContent(next, { emitUpdate: false });
      setSaveStatus("saved");
      setWordCount(editor.getText().length);
    });
  }, [editor, artifactId]);

  // 保存核心(awaitable)—— 把编辑器当前 html/text append 成新 ArtifactVersion,resolve 后
  // DB = 最新。抽出成 promise(原 handleSave 只 startTransition 无从 await),供:
  //   ① 「保存」按钮(handleSave 包一层 transition 调它);
  //   ② [T-108 v2] flushSave(审核/盲预测自动发前 await 它,确保审最新版)。
  // 无 artifactId 且无 projectId(结构测试)→ 仅本地翻「已保存」,不打契约(与原行为一致)。
  const pendingSaveRef = React.useRef<Promise<void> | null>(null);
  const saveIntentRef=React.useRef<{targetId:string;html:string;contentText:string;contentData:{html:string;sections:ReturnType<typeof htmlToSections>}}|null>(null);
  async function recoverUnknownScript(){const intent=saveIntentRef.current;if(!intent)return null;const artifact=await client.getArtifact({params:{artifactId:intent.targetId},query:undefined,body:undefined});let exact:{id:string;artifactId:string;contentText:string;contentData:Record<string,unknown>}|undefined;for(let page=1;page<=20&&!exact;page++){const response=await client.listArtifactVersions({params:{artifactId:intent.targetId},query:{page,pageSize:100},body:undefined});const rows=(Array.isArray(response)?response:[]) as Array<{id:string;artifactId:string;contentText:string;contentData:Record<string,unknown>}>;exact=rows.find(row=>row.id===artifact.currentVersionId);if(rows.length<100)break;}if(!exact||exact.contentText!==intent.contentText||editorCanonical(exact.contentData)!==editorCanonical(intent.contentData))throw Error("原脚本保存结果尚未确认，请保留当前稿并恢复原回执，未重复追加版本。");savedVersionRef.current=exact.id;saveIntentRef.current=null;return intent;}

  const performSave = React.useCallback(async (): Promise<void> => {
    if (pendingSaveRef.current) return pendingSaveRef.current;
    if (!editor) throw new Error("编辑器尚未准备好");
    const saving = (async () => {
      const html = editor.getHTML();
      const contentText = editor.getText();
      if (!artifactId && !projectId) {
        setSaveStatus("saved");
        return;
      }
      if(saveIntentRef.current){const recovered=await recoverUnknownScript();if(recovered&&editor.getHTML()!==recovered.html)throw Error("原保存已确认，期间的新输入保留，请再次保存当前修改。");saveStatusRef.current="saved";setSaveStatus("saved");return;}
      const sections = htmlToSections(html);
      setSaveStatus("saving");
      // T-024 ②:进入保存在途态 + 记刚存 html —— 抑制此期间(及之后异步回流的)refresh echo
      // 覆盖用户在途键入。lastSavedHtmlRef 让 timing 无关:回流值 == 刚存 html 即认作 echo。
      savePendingRef.current = true;
      lastSavedHtmlRef.current = html;
      try {
        // [T-053 断点①] 真项目还没有脚本 artifact → 首存时 getOrCreate 再落库
        // (消掉「显示已保存但什么都没存」的假保存)。
        let targetId = artifactIdRef.current;
        if (!targetId && projectId) {
          const ensured = await ensureScriptArtifact(projectId, null);
          targetId = ensured.artifactId as string;
          artifactIdRef.current=targetId;
        }
        if (!targetId) throw new Error("no script artifact target");
        saveIntentRef.current={targetId,html,contentText,contentData:{html,sections}};
        const saved=await client.createArtifactVersion({
          params: { artifactId: targetId },
          query: undefined,
          body: {
            contentText,
            // html = 富文本真值(忠实往返);sections = 派生(大纲/金句读侧 + AI 兼容)。
            contentData: { html, sections },
            changeSummary: "编辑脚本",
          },
        });
        savedVersionRef.current=saved.id;saveIntentRef.current=null;
        if (editor.getHTML() !== html) throw new Error("保存期间稿件有新修改，请重试诊断。");
        saveStatusRef.current = "saved";
        setSaveStatus("saved");
        router.refresh();
      } catch (error) {
        // 失败保留 dirty,用户可重试。
        saveStatusRef.current = "dirty";
        setSaveStatus("dirty");
        throw error;
      } finally {
        // 保存动作结束(成功/失败)→ 解除在途抑制。router.refresh 的 props 回流是下一轮
        // effect,此时 pending 已解除;若回流值与当前编辑器不同(用户在途改过 → getHTML 已变),
        // 那正是「刚存的旧值」,会与用户在途新值不一致 —— 但 appliedHtmlRef 在途已被标记消费,
        // 故不会再 setContent 覆盖,保住在途编辑。之后真正的新外部值(如版本回滚)仍能正常应用。
        savePendingRef.current = false;
      }
    })();
    pendingSaveRef.current = saving;
    try {
      await saving;
    } finally {
      pendingSaveRef.current = null;
    }
  }, [artifactId, projectId, editor, router]);

  const prepareScriptRef=React.useRef<()=>Promise<{kind:"project_script";id:string;versionId:string}>>(async()=>{throw Error("脚本尚未准备好");});
  React.useLayoutEffect(()=>{artifactIdRef.current=artifactId??artifactIdRef.current;prepareScriptRef.current=async()=>{
    if(!editor||!projectId)throw Error("请先打开项目脚本。");
    const frozenScope=scriptScopeKey;const check=()=>{if(creationScopeKey(readCreationScope())!==frozenScope)throw Error("工作区已切换，原脚本保存回执保留。");};check();
    const html=editor.getHTML(),text=editor.getText();
    if(!text.trim())throw Error("请先填写并确认脚本。");
    if(pendingSaveRef.current)await pendingSaveRef.current;
    if(!artifactIdRef.current||saveStatusRef.current!=="saved"||!savedVersionRef.current)await performSave();
    check();const id=artifactIdRef.current;if(!id)throw Error("脚本尚未保存。");
    const artifact=await client.getArtifact({params:{artifactId:id},query:undefined,body:undefined});
    if(artifact.projectId!==projectId||artifact.id!==id)throw Error("脚本保存目标不属于当前项目。");
    const versionId=savedVersionRef.current??artifact.currentVersionId;
    if(artifact.currentVersionId!==versionId)throw Error("脚本已被并发更新，请核对后重试。");
    let exact:{id:string;artifactId:string;contentText:string;contentData:Record<string,unknown>}|undefined;
    for(let page=1;page<=20&&!exact;page++){const response=await client.listArtifactVersions({params:{artifactId:id},query:{page,pageSize:100},body:undefined});const rows=(Array.isArray(response)?response:[]) as Array<{id:string;artifactId:string;contentText:string;contentData:Record<string,unknown>}>;exact=rows.find(row=>row.id===versionId);if(rows.length<100)break;}
    if(!exact||exact.artifactId!==id||exact.contentText!==text||exact.contentData.html!==html)throw Error("当前脚本与保存版本读回不一致，请先保存并核对。");
    check();if(editor.getHTML()!==html||saveStatusRef.current!=="saved")throw Error("脚本在保存期间已改变，本次未生成。");
    return {kind:"project_script",id,versionId};
  };},[artifactId,editor,projectId,performSave,scriptScopeKey]);
  React.useEffect(()=>registerScript({readState:()=>({generation:generationRef.current}),prepareForCreation:()=>prepareScriptRef.current()}),[registerScript,editor,projectId,scriptScopeKey]);
  const handleSave = React.useCallback(() => {
    startTransition(() => {
      void performSave().catch(() => {});
    });
  }, [performSave]);

  // [T-108 v2] 注册 flushSave 到稿面对话请求 context:审核/盲预测按钮自动发前 `await flushSave()`。
  // 等待在途保存；有未保存修改则落库，失败必须传播给严格诊断入口。
  // 卸载注销(传 null),避免旧编辑器闭包泄漏。
  React.useEffect(() => {
    registerFlush(async () => {
      if (pendingSaveRef.current) await pendingSaveRef.current;
      if (saveStatusRef.current !== "dirty") return;
      await performSave();
    });
    return () => registerFlush(null);
  }, [registerFlush, performSave]);

  // [T-247] 设置「偏好 · 自动保存」的真实消费方:开启时编辑器失焦(blur)自动
  // performSave 未保存的修改(dirty 才存,与手动保存/flush 同一条落库链路)。
  // 偏好挂载后读一次(settings.preferences.get);读失败/单测 mock 未提供该 op →
  // 保持关闭(只手动保存),诚实降级。用 ref 而非 state:blur 回调读最新值,不重渲。
  const autosaveEnabledRef = React.useRef(false);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const pref = (await client.getPreferences({
          params: undefined,
          query: undefined,
          body: undefined,
        })) as { autosaveEnabled?: boolean };
        if (alive) autosaveEnabledRef.current = pref?.autosaveEnabled === true;
      } catch {
        // 读不到偏好 → 不自动保存(与既有手动保存行为一致)。
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  React.useEffect(() => {
    if (!editor) return;
    const onBlur = () => {
      if (!autosaveEnabledRef.current) return;
      if (saveStatusRef.current !== "dirty") return; // 无未保存修改 → no-op。
      void performSave().catch(() => {});
    };
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor, performSave]);

  // [T-054 组B] 卡头去掉「主脚本 / TipTap 富文本编辑器…」的实现描述文案(规范 §2:库名/
  // 机制名出现在可见文案 = 泄漏)。用户视角的小标题「口播脚本 + 副行」由稿面页区头统一承载
  // (见 draft-workbench-page),编辑器自身只保留工具栏/正文/状态栏,不再双头。
  return (
    <div
      data-slot="rich-text-editor"
      className="rounded-card border border-border bg-surface p-4"
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
            icon={button.icon}
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
            icon={button.icon}
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
            icon={button.icon}
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
// [T-054 组B] 规范 §3:文字按钮 → lucide 图标 + title tooltip(aria-label 保住可访问名),
// 激活态 brand 底色,尺寸紧凑(size-7 方块)。
function ToolbarCommandButton({
  editor,
  id,
  format,
  label,
  icon: Icon,
  active,
  onRun,
}: {
  editor: Editor | null;
  id: string;
  // mark 按钮(bold/italic/strike)+ heading 按钮(T-024 ③:如实标 "heading")共用此壳。
  format: "bold" | "italic" | "strike" | "heading";
  label: string;
  icon: LucideIcon;
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
      aria-label={label}
      title={label}
      disabled={!editor}
      onMouseDown={(e) => {
        // 防止按钮抢焦点导致选区丢失(富文本工具栏常规处理)。
        e.preventDefault();
      }}
      onClick={onRun}
      className="inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-surface text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand disabled:opacity-40"
      data-pressed={active}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

function ToolbarGlyphButton({
  id,
  label,
  icon: Icon,
  active,
  onRun,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-glyph"
      data-glyph-id={id}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className="inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-surface text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
      data-pressed={active}
    >
      <Icon className="size-4" aria-hidden="true" />
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
