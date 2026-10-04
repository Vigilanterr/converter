export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export function apiSuccess<T>(
  data: T,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const body: ApiSuccess<T> = { success: true, data };

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

export function apiError(
  error: string,
  status = 400,
  headers: Record<string, string> = {}
): Response {
  const body: ApiFailure = { success: false, error };

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

export function downloadResponse(
  payload: Uint8Array,
  fileName: string,
  contentType: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(new Uint8Array(payload), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(payload.byteLength),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}
