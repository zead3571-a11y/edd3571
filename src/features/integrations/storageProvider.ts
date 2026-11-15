import { EduflowRepositories, runWithSystemActor } from '../../data/repositories';
import { FileAssetRecord } from '../../types/eduflow';

export const MAX_STORAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB limit for prototype safety
export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'csv'] as const;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
] as const;

export interface UploadFileInput {
  centerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: FileAssetRecord['category'];
  uploadedBy: string;
}

export interface UploadFileResult {
  ok: boolean;
  asset?: FileAssetRecord;
  errorAr?: string;
}

export interface StorageProvider {
  readonly providerName: string;
  uploadFile(repos: EduflowRepositories, input: UploadFileInput): Promise<UploadFileResult>;
  getSignedDownloadUrl(asset: FileAssetRecord): Promise<{ url: string; noteAr: string }>;
  deleteFile(repos: EduflowRepositories, assetId: string): Promise<boolean>;
}

function getExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Prototype StorageProvider:
 * Validates file size and extension/MIME type, and persists ONLY metadata in fileAssets repository.
 * Production note: must be replaced with server-side Supabase Storage / S3 signed upload & download URLs.
 */
export class PrototypeStorageProvider implements StorageProvider {
  public readonly providerName = 'PrototypeStorageProvider (Metadata-only)';

  public async uploadFile(
    repos: EduflowRepositories,
    input: UploadFileInput
  ): Promise<UploadFileResult> {
    const cleanName = input.name.trim();
    if (!cleanName) {
      return { ok: false, errorAr: 'يرجى تحديد اسم ملف صالح.' };
    }
    const ext = getExtension(cleanName);
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
      return {
        ok: false,
        errorAr: `نوع الملف (.${ext || 'غير معروف'}) غير مسموح به. الأنواع المسموحة: ${ALLOWED_FILE_EXTENSIONS.join('، ')}.`,
      };
    }

    if (
      input.mimeType &&
      !ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_MIME_TYPES)[number])
    ) {
      return {
        ok: false,
        errorAr: `صيغة MIME (${input.mimeType}) غير مدعومة لرفع الملفات.`,
      };
    }

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      return { ok: false, errorAr: 'حجم الملف غير صالح.' };
    }
    if (input.sizeBytes > MAX_STORAGE_FILE_BYTES) {
      return {
        ok: false,
        errorAr: 'حجم الملف يتجاوز الحد الأقصى المسموح به (5 ميجابايت).',
      };
    }

    const now = new Date().toISOString();
    const asset = runWithSystemActor(() =>
      repos.fileAssets.create({
        centerId: input.centerId,
        name: cleanName,
        mimeType: input.mimeType || 'application/octet-stream',
        sizeBytes: input.sizeBytes,
        extension: ext,
        category: input.category,
        objectRef: `mock-storage://${input.centerId}/${input.category}/${Date.now()}-${encodeURIComponent(cleanName)}`,
        uploadedAt: now,
        uploadedBy: input.uploadedBy,
      })
    );

    return { ok: true, asset };
  }

  public async getSignedDownloadUrl(
    asset: FileAssetRecord
  ): Promise<{ url: string; noteAr: string }> {
    return {
      url: `#prototype-signed-url/${asset.id}`,
      noteAr:
        'تنبيه إنتاجي: في بيئة الإنتاج يتم توليد روابط تحميل موقّعة (Signed URLs) من الخادم فقط.',
    };
  }

  public async deleteFile(repos: EduflowRepositories, assetId: string): Promise<boolean> {
    return repos.fileAssets.remove(assetId);
  }
}

export const defaultStorageProvider = new PrototypeStorageProvider();
