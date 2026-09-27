export type LibraryDocument = {
  slug: string;
  title: string;
  category: string;
  pages: number;
  size: string;
  description: string;
  added: string;
  createdAt: string;
};

export const libraryDocuments: LibraryDocument[] = [
  {
    slug: "sample-study-notes",
    title: "Sample Study Notes",
    category: "Education",
    pages: 12,
    size: "2.4 MB",
    description: "A sample set of study notes for the Fold library preview.",
    added: "2 days ago",
    createdAt: "2026-09-25T09:00:00+05:30",
  },
  {
    slug: "sample-business-template",
    title: "Sample Business Template",
    category: "Business",
    pages: 8,
    size: "1.1 MB",
    description: "A clean sample business document template.",
    added: "4 days ago",
    createdAt: "2026-09-23T09:00:00+05:30",
  },
  {
    slug: "sample-government-form",
    title: "Sample Government Form",
    category: "Government",
    pages: 6,
    size: "860 KB",
    description: "A sample government-style form for the library preview.",
    added: "5 days ago",
    createdAt: "2026-09-22T09:00:00+05:30",
  },
  {
    slug: "sample-project-brief",
    title: "Sample Project Brief",
    category: "Documents",
    pages: 16,
    size: "3.2 MB",
    description: "A sample project brief showing the document detail experience.",
    added: "1 week ago",
    createdAt: "2026-09-20T09:00:00+05:30",
  },
  {
    slug: "sample-invoice-template",
    title: "Sample Invoice Template",
    category: "Business",
    pages: 3,
    size: "420 KB",
    description: "A simple invoice template for the library preview.",
    added: "1 week ago",
    createdAt: "2026-09-19T09:00:00+05:30",
  },
  {
    slug: "sample-reading-pack",
    title: "Sample Reading Pack",
    category: "Education",
    pages: 24,
    size: "4.8 MB",
    description: "A sample multi-page reading pack.",
    added: "2 weeks ago",
    createdAt: "2026-09-13T09:00:00+05:30",
  },
];

export const libraryCategories = [
  "Education",
  "Business",
  "Documents",
  "Government",
  "Other",
];

export function getLibraryDocument(slug: string) {
  return libraryDocuments.find(
    (document) => document.slug === slug
  );
}
