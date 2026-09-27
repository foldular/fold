"use client";

import { useEffect } from "react";

export default function ThemeProvider() {
  useEffect(() => {
    const saved =
      localStorage.getItem("fold-theme");

    const prefersDark =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

    const theme =
      saved ||
      (prefersDark ? "dark" : "light");

    document.documentElement.dataset.theme =
      theme;
  }, []);

  return null;
}