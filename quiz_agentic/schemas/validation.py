"""JSON schema definitions for quiz data validation."""

from typing import Any, Dict

# Quiz question schema
QUIZ_QUESTION_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "description": "Unique identifier for the question"
        },
        "question": {
            "type": "string",
            "description": "The quiz question text"
        },
        "type": {
            "type": "string",
            "enum": ["multiple_choice", "true_false", "short_answer", "essay"],
            "description": "Type of question"
        },
        "options": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "description": "Answer options for multiple choice questions"
        },
        "correct_answer": {
            "type": "string",
            "description": "The correct answer"
        },
        "explanation": {
            "type": ["string", "null"],
            "description": "Explanation for the correct answer"
        },
        "difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard"],
            "description": "Difficulty level of the question"
        },
        "category": {
            "type": ["string", "null"],
            "description": "Category or subject of the question"
        },
        "source": {
            "type": ["string", "null"],
            "description": "Source of the question content"
        }
    },
    "required": ["id", "question", "type", "correct_answer"],
    "additionalProperties": False
}

# Quiz schema
QUIZ_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "description": "Unique identifier for the quiz"
        },
        "title": {
            "type": "string",
            "description": "Title of the quiz"
        },
        "description": {
            "type": ["string", "null"],
            "description": "Description of the quiz"
        },
        "questions": {
            "type": "array",
            "items": QUIZ_QUESTION_SCHEMA,
            "description": "List of quiz questions"
        },
        "metadata": {
            "type": "object",
            "properties": {
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"},
                "author": {"type": "string"},
                "version": {"type": "string"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "additionalProperties": True
        }
    },
    "required": ["id", "title", "questions"],
    "additionalProperties": False
}

# A2A message schema
A2A_MESSAGE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "message_id": {
            "type": "string",
            "description": "Unique identifier for the message"
        },
        "sender_id": {
            "type": "string", 
            "description": "ID of the sending agent"
        },
        "receiver_id": {
            "type": "string",
            "description": "ID of the receiving agent"
        },
        "message_type": {
            "type": "string",
            "enum": ["quiz_request", "quiz_response", "question_request", "question_response", "status", "error"],
            "description": "Type of A2A message"
        },
        "payload": {
            "type": "object",
            "description": "Message payload data"
        },
        "timestamp": {
            "type": "string",
            "format": "date-time",
            "description": "Message timestamp"
        }
    },
    "required": ["message_id", "sender_id", "receiver_id", "message_type", "payload", "timestamp"],
    "additionalProperties": False
}

# MCP request schema
MCP_REQUEST_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "jsonrpc": {
            "type": "string",
            "enum": ["2.0"],
            "description": "JSON-RPC version"
        },
        "id": {
            "oneOf": [
                {"type": "string"},
                {"type": "number"},
                {"type": "null"}
            ],
            "description": "Request identifier"
        },
        "method": {
            "type": "string",
            "description": "Method name"
        },
        "params": {
            "type": "object",
            "description": "Method parameters"
        }
    },
    "required": ["jsonrpc", "method"],
    "additionalProperties": False
}