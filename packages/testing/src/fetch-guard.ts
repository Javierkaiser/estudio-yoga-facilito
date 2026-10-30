globalThis.fetch = (() => {
  throw new Error('Network access is disabled in the test suite');
}) as typeof fetch;
