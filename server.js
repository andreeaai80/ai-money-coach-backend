// redeploy
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const admin = require("firebase-admin");

const app = express();

/**
 * ==========
 * BOOT LOGS + CRASH LOGS
 * ==========
 */
console.log("✅ Booting app...");
console.log("✅ Node version:", process.version);
console.log("✅ OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);
console.log("✅ FIREBASE_SERVICE_ACCOUNT present:", !!process.env.FIREBASE_SERVICE_ACCOUNT);
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
 * FIREBASE INIT
 * ==========
 */
let db = null;

function initFirebase() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT missing. Firebase memory will NOT work.");
    return;
  }

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    console.log("✅ Firebase Admin initialized. Firestore ready.");
  } catch (e) {
    console.error("🔥 Firebase init failed. Check FIREBASE_SERVICE_ACCOUNT JSON formatting.");
    console.error(e.message);
  }
}

initFirebase();

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
 * OPTIONAL: Firebase connectivity test (safe)
 * ==========
 * Open in browser: https://YOURDOMAIN/firebase-test
 * You can remove this later.
 */
app.get("/firebase-test", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ ok: false, error: "Firestore not initialized" });

    await db.collection("connection_test").doc("ok").set({
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("firebase-test error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ==========
 * CHAT ENDPOINT (with memory)
 * ==========
 * Expects body: { message: string, userId?: string }
 */
app.post("/chat", async (req, res) => {
  try {
    const userMessage = (req.body?.message || "").toString().trim();
    const userId = (req.body?.userId || "demo-user").toString().trim();

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing in Railway Variables" });
    }

    if (!db) {
      // App still works without memory, but we tell you clearly
      console.warn("⚠️ Firestore not initialized. Replying without memory.");
    }

    // 1) Load history from Firestore (if available)
    let history = [];
    let convoRef = null;

    if (db) {
      convoRef = db.collection("conversations").doc(userId);
      const snap = await convoRef.get();
      if (snap.exists) {
        history = snap.data()?.messages || [];
      }
    }

    // 2) Build context (last N messages)
    const lastN = 12;
    const context = history
      .slice(-lastN)
      .map((m) => `${m.role}: ${m.text}`)
      .join("\n");

    const prompt = context
      ? `${context}\nUser: ${userMessage}\nAssistant:`
      : userMessage;

    // 3) Call OpenAI (Responses API)
    const oa = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: prompt,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const d = oa.data;

    // 4) Extract reply robustly
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

    if (!reply) {
      console.log("⚠️ OpenAI reply empty. Available keys:", Object.keys(d || {}));
      reply = "(Empty reply from model)";
    }

    // 5) Save updated history back to Firestore (if available)
    if (db && convoRef) {
      const updated = [
        ...history,
        { role: "User", text: userMessage, ts: Date.now() },
        { role: "Assistant", text: reply, ts: Date.now() },
      ];

      // (optional) keep doc size under control
      const maxMsgs = 60;
      const trimmed = updated.slice(-maxMsgs);

      await convoRef.set(
        {
          messages: trimmed,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 6) Return reply
    return res.json({ reply });
  } catch (error) {
    console.error("🔥 /chat error:", error?.response?.data || error.message);

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
// force redeploy for firebase env
