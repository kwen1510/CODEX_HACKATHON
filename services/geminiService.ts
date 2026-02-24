
import { GoogleGenAI, Type } from "@google/genai";
import { ResearchAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeResearchQuestions = async (
  context: string,
  profile: string,
  questions: string[]
): Promise<ResearchAnalysis> => {
  const model = "gemini-3-pro-preview";

  const prompt = `
    Review the following primary research questions.
    
    RESEARCH CONTEXT (Objectives & Target Group):
    ${context}

    INTERVIEWEE PROFILE & PORTFOLIO:
    ${profile}

    RESEARCH QUESTIONS:
    ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

    Please conduct a rigorous audit on:
    1. COHERENCE: Does the sequence of questions flow logically? Does it respect the interviewee's specific seniority and background?
    2. COHESIVENESS: Do these questions directly serve the stated Research Objectives for the target group?
    3. EMPATHY (Tone & Phrasing): Are the questions sensitive? Do they avoid intrusive phrasing? Are they tailored to the interviewee's portfolio?
    4. NOVELTY: Use Google Search to check if this information is already available in secondary research. Identify if the questions are worth the time of a high-value interviewee.

    Provide structured feedback in JSON format including scores (0-100) for each category.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallSummary: { type: Type.STRING },
            scores: {
              type: Type.OBJECT,
              properties: {
                coherence: { type: Type.NUMBER },
                cohesiveness: { type: Type.NUMBER },
                empathyTone: { type: Type.NUMBER },
                empathyPhrasing: { type: Type.NUMBER },
                novelty: { type: Type.NUMBER },
              },
              required: ["coherence", "cohesiveness", "empathyTone", "empathyPhrasing", "novelty"]
            },
            categoryFeedback: {
              type: Type.OBJECT,
              properties: {
                coherence: { type: Type.STRING },
                cohesiveness: { type: Type.STRING },
                empathy: { type: Type.STRING },
                novelty: { type: Type.STRING },
              },
              required: ["coherence", "cohesiveness", "empathy", "novelty"]
            },
            questionFeedback: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.NUMBER },
                  question: { type: Type.STRING },
                  feedback: { type: Type.STRING },
                  suggestions: { type: Type.STRING },
                  isRedundant: { type: Type.BOOLEAN }
                },
                required: ["id", "question", "feedback", "suggestions", "isRedundant"]
              }
            }
          },
          required: ["overallSummary", "scores", "categoryFeedback", "questionFeedback"]
        }
      }
    });

    const result: ResearchAnalysis = JSON.parse(response.text);
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      result.groundingSources = groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          title: chunk.web.title,
          uri: chunk.web.uri
        }));
    }

    return result;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze research questions. Please check your connection and try again.");
  }
};
