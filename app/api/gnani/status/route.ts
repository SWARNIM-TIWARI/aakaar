// AAKAAR: Gnani setup check. Open /api/gnani/status in the browser.
// Reports only whether a key is loaded and how .env.local is encoded.
// It never returns, logs or hints at the key itself.

import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGnaniConfig } from "@/lib/gnani/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = loadGnaniConfig() !== null;

  let envLocal: "missing" | "utf-8" | "utf-16" = "missing";
  try {
    const file = join(process.cwd(), ".env.local");
    if (existsSync(file)) {
      const head = readFileSync(file).subarray(0, 2);
      const utf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
      envLocal = utf16 ? "utf-16" : "utf-8";
    }
  } catch {
    // leave as "missing"
  }

  let hint = "Gnani key is loaded. Voice features are ready.";
  if (!configured) {
    if (envLocal === "missing") {
      hint = "No .env.local found next to package.json. Create it with GNANI_API_KEY=your_key, then restart npm run dev.";
    } else if (envLocal === "utf-16") {
      hint = "The .env.local file is saved as UTF-16, which Next.js cannot read. Re-save it as UTF-8 in VS Code (bottom right, Save with Encoding), then restart npm run dev.";
    } else {
      hint = "The file exists but GNANI_API_KEY is empty or missing. Check the line reads GNANI_API_KEY=your_key, save, then stop and restart npm run dev.";
    }
  }

  return NextResponse.json({ gnaniConfigured: configured, envLocal, hint });
}