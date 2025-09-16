"""Example usage of the Quiz Agent with A2A and MCP protocols."""

import asyncio
import json
from quiz_agentic import QuizAgent
from quiz_agentic.protocols.a2a import A2AConfig
from quiz_agentic.protocols.mcp import MCPConfig


async def basic_quiz_example():
    """Basic example of creating a quiz."""
    print("=== Basic Quiz Creation Example ===")
    
    # Create agent with default settings
    agent = QuizAgent()
    agent.start()
    
    try:
        # Create a quiz about Python programming
        user_input = "Create a quiz about Python programming with 3 questions"
        state = await agent.process_input(user_input)
        
        print(f"Operation: {state['operation_type']}")
        print(f"Status: {state['agent_status']}")
        
        if state['current_quiz']:
            quiz = state['current_quiz']
            print(f"\nGenerated Quiz: {quiz.title}")
            print(f"Number of questions: {len(quiz.questions)}")
            
            for i, question in enumerate(quiz.questions, 1):
                print(f"\nQuestion {i}: {question.question}")
                if question.options:
                    for j, option in enumerate(question.options):
                        print(f"  {chr(65+j)}) {option}")
                print(f"Correct Answer: {question.correct_answer}")
        
        if state['error_message']:
            print(f"Error: {state['error_message']}")
            
    finally:
        agent.stop()


async def search_and_extract_example():
    """Example of searching and extracting content."""
    print("\n=== Search and Content Extraction Example ===")
    
    agent = QuizAgent()
    agent.start()
    
    try:
        # Search for content
        search_input = "Search for information about machine learning algorithms"
        state = await agent.process_input(search_input)
        
        print(f"Search Results: {len(state['search_results'])}")
        for result in state['search_results'][:2]:
            if isinstance(result, dict):
                print(f"- {result.get('title', 'No title')}")
        
        # Extract content from URLs (example URLs)
        extract_input = "Extract content from https://en.wikipedia.org/wiki/Machine_learning"
        state = await agent.process_input(extract_input)
        
        print(f"Extracted Content: {len(state['extracted_content'])} items")
        for content in state['extracted_content'][:1]:
            print(f"Content preview: {content[:200]}...")
            
    finally:
        agent.stop()


async def protocol_integration_example():
    """Example of A2A and MCP protocol integration."""
    print("\n=== Protocol Integration Example ===")
    
    # Configure protocols
    a2a_config = A2AConfig(enabled=True, port=8001)
    mcp_config = MCPConfig(enabled=True, port=8002)
    
    agent = QuizAgent(a2a_config=a2a_config, mcp_config=mcp_config)
    agent.start()
    
    try:
        # Show agent status with protocol information
        status = agent.get_status()
        print("Agent Status:")
        print(json.dumps(status, indent=2, default=str))
        
        # Example A2A communication
        if agent.a2a_protocol:
            # Register a mock endpoint
            agent.a2a_protocol.register_endpoint("quiz_agent_2", "localhost", 8003)
            
            # Create a message
            message = agent.a2a_protocol.create_message(
                "quiz_agent_2",
                "quiz_request",
                {"topic": "Python", "num_questions": 5, "difficulty": "medium"}
            )
            
            print(f"\nA2A Message created:")
            print(f"- Message ID: {message.message_id}")
            print(f"- Type: {message.message_type}")
            print(f"- Payload: {message.payload}")
            
        # Example MCP request handling
        if agent.mcp_protocol:
            # Simulate an MCP request
            mcp_request = {
                "jsonrpc": "2.0",
                "id": "1",
                "method": "quiz/create",
                "params": {
                    "topic": "Data Science",
                    "num_questions": 3,
                    "difficulty": "medium"
                }
            }
            
            response = await agent.mcp_protocol.handle_request(mcp_request)
            print(f"\nMCP Response:")
            print(json.dumps(response.model_dump(), indent=2, default=str))
            
    finally:
        agent.stop()


async def validation_example():
    """Example of quiz validation."""
    print("\n=== Quiz Validation Example ===")
    
    agent = QuizAgent()
    agent.start()
    
    try:
        # Create a quiz first
        create_input = "Create a quiz about databases with 2 questions"
        state = await agent.process_input(create_input)
        
        if state['current_quiz']:
            print(f"Created quiz: {state['current_quiz'].title}")
            
            # Validate the quiz
            validate_input = "Validate the current quiz"
            state = await agent.process_input(validate_input)
            
            print(f"Validation status: {state['agent_status']}")
            if state['error_message']:
                print(f"Validation errors: {state['error_message']}")
            else:
                print("Quiz validation passed!")
                print(f"Quiz history: {len(state['quiz_history'])} quizzes")
                
    finally:
        agent.stop()


async def main():
    """Run all examples."""
    print("Quiz Agent Examples with A2A and MCP Protocol Support")
    print("=" * 60)
    
    try:
        await basic_quiz_example()
        await search_and_extract_example()
        await protocol_integration_example()
        await validation_example()
        
        print("\n" + "=" * 60)
        print("All examples completed successfully!")
        
    except Exception as e:
        print(f"Error running examples: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())