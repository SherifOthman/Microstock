import React, { useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { FolderUp, Image as ImageIcon, UploadCloud } from 'lucide-react';

interface Props {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const BatchDropZone: React.FC<Props> = ({ onFilesSelected, disabled = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  /** Returns true for image, video, and vector (EPS/AI/SVG) files */
  const isAcceptedFile = (file: File): boolean => {
    if (file.type.startsWith('image/')) return true;
    if (file.type.startsWith('video/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['eps', 'ai', 'svg'].includes(ext)) return true;
    // Some systems report EPS/AI as application/postscript or application/illustrator
    if (file.type === 'application/postscript') return true;
    if (file.type === 'application/illustrator') return true;
    return false;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
    if (droppedFiles.length > 0) {
      onFilesSelected(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files).filter(isAcceptedFile);
      onFilesSelected(selected);
      e.target.value = '';
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
        isDragOver
          ? 'border-primary bg-accent/40 scale-[0.99]'
          : 'border-border bg-card/40 hover:bg-card/70 hover:border-muted-foreground/30'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.eps,.ai,.svg"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory folder upload
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="w-12 h-12 rounded-xl bg-accent text-primary flex items-center justify-center mx-auto mb-3 border border-border">
        <UploadCloud className="w-6 h-6" />
      </div>

      <h3 className="text-sm font-semibold text-foreground">
        Drop stock files here or browse
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">
        Supports images (JPG, PNG, WebP), videos (MP4, MOV) and vectors (EPS, AI, SVG). Original files on disk are completely untouched.
      </p>

      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Select Files
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
          className="gap-1.5"
        >
          <FolderUp className="w-3.5 h-3.5" />
          Select Folder
        </Button>
      </div>
    </div>
  );
};
