import type { FileAsset, FileAssetCategory } from '../types/protocol';

export type QclawFileCategory = Exclude<FileAssetCategory, 'data'>;

const codeExtensions = new Set(['diff', 'ipynb', 'java', 'js', 'json', 'jsonl', 'jsx', 'py', 'sql', 'ts', 'tsx']);
const documentExtensions = new Set(['doc', 'docx', 'html', 'md', 'txt']);
const imageExtensions = new Set(['jpeg', 'jpg', 'png', 'svg']);
const presentationExtensions = new Set(['ppt', 'pptx']);
const spreadsheetExtensions = new Set(['csv', 'xls', 'xlsx']);

export function qclawFileCategory(file: Pick<FileAsset, 'category' | 'extension' | 'mimeType'>): QclawFileCategory {
  const extension = file.extension.toLowerCase().replace(/^\./, '');

  if (file.mimeType.startsWith('image/') || imageExtensions.has(extension)) return 'images';
  if (spreadsheetExtensions.has(extension)) return 'spreadsheets';
  if (presentationExtensions.has(extension)) return 'presentations';
  if (extension === 'pdf' || file.mimeType === 'application/pdf') return 'reports';
  if (codeExtensions.has(extension) || file.category === 'code' || file.category === 'data') return 'code';
  if (documentExtensions.has(extension) || file.category === 'documents' || file.category === 'reports') return 'documents';
  return 'others';
}
