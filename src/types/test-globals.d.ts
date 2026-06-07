export {};

declare global {
  // Vitest mocks the Next cookie store by reading this token in test setup.
  // Keeping the declaration local to the app avoids weakening production types.
  // eslint-disable-next-line no-var
  var testSessionToken: string | null | undefined;
}

