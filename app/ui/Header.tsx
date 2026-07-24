import styles from "./Header.module.css";

/**
 * Header (ui-ux-spec §2). Not sticky - it scrolls away; the dock carries the
 * persistent input. Five elements in exact order (UX-02): wordmark · eval scores ·
 * GitHub · divider · history · retrieval-details toggle. The toggle's label always
 * states the action it will perform. History + the pin toggle are interactive and
 * land at P5.5 (session history, retrieval rail); here they are the static
 * structure so the first-visit landing is a twin of the mock - history disabled
 * (it enables on the first ask), the toggle inert until P5.5 wires `data-pin`.
 */
export function Header() {
  return (
    <header className={styles.top}>
      <div className={styles.inner}>
        <span className={styles.wordmark}>Ask the Claude Docs</span>
        <nav className={styles.nav} aria-label="Site">
          <a href="/evals" className={styles.link}>
            eval scores
          </a>
          <a
            href="https://github.com/BrandonChurch93/Ask-the-Claude-Docs"
            target="_blank"
            rel="noopener"
            className={styles.link}
          >
            GitHub
          </a>
          <span className={styles.divider} aria-hidden="true" />
          <button className={styles.history} disabled>
            history
          </button>
          <button className={styles.pin} aria-pressed="false" disabled>
            Show retrieval details
          </button>
        </nav>
      </div>
    </header>
  );
}
