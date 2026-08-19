export function GET() {
  return Response.json({
    app: process.env.APP_NAME ?? "unknown",
    status: "ok",
  });
}
