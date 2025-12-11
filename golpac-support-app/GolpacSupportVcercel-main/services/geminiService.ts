import { GoogleGenAI } from "@google/genai";
import { Device } from "../types";

// Helper to get AI instance safely
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface AnalysisResult {
  markdown: string;
  sources: { title: string; uri: string }[];
}

export interface ChatResponse {
  text: string;
  sources: { title: string; uri: string }[];
}

export const analyzeFleetHealth = async (devices: Device[]): Promise<AnalysisResult> => {
  try {
    const ai = getAI();
    const deviceSummary = devices.map(d => 
      `- ${d.hostname} (${d.os} ${d.osVersion}): App v${d.appVersion}, Status: ${d.status}, Last Seen: ${d.lastSeen}`
    ).join('\n');

    const prompt = `
      You are an expert IT Support Analyst for the Golpac application.
      Here is the current status of all devices running the Golpac app:

      ${deviceSummary}

      Please provide a comprehensive Markdown report including:
      1. A brief executive summary of the fleet's health.
      2. Identify devices running outdated app versions (Latest is 2.4.1).
      3. **Search for and flag** any recent critical security vulnerabilities (CVEs) for the specific OS versions listed (e.g. Windows 11, specific Ubuntu versions).
      4. Recommendations for the support team.
      
      Keep the tone professional and actionable.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }], // Enable Search Grounding
      }
    });

    // Extract grounding sources (deduplicated by URI)
    const rawSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map(chunk => chunk.web as any)
      .filter((web: any) => web && web.uri && web.title) || [];
    
    // Simple deduplication based on URI
    const uniqueSources = Array.from(new Map(rawSources.map((s: any) => [s.uri, s])).values())
      .map((s: any) => ({ title: s.title, uri: s.uri }));

    return { 
      markdown: response.text || "No analysis could be generated at this time.", 
      sources: uniqueSources 
    };

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return { 
      markdown: "Error generating report. Please ensure your API_KEY environment variable is set in Vercel.", 
      sources: [] 
    };
  }
};

export const askSupportChat = async (history: {role: 'user' | 'model', text: string}[], newMessage: string, devices: Device[]): Promise<ChatResponse> => {
  try {
     const ai = getAI();
     // We inject the context dynamically
     const context = `Current Fleet Context: ${JSON.stringify(devices.map(d => ({ host: d.hostname, status: d.status, ver: d.appVersion })))}`;
     
     const chat = ai.chats.create({
       model: 'gemini-2.5-flash',
       config: {
         systemInstruction: `You are an AI assistant for the Golpac Support IT - Panel. You have access to the following fleet data: ${context}. Answer questions about specific devices, status counts, or general troubleshooting. You have access to Google Search to find the latest troubleshooting steps for specific errors or OS issues if asked.`,
         tools: [{ googleSearch: {} }]
       },
       history: history.map(h => ({
         role: h.role,
         parts: [{ text: h.text }]
       }))
     });

     const result = await chat.sendMessage({ message: newMessage });
     
     // Extract sources for chat as well
     const rawSources = result.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map(chunk => chunk.web as any)
      .filter((web: any) => web && web.uri && web.title) || [];
    
     const uniqueSources = Array.from(new Map(rawSources.map((s: any) => [s.uri, s])).values())
      .map((s: any) => ({ title: s.title, uri: s.uri }));

     return {
       text: result.text || "I didn't understand that.",
       sources: uniqueSources
     };

  } catch (error) {
    console.error("Chat Failed:", error);
    return {
      text: "Sorry, I encountered an error processing your request. Please check your API configuration.",
      sources: []
    };
  }
}