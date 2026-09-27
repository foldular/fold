const tools = [
  ["compress pdf", "make your PDF smaller.", "/tools/compress-pdf"],
  ["merge pdf", "combine multiple PDFs into one.", "/tools/merge-pdf"],
  ["split pdf", "separate pages from a PDF.", "/tools/split-pdf"],
  ["pdf → word", "turn your PDF into an editable Word file.", "/tools/pdf-to-word"],
  ["images → pdf", "turn your images into a single PDF.", "/tools/images-to-pdf"],
];

import ThemeToggle from "../components/ThemeToggle";
import Link from "next/link";

export default function Home() {
  return (
    <main className="home-page">
      <div className="home-shell">
      <header className="site-header">
        <Link href="/" className="logo">
          fold.
        </Link>

        <div className="header-actions">
          <ThemeToggle />

          <Link
            href="/library"
            className="library-link"
          >
            library →
          </Link>
        </div>
      </header>

        <section className="hero">
          <h1>pdf tools.</h1>

          <p className="hero-question">
            what do you want to do?
          </p>

          <div className="tool-list">
            {tools.map(([name, description, href]) => (
              <a href={href} className="tool-row" key={name}>
                <span className="tool-info">
                  <span className="tool-name">{name}</span>
                  <span className="tool-description">{description}</span>
                </span>

                <span className="arrow">→</span>
              </a>
            ))}
          </div>

          <a href="/library" className="browse-library">
            browse library →
          </a>
        </section>

        <footer className="site-footer">
          <span>files stay yours.</span>

          <div className="footer-links">
            <a href="/privacy">privacy</a>
            <a href="/terms">terms</a>
            <a href="/report">copyright</a>
          </div>
        </footer>
      </div>
    </main>
  );
}