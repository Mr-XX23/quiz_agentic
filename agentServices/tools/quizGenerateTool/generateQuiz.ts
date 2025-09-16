// libraries
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { config } from "dotenv";

// local imports
import { structuredJSONData } from "./structuredResponse";

// load environment variables
config();

// Define state that persists across nodes
const QuizState = Annotation.Root({
  userPrompt: Annotation<string>,
  collectedQuestions: Annotation<any[]>,
  targetCount: Annotation<number>,
  attemptCount: Annotation<number>,
  finalResult: Annotation<any>,
  error: Annotation<string | null>,
});

// system prompt for quiz generation
export const QUIZ_GENERATION_SYSTEM_PROMPT = [
  `Your job is to create quiz questions for me. You MUST create exactly the number of quiz questions said by the user — no more, no less.`,
  `CRITICAL REQUIREMENTS: The final JSON must contain exactly the number of quiz questions specified by the user in the quiz_questions array. Count them before responding to make sure you do not create too few or too many. If you accidentally create more or fewer questions, fix it before final output.`,
  `Create powerful and compelling quiz questions based on the provided topic/content and ensure the questions are clear, concise, and relevant to the subject matter.`,
  `Here are the steps for you to follow STRICTLY:`,
  `1) Generate exactly the number of questions specified by the user, with multiple choice format and 5 options each (A, B, C, D, E).`,
  `2) For each question, manually assign the correct answer to positions A, B, C, D, or E randomly.`,
  `3) Ensure correct answers are evenly distributed across positions (roughly the same count for each letter).`,
  `4) Make all answer options similar in length and complexity so the correct answer doesn't stand out.`,
  `5) MANDATORY: Before outputting, count your questions to ensure you have exactly the number specified by the user.`,
  `6) If you have fewer questions, generate more. If you have more questions, remove the extra ones.`,
  `7) You MUST include a total_questions field in the output JSON, and its value must exactly match the number of questions you generated in quiz_questions.`,
  `Provide the final result in this JSON format: {"total_questions":20,"quiz_questions":[{"question":"What is...?","correct_answer":"A","answers":[{"answer":"A. Option 1"},{"answer":"B. Option 2"},{"answer":"C. Option 3"},{"answer":"D. Option 4"},{"answer":"E. Option 5"}]}]}.`,
  `The quiz_questions array MUST contain exactly the number of question objects specified by the user, and total_questions MUST equal that number.`
].join(" ");

// function / tool logic to generate quiz
export const generateQuiz = async (prompt: string) => {

  try {

    // define llm for quiz generation
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // invoke llm with system and user prompts
    const response = await llm.invoke([
      { role: "system", content: QUIZ_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: `Generate a quiz based on the following prompt: ${prompt}` }
    ]);

    // Return plain text (string) for downstream parsing by the structurer tool
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    if (!content || content.trim().length === 0) {
      throw new Error("Quiz generation produced empty content");
    }

    // return content
    console.log("Generated quiz content:", content);
    return content;

  } catch (error: any) {

    // log error and rethrow
    throw new Error(`Quiz generation failed: ${error?.message ?? String(error)}`);

  }
};

// Node 1: Generate initial batch of questions
async function generateInitialQuiz(state: typeof QuizState.State) {
  try {
    const prompt = `Generate exactly 20 quiz questions about: ${state.userPrompt}. 
    CRITICAL: Return exactly 20 questions in JSON format with quiz_questions array.`;

    const content = await generateQuiz(prompt);

    // Parse and extract questions
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.at(0) || "{}");
    const questions = parsed.quiz_questions || [];

    console.log(`Generated ${questions.length} questions on attempt ${state.attemptCount + 1}`);

    return {
      collectedQuestions: questions,
      attemptCount: state.attemptCount + 1,
    };
  } catch (error: any) {
    return { error: `Generation failed: ${error.message}` };
  }
}

