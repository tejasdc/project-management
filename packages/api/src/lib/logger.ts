// SDK errors can carry credentials or private note text; log only operational fields.
function write(level: string, context: Record<string, unknown>, message: string) {
  const safe = Object.fromEntries(Object.entries(context).filter(([key]) =>
    ["requestId", "userId", "method", "path", "statusCode", "responseTime", "jobId", "jobName", "rawNoteId", "projectId", "confidence"].includes(key)));
  console.log(JSON.stringify({ level, message, ...safe }));
}
export const logger = {
  info: (context: Record<string, unknown>, message: string) => write("info", context, message),
  warn: (context: Record<string, unknown>, message: string) => write("warn", context, message),
  error: (context: Record<string, unknown>, message: string) => write("error", context, message),
};
export function createJobLogger(job: { id: string; name: string }) {
  return Object.fromEntries(Object.entries(logger).map(([level, fn]) => [level,
    (context: Record<string, unknown>, message: string) => fn({ ...context, jobId: job.id, jobName: job.name }, message)])) as typeof logger;
}
