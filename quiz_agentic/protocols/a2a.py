"""A2A (Agent-to-Agent) protocol implementation for quiz agent communication."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable
import httpx
from pydantic import BaseModel, Field
from langchain.callbacks.base import BaseCallbackHandler

from ..core.state import A2AMessage, QuizState
from ..schemas.validation import A2A_MESSAGE_SCHEMA
import jsonschema


class A2AConfig(BaseModel):
    """Configuration for A2A protocol."""
    agent_id: str = Field(default_factory=lambda: f"quiz_agent_{uuid.uuid4().hex[:8]}")
    host: str = "localhost"
    port: int = 8001
    enabled: bool = True
    max_message_size: int = 1024 * 1024  # 1MB
    timeout: float = 30.0


class A2AEndpoint(BaseModel):
    """Represents an A2A endpoint."""
    agent_id: str
    host: str
    port: int
    active: bool = True
    last_ping: Optional[datetime] = None


class A2AProtocol:
    """A2A protocol handler for agent-to-agent communication."""
    
    def __init__(self, config: A2AConfig):
        self.config = config
        self.endpoints: Dict[str, A2AEndpoint] = {}
        self.message_handlers: Dict[str, Callable] = {}
        self.running = False
        
        # Register default message handlers
        self.register_handler("quiz_request", self._handle_quiz_request)
        self.register_handler("quiz_response", self._handle_quiz_response)
        self.register_handler("question_request", self._handle_question_request)
        self.register_handler("question_response", self._handle_question_response)
        self.register_handler("ping", self._handle_ping)
        self.register_handler("status", self._handle_status)
    
    def register_endpoint(self, agent_id: str, host: str, port: int) -> None:
        """Register a new A2A endpoint."""
        endpoint = A2AEndpoint(
            agent_id=agent_id,
            host=host,
            port=port,
            active=True,
            last_ping=datetime.now()
        )
        self.endpoints[agent_id] = endpoint
    
    def register_handler(self, message_type: str, handler: Callable) -> None:
        """Register a message handler for a specific message type."""
        self.message_handlers[message_type] = handler
    
    def validate_message(self, message_data: Dict[str, Any]) -> bool:
        """Validate A2A message against schema."""
        try:
            jsonschema.validate(message_data, A2A_MESSAGE_SCHEMA)
            return True
        except jsonschema.ValidationError:
            return False
    
    def create_message(
        self,
        receiver_id: str,
        message_type: str,
        payload: Dict[str, Any]
    ) -> A2AMessage:
        """Create a new A2A message."""
        return A2AMessage(
            message_id=str(uuid.uuid4()),
            sender_id=self.config.agent_id,
            receiver_id=receiver_id,
            message_type=message_type,
            payload=payload,
            timestamp=datetime.now()
        )
    
    async def send_message(self, message: A2AMessage) -> bool:
        """Send an A2A message to another agent."""
        if not self.config.enabled:
            return False
            
        endpoint = self.endpoints.get(message.receiver_id)
        if not endpoint or not endpoint.active:
            return False
        
        try:
            message_data = message.model_dump()
            message_data["timestamp"] = message_data["timestamp"].isoformat()
            
            if not self.validate_message(message_data):
                return False
            
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.post(
                    f"http://{endpoint.host}:{endpoint.port}/a2a/message",
                    json=message_data,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                return True
                
        except Exception as e:
            print(f"Failed to send A2A message: {e}")
            return False
    
    async def broadcast_message(self, message_type: str, payload: Dict[str, Any]) -> int:
        """Broadcast a message to all active endpoints."""
        sent_count = 0
        for agent_id in self.endpoints:
            message = self.create_message(agent_id, message_type, payload)
            if await self.send_message(message):
                sent_count += 1
        return sent_count
    
    async def handle_incoming_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle an incoming A2A message."""
        try:
            if not self.validate_message(message_data):
                return {"error": "Invalid message format"}
            
            # Convert timestamp string back to datetime
            if isinstance(message_data.get("timestamp"), str):
                message_data["timestamp"] = datetime.fromisoformat(message_data["timestamp"])
            
            message = A2AMessage(**message_data)
            message_type = message.message_type
            
            if message_type in self.message_handlers:
                result = await self.message_handlers[message_type](message)
                return {"status": "processed", "result": result}
            else:
                return {"error": f"Unknown message type: {message_type}"}
                
        except Exception as e:
            return {"error": f"Failed to process message: {str(e)}"}
    
    async def _handle_quiz_request(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle quiz request from another agent."""
        payload = message.payload
        topic = payload.get("topic", "general")
        num_questions = payload.get("num_questions", 5)
        difficulty = payload.get("difficulty", "medium")
        
        # This would typically generate a quiz or forward to quiz generation logic
        response_payload = {
            "quiz_id": str(uuid.uuid4()),
            "topic": topic,
            "num_questions": num_questions,
            "difficulty": difficulty,
            "status": "generating"
        }
        
        response_message = self.create_message(
            message.sender_id,
            "quiz_response",
            response_payload
        )
        
        await self.send_message(response_message)
        return {"status": "quiz_request_processed"}
    
    async def _handle_quiz_response(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle quiz response from another agent."""
        payload = message.payload
        quiz_id = payload.get("quiz_id")
        status = payload.get("status")
        
        # Process the quiz response
        return {"status": "quiz_response_processed", "quiz_id": quiz_id}
    
    async def _handle_question_request(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle question request from another agent."""
        payload = message.payload
        topic = payload.get("topic")
        difficulty = payload.get("difficulty", "medium")
        
        # Generate and send a question response
        response_payload = {
            "question_id": str(uuid.uuid4()),
            "topic": topic,
            "difficulty": difficulty,
            "question": f"Sample question about {topic}",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A"
        }
        
        response_message = self.create_message(
            message.sender_id,
            "question_response",
            response_payload
        )
        
        await self.send_message(response_message)
        return {"status": "question_request_processed"}
    
    async def _handle_question_response(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle question response from another agent."""
        payload = message.payload
        question_id = payload.get("question_id")
        
        # Process the question response
        return {"status": "question_response_processed", "question_id": question_id}
    
    async def _handle_ping(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle ping message from another agent."""
        sender_id = message.sender_id
        
        # Update endpoint last ping time
        if sender_id in self.endpoints:
            self.endpoints[sender_id].last_ping = datetime.now()
        
        # Send pong response
        pong_message = self.create_message(sender_id, "pong", {"timestamp": datetime.now().isoformat()})
        await self.send_message(pong_message)
        
        return {"status": "ping_processed"}
    
    async def _handle_status(self, message: A2AMessage) -> Dict[str, Any]:
        """Handle status message from another agent."""
        payload = message.payload
        agent_status = payload.get("status")
        
        # Process agent status update
        return {"status": "status_processed", "agent_status": agent_status}
    
    async def ping_all_endpoints(self) -> Dict[str, bool]:
        """Ping all registered endpoints to check connectivity."""
        results = {}
        for agent_id in self.endpoints:
            ping_message = self.create_message(agent_id, "ping", {"timestamp": datetime.now().isoformat()})
            results[agent_id] = await self.send_message(ping_message)
        return results
    
    def get_active_endpoints(self) -> List[A2AEndpoint]:
        """Get list of active A2A endpoints."""
        return [endpoint for endpoint in self.endpoints.values() if endpoint.active]
    
    def start(self) -> None:
        """Start the A2A protocol handler."""
        if self.config.enabled:
            self.running = True
            print(f"A2A Protocol started for agent {self.config.agent_id} on {self.config.host}:{self.config.port}")
    
    def stop(self) -> None:
        """Stop the A2A protocol handler."""
        self.running = False
        print(f"A2A Protocol stopped for agent {self.config.agent_id}")


class A2ACallbackHandler(BaseCallbackHandler):
    """LangChain callback handler for A2A protocol integration."""
    
    def __init__(self, a2a_protocol: A2AProtocol):
        super().__init__()
        self.a2a_protocol = a2a_protocol
    
    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs) -> None:
        """Called when a tool starts running."""
        if self.a2a_protocol.config.enabled:
            # Broadcast tool start event
            payload = {
                "event": "tool_start",
                "tool": serialized.get("name", "unknown"),
                "input": input_str
            }
            asyncio.create_task(
                self.a2a_protocol.broadcast_message("status", payload)
            )
    
    def on_tool_end(self, output: str, **kwargs) -> None:
        """Called when a tool finishes running."""
        if self.a2a_protocol.config.enabled:
            # Broadcast tool end event
            payload = {
                "event": "tool_end",
                "output": output[:500]  # Truncate long outputs
            }
            asyncio.create_task(
                self.a2a_protocol.broadcast_message("status", payload)
            )