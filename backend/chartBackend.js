const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient } = require("mongodb");

app.use(bodyParser.json());
app.use(cors());

let datainfo1;

const url = "mongodb://192.168.0.65:27017";
const connectDB = async () => {
  try {
    console.log(" connecting");
    let client = new MongoClient(url);
    await client.connect();
    console.log("connected to mongo db");
    const db = client.db("taurusData1");
    datainfo1 = db.collection("datainfo1");
  } catch {
    console.log("not connected");
  }
};
connectDB();

app.get("/datainfo", async (req, res) => {
  try {
    const data = await datainfo1.find().toArray();
    return res.json({ message: data });
  } catch (error) {
    console.log(error);
  }
});

app.listen(4001, () => {
  console.log("app running on port 4001");
});
