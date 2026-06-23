import { catalogTools } from './catalogTools.js';
import { orderTools } from './orderTools.js';
import { logger } from '../../../config/logger.js';

const allTools = [...catalogTools, ...orderTools];
const toolMap = new Map(allTools.map((t) => [t.name, t]));

// Definitions handed to the LLM (no handlers — provider-agnostic shape).
export function getToolDefinitions() {
  return allTools.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

// Execute a tool by name. Returns a JSON-serializable result (never throws —
// errors are returned to the model so it can recover gracefully).
export async function executeTool(name, input, ctx) {
  const tool = toolMap.get(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.handler(input ?? {}, ctx);
  } catch (err) {
    logger.error({ err, tool: name, tenantId: ctx?.tenantId }, 'tool execution failed');
    return { error: `Tool "${name}" failed: ${err.message}` };
  }
}

export { allTools };
