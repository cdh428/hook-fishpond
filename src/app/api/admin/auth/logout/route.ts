import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: "Logged out" });
  response.cookies.delete("admin-session");
  return response;
}
