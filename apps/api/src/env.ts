// Environment lives in @sendwhats/core so the API and the queue worker parse the
// same configuration exactly once.
export { env, isProd } from '@sendwhats/core';
