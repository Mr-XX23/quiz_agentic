"""MCP (Model Context Protocol) implementation for quiz agent."""

import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field
import httpx
from datetime import datetime

from ..core.state import MCPRequest, QuizState
from ..schemas.validation import MCP_REQUEST_SCHEMA
import jsonschema


class MCPConfig(BaseModel):
    """Configuration for MCP protocol."""
    server_id: str = Field(default_factory=lambda: f"quiz_mcp_{uuid.uuid4().hex[:8]}")
    host: str = "localhost"
    port: int = 8002
    enabled: bool = True
    version: str = "1.0.0"
    timeout: float = 30.0


class MCPCapability(BaseModel):
    """Represents an MCP capability."""
    name: str
    description: str
    parameters: Optional[Dict[str, Any]] = None
    returns: Optional[Dict[str, Any]] = None


class MCPResponse(BaseModel):
    """MCP JSON-RPC response."""
    jsonrpc: str = "2.0"
    id: Optional[Union[str, int]] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None


class MCPError(BaseModel):
    """MCP error object."""
    code: int
    message: str
    data: Optional[Dict[str, Any]] = None


class MCPProtocol:
    """MCP protocol handler for model context communication."""
    
    # Standard MCP error codes
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    
    def __init__(self, config: MCPConfig):
        self.config = config
        self.capabilities: Dict[str, MCPCapability] = {}
        self.method_handlers: Dict[str, callable] = {}
        self.running = False
        
        # Register default MCP methods
        self._register_default_methods()
    
    def _register_default_methods(self) -> None:
        """Register default MCP methods."""
        # Core MCP methods
        self.register_method("initialize", self._handle_initialize)
        self.register_method("ping", self._handle_ping)
        self.register_method("get_capabilities", self._handle_get_capabilities)
        
        # Quiz-specific MCP methods
        self.register_method("quiz/create", self._handle_quiz_create)
        self.register_method("quiz/get", self._handle_quiz_get)
        self.register_method("quiz/list", self._handle_quiz_list)
        self.register_method("quiz/search", self._handle_quiz_search)
        self.register_method("question/generate", self._handle_question_generate)
        self.register_method("question/validate", self._handle_question_validate)
        self.register_method("content/extract", self._handle_content_extract)
        self.register_method("content/search", self._handle_content_search)
        
        # Register capabilities
        self._register_capabilities()
    
    def _register_capabilities(self) -> None:
        """Register MCP capabilities."""
        self.capabilities = {
            "quiz/create": MCPCapability(
                name="quiz/create",
                description="Create a new quiz from topic and parameters",
                parameters={
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string"},
                        "num_questions": {"type": "integer", "default": 5},
                        "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                        "question_types": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["topic"]
                },
                returns={
                    "type": "object",
                    "properties": {
                        "quiz_id": {"type": "string"},
                        "title": {"type": "string"},
                        "questions": {"type": "array"}
                    }
                }
            ),
            "quiz/get": MCPCapability(
                name="quiz/get",
                description="Get a quiz by ID",
                parameters={
                    "type": "object",
                    "properties": {
                        "quiz_id": {"type": "string"}
                    },
                    "required": ["quiz_id"]
                }
            ),
            "quiz/search": MCPCapability(
                name="quiz/search",
                description="Search for quizzes by topic or keywords",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 10}
                    },
                    "required": ["query"]
                }
            ),
            "question/generate": MCPCapability(
                name="question/generate",
                description="Generate questions based on content",
                parameters={
                    "type": "object",
                    "properties": {
                        "content": {"type": "string"},
                        "num_questions": {"type": "integer", "default": 1},
                        "question_type": {"type": "string", "enum": ["multiple_choice", "true_false", "short_answer"]},
                        "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]}
                    },
                    "required": ["content"]
                }
            ),
            "content/extract": MCPCapability(
                name="content/extract",
                description="Extract content from URLs for quiz generation",
                parameters={
                    "type": "object",
                    "properties": {
                        "urls": {"type": "array", "items": {"type": "string"}},
                        "max_content_length": {"type": "integer", "default": 2000}
                    },
                    "required": ["urls"]
                }
            ),
            "content/search": MCPCapability(
                name="content/search",
                description="Search web content for quiz topics",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer", "default": 5}
                    },
                    "required": ["query"]
                }
            )
        }
    
    def register_method(self, method_name: str, handler: callable) -> None:
        """Register a method handler."""
        self.method_handlers[method_name] = handler
    
    def validate_request(self, request_data: Dict[str, Any]) -> bool:
        """Validate MCP request against schema."""
        try:
            jsonschema.validate(request_data, MCP_REQUEST_SCHEMA)
            return True
        except jsonschema.ValidationError:
            return False
    
    def create_response(
        self,
        request_id: Optional[Union[str, int]] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[MCPError] = None
    ) -> MCPResponse:
        """Create an MCP response."""
        response = MCPResponse(id=request_id)
        if error:
            response.error = error.model_dump()
        else:
            response.result = result or {}
        return response
    
    def create_error(self, code: int, message: str, data: Optional[Dict[str, Any]] = None) -> MCPError:
        """Create an MCP error."""
        return MCPError(code=code, message=message, data=data)
    
    async def handle_request(self, request_data: Dict[str, Any]) -> MCPResponse:
        """Handle an incoming MCP request."""
        try:
            if not self.validate_request(request_data):
                return self.create_response(
                    error=self.create_error(
                        self.INVALID_REQUEST,
                        "Invalid request format"
                    )
                )
            
            request = MCPRequest(**request_data)
            method = request.method
            params = request.params or {}
            
            if method not in self.method_handlers:
                return self.create_response(
                    request_id=request.id,
                    error=self.create_error(
                        self.METHOD_NOT_FOUND,
                        f"Method not found: {method}"
                    )
                )
            
            try:
                result = await self.method_handlers[method](params)
                return self.create_response(request_id=request.id, result=result)
            except Exception as e:
                return self.create_response(
                    request_id=request.id,
                    error=self.create_error(
                        self.INTERNAL_ERROR,
                        f"Internal error: {str(e)}"
                    )
                )
                
        except Exception as e:
            return self.create_response(
                error=self.create_error(
                    self.PARSE_ERROR,
                    f"Parse error: {str(e)}"
                )
            )
    
    async def _handle_initialize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle initialize request."""
        return {
            "protocol_version": "1.0.0",
            "server_info": {
                "name": "Quiz Agentic MCP Server",
                "version": self.config.version,
                "description": "MCP server for quiz agent operations"
            },
            "capabilities": list(self.capabilities.keys())
        }
    
    async def _handle_ping(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle ping request."""
        return {
            "status": "pong",
            "timestamp": datetime.now().isoformat(),
            "server_id": self.config.server_id
        }
    
    async def _handle_get_capabilities(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get capabilities request."""
        return {
            "capabilities": {
                name: cap.model_dump() for name, cap in self.capabilities.items()
            }
        }
    
    async def _handle_quiz_create(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle quiz creation request."""
        topic = params.get("topic", "")
        num_questions = params.get("num_questions", 5)
        difficulty = params.get("difficulty", "medium")
        question_types = params.get("question_types", ["multiple_choice"])
        
        # This would typically integrate with the quiz generation logic
        quiz_id = str(uuid.uuid4())
        
        return {
            "quiz_id": quiz_id,
            "title": f"Quiz about {topic}",
            "topic": topic,
            "num_questions": num_questions,
            "difficulty": difficulty,
            "question_types": question_types,
            "status": "created",
            "created_at": datetime.now().isoformat()
        }
    
    async def _handle_quiz_get(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle quiz retrieval request."""
        quiz_id = params.get("quiz_id")
        
        if not quiz_id:
            raise ValueError("quiz_id is required")
        
        # This would typically retrieve from storage
        return {
            "quiz_id": quiz_id,
            "title": "Sample Quiz",
            "questions": [],
            "status": "found"
        }
    
    async def _handle_quiz_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle quiz listing request."""
        limit = params.get("limit", 10)
        offset = params.get("offset", 0)
        
        # This would typically query from storage
        return {
            "quizzes": [],
            "total": 0,
            "limit": limit,
            "offset": offset
        }
    
    async def _handle_quiz_search(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle quiz search request."""
        query = params.get("query", "")
        limit = params.get("limit", 10)
        
        if not query:
            raise ValueError("query is required")
        
        # This would typically search through stored quizzes
        return {
            "query": query,
            "results": [],
            "total": 0,
            "limit": limit
        }
    
    async def _handle_question_generate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle question generation request."""
        content = params.get("content", "")
        num_questions = params.get("num_questions", 1)
        question_type = params.get("question_type", "multiple_choice")
        difficulty = params.get("difficulty", "medium")
        
        if not content:
            raise ValueError("content is required")
        
        # This would typically integrate with question generation logic
        questions = []
        for i in range(num_questions):
            questions.append({
                "id": str(uuid.uuid4()),
                "question": f"Sample question {i+1} based on content",
                "type": question_type,
                "difficulty": difficulty,
                "options": ["A", "B", "C", "D"] if question_type == "multiple_choice" else None,
                "correct_answer": "A" if question_type == "multiple_choice" else "Sample answer"
            })
        
        return {
            "questions": questions,
            "content_length": len(content),
            "generated_count": len(questions)
        }
    
    async def _handle_question_validate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle question validation request."""
        question = params.get("question", {})
        
        # Basic validation logic
        errors = []
        if not question.get("question"):
            errors.append("Question text is required")
        if not question.get("correct_answer"):
            errors.append("Correct answer is required")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "question_id": question.get("id")
        }
    
    async def _handle_content_extract(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle content extraction request."""
        urls = params.get("urls", [])
        max_content_length = params.get("max_content_length", 2000)
        
        if not urls:
            raise ValueError("urls is required")
        
        # This would typically integrate with content extraction tool
        extracted_content = []
        for url in urls:
            extracted_content.append({
                "url": url,
                "content": f"Sample extracted content from {url}",
                "length": 100,
                "title": f"Title for {url}"
            })
        
        return {
            "extracted_content": extracted_content,
            "total_urls": len(urls),
            "max_content_length": max_content_length
        }
    
    async def _handle_content_search(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle content search request."""
        query = params.get("query", "")
        max_results = params.get("max_results", 5)
        
        if not query:
            raise ValueError("query is required")
        
        # This would typically integrate with web search tool
        search_results = []
        for i in range(min(max_results, 3)):  # Mock results
            search_results.append({
                "title": f"Search result {i+1} for {query}",
                "url": f"https://example.com/result-{i+1}",
                "content": f"Sample content for search result {i+1}",
                "score": 0.9 - (i * 0.1)
            })
        
        return {
            "query": query,
            "results": search_results,
            "total_results": len(search_results),
            "max_results": max_results
        }
    
    def start(self) -> None:
        """Start the MCP protocol handler."""
        if self.config.enabled:
            self.running = True
            print(f"MCP Protocol started for server {self.config.server_id} on {self.config.host}:{self.config.port}")
    
    def stop(self) -> None:
        """Stop the MCP protocol handler."""
        self.running = False
        print(f"MCP Protocol stopped for server {self.config.server_id}")
    
    async def send_notification(self, method: str, params: Dict[str, Any]) -> None:
        """Send an MCP notification (request without expecting response)."""
        # MCP notifications don't have an ID and don't expect a response
        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }
        # This would typically be sent to connected clients
        print(f"MCP notification: {json.dumps(notification)}")
    
    def get_server_info(self) -> Dict[str, Any]:
        """Get server information."""
        return {
            "server_id": self.config.server_id,
            "host": self.config.host,
            "port": self.config.port,
            "version": self.config.version,
            "enabled": self.config.enabled,
            "running": self.running,
            "capabilities": list(self.capabilities.keys()),
            "methods": list(self.method_handlers.keys())
        }