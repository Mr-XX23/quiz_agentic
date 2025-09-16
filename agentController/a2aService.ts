// A2A Service Layer - JSON-RPC compatible endpoints for agent-to-agent communication
import { Request, Response } from "express";
import { runAgent } from "../agentController/agent";
import { travilyWebSearchTool } from "../agentServices/tools/webSearchTool/webSearchTool";
import { batchWebContentExtractorController } from "../agentServices/tools/webSearchTool/batchWebContentExtractor";

// JSON-RPC error codes
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AGENT_ERROR: -32001
};

// JSON-RPC response helpers
const createSuccessResponse = (id: any, result: any) => ({
  jsonrpc: "2.0",
  id,
  result
});

const createErrorResponse = (id: any, code: number, message: string, data?: any) => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message,
    ...(data && { data })
  }
});

// Validate JSON-RPC request structure
const validateJsonRpcRequest = (body: any): { valid: boolean; error?: any } => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: createErrorResponse(null, ERROR_CODES.PARSE_ERROR, "Parse error") };
  }

  if (body.jsonrpc !== "2.0") {
    return { valid: false, error: createErrorResponse(body.id, ERROR_CODES.INVALID_REQUEST, "Invalid Request - jsonrpc must be '2.0'") };
  }

  if (!body.method || typeof body.method !== 'string') {
    return { valid: false, error: createErrorResponse(body.id, ERROR_CODES.INVALID_REQUEST, "Invalid Request - method is required") };
  }

  return { valid: true };
};

// Main A2A service endpoint (handles all methods in single endpoint)
export const a2aServiceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = validateJsonRpcRequest(req.body);
    if (!validation.valid) {
      res.status(400).json(validation.error);
      return;
    }

    const { method, params = {}, id } = req.body;

    switch (method) {
      case 'quiz.generate':
        await handleQuizGenerate(req, res, params, id);
        break;
      
      case 'quiz.generate_with_research':
        await handleQuizGenerateWithResearch(req, res, params, id);
        break;
      
      case 'web.search':
        await handleWebSearch(req, res, params, id);
        break;
      
      case 'web.batch_extract_content':
        await handleBatchExtractContent(req, res, params, id);
        break;
      
      default:
        res.status(404).json(
          createErrorResponse(id, ERROR_CODES.METHOD_NOT_FOUND, `Method '${method}' not found`)
        );
    }
  } catch (error: any) {
    console.error("A2A Service Error:", error);
    res.status(500).json(
      createErrorResponse(
        req.body?.id, 
        ERROR_CODES.INTERNAL_ERROR, 
        "Internal error",
        { message: error.message }
      )
    );
  }
};

// Individual method handlers

// Quiz generation handler
const handleQuizGenerate = async (req: Request, res: Response, params: any, id: any): Promise<void> => {
  try {
    if (!params.topic || typeof params.topic !== 'string') {
      res.status(400).json(
        createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "Invalid params - 'topic' is required and must be a string")
      );
      return;
    }

    let prompt = params.topic;
    
    // Add research content if provided
    if (params.researchContent && typeof params.researchContent === 'string') {
      prompt = `Create a quiz about: ${params.topic}\n\nRESEARCH CONTENT TO BASE QUESTIONS ON:\n${params.researchContent}\n\nUse this research content to create accurate, detailed quiz questions.`;
    }

    // Add difficulty if specified
    if (params.difficulty && ['easy', 'medium', 'hard'].includes(params.difficulty)) {
      prompt = `${prompt}\n\nDifficulty level: ${params.difficulty}`;
    }

    const result = await runAgent(prompt);
    const parsedResult = JSON.parse(result);
    
    res.json(createSuccessResponse(id, parsedResult));
  } catch (error: any) {
    console.error("Quiz generation error:", error);
    res.status(500).json(
      createErrorResponse(id, ERROR_CODES.AGENT_ERROR, "Quiz generation failed", { message: error.message })
    );
  }
};

