// Ported from notevault_app/webapp/errors.py
// Expected, user-facing failures. The IPC handler turns a thrown ApiError into a
// rejection whose message reaches the renderer, exactly like the Python bridge.

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}
