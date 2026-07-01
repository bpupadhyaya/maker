import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Projects / workspaces (H5.3) — a first-class group of tools, stored in the app
 * space. Each built tool is filed under the active project, so a user's work is
 * organized (like Codex/Claude "Projects"), fully offline.
 */
export interface Project {
  readonly id: string;
  readonly name: string;
  toolIds: string[];
}

const INDEX = "projects:index";
const ACTIVE = "projects:active";

function slug(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
    "project"
  );
}

async function index(store: MemoryStore): Promise<Record<string, Project>> {
  return (await store.get<Record<string, Project>>(INDEX)) ?? {};
}

export async function listProjects(store: MemoryStore): Promise<Project[]> {
  return Object.values(await index(store));
}

export async function getProject(
  store: MemoryStore,
  id: string,
): Promise<Project | undefined> {
  return (await index(store))[id];
}

export async function createProject(
  store: MemoryStore,
  name: string,
): Promise<Project> {
  const all = await index(store);
  let id = slug(name);
  let n = 1;
  while (all[id]) id = `${slug(name)}-${++n}`;
  const project: Project = { id, name, toolIds: [] };
  all[id] = project;
  await store.set(INDEX, all);
  return project;
}

/** The active project, creating a default "My Tools" if none exists. */
export async function getActiveProject(store: MemoryStore): Promise<Project> {
  const activeId = await store.get<string>(ACTIVE);
  const all = await index(store);
  if (activeId && all[activeId]) return all[activeId];
  const existing = Object.values(all);
  if (existing[0]) {
    await store.set(ACTIVE, existing[0].id);
    return existing[0];
  }
  const def = await createProject(store, "My Tools");
  await store.set(ACTIVE, def.id);
  return def;
}

export async function setActiveProject(
  store: MemoryStore,
  id: string,
): Promise<void> {
  await store.set(ACTIVE, id);
}

export async function addToolToProject(
  store: MemoryStore,
  projectId: string,
  toolId: string,
): Promise<void> {
  const all = await index(store);
  const p = all[projectId];
  if (!p) return;
  if (!p.toolIds.includes(toolId)) {
    p.toolIds.push(toolId);
    all[projectId] = p;
    await store.set(INDEX, all);
  }
}
