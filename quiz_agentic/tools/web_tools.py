"""LangChain tools for web search and content extraction."""

import asyncio
from typing import Any, Dict, List, Optional
import httpx
from bs4 import BeautifulSoup
from langchain.tools import BaseTool
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain.callbacks.manager import CallbackManagerForToolRun
from pydantic import BaseModel, Field
import json
import os


class WebSearchInput(BaseModel):
    """Input schema for web search tool."""
    query: str = Field(description="Search query to find relevant content")
    max_results: int = Field(default=5, description="Maximum number of search results to return")


class ContentExtractionInput(BaseModel):
    """Input schema for content extraction tool."""
    urls: List[str] = Field(description="List of URLs to extract content from")
    max_content_length: int = Field(default=2000, description="Maximum content length per URL")


class QuizWebSearchTool(BaseTool):
    """Tool for searching the web for quiz-related content."""
    
    name: str = "quiz_web_search"
    description: str = "Search the web for content related to quiz topics"
    args_schema: type[BaseModel] = WebSearchInput
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.tavily_api_key = os.getenv("TAVILY_API_KEY")
        if self.tavily_api_key:
            self.tavily_search = TavilySearchResults(
                api_key=self.tavily_api_key,
                max_results=5
            )
        else:
            self.tavily_search = None
    
    def _run(
        self,
        query: str,
        max_results: int = 5,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> List[Dict[str, Any]]:
        """Execute the search synchronously."""
        if self.tavily_search:
            try:
                results = self.tavily_search.run(query)
                if isinstance(results, list):
                    return results[:max_results]
                elif isinstance(results, str):
                    # Parse string results if needed
                    try:
                        parsed_results = json.loads(results)
                        if isinstance(parsed_results, list):
                            return parsed_results[:max_results]
                    except json.JSONDecodeError:
                        pass
                    return [{"content": results, "url": "", "title": "Search Result"}]
            except Exception as e:
                return [{"error": f"Search failed: {str(e)}"}]
        
        # Fallback to basic search simulation
        return [
            {
                "title": f"Search result for: {query}",
                "url": "https://example.com",
                "content": f"Mock search result content for query: {query}",
                "score": 0.9
            }
        ]
    
    async def _arun(
        self,
        query: str,
        max_results: int = 5,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> List[Dict[str, Any]]:
        """Execute the search asynchronously."""
        return self._run(query, max_results, run_manager)


class ContentExtractionTool(BaseTool):
    """Tool for extracting content from web URLs."""
    
    name: str = "content_extraction"
    description: str = "Extract text content from web URLs for quiz generation"
    args_schema: type[BaseModel] = ContentExtractionInput
    
    def _run(
        self,
        urls: List[str],
        max_content_length: int = 2000,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> List[Dict[str, Any]]:
        """Extract content from URLs synchronously."""
        extracted_content = []
        
        for url in urls:
            try:
                with httpx.Client(timeout=10.0) as client:
                    response = client.get(url)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    # Remove script and style elements
                    for script in soup(["script", "style"]):
                        script.decompose()
                    
                    # Extract text content
                    text = soup.get_text()
                    
                    # Clean up text
                    lines = (line.strip() for line in text.splitlines())
                    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                    text = ' '.join(chunk for chunk in chunks if chunk)
                    
                    # Truncate if too long
                    if len(text) > max_content_length:
                        text = text[:max_content_length] + "..."
                    
                    extracted_content.append({
                        "url": url,
                        "content": text,
                        "length": len(text),
                        "title": soup.title.string if soup.title else "No title"
                    })
                    
            except Exception as e:
                extracted_content.append({
                    "url": url,
                    "error": f"Failed to extract content: {str(e)}",
                    "content": "",
                    "length": 0
                })
        
        return extracted_content
    
    async def _arun(
        self,
        urls: List[str],
        max_content_length: int = 2000,
        run_manager: Optional[CallbackManagerForToolRun] = None,
    ) -> List[Dict[str, Any]]:
        """Extract content from URLs asynchronously."""
        extracted_content = []
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            for url in urls:
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    # Remove script and style elements
                    for script in soup(["script", "style"]):
                        script.decompose()
                    
                    # Extract text content
                    text = soup.get_text()
                    
                    # Clean up text
                    lines = (line.strip() for line in text.splitlines())
                    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                    text = ' '.join(chunk for chunk in chunks if chunk)
                    
                    # Truncate if too long
                    if len(text) > max_content_length:
                        text = text[:max_content_length] + "..."
                    
                    extracted_content.append({
                        "url": url,
                        "content": text,
                        "length": len(text),
                        "title": soup.title.string if soup.title else "No title"
                    })
                    
                except Exception as e:
                    extracted_content.append({
                        "url": url,
                        "error": f"Failed to extract content: {str(e)}",
                        "content": "",
                        "length": 0
                    })
        
        return extracted_content


def get_quiz_tools() -> List[BaseTool]:
    """Get all available quiz tools."""
    return [
        QuizWebSearchTool(),
        ContentExtractionTool(),
    ]