# Fold v1.3

## Included
- Compress PDF
- Merge PDF
- Split PDF
- Images → PDF
- Supabase-backed library
- Moderated publishing (`pending` → `published` / `rejected`)
- Reports and admin moderation at `/admin`
- Database-backed search/category filtering + pagination
- Per-document SEO metadata
- `sitemap.xml` and `robots.txt`
- Basic server-side publish/report rate limiting
- PDF magic-byte + `pdf-lib` validation
- Upload size and metadata limits

## Setup
1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL Editor.
3. Create `.env.local` from `.env.example`.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and `FOLD_ADMIN_TOKEN`.
5. Run `npm install` then `npm run dev`.

## Moderation
New submissions are `pending` and hidden from the public Library until approved. Open `/admin`, enter the server-side `FOLD_ADMIN_TOKEN`, then approve/reject/remove submissions. Reports are stored in `library_reports`.

## Security note
The service-role key and admin token are server-only secrets. The included rate limiter is in-memory and suitable for a single-instance prototype; replace it with a distributed limiter before multi-instance production. PDF structure is validated with `pdf-lib`, but this is not a full malware scanner.
