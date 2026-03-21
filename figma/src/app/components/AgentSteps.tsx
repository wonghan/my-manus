import React from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Search, 
  Globe, 
  Code2, 
  Database,
  Terminal,
  FileText,
  MousePointer2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';
export type StepType = 'plan' | 'search' | 'browse' | 'code' | 'extract' | 'terminal' | 'write' | 'click' | 'wait';

export interface AgentStep {
  id: string;
  type: StepType;
  title: string;
  status: StepStatus;
  details?: string;
  logs?: string[];
  subSteps?: AgentStep[];
}

interface AgentStepsProps {
  steps: AgentStep[];
}

const getStepIcon = (type: StepType, status: StepStatus) => {
  if (status === 'completed') return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
  if (status === 'running') return <Loader2 size={16} className="text-blue-500 animate-spin shrink-0" />;
  
  const iconClass = "text-gray-400 shrink-0";
  switch (type) {
    case 'search': return <Search size={16} className={iconClass} />;
    case 'browse': return <Globe size={16} className={iconClass} />;
    case 'code': return <Code2 size={16} className={iconClass} />;
    case 'extract': return <Database size={16} className={iconClass} />;
    case 'terminal': return <Terminal size={16} className={iconClass} />;
    case 'write': return <FileText size={16} className={iconClass} />;
    case 'click': return <MousePointer2 size={16} className={iconClass} />;
    default: return <Circle size={16} className={iconClass} />;
  }
};

const StepItem = ({ step, isLast }: { step: AgentStep; isLast: boolean }) => {
  const [isExpanded, setIsExpanded] = React.useState(step.status === 'running' || step.status === 'error');

  // Auto-expand when running
  React.useEffect(() => {
    if (step.status === 'running') setIsExpanded(true);
  }, [step.status]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col group"
    >
      {!isLast && (
        <div className="absolute left-[7.5px] top-6 bottom-[-8px] w-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
      )}
      
      <div 
        className="flex items-start gap-3 py-1.5 z-10 cursor-pointer hover:bg-gray-50/50 rounded-md -ml-2 px-2 transition-colors"
        onClick={() => (step.details || step.logs || step.subSteps) && setIsExpanded(!isExpanded)}
      >
        <div className="mt-0.5 bg-white shrink-0 shadow-[0_0_0_4px_white]">
          {getStepIcon(step.type, step.status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${
              step.status === 'pending' ? 'text-gray-400' : 
              step.status === 'error' ? 'text-red-600' :
              'text-gray-800'
            }`}>
              {step.title}
            </span>
            {(step.details || step.logs || step.subSteps) && (
              <span className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
          </div>
          
          <AnimatePresence>
            {isExpanded && (step.details || step.logs || step.subSteps) && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {step.details && (
                  <div className="text-xs text-gray-500 mt-1 pl-1 border-l-2 border-gray-100 py-1">
                    {step.details}
                  </div>
                )}
                {step.logs && step.logs.length > 0 && (
                  <div className="mt-2 bg-gray-900 rounded-md p-2 font-mono text-[10px] text-gray-300 overflow-x-auto shadow-inner border border-gray-800">
                    {step.logs.map((log, i) => (
                      <div key={i} className="whitespace-pre-wrap leading-tight font-mono">{log}</div>
                    ))}
                    {step.status === 'running' && (
                      <div className="animate-pulse w-2 h-3 bg-gray-500 mt-1"></div>
                    )}
                  </div>
                )}
                {step.subSteps && step.subSteps.length > 0 && (
                  <div className="mt-2 pl-4">
                    {step.subSteps.map((subStep, idx) => (
                      <StepItem 
                        key={subStep.id} 
                        step={subStep} 
                        isLast={idx === step.subSteps!.length - 1} 
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export function AgentSteps({ steps }: AgentStepsProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 my-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <Terminal size={14} />
        Agent Reasoning
      </div>
      <div className="flex flex-col ml-1">
        {steps.map((step, index) => (
          <StepItem 
            key={step.id} 
            step={step} 
            isLast={index === steps.length - 1} 
          />
        ))}
      </div>
    </div>
  );
}
