import { z } from "zod";

// Define the schema for answers
const Answer = z.object({
    answer: z.string()
});

// define the schema for questions
const Question = z.object({
    question: z.string(),
    correct_answer: z.string(),
    answers: z.array(Answer).length(5)
});

// Define the main schema for the quiz response
const QuizSchema = z.object({
    data: z.object({
        minItems: z.number().int().min(20).max(20),
        maxItems: z.number().int().min(20).max(20),
        quiz_questions: z.array(Question).length(20),
    })
})

// export schema and type
export const QuizSchemaExport = QuizSchema;
export type StructuredResponse = z.infer<typeof QuizSchema>;