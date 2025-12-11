import React, { useState, useRef, useEffect } from 'react';
import { Device } from '../types';
import { analyzeFleetHealth, askSupportChat, AnalysisResult } from '../services/geminiService';
import { Sparkles, Send, Loader2, Bot, FileText, MessageSquare, Globe, ExternalLink } from 'lucide-react';

interface AIAnalystProps {
  devices: Device[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
}

export const AIAnalyst: React.FC<AIAnalystProps> = ({ devices }) => {
  const [reportData, setReportData] = useState<AnalysisResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleGenerateReport = async () => {
    setLoadingReport(true);
    const result = await analyzeFleetHealth(devices);
    setReportData(result);
    setLoadingReport(false);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoadingChat(true);

    const response = await askSupportChat(chatHistory, userMsg, devices);
    
    setChatHistory(prev => [...prev, { 
      role: 'model', 
      text: response.text,
      sources: response.sources
    }]);
    setLoadingChat(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
      
      {/* Left Column: Report Generator */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-purple-600" />
                Fleet Health Report
            </h2>
            <button 
                onClick={handleGenerateReport}
                disabled={loadingReport}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
            >
                {loadingReport ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                Generate Analysis
            </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
            {!reportData && !loadingReport && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <Sparkles size={48} className="mb-4 text-slate-200" />
                    <p>Click "Generate Analysis" to get AI insights about your fleet.</p>
                </div>
            )}
            {loadingReport && (
                <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                    <div className="h-32 bg-slate-100 rounded w-full"></div>
                </div>
            )}
            {reportData && (
                <>
                    <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap text-slate-700 leading-relaxed">
                        {reportData.markdown}
                    </div>
                    
                    {reportData.sources.length > 0 && (
                        <div className="mt-8 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                                <Globe size={12} />
                                References & Sources
                            </h4>
                            <ul className="space-y-2">
                                {reportData.sources.map((source, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm">
                                        <div className="mt-1 min-w-[4px] h-[4px] rounded-full bg-blue-400" />
                                        <a 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 group"
                                        >
                                            <span className="line-clamp-1">{source.title}</span>
                                            <ExternalLink size={10} className="opacity-50 group-hover:opacity-100" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
      </div>

      {/* Right Column: Chat Interface */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-600" />
                Ask Support AI
            </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {chatHistory.length === 0 && (
                <div className="text-center text-slate-400 mt-10">
                    <Bot size={48} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-sm">Ask questions like:</p>
                    <ul className="text-xs mt-2 space-y-1">
                        <li>"Which devices are offline?"</li>
                        <li>"How many Windows users do we have?"</li>
                        <li>"Draft an email to users with outdated versions"</li>
                    </ul>
                </div>
            )}
            {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                    }`}>
                        {msg.text}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 ml-2 max-w-[80%] bg-white/50 border border-slate-100 rounded-lg p-2 text-xs">
                             <div className="flex items-center gap-1 text-slate-500 mb-1 font-semibold">
                                <Globe size={10} />
                                <span>Sources</span>
                             </div>
                             <div className="space-y-1">
                                {msg.sources.map((s, i) => (
                                    <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline truncate">
                                        {s.title}
                                    </a>
                                ))}
                             </div>
                        </div>
                    )}
                </div>
            ))}
            {loadingChat && (
                <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                        <Loader2 className="animate-spin text-slate-400" size={16} />
                    </div>
                </div>
            )}
            <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-slate-100 bg-white">
            <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input 
                    type="text" 
                    className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Type a question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={loadingChat}
                />
                <button 
                    type="submit" 
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                    disabled={loadingChat || !chatInput.trim()}
                >
                    <Send size={20} />
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};