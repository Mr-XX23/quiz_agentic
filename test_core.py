"""Simple test script to validate core functionality without heavy dependencies."""

import json
import uuid
from datetime import datetime

def test_core_data_structures():
    """Test the core data structures."""
    print("Testing core data structures...")
    
    from quiz_agentic.core.state import Quiz, QuizQuestion, create_initial_state
    from quiz_agentic.schemas.validation import QUIZ_SCHEMA, QUIZ_QUESTION_SCHEMA
    import jsonschema
    
    # Create a sample question
    question = QuizQuestion(
        id=str(uuid.uuid4()),
        question="What is Python?",
        type="multiple_choice",
        options=["A programming language", "A snake", "A car", "A food"],
        correct_answer="A programming language",
        explanation="Python is a high-level programming language.",
        difficulty="easy",
        category="Programming"
    )
    
    print(f"✓ Created question: {question.question}")
    
    # Validate question against schema
    question_data = question.model_dump()
    jsonschema.validate(question_data, QUIZ_QUESTION_SCHEMA)
    print("✓ Question validates against schema")
    
    # Create a quiz
    quiz = Quiz(
        id=str(uuid.uuid4()),
        title="Python Programming Quiz",
        description="A simple quiz about Python programming",
        questions=[question],
        metadata={
            "created_at": datetime.now().isoformat(),
            "author": "Test Suite"
        }
    )
    
    print(f"✓ Created quiz: {quiz.title}")
    
    # Validate quiz against schema
    quiz_data = quiz.model_dump()
    jsonschema.validate(quiz_data, QUIZ_SCHEMA)
    print("✓ Quiz validates against schema")
    
    # Test state creation
    state = create_initial_state("test_session", "Create a Python quiz")
    state["current_quiz"] = quiz
    
    print(f"✓ Created state with session: {state['session_id']}")
    print(f"✓ State operation: {state['user_input']}")
    
    return True


def test_schemas():
    """Test JSON schema validation."""
    print("\nTesting JSON schemas...")
    
    from quiz_agentic.schemas.validation import (
        QUIZ_SCHEMA, QUIZ_QUESTION_SCHEMA, 
        A2A_MESSAGE_SCHEMA, MCP_REQUEST_SCHEMA
    )
    
    # Test question schema
    valid_question = {
        "id": "q1",
        "question": "What is 2+2?",
        "type": "multiple_choice",
        "correct_answer": "4"
    }
    
    import jsonschema
    jsonschema.validate(valid_question, QUIZ_QUESTION_SCHEMA)
    print("✓ Question schema validation works")
    
    # Test quiz schema
    valid_quiz = {
        "id": "quiz1",
        "title": "Math Quiz",
        "questions": [valid_question]
    }
    
    jsonschema.validate(valid_quiz, QUIZ_SCHEMA)
    print("✓ Quiz schema validation works")
    
    # Test A2A message schema
    valid_a2a_message = {
        "message_id": "msg1",
        "sender_id": "agent1",
        "receiver_id": "agent2",
        "message_type": "quiz_request",
        "payload": {"topic": "Python"},
        "timestamp": datetime.now().isoformat()
    }
    
    jsonschema.validate(valid_a2a_message, A2A_MESSAGE_SCHEMA)
    print("✓ A2A message schema validation works")
    
    # Test MCP request schema
    valid_mcp_request = {
        "jsonrpc": "2.0",
        "method": "quiz/create",
        "params": {"topic": "AI"}
    }
    
    jsonschema.validate(valid_mcp_request, MCP_REQUEST_SCHEMA)
    print("✓ MCP request schema validation works")
    
    return True


def test_protocol_configs():
    """Test protocol configuration classes."""
    print("\nTesting protocol configurations...")
    
    try:
        from quiz_agentic.protocols.a2a import A2AConfig
        
        config = A2AConfig(
            agent_id="test_agent",
            host="localhost",
            port=8001,
            enabled=True
        )
        
        print(f"✓ A2A config created: {config.agent_id}@{config.host}:{config.port}")
        
    except ImportError:
        print("⚠ A2A config skipped due to missing dependencies")
    
    try:
        from quiz_agentic.protocols.mcp import MCPConfig
        
        config = MCPConfig(
            server_id="test_server",
            host="localhost", 
            port=8002,
            enabled=True
        )
        
        print(f"✓ MCP config created: {config.server_id}@{config.host}:{config.port}")
        
    except ImportError:
        print("⚠ MCP config skipped due to missing dependencies")
    
    return True


def test_tools():
    """Test tool configurations."""
    print("\nTesting tool configurations...")
    
    try:
        from quiz_agentic.tools.web_tools import WebSearchInput, ContentExtractionInput
        
        search_input = WebSearchInput(query="Python programming", max_results=5)
        print(f"✓ Web search input created: {search_input.query}")
        
        extract_input = ContentExtractionInput(
            urls=["https://example.com"],
            max_content_length=2000
        )
        print(f"✓ Content extraction input created: {len(extract_input.urls)} URLs")
        
    except ImportError:
        print("⚠ Tool configurations skipped due to missing dependencies")
    
    return True


def main():
    """Run all tests."""
    print("Quiz Agentic - Core Functionality Test")
    print("=" * 50)
    
    try:
        test_core_data_structures()
        test_schemas()
        test_protocol_configs()
        test_tools()
        
        print("\n" + "=" * 50)
        print("✅ All core functionality tests passed!")
        print("\nThe project structure is working correctly.")
        print("To use the full functionality, install the remaining dependencies:")
        print("  pip install langchain langchain-openai langgraph tavily-python")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    main()