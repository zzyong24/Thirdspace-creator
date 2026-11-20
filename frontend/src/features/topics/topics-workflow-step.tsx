import styles from "./topics-workflow.module.css";

export function TopicWorkflowStep({ label, as = "h2" }: {
  readonly label: string;
  readonly as?: "h2" | "span";
}) {
  const Tag = as;
  return <Tag className={styles.step}>{label}</Tag>;
}
