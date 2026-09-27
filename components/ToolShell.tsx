import type { ReactNode } from "react";

type ToolShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ToolShell({ title, description, children }: ToolShellProps) {
  return (
    <main className="page">
      <div className="shell">
        <header className="site-header">
          <a href="/" className="logo">fold.</a>
          <a href="/library" className="library-link">library →</a>
        </header>

        <section className="tool-page">
          <a href="/" className="back-link">← all tools</a>

          <div className="tool-heading">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          <div className="tool-workspace">{children}</div>
        </section>
      </div>
    </main>
  );
}
