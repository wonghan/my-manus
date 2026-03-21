import React from 'react';
import { 
  Menu, 
  MessageSquare, 
  Plus, 
  Settings, 
  Search,
  Zap,
  Layout,
  Clock
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onNewSession: () => void;
}

const HISTORY_ITEMS = [
  { id: 1, title: 'Analyze Q3 Financial Data', time: '2 hours ago' },
  { id: 2, title: 'Build React components for dashboard', time: 'Yesterday' },
  { id: 3, title: 'Research competitors in EV space', time: '2 days ago' },
];

export function Sidebar({ isOpen, setIsOpen, onNewSession }: SidebarProps) {
  if (!isOpen) {
    return (
      <div className="w-14 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-4 gap-4 h-full hidden md:flex">
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-200 rounded-md text-gray-600 transition-colors"
        >
          <Menu size={20} />
        </button>
        <button 
          onClick={onNewSession}
          className="p-2 hover:bg-gray-200 rounded-md text-gray-600 transition-colors mt-2"
          title="New Session"
        >
          <Plus size={20} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button className="p-2 hover:bg-gray-200 rounded-md text-gray-600 transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full absolute md:relative z-10 shadow-lg md:shadow-none">
      <div className="p-4 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <Zap size={20} className="text-blue-500" />
          <span>Manus Clone</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="p-3">
        <button 
          onClick={onNewSession}
          className="w-full flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-3 rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <Plus size={16} />
          New Agent Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold text-gray-400 mb-3 px-2 uppercase tracking-wider">
          Recent
        </div>
        <div className="flex flex-col gap-1">
          {HISTORY_ITEMS.map((item) => (
            <button 
              key={item.id}
              className="w-full text-left flex flex-col gap-1 py-2 px-3 hover:bg-gray-200 rounded-md transition-colors group"
            >
              <span className="text-sm text-gray-700 truncate group-hover:text-gray-900">
                {item.title}
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={10} /> {item.time}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 flex items-center gap-3 hover:bg-gray-100 cursor-pointer transition-colors">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
          U
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="text-sm font-medium text-gray-800 truncate">User Account</div>
          <div className="text-xs text-gray-500 truncate">Pro Plan</div>
        </div>
        <Settings size={16} className="text-gray-400" />
      </div>
    </div>
  );
}
