'use client';

export function Loading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
      <div className="spinner" />
      <p className="text-foreground/70">{message}</p>
    </div>
  );
}
