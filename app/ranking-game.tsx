"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  criteria,
  getEntryTotal,
  getInitialRanking,
  isEntryComplete,
  scoreOptions,
  storageKey,
  type Entry,
  type PublicConfig,
  type Ratings,
  type SavedRanking,
} from "./ranking-shared";

type Game = {
  id: string;
  code: string;
  status: string;
  isAdmin: boolean;
};

export function RankingGame() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [initialRanking] = useState(() => getInitialRanking());
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState(initialRanking.displayName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ratings, setRatings] = useState<Ratings>(initialRanking.ratings);

  const leaderboard = useMemo(() => {
    return [...entries].sort((a, b) => getEntryTotal(b, ratings) - getEntryTotal(a, ratings));
  }, [entries, ratings]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json() as Promise<PublicConfig>)
      .then((config) => {
        if (config.configError) {
          setAuthMessage(config.configError);
          return;
        }

        if (config.supabaseUrl && config.supabasePublishableKey) {
          setSupabase(createClient(config.supabaseUrl, config.supabasePublishableKey));
        }
      })
      .catch(() => {
        setAuthMessage("Could not load Supabase config.");
      })
      .finally(() => {
        setConfigLoaded(true);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ displayName, ratings }));
  }, [displayName, ratings]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

    return data.session?.access_token ?? null;
  }, [supabase]);

  useEffect(() => {
    getAccessToken().then((token) => {
      fetch("/api/entries", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((response) => response.json() as Promise<{ entries: Entry[]; isAdmin: boolean; error?: string }>)
        .then((data) => {
          setEntries(data.entries);
          setIsAdmin(data.isAdmin);
        })
        .catch(() => undefined);
    });
  }, [getAccessToken, user, game?.id]);

  useEffect(() => {
    if (!user) {
      return;
    }

    getAccessToken().then((token) => {
      fetch("/api/game", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((response) => response.json() as Promise<{ game: Game | null; error?: string }>)
        .then((data) => {
          if (data.error) {
            setSaveMessage(data.error);
            return;
          }

          setGame(data.game);
        })
        .catch(() => {
          setSaveMessage("Could not load game membership.");
        });
    });
  }, [getAccessToken, user]);

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    getAccessToken().then((token) => {
      if (!token) {
        return;
      }

      fetch("/api/ranking", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((response) => response.json() as Promise<{ ranking: SavedRanking | null; error?: string }>)
        .then((data) => {
          if (data.error) {
            setSaveMessage(data.error);
            return;
          }

          if (!data.ranking) {
            return;
          }

          setDisplayName(data.ranking.displayName ?? "");
          setRatings(data.ranking.ratings ?? {});
        })
        .catch(() => {
          setSaveMessage("Could not load saved ranking.");
        });
    });
  }, [game?.id, getAccessToken, supabase, user]);

  async function signIn() {
    if (!supabase) {
      setAuthMessage("Add Supabase environment variables to enable accounts.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setAuthMessage(error ? error.message : "");
  }

  async function signUp() {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { error?: string };

    setAuthMessage(response.ok ? "Account created. You can sign in with your password." : data.error ?? "Could not create account.");
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setGame(null);
    setEntries([]);
  }

  async function saveRanking(successMessage = "Saved.") {
    if (!supabase || !user) {
      setSaveMessage("Sign in to save this ranking.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setSaveMessage("Your session expired. Sign in again to save.");
      return;
    }

    const response = await fetch("/api/ranking", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
        ratings,
      }),
    });

    const data = (await response.json()) as { error?: string };

    setSaveMessage(response.ok ? successMessage : data.error ?? "Could not save ranking.");
  }

  async function saveRound(entry: Entry, roundNumber: number) {
    if (!isEntryComplete(entry.id, ratings)) {
      setSaveMessage(`Complete every score for round ${roundNumber} before comparing it.`);
      return;
    }

    await saveRanking(`Round ${roundNumber} saved. It is now available on Compare.`);
  }

  async function joinGame() {
    if (!user) {
      setSaveMessage("Sign in before joining a game.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setSaveMessage("Your session expired. Sign in again to join.");
      return;
    }

    const response = await fetch("/api/game", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: joinCode }),
    });
    const data = (await response.json()) as { game?: Game; error?: string };

    if (!response.ok || !data.game) {
      setSaveMessage(data.error ?? "Could not join game.");
      return;
    }

    setGame(data.game);
    setIsAdmin(data.game.isAdmin);
    setJoinCode("");
    setSaveMessage(`Joined game ${data.game.code}.`);
  }

  async function leaveGame() {
    if (!user || !game) {
      return;
    }

    if (!confirm("Leave this game? Your saved scores for this game will be removed from comparisons.")) {
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setSaveMessage("Your session expired. Sign in again to leave this game.");
      return;
    }

    const response = await fetch("/api/game", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setSaveMessage(data.error ?? "Could not leave game.");
      return;
    }

    setGame(null);
    setIsAdmin(false);
    setEntries([]);
    setRatings({});
    setSaveMessage("You left the game. Enter a new code to join another one.");
  }

  function updateRating(entryId: string, criterionId: string, score: number) {
    const nextScore = Math.min(10, Math.max(0, Math.round((score || 0) * 2) / 2));

    setRatings((current) => ({
      ...current,
      [entryId]: {
        ...current[entryId],
        [criterionId]: nextScore,
      },
    }));
  }

  return (
    <main className="euro-page min-h-screen text-[#171717]">
      <section className="euro-hero border-b border-white/20 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="equalizer" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#fff35c]">Eurovision ranking game</p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-5xl">Score every entry your way.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
              Rate each official entry across the fixed criteria and compare totals on the leaderboard.
            </p>
            <Link
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white"
              href="/admin"
            >
              Settings
            </Link>
          </div>
          <div className="grid w-full gap-3 rounded-lg border border-white/15 bg-white/8 p-4 sm:max-w-md">
            <label className="text-sm font-medium text-white/80" htmlFor="display-name">
              Your name
            </label>
            <input
              id="display-name"
              className="h-11 rounded-md border border-white/20 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#7bd7c4]"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name for this scorecard"
            />
            {user ? (
              <>
                {game ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/75">
                      Game {game.code} {game.status === "closed" ? "(closed)" : ""}
                    </p>
                    <Link className="h-10 rounded-md border border-white/30 px-4 py-2 text-sm font-semibold text-white" href="/compare">
                      Compare
                    </Link>
                    {!game.isAdmin && (
                      <button className="h-10 rounded-md border border-white/30 px-4 text-sm font-semibold text-white" onClick={leaveGame}>
                        Leave
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="h-10 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#7bd7c4]"
                      onChange={(event) => setJoinCode(event.target.value)}
                      placeholder="Game code"
                      value={joinCode}
                    />
                    <button className="euro-button-gold h-10 rounded-md px-4 text-sm font-semibold" onClick={joinGame}>
                      Join
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                <button className="euro-button-gold h-10 rounded-md px-4 text-sm font-semibold" onClick={() => saveRanking()}>
                    Save all
                  </button>
                  <button className="h-10 rounded-md border border-white/30 px-4 text-sm font-semibold text-white" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              </>
            ) : (
	              <div className="flex flex-col gap-3 sm:flex-row">
	                <input
	                  className="h-12 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-4 text-base text-[#171717] outline-none focus:border-[#7bd7c4]"
	                  value={email}
	                  onChange={(event) => setEmail(event.target.value)}
	                  placeholder="email@example.com"
	                  type="email"
	                />
	                <input
	                  className="h-12 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-4 text-base text-[#171717] outline-none focus:border-[#7bd7c4]"
	                  onChange={(event) => setPassword(event.target.value)}
	                  placeholder="Password"
	                  type="password"
	                  value={password}
	                />
	                <button className="euro-button-gold h-12 rounded-md px-5 text-base font-semibold" onClick={signIn}>
	                  Sign in
	                </button>
	                <button className="h-12 rounded-md border border-white/30 px-5 text-base font-semibold text-white" onClick={signUp}>
	                  Create
	                </button>
	              </div>
            )}
            {(authMessage || saveMessage) && <p className="text-sm text-white/75">{authMessage || saveMessage}</p>}
            {configLoaded && !supabase && <p className="text-sm text-white/60">Offline mode. Add Supabase env vars for account sync.</p>}
          </div>
        </div>
      </section>

      {!user ? (
        <section className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Sign in to score</h2>
            <p className="mt-2 text-sm text-black/60">You need to sign in before you can view or complete the scorecard.</p>
          </div>
        </section>
      ) : !game ? (
        <section className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Join a game</h2>
            <p className="mt-2 text-sm text-black/60">Enter the code from the admin before the scorecard is shown.</p>
          </div>
        </section>
      ) : game.status === "closed" ? (
        <section className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Game closed</h2>
            <p className="mt-2 text-sm text-black/60">Scores for this game are locked. You can still compare results or join a new game code.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#7bd7c4]"
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="New game code"
                value={joinCode}
              />
              <button className="euro-button-gold h-10 rounded-md px-4 text-sm font-semibold" onClick={joinGame}>
                Join new game
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-8 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {isAdmin && (
            <div className="euro-card flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Admin setup</h2>
                <p className="mt-1 text-sm text-black/60">Add, delete, and arrange songs on the admin page.</p>
              </div>
              <Link className="euro-button-primary inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold" href="/admin">
                Open admin
              </Link>
            </div>
          )}

          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Scorecard</h2>
            <div className="mt-4 space-y-4 lg:hidden">
              {entries.map((entry, index) => (
                <div className="rounded-lg border border-[#ff007f]/20 bg-white/80 p-4" key={entry.id}>
                  <div className="grid gap-3">
                    <div className="flex items-start gap-3">
                      <span className="euro-number flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold">
                        {index + 1}
                      </span>
                      <Image alt="" className="h-9 w-14 shrink-0 rounded-sm object-cover" height={36} src={entry.flagUrl} width={56} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold">{entry.country}</p>
                      </div>
                      <div className="euro-total shrink-0 rounded-md px-3 py-2 text-right text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Total</p>
                        <p className="text-lg font-semibold">{getEntryTotal(entry, ratings)}</p>
                      </div>
                    </div>
                    <p className="break-words text-sm leading-5 text-black/65">
                      {entry.artist} - {entry.songTitle}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {criteria.map((criterionItem) => (
                      <label className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3" key={criterionItem.id}>
                        <span className="text-sm font-medium text-black/75">{criterionItem.label}</span>
                        <select
                          aria-label={`${entry.country} ${criterionItem.label} score`}
                          className="h-11 w-full rounded-md border border-black/15 bg-white px-2 text-center text-base outline-none focus:border-[#246b5f]"
                          onChange={(event) => updateRating(entry.id, criterionItem.id, Number(event.target.value))}
                          value={ratings[entry.id]?.[criterionItem.id] ?? ""}
                        >
                          <option disabled value="">
                            Score
                          </option>
                          {scoreOptions.map((score) => (
                            <option key={score} value={score}>
                              {score}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-black/60">
                      {isEntryComplete(entry.id, ratings) ? "Round complete" : "Complete this round to unlock comparisons"}
                    </p>
                    <button className="euro-button-primary h-10 rounded-md px-4 text-sm font-semibold" onClick={() => saveRound(entry, index + 1)}>
                      Save round {index + 1}
                    </button>
                  </div>
                </div>
              ))}
              {!entries.length && <p className="py-3 text-sm text-black/60">No countries added yet. The game admin can set up songs on the admin page.</p>}
            </div>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-black/55">
                    <th className="w-20 py-3 pr-4">Order</th>
                    <th className="w-44 px-2 py-3">Country</th>
                    <th className="w-60 px-2 py-3">Artist/Song</th>
                    {criteria.map((criterion) => (
                      <th className="w-36 px-2 py-3" key={criterion.id}>
                        {criterion.label}
                      </th>
                    ))}
                    <th className="py-3 pl-4 text-right">Total</th>
                    <th className="py-3 pl-4 text-right">Round</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr className="border-b border-black/10 last:border-0" key={entry.id}>
                      <td className="py-4 pr-4 align-top">
                        <span className="euro-number flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold">
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-2 py-4 align-top">
                        <div className="flex items-center gap-3">
                          <Image alt="" className="h-7 w-10 rounded-sm object-cover" height={28} src={entry.flagUrl} width={40} />
                          <p className="font-semibold">{entry.country}</p>
                        </div>
                      </td>
                      <td className="px-2 py-4 align-top">
                        <p className="font-semibold">{entry.artist}</p>
                        <p className="text-black/65">{entry.songTitle}</p>
                      </td>
                      {criteria.map((criterionItem) => (
                        <td className="px-2 py-4 align-top" key={criterionItem.id}>
                          <select
                            aria-label={`${entry.country} ${criterionItem.label} score`}
                            className="h-10 w-20 rounded-md border border-black/15 bg-white px-2 text-center text-sm outline-none focus:border-[#246b5f]"
                            onChange={(event) => updateRating(entry.id, criterionItem.id, Number(event.target.value))}
                            value={ratings[entry.id]?.[criterionItem.id] ?? ""}
                          >
                            <option disabled value="">
                              Score
                            </option>
                            {scoreOptions.map((score) => (
                              <option key={score} value={score}>
                                {score}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                      <td className="py-4 pl-4 text-right align-top text-xl font-semibold">{getEntryTotal(entry, ratings)}</td>
                      <td className="py-4 pl-4 text-right align-top">
                        <button className="euro-button-primary h-10 rounded-md px-4 text-sm font-semibold" onClick={() => saveRound(entry, index + 1)}>
                          Save round
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!entries.length && (
                    <tr>
                      <td className="py-6 text-black/60" colSpan={criteria.length + 5}>
                        No countries added yet. The game admin can set up songs on the admin page.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="euro-card h-fit rounded-lg p-4">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <div className="mt-4 space-y-3">
            {leaderboard.map((entry, index) => (
              <div className="grid grid-cols-[28px_minmax(0,1fr)_48px] items-start gap-2 border-b border-black/10 pb-3 last:border-0 sm:grid-cols-[32px_minmax(0,1fr)_56px] sm:gap-3" key={entry.id}>
                <span className="euro-number flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Image alt="" className="h-7 w-10 shrink-0 rounded-sm object-cover" height={28} src={entry.flagUrl} width={40} />
                    <p className="min-w-0 truncate font-semibold">
                      {entries.findIndex((orderedEntry) => orderedEntry.id === entry.id) + 1}. {entry.country}
                    </p>
                  </div>
                  <p className="mt-2 break-words text-sm leading-5 text-black/60">
                    {entry.artist} - {entry.songTitle}
                  </p>
                </div>
                <p className="text-right text-xl font-semibold">{getEntryTotal(entry, ratings)}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
      )}
    </main>
  );
}
