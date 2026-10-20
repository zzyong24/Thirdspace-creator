"use client";

import { ArrowRight, Compass, ShieldCheck } from "lucide-react";
import styles from "./positioning-conversation.module.css";

const STARTERS = [
  { title: "继续深入当前账号", description: "沿着已有内容，找到更鲜明的方向", prompt: "我想继续深入当前账号，先聊目前的内容和瓶颈。" },
  { title: "调整到一个新方向", description: "保留自己的积累，探索新的可能", prompt: "我想调整到新方向，先聊想改变什么、保留哪些积累。" },
  { title: "完全从零开始", description: "从你的经历、优势和创作目标聊起", prompt: "我想完全从零开始定位，先聊我的经历和优势。" },
] as const;

export function PositioningConversationGuide() {
  return (
    <aside className={styles.guide} aria-label="定位对话说明">
      <div className={styles.guideIntro}>
        <span className={styles.eyebrow}><Compass size={16} aria-hidden="true" /> 账号定位</span>
        <h3>一步步聊清楚</h3>
        <p>不必准备完整答案。</p>
      </div>
      <ol className={styles.guideSteps} aria-label="定位对话的三个步骤">
        <li><span aria-hidden="true">01</span><div><strong>说现状</strong><p>聊聊经历、优势和目标。</p></div></li>
        <li><span aria-hidden="true">02</span><div><strong>补关键点</strong><p>每次只补一个关键信息。</p></div></li>
        <li><span aria-hidden="true">03</span><div><strong>看候选</strong><p>随时说“先给我一版”。</p></div></li>
      </ol>
      <p className={styles.assurance}><ShieldCheck size={16} aria-hidden="true" /><span>未采纳前，不会修改当前定位母版。</span></p>
    </aside>
  );
}

export function PositioningConversationStart({ onPick, disabled }: {
  readonly onPick: (prompt: string) => void;
  readonly disabled: boolean;
}) {
  return (
    <section className={styles.start} aria-labelledby="positioning-start-title" data-slot="positioning-conversation-start">
      <span className={styles.eyebrow}>从这里开始</span>
      <h3 id="positioning-start-title">这次，你想从哪里出发？</h3>
      <p>选起点或直接输入，确认后再发送。</p>
      <div className={styles.starters}>
        {STARTERS.map((item) => (
          <button key={item.title} type="button" disabled={disabled} onClick={() => onPick(item.prompt)}>
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
