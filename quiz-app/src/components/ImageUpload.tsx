'use client';

import { useState, useRef } from 'react';
import Icon from '@mdi/react';
import { mdiImagePlus, mdiDelete, mdiAlertCircle } from '@mdi/js';

interface ImageUploadProps {
  value?: string;
  onChange: (base64Image: string | undefined) => void;
  maxFileSizeMB?: number;
  accept?: string;
}

export function ImageUpload({
  value,
  onChange,
  maxFileSizeMB = 1,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
}: ImageUploadProps) {
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');

    // Validate file size
    if (file.size > maxFileSizeBytes) {
      setError(`File too large. Maximum size is ${maxFileSizeMB}MB.`);
      return;
    }

    // Validate file type
    if (!accept.split(',').includes(file.type)) {
      setError(`Invalid file type. Accepted: ${accept.replace(/image\//g, '')}`);
      return;
    }

    setIsLoading(true);

    try {
      const base64 = await fileToBase64(file);
      onChange(base64);
    } catch (err) {
      setError('Failed to process image. Please try again.');
    } finally {
      setIsLoading(false);
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleRemove = () => {
    onChange(undefined);
    setError('');
  };

  if (value) {
    return (
      <div className="relative">
        <img
          src={value}
          alt="Question"
          className="w-full max-h-64 object-contain rounded-lg border border-card-border"
        />
        <button
          onClick={handleRemove}
          className="absolute top-2 right-2 p-2 rounded-full bg-error text-white hover:bg-error/80 transition-colors shadow-lg"
          title="Remove image"
        >
          <Icon path={mdiDelete} size={0.8} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        className="w-full p-6 rounded-lg border-2 border-dashed border-card-border hover:border-primary/50 text-foreground/50 hover:text-primary transition-colors flex flex-col items-center gap-2 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <div className="spinner w-8 h-8" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <Icon path={mdiImagePlus} size={1.5} />
            <span>Click to upload image</span>
            <span className="text-xs text-foreground/30">
              Max {maxFileSizeMB}MB • JPEG, PNG, WebP, GIF
            </span>
          </>
        )}
      </button>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-error text-sm">
          <Icon path={mdiAlertCircle} size={0.8} />
          {error}
        </div>
      )}
    </div>
  );
}
