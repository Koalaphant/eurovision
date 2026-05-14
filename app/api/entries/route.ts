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

async function getCurrentMembership(userId: string | undefined) {
  if (!userId) {
    return null;
  }

  return prisma.eurovisionGameMember.findUnique({
    where: { userId },
    include: { game: true },
  });
}

function isCurrentGameAdmin(membership: Awaited<ReturnType<typeof getCurrentMembership>>) {
  return Boolean(membership && membership.game.createdBy === membership.userId);
}

function isOpenCurrentGameAdmin(membership: Awaited<ReturnType<typeof getCurrentMembership>>) {
  return isCurrentGameAdmin(membership) && membership?.game.status === "open";
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  const membership = await getCurrentMembership(user?.id);

  if (!membership) {
    return NextResponse.json({
      entries: [],
      isAdmin: false,
    });
  }

  const entries = await prisma.eurovisionEntry.findMany({
    where: { gameId: membership.gameId },
    orderBy: [{ sortOrder: "asc" }, { country: "asc" }],
  });

  return NextResponse.json({
    entries,
    isAdmin: isCurrentGameAdmin(membership),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const membership = await getCurrentMembership(user?.id);

  if (!membership || !isOpenCurrentGameAdmin(membership)) {
    return NextResponse.json({ error: "Only an admin with an open game can add countries." }, { status: 403 });
  }

  const payload = (await request.json()) as EntryPayload;

  if (!payload.country || !payload.countryCode || !payload.artist || !payload.songTitle || !payload.flagUrl) {
    return NextResponse.json({ error: "Country, artist, song, and flag are required." }, { status: 400 });
  }

  const count = await prisma.eurovisionEntry.count({
    where: { gameId: membership.gameId },
  });
  const entry = await prisma.eurovisionEntry.create({
    data: {
      gameId: membership.gameId,
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
  const membership = await getCurrentMembership(user?.id);

  if (!membership || !isOpenCurrentGameAdmin(membership)) {
    return NextResponse.json({ error: "Only an admin with an open game can rearrange songs." }, { status: 403 });
  }

  const payload = (await request.json()) as ReorderPayload;

  if (!Array.isArray(payload.entryIds)) {
    return NextResponse.json({ error: "entryIds must be an array." }, { status: 400 });
  }

  const uniqueEntryIds = [...new Set(payload.entryIds)];
  const entries = await prisma.eurovisionEntry.findMany({
    where: {
      id: { in: uniqueEntryIds },
      gameId: membership.gameId,
    },
    select: { id: true },
  });

  if (entries.length !== uniqueEntryIds.length) {
    return NextResponse.json({ error: "Entry order can only include songs from this game." }, { status: 400 });
  }

  await prisma.$transaction(
    uniqueEntryIds.map((id, index) =>
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
  const membership = await getCurrentMembership(user?.id);

  if (!membership || !isOpenCurrentGameAdmin(membership)) {
    return NextResponse.json({ error: "Only an admin with an open game can delete songs." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
  }

  const deleted = await prisma.eurovisionEntry.deleteMany({
    where: { id, gameId: membership.gameId },
  });

  if (!deleted.count) {
    return NextResponse.json({ error: "Song not found in this game." }, { status: 404 });
  }

  const entries = await prisma.eurovisionEntry.findMany({
    where: { gameId: membership.gameId },
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
