export class UsageError extends Error {
  readonly helpTopic: string | null;

  constructor(message: string, helpTopic: string | null = null) {
    super(message);
    this.name = "UsageError";
    this.helpTopic = helpTopic;
  }
}
