require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const connection = require("./db");
const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const logRoutes = require("./routes/logs");

connection();

app.use(express.json());
app.use(cors());

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/logs", logRoutes);

const port = process.env.PORT || 8082;
app.listen(port, console.log(`Listening on port ${port}...`));
