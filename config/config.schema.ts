// Soul Protocol Plugin - Configuration Schema
// Single source of truth for config types

export interface SoulProtocolConfig {
  /** Enable or disable the plugin */
  enabled?: boolean;

  /** Workspace directory path */
  workspaceDir?: string;

  /** Log level: debug, info, warn, error */
  logLevel?: "debug" | "info" | "warn" | "error";
}

export const defaultConfig: SoulProtocolConfig = {
  enabled: true,
  logLevel: "info",
};