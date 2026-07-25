"use client";

import Link from "next/link";
import styles from "./message-page.module.css";

/**
 * App error boundary (P5.7). Renders in the calm register (tokens), not an alarm.
 * Copy is a Tier 2 authored string following §8 style (logged at P5.7).
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Something went wrong loading this page.</h1>
      <p className={styles.body}>
        The eval scores and source links still work. Try again, or head back to
        the start.
      </p>
      <div className={styles.actions}>
        <button className={styles.link} onClick={reset}>
          Try again
        </button>
        <Link className={styles.link} href="/">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
