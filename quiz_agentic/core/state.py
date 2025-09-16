"""State management for the Quiz Agent using LangGraph."""

from typing import Any, Dict, List, Optional, TypedDict, Annotated
from datetime import datetime
import operator
from pydantic import BaseModel, Field


class QuizQuestion(BaseModel):
    """Represents a single quiz question."""
    id: str
    question: str
    type: str = Field(default="multiple_choice", pattern="^(multiple_choice|true_false|short_answer|essay)$")
    options: Optional[List[str]] = None
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    category: Optional[str] = None
    source: Optional[str] = None


class Quiz(BaseModel):
    """Represents a complete quiz."""
    id: str
    title: str
    description: Optional[str] = None
    questions: List[QuizQuestion] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    def add_question(self, question: QuizQuestion) -> None:
        """Add a question to the quiz."""
        self.questions.append(question)
    
    def get_question_by_id(self, question_id: str) -> Optional[QuizQuestion]:
        """Get a question by its ID."""
        for question in self.questions:
            if question.id == question_id:
                return question
        return None


class A2AMessage(BaseModel):
    """Represents an A2A protocol message."""
    message_id: str
    sender_id: str
    receiver_id: str
    message_type: str
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)


class MCPRequest(BaseModel):
    """Represents an MCP protocol request."""
    jsonrpc: str = "2.0"
    id: Optional[str] = None
    method: str
    params: Optional[Dict[str, Any]] = None


class QuizState(TypedDict):
    """State for the Quiz Agent LangGraph workflow."""
    
    # Core quiz data
    current_quiz: Optional[Quiz]
    quiz_history: Annotated[List[Quiz], operator.add]
    
    # Agent operation context
    user_input: str
    operation_type: str  # "create_quiz", "answer_question", "search_content", etc.
    
    # Search and content extraction
    search_query: Optional[str] 
    search_results: Annotated[List[Dict[str, Any]], operator.add]
    extracted_content: Annotated[List[str], operator.add]
    
    # Communication protocols
    a2a_messages: Annotated[List[A2AMessage], operator.add]
    mcp_requests: Annotated[List[MCPRequest], operator.add]
    
    # Status and metadata
    agent_status: str  # "idle", "processing", "waiting_for_input", "error"
    error_message: Optional[str]
    session_id: str
    created_at: datetime
    last_updated: datetime
    
    # Tool outputs
    tool_outputs: Annotated[List[Dict[str, Any]], operator.add]


def create_initial_state(session_id: str, user_input: str = "") -> QuizState:
    """Create an initial state for the Quiz Agent."""
    now = datetime.now()
    return QuizState(
        current_quiz=None,
        quiz_history=[],
        user_input=user_input,
        operation_type="",
        search_query=None,
        search_results=[],
        extracted_content=[],
        a2a_messages=[],
        mcp_requests=[],
        agent_status="idle",
        error_message=None,
        session_id=session_id,
        created_at=now,
        last_updated=now,
        tool_outputs=[]
    )