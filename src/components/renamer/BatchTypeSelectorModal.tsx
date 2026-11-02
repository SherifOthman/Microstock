import React from 'react';
import { AssetBatchType } from '../../types/renamer';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Sparkles, Camera, ArrowRight, ShieldCheck } from 'lucide-react';

export interface BatchTypeSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: AssetBatchType) => void;
  filesCount: number;
}

export const BatchTypeSelectorModal: React.FC<BatchTypeSelectorModalProps> = ({
  open,
  onClose,
  onSelectType,
  filesCount,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Microstock Renamer Gatekeeper"
      description={`Select the source origin for these ${filesCount} file(s). This determines output directories and agency nomenclature.`}
      className="max-w-xl"
    >
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* AI-Generated Choice */}
          <button
            type="button"
            onClick={() => onSelectType('AI')}
            className="flex flex-col items-start p-4 rounded-xl border-2 border-border hover:border-purple-500/80 bg-card hover:bg-purple-500/5 transition text-left cursor-pointer group space-y-2.5"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                AI-Generated
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono font-semibold">
                  _AI_
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Assets generated with Midjourney, Flux, Dall-E, Leonardo, etc.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground/90 font-mono bg-secondary/50 p-2 rounded-md w-full border border-border/50">
              Output: <span className="text-foreground font-semibold">AI_Photos/</span>, <span className="text-foreground font-semibold">AI_Videos/</span>
            </div>
          </button>

          {/* Native / Standard Choice */}
          <button
            type="button"
            onClick={() => onSelectType('NATIVE')}
            className="flex flex-col items-start p-4 rounded-xl border-2 border-border hover:border-emerald-500/80 bg-card hover:bg-emerald-500/5 transition text-left cursor-pointer group space-y-2.5"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                Native / Standard
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                  _NT_
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Real camera photography, live footage, or vector illustrations.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground/90 font-mono bg-secondary/50 p-2 rounded-md w-full border border-border/50">
              Output: <span className="text-foreground font-semibold">Photos/</span>, <span className="text-foreground font-semibold">Videos/</span>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span>
            Prevents agency policy rejection. Each track maintains an independent counter (e.g. B01_AI_PH_001 vs B01_NT_PH_001).
          </span>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
