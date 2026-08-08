import { TFile } from "obsidian";
import { NoesisFlowSettings } from "../types";
import { TaskDocumentProcessor, TaskDocumentStore } from "./TaskDocumentStore";
import { TaskRepository, TaskRepositoryIndex } from "./TaskRepository";

interface TaskVault {
  process(file: TFile, processor: TaskDocumentProcessor): Promise<unknown>;
  read(file: TFile): Promise<string>;
}

/**
 * The task-domain persistence boundary. It combines serialized Markdown
 * mutation with index invalidation so callers cannot forget the latter.
 */
export class TaskService {
  private readonly documents: TaskDocumentStore;
  private readonly repository: TaskRepository;

  constructor(vault: TaskVault) {
    this.documents = new TaskDocumentStore(vault);
    this.repository = new TaskRepository(vault);
  }

  async process(file: TFile, processor: TaskDocumentProcessor): Promise<void> {
    await this.documents.process(file, processor);
    this.repository.invalidate(file.path);
  }

  async processFiles(files: TFile[], operation: () => Promise<void>): Promise<void> {
    await this.documents.processFiles(files, operation);
    for (const file of files) this.repository.invalidate(file.path);
  }

  invalidate(path: string): void { this.repository.invalidate(path); }
  invalidateAll(): void { this.repository.invalidateAll(); }
  refresh(files: TFile[], settings: NoesisFlowSettings): Promise<TaskRepositoryIndex> {
    return this.repository.refresh(files, settings);
  }
  getSourceErrors(): ReadonlyMap<string, string> { return this.repository.getSourceErrors(); }
}