// Quiz generation with research handler
const handleQuizGenerateWithResearch = async (req: Request, res: Response, params: any, id: any): Promise<void> => {
  try {
    if (!params.topic || typeof params.topic !== 'string') {
      res.status(400).json(
        createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "Invalid params - 'topic' is required and must be a string")
      );
      return;
    }

    const maxResults = params.maxResults || 5;
    const researchSources: string[] = [];

    try {
      // First perform web search
      const searchResults = await travilyWebSearchTool({ 
        query: params.topic, 
        maxResults 
      });

      // Extract URLs from search results
      const urls = searchResults.results?.map((result: any) => result.url).filter(Boolean) || [];
      researchSources.push(...urls);

      // Extract content from URLs
      let researchContent = '';
      if (urls.length > 0) {
        const extractedContent = await batchWebContentExtractorController({ 
          urls,
          maxContentLength: 8000 
        });
        researchContent = extractedContent.combinedContent || '';
      }

      // Generate quiz with research content
      const prompt = researchContent 
        ? `Create a quiz about: ${params.topic}\n\nRESEARCH CONTENT TO BASE QUESTIONS ON:\n${researchContent}\n\nUse this research content to create accurate, detailed quiz questions.`
        : params.topic;

      const result = await runAgent(prompt);
      const parsedResult = JSON.parse(result);
      
      // Add research sources to response
      const responseData = {
        ...parsedResult,
        research_sources: researchSources
      };

      res.json(createSuccessResponse(id, responseData));
    } catch (researchError: any) {
      console.warn("Research failed, falling back to direct generation:", researchError);
      
      // Fallback to basic quiz generation if research fails
      const result = await runAgent(params.topic);
      const parsedResult = JSON.parse(result);
      
      const responseData = {
        ...parsedResult,
        research_sources: [],
        research_note: "Research failed, quiz generated from general knowledge"
      };

      res.json(createSuccessResponse(id, responseData));
    }
  } catch (error: any) {
    console.error("Quiz generation with research error:", error);
    res.status(500).json(
      createErrorResponse(id, ERROR_CODES.AGENT_ERROR, "Quiz generation with research failed", { message: error.message })
    );
  }
};

// Web search handler
const handleWebSearch = async (req: Request, res: Response, params: any, id: any): Promise<void> => {
  try {
    if (!params.query || typeof params.query !== 'string') {
      res.status(400).json(
        createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "Invalid params - 'query' is required and must be a string")
      );
      return;
    }

    const maxResults = params.maxResults || 5;
    const searchResults = await travilyWebSearchTool({ 
      query: params.query, 
      maxResults 
    });

    res.json(createSuccessResponse(id, { results: searchResults.results || [] }));
  } catch (error: any) {
    console.error("Web search error:", error);
    res.status(500).json(
      createErrorResponse(id, ERROR_CODES.AGENT_ERROR, "Web search failed", { message: error.message })
    );
  }
};

// Batch content extraction handler  
const handleBatchExtractContent = async (req: Request, res: Response, params: any, id: any): Promise<void> => {
  try {
    if (!params.urls || !Array.isArray(params.urls) || params.urls.length === 0) {
      res.status(400).json(
        createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "Invalid params - 'urls' is required and must be a non-empty array")
      );
      return;
    }

    // Validate that all URLs are strings
    if (!params.urls.every((url: any) => typeof url === 'string')) {
      res.status(400).json(
        createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "Invalid params - all URLs must be strings")
      );
      return;
    }

    const maxContentLength = params.maxContentLength || 8000;
    const result = await batchWebContentExtractorController({ 
      urls: params.urls, 
      maxContentLength 
    });

    const responseData = {
      combinedContent: result.combinedContent || '',
      successfulUrls: result.successfulUrls || [],
      failedUrls: result.failedUrls || []
    };

    res.json(createSuccessResponse(id, responseData));
  } catch (error: any) {
    console.error("Batch content extraction error:", error);
    res.status(500).json(
      createErrorResponse(id, ERROR_CODES.AGENT_ERROR, "Batch content extraction failed", { message: error.message })
    );
  }
};

// Individual endpoint handlers (for specific method endpoints)
export const quizGenerateHandler = async (req: Request, res: Response): Promise<void> => {
  const validation = validateJsonRpcRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }
  
  await handleQuizGenerate(req, res, req.body.params || {}, req.body.id);
};

export const quizGenerateWithResearchHandler = async (req: Request, res: Response): Promise<void> => {
  const validation = validateJsonRpcRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }
  
  await handleQuizGenerateWithResearch(req, res, req.body.params || {}, req.body.id);
};

export const webSearchHandler = async (req: Request, res: Response): Promise<void> => {
  const validation = validateJsonRpcRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }
  
  await handleWebSearch(req, res, req.body.params || {}, req.body.id);
};

export const batchExtractContentHandler = async (req: Request, res: Response): Promise<void> => {
  const validation = validateJsonRpcRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }
  
  await handleBatchExtractContent(req, res, req.body.params || {}, req.body.id);
};