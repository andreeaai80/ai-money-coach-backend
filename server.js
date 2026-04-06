require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));
app.post("/chat", async (req, res) => {
try {
const userMessage = req.body.message;

const response = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model: "gpt-4o-mini",
messages: [{ role: "user", content: userMessage }]
},
{
headers: {
Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type": "application/json"
}
}
);

res.json({
reply: response.data.choices[0].message.content
});

} catch (error) {
console.log(error);
res.status(500).json({ error: "Error" });
}
});

app.listen(3000, "0.0.0.0", () => {
console.log("Server running on port 3000");
});
