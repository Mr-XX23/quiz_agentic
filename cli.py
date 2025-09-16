#!/usr/bin/env python3
"""Command-line interface for the Quiz Agent."""

import asyncio
import json
import sys
from typing import Optional
import argparse
from dotenv import load_dotenv

from quiz_agentic import QuizAgent
from quiz_agentic.protocols.a2a import A2AConfig
from quiz_agentic.protocols.mcp import MCPConfig


def print_quiz_state(state, show_full: bool = False):
    """Print quiz state in a readable format."""
    print(f"\n{'='*50}")
    print(f"Session ID: {state['session_id']}")
    print(f"Status: {state['agent_status']}")
    print(f"Operation: {state['operation_type']}")
    
    if state['error_message']:
        print(f"Error: {state['error_message']}")
    
    if state['current_quiz']:
        quiz = state['current_quiz']
        print(f"\nQuiz: {quiz.title}")
        if quiz.description:
            print(f"Description: {quiz.description}")
        print(f"Questions: {len(quiz.questions)}")
        
        if show_full:
            for i, question in enumerate(quiz.questions, 1):
                print(f"\nQuestion {i}: {question.question}")
                if question.options:
                    for j, option in enumerate(question.options):
                        print(f"  {chr(65+j)}) {option}")
                print(f"  Correct Answer: {question.correct_answer}")
                if question.explanation:
                    print(f"  Explanation: {question.explanation}")
                print(f"  Difficulty: {question.difficulty}")
    
    if state['search_results'] and show_full:
        print(f"\nSearch Results: {len(state['search_results'])}")
        for i, result in enumerate(state['search_results'][:3], 1):
            if isinstance(result, dict):
                print(f"  {i}. {result.get('title', 'No title')}")
                print(f"     URL: {result.get('url', 'No URL')}")
    
    if state['tool_outputs'] and show_full:
        print(f"\nTool Outputs: {len(state['tool_outputs'])}")
        for output in state['tool_outputs'][-2:]:  # Show last 2 outputs
            print(f"  - {output.get('tool', 'unknown')}: {output.get('timestamp', '')}")
    
    print(f"{'='*50}")


async def interactive_mode(agent: QuizAgent):
    """Run the agent in interactive mode."""
    print("Quiz Agent Interactive Mode")
    print("Type 'help' for commands, 'quit' to exit")
    print(f"Agent Status: {agent.get_status()}")
    
    while True:
        try:
            user_input = input("\n> ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                break
            elif user_input.lower() == 'help':
                print_help()
                continue
            elif user_input.lower() == 'status':
                status = agent.get_status()
                print(json.dumps(status, indent=2))
                continue
            elif user_input.lower() == 'clear':
                agent.session_id = f"session_{len(agent.session_id)}"
                print("Session cleared")
                continue
            elif not user_input:
                continue
            
            print("Processing...")
            state = await agent.process_input(user_input)
            print_quiz_state(state, show_full=True)
            
        except KeyboardInterrupt:
            print("\nInterrupted by user")
            break
        except Exception as e:
            print(f"Error: {e}")


def print_help():
    """Print help information."""
    print("""
Available commands:
  help           - Show this help message
  status         - Show agent status
  clear          - Clear current session
  quit/exit/q    - Exit the program

Example inputs:
  "Create a quiz about Python programming"
  "Generate 5 questions about machine learning"
  "Search for content about data science"
  "Extract content from https://example.com"
  "Validate my quiz"
""")


async def batch_mode(agent: QuizAgent, inputs: list):
    """Run the agent in batch mode with provided inputs."""
    print(f"Processing {len(inputs)} inputs in batch mode...")
    
    for i, user_input in enumerate(inputs, 1):
        print(f"\n--- Processing input {i}: {user_input[:50]}... ---")
        
        try:
            state = await agent.process_input(user_input)
            print_quiz_state(state)
        except Exception as e:
            print(f"Error processing input {i}: {e}")


def main():
    """Main CLI function."""
    parser = argparse.ArgumentParser(description="Quiz Agent CLI")
    parser.add_argument(
        "--mode", 
        choices=["interactive", "batch"],
        default="interactive",
        help="Run mode (default: interactive)"
    )
    parser.add_argument(
        "--input", 
        action="append",
        help="Input text for batch mode (can be used multiple times)"
    )
    parser.add_argument(
        "--no-a2a",
        action="store_true",
        help="Disable A2A protocol"
    )
    parser.add_argument(
        "--no-mcp",
        action="store_true",
        help="Disable MCP protocol"
    )
    parser.add_argument(
        "--a2a-port",
        type=int,
        default=8001,
        help="A2A protocol port (default: 8001)"
    )
    parser.add_argument(
        "--mcp-port",
        type=int,
        default=8002,
        help="MCP protocol port (default: 8002)"
    )
    
    args = parser.parse_args()
    
    # Load environment variables
    load_dotenv()
    
    # Create protocol configs
    a2a_config = A2AConfig(
        enabled=not args.no_a2a,
        port=args.a2a_port
    )
    
    mcp_config = MCPConfig(
        enabled=not args.no_mcp,
        port=args.mcp_port
    )
    
    try:
        # Initialize agent
        agent = QuizAgent(
            a2a_config=a2a_config,
            mcp_config=mcp_config
        )
        
        # Start agent
        agent.start()
        
        # Run based on mode
        if args.mode == "interactive":
            asyncio.run(interactive_mode(agent))
        elif args.mode == "batch":
            if not args.input:
                print("Error: Batch mode requires --input arguments")
                sys.exit(1)
            asyncio.run(batch_mode(agent, args.input))
        
    except ValueError as e:
        print(f"Configuration error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        try:
            agent.stop()
        except:
            pass


if __name__ == "__main__":
    main()