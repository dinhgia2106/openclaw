import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { Type } from "typebox";
import {
  hassCallService,
  hassGetEntityState,
  hassGetHistory,
  hassGetServices,
  hassGetStates,
  type HassState,
} from "./hass-client.js";

type HassToolConfigContext = Pick<
  OpenClawPluginToolContext,
  "config" | "runtimeConfig" | "getRuntimeConfig"
>;

function resolveToolConfig(api: OpenClawPluginApi, ctx?: HassToolConfigContext): OpenClawConfig {
  return ctx?.getRuntimeConfig?.() ?? ctx?.runtimeConfig ?? ctx?.config ?? api.config;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(params: Record<string, unknown>, key: string): string {
  const raw = params[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${key} is required`);
  }
  return raw.trim();
}

function readOptionalString(params: Record<string, unknown>, key: string): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function jsonToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * Compact a full state object to reduce token usage.
 */
function compactState(s: HassState): Record<string, unknown> {
  const result: Record<string, unknown> = {
    entity_id: s.entity_id,
    state: s.state,
  };
  const friendlyName = s.attributes?.friendly_name;
  if (friendlyName) {
    result.name = friendlyName;
  }
  const unit = s.attributes?.unit_of_measurement;
  if (unit) {
    result.unit = unit;
  }
  const deviceClass = s.attributes?.device_class;
  if (deviceClass) {
    result.device_class = deviceClass;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tool: hass_get_states
// ---------------------------------------------------------------------------

const GetStatesSchema = Type.Object(
  {
    domain: Type.Optional(
      Type.String({
        description:
          'Filter entities by domain (e.g. "light", "switch", "sensor", "climate", "lock", "cover"). Returns all entities if omitted.',
      }),
    ),
  },
  { additionalProperties: false },
);

export function createGetStatesTool(api: OpenClawPluginApi, ctx?: HassToolConfigContext) {
  return {
    name: "hass_get_states",
    label: "Home Assistant: Get States",
    description:
      "List all smart home device states from Home Assistant. Optionally filter by domain (light, switch, sensor, climate, lock, cover, etc.).",
    parameters: GetStatesSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const cfg = resolveToolConfig(api, ctx);
      const domain = readOptionalString(rawParams, "domain");

      let states = await hassGetStates(cfg);

      if (domain) {
        const prefix = `${domain}.`;
        states = states.filter((s) => s.entity_id.startsWith(prefix));
      }

      const compact = states.map(compactState);
      return jsonToolResult({
        count: compact.length,
        ...(domain ? { domain } : {}),
        entities: compact,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hass_get_entity
// ---------------------------------------------------------------------------

const GetEntitySchema = Type.Object(
  {
    entity_id: Type.String({
      description:
        'The entity ID to query (e.g. "light.living_room", "sensor.temperature", "switch.fan").',
    }),
  },
  { additionalProperties: false },
);

export function createGetEntityTool(api: OpenClawPluginApi, ctx?: HassToolConfigContext) {
  return {
    name: "hass_get_entity",
    label: "Home Assistant: Get Entity",
    description:
      "Get the current state and attributes of a specific Home Assistant entity by its entity_id.",
    parameters: GetEntitySchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const cfg = resolveToolConfig(api, ctx);
      const entityId = readString(rawParams, "entity_id");
      const state = await hassGetEntityState(cfg, entityId);
      return jsonToolResult(state);
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hass_call_service
// ---------------------------------------------------------------------------

const CallServiceSchema = Type.Object(
  {
    domain: Type.String({
      description:
        'The service domain (e.g. "light", "switch", "climate", "lock", "cover", "automation", "scene", "script", "media_player").',
    }),
    service: Type.String({
      description:
        'The service to call (e.g. "turn_on", "turn_off", "toggle", "set_temperature", "lock", "unlock", "open_cover", "close_cover", "trigger").',
    }),
    entity_id: Type.Optional(
      Type.String({
        description: 'Target entity ID (e.g. "light.living_room"). Required for most services.',
      }),
    ),
    data: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description:
          'Additional service data as key-value pairs (e.g. {"brightness": 128, "color_name": "blue"} for light, {"temperature": 24} for climate).',
      }),
    ),
  },
  { additionalProperties: false },
);

export function createCallServiceTool(api: OpenClawPluginApi, ctx?: HassToolConfigContext) {
  return {
    name: "hass_call_service",
    label: "Home Assistant: Call Service",
    description:
      "Control a smart home device by calling a Home Assistant service. Supports lights, switches, climate, locks, covers, automations, scenes, scripts, media players, and more.",
    parameters: CallServiceSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const cfg = resolveToolConfig(api, ctx);
      const domain = readString(rawParams, "domain");
      const service = readString(rawParams, "service");
      const entityId = readOptionalString(rawParams, "entity_id");
      const extraData =
        rawParams.data && typeof rawParams.data === "object" && !Array.isArray(rawParams.data)
          ? (rawParams.data as Record<string, unknown>)
          : {};

      const serviceData: Record<string, unknown> = { ...extraData };
      if (entityId) {
        serviceData.entity_id = entityId;
      }

      const result = await hassCallService(cfg, domain, service, serviceData);
      return jsonToolResult({
        status: "ok",
        called: `${domain}.${service}`,
        ...(entityId ? { entity_id: entityId } : {}),
        result,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hass_get_services
// ---------------------------------------------------------------------------

const GetServicesSchema = Type.Object(
  {
    domain: Type.Optional(
      Type.String({
        description: 'Filter by domain (e.g. "light", "switch"). Returns all domains if omitted.',
      }),
    ),
  },
  { additionalProperties: false },
);

export function createGetServicesTool(api: OpenClawPluginApi, ctx?: HassToolConfigContext) {
  return {
    name: "hass_get_services",
    label: "Home Assistant: Get Services",
    description:
      "List all available Home Assistant services. Useful to discover what actions can be performed on devices. Optionally filter by domain.",
    parameters: GetServicesSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const cfg = resolveToolConfig(api, ctx);
      const domainFilter = readOptionalString(rawParams, "domain");

      let services = await hassGetServices(cfg);
      if (domainFilter) {
        services = services.filter((s) => s.domain === domainFilter);
      }

      // Compact output: just domain + service names, skip full schema
      const compact = services.map((s) => ({
        domain: s.domain,
        services: Object.keys(s.services),
      }));

      return jsonToolResult({
        count: compact.length,
        domains: compact,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: hass_get_history
// ---------------------------------------------------------------------------

const GetHistorySchema = Type.Object(
  {
    entity_id: Type.String({
      description: 'The entity ID to get history for (e.g. "sensor.temperature").',
    }),
    start_time: Type.Optional(
      Type.String({
        description:
          "Start time in ISO 8601 format (e.g. 2026-05-07T00:00:00+07:00). Defaults to 24 hours ago.",
      }),
    ),
    end_time: Type.Optional(
      Type.String({
        description: "End time in ISO 8601 format. Defaults to now.",
      }),
    ),
  },
  { additionalProperties: false },
);

export function createGetHistoryTool(api: OpenClawPluginApi, ctx?: HassToolConfigContext) {
  return {
    name: "hass_get_history",
    label: "Home Assistant: Get History",
    description:
      "Get the state history of a Home Assistant entity for a time period. Returns state changes over time. Useful for checking sensor values, device usage patterns, and event logs.",
    parameters: GetHistorySchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const cfg = resolveToolConfig(api, ctx);
      const entityId = readString(rawParams, "entity_id");
      const startTime = readOptionalString(rawParams, "start_time");
      const endTime = readOptionalString(rawParams, "end_time");

      const history = await hassGetHistory(cfg, entityId, startTime, endTime);
      return jsonToolResult({
        entity_id: entityId,
        history,
      });
    },
  };
}
