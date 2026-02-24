
import React, { useState } from 'react';
import { analyzeResearchQuestions } from './services/geminiService';
import { AppState } from './types';
import AnalysisChart from './components/AnalysisChart';

const MIN_CONTEXT_LENGTH = 25;
const MIN_PROFILE_LENGTH = 20;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    researchContext: '',
    intervieweeProfile: '',
    questions: [''],
    isAnalyzing: false,
    analysis: null,
    error: null,
  });

  const [showValidation, setShowValidation] = useState(false);

  const handleFieldChange = (field: keyof AppState, value: string) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  const handleQuestionChange = (index: number, value: string) => {
    const newQuestions = [...state.questions];
    newQuestions[index] = value;
    setState(prev => ({ ...prev, questions: newQuestions }));
  };

  const addQuestion = () => {
    setState(prev => ({ ...prev, questions: [...prev.questions, ''] }));
  };

  const removeQuestion = (index: number) => {
    if (state.questions.length === 1) {
      setState(prev => ({ ...prev, questions: [''] }));
      return;
    }
    const newQuestions = state.questions.filter((_, i) => i !== index);
    setState(prev => ({ ...prev, questions: newQuestions }));
  };

  const isContextValid = state.researchContext.trim().length >= MIN_CONTEXT_LENGTH;
  const isProfileValid = state.intervieweeProfile.trim().length >= MIN_PROFILE_LENGTH;
  const hasEmptyQuestions = state.questions.some(q => q.trim().length === 0);
  const nonEmptyQuestions = state.questions.filter(q => q.trim().length > 0);

  const runAnalysis = async () => {
    setShowValidation(true);

    if (!isContextValid) {
      setState(prev => ({ ...prev, error: `Research Context is too brief (min ${MIN_CONTEXT_LENGTH} characters).` }));
      return;
    }
    if (!isProfileValid) {
      setState(prev => ({ ...prev, error: `Interviewee Profile is too brief (min ${MIN_PROFILE_LENGTH} characters).` }));
      return;
    }
    if (hasEmptyQuestions || nonEmptyQuestions.length === 0) {
      setState(prev => ({ ...prev, error: "Please fill in all question fields or remove empty ones." }));
      return;
    }

    setState(prev => ({ ...prev, isAnalyzing: true, error: null }));
    try {
      const result = await analyzeResearchQuestions(
        state.researchContext, 
        state.intervieweeProfile, 
        nonEmptyQuestions
      );
      setState(prev => ({ ...prev, analysis: result, isAnalyzing: false }));
      setShowValidation(false);
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, isAnalyzing: false }));
    }
  };

  const reset = () => {
    setState({
      researchContext: '',
      intervieweeProfile: '',
      questions: [''],
      isAnalyzing: false,
      analysis: null,
      error: null,
    });
    setShowValidation(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 selection:bg-indigo-200">
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 ring-4 ring-indigo-50">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">ResearchInsight</h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">AI-Powered Research Audit</p>
            </div>
          </div>
          <button 
            onClick={reset} 
            className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all uppercase tracking-widest px-5 py-2.5 hover:bg-slate-100 rounded-xl"
          >
            Clear All
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Input Section */}
        <section className="space-y-10">
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-8">
              <h2 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-3">
                <span className="w-6 h-px bg-indigo-200"></span>
                01. Strategic Context
              </h2>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">Research Objectives</label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isContextValid ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    {state.researchContext.length} chars
                  </span>
                </div>
                <textarea
                  className={`w-full h-32 p-4 border rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all text-sm outline-none resize-none leading-relaxed text-slate-800 placeholder:text-slate-400 ${
                    showValidation && !isContextValid ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-slate-50/50 focus:border-indigo-500'
                  }`}
                  placeholder="Define your goals and target group... (e.g., 'Discover why young professionals are leaving urban centers...')"
                  value={state.researchContext}
                  onChange={(e) => handleFieldChange('researchContext', e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">Interviewee Profile</label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isProfileValid ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    {state.intervieweeProfile.length} chars
                  </span>
                </div>
                <textarea
                  className={`w-full h-32 p-4 border rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all text-sm outline-none resize-none leading-relaxed text-slate-800 placeholder:text-slate-400 ${
                    showValidation && !isProfileValid ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-slate-50/50 focus:border-indigo-500'
                  }`}
                  placeholder="Who are you interviewing? (e.g., 'Senior Urban Planner with 15+ years of experience in zoning...')"
                  value={state.intervieweeProfile}
                  onChange={(e) => handleFieldChange('intervieweeProfile', e.target.value)}
                />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-3">
                  <span className="w-6 h-px bg-indigo-200"></span>
                  02. Question Bank
                </h2>
                <button 
                  onClick={addQuestion} 
                  className="text-[11px] bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black hover:bg-slate-800 transition-all shadow-md active:scale-95 uppercase tracking-widest"
                >
                  Add Question
                </button>
              </div>
              
              <div className="space-y-5">
                {state.questions.map((q, idx) => (
                  <div key={idx} className="group relative flex gap-5 items-start">
                    <div className="flex-none w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center text-sm font-black border border-slate-200 transition-colors group-focus-within:bg-indigo-600 group-focus-within:text-white group-focus-within:border-indigo-600">
                      {idx + 1}
                    </div>
                    <div className="flex-grow space-y-1">
                      <textarea
                        rows={2}
                        className={`w-full p-4 border rounded-2xl focus:ring-4 focus:ring-indigo-100 transition-all text-sm outline-none resize-none leading-relaxed text-slate-800 placeholder:text-slate-400 ${
                          showValidation && q.trim().length === 0 ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-slate-50/50 focus:border-indigo-500 focus:bg-white'
                        }`}
                        placeholder="Draft question..."
                        value={q}
                        onChange={(e) => handleQuestionChange(idx, e.target.value)}
                      />
                      {showValidation && q.trim().length === 0 && (
                        <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight ml-1">This question cannot be empty</p>
                      )}
                    </div>
                    <button 
                      onClick={() => removeQuestion(idx)}
                      className="flex-none p-2.5 text-slate-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-lg mt-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={state.isAnalyzing}
            className={`w-full py-6 rounded-[2.5rem] font-black text-white shadow-2xl transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-4 ${
              state.isAnalyzing ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-300'
            }`}
          >
            {state.isAnalyzing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Auditing Protocol...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Validate Research
              </>
            )}
          </button>
          
          {state.error && (
            <div className="p-6 bg-rose-50 text-rose-700 rounded-3xl text-[12px] font-bold border border-rose-100 flex items-center gap-4 animate-shake shadow-lg shadow-rose-100">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="leading-tight">{state.error}</span>
            </div>
          )}
        </section>

        {/* Output Section */}
        <section className="space-y-12">
          {!state.analysis && !state.isAnalyzing && (
            <div className="h-full flex flex-col items-center justify-center text-center p-20 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 min-h-[700px] shadow-sm">
              <div className="w-28 h-28 bg-indigo-50 rounded-[3rem] flex items-center justify-center mb-10 rotate-6 shadow-inner ring-8 ring-white">
                <svg className="w-14 h-14 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.022.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.022.547l-2.387-.477a6 6 0 00-3.86.517" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-5 tracking-tight">Audit Insight Engine</h3>
              <p className="text-slate-500 text-base max-w-sm leading-relaxed font-medium mb-12">
                Submit your research goals and draft questions to receive a high-fidelity audit of tone, flow, and novelty.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                {['Cognitive Flow', 'Bias Screening', 'Tone Audit', 'Grounding'].map(tag => (
                  <div key={tag} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center">
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.isAnalyzing && (
            <div className="animate-pulse space-y-10">
              <div className="h-[450px] bg-white rounded-[4rem] border border-slate-100 shadow-sm"></div>
              <div className="grid grid-cols-2 gap-8">
                <div className="h-40 bg-white rounded-[3rem] border border-slate-100 shadow-sm"></div>
                <div className="h-40 bg-white rounded-[3rem] border border-slate-100 shadow-sm"></div>
              </div>
            </div>
          )}

          {state.analysis && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
              <div className="bg-white p-12 rounded-[4rem] shadow-2xl shadow-slate-200/50 border border-slate-100">
                <div className="flex justify-between items-start mb-12">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Performance Audit</h2>
                    <p className="text-[11px] text-emerald-500 font-black uppercase tracking-[0.4em] mt-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Analysis Verified
                    </p>
                  </div>
                </div>
                <AnalysisChart scores={state.analysis.scores} />
                <div className="mt-14 bg-slate-50 p-8 rounded-[3rem] border border-slate-200 ring-8 ring-slate-50/50">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Executive Review</h4>
                  <p className="text-base text-slate-700 leading-relaxed font-medium italic">
                    {state.analysis.overallSummary}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <CategoryCard title="Sequence & Flow" feedback={state.analysis.categoryFeedback.coherence} score={state.analysis.scores.coherence} />
                <CategoryCard title="Goal Alignment" feedback={state.analysis.categoryFeedback.cohesiveness} score={state.analysis.scores.cohesiveness} />
                <CategoryCard title="Empathy Tone" feedback={state.analysis.categoryFeedback.empathy} score={(state.analysis.scores.empathyTone + state.analysis.scores.empathyPhrasing) / 2} />
                <CategoryCard title="Novelty Factor" feedback={state.analysis.categoryFeedback.novelty} score={state.analysis.scores.novelty} />
              </div>

              <div className="bg-white p-12 rounded-[4rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                <h3 className="text-sm font-black text-slate-900 mb-12 uppercase tracking-widest text-center">In-Depth Question Critique</h3>
                <div className="space-y-10">
                  {state.analysis.questionFeedback.map((f, i) => (
                    <div key={i} className={`p-10 rounded-[3rem] border transition-all hover:shadow-lg ${f.isRedundant ? 'bg-amber-50/30 border-amber-200' : 'bg-slate-50/50 border-slate-200'}`}>
                      <div className="flex justify-between items-center mb-8">
                        <span className="text-[11px] font-black text-indigo-600 bg-white px-4 py-2 rounded-2xl border border-indigo-100 shadow-sm">QUESTION {f.id}</span>
                        {f.isRedundant && (
                          <div className="flex items-center gap-2.5 bg-amber-500 text-white text-[10px] px-5 py-2 rounded-full font-black uppercase tracking-widest shadow-md">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            Redundant Info
                          </div>
                        )}
                      </div>
                      <p className="text-lg font-bold text-slate-800 mb-10 leading-tight">"{f.question}"</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-10 border-t border-slate-200">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditor Feedback</p>
                          <p className="text-sm text-slate-600 leading-relaxed font-medium">{f.feedback}</p>
                        </div>
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Refinement Proposal</p>
                          <p className="text-sm text-indigo-800 italic font-bold leading-relaxed bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">"{f.suggestions}"</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {state.analysis.groundingSources && state.analysis.groundingSources.length > 0 && (
                <div className="bg-slate-900 p-12 rounded-[4rem] text-white shadow-3xl">
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-16 h-16 bg-slate-800 rounded-[2rem] flex items-center justify-center border border-slate-700 shadow-inner">
                      <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-black tracking-tight">External Grounding</h3>
                      <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.2em]">Contextual Secondary Search</p>
                    </div>
                  </div>
                  <p className="text-base text-slate-400 mb-12 leading-relaxed font-medium">
                    The ResearchInsight engine identified these publicly available data points. Pivoting your interview to address gaps in these resources will maximize the value of your participant's time.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {state.analysis.groundingSources.map((source, i) => (
                      <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-6 rounded-3xl bg-slate-800/40 border border-slate-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all group">
                        <span className="text-[12px] font-bold text-slate-300 group-hover:text-white truncate pr-4">{source.title}</span>
                        <svg className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const CategoryCard: React.FC<{ title: string; feedback: string; score: number }> = ({ title, feedback, score }) => {
  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    if (s >= 70) return 'text-amber-500 bg-amber-50 border-amber-100';
    return 'text-rose-500 bg-rose-50 border-rose-100';
  };

  return (
    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-all hover:shadow-xl group">
      <div>
        <div className="flex justify-between items-center mb-8">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h4>
          <span className={`text-[12px] font-black px-5 py-2 rounded-2xl border ${getScoreColor(score)}`}>{Math.round(score)}</span>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed font-medium transition-all group-hover:text-slate-800">{feedback}</p>
      </div>
    </div>
  );
};

export default App;
