import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

type RankingPayload = {
  displayName: string;
  ratings: Prisma.InputJsonValue;
};

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const membership = await prisma.eurovisionGameMember.findUnique({
      where: { userId },
      include: { game: true },
    });
    const ranking = membership
      ? await prisma.eurovisionGameRanking.findUnique({
          where: { userId_gameId: { userId, gameId: membership.gameId } },
        })
      : null;

    return NextResponse.json({
      ranking: ranking
        ? {
          displayName: ranking.displayName,
          ratings: ranking.ratings,
        }
      : null,
      game: membership ? { id: membership.game.id, code: membership.game.code, status: membership.game.status } : null,
    });
  } catch {
    return NextResponse.json({ error: "Prisma is not connected. Check DATABASE_URL and run npm run prisma:push." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as RankingPayload;

  try {
    const membership = await prisma.eurovisionGameMember.findUnique({
      where: { userId },
      include: { game: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Join a game with an invite code before saving scores." }, { status: 400 });
    }

    if (membership.game.status !== "open") {
      return NextResponse.json({ error: "This game is closed. Scores can no longer be edited." }, { status: 400 });
    }

    await prisma.eurovisionGameRanking.upsert({
      where: { userId_gameId: { userId, gameId: membership.gameId } },
      create: {
        userId,
        gameId: membership.gameId,
        displayName: payload.displayName,
        ratings: payload.ratings,
      },
      update: {
        displayName: payload.displayName,
        ratings: payload.ratings,
      },
    });
  } catch {
    return NextResponse.json({ error: "Prisma is not connected. Check DATABASE_URL and run npm run prisma:push." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
