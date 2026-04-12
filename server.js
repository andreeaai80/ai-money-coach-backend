require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// serve static
app.use(express.static(__dirname));

// root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// chat endpoint
app.post("/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    }

    const userMessage = req.body.message;

    const response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: userMessage
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      reply: response.data.output_text
    });

  } catch (error) {
    console.error("EROARE:", error.response?.data || error.message);
    res.status(500).json({ error: "Eroare server" });
  }
});

// PORT Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
``
