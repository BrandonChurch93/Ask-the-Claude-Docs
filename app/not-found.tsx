import type { Metadata } from "next";
import Link from "next/link";
import styles from "./message-page.module.css";

export const metadata: Metadata = {
  title: "Not found",
};

/**
 * 404 page (P5.7). Calm register, tokens. Copy is a Tier 2 authored string
 * following §8 style (logged at P5.7).
 */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>That page isn&apos;t here.</h1>
      <p className={styles.body}>
        The page you were looking for doesn&apos;t exist.
      </p>
      <div className={styles.actions}>
        <Link className={styles.link} href="/">
          Back to Ask the Claude Docs
        </Link>
      </div>
    </main>
  );
}
