
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { testDatabaseConnection } = require("./config/database");
const goalsRouter = require("./routes/goals");
const paymentsRouter = require("./routes/payments");


const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());


const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://192.168.0.172:5500",
    "https://hashtag.deeclercq.workers.dev"
];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error(`CORS blocked this origin: ${origin}`)
            );
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept"],
        optionsSuccessStatus: 204
    })
);


app.use(express.json({ limit: "10kb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Hashtag backend is running!",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/db-health", async (req, res) => {
  try {
    const database = await testDatabaseConnection();

    res.json({
      success: true,
      message: "PostgreSQL connection successful!",
      database: database.database_name,
      databaseTime: database.database_time,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

app.use("/api/goals", goalsRouter);
app.use("/api/payments", paymentsRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

async function startServer() {
  try {
    const database = await testDatabaseConnection();

    console.log("PostgreSQL connected successfully!");
    console.log(`Database: ${database.database_name}`);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

} catch (error) {
    console.error("Unable to connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
