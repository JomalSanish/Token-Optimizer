import type * as vscode from "vscode";
import type { ProfileHistoryEntry, ProfilePhase } from "@token-optimizer/core";

export const PROFILE_HISTORY_STORAGE_KEY = "tokenOptimizer.profileHistory";
export const MAX_PROFILE_HISTORY_VERSIONS = 20;

export class ProfileHistoryStore {
  private workspaceState: vscode.Memento;

  constructor(workspaceState: vscode.Memento) {
    this.workspaceState = workspaceState;
  }

  /**
   * Retrieves all profile history entries, sorted by version ascending.
   */
  public getAll(): ProfileHistoryEntry[] {
    const raw = this.workspaceState.get<ProfileHistoryEntry[]>(
      PROFILE_HISTORY_STORAGE_KEY,
      []
    );
    if (!Array.isArray(raw)) {
      return [];
    }
    return [...raw].sort((a, b) => a.version - b.version);
  }

  /**
   * Retrieves a specific profile history entry by version number.
   */
  public getVersion(version: number): ProfileHistoryEntry | undefined {
    const all = this.getAll();
    return all.find((entry) => entry.version === version);
  }

  /**
   * Retrieves the most recent profile history entry.
   */
  public getLatest(): ProfileHistoryEntry | undefined {
    const all = this.getAll();
    return all.length > 0 ? all[all.length - 1] : undefined;
  }

  /**
   * Determines the next sequential version number.
   */
  public getNextVersion(): number {
    const all = this.getAll();
    if (all.length === 0) {
      return 1;
    }
    const maxVersion = Math.max(...all.map((e) => e.version));
    return maxVersion + 1;
  }

  /**
   * Appends a new profile version entry to history.
   * Enforces monotonically increasing version number and max-20 FIFO eviction.
   */
  public async add(
    entry: Omit<ProfileHistoryEntry, "version"> & { version?: number }
  ): Promise<ProfileHistoryEntry> {
    const current = this.getAll();
    const version = entry.version ?? this.getNextVersion();
    const createdAt = entry.createdAt || new Date().toISOString();

    const finalizedEntry: ProfileHistoryEntry = {
      ...entry,
      version,
      createdAt,
      profile: {
        ...entry.profile,
        profileVersion: version,
        createdAt,
        finalizedAt: entry.finalizedAt,
      },
    };

    // Filter out duplicate if version already exists, then append
    const updated = current.filter((e) => e.version !== version);
    updated.push(finalizedEntry);

    // Sort ascending by version
    updated.sort((a, b) => a.version - b.version);

    // Max 20 versions eviction: retain the latest 20 versions
    const trimmed =
      updated.length > MAX_PROFILE_HISTORY_VERSIONS
        ? updated.slice(updated.length - MAX_PROFILE_HISTORY_VERSIONS)
        : updated;

    await this.workspaceState.update(PROFILE_HISTORY_STORAGE_KEY, trimmed);
    return finalizedEntry;
  }

  /**
   * Marks a profile version as finalized with an ISO timestamp.
   */
  public async markFinal(
    version: number,
    finalizedAt: string = new Date().toISOString()
  ): Promise<ProfileHistoryEntry | undefined> {
    const all = this.getAll();
    const target = all.find((e) => e.version === version);
    if (!target) {
      return undefined;
    }

    target.finalizedAt = finalizedAt;
    target.profile = {
      ...target.profile,
      finalizedAt,
    };

    await this.workspaceState.update(PROFILE_HISTORY_STORAGE_KEY, all);
    return target;
  }

  /**
   * Creates a new draft version from an existing profile with edited phases.
   * Zero adapter/LLM calls (FR-052).
   */
  public async createDraftWithPhases(
    baseVersion: number,
    phases: ProfilePhase[]
  ): Promise<ProfileHistoryEntry | undefined> {
    const base = this.getVersion(baseVersion);
    if (!base) {
      return undefined;
    }

    const nextVersion = this.getNextVersion();
    const now = new Date().toISOString();

    const newProfile = {
      ...base.profile,
      profileVersion: nextVersion,
      phases,
      createdAt: now,
      finalizedAt: undefined,
    };

    return this.add({
      version: nextVersion,
      narrative: base.narrative,
      profile: newProfile,
      createdAt: now,
      finalizedAt: undefined,
      costUsd: 0,
      tokens: { inputTokens: 0, outputTokens: 0 },
    });
  }

  /**
   * Clears the profile history (e.g. for testing).
   */
  public async clear(): Promise<void> {
    await this.workspaceState.update(PROFILE_HISTORY_STORAGE_KEY, []);
  }
}
