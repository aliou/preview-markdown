export class FailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FailedError";
  }
}
