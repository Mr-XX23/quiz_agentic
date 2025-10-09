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
  maxAttempts: Annotation<number>,
  finalResult: Annotation<any>,
  error: Annotation<string | null>,
  attemptHistory: Annotation<any[]>,
  currentStatus: Annotation<string>,
  lastAttemptDetails: Annotation<any>,
});

// system prompt for quiz generation
export const QUIZ_GENERATION_SYSTEM_PROMPT = [
  `You are an expert quiz creator. Your job is to create EXACTLY the number of quiz questions specified by the user.`,

  `CRITICAL SUCCESS CRITERIA:`,
  `- Generate exactly the requested number of questions (usually 20)`,
  `- Each question must be multiple choice with exactly 5 options (A, B, C, D, E)`,
  `- Each question must have a clear correct answer`,
  `- All questions must be relevant to the given topic`,

  `JSON FORMAT REQUIREMENTS:`,
  `{`,
  `  "total_questions": [EXACT_NUMBER_REQUESTED],`,
  `  "quiz_questions": [`,
  `    {`,
  `      "question": "Clear, specific question text?",`,
  `      "correct_answer": "A",`,
  `      "answers": [`,
  `        {"answer": "A. Correct answer option"},`,
  `        {"answer": "B. Incorrect option 1"},`,
  `        {"answer": "C. Incorrect option 2"},`,
  `        {"answer": "D. Incorrect option 3"},`,
  `        {"answer": "E. Incorrect option 4"}`,
  `      ]`,
  `    }`,
  `  ]`,
  `}`,

  `QUALITY REQUIREMENTS:`,
  `- Distribute correct answers evenly across A, B, C, D, E positions`,
  `- Make all answer options similar in length and complexity`,
  `- Ensure questions are clear, unambiguous, and testable`,
  `- Base questions on provided content if research material is included`,

  `BEFORE RESPONDING: Count your questions to ensure you have the exact number requested.`
].join(" ");

// function / tool logic to generate quiz
export const generateQuiz = async (prompt: string, attemptNumber = 1, previousError?: string) => {

  try {

    // Input validation
    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Empty or invalid prompt provided");
    }

    // Limit prompt length to avoid excessive token usage
    if (prompt.length > 10000) {
      throw new Error("Prompt too long (max 10,000 characters)");
    }

    // Adding prompt with context about previous attempts mainly errors
    let enhancedPrompt = prompt;
    if (attemptNumber > 1 && previousError) {
      enhancedPrompt += `\n\nIMPORTANT - This is attempt #${attemptNumber}. Previous attempt failed with: ${previousError}. Please address this issue in your response.`;
    }

    // define llm for quiz generation
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.6,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // invoke llm with system and user prompts
    const response = await llm.invoke([
      { role: "system", content: QUIZ_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: `Generate a quiz based on the following prompt: ${enhancedPrompt}` }
    ]);

    // Return plain text (string) for downstream parsing by the structurer tool
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    if (!content || content.trim().length === 0) {
      throw new Error("Quiz generation produced empty content");
    }

    // JSON validation
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in LLM response. Response may be malformed.");
    }

    // Validate JSON syntax before returning
    try {
      const testParse = JSON.parse(jsonMatch[0]);
      if (!testParse.quiz_questions || !Array.isArray(testParse.quiz_questions)) {
        throw new Error("LLM response missing required 'quiz_questions' array");
      }
    } catch (parseError: any) {
      throw new Error(`Invalid JSON syntax in LLM response: ${parseError.message}`);
    }

    console.log("Generated quiz content:", content);

    console.log(`✅ Quiz generation attempt ${attemptNumber} successful - Generated content with ${content.length} characters`);

    // Return the generated content
    return content;

  } catch (error: any) {

    // log error and rethrow
    const errorMsg = `Quiz generation attempt ${attemptNumber} failed: ${error?.message ?? String(error)}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);

  }
};

// Node 1: Generate initial batch of questions
async function generateInitialQuiz(state: typeof QuizState.State) {
  try {

    console.log(`🔄 Starting initial quiz generation for: "${state.userPrompt}"`);

    const prompt = `Generate exactly ${state.targetCount} quiz questions about: ${state.userPrompt}.\n\nCRITICAL: Return exactly ${state.targetCount} questions in JSON format with quiz_questions array.`;

    const content = await generateQuiz(prompt, state.attemptCount + 1);

    // JSON parsing with better error handling
    let parsed;

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError: any) {
      return {
        error: `JSON parsing failed: ${parseError.message}. LLM may have returned malformed JSON.`,
        currentStatus: "json_parsing_failed",
        lastAttemptDetails: { content: content.substring(0, 500) + "..." }
      };
    }

    const questions = parsed.quiz_questions || [];

    const attemptDetails = {
      attemptNumber: state.attemptCount + 1,
      questionsGenerated: questions.length,
      targetCount: state.targetCount,
      success: true,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Generated ${questions.length}/${state.targetCount} questions on attempt ${state.attemptCount + 1}`);

    return {
      collectedQuestions: questions,
      attemptCount: state.attemptCount + 1,
      attemptHistory: [...(state.attemptHistory || []), attemptDetails],
      currentStatus: `generated_${questions.length}_questions`,
      lastAttemptDetails: attemptDetails
    };

  } catch (error: any) {

    // log error and update state
    const attemptDetails = {
      attemptNumber: state.attemptCount + 1,
      questionsGenerated: 0,
      targetCount: state.targetCount,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    console.error(`❌ Initial generation failed on attempt ${state.attemptCount + 1}: ${error.message}`);

    return {
      error: `Initial generation failed: ${error.message}`,
      currentStatus: "initial_generation_failed",
      attemptCount: state.attemptCount + 1,
      attemptHistory: [...(state.attemptHistory || []), attemptDetails],
      lastAttemptDetails: attemptDetails
    };
  }
}

