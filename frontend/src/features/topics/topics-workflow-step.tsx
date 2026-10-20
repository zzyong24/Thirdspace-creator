import styles from "./topics-workflow.module.css";

export function TopicWorkflowStep({ step, label, as = "h2" }: {
  readonly step: number;
  readonly label: string;
  readonly as?: "h2" | "span";
}) {
  const Tag = as;
  return <Tag className={styles.step}><span>{String(step).padStart(2, "0")}</span>{label}</Tag>;
}
