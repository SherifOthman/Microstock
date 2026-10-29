import fs from 'fs';
import { normalizeFilename, extractWords } from '../src/services/rules/vecteezyHydrator';

function stripSemanticNoise(name: string): string {
  return normalizeFilename(name)
    .replace(/\d{6,}/g, '')
    .replace(/[248]k/gi, '')
    .trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return 1 - matrix[len1][len2] / Math.max(len1, len2);
}

const vLinen = 'Linenfabrictextureclose-up2K20261015121342.jpg';
const localTan = 'Tan_leather_texture_close_up_2K_20261015121900.jpg';

const rawSim = calculateSimilarity(normalizeFilename(vLinen), normalizeFilename(localTan));
console.log('Raw similarity:', rawSim);

const cleanSim = calculateSimilarity(stripSemanticNoise(vLinen), stripSemanticNoise(localTan));
console.log('Clean similarity (after stripping timestamps & 2K):', cleanSim);
