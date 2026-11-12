# Blog Post Generator

A blog post generator built with [Next.js](https://nextjs.org/), TypeScript, Tailwind CSS, and the Groq API.

## Setup

1. Create a Supabase project and open **Project Settings → API**.
2. Copy `.env.example` to `.env.local`.
3. Set `GROQ_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
4. In the Supabase SQL Editor, run [`supabase/generation_quota.sql`](./supabase/generation_quota.sql).
5. In **Authentication → Providers**, enable Email. Under **URL Configuration**, set the Site URL and add `http://localhost:3000/**` plus your production domain as redirect URLs.
6. Install dependencies with `npm install` and start the app with `npm run dev`.

The Supabase publishable key is intended for browser use; never expose a Supabase secret or service-role key. The Groq key remains server-only. Configure all three environment variables in your hosting provider before deployment.

For production, also add the deployed domain to Supabase's allowed redirect URLs and configure the same environment variables in the hosting provider's secret settings, then redeploy.

## Article generation

Topics must be 3–500 characters. Drafts are limited to about 150–220 words and
450 generated tokens, use Groq's hosted `qwen/qwen3.8-27b` model, and do not
include an author byline or signature. Requests are sent to Groq using its
official SDK.

Users must sign in to generate drafts. The SQL function enforces a limit of 5
generation attempts per user per UTC day. To change it, update
`DAILY_GENERATION_LIMIT` in `pages/api/generate.ts`. Attempts are counted before
calling Groq, so failed provider requests also count toward the daily limit.

If generation returns a quota-related `503`, run
[`supabase/generation_quota.sql`](./supabase/generation_quota.sql) in the SQL
Editor for the same Supabase project configured in `.env.local`. The script
reloads the PostgREST schema cache after creating/updating the quota function.
If the problem continues, check the Next.js server terminal for the Supabase
RPC error code and message.
