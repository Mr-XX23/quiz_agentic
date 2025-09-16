import { Request, Response } from "express";

// one stop function to generate quiz
export const generateQuiz = async (req: Request, res: Response) => {

    // Extract prompt and schema from request body
    const { prompt } = req.body ?? {};

    // Validate prompt and schema
    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt or schema in request body" });
    }

    try {

        return res.status(200).json({ message: "QUIZ Normal" });

    } catch (error: any) {

        return res.status(500).json({ error: error?.message ?? "Unknown error" });

    }
};

// function to generate quiz with streaming
export const generateStreamingQuiz = async (req: Request, res: Response) => {

    // Extract prompt from query parameters
    const prompt = (req.query.prompt as string) ?? "";

    // Validate prompt
    if (!prompt) {
        res.status(400).json({ error: "Missing prompt query param" });
        return;
    }

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {

        return res.status(200).json({ message: "QUIZ Streaming" });

    } catch (err: any) {

        res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message })}\n\n`);
        // end the stream on error
        res.end();

    }
}