
export interface ResearchAnalysis {
  overallSummary: string;
  scores: {
    coherence: number;
    cohesiveness: number;
    empathyTone: number;
    empathyPhrasing: number;
    novelty: number;
  };
  categoryFeedback: {
    coherence: string;
    cohesiveness: string;
    empathy: string;
    novelty: string;
  };
  questionFeedback: {
    id: number;
    question: string;
    feedback: string;
    suggestions: string;
    isRedundant: boolean;
  }[];
  groundingSources?: { title: string; uri: string }[];
}

export interface AppState {
  researchContext: string; // Combined Objective and Target Group
  intervieweeProfile: string; // Specific Interviewee & Portfolio
  questions: string[];
  isAnalyzing: boolean;
  analysis: ResearchAnalysis | null;
  error: string | null;
}
