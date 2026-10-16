import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Expected, client-facing API failure. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, code = "bad_request") => new ApiError(400, message, code);
export const unauthorized = () => new ApiError(401, "You are not signed in.", "unauthorized");
export const forbidden = (message = "You don't have access to this.", code = "forbidden") =>
  new ApiError(403, message, code);
export const notFound = (message = "Not found.", code = "not_found") => new ApiError(404, message, code);
export const paymentRequired = (message: string, code = "limit_reached") => new ApiError(402, message, code);
export const conflict = (message: string, code = "conflict") => new ApiError(409, message, code);
export const tooManyRequests = (message = "Too many requests - slow down a little.", code = "rate_limited") =>
  new ApiError(429, message, code);

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

/**
 * Route handler wrapper: converts ApiError/ZodError into clean JSON,
 * logs everything unexpected. Every API route should use this.
 */
export async function handleApi(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid input.",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      );
    }
    console.error("[api] unhandled error:", err);
    return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}

/** Parse + validate a JSON request body. Throws ApiError(400) with the first issue. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.", "invalid_json");
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    throw badRequest(first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid input.", "validation");
  }
  return result.data;
}
