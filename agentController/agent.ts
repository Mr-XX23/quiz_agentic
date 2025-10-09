// libraries
import { createReactAgent, ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { config } from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { v4 as uuidv4 } from 'uuid';

// local imports
import { tools } from "../agentServices/agnetTool";

// load environment variables
config();

// main system prompt for the main agent
const MAIN_SYSTEM_PROMPT = `
You are a quiz assistant that creates exactly 20 questions.
MAIN WORKFLOW WITH CONCURRENT WEB RESEARCH:

FOR WELL-KNOWN TOPICS (EXAMPLES: basic math, history, common science, geography, the knowledge that you have already like research papers, your own trained data and data already have  etc.):

   - Call generate_quiz directly with the topic prompt
   -Discriptions = 1. When requests a quiz, call the generate_quiz tool with their topic, 
                   2. The tool automatically:
                      - Generates questions using internal state management
                      - Retries if fewer than 20 questions are produced
                      - Validates the final result against the schema
                      - Returns a complete, validated quiz with exactly 20 questions
                    3. If the tool succeeds, return the validated JSON to the user
                    4. If the tool fails, explain the error and ask the user to try a different topic
                    5. The generate_quiz tool handles all complexity internally - you just call it once and return the result.

FOR SPECIALIZED/CURRENT/TECHNICAL TOPICS:
   - Call web_search to find relevant sources
   - Call batch_web_content_extractor with the URLs from search results
   - This loads multiple URLs simultaneously (much faster than one-by-one)
   - Call generate_quiz with the combined research content

2. The generate_quiz tool automatically:
   - Uses research content if provided
   - Generates exactly 20 questions via internal state management  
   - Validates against the schema
   - Returns complete validated JSON

CONCURRENT LOADING BENEFITS:
- batch_web_content_extractor loads 3-5 URLs simultaneously
- Much faster than sequential loading
- Provides comprehensive content for accurate quiz questions
- Handles failures gracefully (some URLs may fail, others succeed)

RESEARCH STRATEGY:
- Search first to get relevant URLs
- Batch load content from top 3-5 sources concurrently
- Use combined content for comprehensive quiz generation
- Prefer authoritative sources (.edu, .gov, established publications)

OUTPUT FORMAT:
final response must be ONLY the complete validated JSON like this:
{"total_questions":20,"quiz_questions":[{"question":"What is...?","correct_answer":"A","answers":[{"answer":"A. Option 1"},{"answer":"B. Option 2"},{"answer":"C. Option 3"},{"answer":"D. Option 4"},{"answer":"E. Option 5"}]}]}
`.trim();

// function to run the agent
export const runAgent = async (prompt: string) => {

  try {

    // define llm for agent
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.4
    });

    // define tool node for agent and handle tool errors gracefully and automatically
    const toolNode = new ToolNode(tools, {
      handleToolErrors: true,
    });

    // define memory for agent
    const agentCheckpointer = new MemorySaver();

    // create random thread id
    const threadId = uuidv4();

    // create the agent
    const agent = createReactAgent({
      llm,
      tools: toolNode,
      checkpointSaver: agentCheckpointer,
      prompt: MAIN_SYSTEM_PROMPT,
    });

    // invoke the agent
    const response = await agent.invoke({
      messages: [
        new HumanMessage(prompt)
      ],
    }, {
      configurable: {
        thread_id: threadId
      },
      recursionLimit: 18,
    });

    // define the latest assistant message (after tools and structuring)
    const finalResponse = response.messages[response.messages.length - 1].text;

    // return the final structured JSON response
    return finalResponse;

  } catch (error) {

    // log error and rethrow
    console.error("Error running agent:", error);
    throw error;

  }
};