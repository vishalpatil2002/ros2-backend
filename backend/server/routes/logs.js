const router = require("express").Router();
const Log = require("../models/Logs");

router.get("/", async (req, res) => {
  
  try {
    const logs = await Log.find().sort({ timestamp: -1 }); // Fetch all logs
    res.status(200).send(logs);
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

module.exports = router;
