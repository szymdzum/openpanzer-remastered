//node --import ./cli/register.mjs cli/play.ts: the hooks that let Node run the game's TypeScript
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
