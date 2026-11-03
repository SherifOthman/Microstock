import React from 'react';
import { AssetBatchType } from '../../types/renamer';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Sparkles, Camera, ShieldCheck } from 'lucide-react';

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
      description={`Select the source origin for these ${filesCount} file(s).`}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* AI-Generated Choice */}
          <button
            type="button"
            onClick={() => onSelectType('AI')}
            className="flex flex-col items-start p-4 rounded-xl border border-border hover:border-primary bg-secondary/40 hover:bg-secondary/80 transition text-left cursor-pointer group space-y-2.5"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                AI-Generated
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-primary font-mono font-semibold border border-border">
                  _AI_
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Generative AI photos, footage, or vector illustrations.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono bg-background p-2 rounded-md w-full border border-border">
              Output: <span className="text-foreground font-semibold">AI_Photos/</span>, <span className="text-foreground font-semibold">AI_Videos/</span>
            </div>
          </button>

          {/* Native / Standard Choice */}
          <button
            type="button"
            onClick={() => onSelectType('NATIVE')}
            className="flex flex-col items-start p-4 rounded-xl border border-border hover:border-primary bg-secondary/40 hover:bg-secondary/80 transition text-left cursor-pointer group space-y-2.5"
          >
            <div className="w-9 h-9 rounded-lg bg-secondary text-foreground flex items-center justify-center border border-border">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Native / Standard
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono font-semibold border border-border">
                  _NT_
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Standard camera photography, live footage, or hand-drawn vectors.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono bg-background p-2 rounded-md w-full border border-border">
              Output: <span className="text-foreground font-semibold">Photos/</span>, <span className="text-foreground font-semibold">Videos/</span>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span>
            Each track maintains an independent sequence counter (e.g. B01_AI_PH_001 vs B01_NT_PH_001).
          </span>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
