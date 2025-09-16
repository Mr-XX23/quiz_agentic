// A2A Agent Communication Tools
// Tools that allow this agent to communicate with other A2A-compatible agents

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// A2A Agent Discovery Tool
export const a2aDiscoverAgent = tool(
  async ({ agentUrl }: { agentUrl: string }) => {
    try {
      const discoveryUrl = `${agentUrl.replace(/\/$/, '')}/.well-known/agent.json`;
      const response = await fetch(discoveryUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to discover agent at ${discoveryUrl}: ${response.status}`);
      }
      
      const agentCard = await response.json();
      
      return {
        success: true,
        agent: agentCard,
        capabilities: agentCard.capabilities || [],
        serviceEndpoint: agentCard.serviceEndpoint,
        methods: agentCard.methods || []
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        agent: null
      };
    }
  },
  {
    name: "a2a_discover_agent",
    description: "Discover the capabilities of another A2A-compatible agent by fetching its agent.json",
    schema: z.object({
      agentUrl: z.string().describe("Base URL of the agent to discover (e.g., https://example.com)")
    })
  }
);

// A2A Agent Communication Tool
export const a2aCommunicateWithAgent = tool(
  async ({ agentUrl, method, params, useIndividualEndpoint = false }: { 
    agentUrl: string; 
    method: string; 
    params?: any;
    useIndividualEndpoint?: boolean;
  }) => {
    try {
      // First discover the agent to get endpoint information
      const discoveryResult = await a2aDiscoverAgent.invoke({ agentUrl });
      
      if (!discoveryResult.success) {
        throw new Error(`Failed to discover agent: ${discoveryResult.error}`);
      }
      
      const agent = discoveryResult.agent;
      
      // Determine the endpoint to use
      let endpoint: string;
      
      if (useIndividualEndpoint && agent.serviceEndpoints && agent.serviceEndpoints[method]) {
        // Use individual method endpoint
        endpoint = `${agentUrl.replace(/\/$/, '')}${agent.serviceEndpoints[method]}`;
      } else {
        // Use main service endpoint
        endpoint = `${agentUrl.replace(/\/$/, '')}${agent.serviceEndpoint || '/api/a2a/service'}`;
      }
      
      // Prepare JSON-RPC request
      const payload: any = {
        jsonrpc: "2.0",
        id: Date.now(),
        params: params || {}
      };
      
      // Only add method if using main service endpoint
      if (!useIndividualEndpoint || !agent.serviceEndpoints?.[method]) {
        payload.method = method;
      }
      
      // Make the request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Quiz-Agent-A2A-Client/1.0'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Check for JSON-RPC errors
      if (result.error) {
        throw new Error(`Agent returned error: ${result.error.message} (code: ${result.error.code})`);
      }
      
      return {
        success: true,
        result: result.result,
        agent: agent.name,
        method: method,
        endpoint: endpoint
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        agent: null,
        method: method
      };
    }
  },
  {
    name: "a2a_communicate_with_agent",
    description: "Communicate with another A2A-compatible agent using JSON-RPC protocol",
    schema: z.object({
      agentUrl: z.string().describe("Base URL of the agent to communicate with"),
      method: z.string().describe("Method name to call on the remote agent"),
      params: z.any().optional().describe("Parameters to pass to the remote agent method"),
      useIndividualEndpoint: z.boolean().optional().describe("Whether to use individual method endpoint if available")
    })
  }
);

// Collaborative Quiz Generation Tool
export const a2aCollaborativeQuizGeneration = tool(
  async ({ 
    topic,
    collaboratorAgentUrl,
    researchAgentUrl,
    difficulty = "medium"
  }: { 
    topic: string;
    collaboratorAgentUrl?: string;
    researchAgentUrl?: string;
    difficulty?: string;
  }) => {
    try {
      const results: any = {
        topic,
        difficulty,
        collaborators: [],
        research_sources: [],
        quiz_questions: [],
        collaboration_notes: []
      };
      
      // Step 1: Research phase (if research agent is provided)
      if (researchAgentUrl) {
        try {
          const researchResult = await a2aCommunicateWithAgent.invoke({
            agentUrl: researchAgentUrl,
            method: "web.search",
            params: { query: topic, maxResults: 5 }
          });
          
          if (researchResult.success) {
            results.research_sources = researchResult.result.results || [];
            results.collaboration_notes.push(`Research completed by ${researchResult.agent}`);
            
            // Extract content from research URLs if available
            if (results.research_sources.length > 0) {
              const extractResult = await a2aCommunicateWithAgent.invoke({
                agentUrl: researchAgentUrl,
                method: "web.batch_extract_content",
                params: { 
                  urls: results.research_sources.slice(0, 3).map((r: any) => r.url).filter(Boolean),
                  maxContentLength: 8000
                }
              });
              
              if (extractResult.success) {
                results.research_content = extractResult.result.combinedContent;
              }
            }
          }
        } catch (error: any) {
          results.collaboration_notes.push(`Research failed: ${error.message}`);
        }
      }
      
      // Step 2: Generate our portion of the quiz
      const localPrompt = results.research_content 
        ? `Create 10 quiz questions about: ${topic}\n\nDifficulty: ${difficulty}\n\nRESEARCH CONTENT:\n${results.research_content}`
        : `Create 10 quiz questions about: ${topic}\n\nDifficulty: ${difficulty}`;
      
      // Import and use local quiz generation
      const { runAgent } = await import("./agent");
      const localQuizResult = await runAgent(localPrompt);
      const localQuiz = JSON.parse(localQuizResult);
      
      if (localQuiz.quiz_questions && localQuiz.quiz_questions.length > 0) {
        results.quiz_questions.push(...localQuiz.quiz_questions.slice(0, 10));
        results.collaboration_notes.push("Generated 10 questions locally");
      }
      
      // Step 3: Collaborate with another quiz agent (if provided)
      if (collaboratorAgentUrl) {
        try {
          const collaborationPrompt = results.research_content
            ? `Create 10 additional quiz questions about: ${topic}\n\nDifficulty: ${difficulty}\n\nRESEARCH CONTENT:\n${results.research_content}`
            : `Create 10 additional quiz questions about: ${topic}\n\nDifficulty: ${difficulty}`;
            
          const collaboratorResult = await a2aCommunicateWithAgent.invoke({
            agentUrl: collaboratorAgentUrl,
            method: "quiz.generate",
            params: { 
              topic: collaborationPrompt,
              difficulty,
              researchContent: results.research_content
            }
          });
          
          if (collaboratorResult.success && collaboratorResult.result.quiz_questions) {
            results.quiz_questions.push(...collaboratorResult.result.quiz_questions.slice(0, 10));
            results.collaborators.push(collaboratorResult.agent);
            results.collaboration_notes.push(`Generated 10 questions via ${collaboratorResult.agent}`);
          }
        } catch (error: any) {
          results.collaboration_notes.push(`Collaboration failed: ${error.message}`);
        }
      }
      
      // Step 4: Ensure we have exactly 20 questions
      const totalQuestions = results.quiz_questions.length;
      
      if (totalQuestions < 20) {
        // Generate remaining questions locally
        const remaining = 20 - totalQuestions;
        const supplementalPrompt = `Create ${remaining} additional quiz questions about: ${topic}\n\nDifficulty: ${difficulty}`;
        
        try {
          const supplementalResult = await runAgent(supplementalPrompt);
          const supplementalQuiz = JSON.parse(supplementalResult);
          
          if (supplementalQuiz.quiz_questions) {
            results.quiz_questions.push(...supplementalQuiz.quiz_questions.slice(0, remaining));
            results.collaboration_notes.push(`Generated ${remaining} supplemental questions locally`);
          }
        } catch (error: any) {
          results.collaboration_notes.push(`Failed to generate supplemental questions: ${error.message}`);
        }
      } else if (totalQuestions > 20) {
        // Trim to exactly 20 questions
        results.quiz_questions = results.quiz_questions.slice(0, 20);
        results.collaboration_notes.push(`Trimmed to exactly 20 questions`);
      }
      
      return {
        success: true,
        total_questions: results.quiz_questions.length,
        quiz_questions: results.quiz_questions,
        collaboration_metadata: {
          collaborators: results.collaborators,
          research_sources: results.research_sources.length,
          collaboration_notes: results.collaboration_notes
        }
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        collaboration_metadata: {
          collaborators: [],
          research_sources: 0,
          collaboration_notes: [`Collaborative generation failed: ${error.message}`]
        }
      };
    }
  },
  {
    name: "a2a_collaborative_quiz_generation",
    description: "Generate a quiz collaboratively with other A2A agents, combining research and question generation capabilities",
    schema: z.object({
      topic: z.string().describe("Topic for the quiz"),
      collaboratorAgentUrl: z.string().optional().describe("URL of another quiz generation agent to collaborate with"),
      researchAgentUrl: z.string().optional().describe("URL of a research agent to gather information"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Difficulty level for the quiz")
    })
  }
);

// Export all A2A communication tools
export const a2aTools = [
  a2aDiscoverAgent,
  a2aCommunicateWithAgent, 
  a2aCollaborativeQuizGeneration
];