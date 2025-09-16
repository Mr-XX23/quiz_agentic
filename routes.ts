import express from "express";
import { generateQuiz, generateStreamingQuiz } from "./agentController/agentController";

const quizRouter = express.Router();

quizRouter.post("/quiz", generateQuiz);
quizRouter.get("/quiz/stream", generateStreamingQuiz);

export default quizRouter;