// Node 2: Check if we need more questions
async function checkQuestionCount(state: typeof QuizState.State) {
  const currentCount = state.collectedQuestions.length;
  const needed = state.targetCount - currentCount;

  console.log(`📊 Count check - Current: ${currentCount}, Target: ${state.targetCount}, Needed: ${needed}, Attempts: ${state.attemptCount}/${state.maxAttempts}`);

  // Perfect count - ready for validation
  if (currentCount === state.targetCount) {
    return {
      finalResult: "ready_for_validation",
      currentStatus: `perfect_count_${currentCount}_questions`
    };
  }

  // Too many questions - trim and validate
  if (currentCount > state.targetCount) {
    const trimmed = state.collectedQuestions.slice(0, state.targetCount);
    console.log(`✂️ Trimming ${currentCount - state.targetCount} excess questions`);
    return {
      collectedQuestions: trimmed,
      finalResult: "ready_for_validation",
      currentStatus: `trimmed_to_${state.targetCount}_questions`
    };
  }

  // Check if we've exceeded max attempts
  if (state.attemptCount >= state.maxAttempts) {
    const errorMsg = `Maximum ${state.maxAttempts} attempts reached. Only generated ${currentCount}/${state.targetCount} questions.`;
    return {
      error: errorMsg,
      currentStatus: "max_attempts_exceeded",
      lastAttemptDetails: {
        finalCount: currentCount,
        targetCount: state.targetCount,
        totalAttempts: state.attemptCount,
        history: state.attemptHistory
      }
    };
  }

  // Need more questions - continue generation
  return {
    finalResult: `need_${needed}_more`,
    currentStatus: `need_${needed}_more_questions_attempt_${state.attemptCount}`
  };
}

