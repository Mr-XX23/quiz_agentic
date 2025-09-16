// libraries
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";

// local imports
import { runAgent } from "./agentController/agent";
import quizRouter from "./routes";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Serve static files for A2A discovery (agent.json)
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

// A2A routes
app.use("/api", quizRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "operational", 
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    agent: "Quiz Generation Agent"
  });
});

// Original main endpoint (for backward compatibility)
app.use("/", async (req, res, next) => {

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {

    // run the agent with the user prompt
    const result = await runAgent(prompt);

    // log and return the final structured response
    console.log("Quiz agent result:", result);

    // final response must be ONLY the complete validated JSON
    const finalResponse = JSON.parse(result);

    // return the final structured JSON response
    res.json(finalResponse);

  } catch (error: any) {
    // log and return error
    console.error("Server error:", error);

    // If the error is a known type, return a specific message
    res.status(500).json({ error: error.message });

  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quiz agent API listening on http://localhost:${PORT}`);
});