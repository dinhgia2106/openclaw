import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import { resolveHassToken, resolveHassTimeoutSeconds, resolveHassUrl } from "./config.js";

/**
 * Low-level HTTP client for the Home Assistant REST API.
 *
 * All methods use the standard REST API documented at:
 * https://developers.home-assistant.io/docs/api/rest
 */

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function resolveCredentials(cfg?: OpenClawConfig): { baseUrl: string; token: string } {
  const baseUrl = resolveHassUrl(cfg);
  if (!baseUrl) {
    throw new Error(
      "Home Assistant URL is required. Set HASS_URL in the Gateway environment, or configure plugins.entries.home-assistant.config.url.",
    );
  }
  const token = resolveHassToken(cfg);
  if (!token) {
    throw new Error(
      "Home Assistant token is required. Set HASS_TOKEN in the Gateway environment, or configure plugins.entries.home-assistant.config.token.",
    );
  }
  return { baseUrl, token };
}

async function hassGet(cfg: OpenClawConfig | undefined, path: string): Promise<unknown> {
  const { baseUrl, token } = resolveCredentials(cfg);
  const timeoutMs = resolveHassTimeoutSeconds(cfg) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: buildHeaders(token),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Home Assistant API error ${response.status} on GET ${path}: ${text}`.trim());
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function hassPost(
  cfg: OpenClawConfig | undefined,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { baseUrl, token } = resolveCredentials(cfg);
  const timeoutMs = resolveHassTimeoutSeconds(cfg) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Home Assistant API error ${response.status} on POST ${path}: ${text}`.trim(),
      );
    }
    // Some HASS endpoints return empty body on success
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return { status: "ok" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type HassState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
};

/**
 * Check if the HASS API is reachable.
 */
export async function hassCheckApi(cfg?: OpenClawConfig): Promise<{ message: string }> {
  return (await hassGet(cfg, "/api/")) as { message: string };
}

/**
 * Get all entity states.
 */
export async function hassGetStates(cfg?: OpenClawConfig): Promise<HassState[]> {
  return (await hassGet(cfg, "/api/states")) as HassState[];
}

/**
 * Get the state of a specific entity.
 */
export async function hassGetEntityState(
  cfg: OpenClawConfig | undefined,
  entityId: string,
): Promise<HassState> {
  return (await hassGet(cfg, `/api/states/${encodeURIComponent(entityId)}`)) as HassState;
}

/**
 * Get available services grouped by domain.
 */
export async function hassGetServices(
  cfg?: OpenClawConfig,
): Promise<Array<{ domain: string; services: Record<string, unknown> }>> {
  return (await hassGet(cfg, "/api/services")) as Array<{
    domain: string;
    services: Record<string, unknown>;
  }>;
}

/**
 * Call a Home Assistant service (e.g. light/turn_on).
 */
export async function hassCallService(
  cfg: OpenClawConfig | undefined,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return await hassPost(
    cfg,
    `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
    data,
  );
}

/**
 * Get entity history for a time period.
 */
export async function hassGetHistory(
  cfg: OpenClawConfig | undefined,
  entityId: string,
  startTime?: string,
  endTime?: string,
): Promise<unknown> {
  let path = "/api/history/period";
  if (startTime) {
    path += `/${encodeURIComponent(startTime)}`;
  }
  const params = new URLSearchParams();
  params.set("filter_entity_id", entityId);
  params.set("minimal_response", "");
  params.set("no_attributes", "");
  if (endTime) {
    params.set("end_time", endTime);
  }
  return await hassGet(cfg, `${path}?${params.toString()}`);
}

/**
 * Get Home Assistant configuration info.
 */
export async function hassGetConfig(cfg?: OpenClawConfig): Promise<Record<string, unknown>> {
  return (await hassGet(cfg, "/api/config")) as Record<string, unknown>;
}