// Node 2: Check if we need more questions
async function checkQuestionCount(state: typeof QuizState.State) {
  const currentCount = state.collectedQuestions.length;
  const needed = state.targetCount - currentCount;

  console.log(`Current: ${currentCount}, Target: ${state.targetCount}, Needed: ${needed}`);

  if (currentCount === state.targetCount) {
    return { finalResult: "ready_for_validation" };
  } else if (currentCount > state.targetCount) {
    // Trim excess questions
    const trimmed = state.collectedQuestions.slice(0, state.targetCount);
    return { collectedQuestions: trimmed, finalResult: "ready_for_validation" };
  } else if (state.attemptCount >= 3) {
    return { error: "Max attempts reached, could not generate exactly 20 questions" };
  } else {
    return { finalResult: `need_${needed}_more` };
  }
}

// Node 3: Generate additional questions to fill the gap
async function generateAdditionalQuiz(state: typeof QuizState.State) {
  try {
    const currentCount = state.collectedQuestions.length;
    const needed = state.targetCount - currentCount;

    const prompt = `Generate exactly ${needed} additional quiz questions about: ${state.userPrompt}. 
    IMPORTANT: Generate ONLY ${needed} questions (not 20). Return in JSON format.`;

    const content = await generateQuiz(prompt);
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.at(0) || "{}");
    const newQuestions = parsed.quiz_questions || [];

    // Append to existing collection
    const combined = [...state.collectedQuestions, ...newQuestions];

    console.log(`Added ${newQuestions.length} questions, total now: ${combined.length}`);

    return {
      collectedQuestions: combined,
      attemptCount: state.attemptCount + 1,
    };
  } catch (error: any) {
    return { error: `Additional generation failed: ${error.message}` };
  }
}

// Node 4: Validate and structure the final result
async function validateAndStructure(state: typeof QuizState.State) {
  try {
    // Create the exact format expected by the schema
    const quizData = {
      quiz_questions: state.collectedQuestions
    };

    const validated = await structuredJSONData(JSON.stringify(quizData));
    return { finalResult: validated };
  } catch (error: any) {
    return { error: `Validation failed: ${error.message}` };
  }
}

// Node 5 : Handle errors
async function handleError(state: typeof QuizState.State) {
  console.error("Quiz generation failed:", state.error);
  throw new Error(state.error || "Unknown error in quiz generation");
}

// Routing functions
function routeAfterCount(state: typeof QuizState.State) {
  if (state.error) return "handle_error";
  if (state.finalResult === "ready_for_validation") return "validate";
  if (state.finalResult?.startsWith("need_")) return "generate_additional";
  return "handle_error";
}

// Routing after additional generation
function routeAfterAdditional(state: typeof QuizState.State) {
  if (state.error) return "handle_error";
  return "check_count";
}

// Routing after validation
function routeAfterValidation(state: typeof QuizState.State) {
  if (state.error) return "handle_error";
  return END;
}

// Create the state graph for the quiz agent
export function createQuizAgentGraph() {

  // define workflow 
  const workflow = new StateGraph(QuizState)
    .addNode("generate_initial", generateInitialQuiz)
    .addNode("check_count", checkQuestionCount)
    .addNode("generate_additional", generateAdditionalQuiz)
    .addNode("validate", validateAndStructure)
    .addNode("handle_error", handleError)

    // Flow: START -> generate_initial -> check_count
    .addEdge(START, "generate_initial")
    .addEdge("generate_initial", "check_count")

    // Conditional routing from check_count
    .addConditionalEdges("check_count", routeAfterCount, {
      "validate": "validate",
      "generate_additional": "generate_additional",
      "handle_error": "handle_error"
    })

    // After generating additional questions, check count again
    .addConditionalEdges("generate_additional", routeAfterAdditional, {
      "check_count": "check_count",
      "handle_error": "handle_error"
    })

    // After validation, either end or handle error
    .addConditionalEdges("validate", routeAfterValidation, {
      [END]: END,
      "handle_error": "handle_error"
    });

  return workflow.compile();

}

// Main function to run the quiz agent
export async function runQuizAgentGraph(prompt: string) {

  const graph = createQuizAgentGraph();

  const initialState = {
    userPrompt: prompt,
    collectedQuestions: [],
    targetCount: 20,
    attemptCount: 0,
    finalResult: null,
    error: null,
  };

  try {
    const result = await graph.invoke(initialState);
    return result.finalResult;
  } catch (error: any) {
    console.error("Quiz agent failed:", error);
    throw error;
  }

}