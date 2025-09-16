import express from "express";
import { generateQuiz, generateStreamingQuiz } from "./agentController/agentController";
import { 
  a2aServiceHandler,
  quizGenerateHandler,
  quizGenerateWithResearchHandler,
  webSearchHandler,
  batchExtractContentHandler
} from "./agentController/a2aService";

const quizRouter = express.Router();

// Original quiz endpoints (for backward compatibility)
quizRouter.post("/quiz", generateQuiz);
quizRouter.get("/quiz/stream", generateStreamingQuiz);

// A2A Protocol endpoints
// Main service endpoint (handles all methods)
quizRouter.post("/a2a/service", a2aServiceHandler);

// Individual method endpoints (alternative to main service endpoint)
quizRouter.post("/a2a/quiz/generate", quizGenerateHandler);
quizRouter.post("/a2a/quiz/generate-with-research", quizGenerateWithResearchHandler);
quizRouter.post("/a2a/web/search", webSearchHandler);
quizRouter.post("/a2a/web/batch-extract", batchExtractContentHandler);

export default quizRouter;