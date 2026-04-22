// force redeploy for firebase env work.");
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
 * PRIVACY POLICY PAGE
 * ==========
 */
app.get("/privacy", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Privacy Policy - AI Money Coach</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
          color: #222;
          background: #fff;
        }
        h1, h2 {
          color: #111;
        }
        a {
          color: #0a66c2;
        }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> April 2026</p>

      <p>
        AI Money Coach respects your privacy. This application provides AI-powered
        informational content related to personal finance.
      </p>

      <h2>Information We Collect</h2>
      <p>
        The app may process text entered by users in order to generate AI responses.
        The app does not require account creation and does not intentionally collect
        personal identification data such as name, address, or phone number.
      </p>

      <h2>How We Use Information</h2>
      <p>
        User-provided text is used only to generate responses requested by the user
        and to support the app’s functionality.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        The app may rely on third-party services, including AI and hosting providers,
        to process requests and deliver responses securely.
      </p>

      <h2>Data Sharing</h2>
      <p>
        We do not sell personal data and do not use user data for advertising purposes.
      </p>

      <h2>Children’s Privacy</h2>
      <p>
        AI Money Coach is not intended for children under the age of 13.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this Privacy Policy, you can contact us at:
        <br />
        <strong>aimoneycoach@gmail.com</strong>
      </p>
    </body>
    </html>
  `);
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