// Node 3: Generate additional questions to fill the gap
async function generateAdditionalQuiz(state: typeof QuizState.State) {
  try {
    const currentCount = state.collectedQuestions.length;
    const needed = state.targetCount - currentCount;

    console.log(`🔄 Generating ${needed} additional questions (attempt ${state.attemptCount + 1})`);

    // Adaptive prompt based on previous attempts
    let prompt = `Generate exactly ${needed} additional quiz questions about: ${state.userPrompt}.\n\nIMPORTANT: Generate ONLY ${needed} questions (not ${state.targetCount}). Return in JSON format.`;

    const content = await generateQuiz(prompt, state.attemptCount + 1, `Need exactly ${needed} questions, not more or less`);

    // Parse and validate additional questions
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError: any) {
      return {
        error: `Additional questions JSON parsing failed: ${parseError.message}`,
        currentStatus: "additional_json_parsing_failed"
      };
    }

    const newQuestions = parsed.quiz_questions || [];

    // Append to existing collection
    const combined = [...state.collectedQuestions, ...newQuestions];

    const attemptDetails = {
      attemptNumber: state.attemptCount + 1,
      questionsRequested: needed,
      questionsGenerated: newQuestions.length,
      totalAfterCombining: combined.length,
      success: true,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Added ${newQuestions.length} questions, total now: ${combined.length}`);

    return {
      collectedQuestions: combined,
      attemptCount: state.attemptCount + 1,
      attemptHistory: [...(state.attemptHistory || []), attemptDetails],
      currentStatus: `added_${newQuestions.length}_total_${combined.length}`,
      lastAttemptDetails: attemptDetails
    };

  } catch (error: any) {
    const attemptDetails = {
      attemptNumber: state.attemptCount + 1,
      questionsRequested: state.targetCount - state.collectedQuestions.length,
      questionsGenerated: 0,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    console.error(`❌ Additional generation failed: ${error.message}`);

    return {
      error: `Additional generation failed: ${error.message}`,
      currentStatus: "additional_generation_failed",
      attemptCount: state.attemptCount + 1,
      attemptHistory: [...(state.attemptHistory || []), attemptDetails],
      lastAttemptDetails: attemptDetails
    };
  }
}

// Node 4: Validate and structure the final result
async function validateAndStructure(state: typeof QuizState.State) {
  try {
    console.log(`🔍 Validating ${state.collectedQuestions.length} questions against schema`);

    const quizData = { quiz_questions: state.collectedQuestions };
    const validated = await structuredJSONData(JSON.stringify(quizData));

    console.log(`✅ Validation successful - Quiz ready for delivery`);

    return {
      finalResult: validated,
      currentStatus: "validation_successful"
    };

  } catch (error: any) {
    console.error(`❌ Validation failed: ${error.message}`);

    // Provide detailed validation error context
    return {
      error: `Schema validation failed: ${error.message}. Generated ${state.collectedQuestions.length} questions but schema validation rejected them.`,
      currentStatus: "validation_failed",
      lastAttemptDetails: {
        validationError: error.message,
        questionCount: state.collectedQuestions.length,
        sampleQuestion: state.collectedQuestions[0] || null
      }
    };
  }
}

// Handle errors
async function handleError(state: typeof QuizState.State) {
  const errorReport = {
    error: state.error,
    currentStatus: state.currentStatus,
    attempts: state.attemptCount,
    maxAttempts: state.maxAttempts,
    targetCount: state.targetCount,
    achievedCount: state.collectedQuestions?.length || 0,
    attemptHistory: state.attemptHistory,
    lastAttemptDetails: state.lastAttemptDetails,
    timestamp: new Date().toISOString()
  };

  console.error(`💥 Quiz generation failed with detailed report:`, errorReport);

  // Throw a comprehensive error that the LLM can understand and act upon
  throw new Error(`Quiz generation failed after ${state.attemptCount} attempts. ${state.error} 

Detailed Status: ${state.currentStatus}
Target: ${state.targetCount} questions
Achieved: ${state.collectedQuestions?.length || 0} questions
Attempt History: ${JSON.stringify(state.attemptHistory || [])}

Suggestion: ${state.attemptCount >= state.maxAttempts ?
      'Try with a different topic or simpler requirements' :
      'The LLM may need clearer instructions or the topic may be too complex'
    }`);
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

    // Conditional edges based on state after check_count node 
    .addConditionalEdges("check_count", (state) => {
      if (state.error) return "handle_error";
      if (state.finalResult === "ready_for_validation") return "validate";
      if (state.finalResult?.startsWith("need_")) return "generate_additional";
      return "handle_error";
    }, {
      "validate": "validate",
      "generate_additional": "generate_additional",
      "handle_error": "handle_error"
    })

    .addConditionalEdges("generate_additional", (state) => {
      if (state.error) return "handle_error";
      return "check_count";
    }, {
      "check_count": "check_count",
      "handle_error": "handle_error"
    })

    .addConditionalEdges("validate", (state) => {
      if (state.error) return "handle_error";
      return END;
    }, {
      [END]: END,
      "handle_error": "handle_error"
    });

  return workflow.compile();

}

// Main function to run the quiz agent
export async function runQuizAgentGraph(prompt: string, options: { targetCount?: number, maxAttempts?: number } = {}) {

  const { targetCount = 20, maxAttempts = 4 } = options;

  console.log(`🚀 Starting quiz generation - Target: ${targetCount} questions, Max attempts: ${maxAttempts}`);


  const graph = createQuizAgentGraph();

  const initialState = {
    userPrompt: prompt,
    collectedQuestions: [],
    targetCount,
    maxAttempts,
    attemptCount: 0,
    finalResult: null,
    error: null,
    attemptHistory: [],
    currentStatus: "initializing",
    lastAttemptDetails: null
  };

  try {
    const result = await graph.invoke(initialState);
    console.log(`🎉 Quiz generation completed successfully`);
    return result.finalResult;
  } catch (error: any) {
    console.error(`💥 Quiz generation pipeline failed:`, error.message);
    throw error;
  }
}