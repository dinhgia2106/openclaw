import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  createCallServiceTool,
  createGetEntityTool,
  createGetHistoryTool,
  createGetServicesTool,
  createGetStatesTool,
} from "./src/tools.js";

export default definePluginEntry({
  id: "home-assistant",
  name: "Home Assistant",
  description:
    "Smart home control via Home Assistant REST API. Supports lights, switches, climate, locks, covers, sensors, automations, and more.",
  register(api) {
    api.registerTool((ctx) => createGetStatesTool(api, ctx), { name: "hass_get_states" });
    api.registerTool((ctx) => createGetEntityTool(api, ctx), { name: "hass_get_entity" });
    api.registerTool((ctx) => createCallServiceTool(api, ctx), { name: "hass_call_service" });
    api.registerTool((ctx) => createGetServicesTool(api, ctx), { name: "hass_get_services" });
    api.registerTool((ctx) => createGetHistoryTool(api, ctx), { name: "hass_get_history" });
  },
});
