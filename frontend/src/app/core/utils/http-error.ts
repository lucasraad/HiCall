export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const payload = (error as { error?: { message?: string; errors?: Record<string, string[]> } }).error;
  const firstFieldError = Object.values(payload?.errors ?? {})[0]?.[0];

  return firstFieldError || payload?.message || fallback;
}
