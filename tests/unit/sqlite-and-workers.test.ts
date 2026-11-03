import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db';
import { parseImageHeaderBuffer } from '../../src/workers/mediaInspector.worker';
import type { MasterRecord } from '../../src/types';

describe('Native SQLite Bridge & Relational Schema (Milestone 2)', () => {
  beforeEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    await db.settings.clear();
  });

  it('persists, queries, updates, and bulk-deletes masterRecords via relational asset + metadata bridge', async () => {
    const record1: MasterRecord = {
      id: 'asset-1',
      fileName: 'photo_01.jpg',
      fileType: 'image/jpeg',
      fileSize: 2048000,
      width: 4000,
      height: 3000,
      megapixels: 12.0,
      aspectRatio: '4:3',
      status: 'completed',
      aiGenerated: false,
      masterMetadata: {
        title: 'Minimalist Workspace Desk',
        description: 'Clean overhead shot of a minimalist desk.',
        keywords: ['desk', 'workspace', 'minimal', 'office', 'laptop'],
      },
      agencyData: {},
      createdAt: 1000,
      updatedAt: 1000,
    };

    const record2: MasterRecord = {
      id: 'asset-2',
      fileName: 'vector_02.eps',
      fileType: 'application/postscript',
      fileSize: 512000,
      status: 'pending',
      aiGenerated: true,
      masterMetadata: {
        title: '',
        description: '',
        keywords: [],
      },
      agencyData: {},
      createdAt: 2000,
      updatedAt: 2000,
    };

    await db.masterRecords.bulkPut([record1, record2]);

    const count = await db.masterRecords.count();
    expect(count).toBe(2);

    const fetched1 = await db.masterRecords.get('asset-1');
    expect(fetched1?.fileName).toBe('photo_01.jpg');
    expect(fetched1?.masterMetadata.title).toBe('Minimalist Workspace Desk');
    expect(fetched1?.masterMetadata.keywords).toHaveLength(5);

    await db.masterRecords.update('asset-2', {
      status: 'completed',
      masterMetadata: {
        title: 'Geometric Abstract Vector',
        description: 'Modern vector graphic.',
        keywords: ['vector', 'geometric'],
      },
    });

    const updated2 = await db.masterRecords.get('asset-2');
    expect(updated2?.status).toBe('completed');
    expect(updated2?.masterMetadata.title).toBe('Geometric Abstract Vector');

    await db.masterRecords.bulkDelete(['asset-1']);
    const remaining = await db.masterRecords.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('asset-2');
  });

  it('persists and updates API keys and key-value settings', async () => {
    const id = await db.apiKeys.put({
      id: 'key-1',
      providerId: 'gemini',
      modelName: 'gemini-2.5-flash',
      label: 'Primary Gemini Key',
      apiKey: 'AIzaSyTestKey1234567890',
      isActive: true,
      priorityOrder: 1,
      status: 'active',
      createdAt: Date.now(),
    });

    const keys = await db.apiKeys.toArray();
    expect(keys).toHaveLength(1);
    expect(keys[0].label).toBe('Primary Gemini Key');

    await db.apiKeys.update(id, { status: 'cooldown', cooldownUntil: Date.now() + 60000 });
    const updatedKey = await db.apiKeys.get(id);
    expect(updatedKey?.status).toBe('cooldown');

    await db.settings.put({ key: '123rf_country', value: 'EG' });
    const countrySetting = await db.settings.get('123rf_country');
    expect(countrySetting?.value).toBe('EG');
  });
});

describe('64KB Binary Image Header Dimension Parser (mediaInspector.worker)', () => {
  it('parses PNG IHDR dimensions without decoding pixel data', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    view.setUint32(0, 0x89504e47, false);
    view.setUint32(4, 0x0d0a1a0a, false);
    // Width at offset 16, Height at offset 20 (Big-Endian)
    view.setUint32(16, 3840, false);
    view.setUint32(20, 2160, false);

    const dims = parseImageHeaderBuffer(buf);
    expect(dims).toEqual({ width: 3840, height: 2160 });
  });

  it('parses JPEG SOF0 marker dimensions accurately', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    // SOI marker: FF D8
    view.setUint8(0, 0xff);
    view.setUint8(1, 0xd8);
    // APP0 dummy marker: FF E0, length 4
    view.setUint8(2, 0xff);
    view.setUint8(3, 0xe0);
    view.setUint16(4, 4, false);
    // SOF0 marker at offset 8: FF C0, length 11, precision 8, height 4000, width 6000
    view.setUint8(8, 0xff);
    view.setUint8(9, 0xc0);
    view.setUint16(10, 11, false);
    view.setUint8(12, 8);
    view.setUint16(13, 4000, false);
    view.setUint16(15, 6000, false);

    const dims = parseImageHeaderBuffer(buf);
    expect(dims).toEqual({ width: 6000, height: 4000 });
  });
});
