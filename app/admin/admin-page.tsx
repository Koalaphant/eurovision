"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getFlagUrl, type CountryOption, type Entry, type PublicConfig } from "../ranking-shared";

type Game = {
  id: string;
  code: string;
  status: string;
  isAdmin: boolean;
};

export function AdminPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [newCode, setNewCode] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");

  const selectedCountry = countries.find((country) => country.cca2 === selectedCountryCode);

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
    fetch("https://restcountries.com/v3.1/all?fields=name,cca2")
      .then((response) => response.json() as Promise<CountryOption[]>)
      .then((data) => {
        setCountries(data.sort((a, b) => a.name.common.localeCompare(b.name.common)));
      })
      .catch(() => {
        setMessage("Could not load country selector.");
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

  const loadEntries = useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch("/api/entries", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = (await response.json()) as { entries: Entry[]; isAdmin: boolean; error?: string };

    if (data.error) {
      setMessage(data.error);
      return;
    }

    setEntries(data.entries);
    setIsAdmin(data.isAdmin);
  }, [getAccessToken]);

  useEffect(() => {
    getAccessToken().then((token) => {
      fetch("/api/entries", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((response) => response.json() as Promise<{ entries: Entry[]; isAdmin: boolean; error?: string }>)
        .then((data) => {
          if (data.error) {
            setMessage(data.error);
            return;
          }

          setEntries(data.entries);
          setIsAdmin(data.isAdmin);
        })
        .catch(() => {
          setMessage("Could not load entries.");
        });
    });
  }, [getAccessToken, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    getAccessToken().then((token) => {
      fetch("/api/game", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((response) => response.json() as Promise<{ game: Game | null; isAdmin?: boolean; error?: string }>)
        .then((data) => {
          if (data.error) {
            setMessage(data.error);
            return;
          }

          setGame(data.game);
          setIsAdmin(Boolean(data.game?.isAdmin ?? data.isAdmin));
        })
        .catch(() => {
          setMessage("Could not load game code.");
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

  async function signOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setGame(null);
    setEntries([]);
  }

  async function createGameCode() {
    const token = await getAccessToken();

    if (!token) {
      setMessage("Sign in to create a game code.");
      return;
    }

    const response = await fetch("/api/game", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: newCode }),
    });
    const data = (await response.json()) as { game?: Game; error?: string };

    if (!response.ok || !data.game) {
      setMessage(data.error ?? "Could not create game code.");
      return;
    }

    setGame(data.game);
    setIsAdmin(data.game.isAdmin);
    setEntries([]);
    setNewCode("");
    setMessage(`Game code ${data.game.code} created.`);
  }

  async function closeGame() {
    if (!confirm("Close this game? Existing players will still see comparisons, but nobody can join or edit scores.")) {
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setMessage("Sign in as the game admin to close this game.");
      return;
    }

    const response = await fetch("/api/game", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "closed" }),
    });
    const data = (await response.json()) as { game?: Game; error?: string };

    if (!response.ok || !data.game) {
      setMessage(data.error ?? "Could not close game.");
      return;
    }

    setGame(data.game);
    setMessage("Game closed.");
  }

  async function addEntry() {
    const token = await getAccessToken();

    if (!token || !selectedCountry) {
      setMessage("Choose a country and sign in as admin.");
      return;
    }

    const response = await fetch("/api/entries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        country: selectedCountry.name.common,
        countryCode: selectedCountry.cca2,
        artist,
        songTitle,
        flagUrl: getFlagUrl(selectedCountry.cca2),
      }),
    });

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(data.error ?? "Could not add country.");
      return;
    }

    setSelectedCountryCode("");
    setArtist("");
    setSongTitle("");
    setMessage("Country added.");
    await loadEntries();
  }

  async function saveEntryOrder(nextEntries: Entry[]) {
    const token = await getAccessToken();

    if (!token) {
      setMessage("Sign in as admin to rearrange songs.");
      return;
    }

    setEntries(nextEntries);

    const response = await fetch("/api/entries", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entryIds: nextEntries.map((entry) => entry.id),
      }),
    });

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(data.error ?? "Could not rearrange songs.");
      await loadEntries();
      return;
    }

    setMessage("Order updated.");
  }

  async function moveEntry(entryId: string, direction: -1 | 1) {
    const currentIndex = entries.findIndex((entry) => entry.id === entryId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= entries.length) {
      return;
    }

    const nextEntries = [...entries];
    const [entry] = nextEntries.splice(currentIndex, 1);
    nextEntries.splice(nextIndex, 0, entry);
    await saveEntryOrder(nextEntries);
  }

  async function deleteEntry(entryId: string) {
    const token = await getAccessToken();

    if (!token) {
      setMessage("Sign in as admin to delete songs.");
      return;
    }

    const response = await fetch(`/api/entries?id=${encodeURIComponent(entryId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(data.error ?? "Could not delete song.");
      return;
    }

    setMessage("Song deleted.");
    await loadEntries();
  }

  return (
    <main className="euro-page min-h-screen text-[#171717]">
      <section className="euro-hero border-b border-white/20 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-semibold text-[#7bd7c4]" href="/">
              Back to game
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <div className="equalizer" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#fff35c]">Backstage control</p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">Admin setup</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">Add countries, artists, songs, and arrange the running order.</p>
          </div>
          <div className="grid w-full gap-3 rounded-lg border border-white/15 bg-white/8 p-4 sm:max-w-md">
            {user ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-white/75">{user.email}</p>
                <button className="h-10 rounded-md border border-white/30 px-4 text-sm font-semibold text-white" onClick={signOut}>
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#7bd7c4]"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  type="email"
                  value={email}
                />
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-white/20 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#7bd7c4]"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={password}
                />
                <button className="euro-button-gold h-10 rounded-md px-4 text-sm font-semibold" onClick={signIn}>
                  Sign in
                </button>
                <button className="h-10 rounded-md border border-white/30 px-4 text-sm font-semibold text-white" onClick={signUp}>
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
        {!game && (
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Create a game</h2>
            <p className="mt-2 text-sm text-black/60">Create a game code to become the admin for this Eurovision room.</p>
          </div>
        )}

        {user && (
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Game code</h2>
            {game ? (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <p className="rounded-md bg-[#e7f4f0] px-4 py-3 text-lg font-semibold text-[#12342e]">{game.code}</p>
                  <p className="text-sm text-black/60">
                    {game.status === "open" ? "Give this code to users so they can join this Eurovision ranking game." : "This game is closed."}
                  </p>
                </div>
                {game.isAdmin && game.status === "open" && (
                  <button className="euro-button-danger h-11 rounded-md px-4 text-sm font-semibold" onClick={closeGame}>
                    Close game
                  </button>
                )}
                </div>
                {game.isAdmin && game.status === "closed" && (
                  <div className="flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row">
                    <input
                      className="h-11 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm uppercase outline-none focus:border-[#246b5f]"
                      onChange={(event) => setNewCode(event.target.value)}
                      placeholder="New game code"
                      value={newCode}
                    />
                    <button className="euro-button-primary h-11 rounded-md px-4 text-sm font-semibold" onClick={createGameCode}>
                      Start new game
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  className="h-11 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm uppercase outline-none focus:border-[#246b5f]"
                  onChange={(event) => setNewCode(event.target.value)}
                  placeholder="Create code"
                  value={newCode}
                />
                <button className="euro-button-primary h-11 rounded-md px-4 text-sm font-semibold" onClick={createGameCode}>
                  Create code
                </button>
              </div>
            )}
          </div>
        )}

        {isAdmin && game?.status === "open" && (
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Add song</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select
                className="h-11 min-w-0 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#246b5f]"
                onChange={(event) => setSelectedCountryCode(event.target.value)}
                value={selectedCountryCode}
              >
                <option value="">Country</option>
                {countries.map((country) => (
                  <option key={country.cca2} value={country.cca2}>
                    {country.name.common}
                  </option>
                ))}
              </select>
              <input
                className="h-11 min-w-0 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#246b5f]"
                onChange={(event) => setArtist(event.target.value)}
                placeholder="Artist"
                value={artist}
              />
              <input
                className="h-11 min-w-0 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#246b5f]"
                onChange={(event) => setSongTitle(event.target.value)}
                placeholder="Song"
                value={songTitle}
              />
              <button className="euro-button-primary h-11 rounded-md px-4 text-sm font-semibold" onClick={addEntry}>
                Add
              </button>
            </div>
            {selectedCountryCode && (
              <div className="mt-4 flex items-center gap-3 text-sm text-black/70">
                <Image alt="" className="h-6 w-9 object-cover" height={24} src={getFlagUrl(selectedCountryCode)} width={36} />
                <span>{selectedCountry?.name.common}</span>
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="euro-card rounded-lg p-4">
            <h2 className="text-lg font-semibold">Songs</h2>
            {!!entries.length && (
              <div className="mt-5 space-y-3 md:hidden">
                {entries.map((entry, index) => (
                  <div className="rounded-lg border border-[#ff007f]/20 bg-white/80 p-3" key={entry.id}>
                    <div className="flex items-start gap-3">
                      <Image alt="" className="h-8 w-12 rounded-sm object-cover" height={32} src={entry.flagUrl} width={48} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">#{index + 1}</p>
                        <p className="font-semibold">{entry.country}</p>
                        <p className="mt-1 text-sm text-black/65">
                          {entry.artist} - {entry.songTitle}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button className="h-10 rounded-md border border-black/15 px-3 text-sm font-medium disabled:opacity-40" disabled={index === 0} onClick={() => moveEntry(entry.id, -1)}>
                        Up
                      </button>
                      <button className="h-10 rounded-md border border-black/15 px-3 text-sm font-medium disabled:opacity-40" disabled={index === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}>
                        Down
                      </button>
                      <button className="euro-button-danger h-10 rounded-md px-3 text-sm font-semibold" onClick={() => deleteEntry(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!!entries.length && (
              <div className="mt-5 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-black/55">
                      <th className="py-3 pr-4">Order</th>
                      <th className="px-2 py-3">Country</th>
                      <th className="px-2 py-3">Artist/Song</th>
                      <th className="py-3 pl-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <tr className="border-b border-black/10 last:border-0" key={entry.id}>
                        <td className="py-3 pr-4 text-black/60">{index + 1}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-3">
                            <Image alt="" className="h-6 w-9 rounded-sm object-cover" height={24} src={entry.flagUrl} width={36} />
                            <span className="font-medium">{entry.country}</span>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <p className="font-medium">{entry.artist}</p>
                          <p className="text-black/60">{entry.songTitle}</p>
                        </td>
                        <td className="py-3 pl-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button className="h-9 rounded-md border border-black/15 px-3 text-sm font-medium disabled:opacity-40" disabled={index === 0} onClick={() => moveEntry(entry.id, -1)}>
                              Up
                            </button>
                            <button className="h-9 rounded-md border border-black/15 px-3 text-sm font-medium disabled:opacity-40" disabled={index === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}>
                              Down
                            </button>
                            <button className="euro-button-danger h-9 rounded-md px-3 text-sm font-semibold" onClick={() => deleteEntry(entry.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!entries.length && <p className="mt-4 text-sm text-black/60">No songs added yet.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
