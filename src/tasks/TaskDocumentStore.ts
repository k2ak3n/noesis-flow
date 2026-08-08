import { TFile } from "obsidian";

export type TaskDocumentProcessor = (content: string) => string | Promise<string>;

interface TaskDocumentVault {
  process(file: TFile, processor: TaskDocumentProcessor): Promise<unknown>;
}

/**
 * Serializes background edits for each Markdown task note.
 *
 * Every task surface writes through this store so concurrent actions cannot
 * overwrite each other with stale note content.
 */
export class TaskDocumentStore {
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly vault: TaskDocumentVault) {}

  async process(file: TFile, processor: TaskDocumentProcessor): Promise<void> {
    const path = file.path;
    const previous = this.writeQueues.get(path) || Promise.resolve();
    const work = previous
      .catch(() => undefined)
      .then(() => this.vault.process(file, processor));
    const settled = work.then(() => undefined, () => undefined);

    this.writeQueues.set(path, settled);
    try {
      await work;
    } finally {
      if (this.writeQueues.get(path) === settled) this.writeQueues.delete(path);
    }
  }

  /**
   * Reserves every named task document before running a coordinated operation.
   * Callers can therefore safely make a reversible change across two notes.
   */
  async processFiles(files: TFile[], operation: () => Promise<void>): Promise<void> {
    const paths = Array.from(new Set(files.map((file) => file.path))).sort();
    const previous = paths.map((path) => this.writeQueues.get(path) || Promise.resolve());
    const work = Promise.all(previous.map((entry) => entry.catch(() => undefined))).then(operation);
    const settled = work.then(() => undefined, () => undefined);

    for (const path of paths) this.writeQueues.set(path, settled);
    try {
      await work;
    } finally {
      for (const path of paths) {
        if (this.writeQueues.get(path) === settled) this.writeQueues.delete(path);
      }
    }
  }
}
