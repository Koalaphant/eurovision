import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ game: null, isAdmin: false });
  }

  const membership = await prisma.eurovisionGameMember.findUnique({
    where: { userId: user.id },
    include: { game: true },
  });

  return NextResponse.json({
    game: membership
      ? {
          id: membership.game.id,
          code: membership.game.code,
          status: membership.game.status,
          isAdmin: membership.game.createdBy === user.id,
        }
      : null,
    isAdmin: membership?.game.createdBy === user.id,
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Sign in before creating a game code." }, { status: 401 });
  }

  const payload = (await request.json()) as { code?: string };
  const code = normalizeCode(payload.code ?? "");

  if (code.length < 4) {
    return NextResponse.json({ error: "Code must be at least 4 characters." }, { status: 400 });
  }

  try {
    const currentMembership = await prisma.eurovisionGameMember.findUnique({
      where: { userId: user.id },
      include: { game: true },
    });

    if (currentMembership?.game.status === "open" && currentMembership.game.createdBy === user.id) {
      return NextResponse.json({ error: "Close your current game before creating a new one." }, { status: 400 });
    }

    const game = await prisma.$transaction(async (tx) => {
      const createdGame = await tx.eurovisionGame.create({
        data: {
          code,
          createdBy: user.id,
        },
      });

      await tx.eurovisionGameMember.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email: user.email ?? "",
          gameId: createdGame.id,
        },
        update: {
          email: user.email ?? "",
          gameId: createdGame.id,
        },
      });

      await tx.eurovisionGameRanking.upsert({
        where: { userId_gameId: { userId: user.id, gameId: createdGame.id } },
        create: {
          userId: user.id,
          gameId: createdGame.id,
          displayName: user.email ?? "",
          ratings: {},
        },
        update: {
          ratings: {},
        },
      });

      return createdGame;
    });

    return NextResponse.json({ game: { id: game.id, code: game.code, status: game.status, isAdmin: true } });
  } catch {
    return NextResponse.json({ error: "That game code is already in use." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Sign in before joining a game." }, { status: 401 });
  }

  const payload = (await request.json()) as { code?: string };
  const code = normalizeCode(payload.code ?? "");
  const game = await prisma.eurovisionGame.findUnique({ where: { code } });

  if (!game) {
    return NextResponse.json({ error: "Game code not found." }, { status: 404 });
  }

  if (game.status !== "open") {
    return NextResponse.json({ error: "This game is closed." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.eurovisionGameMember.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        email: user.email ?? "",
        gameId: game.id,
      },
      update: {
        email: user.email ?? "",
        gameId: game.id,
      },
    });

    await tx.eurovisionGameRanking.upsert({
      where: { userId_gameId: { userId: user.id, gameId: game.id } },
      create: {
        userId: user.id,
        gameId: game.id,
        displayName: user.email ?? "",
        ratings: {},
      },
      update: {
        displayName: user.email ?? "",
      },
    });
  });

  return NextResponse.json({ game: { id: game.id, code: game.code, status: game.status, isAdmin: game.createdBy === user.id } });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.eurovisionGameMember.findUnique({
    where: { userId: user.id },
    include: { game: true },
  });

  if (!membership || membership.game.createdBy !== user.id) {
    return NextResponse.json({ error: "Only the game admin can close the game." }, { status: 403 });
  }

  const payload = (await request.json()) as { status?: string };

  if (payload.status !== "closed") {
    return NextResponse.json({ error: "Unsupported status." }, { status: 400 });
  }

  const game = await prisma.eurovisionGame.update({
    where: { id: membership.gameId },
    data: { status: "closed" },
  });

  return NextResponse.json({ game: { id: game.id, code: game.code, status: game.status, isAdmin: true } });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.eurovisionGameMember.findUnique({
    where: { userId: user.id },
    include: { game: true },
  });

  if (!membership) {
    return NextResponse.json({ ok: true });
  }

  if (membership.game.createdBy === user.id) {
    return NextResponse.json({ error: "The game admin cannot leave their own game. Close it or start a new game instead." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.eurovisionGameRanking.deleteMany({
      where: {
        userId: user.id,
        gameId: membership.gameId,
      },
    }),
    prisma.eurovisionGameMember.delete({
      where: { userId: user.id },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
