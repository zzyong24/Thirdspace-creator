import { NextResponse } from "next/server";

import {
  HANDSHAKE_COOKIE,
  HANDSHAKE_HEADER,
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";

export async function POST(req: Request): Promise<Response> {
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();
  const token = req.headers.get(HANDSHAKE_HEADER);
  if (!token) return loopbackForbidden();
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(HANDSHAKE_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/api/",
  });
  return response;
}
