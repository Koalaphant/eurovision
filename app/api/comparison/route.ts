import { NextResponse } from "next/server";
import { criteria, isEntryComplete, type Ratings } from "@/app/ranking-shared";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

function getTotal(entryId: string, ratings: Ratings) {
  return criteria.reduce((total, criterion) => total + (ratings[entryId]?.[criterion.id] ?? 0), 0);
}

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.eurovisionGameMember.findUnique({
    where: { userId },
    include: { game: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Join a game before viewing comparisons." }, { status: 400 });
  }

  const [entries, currentRanking, rankings] = await Promise.all([
    prisma.eurovisionEntry.findMany({
      where: { gameId: membership.gameId },
      orderBy: [{ sortOrder: "asc" }, { country: "asc" }],
    }),
    prisma.eurovisionGameRanking.findUnique({ where: { userId_gameId: { userId, gameId: membership.gameId } } }),
    prisma.eurovisionGameRanking.findMany({
      where: { gameId: membership.gameId },
      orderBy: [{ displayName: "asc" }, { updatedAt: "asc" }],
    }),
  ]);

  const currentRatings = (currentRanking?.ratings ?? {}) as Ratings;

  return NextResponse.json({
    game: {
      id: membership.game.id,
      code: membership.game.code,
      status: membership.game.status,
    },
    rounds: entries.map((entry, index) => {
      const unlocked = isEntryComplete(entry.id, currentRatings);

      return {
        entry: {
          ...entry,
          order: index + 1,
        },
        unlocked,
        comparisons: unlocked
          ? rankings
              .map((ranking) => {
                const ratings = ranking.ratings as Ratings;

                if (!isEntryComplete(entry.id, ratings)) {
                  return null;
                }

                return {
                  userId: ranking.userId,
                  displayName: ranking.displayName || "Unnamed player",
                  scores: ratings[entry.id],
                  total: getTotal(entry.id, ratings),
                  isCurrentUser: ranking.userId === userId,
                };
              })
              .filter(Boolean)
              .sort((a, b) => (b?.total ?? 0) - (a?.total ?? 0))
          : [],
      };
    }),
  });
}
