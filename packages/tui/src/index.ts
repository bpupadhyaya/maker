// @maker/tui — terminal front-end (M0.3). A thin client over @maker/engine:
// it renders MakerEvents and forwards user input. No engine logic lives here.
export { runConversation } from "./controller.ts";
export type { TuiIO, RunOptions } from "./controller.ts";
export { renderEvent } from "./render.ts";
export { main } from "./repl.ts";
