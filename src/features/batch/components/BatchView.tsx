import React, { useEffect, useState } from 'react';
import { BatchDropZone } from './BatchDropZone';
import { BatchControls } from './BatchControls';
import { BatchProgressBar } from './BatchProgressBar';
import { BatchQueueGrid } from './BatchQueueGrid';
import { batchQueueService, QueueState } from '../../../services/queue/BatchQueueService';
import { Button } from '../../../components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  onNavigateTab?: (tab: 'keys' | 'batch' | 'review' | 'export') => void;
}

export const BatchView: React.FC<Props> = ({ onNavigateTab }) => {
  const [queueState, setQueueState] = useState<QueueState>(batchQueueService.getState());
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(true);
  const [aiModelName, setAiModelName] = useState<string>('Midjourney v6');
  const [userPrompt, setUserPrompt] = useState<string>('');

  useEffect(() => {
    const unsubscribe = batchQueueService.subscribe((state) => {
      setQueueState({ ...state });
    });
    return () => unsubscribe();
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    await batchQueueService.addFiles(files);
  };

  const handleStart = () => {
    batchQueueService.start(isAiGenerated, userPrompt, aiModelName);
  };

  const handlePause = () => {
    batchQueueService.pause();
  };

  const handleResume = () => {
    batchQueueService.resume(isAiGenerated, userPrompt, aiModelName);
  };

  const handleStop = () => {
    batchQueueService.stop();
  };

  const handleClear = () => {
    batchQueueService.clear();
  };

  const handleRetryFailed = () => {
    batchQueueService.retryFailed(isAiGenerated, userPrompt, aiModelName);
  };

  const handleRemoveItem = (id: string) => {
    batchQueueService.removeItem(id);
  };

  const isRunning = queueState.status === 'running';
  const hasProcessed = queueState.processedCount > 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <BatchDropZone onFilesSelected={handleFilesSelected} disabled={isRunning} />

      {/* Controls Bar */}
      {queueState.totalCount > 0 && (
        <BatchControls
          queueState={queueState}
          isAiGenerated={isAiGenerated}
          onToggleAiGenerated={setIsAiGenerated}
          aiModelName={aiModelName}
          onChangeAiModelName={setAiModelName}
          userPrompt={userPrompt}
          onChangeUserPrompt={setUserPrompt}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onClear={handleClear}
          onRetryFailed={handleRetryFailed}
        />
      )}

      {/* Progress Bar */}
      <BatchProgressBar queueState={queueState} />

      {/* Completion CTA */}
      {hasProcessed && !isRunning && onNavigateTab && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>{queueState.processedCount} images ready</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab('review')}
              className="h-7 text-xs"
            >
              Review
            </Button>
            <Button
              size="sm"
              onClick={() => onNavigateTab('export')}
              className="h-7 text-xs gap-1"
            >
              Export CSVs
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Image Grid */}
      <BatchQueueGrid
        items={queueState.items}
        onRemoveItem={handleRemoveItem}
        disabled={isRunning}
      />
    </div>
  );
};
