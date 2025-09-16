"""Quiz Agentic - A lightweight Quiz Agent with A2A and MCP protocol support."""

__version__ = "0.1.0"
__author__ = "Quiz Agentic Team"
__description__ = "A lightweight Quiz Agent built with LangGraph and LangChain tools with A2A and MCP protocol support"

# Import core components
from .core.state import QuizState, Quiz, QuizQuestion

# Conditionally import agent and protocols (may fail if dependencies not installed)
try:
    from .core.agent import QuizAgent
    _AGENT_AVAILABLE = True
except ImportError as e:
    print(f"Warning: QuizAgent not available due to missing dependencies: {e}")
    QuizAgent = None
    _AGENT_AVAILABLE = False

try:
    from .protocols.a2a import A2AProtocol
    _A2A_AVAILABLE = True
except ImportError as e:
    print(f"Warning: A2AProtocol not available due to missing dependencies: {e}")
    A2AProtocol = None
    _A2A_AVAILABLE = False

try:
    from .protocols.mcp import MCPProtocol
    _MCP_AVAILABLE = True
except ImportError as e:
    print(f"Warning: MCPProtocol not available due to missing dependencies: {e}")
    MCPProtocol = None
    _MCP_AVAILABLE = False

__all__ = [
    "QuizState",
    "Quiz", 
    "QuizQuestion",
    "QuizAgent",
    "A2AProtocol",
    "MCPProtocol",
]