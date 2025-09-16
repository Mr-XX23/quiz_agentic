// libraries
import { QuizSchemaExport as QuizSchema } from "../../../schemas/quizSchema";
import { z } from "zod";

// Function to convert data into structured JSON format
export const structuredJSONData = async (data: string) => {

    try {
        // helper function to try direct parsing
        const tryParse = (s: string) => {
            try {
                return JSON.parse(s);
            } catch (e) {
                console.log("Direct JSON parse failed:", e);
                return undefined;
            }
        }

        let parsed = tryParse(data);

        // if direct parse fails, extract first JSON object/array block
        if (parsed === undefined) {
            const match = data.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (!match) {
                console.log("No JSON object or array found in input string");
                throw new Error("No JSON object or array found in input string");
            }
            parsed = tryParse(match[0]);
            if (parsed === undefined) {
                console.log("Extracted substring is not valid JSON");
                throw new Error("Extracted substring is not valid JSON");
            }
        }

        // normalize into wrapper shape expected by schema
        let candidate: unknown;
        if (Array.isArray(parsed)) {
            if (parsed.length !== 20) {
                throw new Error(`Quiz has ${parsed.length} questions but needs exactly 20. Please call generate_quiz again with instruction to create exactly 20 questions.`);
            }
            candidate = { data: { minItems: 20, maxItems: 20, quiz_questions: parsed } };
        } else if (parsed && typeof parsed === "object") {
            const p: any = parsed;
            if ("quiz_questions" in p && Array.isArray(p.quiz_questions)) {
                if (p.quiz_questions.length !== 20) {
                    throw new Error(`Quiz has ${p.quiz_questions.length} questions but needs exactly 20. Please call generate_quiz again with instruction to create exactly 20 questions.`);
                }
                candidate = { data: { minItems: 20, maxItems: 20, quiz_questions: p.quiz_questions } };
            } else if ("data" in p && p.data && typeof p.data === "object") {
                candidate = p;
            } else {
                throw new Error("JSON missing quiz_questions array. Please call generate_quiz to create proper quiz format.");
            }
        } else {
            throw new Error("Invalid data format. Please call generate_quiz to create quiz questions first.");
        }


        // validate against schema
        const validated = QuizSchema.parse(candidate);
        console.log("Validation succeeded", validated);
        return validated;
    } catch (err: any) {
        if (err instanceof z.ZodError) {
            console.log("Validation errors:", err.issues);
            const issues = err.issues;
            const countError = issues.find(issue => issue.message.includes("exactly 20"));
            if (countError) {
                throw new Error("Validation failed: Quiz must have exactly 20 questions. Please call generate_quiz again and ensure you create exactly 20 questions.");
            }
            throw new Error(`Validation failed: ${issues || "Invalid quiz format"}. Please call generate_quiz again with correct format.`);
        }
        throw new Error(`Structuring failed: ${err?.message ?? String(err)}`);
    }
}