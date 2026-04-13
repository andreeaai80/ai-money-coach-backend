// redeploy
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();

/**
 * ==========
 * BOOT LOGS + CRASH LOGS (ca să vedem clar în Railway)
 * ==========
 */
console.log("✅ Booting app...");
console.log("✅ Node version:", process.version);
console.log("✅ OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);
console.log("✅ PORT env:", process.env.PORT);

process.on("uncaughtException", (err) => {
  console.error("🔥 uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 unhandledRejection:", reason);
});

/**
 * ==========
 * MIDDLEWARE
 * ==========
 */
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * ==========
 * HEALTHCHECK
 * ==========
 */
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

/**
 * ==========
 * STATIC + ROOT
 * ==========
 */
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/**
 * ==========
 * CHAT ENDPOINT
 * ==========
 */
app.post("/chat", async (req, res) => {
  try {
    const userMessage = (req.body?.message || "").toString().trim();

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing in Railway Variables" });
    }

    // Call OpenAI Responses API
    const oa = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: userMessage
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const d = oa.data;

    // ✅ Extract reply robustly (works even when output_text is empty)
    let reply =
      d.output_text ||
      (Array.isArray(d.output)
        ? d.output
            .flatMap((o) => (o && o.content ? o.content : []))
            .map((c) => c.text || c.transcript || "")
            .filter(Boolean)
            .join("\n")
        : "");

    reply = (reply || "").trim();

    // If still empty, log a preview for debugging (safe)
    if (!reply) {
      console.log("⚠️ OpenAI reply empty. Available keys:", Object.keys(d || {}));
      console.log(
        "⚠️ OpenAI output preview:",
        JSON.stringify(d?.output || [], null, 2).slice(0, 2000)
      );
      reply = "(Empty reply from model)";
    }

    return res.json({ reply });
  } catch (error) {
    console.error("🔥 /chat error:", error?.response?.data || error.message);

    // Return a useful error message to the frontend
    const msg =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error.message ||
      "Server error";

    return res.status(500).json({ error: msg });
  }
});

/**
 * ==========
 * LISTEN (Railway-safe)
 * ==========
 */
const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server running on port " + PORT);
});
``
// firebase enabled
