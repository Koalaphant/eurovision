import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isPlaceholderKey = supabasePublishableKey === "sb_publishable_your-key";

  return NextResponse.json(
    {
      supabaseUrl: isPlaceholderKey ? "" : supabaseUrl,
      supabasePublishableKey: isPlaceholderKey ? "" : supabasePublishableKey,
      configError: isPlaceholderKey ? "Replace sb_publishable_your-key in .env with your Supabase publishable key." : "",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
