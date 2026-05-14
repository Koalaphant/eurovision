import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

type EntryPayload = {
  country: string;
  countryCode: string;
  artist: string;
  songTitle: string;
  flagUrl: string;
};

type ReorderPayload = {
  entryIds: string[];
};

async function isGameAdmin(userId: string | undefined, requireOpen = false) {
  if (!userId) {
    return false;
  }

  const game = await prisma.eurovisionGame.findFirst({
    where: { createdBy: userId, ...(requireOpen ? { status: "open" } : {}) },
    select: { id: true },
  });

  return Boolean(game);
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  const entries = await prisma.eurovisionEntry.findMany({
    orderBy: [{ sortOrder: "asc" }, { country: "asc" }],
  });

  return NextResponse.json({
    entries,
    isAdmin: await isGameAdmin(user?.id),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!(await isGameAdmin(user?.id, true))) {
    return NextResponse.json({ error: "Only an admin with an open game can add countries." }, { status: 403 });
  }

  const payload = (await request.json()) as EntryPayload;

  if (!payload.country || !payload.countryCode || !payload.artist || !payload.songTitle || !payload.flagUrl) {
    return NextResponse.json({ error: "Country, artist, song, and flag are required." }, { status: 400 });
  }

  const count = await prisma.eurovisionEntry.count();
  const entry = await prisma.eurovisionEntry.create({
    data: {
      country: payload.country.trim(),
      countryCode: payload.countryCode.toUpperCase(),
      artist: payload.artist.trim(),
      songTitle: payload.songTitle.trim(),
      flagUrl: payload.flagUrl,
      sortOrder: count,
    },
  });

  return NextResponse.json({ entry });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!(await isGameAdmin(user?.id, true))) {
    return NextResponse.json({ error: "Only an admin with an open game can rearrange songs." }, { status: 403 });
  }

  const payload = (await request.json()) as ReorderPayload;

  if (!Array.isArray(payload.entryIds)) {
    return NextResponse.json({ error: "entryIds must be an array." }, { status: 400 });
  }

  await prisma.$transaction(
    payload.entryIds.map((id, index) =>
      prisma.eurovisionEntry.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!(await isGameAdmin(user?.id, true))) {
    return NextResponse.json({ error: "Only an admin with an open game can delete songs." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
  }

  await prisma.eurovisionEntry.delete({
    where: { id },
  });

  const entries = await prisma.eurovisionEntry.findMany({
    orderBy: [{ sortOrder: "asc" }, { country: "asc" }],
  });

  await prisma.$transaction(
    entries.map((entry, index) =>
      prisma.eurovisionEntry.update({
        where: { id: entry.id },
        data: { sortOrder: index },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
