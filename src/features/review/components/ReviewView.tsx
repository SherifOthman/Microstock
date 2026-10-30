import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import {
  transformFor123rf,
  transformForAdobeStock,
  transformForDreamstime,
  transformForFreepik,
  transformForShutterstock,
  transformForVecteezy,
} from '../../../services/rules/platformTransformers';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Layers,
  Lock,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

type PlatformPreviewTab =
  | 'master'
  | 'adobe'
  | 'freepik'
  | 'vecteezy'
  | 'dreamstime'
  | 'shutterstock'
  | '123rf';

export const ReviewView: React.FC = () => {
  const liveRecords = useLiveQuery(() => db.masterRecords.toArray(), []) || [];
  const records = [...liveRecords].sort((a, b) => b.createdAt - a.createdAt);

  const [activePlatformTab, setActivePlatformTab] = useState<PlatformPreviewTab>('master');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editKeywords, setEditKeywords] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isAiFilter, setIsAiFilter] = useState<'all' | 'ai' | 'non_ai'>('all');
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);

  const handleStartEdit = (rec: MasterMetadataRecord) => {
    setEditingId(rec.id);
    setEditTitle(rec.baseTitle);
    setEditDesc(rec.detailedDescription);
    setEditKeywords(rec.rankedKeywords.join(', '));
  };

  const handleSaveEdit = async (id: string) => {
    const cleanKws = editKeywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    await db.masterRecords.update(id, {
      baseTitle: editTitle.trim(),
      detailedDescription: editDesc.trim(),
      rankedKeywords: cleanKws,
    });

    setEditingId(null);
  };

  const handleToggleAiStatus = async (id: string, current: boolean) => {
    await db.masterRecords.update(id, { isAiGenerated: !current });
  };

  const handleDeleteRecord = (id: string) => {
    setDeleteRecordId(id);
  };

  const handleConfirmDeleteRecord = async () => {
    if (deleteRecordId) {
      await db.masterRecords.delete(deleteRecordId);
      setDeleteRecordId(null);
    }
  };

  const handleClearAll = () => {
    setClearAllConfirmOpen(true);
  };

  const handleConfirmClearAll = async () => {
    await db.masterRecords.clear();
    setClearAllConfirmOpen(false);
  };

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.filename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.baseTitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.rankedKeywords.some((k) => k.toLowerCase().includes(searchFilter.toLowerCase()));

    const matchesAi =
      isAiFilter === 'all'
        ? true
        : isAiFilter === 'ai'
        ? r.isAiGenerated
        : !r.isAiGenerated;

    return matchesSearch && matchesAi;
  });

  return (
    <div className="space-y-4">
      {/* Top Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
            <Input
              placeholder="Search filename, title, tags..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-8 pl-8 w-56 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setIsAiFilter('all')}
              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
                isAiFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              All ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setIsAiFilter('ai')}
              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                isAiFilter === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              AI
            </button>
            <button
              type="button"
              onClick={() => setIsAiFilter('non_ai')}
              className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
                isAiFilter === 'non_ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Photos
            </button>
          </div>
        </div>

        {records.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-8 text-xs text-muted-foreground hover:text-destructive self-end"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Platform Adaptation Preview Switcher (CSVPlanet / Normalization Engine) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border text-xs">
        <span className="text-muted-foreground font-medium text-[11px] mr-1">Preview Adaptation:</span>

        <button
          type="button"
          onClick={() => setActivePlatformTab('master')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'master'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Master Record
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('adobe')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'adobe'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Adobe Stock
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('freepik')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'freepik'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Freepik
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('vecteezy')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'vecteezy'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Vecteezy
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('dreamstime')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'dreamstime'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Dreamstime
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('shutterstock')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === 'shutterstock'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Shutterstock
        </button>

        <button
          type="button"
          onClick={() => setActivePlatformTab('123rf')}
          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
            activePlatformTab === '123rf'
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          123RF
        </button>
      </div>

      {/* Records List */}
      {records.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-xs space-y-2">
            <Layers className="w-8 h-8 mx-auto text-muted-foreground/60" />
            <p className="font-medium text-foreground">No records to review</p>
            <p>Process images in the Batch Queue tab to inspect and audit metadata.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((rec) => {
            const isEditing = editingId === rec.id;
            const descDiff = rec.detailedDescription.length - rec.baseTitle.length;
            const isDreamstimeValid = descDiff > 0 && rec.detailedDescription.trim().endsWith('.');

            // Platform-specific transformations on the fly
            const adobeRows = transformForAdobeStock([rec]);
            const adobeData = adobeRows[0] || {};

            const freepikRows = transformForFreepik([rec]);
            const freepikData = freepikRows[0] || {};

            const vecteezyRows = transformForVecteezy([rec]);
            const vecteezyData = vecteezyRows[0] || {};

            const dreamstimeRows = transformForDreamstime([rec]);
            const dreamstimeData = dreamstimeRows[0] || {};

            const shutterRes = transformForShutterstock([rec]);
            const shutterData = shutterRes.rows[0] || {};

            const rfRows = transformFor123rf([rec]);
            const rfData = rfRows[0] || {};

            return (
              <div
                key={rec.id}
                className="p-3.5 rounded-xl border border-border bg-card/60 hover:bg-card transition space-y-2.5 text-xs"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={rec.thumbnailBase64}
                      alt={rec.filename}
                      className="w-10 h-10 object-cover rounded-lg border border-border bg-secondary shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground truncate">{rec.filename}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAiStatus(rec.id, rec.isAiGenerated)}
                          className="cursor-pointer"
                          title="Click to toggle AI tag"
                        >
                          {rec.isAiGenerated ? (
                            <Badge variant="default" className="text-[10px] py-0 px-1.5 gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> AI
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                              Photo
                            </Badge>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Compliance Badges & Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Dreamstime */}
                    {isDreamstimeValid ? (
                      <Badge variant="success" className="font-mono text-[10px] py-0 gap-1" title="Description > Title">
                        <CheckCircle2 className="w-2.5 h-2.5" /> DT: OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="font-mono text-[10px] py-0 gap-1" title="Description must be longer than Title">
                        <AlertTriangle className="w-2.5 h-2.5" /> DT: Short
                      </Badge>
                    )}

                    {/* Shutterstock */}
                    {rec.isAiGenerated ? (
                      <Badge variant="destructive" className="font-mono text-[10px] py-0 gap-1" title="Shutterstock prohibits external AI">
                        <ShieldAlert className="w-2.5 h-2.5" /> SS: Blocked
                      </Badge>
                    ) : (
                      <Badge variant="success" className="font-mono text-[10px] py-0 gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> SS: OK
                      </Badge>
                    )}

                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" onClick={() => handleSaveEdit(rec.id)} className="h-7 px-2 text-xs gap-1">
                          <Save className="w-3 h-3" /> Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingId(null)}
                          className="h-7 w-7 text-muted-foreground"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(rec)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRecord(rec.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Edit Mode */}
                {isEditing && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Title ({editTitle.length}/200)</label>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-8 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Description ({editDesc.length}/756)</label>
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">
                        Keywords ({editKeywords.split(',').filter((k) => k.trim()).length} tags)
                      </label>
                      <Input
                        value={editKeywords}
                        onChange={(e) => setEditKeywords(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Platform Preview Views */}
                {!isEditing && (
                  <div className="pt-1 border-t border-border/60">
                    {/* 1. Master Record View */}
                    {activePlatformTab === 'master' && (
                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">{rec.baseTitle}</p>
                        <p className="text-muted-foreground text-[11px]">{rec.detailedDescription}</p>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rec.rankedKeywords.slice(0, 14).map((kw, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] font-mono"
                            >
                              {kw}
                            </span>
                          ))}
                          {rec.rankedKeywords.length > 14 && (
                            <span className="text-[10px] text-muted-foreground self-center">
                              +{rec.rankedKeywords.length - 14} tags
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2. Adobe Stock Adaptation */}
                    {activePlatformTab === 'adobe' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Adobe Title (AI terms stripped):</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            Category ID: {adobeData.Category}
                          </Badge>
                        </div>
                        <p className="font-medium text-foreground">{String(adobeData.Title || '')}</p>
                        <div className="text-[11px] text-muted-foreground">
                          Keywords (max 49 clean tags):
                        </div>
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-2">
                          {String(adobeData.Keywords || '')}
                        </p>
                      </div>
                    )}

                    {/* 3. Freepik Adaptation */}
                    {activePlatformTab === 'freepik' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Freepik Title (Semicolon Delimited CSV):</span>
                          {rec.isAiGenerated && (
                            <span className="text-[10px] font-mono text-primary">
                              Model: {String(freepikData.Model || 'Midjourney v6')}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-foreground">{String(freepikData.Title || '')}</p>
                        {rec.isAiGenerated && freepikData.Prompt && (
                          <div className="text-[10px] text-muted-foreground">
                            <span className="text-primary font-medium">Prompt:</span> {String(freepikData.Prompt)}
                          </div>
                        )}
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-2">
                          {String(freepikData.Keywords || '')}
                        </p>
                      </div>
                    )}

                    {/* 4. Vecteezy Adaptation */}
                    {activePlatformTab === 'vecteezy' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Vecteezy Title (Strict Title Case &lt;= 100):</span>
                          <span className="text-[10px] font-mono text-emerald-400">Title Case Applied</span>
                        </div>
                        <p className="font-medium text-foreground">{String(vecteezyData.Title || '')}</p>
                        <div className="text-[11px] text-muted-foreground">
                          Ranked Keywords (Top 5 prioritized at start):
                        </div>
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-2">
                          {String(vecteezyData.Keywords || '')}
                        </p>
                      </div>
                    )}

                    {/* 5. Dreamstime Adaptation */}
                    {activePlatformTab === 'dreamstime' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            Dreamstime Description (Rule: Desc &gt; Title + AI Disclaimer):
                          </span>
                          <div className="flex items-center gap-1.5 font-mono text-[10px]">
                            <Badge variant="outline">SR-EL: 0 (Safe)</Badge>
                            <Badge variant="outline">Cat 3: {dreamstimeData['Category 3']}</Badge>
                          </div>
                        </div>
                        <p className="font-medium text-foreground">{String(dreamstimeData.Description || '')}</p>
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                          Keywords: {String(dreamstimeData.keywords || '')}
                        </p>
                      </div>
                    )}

                    {/* 6. Shutterstock Adaptation */}
                    {activePlatformTab === 'shutterstock' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Shutterstock Description:</span>
                          <Badge variant="outline" className="text-[10px]">
                            Categories: {String(shutterData.Categories || 'Miscellaneous')}
                          </Badge>
                        </div>
                        <p className="font-medium text-foreground">{String(shutterData.Description || '')}</p>
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                          Keywords: {String(shutterData.Keywords || '')}
                        </p>
                      </div>
                    )}

                    {/* 7. 123RF Adaptation */}
                    {activePlatformTab === '123rf' && (
                      <div className="space-y-1.5 bg-background/50 p-2.5 rounded-lg border border-border">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">123RF Description:</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              Country: {String(rfData.country || 'EG')}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              oldfilename: {String(rfData.oldfilename || '')}
                            </Badge>
                          </div>
                        </div>
                        <p className="font-medium text-foreground">{String(rfData.description || '')}</p>
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                          Keywords: {String(rfData.keywords || '')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteRecordId}
        onOpenChange={(open) => !open && setDeleteRecordId(null)}
        title="Delete Metadata Record"
        description="Are you sure you want to delete this metadata record from the database?"
        confirmText="Delete Record"
        variant="destructive"
        onConfirm={handleConfirmDeleteRecord}
      />

      <ConfirmDialog
        open={clearAllConfirmOpen}
        onOpenChange={setClearAllConfirmOpen}
        title="Clear All Metadata Records"
        description="Are you sure you want to clear all metadata records? This will delete all generated titles, descriptions, and keywords."
        confirmText="Clear All"
        variant="destructive"
        onConfirm={handleConfirmClearAll}
      />
    </div>
  );
};
