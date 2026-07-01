// @maker/gui — GUI front-end: a Tauri (Rust) shell hosting a web UI, both thin
// clients over @maker/engine. The pure, tested core lives here; the DOM/Tauri
// layer (web/, src-tauri/) is a thin shell on top. Live Tauri build = needs-user
// (Rust/Tauri toolchain).
export type { LayoutPreset, LayoutState } from "./layout.ts";
export {
  PRESET_FRACTIONS,
  COLLAPSE_WIDTH,
  DEFAULT_PRESET,
  layoutFor,
  fractionToPreset,
} from "./layout.ts";
export type { Turn, ViewModel } from "./view-model.ts";
export { initialViewModel, addUserTurn, reduce } from "./view-model.ts";
