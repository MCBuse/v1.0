import type { NextRequest } from "next/server";
import { GET as forward } from "./[...path]/route";

// A required catch-all does not match the account summary's empty path.
export function GET(request: NextRequest) {
  return forward(request, { params: Promise.resolve({ path: [] }) });
}
