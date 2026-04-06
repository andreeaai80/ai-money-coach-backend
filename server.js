require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static("."));

// 🔥 SERVE INDEX.HTML (FOARTE IMPORTANT)
app.get("/", (req, res) => {
res.sendFile(__dirname + "/index.html");
});

// 🔥 CHAT ENDPOINT
app.post("/chat", async (req, res) => {
try {
const userMessage = req.body.message || "Hello";

const response = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: {
"Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type": "application/json"
},
body: JSON.stringify({
model: "gpt-4o-mini",
messages: [
{ role: "user", content: userMessage }
]
})
});

const data = await response.json();

// 🔥 SAFE RESPONSE (NU MAI CRAPĂ)
const reply = data?.choices?.[0]?.message?.content || "No response";

res.json({ reply });

} catch (error) {
console.log("ERROR:", error);
res.json({ reply: "Server error 😢" });
}
});

// 🔥 PORT PENTRU RAILWAY
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("Server running on port " + PORT);
});
