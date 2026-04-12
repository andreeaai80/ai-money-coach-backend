require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();

/**
 * ==========
 * BOOT LOGS + CRASH LOGS (ca să vedem de ce moare în Railway)
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
app.use(express.json({ limit: "1mb" })); // safe default

/**
 * ==========
 * HEALTHCHECK (pentru Railway / debug rapid)
 * ==========
 */
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

/**
 * ==========
 * STATIC + ROOT PAGE
 * ==========
 * - servește fișiere statice din același folder (ex: index.html, css, js)
 * - root "/" trimite index.html explicit (cel mai sigur)
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

    // OpenAI Responses API
    const response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: userMessage
        // Dacă vrei "instrucțiuni" pt AI, putem adăuga aici system prompt în 'instructions'
        // instructions: "You are a helpful personal finance coach..."
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    // Responses API are output_text
    const reply = response?.data?.output_text ?? "";

    return res.json({ reply });
  } catch (error) {
    console.error("🔥 /chat error:", error?.response?.data || error.message);
    return res.status(500).json({ error: "Server error" });
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
