import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { AgentChat, ChatMessage } from './components/AgentChat';
import { Workspace, WorkspaceType } from './components/Workspace';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AgentStep } from './components/AgentSteps';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('empty');
  const [workspaceData, setWorkspaceData] = useState<any>(null);
  
  // Layout state
  const [leftPanelSize, setLeftPanelSize] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Simulation refs
  const currentMsgIdRef = useRef<string | null>(null);

  const handleNewSession = () => {
    setMessages([]);
    setWorkspaceType('empty');
    setWorkspaceData(null);
    setLeftPanelSize(100);
    setIsThinking(false);
  };

  const updateMessageSteps = (msgId: string, steps: AgentStep[]) => {
    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, steps } : m
    ));
  };

  const simulateAgentTask = async (userPrompt: string) => {
    // 1. Add User Message
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: userPrompt };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    // Give UI time to update, then transition layout if it's the first prompt
    await new Promise(r => setTimeout(r, 500));
    if (leftPanelSize > 60) {
       setLeftPanelSize(40);
    }

    // 2. Start Agent Message
    const agentMsgId = (Date.now() + 1).toString();
    const initialAgentMsg: ChatMessage = {
      id: agentMsgId,
      role: 'agent',
      content: '',
      steps: []
    };
    setMessages(prev => [...prev, initialAgentMsg]);
    currentMsgIdRef.current = agentMsgId;

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      // Step 1: Plan
      let currentSteps: AgentStep[] = [{
        id: 's1', type: 'plan', title: 'Analyzing request and creating plan', status: 'running',
        logs: ['Received prompt', 'Parsing intent', 'Generating execution graph...']
      }];
      updateMessageSteps(agentMsgId, [...currentSteps]);
      await delay(1500);
      
      currentSteps[0].status = 'completed';
      currentSteps[0].details = 'Plan created: 1. Search top agents. 2. Extract data. 3. Format table.';
      updateMessageSteps(agentMsgId, [...currentSteps]);

      // Step 2: Search Web
      currentSteps.push({
        id: 's2', type: 'search', title: 'Searching the web', status: 'running',
        logs: ['query: "top autonomous AI agents 2024 comparison"', 'Executing Google search...']
      });
      updateMessageSteps(agentMsgId, [...currentSteps]);
      await delay(1000);

      // Open Browser Workspace Loading
      setWorkspaceType('browser');
      setWorkspaceData({ url: 'https://google.com/search?q=top+autonomous+ai+agents+2024', isLoading: true });
      await delay(1500);

      currentSteps[1].status = 'completed';
      currentSteps[1].logs?.push('Found 15 relevant results.');
      
      // Step 3: Browse and Scrape
      currentSteps.push({
        id: 's3', type: 'browse', title: 'Reading articles', status: 'running',
        subSteps: [
          { id: 's3-1', type: 'browse', title: 'Navigating to TechCrunch article', status: 'running' }
        ]
      });
      updateMessageSteps(agentMsgId, [...currentSteps]);
      
      // Update Browser Workspace Loaded
      setWorkspaceData({ 
        url: 'https://techcrunch.com/best-ai-agents-2024', 
        isLoading: false,
        html: `
          <h1 class="text-3xl font-bold mb-4">The Top 5 Autonomous AI Agents of 2024</h1>
          <p class="text-gray-600 mb-6 font-medium tracking-wide">A comprehensive comparison of the leading AI agents dominating the market today.</p>
          <div class="space-y-6">
            <div class="p-5 bg-blue-50/50 rounded-xl border border-blue-100 shadow-sm transition-all hover:shadow-md">
                <h2 class="text-xl font-bold text-blue-900 mb-2 flex items-center gap-2"><div class="w-8 h-8 bg-blue-500 rounded-lg text-white flex items-center justify-center text-sm font-bold">1</div> AutoGPT</h2>
                <p class="text-gray-700 leading-relaxed">The pioneer in open-source autonomous agents, now featuring profound multi-step reasoning capabilities and seamless tool integrations.</p>
            </div>
            <div class="p-5 bg-purple-50/50 rounded-xl border border-purple-100 shadow-sm transition-all hover:shadow-md">
                <h2 class="text-xl font-bold text-purple-900 mb-2 flex items-center gap-2"><div class="w-8 h-8 bg-purple-500 rounded-lg text-white flex items-center justify-center text-sm font-bold">2</div> Devin</h2>
                <p class="text-gray-700 leading-relaxed">The first fully autonomous AI software engineer. Excels at complex coding tasks, bug fixing, and entire project generation.</p>
            </div>
            <div class="p-5 bg-emerald-50/50 rounded-xl border border-emerald-100 shadow-sm transition-all hover:shadow-md">
                <h2 class="text-xl font-bold text-emerald-900 mb-2 flex items-center gap-2"><div class="w-8 h-8 bg-emerald-500 rounded-lg text-white flex items-center justify-center text-sm font-bold">3</div> BabyAGI</h2>
                <p class="text-gray-700 leading-relaxed">A task-driven autonomous agent focused on creating, prioritizing, and executing tasks efficiently using continuous learning loops.</p>
            </div>
          </div>
        `
      });
      await delay(2000);

      currentSteps[2].subSteps![0].status = 'completed';
      currentSteps[2].status = 'completed';
      currentSteps[2].details = 'Extracted data for AutoGPT, Devin, BabyAGI.';
      updateMessageSteps(agentMsgId, [...currentSteps]);

      // Step 4: Formatting Table
      currentSteps.push({
        id: 's4', type: 'extract', title: 'Compiling results into a table', status: 'running'
      });
      updateMessageSteps(agentMsgId, [...currentSteps]);
      await delay(1000);
      
      setWorkspaceType('table');
      setWorkspaceData({
        title: 'Top AI Agents Comparison',
        headers: ['Rank', 'Agent Name', 'Primary Focus', 'Key Feature'],
        rows: [
          ['1', 'AutoGPT', 'General Tasks', 'Open-source ecosystem'],
          ['2', 'Devin', 'Software Engineering', 'End-to-end coding capabilities'],
          ['3', 'BabyAGI', 'Task Management', 'Task prioritization loops'],
          ['4', 'ChatDev', 'Collaborative coding', 'Multi-agent roleplay'],
          ['5', 'AgentGPT', 'No-code agents', 'Browser-based deployment']
        ]
      });

      currentSteps[3].status = 'completed';
      updateMessageSteps(agentMsgId, [...currentSteps]);

      // Final Answer
      setMessages(prev => prev.map(m => 
        m.id === agentMsgId ? { ...m, content: "I've researched the top AI agents and compiled them into a comparison table for you. Devin seems to be leading in software engineering, while AutoGPT remains the most versatile open-source option. Let me know if you need deeper analysis on any specific agent!" } : m
      ));

    } catch (e) {
       console.error(e);
    } finally {
      setIsThinking(false);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setLeftPanelSize(isFullscreen ? 40 : 0);
  };

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans text-gray-900 selection:bg-blue-200 selection:text-blue-900">
      <Sidebar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onNewSession={handleNewSession}
      />
      
      <div className="flex-1 h-full relative overflow-hidden flex flex-col bg-gray-50/50">
        {workspaceType === 'empty' ? (
          <div className="h-full w-full max-w-4xl mx-auto flex-1 shadow-2xl shadow-gray-200/20">
            <AgentChat 
              messages={messages} 
              isThinking={isThinking} 
              onSendMessage={simulateAgentTask}
              isSidebarOpen={isSidebarOpen}
              isFullscreen={isFullscreen}
            />
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full w-full">
            <Panel 
              defaultSize={45} 
              minSize={30} 
              className={`h-full bg-white border-r border-gray-200/80 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10 ${isFullscreen ? 'hidden' : 'block'}`}
            >
              <AgentChat 
                messages={messages} 
                isThinking={isThinking} 
                onSendMessage={simulateAgentTask}
                isSidebarOpen={isSidebarOpen}
                isFullscreen={isFullscreen}
              />
            </Panel>

            {!isFullscreen && (
              <PanelResizeHandle className="w-1.5 bg-gray-100/50 hover:bg-blue-400 active:bg-blue-500 transition-colors cursor-col-resize z-20 flex items-center justify-center group border-x border-gray-200/50">
                  <div className="h-8 w-1 bg-gray-300 rounded-full group-hover:bg-white transition-colors" />
              </PanelResizeHandle>
            )}

            <Panel 
              defaultSize={isFullscreen ? 100 : 55} 
              minSize={20}
              className="h-full relative z-0 bg-gray-50/80"
            >
              <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-60 z-0 pointer-events-none" />
              <div className="h-full w-full relative z-10 p-2 md:p-4 pb-4">
                 <Workspace 
                   type={workspaceType} 
                   data={workspaceData} 
                   isFullscreen={isFullscreen}
                   onToggleFullscreen={toggleFullscreen}
                 />
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
