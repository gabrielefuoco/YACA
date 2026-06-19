require('dotenv').config();
console.log("MISTRAL_API_KEY in process.env:", process.env.MISTRAL_API_KEY ? "PRESENT (hidden for security)" : "MISSING");
