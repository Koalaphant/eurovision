"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { criteria, type Entry, type PublicConfig, type Ratings } from "../ranking-shared";

type ComparisonUser = {
  userId: string;
  displayName: string;
  scores: Record<string, number>;
  total: number;
  isCurrentUser: boolean;
};

type ComparisonRound = {
  entry: Entry & { order: number };
  unlocked: boolean;
  comparisons: ComparisonUser[];
};

type Game = {
  id: string;
  code: string;
  status: string;
};

export function ComparePage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [rounds, setRounds] = useState<ComparisonRound[]>([]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json() as Promise<PublicConfig>)
      .then((config) => {
        if (config.configError) {
          setMessage(config.configError);
          return;
        }

        if (config.supabaseUrl && config.supabasePublishableKey) {
          setSupabase(createClient(config.supabaseUrl, config.supabasePublishableKey));
        }
      })
      .catch(() => {
        setMessage("Could not load Supabase config.");
      })
      .finally(() => {
        setConfigLoaded(true);
      });
  }, []);

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
    if (!user) {
      return;
    }

    getAccessToken().then((token) => {
      if (!token) {
        return;
      }

      fetch("/api/comparison", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => response.json() as Promise<{ game?: Game; rounds?: ComparisonRound[]; error?: string }>)
        .then((data) => {
          if (data.error) {
            setMessage(data.error);
            return;
          }

          setGame(data.game ?? null);
          setRounds(data.rounds ?? []);
        })
        .catch(() => {
          setMessage("Could not load comparisons.");
        });
    });
  }, [getAccessToken, user]);

  async function signIn() {
    if (!supabase) {
      setMessage("Add Supabase environment variables to enable accounts.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setMessage(error ? error.message : "");
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

    setMessage(response.ok ? "Account created. You can sign in with your password." : data.error ?? "Could not create account.");
  }

  function getCriterionScore(scores: Ratings[string], criterionId: string) {
    return scores?.[criterionId] ?? 0;
  }

  return (
    <main className="euro-page min-h-screen text-[#171717]">
      <section className="euro-hero border-b border-white/20 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-semibold text-[#7bd7c4]" href="/">
              Back to scorecard
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <div className="equalizer" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#fff35c]">Score reveal</p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">Compare scores</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
              Each round unlocks separately after you complete and save that specific country.
            </p>
          </div>
          <div className="grid w-full gap-3 rounded-lg border border-white/15 bg-white/8 p-4 sm:max-w-md">
            {user ? (
              <>
                <p className="truncate text-sm text-white/75">{user.email}</p>
                {game && (
                  <p className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/75">
                    Game {game.code} {game.status === "closed" ? "(closed)" : ""}
                  </p>
                )}
              </>
            ) : (
	              <div className="flex flex-col gap-3 sm:flex-row">
	                <input
	                  className="h-12 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-4 text-base text-[#171717] outline-none focus:border-[#7bd7c4]"
	                  onChange={(event) => setEmail(event.target.value)}
	                  placeholder="email@example.com"
	                  type="email"
	                  value={email}
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
            {message && <p className="text-sm text-white/75">{message}</p>}
            {configLoaded && !supabase && <p className="text-sm text-white/60">Offline mode. Add Supabase env vars for account sync.</p>}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-8 sm:py-6">
        {rounds.map((round) => (
          <div className="euro-card rounded-lg p-4" key={round.entry.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="euro-number flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold">{round.entry.order}</span>
                <Image alt="" className="h-8 w-12 rounded-sm object-cover" height={32} src={round.entry.flagUrl} width={48} />
                <div>
                  <h2 className="font-semibold">{round.entry.country}</h2>
                  <p className="text-sm text-black/60">
                    {round.entry.artist} - {round.entry.songTitle}
                  </p>
                </div>
              </div>
              {!round.unlocked && <p className="rounded-md bg-[#f4ead5] px-3 py-2 text-sm font-medium text-[#6f4d00]">Locked until you save this round</p>}
            </div>

            {round.unlocked && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-black/55">
                      <th className="sticky left-0 z-10 min-w-40 bg-white/95 py-3 pr-4">User</th>
                      {criteria.map((criterion) => (
                        <th className="px-2 py-3" key={criterion.id}>
                          {criterion.label}
                        </th>
                      ))}
                      <th className="py-3 pl-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.comparisons.map((comparison) => (
                      <tr className="border-b border-black/10 last:border-0" key={comparison.userId}>
                        <td className="sticky left-0 z-10 min-w-40 bg-white/95 py-3 pr-4 font-medium shadow-[8px_0_12px_-14px_rgba(0,0,0,0.7)]">
                          {comparison.displayName}
                          {comparison.isCurrentUser ? " (you)" : ""}
                        </td>
                        {criteria.map((criterion) => (
                          <td className="px-2 py-3" key={criterion.id}>
                            {getCriterionScore(comparison.scores, criterion.id)}
                          </td>
                        ))}
                        <td className="py-3 pl-4 text-right text-lg font-semibold">{comparison.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {!rounds.length && <p className="euro-card rounded-lg p-4 text-sm text-black/60">No comparison rounds available yet.</p>}
      </section>
    </main>
  );
}
