export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly field?: string,
    readonly code = 'ACCESS',
  ) {
    super(message);
  }
}
