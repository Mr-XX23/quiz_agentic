// Protocol Package Main Export
export * from "./mcp/mcpServer";
export * from "./mcp/mcpClient";
export * from "./a2a/a2aAgent";
export * from "./a2a/a2aCoordinator";
export * from "./protocolRouter";
export * from "./protocolManager";

// Re-export commonly used classes and functions
export { QuizAgentMCPServer, startMCPServer } from "./mcp/mcpServer";
export { QuizAgentMCPClient, mcpClient, setupCommonMCPConnections } from "./mcp/mcpClient";
export { A2AAgent, createQuizA2AAgent } from "./a2a/a2aAgent";
export { A2ACoordinator, coordinator } from "./a2a/a2aCoordinator";
export { protocolRouter, protocolMiddleware, protocolStatusHandler } from "./protocolRouter";
export { protocolManager, defaultProtocolConfig } from "./protocolManager";