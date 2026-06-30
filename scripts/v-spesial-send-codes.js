#!/usr/bin/env node

require("dotenv").config();

async function main() {
  const baseUrl = (process.env.V_SPESIAL_BASE_URL || process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const secret = process.env.V_SPESIAL_ADMIN_SECRET || "sajak-admin";
  const force = String(process.env.V_SPESIAL_FORCE_SEND || "false").toLowerCase() === "true";

  const response = await fetch(`${baseUrl}/api/v-bday/admin/send-codes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret,
      force,
    }),
  });

  const rawText = await response.text();
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Respons bukan JSON. Status ${response.status}. Isi: ${rawText.slice(0, 240)}`);
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  console.log(`[v-spesial] send-codes result: ${JSON.stringify(payload)}`);
}

main().catch((error) => {
  console.error(`[v-spesial] cron script failed: ${error.message}`);
  process.exitCode = 1;
});
