'use client';

import { useRef, useState, type DragEvent } from 'react';
import { cn } from '@/lib/cn';

export interface FileUploaderProps {
  accept?: string;
  maxSizeBytes?: number;
  onFileSelected: (file: File | null) => void;
  label?: string;
  hint?: string;
  selectedFileName?: string | null;
  disabled?: boolean;
}

// Presentational picker only — the actual upload call (endpoint, extra
// form fields) stays with the caller, matching how
// src/app/doctor/documents/documents-manager.tsx already owns its own
// api.postForm() call. This just replaces the raw <input type="file">
// with a drag-and-drop-capable, validated picker every uploader can share.
export function FileUploader({
  accept,
  maxSizeBytes,
  onFileSelected,
  label = 'Choose a file',
  hint,
  selectedFileName,
  disabled,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateAndSelect(file: File | undefined) {
    if (!file) {
      onFileSelected(null);
      return;
    }
    if (maxSizeBytes && file.size > maxSizeBytes) {
      setError(`File is too large (max ${Math.round(maxSizeBytes / 1024 / 1024)}MB).`);
      onFileSelected(null);
      return;
    }
    setError(null);
    onFileSelected(file);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragActive(false);
          if (!disabled) validateAndSelect(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'cursor-pointer rounded-card border-2 border-dashed p-6 text-center transition-colors',
          dragActive ? 'border-brand-purple-400 bg-brand-purple-50' : 'border-brand-neutral-200 hover:border-brand-purple-300',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <p className="text-sm font-medium text-brand-neutral-900">{label}</p>
        <p className="mt-1 text-xs text-brand-neutral-500">{hint ?? 'Drag and drop, or click to browse'}</p>
        {selectedFileName && <p className="mt-2 text-sm text-brand-purple-600">{selectedFileName}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(e) => validateAndSelect(e.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-1 text-xs text-[var(--color-semantic-danger-700)]">{error}</p>}
    </div>
  );
}

export function ImageUploader(props: FileUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleSelect(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    props.onFileSelected(file);
  }

  return (
    <div>
      <FileUploader {...props} accept={props.accept ?? 'image/jpeg,image/png,image/webp'} onFileSelected={handleSelect} />
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a transient local object URL, not an optimizable remote/static asset next/image can handle
        <img src={previewUrl} alt="Selected preview" className="mt-3 h-32 w-32 rounded-card border border-brand-neutral-200 object-cover" />
      )}
    </div>
  );
}
