# Quiz Agentic

A lightweight Quiz Agent built with LangGraph and LangChain tools with support for A2A (Agent-to-Agent) and MCP (Model Context Protocol) communication.

## Features

- **Quiz Generation**: Create comprehensive quizzes from topics using advanced LLM capabilities
- **Web Search**: Integrated web search for finding relevant content using Tavily
- **Content Extraction**: Extract text content from web URLs for quiz generation
- **JSON Schema Validation**: Comprehensive validation of quiz data structures
- **A2A Protocol Support**: Agent-to-Agent communication using LangGraph A2A
- **MCP Protocol Support**: Model Context Protocol integration for standardized AI communication
- **Interactive CLI**: Command-line interface for easy interaction
- **Async Operations**: Full async/await support for scalable operations

## Architecture

The agent is built using:
- **LangGraph**: For agent workflow orchestration
- **LangChain**: For LLM integration and tool management
- **Pydantic**: For data validation and schema enforcement
- **A2A Protocol**: For agent-to-agent communication
- **MCP Protocol**: For model context protocol compliance

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Mr-XX23/quiz_agentic.git
cd quiz_agentic
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# OpenAI API key for LLM operations
OPENAI_API_KEY=your_openai_api_key_here

# Tavily API key for web search functionality
TAVILY_API_KEY=your_tavily_api_key_here

# Agent configuration
AGENT_NAME=quiz_agent
AGENT_DESCRIPTION=A lightweight Quiz Agent with A2A and MCP support

# A2A Configuration
A2A_ENABLED=true
A2A_PORT=8001
A2A_HOST=localhost

# MCP Configuration
MCP_ENABLED=true
MCP_PORT=8002
MCP_HOST=localhost
```

## Usage

### Command Line Interface

Run the interactive CLI:
```bash
python cli.py
```

Run in batch mode:
```bash
python cli.py --mode batch --input "Create a quiz about Python" --input "Generate questions about AI"
```

Disable protocols:
```bash
python cli.py --no-a2a --no-mcp
```

### Python API

```python
import asyncio
from quiz_agentic import QuizAgent

async def main():
    # Initialize agent
    agent = QuizAgent()
    agent.start()
    
    try:
        # Create a quiz
        state = await agent.process_input("Create a quiz about machine learning with 5 questions")
        
        if state['current_quiz']:
            quiz = state['current_quiz']
            print(f"Generated: {quiz.title}")
            print(f"Questions: {len(quiz.questions)}")
            
            for question in quiz.questions:
                print(f"Q: {question.question}")
                print(f"A: {question.correct_answer}")
        
    finally:
        agent.stop()

asyncio.run(main())
```

### A2A Protocol Usage

```python
from quiz_agentic.protocols.a2a import A2AProtocol, A2AConfig

# Configure A2A
config = A2AConfig(agent_id="quiz_agent_1", port=8001)
a2a = A2AProtocol(config)
a2a.start()

# Register another agent
a2a.register_endpoint("quiz_agent_2", "localhost", 8002)

# Send message
message = a2a.create_message(
    "quiz_agent_2",
    "quiz_request", 
    {"topic": "Python", "num_questions": 5}
)
await a2a.send_message(message)
```

### MCP Protocol Usage

```python
from quiz_agentic.protocols.mcp import MCPProtocol, MCPConfig

# Configure MCP
config = MCPConfig(server_id="quiz_mcp_server", port=8002)
mcp = MCPProtocol(config)
mcp.start()

# Handle MCP request
request = {
    "jsonrpc": "2.0",
    "id": "1",
    "method": "quiz/create",
    "params": {"topic": "AI", "num_questions": 3}
}

response = await mcp.handle_request(request)
print(response.model_dump())
```

## Supported Operations

### Quiz Operations
- `"Create a quiz about [topic]"` - Generate a complete quiz
- `"Generate questions about [topic]"` - Create individual questions
- `"Validate my quiz"` - Validate current quiz structure

### Search Operations
- `"Search for content about [topic]"` - Web search for relevant content
- `"Find information on [topic]"` - Search and extract information

### Content Operations
- `"Extract content from [URL]"` - Extract text from web pages
- `"Get content from [URLs]"` - Batch content extraction

## Protocol Specifications

### A2A Message Types

The agent supports these A2A message types:
- `quiz_request` - Request quiz generation
- `quiz_response` - Response with quiz data
- `question_request` - Request individual questions
- `question_response` - Response with question data
- `ping/pong` - Connectivity testing
- `status` - Agent status updates

### MCP Methods

The agent implements these MCP methods:
- `initialize` - Initialize MCP connection
- `ping` - Connectivity test
- `get_capabilities` - Get available capabilities
- `quiz/create` - Create new quiz
- `quiz/get` - Retrieve quiz by ID
- `quiz/search` - Search existing quizzes
- `question/generate` - Generate questions
- `content/extract` - Extract web content
- `content/search` - Search web content

## Data Schemas

### Quiz Schema
```json
{
  "id": "string",
  "title": "string", 
  "description": "string",
  "questions": [
    {
      "id": "string",
      "question": "string",
      "type": "multiple_choice|true_false|short_answer|essay",
      "options": ["string"],
      "correct_answer": "string",
      "explanation": "string",
      "difficulty": "easy|medium|hard",
      "category": "string"
    }
  ],
  "metadata": {}
}
```

## Examples

Run the example script:
```bash
python example.py
```

This will demonstrate:
- Basic quiz creation
- Web search and content extraction
- A2A and MCP protocol integration
- Quiz validation

## Development

### Project Structure
```
quiz_agentic/
├── quiz_agentic/
│   ├── core/           # Core agent logic
│   │   ├── agent.py    # Main QuizAgent class
│   │   └── state.py    # State management
│   ├── protocols/      # Protocol implementations
│   │   ├── a2a.py      # A2A protocol
│   │   └── mcp.py      # MCP protocol
│   ├── tools/          # LangChain tools
│   │   └── web_tools.py # Web search and extraction
│   └── schemas/        # Data validation schemas
│       └── validation.py
├── cli.py              # Command-line interface
├── example.py          # Usage examples
├── requirements.txt    # Dependencies
└── pyproject.toml      # Project configuration
```

### Testing

Run basic functionality test:
```bash
python example.py
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Requirements

- Python 3.9+
- OpenAI API key
- Tavily API key (optional, for web search)

## Troubleshooting

### Common Issues

1. **Missing API Keys**: Ensure `.env` file contains valid API keys
2. **Port Conflicts**: Change A2A/MCP ports if already in use
3. **Dependencies**: Run `pip install -r requirements.txt` to install all dependencies

### Error Messages

- `"OpenAI API key is required"` - Set OPENAI_API_KEY in .env file
- `"A2A protocol not enabled"` - Set A2A_ENABLED=true or remove --no-a2a flag
- `"MCP protocol not enabled"` - Set MCP_ENABLED=true or remove --no-mcp flag
