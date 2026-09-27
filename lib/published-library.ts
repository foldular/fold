export type PublishedLibraryDocument = {
  slug: string;
  title: string;
  category: string;
  pages: number;
  size: string;
  description: string;
  added: string;
  fileName: string;
  publishedAt: number;
};

const META_KEY = "fold-published-library";
const DB_NAME = "fold-library";
const STORE_NAME = "files";
const DB_VERSION = 1;

export function getPublishedDocuments(): PublishedLibraryDocument[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed as PublishedLibraryDocument[];
  } catch {
    return [];
  }
}

function savePublishedDocuments(
  documents: PublishedLibraryDocument[]
) {
  window.localStorage.setItem(
    META_KEY,
    JSON.stringify(documents)
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePublishedDocument(
  document: PublishedLibraryDocument,
  file: Blob
) {
  if (typeof window === "undefined") {
    throw new Error("Publishing is only available in the browser.");
  }

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction.objectStore(STORE_NAME).put(
      file,
      document.slug
    );

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();

  const existing = getPublishedDocuments().filter(
    (item) => item.slug !== document.slug
  );

  savePublishedDocuments([
    document,
    ...existing,
  ]);
}

export async function getPublishedFile(
  slug: string
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;

  const db = await openDatabase();

  const file = await new Promise<Blob | null>(
    (resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const request = transaction
        .objectStore(STORE_NAME)
        .get(slug);

      request.onsuccess = () => {
        resolve((request.result as Blob | undefined) ?? null);
      };

      request.onerror = () => reject(request.error);
    }
  );

  db.close();
  return file;
}

export async function getPublishedDocument(
  slug: string
): Promise<PublishedLibraryDocument | null> {
  return (
    getPublishedDocuments().find(
      (document) => document.slug === slug
    ) ?? null
  );
}

export function createLibrarySlug(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "document";

  return `${base}-${Date.now().toString(36)}`;
}
