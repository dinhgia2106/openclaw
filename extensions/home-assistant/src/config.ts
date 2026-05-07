import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import {
  normalizeResolvedSecretInputString,
  normalizeSecretInput,
} from "openclaw/plugin-sdk/secret-input";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";

export const DEFAULT_HASS_TIMEOUT_SECONDS = 15;

type PluginEntryConfig = {
  url?: unknown;
  token?: unknown;
  timeout?: number;
};

function resolvePluginConfig(cfg?: OpenClawConfig): PluginEntryConfig | undefined {
  const raw = cfg?.plugins?.entries?.["home-assistant"]?.config as PluginEntryConfig | undefined;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return undefined;
}

function normalizeConfiguredSecret(value: unknown, path: string): string | undefined {
  return normalizeSecretInput(
    normalizeResolvedSecretInputString({
      value,
      path,
    }),
  );
}

/**
 * Resolve the Home Assistant base URL from plugin config or env var.
 * Returns the URL without a trailing slash.
 */
export function resolveHassUrl(cfg?: OpenClawConfig): string | undefined {
  const pluginCfg = resolvePluginConfig(cfg);
  const configured =
    normalizeConfiguredSecret(pluginCfg?.url, "plugins.entries.home-assistant.config.url") ||
    normalizeOptionalString(process.env.HASS_URL) ||
    "";
  if (!configured) {
    return undefined;
  }
  return configured.replace(/\/+$/, "");
}

/**
 * Resolve the Home Assistant long-lived access token from plugin config or env var.
 */
export function resolveHassToken(cfg?: OpenClawConfig): string | undefined {
  const pluginCfg = resolvePluginConfig(cfg);
  return (
    normalizeConfiguredSecret(pluginCfg?.token, "plugins.entries.home-assistant.config.token") ||
    normalizeSecretInput(process.env.HASS_TOKEN) ||
    undefined
  );
}

/**
 * Resolve the request timeout in seconds.
 */
export function resolveHassTimeoutSeconds(cfg?: OpenClawConfig): number {
  const pluginCfg = resolvePluginConfig(cfg);
  const override = pluginCfg?.timeout;
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.min(120, Math.floor(override));
  }
  return DEFAULT_HASS_TIMEOUT_SECONDS;
}
