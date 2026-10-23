export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function databaseErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = error.code;
  if (typeof code !== 'string') return undefined;

  if (code === '23505') return 409;
  if (['23502', '23503', '23514', '22P02', '22003'].includes(code)) return 400;
  return undefined;
}
