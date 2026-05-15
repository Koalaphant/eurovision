import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const superAdminEmail = "andrew.wardjones@icloud.com";
const resetPassword = "eurovision";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function requireSuperAdmin(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (user?.email?.toLowerCase() !== superAdminEmail) {
    return null;
  }

  return user;
}

export async function GET(request: Request) {
  const user = await requireSuperAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: data.users.map((authUser) => ({
      id: authUser.id,
      email: authUser.email ?? "",
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at,
      isCurrentUser: authUser.id === user.id,
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await requireSuperAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const payload = (await request.json()) as { userId?: string };

  if (!payload.userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(payload.userId, {
    password: resetPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireSuperAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot delete your own super admin account here." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.eurovisionGame.deleteMany({
      where: { createdBy: userId },
    }),
    prisma.eurovisionGameRanking.deleteMany({
      where: { userId },
    }),
    prisma.eurovisionGameMember.deleteMany({
      where: { userId },
    }),
    prisma.eurovisionRanking.deleteMany({
      where: { userId },
    }),
  ]);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
