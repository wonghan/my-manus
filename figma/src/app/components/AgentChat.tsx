import React, { useRef, useEffect } from 'react';
import { Send, User, Bot, Paperclip, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AgentSteps, AgentStep } from './AgentSteps';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'error';
  content: string;
  steps?: AgentStep[];
}

interface AgentChatProps {
  messages: ChatMessage[];
  isThinking: boolean;
  onSendMessage: (msg: string) => void;
  isSidebarOpen: boolean;
  isFullscreen: boolean;
}

export function AgentChat({ messages, isThinking, onSendMessage, isSidebarOpen, isFullscreen }: AgentChatProps) {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  useEffect(() => {
    if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isThinking) {
      onSendMessage(input.trim());
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center px-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                transition={{ duration: 0.3 }}
                className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-blue-100"
              >
                <Sparkles size={32} className="text-blue-500" />
              </motion.div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">How can I help you today?</h1>
              <p className="text-gray-500 mb-8 max-w-md">I am an autonomous agent capable of browsing the web, writing code, and executing complex tasks.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {[
                  "Research top AI agents",
                  "Scrape data from a website",
                  "Build a React component",
                  "Analyze my local CSV file"
                ].map((suggestion, i) => (
                  <button 
                    key={i}
                    onClick={() => onSendMessage(suggestion)}
                    className="text-left p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700 bg-white shadow-sm hover:shadow group"
                  >
                    <div className="font-medium group-hover:text-blue-700 transition-colors">{suggestion}</div>
                    <div className="text-gray-400 mt-1 text-xs group-hover:text-blue-500/70">Click to start</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-blue-100 shrink-0 flex items-center justify-center mt-1 border border-blue-200 shadow-sm">
                    {msg.role === 'error' ? <AlertCircle size={16} className="text-red-500" /> : <Bot size={16} className="text-blue-600" />}
                  </div>
                )}
                
                <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-gray-900 text-white px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm text-[15px] leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="flex flex-col w-full">
                      {msg.content && (
                        <div className="text-gray-800 text-[15px] leading-relaxed prose prose-blue max-w-none mb-3">
                          {msg.content}
                        </div>
                      )}
                      {msg.steps && msg.steps.length > 0 && (
                        <AgentSteps steps={msg.steps} />
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
          {isThinking && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex gap-4"
             >
                <div className="w-8 h-8 rounded-full bg-blue-100 shrink-0 flex items-center justify-center mt-1 border border-blue-200 shadow-sm">
                  <Bot size={16} className="text-blue-600" />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 font-medium tracking-wide bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                  Agent is thinking...
                </div>
             </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 relative z-20">
        <div className={`max-w-3xl mx-auto transition-all duration-300 ${isFullscreen && messages.length === 0 ? 'scale-110 -translate-y-12' : ''}`}>
          <form 
            onSubmit={handleSubmit}
            className={`relative flex items-end gap-2 bg-gray-50 border border-gray-300 rounded-2xl p-2 transition-all duration-200 focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-blue-400 focus-within:bg-white shadow-sm ${isThinking ? 'opacity-70' : ''}`}
          >
            <button 
              type="button"
              className="p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-200 transition-colors shrink-0 mb-0.5"
              disabled={isThinking}
            >
              <Paperclip size={20} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to do anything..."
              disabled={isThinking}
              className="w-full max-h-[120px] bg-transparent resize-none outline-none py-3 px-1 text-[15px] placeholder:text-gray-400 text-gray-800 disabled:cursor-not-allowed m-0 flex-1 leading-relaxed"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className={`p-2.5 rounded-xl shrink-0 mb-0.5 transition-all shadow-sm ${
                input.trim() && !isThinking
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 hover:shadow-md' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send size={18} className={input.trim() && !isThinking ? 'translate-x-0.5 -translate-y-0.5' : ''} />
            </button>
          </form>
          <div className="text-center mt-2 text-xs text-gray-400 font-medium tracking-wide">
            Agent can make mistakes. Verify important information.
          </div>
        </div>
      </div>
    </div>
  );
}
