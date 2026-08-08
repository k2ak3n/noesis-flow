import { moment as obsidianMoment } from "obsidian";
import type momentType from "moment";

// Obsidian exposes the runtime Moment instance. Its current declaration is a
// namespace, so bridge it to Moment's callable factory type in one place.
export const moment = obsidianMoment as unknown as typeof momentType;
