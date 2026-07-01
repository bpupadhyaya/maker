import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Local scheduling (H5.5) — the offline answer to cloud "Routines". A schedule
 * is a saved prompt that runs on a cadence while Maker is open, via an
 * in-process runner. Stored in the app space; nothing leaves the device. For
 * runs while the app is closed, an OS-cron/launchd entry can be generated
 * (install = needs-user).
 */
export interface Schedule {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly everyMinutes: number;
  lastRun: number | null;
}

const KEY = "schedules:index";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "job";
}

async function index(store: MemoryStore): Promise<Record<string, Schedule>> {
  return (await store.get<Record<string, Schedule>>(KEY)) ?? {};
}

export async function addSchedule(
  store: MemoryStore,
  input: { name?: string; prompt: string; everyMinutes: number },
): Promise<Schedule> {
  const all = await index(store);
  const base = slug(input.name ?? input.prompt);
  let id = base;
  let n = 1;
  while (all[id]) id = `${base}-${++n}`;
  const schedule: Schedule = {
    id,
    name: input.name ?? input.prompt,
    prompt: input.prompt,
    everyMinutes: Math.max(1, Math.floor(input.everyMinutes)),
    lastRun: null,
  };
  all[id] = schedule;
  await store.set(KEY, all);
  return schedule;
}

export async function listSchedules(store: MemoryStore): Promise<Schedule[]> {
  return Object.values(await index(store));
}

export async function removeSchedule(store: MemoryStore, id: string): Promise<boolean> {
  const all = await index(store);
  if (!(id in all)) return false;
  delete all[id];
  await store.set(KEY, all);
  return true;
}

export async function markRun(store: MemoryStore, id: string, at: number): Promise<void> {
  const all = await index(store);
  const s = all[id];
  if (!s) return;
  s.lastRun = at;
  all[id] = s;
  await store.set(KEY, all);
}

/** Schedules due to run at `now` (never-run schedules are due immediately). */
export async function dueSchedules(store: MemoryStore, now: number): Promise<Schedule[]> {
  return (await listSchedules(store)).filter(
    (s) => now - (s.lastRun ?? 0) >= s.everyMinutes * 60_000,
  );
}

/** A crontab line that runs this schedule's prompt headlessly (needs-user to install). */
export function cronLineFor(schedule: Schedule, makerBin = "maker"): string {
  const every = schedule.everyMinutes;
  const expr = every < 60 ? `*/${every} * * * *` : `0 */${Math.floor(every / 60)} * * *`;
  return `${expr} ${makerBin} express ${JSON.stringify(schedule.prompt)}  # maker:${schedule.id}`;
}

/**
 * Run due schedules on a timer while the process is alive. `maker` only needs an
 * `express` method. Returns a stop() handle. Injectable clock/interval for tests.
 */
export function startScheduleRunner(
  maker: { express: (prompt: string) => AsyncIterable<unknown> },
  store: MemoryStore,
  opts: { intervalMs?: number; now?: () => number } = {},
): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? 30_000;
  const now = opts.now ?? ((): number => Date.now());
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      for (const s of await dueSchedules(store, now())) {
        for await (const _ of maker.express(s.prompt)) {
          void _;
        }
        await markRun(store, s.id, now());
      }
    } catch {
      // best-effort; a failed run retries next tick
    } finally {
      busy = false;
    }
  };
  const handle = setInterval(() => void tick(), intervalMs);
  (handle as { unref?: () => void }).unref?.();
  return { stop: (): void => clearInterval(handle) };
}
