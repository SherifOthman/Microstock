import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  detect123RfMediaType,
  resolve123RfRoute,
  bundleAndRoute123RfQueue,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_FTP_PORT,
  ONE_TWO_THREE_RF_SFTP_HOST,
  ONE_TWO_THREE_RF_SFTP_PORT,
} from '../../src/services/ftp/oneTwoThreeRfFtpRouter';
import { ftp123rfService } from '../../src/services/ftp/Ftp123RFService';
import { OneTwoThreeRfFtpUploaderView } from '../../src/features/ftp/OneTwoThreeRfFtpUploaderView';
import { LanguageProvider } from '../../src/context/LanguageContext';

describe('123RF FTP/SFTP Dynamic Router & Routing Rules', () => {
  it('1. Photos (.jpg without .eps): Standard FTP (Port 21, ftp.123rf.com), AI -> /ai_image/, Non-AI -> /', () => {
    // Non-AI Photo
    const nonAiRoute = resolve123RfRoute('image', false);
    expect(nonAiRoute.protocol).toBe('ftp');
    expect(nonAiRoute.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(nonAiRoute.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(nonAiRoute.remoteFolder).toBe('/');
    expect(nonAiRoute.isAiIgnored).toBe(false);

    // AI Photo
    const aiRoute = resolve123RfRoute('image', true);
    expect(aiRoute.protocol).toBe('ftp');
    expect(aiRoute.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(aiRoute.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(aiRoute.remoteFolder).toBe('/ai_image');
    expect(aiRoute.isAiIgnored).toBe(false);
  });

  it('2. Vectors (.eps + .jpg preview): Standard FTP (Port 21, ftp.123rf.com), ALWAYS /vector/ (AI toggle ignored)', () => {
    // When isAiGenerated is false
    const vectorRouteNonAi = resolve123RfRoute('vector', false);
    expect(vectorRouteNonAi.protocol).toBe('ftp');
    expect(vectorRouteNonAi.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(vectorRouteNonAi.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(vectorRouteNonAi.remoteFolder).toBe('/vector');
    expect(vectorRouteNonAi.isAiIgnored).toBe(true);

    // When isAiGenerated is true -> MUST STILL BE /vector/ and ignored
    const vectorRouteAi = resolve123RfRoute('vector', true);
    expect(vectorRouteAi.protocol).toBe('ftp');
    expect(vectorRouteAi.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(vectorRouteAi.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(vectorRouteAi.remoteFolder).toBe('/vector');
    expect(vectorRouteAi.isAiIgnored).toBe(true);
  });

  it('3. Videos (.mp4, .mov): SFTP (Port 2022, footage.ftp.123rf.com), AI -> /ai_video/, Non-AI -> /', () => {
    // Non-AI Video
    const videoNonAi = resolve123RfRoute('video', false);
    expect(videoNonAi.protocol).toBe('sftp');
    expect(videoNonAi.host).toBe(ONE_TWO_THREE_RF_SFTP_HOST);
    expect(videoNonAi.port).toBe(ONE_TWO_THREE_RF_SFTP_PORT);
    expect(videoNonAi.remoteFolder).toBe('/');
    expect(videoNonAi.isAiIgnored).toBe(false);

    // AI Video
    const videoAi = resolve123RfRoute('video', true);
    expect(videoAi.protocol).toBe('sftp');
    expect(videoAi.host).toBe(ONE_TWO_THREE_RF_SFTP_HOST);
    expect(videoAi.port).toBe(ONE_TWO_THREE_RF_SFTP_PORT);
    expect(videoAi.remoteFolder).toBe('/ai_video');
    expect(videoAi.isAiIgnored).toBe(false);
  });

  it('4. Bundling & Execution Order: Pairs .eps + .jpg preview into Vector Bundle with .jpg first, .eps second', () => {
    const rawFiles = [
      { name: 'artwork_01.jpg', size: 1024 * 500, path: '/tmp/artwork_01.jpg' },
      { name: 'artwork_01.eps', size: 1024 * 2000, path: '/tmp/artwork_01.eps' },
      { name: 'standalone_photo.jpg', size: 1024 * 800, path: '/tmp/standalone_photo.jpg' },
      { name: 'drone_footage.mp4', size: 1024 * 10000, path: '/tmp/drone_footage.mp4' },
    ];

    const queue = bundleAndRoute123RfQueue(rawFiles, true);

    // Should create 3 items: 1 vector bundle (paired), 1 photo, 1 video
    expect(queue.length).toBe(3);

    const vecItem = queue.find((q) => q.isVectorBundle);
    expect(vecItem).toBeDefined();
    expect(vecItem?.mediaType).toBe('vector');
    expect(vecItem?.remoteFolder).toBe('/vector');
    expect(vecItem?.protocol).toBe('ftp');
    expect(vecItem?.isAiIgnored).toBe(true);

    // Verify companion execution parts
    expect(vecItem?.jpgPart).toBeDefined();
    expect(vecItem?.epsPart).toBeDefined();
    expect(vecItem?.jpgPart?.order).toBe(1); // JPG preview MUST be first
    expect(vecItem?.epsPart?.order).toBe(2); // EPS companion MUST be second
    expect(vecItem?.jpgPart?.remoteFolder).toBe('/vector');
    expect(vecItem?.epsPart?.remoteFolder).toBe('/vector');

    // Standalone photo: AI = true -> /ai_image/
    const photoItem = queue.find((q) => q.mediaType === 'image');
    expect(photoItem?.remoteFolder).toBe('/ai_image');
    expect(photoItem?.protocol).toBe('ftp');

    // Video: AI = true -> /ai_video/ via SFTP
    const videoItem = queue.find((q) => q.mediaType === 'video');
    expect(videoItem?.remoteFolder).toBe('/ai_video');
    expect(videoItem?.protocol).toBe('sftp');
    expect(videoItem?.port).toBe(2022);
  });
});

describe('123RF UI Uploader & AI Toggle Component', () => {
  beforeEach(() => {
    ftp123rfService.clearQueue();
    ftp123rfService.setBatchAiGenerated(false);
  });

  it('5. UI renders AI Toggle and dynamically updates destination routing for photos and videos while keeping vectors in /vector/', async () => {
    render(
      <LanguageProvider>
        <OneTwoThreeRfFtpUploaderView />
      </LanguageProvider>
    );

    // Verify AI toggle is rendered
    const toggle = screen.getByTestId('batch-ai-toggle') as HTMLInputElement;
    expect(toggle).toBeDefined();
    expect(toggle.checked).toBe(false);

    // Add a mix of files to the service
    await act(async () => {
      await ftp123rfService.addFiles([
        new File(['photo content'], 'landscape.jpg', { type: 'image/jpeg' }),
        new File(['vector jpg preview'], 'logo.jpg', { type: 'image/jpeg' }),
        new File(['vector eps binary'], 'logo.eps', { type: 'application/postscript' }),
        new File(['video content'], 'ocean.mp4', { type: 'video/mp4' }),
      ]);
    });

    await waitFor(() => {
      // Vector item
      expect(screen.getByText(/Folder: \/vector/i)).toBeDefined();
      // Initially non-AI photos and videos route to /
      expect(screen.getAllByText(/Folder: \//i).length).toBeGreaterThanOrEqual(2);
    });

    // Toggle Batch AI ON
    act(() => {
      fireEvent.click(toggle);
    });
    expect(toggle.checked).toBe(true);

    // Verify destinations updated dynamically
    await waitFor(() => {
      // Photo should now route to /ai_image
      expect(screen.getByText(/Folder: \/ai_image/i)).toBeDefined();
      // Video should now route to /ai_video
      expect(screen.getByText(/Folder: \/ai_video/i)).toBeDefined();
      // Vector pair MUST REMAIN in /vector/
      expect(screen.getByText(/Folder: \/vector/i)).toBeDefined();
      // Vector should show Non-AI Vector locked badge
      expect(screen.getByText(/Non-AI Vector/i)).toBeDefined();
    });
  });
});
