// The API runs in the main process but must not import Electron (the tests run it without). The
// notifier lives in `electron/`, so `main.ts` hands its "show a test notification" function over
// here at startup and the API calls it through this hook.

export interface TestNotificationResult {
  supported: boolean;
  due: number;
}

let testNotification: (() => TestNotificationResult) | null = null;

export function setReviewTestHook(fn: (() => TestNotificationResult) | null): void {
  testNotification = fn;
}

export function runReviewTest(): TestNotificationResult {
  return testNotification ? testNotification() : { supported: false, due: 0 };
}
