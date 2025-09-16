"""Main Quiz Agent implementation using LangGraph."""

import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
import os
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain.schema import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolExecutor, ToolInvocation
from langgraph.checkpoint.sqlite import SqliteSaver

from .state import QuizState, Quiz, QuizQuestion, create_initial_state
from ..tools.web_tools import get_quiz_tools
from ..protocols.a2a import A2AProtocol, A2AConfig, A2ACallbackHandler
from ..protocols.mcp import MCPProtocol, MCPConfig
from ..schemas.validation import QUIZ_SCHEMA, QUIZ_QUESTION_SCHEMA
import jsonschema


# Load environment variables
load_dotenv()


class QuizAgent:
    """Main Quiz Agent with A2A and MCP protocol support."""
    
    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        a2a_enabled: bool = True,
        mcp_enabled: bool = True,
        a2a_config: Optional[A2AConfig] = None,
        mcp_config: Optional[MCPConfig] = None
    ):
        """Initialize the Quiz Agent."""
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OpenAI API key is required")
        
        # Initialize LLM
        self.llm = ChatOpenAI(
            openai_api_key=self.openai_api_key,
            model="gpt-3.5-turbo",
            temperature=0.7
        )
        
        # Initialize tools
        self.tools = get_quiz_tools()
        self.tool_executor = ToolExecutor(self.tools)
        
        # Initialize protocols
        self.a2a_config = a2a_config or A2AConfig(enabled=a2a_enabled)
        self.mcp_config = mcp_config or MCPConfig(enabled=mcp_enabled)
        
        if self.a2a_config.enabled:
            self.a2a_protocol = A2AProtocol(self.a2a_config)
            self.a2a_callback = A2ACallbackHandler(self.a2a_protocol)
        else:
            self.a2a_protocol = None
            self.a2a_callback = None
        
        if self.mcp_config.enabled:
            self.mcp_protocol = MCPProtocol(self.mcp_config)
        else:
            self.mcp_protocol = None
        
        # Initialize LangGraph workflow
        self.workflow = self._create_workflow()
        self.checkpointer = SqliteSaver.from_conn_string(":memory:")
        self.app = self.workflow.compile(checkpointer=self.checkpointer)
        
        # Agent state
        self.running = False
        self.session_id = str(uuid.uuid4())
    
    def _create_workflow(self) -> StateGraph:
        """Create the LangGraph workflow for the quiz agent."""
        workflow = StateGraph(QuizState)
        
        # Add nodes
        workflow.add_node("determine_action", self._determine_action)
        workflow.add_node("search_content", self._search_content)
        workflow.add_node("extract_content", self._extract_content)
        workflow.add_node("generate_quiz", self._generate_quiz)
        workflow.add_node("generate_question", self._generate_question)
        workflow.add_node("validate_quiz", self._validate_quiz)
        workflow.add_node("handle_a2a", self._handle_a2a)
        workflow.add_node("handle_mcp", self._handle_mcp)
        workflow.add_node("finalize", self._finalize)
        
        # Set entry point
        workflow.set_entry_point("determine_action")
        
        # Add conditional edges
        workflow.add_conditional_edges(
            "determine_action",
            self._route_action,
            {
                "search": "search_content",
                "extract": "extract_content", 
                "generate_quiz": "generate_quiz",
                "generate_question": "generate_question",
                "validate": "validate_quiz",
                "a2a": "handle_a2a",
                "mcp": "handle_mcp",
                "end": "finalize"
            }
        )
        
        # Add edges to finalize
        workflow.add_edge("search_content", "finalize")
        workflow.add_edge("extract_content", "finalize")
        workflow.add_edge("generate_quiz", "validate_quiz")
        workflow.add_edge("generate_question", "finalize")
        workflow.add_edge("validate_quiz", "finalize")
        workflow.add_edge("handle_a2a", "finalize")
        workflow.add_edge("handle_mcp", "finalize")
        workflow.add_edge("finalize", END)
        
        return workflow
    
    def _determine_action(self, state: QuizState) -> QuizState:
        """Determine what action to take based on user input."""
        user_input = state["user_input"].lower()
        
        if any(keyword in user_input for keyword in ["search", "find", "lookup"]):
            state["operation_type"] = "search"
        elif any(keyword in user_input for keyword in ["extract", "content", "url"]):
            state["operation_type"] = "extract"
        elif any(keyword in user_input for keyword in ["create quiz", "generate quiz", "make quiz"]):
            state["operation_type"] = "generate_quiz"
        elif any(keyword in user_input for keyword in ["question", "generate question"]):
            state["operation_type"] = "generate_question"
        elif any(keyword in user_input for keyword in ["validate", "check", "verify"]):
            state["operation_type"] = "validate"
        elif any(keyword in user_input for keyword in ["a2a", "agent", "communicate"]):
            state["operation_type"] = "a2a"
        elif any(keyword in user_input for keyword in ["mcp", "context", "protocol"]):
            state["operation_type"] = "mcp"
        else:
            state["operation_type"] = "generate_quiz"  # Default action
        
        state["agent_status"] = "processing"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _route_action(self, state: QuizState) -> str:
        """Route to appropriate action based on operation type."""
        operation_type = state["operation_type"]
        
        if operation_type == "search":
            return "search"
        elif operation_type == "extract":
            return "extract"
        elif operation_type == "generate_quiz":
            return "generate_quiz"
        elif operation_type == "generate_question":
            return "generate_question"
        elif operation_type == "validate":
            return "validate"
        elif operation_type == "a2a":
            return "a2a"
        elif operation_type == "mcp":
            return "mcp"
        else:
            return "end"
    
    def _search_content(self, state: QuizState) -> QuizState:
        """Search for content using web search tool."""
        user_input = state["user_input"]
        
        # Extract search query from user input
        search_query = self._extract_search_query(user_input)
        state["search_query"] = search_query
        
        # Execute search tool
        search_tool = next((tool for tool in self.tools if tool.name == "quiz_web_search"), None)
        if search_tool:
            try:
                search_results = search_tool.run(search_query)
                state["search_results"].extend(search_results if isinstance(search_results, list) else [search_results])
                state["tool_outputs"].append({
                    "tool": "web_search",
                    "query": search_query,
                    "results": search_results,
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                state["error_message"] = f"Search failed: {str(e)}"
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _extract_search_query(self, user_input: str) -> str:
        """Extract search query from user input."""
        # Simple extraction - could be enhanced with NLP
        words = user_input.split()
        stop_words = {"search", "for", "find", "lookup", "about", "on", "the", "a", "an"}
        query_words = [word for word in words if word.lower() not in stop_words]
        return " ".join(query_words) if query_words else user_input
    
    def _extract_content(self, state: QuizState) -> QuizState:
        """Extract content from URLs."""
        user_input = state["user_input"]
        
        # Extract URLs from user input (simple regex would be better)
        urls = self._extract_urls(user_input)
        
        if not urls:
            state["error_message"] = "No URLs found in input"
            return state
        
        # Execute content extraction tool
        extraction_tool = next((tool for tool in self.tools if tool.name == "content_extraction"), None)
        if extraction_tool:
            try:
                extracted_data = extraction_tool.run(urls)
                for item in extracted_data:
                    if "content" in item and item["content"]:
                        state["extracted_content"].append(item["content"])
                
                state["tool_outputs"].append({
                    "tool": "content_extraction",
                    "urls": urls,
                    "results": extracted_data,
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                state["error_message"] = f"Content extraction failed: {str(e)}"
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _extract_urls(self, text: str) -> List[str]:
        """Extract URLs from text (basic implementation)."""
        import re
        url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        return re.findall(url_pattern, text)
    
    def _generate_quiz(self, state: QuizState) -> QuizState:
        """Generate a quiz based on user input and available content."""
        user_input = state["user_input"]
        
        # Prepare context for quiz generation
        context = self._prepare_quiz_context(state)
        
        # Generate quiz using LLM
        quiz_prompt = self._create_quiz_prompt(user_input, context)
        
        try:
            callbacks = [self.a2a_callback] if self.a2a_callback else []
            response = self.llm.invoke([quiz_prompt], callbacks=callbacks)
            
            # Parse quiz from response
            quiz = self._parse_quiz_response(response.content, user_input)
            state["current_quiz"] = quiz
            
            state["tool_outputs"].append({
                "tool": "quiz_generation",
                "input": user_input,
                "context_length": len(context),
                "quiz_id": quiz.id if quiz else None,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            state["error_message"] = f"Quiz generation failed: {str(e)}"
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _prepare_quiz_context(self, state: QuizState) -> str:
        """Prepare context for quiz generation from available content."""
        context_parts = []
        
        # Add search results
        for result in state["search_results"]:
            if isinstance(result, dict) and "content" in result:
                context_parts.append(result["content"])
        
        # Add extracted content
        context_parts.extend(state["extracted_content"])
        
        return "\n\n".join(context_parts)
    
    def _create_quiz_prompt(self, user_input: str, context: str) -> SystemMessage:
        """Create a prompt for quiz generation."""
        prompt_text = f"""You are an expert quiz creator. Create a comprehensive quiz based on the following request and context.

User Request: {user_input}

Context Information:
{context[:3000] if context else "No additional context provided."}

Please create a quiz with the following structure:
1. A clear title
2. 3-5 multiple choice questions
3. Each question should have 4 options (A, B, C, D)
4. Include the correct answer and a brief explanation
5. Vary the difficulty level

Format your response as a structured text that can be parsed into a quiz object.

Title: [Quiz Title]
Description: [Brief description]

Question 1:
Type: multiple_choice
Difficulty: [easy/medium/hard]
Question: [Question text]
A) [Option A]
B) [Option B] 
C) [Option C]
D) [Option D]
Correct Answer: [A/B/C/D]
Explanation: [Brief explanation]

[Continue for all questions...]
"""
        return SystemMessage(content=prompt_text)
    
    def _parse_quiz_response(self, response_text: str, user_input: str) -> Optional[Quiz]:
        """Parse LLM response into a Quiz object."""
        try:
            lines = response_text.strip().split('\n')
            
            # Extract title and description
            title = "Generated Quiz"
            description = ""
            
            for line in lines:
                if line.startswith("Title:"):
                    title = line.replace("Title:", "").strip()
                elif line.startswith("Description:"):
                    description = line.replace("Description:", "").strip()
            
            # Create quiz
            quiz = Quiz(
                id=str(uuid.uuid4()),
                title=title,
                description=description,
                questions=[],
                metadata={
                    "created_at": datetime.now().isoformat(),
                    "source": "llm_generation",
                    "user_input": user_input
                }
            )
            
            # Parse questions (simplified parsing)
            current_question = None
            question_lines = []
            
            for line in lines:
                line = line.strip()
                if line.startswith("Question") and ":" in line:
                    if current_question and question_lines:
                        question = self._parse_question_lines(question_lines)
                        if question:
                            quiz.add_question(question)
                    question_lines = [line]
                    current_question = True
                elif current_question and line:
                    question_lines.append(line)
            
            # Process last question
            if current_question and question_lines:
                question = self._parse_question_lines(question_lines)
                if question:
                    quiz.add_question(question)
            
            return quiz
            
        except Exception as e:
            print(f"Error parsing quiz response: {e}")
            return None
    
    def _parse_question_lines(self, lines: List[str]) -> Optional[QuizQuestion]:
        """Parse question lines into a QuizQuestion object."""
        try:
            question_text = ""
            options = []
            correct_answer = ""
            explanation = ""
            difficulty = "medium"
            question_type = "multiple_choice"
            
            for line in lines:
                line = line.strip()
                if line.startswith("Question:"):
                    question_text = line.replace("Question:", "").strip()
                elif line.startswith("Type:"):
                    question_type = line.replace("Type:", "").strip()
                elif line.startswith("Difficulty:"):
                    difficulty = line.replace("Difficulty:", "").strip()
                elif line.startswith(("A)", "B)", "C)", "D)")):
                    options.append(line[2:].strip())
                elif line.startswith("Correct Answer:"):
                    correct_answer = line.replace("Correct Answer:", "").strip()
                elif line.startswith("Explanation:"):
                    explanation = line.replace("Explanation:", "").strip()
            
            if question_text and correct_answer:
                return QuizQuestion(
                    id=str(uuid.uuid4()),
                    question=question_text,
                    type=question_type,
                    options=options if options else None,
                    correct_answer=correct_answer,
                    explanation=explanation,
                    difficulty=difficulty
                )
        except Exception as e:
            print(f"Error parsing question: {e}")
        
        return None
    
    def _generate_question(self, state: QuizState) -> QuizState:
        """Generate a single question."""
        user_input = state["user_input"]
        
        # Generate question using LLM
        question_prompt = self._create_question_prompt(user_input)
        
        try:
            callbacks = [self.a2a_callback] if self.a2a_callback else []
            response = self.llm.invoke([question_prompt], callbacks=callbacks)
            
            # Parse question from response
            question = self._parse_question_response(response.content)
            
            if question:
                state["tool_outputs"].append({
                    "tool": "question_generation",
                    "input": user_input,
                    "question": question.model_dump(),
                    "timestamp": datetime.now().isoformat()
                })
            else:
                state["error_message"] = "Failed to parse generated question"
                
        except Exception as e:
            state["error_message"] = f"Question generation failed: {str(e)}"
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _create_question_prompt(self, user_input: str) -> SystemMessage:
        """Create a prompt for question generation."""
        prompt_text = f"""Generate a single quiz question based on the following request:

{user_input}

Please create a well-structured multiple choice question with:
- Clear, unambiguous question text
- 4 plausible answer options (A, B, C, D)
- One correct answer
- Brief explanation for the correct answer
- Appropriate difficulty level

Format your response exactly as follows:

Question: [Your question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct Answer: [A/B/C/D]
Explanation: [Brief explanation]
Difficulty: [easy/medium/hard]
"""
        return SystemMessage(content=prompt_text)
    
    def _parse_question_response(self, response_text: str) -> Optional[QuizQuestion]:
        """Parse LLM response into a QuizQuestion object."""
        lines = response_text.strip().split('\n')
        question_lines = [line.strip() for line in lines if line.strip()]
        return self._parse_question_lines(question_lines)
    
    def _validate_quiz(self, state: QuizState) -> QuizState:
        """Validate the generated quiz against schema."""
        current_quiz = state["current_quiz"]
        
        if not current_quiz:
            state["error_message"] = "No quiz to validate"
            state["agent_status"] = "error"
            return state
        
        try:
            # Validate against schema
            quiz_data = current_quiz.model_dump()
            jsonschema.validate(quiz_data, QUIZ_SCHEMA)
            
            # Additional validation logic
            validation_errors = []
            
            if len(current_quiz.questions) == 0:
                validation_errors.append("Quiz must have at least one question")
            
            for question in current_quiz.questions:
                question_data = question.model_dump()
                try:
                    jsonschema.validate(question_data, QUIZ_QUESTION_SCHEMA)
                except jsonschema.ValidationError as e:
                    validation_errors.append(f"Question {question.id}: {e.message}")
            
            if validation_errors:
                state["error_message"] = "; ".join(validation_errors)
                state["agent_status"] = "error"
            else:
                # Add to quiz history if valid
                state["quiz_history"].append(current_quiz)
                state["agent_status"] = "completed"
                
                state["tool_outputs"].append({
                    "tool": "quiz_validation",
                    "quiz_id": current_quiz.id,
                    "valid": True,
                    "num_questions": len(current_quiz.questions),
                    "timestamp": datetime.now().isoformat()
                })
                
        except jsonschema.ValidationError as e:
            state["error_message"] = f"Validation failed: {e.message}"
            state["agent_status"] = "error"
        except Exception as e:
            state["error_message"] = f"Validation error: {str(e)}"
            state["agent_status"] = "error"
        
        state["last_updated"] = datetime.now()
        return state
    
    def _handle_a2a(self, state: QuizState) -> QuizState:
        """Handle A2A protocol communication."""
        if not self.a2a_protocol or not self.a2a_protocol.config.enabled:
            state["error_message"] = "A2A protocol not enabled"
            return state
        
        # This would handle A2A specific operations
        state["tool_outputs"].append({
            "tool": "a2a_handler",
            "protocol": "a2a",
            "status": "handled",
            "timestamp": datetime.now().isoformat()
        })
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _handle_mcp(self, state: QuizState) -> QuizState:
        """Handle MCP protocol communication."""
        if not self.mcp_protocol or not self.mcp_protocol.config.enabled:
            state["error_message"] = "MCP protocol not enabled"
            return state
        
        # This would handle MCP specific operations
        state["tool_outputs"].append({
            "tool": "mcp_handler", 
            "protocol": "mcp",
            "status": "handled",
            "timestamp": datetime.now().isoformat()
        })
        
        state["agent_status"] = "completed"
        state["last_updated"] = datetime.now()
        
        return state
    
    def _finalize(self, state: QuizState) -> QuizState:
        """Finalize the agent operation."""
        if state["agent_status"] != "error":
            state["agent_status"] = "idle"
        
        state["last_updated"] = datetime.now()
        
        return state
    
    async def process_input(self, user_input: str, session_id: Optional[str] = None) -> QuizState:
        """Process user input through the agent workflow."""
        if session_id is None:
            session_id = self.session_id
        
        initial_state = create_initial_state(session_id, user_input)
        
        try:
            config = {"configurable": {"thread_id": session_id}}
            result = await self.app.ainvoke(initial_state, config=config)
            return result
        except Exception as e:
            initial_state["error_message"] = f"Processing failed: {str(e)}"
            initial_state["agent_status"] = "error"
            return initial_state
    
    def start(self) -> None:
        """Start the quiz agent and protocols."""
        self.running = True
        
        if self.a2a_protocol:
            self.a2a_protocol.start()
        
        if self.mcp_protocol:
            self.mcp_protocol.start()
        
        print(f"Quiz Agent started with session ID: {self.session_id}")
    
    def stop(self) -> None:
        """Stop the quiz agent and protocols."""
        self.running = False
        
        if self.a2a_protocol:
            self.a2a_protocol.stop()
        
        if self.mcp_protocol:
            self.mcp_protocol.stop()
        
        print("Quiz Agent stopped")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current agent status."""
        return {
            "running": self.running,
            "session_id": self.session_id,
            "a2a_enabled": self.a2a_protocol.config.enabled if self.a2a_protocol else False,
            "mcp_enabled": self.mcp_protocol.config.enabled if self.mcp_protocol else False,
            "tools_available": [tool.name for tool in self.tools],
            "protocols": {
                "a2a": self.a2a_protocol.get_server_info() if self.a2a_protocol else None,
                "mcp": self.mcp_protocol.get_server_info() if self.mcp_protocol else None
            }
        }