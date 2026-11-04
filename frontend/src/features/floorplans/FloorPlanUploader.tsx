import React, { useRef, useState } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle2, Loader2, X, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { FloorPlanUploadResponse } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface FloorPlanUploaderProps {
  projectId: string;
  onUploadSuccess: (floorPlan: FloorPlanUploadResponse) => void;
  onCancel?: () => void;
}

export const FloorPlanUploader: React.FC<FloorPlanUploaderProps> = ({
  projectId,
  onUploadSuccess,
  onCancel,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'];
  const MAX_SIZE_MB = 25;

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file format '${ext}'. Please upload PNG, JPG, JPEG or PDF blueprints.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File exceeds maximum allowed size of ${MAX_SIZE_MB} MB. (Size: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      announce(`Upload validation error: ${validationError}`);
      return;
    }

    setError(null);
    setSelectedFile(file);
    const defaultName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setCustomName(defaultName);
    announce(`Selected blueprint file: ${file.name}, ${(file.size / 1024).toFixed(0)} kilobytes.`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(20);

    try {
      setUploadProgress(50);
      const res = await api.uploadFloorPlan(
        projectId,
        selectedFile,
        customName.trim() || undefined
      );

      setUploadProgress(100);
      playFeedbackTone('success');
      announce(`Floor plan "${res.name}" successfully uploaded and verified.`);
      onUploadSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setError(msg);
      announce(`Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
        <div>
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">
            Upload Building Floor Plan
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Supported formats: PNG, JPG, JPEG, and PDF (Max 25 MB)
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Cancel upload"
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg font-medium flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Drag & Drop Area */}
      {!selectedFile ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900 ${
            isDragging
              ? 'border-zinc-800 bg-zinc-50/60'
              : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="w-12 h-12 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto mb-3 text-zinc-600">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h4 className="text-sm font-semibold text-zinc-900">
            Click to upload or drag and drop blueprint
          </h4>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Architectural CAD exports, emergency egress plans, or high-resolution architectural scans.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-mono text-zinc-500 bg-white px-2.5 py-1 rounded border border-zinc-200">
            <span>PNG</span>
            <span>&bull;</span>
            <span>JPG</span>
            <span>&bull;</span>
            <span>PDF (Single/Multi-page)</span>
          </div>
        </div>
      ) : (
        /* Selected File Overview & Name input */
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-200 flex items-center justify-center text-zinc-700 shrink-0">
                {selectedFile.type === 'application/pdf' ? (
                  <FileText className="w-5 h-5 text-red-600" />
                ) : (
                  <File className="w-5 h-5 text-zinc-700" />
                )}
              </div>
              <div>
                <span className="text-xs font-semibold text-zinc-900 block truncate max-w-xs sm:max-w-md">
                  {selectedFile.name}
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; {selectedFile.type || 'Blueprint'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedFile(null)}
              disabled={isUploading}
              aria-label="Remove selected file"
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label htmlFor="floorplan-label" className="block text-xs font-semibold text-zinc-800 mb-1">
              Floor Plan Display Name
            </label>
            <input
              id="floorplan-label"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              disabled={isUploading}
              placeholder="e.g. Ground Level - West Wing"
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Uploading and validating file geometry...</span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-zinc-900 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200">
            <Button
              variant="outline"
              size="md"
              disabled={isUploading}
              onClick={() => setSelectedFile(null)}
            >
              Select Different File
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={isUploading}
              onClick={handleUpload}
              icon={
                isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-zinc-400" />
                )
              }
            >
              {isUploading ? 'Validating & Uploading...' : 'Upload Floor Plan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

