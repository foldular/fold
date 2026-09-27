"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const isDark =
      document.documentElement.dataset.theme ===
      "dark";

    setDark(isDark);
    setMounted(true);
  }, []);

function toggleTheme() {
  const nextDark = !dark;

  document.documentElement.classList.add(
    "theme-transition"
  );

  document.documentElement.dataset.theme =
    nextDark ? "dark" : "light";

  localStorage.setItem(
    "fold-theme",
    nextDark ? "dark" : "light"
  );

  setDark(nextDark);

  window.setTimeout(() => {
    document.documentElement.classList.remove(
      "theme-transition"
    );
  }, 200);
}

  if (!mounted) {
    return (
      <button
        type="button"
        className="theme-toggle"
        aria-hidden="true"
      >
        <span className="theme-toggle-icon">
          ☀
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={
        dark
          ? "Switch to light theme"
          : "Switch to dark theme"
      }
      title={
        dark
          ? "Switch to light theme"
          : "Switch to dark theme"
      }
    >
      <span className="theme-toggle-icon">
        {dark ? "☀" : "☾"}
      </span>
    </button>
  );
}