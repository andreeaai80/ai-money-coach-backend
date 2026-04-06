require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("."));

// test
app.get("/", (req, res) => {
res.send("Server works!");
});

// chat endpoint
app.post("/chat", async (req, res) => {
try {
const userMessage = req.body.message;

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

res.json({
reply: data.choices[0].message.content
});

} catch (error) {
console.error(error);
res.status(500).json({
reply: "Eroare server 😢"
});
}
});

// IMPORTANT pentru Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log("Server running on port " + PORT);
});
