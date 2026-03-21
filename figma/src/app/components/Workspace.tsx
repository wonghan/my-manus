import React from 'react';
import { 
  Globe, 
  Terminal, 
  Code2, 
  Table, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2,
  Minimize2,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type WorkspaceType = 'empty' | 'browser' | 'code' | 'table' | 'terminal';

interface WorkspaceProps {
  type: WorkspaceType;
  data: any;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const EmptyWorkspace = () => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center bg-gray-50/50">
    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 mb-2">
      <Globe size={32} className="text-gray-300" />
    </div>
    <p className="text-lg font-medium text-gray-500 tracking-tight">Agent Workspace</p>
    <p className="text-sm text-gray-400 max-w-sm">
      When the agent browses the web, writes code, or manipulates data, the results will appear here in real-time.
    </p>
  </div>
);

const BrowserWorkspace = ({ data }: { data: any }) => (
  <div className="flex flex-col h-full bg-white rounded-t-lg overflow-hidden shadow-sm border border-gray-200">
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-100 border-b border-gray-200 backdrop-blur-md bg-opacity-90">
      <div className="flex gap-1.5 shrink-0">
        <div className="w-3 h-3 rounded-full bg-red-400 shadow-sm border border-red-500/20" />
        <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm border border-amber-500/20" />
        <div className="w-3 h-3 rounded-full bg-green-400 shadow-sm border border-green-500/20" />
      </div>
      <div className="flex gap-1 ml-2 shrink-0">
        <button className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"><ChevronLeft size={16} /></button>
        <button className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"><ChevronRight size={16} /></button>
        <button className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"><RefreshCw size={14} /></button>
      </div>
      <div className="flex-1 flex items-center justify-center bg-white rounded-md px-3 py-1.5 text-xs text-gray-600 border border-gray-200 shadow-inner group">
        <ShieldAlert size={12} className="text-gray-400 mr-2 group-hover:text-green-500 transition-colors" />
        <span className="truncate max-w-[300px] font-medium tracking-wide">{data?.url || 'https://google.com'}</span>
      </div>
      <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500 transition-colors shrink-0">
        <ExternalLink size={14} />
      </button>
    </div>
    <div className="flex-1 overflow-auto bg-gray-50 relative p-6">
      <AnimatePresence mode="wait">
        {data?.isLoading ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm z-10"
          >
             <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center border border-gray-100 mb-4">
               <RefreshCw size={24} className="animate-spin text-blue-500" />
             </div>
             <div className="text-sm font-medium text-gray-600">Loading page content...</div>
          </motion.div>
        ) : (
          <motion.div 
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 bg-white p-8 rounded-xl shadow-sm border border-gray-100 min-h-full"
            dangerouslySetInnerHTML={{ __html: data?.html || '<h1>Welcome</h1><p>No content loaded.</p>' }}
          />
        )}
      </AnimatePresence>
    </div>
  </div>
);

const TableWorkspace = ({ data }: { data: any }) => (
  <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm tracking-wide">
        <Table size={16} className="text-blue-500" />
        {data?.title || 'Data Output'}
      </div>
      <div className="text-xs text-gray-400 font-medium bg-white px-2 py-1 rounded-md border border-gray-200 shadow-inner">
        {data?.rows?.length || 0} rows
      </div>
    </div>
    <div className="flex-1 overflow-auto bg-white p-1">
      <table className="w-full text-sm text-left relative">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
          <tr>
            {data?.headers?.map((h: string, i: number) => (
              <th key={i} className="px-6 py-4 font-semibold tracking-wider border-b border-gray-200 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.rows?.map((row: any[], i: number) => (
            <motion.tr 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={i} 
              className="bg-white border-b border-gray-100 hover:bg-blue-50/50 transition-colors group"
            >
              {row.map((cell: any, j: number) => (
                <td key={j} className="px-6 py-4 text-gray-700 border-r border-gray-50 last:border-r-0 group-hover:text-gray-900 transition-colors">
                  {cell}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const CodeWorkspace = ({ data }: { data: any }) => (
  <div className="flex flex-col h-full bg-[#1E1E1E] text-gray-300 rounded-lg overflow-hidden shadow-xl border border-gray-800">
     <div className="flex items-center justify-between px-4 py-2 bg-[#2D2D2D] border-b border-[#404040]">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
          <Code2 size={14} className="text-blue-400" />
          {data?.filename || 'script.py'}
        </div>
        <div className="flex gap-2">
            <button className="text-xs px-2 py-1 bg-[#3D3D3D] hover:bg-[#4D4D4D] rounded text-gray-300 transition-colors">Copy</button>
        </div>
     </div>
     <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
        <pre><code className="text-[#D4D4D4]">{data?.code || '// No code available'}</code></pre>
     </div>
  </div>
);

export function Workspace({ type, data, isFullscreen, onToggleFullscreen }: WorkspaceProps) {
  return (
    <div className="h-full w-full flex flex-col relative bg-gray-100/50 p-4">
      <div className="absolute top-6 right-6 z-20">
        <button 
          onClick={onToggleFullscreen}
          className="p-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 shadow-sm transition-all hover:shadow hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          title={isFullscreen ? "Restore View" : "Maximize Workspace"}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="flex-1 relative z-10 rounded-xl overflow-hidden shadow-sm border border-gray-200/50 bg-white">
        {type === 'empty' && <EmptyWorkspace />}
        {type === 'browser' && <BrowserWorkspace data={data} />}
        {type === 'table' && <TableWorkspace data={data} />}
        {type === 'code' && <CodeWorkspace data={data} />}
      </div>
    </div>
  );
}
