import { httpRouter } from "convex/server";

// Auth has been removed from this application — no HTTP routes are needed.
// The file stays because Convex expects convex/http.ts as the HTTP entry point.
const http = httpRouter();

export default http;
