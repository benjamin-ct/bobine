import type { ReactNode } from "react";
import styles from "./LegalPage.module.css";

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export default function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
