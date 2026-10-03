const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const axios = require("axios");
const { createClient } = require("redis");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const { OPCUAClient, AttributeIds, VariantArrayType } = require("node-opcua");
const readline = require('readline')

require("dotenv").config();
const { MongoClient, ObjectId, Double } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const ROSLIB = require("roslib");

const url = process.env.DATABASE_URL;
const dbNamePose = process.env.DATABASE_NAME;
const port = process.env.SERVER_PORT;
const ip = process.env.IP;
const webSocketPort = process.env.WEBSOCKET_PORT;
const jwt_privatekey = process.env.JWTPRIVATEKEY;
const taurusRedisIp = process.env.TAURUSREDIS_IP;
const conveyorRedisIp = process.env.conveyorRedis_IP;
const redisPort = process.env.REDIS_PORT;

const endpointUrl = "opc.tcp://192.168.7.60:4880";
const cobotClient = OPCUAClient.create({ endpointMustExist: false });

//Amr Action Parameters
const amrActionParameters = [
  { name: "Docking" },
  { name: "Load-Conveyor" },
  { name: "Unload-Conveyor" },
  { name: "Wait" },
  { name: "Cobot" },
  { name: "Inspect" },
  { name: "Exit-Docking" },
  { name: "Lift-Up" },
  { name: "Lift-Down" },
  { name: "Drop" }

];
let dockingFlag = false;

app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

// creating redis client

const taurusClient = new createClient({
  // url: `redis://${taurusRedisIp}:${redisPort}`,
  url: `redis://localhost:6379`,
});

const conveyorClient = new createClient({
  url: `redis://${conveyorRedisIp}:${redisPort}`,
});

app.use(express.static(path.join(__dirname, "public")));

// ROS connection setup
const ros = new ROSLIB.Ros({
  url: `ws://${ip}:${webSocketPort}/`,
});

ros.on("connection", () => {
  console.log("Connected to ROS");
});

ros.on("error", (error) => {
  console.error("Error connecting to ROS:", error);
});

ros.on("close", () => {
  console.log("Disconnected from ROS");
});

const actionClient = new ROSLIB.ActionClient({
  ros: ros,
  serverName: "/move_base",
  actionName: "geometry_msgs/PoseWithCovarianceStamped",
});

var clearCostmapClient = new ROSLIB.Service({
  ros: ros,
  name: "/move_base/clear_costmaps",
  serviceType: "std_srvs/Empty",
});

function clearCostmaps() {
  var request = new ROSLIB.ServiceRequest({});
  clearCostmapClient.callService(request, function (result) {
    // console.log("Costmaps cleared successfully");
  });
}

const navigationParam = new ROSLIB.Param({
  ros: ros,
  name: "/navigation",
});

let client;
let collection_pose;
let collection_mission;
let collection_missionHistory;
let collection_queue;
let collection_user;
let collection_logs;
let collection_alarms;
let poseIds = [];
let missionExecutionQueue = [];
let index = 0;
let missionCancelFlag = false;
let missionpauseFlag = false;
let currentMapName;
let poseDataArray;
let currentGoal;
let currentIndex = 0;
let navigationRunning = false;
let lastValue = null;
let lastMissionName = null;

const processStates = {
  motor: { isHealthy: true },
  lidar: { isHealthy: true },
  camera: { isHealthy: true },
  imu: { isHealthy: true },
};

// Mongoose user schema and model
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // role: {
  //   type: String,
  //   enum: ["OEM", "Supervisor", "Operator"],
  //   default: "",
  // },
});

userSchema.methods.generateAuthToken = function () {
  const token = jwt.sign({ _id: this._id }, jwt_privatekey, {
    expiresIn: "7d",
  });
  return token;
};

const User = mongoose.model("User", userSchema);

// User validation
const validateUser = (data) => {
  let errors = {};

  if (!data.firstName || data.firstName.trim() === "") {
    errors.firstName = "First Name is required.";
  }
  if (!data.email || data.email.trim() === "") {
    errors.email = "Email is required.";
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.email = "Email is invalid.";
  } else if (/[A-Z]/.test(data.email)) {
    errors.email = "Email should not contain uppercase letters.";
  }
  if (!data.password || data.password.trim() === "") {
    errors.password = "Password is required.";
  } else if (data.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else {
    if (!/[A-Z]/.test(data.password)) {
      errors.password = "Password must contain at least one uppercase letter.";
    } else if (!/[a-z]/.test(data.password)) {
      errors.password = "Password must contain at least one lowercase letter.";
    } else if (!/[0-9]/.test(data.password)) {
      errors.password = "Password must contain at least one number.";
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(data.password)) {
      errors.password = "Password must contain at least one special character.";
    }
  }
  // if (!data.role || !["OEM", "Supervisor", "Operator"].includes(data.role)) {
  //   errors.role = "Role must be one of OEM, Supervisor, or Operator.";
  // }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
};

const logSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  // role: { type: String, required: true },
  event: { type: String, required: true }, // "Login" or "Logout"
  timestamp: { type: Date, default: Date.now },
});

const Log = mongoose.model("Log", logSchema);

//----------------------- Mongodb Connection starts from  here ---------------------------//

// This code connects to a MongoDB database, sets up a server to listen on port 3001,
// and logs a success message if the connection is established.
(async () => {
  try {
    client = new MongoClient(url);
    await client.connect();
    console.log("connected to db");
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();

    const dbExists = dbs.databases.some((db) => db.name === dbNamePose);
    if (!dbExists) {
      const db = client.db(dbNamePose);

      // Create Pose_data collection
      collection_pose = db.collection("Pose_data");
      await collection_pose.insertOne({ initialized: true });
      await collection_pose.deleteOne({ initialized: true });

      // Create Missions collection
      collection_mission = db.collection("Missions");
      await collection_mission.insertOne({ initialized: true });
      await collection_mission.deleteOne({ initialized: true });

      // Create User collection
      collection_user = db.collection("users");
      await collection_user.insertOne({ initialized: true });
      await collection_user.deleteOne({ initialized: true });

      // Create MissionHistory collection
      collection_missionHistory = db.collection("MissionHistory");
      await collection_missionHistory.insertOne({ initialized: true });
      await collection_missionHistory.deleteOne({ initialized: true });

      // Create Logs collection
      collection_logs = db.collection("logs");
      await collection_logs.insertOne({ initialized: true });
      await collection_logs.deleteOne({ initialized: true });
      // Create MissionQueue collection

      collection_queue = db.collection("MissionQueue");
      await collection_queue.insertOne({ initialized: true });
      await collection_queue.deleteOne({ initialized: true });

      collection_alarms = db.collection("AlarmsData");
      await collection_alarms.insertOne({ initialized: true });
      await collection_alarms.deleteOne({ initialized: true });
    } else {
      const db = client.db(dbNamePose);

      // Check if Pose_data collection exists
      const collections = await db
        .listCollections({ name: "Pose_data" })
        .toArray();
      if (collections.length === 0) {
        collection_pose = db.collection("Pose_data");
        await collection_pose.insertOne({ initialized: true });
        await collection_pose.deleteOne({ initialized: true });
      } else {
        collection_pose = db.collection("Pose_data");
      }

      // Check if Missions collection exists
      const collectionsMissions = await db
        .listCollections({ name: "Missions" })
        .toArray();
      if (collectionsMissions.length === 0) {
        collection_mission = db.collection("Missions");
        await collection_mission.insertOne({ initialized: true });
        await collection_mission.deleteOne({ initialized: true });
      } else {
        collection_mission = db.collection("Missions");
      }

      // Check if user collection exists
      const collectionsUser = await db
        .listCollections({ name: "users" })
        .toArray();
      if (collectionsUser.length === 0) {
        collection_user = db.collection("users");
        await collection_user.insertOne({ initialized: true });
        await collection_user.deleteOne({ initialized: true });
      } else {
        collection_user = db.collection("users");
      }

      // Check if MissionHistory collection exists
      const collectionsMissionHistory = await db
        .listCollections({ name: "MissionHistory" })
        .toArray();
      if (collectionsMissionHistory.length === 0) {
        collection_missionHistory = db.collection("MissionHistory");
        await collection_missionHistory.insertOne({ initialized: true });
        await collection_missionHistory.deleteOne({ initialized: true });
      } else {
        collection_missionHistory = db.collection("MissionHistory");
      }

      // Check if logs collection exists
      const collectionsLogs = await db
        .listCollections({ name: "logs" })
        .toArray();
      if (collectionsLogs.length === 0) {
        collection_logs = db.collection("logs");
        await collection_logs.insertOne({ initialized: true });
        await collection_logs.deleteOne({ initialized: true });
      } else {
        collection_logs = db.collection("logs");
      }

      // Check if MissionQueue collection exists
      const collectionsQueue = await db
        .listCollections({ name: "MissionQueue" })
        .toArray();
      if (collectionsQueue.length === 0) {
        collection_queue = db.collection("MissionQueue");
        await collection_queue.insertOne({ initialized: true });
        await collection_queue.deleteOne({ initialized: true });
      } else {
        collection_queue = db.collection("MissionQueue");
      }
      // Check if AlarmsData collection exists
      const collectionsAlarms = await db
        .listCollections({ name: "AlarmsData" })
        .toArray();
      if (collectionsAlarms.length === 0) {
        collection_alarms = db.collection("AlarmsData");
        await collection_alarms.insertOne({ initialized: true });
        await collection_alarms.deleteOne({ initialized: true });
      } else {
        collection_alarms = db.collection("AlarmsData");
      }
    }
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
})();
//----------------------- Mongodb Connection Ends here ---------------------------//

// ------------------------ API Routes starts from here---------------------//

// User login route
app.post("/api/auth", async (req, res) => {
  try {
    console.log(req)
    const user = await collection_user.findOne({ email: req.body.email });

    if (!user)
      return res.status(401).send({ message: "Invalid Email or Password" });

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );

    if (!validPassword)
      return res.status(401).send({ message: "Invalid Email or Password" });

    const token = jwt.sign({ _id: user._id }, jwt_privatekey, {
      expiresIn: "7d",
    });
    try {
      const newLog = {
        userName: user.firstName,
        // role: user.role,
        event: "Login",
        timestamp: new Date(),
      };

      await collection_logs.insertOne(newLog);
    } catch (logError) {
      console.error("Error creating login log:", logError);
    }
    res.status(200).send({
      data: token,
      // role: user.role,
      id: user._id,
      userName: user.firstName,
      email: user.email,
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// User registration route
app.post("/api/user", async (req, res) => {
  const { errors, isValid } = validateUser(req.body);
  if (!isValid)
    return res.status(400).send({ message: Object.values(errors).join(", ") });

  try {
    const existingUser = await collection_user.findOne({
      email: req.body.email,
    });
    if (existingUser)
      return res
        .status(409)
        .send({ message: "User with given email already exists!" });

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(req.body.password, salt);

    const newUser = { ...req.body, password: hashPassword };
    await collection_user.insertOne(newUser);

    res.status(201).send({ message: "User created successfully" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// fetch all the usernames with operator role and send it to frontend to display them in the mission control screen

app.get("/api/get/registeredUsers", async (req, res) => {
  try {
    let userNames = [];
    const operators = await collection_user
      .find()
      .toArray();
    // operators.forEach((operator) => {
    // userNames.push(operator.firstName);
    // });
    console.log("found operators : ", userNames);
    res.status(200).json({ data: userNames });
  } catch (err) {
    console.error("Error fetching users with operator role", err);
    res.status(502).send({ message: `Internal server error ${err}` });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const logs = await collection_logs.find().sort({ timestamp: -1 }).toArray();
    res.status(200).send(logs);
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});
app.post("/api/auth/logout", async (req, res) => {
  try {
    const userId = req.body.UserId;
    const user = await collection_user.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    const newLog = {
      userName: user.firstName,
      // role: user.role,
      event: "Logout",
      timestamp: new Date(),
    };

    await collection_logs.insertOne(newLog);

    res.status(200).send({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

app.post("/api/sendUserName", (req, res) => {
  const { mapName } = req.body;
  console.log("mapname", mapName)
  currentMapName = mapName;
  res.status(200).send({ message: "UserName received" });
});

app.post("/api/removeMapName", (req, res) => {
  currentMapName = undefined;
  console.log("set as undefined")
  res.status(200).send({ message: "map name successfully removed" });
});
// app.post("/api/sendMapName", (req, res) => {
//   const { mapName } = req.body;
//   currentMapName = mapName;
//   console.log("Received UserName:", currentMapName);
//   res.status(200).send({ message: "UserName received" });
// });

// process.on("SIGINT", () => {
//   currentMapName = undefined;

//   process.exit();
// });
// this is to save the position name and amcl data in db
app.post("/save", async (req, res) => {
  try {
    const { positionName, amclData, Description } = req.body;
    let uuid = uuidv4();
    await collection_pose.insertOne({
      _id: uuid,
      name: positionName,
      mapName: currentMapName,
      amclData,
      Description: Description,
    });
    res.status(200).json({ message: "Pose data saved in the DB " });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// This code defines a route  for fetching pose data from a MongoDB database.
// It retrieves the data, sends it to the front end as a JSON response, and logs a message.
// If there's an error, it logs an error message and sends a 500 status code as a response.
app.get("/api/data", async (req, res) => {
  try {
    console.log("current Map name", currentMapName);    
    if (!currentMapName) {
      return res.status(400).json({ error: "UserName and MapName not set" });
    }
    const fetchedPoseData = await collection_pose
      .find({ mapName: currentMapName })
      .toArray();
    for (let i = 0; i < amrActionParameters.length; i++) {
      fetchedPoseData.push(amrActionParameters[i]);
    }
    // fetchedPoseData.push({ name: "Docking" });
    // console.log("data to be sent to front end", fetchedPoseData);
    res.json(fetchedPoseData);
  } catch (error) {
    console.error("Error fetching Pose data From the DataBase:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// This code defines a route  for fetching mission data from a MongoDB database.
// It connects to the database, retrieves the mission data, sends it to the front end as a JSON response,
// and logs a message.
app.get("/api/missionData", async (req, res) => {
  try {
    console.log("map names in misionData", currentMapName)
    const fetchedMissionData = await collection_mission
      .find({ mapName: currentMapName })
      .toArray();
    console.log("fetchedMisssionData ", fetchedMissionData.length);
    if (fetchedMissionData.length > 0) {
      res.json(fetchedMissionData);
    } else {
      console.log("sending this to ui");
      res.status(204).send(); // 204 No Content
    }
  } catch (error) {
    console.error("Error fetching mission data from the database:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/sendMissionQueue", async (req, res) => {
  const { date, missionQueue,
    //  userName 
  } = req.body;

  // console.log(userName);
  try {
    // const documentToUpdate = {
    //   date: date,
    // };

    const newMissionData = missionQueue.map((mission) => ({
      id: mission.id,
      inputValue: parseInt(mission.inputValue),
      missionName: mission.missionName,
      CT: 0,
    }));

    const result = await collection_queue.updateOne(
      {
        date: date,
        // userName: userName
      },
      {
        $setOnInsert: {
          date: date,
          // userName: userName 
        },
        $push: { missionQueue: { $each: newMissionData } },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
    } else if (result.modifiedCount > 0) {
      console.log(`Existing document updated in 'MissionQueue' collection.`);
    }

    res.status(200).json({ message: "Mission queue processed successfully!" });
  } catch (error) {
    console.error("Error processing mission queue:", error);
    res.status(500).json({ error: "Failed to process mission queue" });
  }
});

// the below api is used to display data in operator panel to complete
// today's tasks which has been assigned by supervisor in mission control screen
// it will fetch the data from colllection_queue db according to today's date only
app.get("/api/todaysTasks", async (req, res) => {
  try {
    // const loggedInUser = req.params.loggedInUser;
    const today = new Date();

    // if (!loggedInUser) {
    // return res.status(404).json({ message: "User is not logged in" });
    // }

    const formattedToday = `${today.getMonth() + 1
      }/${today.getDate()}/${today.getFullYear()}`;
    console.log(formattedToday);
    const todayTasks = await collection_queue
      .find({
        date: formattedToday,
        // userName: loggedInUser,
      })
      .toArray();
    console.log("todays taskss", todayTasks);
    res.status(200).json(todayTasks);
  } catch (error) {
    console.error("error fetching today's tasks", error);
    res.status(500).send("Server Error");
  }
});

// This code defines a route for handling POST requests related to active missions.
// It expects a mission ID in the request body, retrieves the corresponding active mission from the database,
// logs the active mission data, and processes pose IDs associated with it.
const updateActiveMission = (missionName) => {
  io.emit("activeMissionUpdate", missionName);
};

app.post("/api/activeMission", async (req, res) => {
  try {
    const { missionId, missionName, inputValue } = req.body; // Destructure missionId and missionName from request body
    let missionData = req.body.missionId;
    let missionname = req.body.missionName;
    updateActiveMission(missionname);
    console.log(`Active Mission: ${missionName} with id: ${missionId}`);
    navigationParam.set(2)

    missionCancelFlag = false;
    missionpauseFlag = false;
    missionExecutionQueue = [];
    index = 0;
    currentIndex = 0;

    try {
      // if (missionData === undefined && missionName == "Docking") {
      //   // ArucoDetection();
      //   console.log("encountered docking keyword");
      // } else { .........else block starts here............
      const activeMissionCursor = await collection_mission.find({
        _id: new ObjectId(missionData),
      });
      const activeMissions = await activeMissionCursor.toArray();
      const poseIdss = activeMissions[0].queueData.queue;
      console.log(`poseID ${poseIds}`);

      poseIdss.forEach((item) => {
        // poseIds.push(item['positionId']);
        // Below is a new line
        poseIds.push(item);
      });
      poseDataArray = await sendPoseID(poseIds);
      // } ..........else block ends here..............
    } catch (error) {
      console.error(error);
    }
    for (let n = 0; n < inputValue; n++) {
      console.log(`Iteration: ${n + 1}`);
      if (n > 0) {
        move_baseListener.subscribe(async (actionResult) => {

          console.log('Drop', drop)
          if (actionResult.status.status === 3 && !missionpauseFlag && drop == false) {
            // index++;
            // index = index + 1;
            // currentIndex = index;
            // io.emit("indexUpdate", { status: "Completed", index: index });
            // await sendGoal(currentIndex);
            clearCostmaps();
            await processPoseIds(poseIds);
          } else {
            clearCostmaps();
            await processPoseIds(poseIds);
          }
        });
      }
    }

    res.status(200).json({ message: "Mission info sent successfully" });
    missionData = "";
    poseIds = [];
  } catch (error) {
    console.error("Error receiving queue data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// This code defines a route ("/api/send") to handle POST requests for sending mission data.
// It expects a mission object in the request body, saves the mission data to the database,
// and then iterates through each item in the mission queue to retrieve additional data.
app.post("/api/send", async (req, res) => {
  try {
    const queueData = req.body.mission;
    const missionName = queueData.missionName;
    // const time = queueData.waitTime;
    console.log("MISSION", queueData);
    const existingMission = await collection_mission.findOne({
      "queueData.missionName": missionName,
    });

    if (existingMission) {
      try {
        // console.log('this is the quedata being sent to database after updating', queueData);
        await collection_mission.updateOne(
          { "queueData.missionName": missionName },
          {
            $set: {
              queueData: queueData,
              mapName: currentMapName,
            },
          }
        );
        // Adding a new line to test
        // res.status(200).json({message: "mission recieved at backend, looking for the format"});
        res.status(200).json({ message: "Mission updated successfully" });
      } catch (error) {
        console.error("Error updating mission data:", error);
        return res.status(500).json({ error: "Error updating mission data" });
      }
    } else {
      try {
        await collection_mission.insertOne({
          queueData,
          mapName: currentMapName,
        });
        res.status(200).json({ message: "New mission inserted successfully" });
        console.log("insertredddd")
        // adding a new test line
        // console.log("Adding a new test queue data. added successfully", queueData);
        // res.status(200).json({message: "Tested a new queueData entry successfully"});
        // console.log("New mission inserted into the database.");
      } catch (error) {
        console.error("Error saving mission data:", error);
        return res.status(500).json({ error: "Error saving mission data" });
      }
    }
    for (const item of queueData.queue) {
      const search_data = await collection_pose.find({ _id: item }).toArray();
    }
  } catch (error) {
    console.error("Error receiving queue data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// api for tooltip to display mission info

app.post("/api/missiontoolip", async (req, res) => {
  try {
    const tooltipData = req.body.tooltipMissionName;
    const searchResults = [];
    const description = [];

    for (let missionName of tooltipData) {
      let tooltipposition = null;

      if (
        missionName["positionId"] !== "Docking" ||
        missionName["positionId"] !== "Load-Conveyor" ||
        missionName["positionId"] !== "Unload-Conveyor" ||
        missionName["positionId"] !== "Wait" ||
        missionName["positionId"] !== "Cobot" ||
        missionName["positionId"] !== "Inspect" ||
        missionName["positionID"] !== "Exit-Docking" ||
        missionName["positionID"] !== "Lift_Down" ||
        missionName["positionID"] !== "Lift-Up"
      ) {
        tooltipposition = await collection_pose.findOne({
          _id: missionName["positionId"],
        });
      }

      if (tooltipposition) {
        searchResults.push(tooltipposition.name);
        description.push(tooltipposition.Description);
      } else if (missionName["positionId"] === "Docking") {
        searchResults.push("Docking");
        description.push("Docking Description");
      } else if (missionName["positionId"] === "Wait") {
        searchResults.push("Wait");
        description.push("Wait Description");
      } else if (missionName["positionId"] === "Load-Conveyor") {
        searchResults.push("Load-Conveyor");
        description.push("Load-Conveyor Description");
      } else if (missionName["positionId"] === "Unload-Conveyor") {
        searchResults.push("Unload-Conveyor");
        description.push("Unload-Conveyor Description");
      } else if (missionName["positionId"] === "Cobot") {
        searchResults.push("Cobot");
        description.push("Cobot description");
      } else if (missionName["positionId"] === "Inspect") {
        searchResults.push("Inspect");
        description.push("Inspection Description");
      } else if (missionName["positionId"] === "Exit-Docking") {
        searchResults.push("Exit-Docking");
        description.push("Exit-Docking")
      } else if (missionName["positionId"] === "Lift-Up") {
        searchResults.push("Lift-Up");
        description.push("Lift-Up")
      } else if (missionName["positionId"] === "Lift-Down") {
        searchResults.push("Lift-Down");
        description.push("Lift-Down")
      }
      else if (missionName["positionId"] === "Drop") {
        searchResults.push("Drop");
        description.push("Drop")
      }
      else {
        searchResults.push(null);
        description.push(null);
      }
    }
    res.json({ searchResults, description });
  } catch (error) {
    console.error("Error while retrieving mission tooltip data", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/missionPositions", async (req, res) => {
  try {
    const { missionId } = req.body;

    const mission = await collection_mission.findOne({
      _id: new ObjectId(missionId),
    });

    if (mission) {
      const poseIds = mission.queueData.queue;
      const positions = [];

      for (const poseId of poseIds) {
        const position = await collection_pose.findOne({ _id: poseId });
        if (position) {
          positions.push({
            position: position.amclData.pose.pose.position,
            orientation: position.amclData.pose.pose.orientation,
          });
        }
      }
      res.status(200).json({ positions });
    } else {
      res.status(404).json({ error: `Mission '${missionId}' not found` });
    }
  } catch (error) {
    console.error("Error fetching mission positions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// This Code defines a route for deleting position from a mongoDB database
// it receives the positionName from frontend , get into db and search for the particular position
// and deletes the position from the DB and sends back a response to frontend wheather it is deleted or not
app.delete("/api/delete", async (req, res) => {
  const { positionName } = req.body;
  try {
    const response = await collection_pose.deleteOne({ name: positionName });
    res.status(200).json({ message: `Deleted '${positionName}' successfully` });
  } catch (error) {
    console.error("Error deleting from MongoDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
// this is to delete the entire task present in mission control
app.delete("/api/delete2", async (req, res) => {
  const { name } = req.body;
  try {
    const response = await collection_mission.deleteOne({
      "queueData.missionName": name,
    });
    res.status(200).json({ message: `Deleted '${name}' successfully` });
  } catch (error) {
    console.error("Error deleting from MongoDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// this is to delete ech task which is created by supervisor with particualr date which is present in Missions component
app.delete("/api/delete3", async (req, res) => {
  const { date, index } = req.body;

  try {
    const document = await collection_queue.findOne({ date: date });

    if (document) {
      if (
        document.missionQueue &&
        index >= 0 &&
        index < document.missionQueue.length
      ) {
        await collection_queue.updateOne(
          { date: date },
          { $unset: { [`missionQueue.${index}`]: 1 } }
        );

        await collection_queue.updateOne(
          { date: date },
          { $pull: { missionQueue: null } }
        );

        const updatedDocument = await collection_queue.findOne({ date: date });
        if (
          !updatedDocument.missionQueue ||
          updatedDocument.missionQueue.length === 0
        ) {
          await collection_queue.deleteOne({ date: date });
        } else {
          console.log(`Deleted task at index '${index}' on date '${date}'`);
        }

        res
          .status(200)
          .json({ message: `Deleted task at index '${index}' successfully` });
      } else {
        res.status(404).json({ error: `Invalid index or task not found` });
      }
    } else {
      res.status(404).json({ error: `No document found for date '${date}'` });
    }
  } catch (error) {
    console.error("Error deleting from MongoDB:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// this is to check the task name while entering the name before saving the task
app.get("/check-mission-name", async (req, res) => {
  const missionName = req.query.name.toLowerCase(); // Convert to lowercase
  try {
    const mission = await collection_mission.findOne({
      "queueData.missionName": { $regex: `^${missionName}$`, $options: "i" },
    });
    res.json({ exists: mission !== null });
  } catch (error) {
    console.error("Error checking mission name:", error);
    res.status(500).send("Error checking mission name");
  }
});

// Add this route to your existing backend code
// this is to fetch data from backend with the help of id whichis recived from front end  and send the data to front end
// which is used in while editing the position in  capturePosition.jsx
app.post("/api/positionData", async (req, res) => {
  try {
    const id = req.body.id;

    const positionData = await collection_pose.findOne({ _id: id });

    if (positionData) {
      res.status(200).json(positionData);
    } else {
      res.status(404).json({ error: `Position '${id}' not found` });
    }
  } catch (error) {
    console.error("Error fetching position data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/api/positionNameData", async (req, res) => {
  try {
    const names = req.body.Position_Name; // Could be an array
    console.log(names, "received");

    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: "Position_Name must be a non-empty array" });
    }

    // Fetch all matching positions in one query
    const positionNameData = await collection_pose
      .find({ name: { $in: names } })
      .toArray();

    if (positionNameData.length > 0) {
      res.status(200).json(positionNameData);
    } else {
      res.status(404).json({ error: "No matching positions found" });
    }
  } catch (error) {
    console.error("Error fetching position data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// this is to update data in back end which has been edited in frontend inside the modal in captureposition.jsx
app.put("/api/updatePositionData", async (req, res) => {
  const { id, name, amclData } = req.body;

  try {
    // Update the specific fields within amclData in MongoDB
    const updatedPosition = await collection_pose.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          "amclData.pose.pose.position.x": parseFloat(amclData.field1),
          "amclData.pose.pose.position.y": parseFloat(amclData.field2),
          "amclData.pose.pose.position.z": parseFloat(amclData.field3),
          "amclData.pose.pose.orientation.w": parseFloat(amclData.field4),
          name: name,
        },
      },
      { returnOriginal: false }
    );

    if (!updatedPosition) {
      return res.status(404).json({ error: `Position '${name}' not found` });
    }
    res.status(200).json(updatedPosition);
  } catch (error) {
    console.error("Error updating position data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch mission history data
// this is to fetch data from collection_missionHistroy and send it to frontend to display it in mission logs
app.get("/api/missionHistory", async (req, res) => {
  try {
    const fetchedMissionHistory = await collection_missionHistory
      .find({})
      .toArray();
    if (fetchedMissionHistory.length > 0) {
      res.json(fetchedMissionHistory);
    } else {
      res.status(204).send(); // 204 No Content
    }
  } catch (error) {
    console.error(
      "Error fetching mission history data from the database:",
      error
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

async function sendStatusUpdateToFrontend(missionName, status) {
  try {
    await axios.post(`http://192.168.5.10:3001/api/updateStatus`, {
      missionName,
      status,
    });
  } catch (error) {
    console.error("Error sending status update to frontend:", error);
  }
}

app.post("/api/updateStatus", (req, res) => {
  const { missionName, status } = req.body;

  io.emit("statusUpdate", { missionName, status });

  res.send({ success: true });
});

app.get("/api/poseData", async (req, res) => {
  try {
    res.status(200).json({
      message: "Pose data retrieved successfully",
      poseData: poseDataArray,
    });
  } catch (error) {
    console.error("Error retrieving pose data:", error);
    res.status(500).json({ error: "Failed to retrieve pose data" });
  }
});

// api to fetch the number of completed mission till date

app.get("/api/completedMissions", async (req, res) => {
  try {
    const completedMissions = await collection_missionHistory
      .find({
        status: "Completed",
      })
      .toArray();
    res.status(200).json({ data: completedMissions.length });
  } catch (err) {
    console.error(`Error fetching the number of missions Completed`);
  }
});

//the below api is used to fetch data from collection_queue to display the data
// in Missions components irrespective of date

app.get("/api/Missions", async (req, res) => {
  try {
    const Missions = await collection_queue.find({}).toArray();
    // console.log("missions", Missions);
    res.status(200).json(Missions);
  } catch (error) {
    console.error("Error retrieving collection_queue data :", error);
    res.status(500).json({ error: "Failed to retrieve Missions data" });
  }
});

// Assuming you're using Express for the backend
app.put("/api/update-mission-input", async (req, res) => {
  const { date, missionId, newInputValue } = req.body;
  try {
    // Use $set to update the specific mission's inputValue in the missionQueue array
    const result = await collection_queue.updateOne(
      { date, "missionQueue.id": missionId }, // Find the document by date and the specific mission id
      { $set: { "missionQueue.$.inputValue": newInputValue } } // Update the inputValue of the matched mission
    );

    // Check if any document was updated
    if (result.modifiedCount > 0) {
      res.status(200).send({ message: "Input value updated successfully" });
    } else {
      res.status(404).send({ message: "Mission not found" });
    }
  } catch (error) {
    console.error("Error updating mission input:", error);
    res.status(500).send({ message: "Failed to update input value" });
  }
});

// alarms to be sent to display in alarm component
app.get("/api/getAlarms", async (req, res) => {
  try {
    const alarms = await collection_alarms.find({}).toArray();
    console.log("alarms", alarms);
    res.status(200).json(alarms);
  } catch (error) {
    res.status(500).json({ message: "Error fetching alarms", error });
  }
});

// ------------------------ API Routes ends here-----------------------------//

// ---------------------Other functions and socket things starts from here ----------------------------//


setInterval(() => {
  const missionParam = new ROSLIB.Param({
    ros: ros,
    name: "mission"
  });

  missionParam.get((value) => {
    if (value === null || value === undefined) {
      return;
    }

    if (value !== lastValue) {
      lastValue = value;
      console.log("ROS Param changed:", value);
      io.emit("missionStatus", value)
    }
  }, (err) => {
    if (err) {
      console.warn("Failed to get param: mission (probably not set yet)");
    }
  });
}, 1000);

setInterval(() => {
  const missionNameParam = new ROSLIB.Param({
    ros: ros,
    name: "missionname"
  });

  missionNameParam.get((value) => {
    if (value && value !== lastMissionName) {
      lastMissionName = value;
      console.log("New mission name from ROS param:", value);
      io.emit("missionNameUpdate", value);
    }
  }, (err) => {
    console.log("error from mission name param ", err)
  });
}, 1000);


async function sendPoseID(poseIds) {
  let poseDataArray = [];
  try {
    for (const poseid of poseIds) {
      const poseDataCursor = await collection_pose.findOne({
        _id: poseid["positionId"],
      });
      poseDataArray.push(poseDataCursor);
    }
    // const poseDataCursor = await collection_pose.find({
    //   _id: { $in: poseIdsss },
    // });
    // const poseDataArray = await poseDataCursor.toArray();
    console.log("pose data array", poseDataArray)
    const amclDataArray = poseDataArray.map((pose) => pose.amclData);
    return amclDataArray;
  } catch (error) {
    console.error("Error retrieving pose data:", error);
    throw error;
  }
}

// This asynchronous function, `processPoseIds`, retrieves pose data from a MongoDB database
// based on the provided pose IDs. It makes a mission execution queue with pose position
// and orientation data.
// Mission Processing Functions

async function processPoseIds(id) {
  try {
    for (const poseid of id) {
      if (
        poseid["positionId"] === "Docking" ||
        poseid["positionId"] === "Load-Conveyor" ||
        poseid["positionId"] === "Unload-Conveyor" ||
        poseid["positionId"] === "Cobot" ||
        poseid["positionId"] === "Inspect" ||
        poseid["positionId"] === "Exit-Docking" ||
        poseid["positionId"] === "Lift-Up" ||
        poseid["positionId"] === "Lift-Down" ||
        poseid["positionId"] === "Drop"
      ) {
        // missionExecutionQueue.push("Docking");
        // Below is a new line
        missionExecutionQueue.push(poseid);
      } else if (poseid["positionId"] === "Wait") {
        // missionExecutionQueue.push("Wait");
        // Below is a new line
        missionExecutionQueue.push(poseid);
      } else {
        const searchPoseid = await collection_pose
          .find({ _id: poseid["positionId"] })
          .toArray();
        if (searchPoseid.length > 0) {
          missionExecutionQueue.push([
            searchPoseid[0].amclData.pose.pose.position,
            searchPoseid[0].amclData.pose.pose.orientation,
          ]);
        } else {
          console.warn(`Pose ID ${poseid} not found in database.`);
        }
      }
    }
    // Start executing goals after preparing the queue
    clearCostmaps();

    await sendGoal(currentIndex);
  } catch (error) {
    console.error("Error processing pose IDs:", error);
  }
}

const handleMissionComplete = () => {
  io.emit("missionComplete", "Mission Complete");
  updateActiveMission("No active task");
  io.emit("updatePausedBtnText", "_");
};

function exampleFunction(dockingParameter) {
  console.log(`${dockingParameter} is being called`);
}

var drop = false;

async function sendGoal(index) {
  clearCostmaps();

  if (missionCancelFlag) {
    return;
  }
  dockingFlag = false;
  console.log("before nissionQueue length")
  console.log("sendGoal() called with index:", index, "Queue length:", missionExecutionQueue.length);

  if (index < missionExecutionQueue.length
    && !missionpauseFlag) {
    console.log('Entering if block for selecting current postiions', missionpauseFlag, 'mission pause flag')
    currentGoal = missionExecutionQueue[index];
    console.log("→ Reached index", index, "Goal is:", currentGoal);
    console.log("→ positionId is:", currentGoal?.positionId);

    console.log(currentGoal, "This is current goal");
    if (
      currentGoal["positionId"] === "Docking" ||
      currentGoal["positionId"] === "Load-Conveyor" ||
      currentGoal["positionId"] === "Unload-Conveyor" ||
      currentGoal["positionId"] === "Cobot" ||
      currentGoal["positionId"] === "Inspect" ||
      currentGoal["positionId"] === "Exit-Docking" ||
      currentGoal["positionId"] === "Lift-Up" ||
      currentGoal["positionId"] === "Lift-Down"
    ) {
      try {
        console.log('Docking is called inside dendGoal function');
        await enableDocking(currentGoal["positionId"]);
      } catch (error) {
        console.error("Error during docking:", error);
        index = index + 1;
        currentIndex = index;
        await sendGoal(currentIndex);
      }
    } else if (currentGoal["positionId"] === "Wait") {
      setTimeout(async () => {
        index = index + 1;
        currentIndex = index;
        await sendGoal(currentIndex);
      }, currentGoal["waitTime"] * 1000);
    }
    else if (currentGoal["positionId"] === "Drop") {
      console.log("Inside drop");
      try {
        const dropPositionId = currentGoal["dropPositionId"];
        if (!dropPositionId) {
          throw new Error("Drop position ID not provided.");
        }
        drop = true
        await enableDocking('Drop', dropPositionId)
        // const dropPositionDoc = await collection_pose.findOne({ _id: dropPositionId });
        // const dropPoseData = dropPositionDoc.amclData

        // const position = dropPoseData.pose.pose.position;
        // const orientation = dropPoseData.pose.pose.orientation;
        // const positionVec = new ROSLIB.Vector3(position);
        // const orientationQuat = new ROSLIB.Quaternion(orientation);

        // const pose = new ROSLIB.Pose({
        //   position: positionVec,
        //   orientation: orientationQuat,
        // });

        // const goal = new ROSLIB.Goal({
        //   actionClient: actionClient,
        //   goalMessage: {
        //     target_pose: {
        //       header: { frame_id: "map" },
        //       pose: pose,
        //     },
        //   },
        // });

        // goal.on("feedback", (feedback) => {
        //   console.log("Received feedback from action server:", feedback);
        // });

        // goal.send();

        // move_baseListener.subscribe(async (actionResult) => {
        //   if (actionResult.status.status === 3 && !missionpauseFlag) {
        //     // index++;
        //     // index = index + 1;
        //     // currentIndex = index;
        //     io.emit("indexUpdate", { status: "Completed", index: index });
        //     // sendGoal(currentIndex);
        //     await enableDocking('Drop', dropPositionId)
        //   } else if (actionResult.status.status === 4) {
        //     if (retryCount < maxRetries) {
        //       retryCount++;
        //       sendGoal(currentIndex);
        //     } else {
        //       io.emit("indexUpdate", { status: "Aborted", index: index });
        //       retryCount = 0;
        //     }
        //   }
        // });



      } catch (error) {
        console.error("Error fetching Drop position data:", error.message);
        // currentIndex = index + 1;
        // await sendGoal(currentIndex);
      }
    }

    else {
      console.log("starting the goal mission");
      const [position, orientation] = currentGoal;
      const positionVec = new ROSLIB.Vector3(position);
      const orientationQuat = new ROSLIB.Quaternion(orientation);

      const pose = new ROSLIB.Pose({
        position: positionVec,
        orientation: orientationQuat,
      });

      const goal = new ROSLIB.Goal({
        actionClient: actionClient,
        goalMessage: {
          target_pose: {
            header: { frame_id: "map" },
            pose: pose,
          },
        },
      });

      goal.on("feedback", (feedback) => {
        console.log("Received feedback from action server:", feedback);
      });

      // goal.on("result", (result) => {
      //   console.log("result in else",result.status)
      //   console.log("resulttt", result)
      //   if (result.status === 3) {
      //     console.log("incrementing index for next postion")
      //     sendGoal(index + 1);
      //   } else {
      //     console.warn("Goal failed or was aborted by action server.");
      //   }
      // });
      goal.send();
    }
  } else {
    console.log(missionpauseFlag, missionExecutionQueue.length, index)
    console.log("❌ No valid goal at index", index, ". Ending mission.");
    console.log("🧾 Final missionExecutionQueue:", missionExecutionQueue);

    // handleMissionComplete();
  }
}

var move_baseListener = new ROSLIB.Topic({
  ros: ros,
  name: "/move_base/result",
  messageType: "move_base_msgs/MoveBaseActionResult",
});

let retryCount = 0;
const maxRetries = 4;

move_baseListener.subscribe(async (actionResult) => {

  console.log('Drop', drop)
  if (actionResult.status.status === 3 && !missionpauseFlag && drop == false) {
    // index++;
    index = index + 1;
    currentIndex = index;
    io.emit("indexUpdate", { status: "Completed", index: index });
    await sendGoal(currentIndex);
  } else if (actionResult.status.status === 4) {
    if (retryCount < maxRetries) {
      retryCount++;
      await sendGoal(currentIndex);
    } else {
      io.emit("indexUpdate", { status: "Aborted", index: index });
      retryCount = 0;
    }
  }
});

// const updateMissionStatusInDatabase = async (missionName, status) => {
//   try {
//     if (missionName === "No active task") {
//       return;
//     }
//     const now = new Date();
//     const localDateTime = now.toLocaleString("en-GB", {
//       year: "numeric",
//       month: "2-digit",
//       day: "2-digit",
//       hour: "2-digit",
//       minute: "2-digit",
//       second: "2-digit",
//       hour12: false,
//     });
//     const [date, time] = localDateTime.split(", ");
//     const formattedDateTime = `${date.replace(/\//g, "-")} ${time}`;
//     const document = {
//       missionName: missionName,
//       status: status,
//       completionDateTime: formattedDateTime,
//     };
//     await collection_missionHistory.insertOne(document);
//   } catch (error) {
//     console.error("Error updating mission status:", error);
//   }
// };

function terminateProcess(processName) {
  const apiUrl = "http://192.168.5.10:5000/terminate";

  if (!navigationRunning) {
    console.log("Navigation is already terminated");
    return;
  }
  axios
    .post(`${apiUrl}/${processName}`)
    .then((response) => {
      console.log(response.data);
      navigationRunning = false;
    })
    .catch((error) => {
      console.error(error);
    });
  console.log("terminating the process", processName);
}

const saveAlarmToDB = async (name, message) => {
  const newAlarm = {
    name: name,
    message: message,
    time: new Date(),
  };
  console.log("newalarm", newAlarm);
  try {
    await collection_alarms.insertOne(newAlarm);
  } catch (err) {
    console.error("error", err);
  }
  console.log("saving to the db", name, message);
};

const handleFaultyProcess = (processName, message) => {
  if (processStates[processName].isHealthy) {
    processStates[processName].isHealthy = false;
    io.emit("cancelMission", { missionName: `${processName} failed` });
    terminateProcess("navigation");
    console.log(processName, 'is not working as expected');
    io.emit("Alarm", { message: message });
    saveAlarmToDB(processName, message);
  } else {
    // console.log(`Process ${processName} is already in a faulty state`)
    return;
  }
};

const motorHealthTopic = new ROSLIB.Topic({
  ros: ros,
  name: "/motor_health",
  messageType: "std_msgs/String",
});
motorHealthTopic.subscribe((message) => {
  if (message.data !== "motor is healthy") {
    handleFaultyProcess("motor", message.data);
  } else {
    processStates.motor.isHealthy = true;
    // console.log("Motor is healthy again");
  }
});

const lidarStatusTopic = new ROSLIB.Topic({
  ros: ros,
  name: "/lidar_status1",
  messageType: "std_msgs/String",
});
lidarStatusTopic.subscribe((message) => {
  if (message.data != "lidar is healthy") {
    handleFaultyProcess("lidar", message.data);
  } else {
    processStates.lidar.isHealthy = true;
    // console.log('Lidar is healthy again');
  }
});

const cameraStatusTopic = new ROSLIB.Topic({
  ros: ros,
  name: "/camera_status1",
  messageType: "std_msgs/String",
});
cameraStatusTopic.subscribe((message) => {
  if (message.data != "camera is healthy") {
    handleFaultyProcess("camera", message.data);
  } else {
    processStates.camera.isHealthy = true;
    // console.log('Camera is healthy again');
  }
});

const imuStatusTopic = new ROSLIB.Topic({
  ros: ros,
  name: "/imu_status",
  messageType: "std_msgs/String",
});
imuStatusTopic.subscribe((message) => {
  if (message.data != "IMU OK") {
    handleFaultyProcess("imu", message.data);
  } else {
    processStates.imu.isHealthy = true;
    // console.log("imu is healthy again");
  }
});

const pauseMission = new ROSLIB.Topic({
  ros: ros,
  name: "move_base/cancel",
  messageType: "actionlib_msgs/GoalID",
});

pauseMission.subscribe(() => {
  if (!drop)
    missionpauseFlag = true;
});

const cancelMessage = new ROSLIB.Message();

const abortDock = new ROSLIB.Param({
  ros: ros,
  name: "/distance_goal_qr",
});

io.on("connection", (socket) => {
  // console.log("User connected in socket");

  socket.on("pauseMission", () => {
    console.log("using pause mission")
    pauseMission.publish(cancelMessage);
    missionpauseFlag = true;
    navigationParam.set(3)
    if (dockingFlag) dockingFlag = false;
    // abortDock.set(0);
    console.log("Docking stopped");
    io.emit("updatePausedBtnText", " paused ");
  });

  socket.on("playMission", () => {
    console.log("using play mission")
    missionpauseFlag = false;
    navigationParam.set(2)
    if (!dockingFlag) dockingFlag = true;
    io.emit("updatePausedBtnText", "Playing");
    sendGoal(currentIndex);
  });

  socket.on("cancelMission", async (data) => {
    missionExecutionQueue = [];
    // index = 0;
    missionCancelFlag = true;
    missionpauseFlag = false;
    //
    dockingFlag = false;
    var goal = new ROSLIB.Goal({
      actionClient: actionClient,
      goalMessage: {
        target_pose: {
          header: {
            frame_id: "map",
          },
        },
      },
    });
    goal.cancel();
    pauseMission.publish(cancelMessage);
    navigationParam.set(1)

    // if (dockingFlag) {
    abortDock.set(0);
    // dockingFlag = false;
    // }

    io.emit("updatecanceledBtnText", " Canceled ");
    const { missionName, status } = data;
    // await updateMissionStatusInDatabase(missionName, "Aborted");
    sendStatusUpdateToFrontend(missionName, "Aborted"); // Send status update
  });


  socket.on("setMissionParam", (status) => {
    const missionParam = new ROSLIB.Param({
      ros: ros,
      name: "pauseplay"
    });
    console.log("status of pause and play")
    missionParam.set(status);
    console.log("Set ROS param mission to:", status);

    // Optionally broadcast to all frontends too:
    io.emit("missionStatus", status);
  });


  // socket.on("updatePausedBtnText", (text) => {
  //   console.log(`Updating paused button text to: ${text}`);
  //   io.emit("updatePausedBtnText", text); // Broadcast the event to all connected clients
  // });

  // Listen for missionComplete event from the frontend
  socket.on("missionComplete1", async (data) => {
    console.log('The backend has recieved the mission completion status')
    const { missionName } = data;
    navigationParam.set(1)

    // Set status as 'completed' for missionComplete
    // await updateMissionStatusInDatabase(missionName, "Completed");
    sendStatusUpdateToFrontend(missionName, "Completed"); // Send status update
  });

  // Socket for getting mapName from ui and sending it to all the ui's

  socket.on("selectedMapName", async (data) => {
    currentMapName = data;
    navigationRunning = true;

    if (currentMapName) {
      io.emit("broadcastMapName", data);
    }
  });

  socket.on("removeMapNameFromBackendServer", () => {
    currentMapName = "";
    navigationRunning = false;
    if (!currentMapName) io.emit("removeMapNameFromAllClients", currentMapName);
  });

  socket.on("disconnect", () => {
    // console.log("User Disconnected");
  });
});

server.listen(port, () => {
  console.log("Server listening on", port);
});

// Docking action client server configuration
function enableDocking(dockingParameter, dropPoseData) {
  abortDock.set(1);
  dockingFlag = true;
  let actionName = "hw_t/aruco_detectAction";
  let serverName = "";
  let detection = 1;
  if (dockingParameter === "Load-Conveyor") {
    serverName = "/Table_dock";
  } else if (dockingParameter === "Unload-Conveyor") {
    serverName = "/Table_dock";
  } else if (dockingParameter === "Docking") {
    serverName = "/Table_dock";
  } else if (dockingParameter === "Back" || dockingParameter === "Exit-Docking") {
    serverName = "/back";
    detection = 1;
  } else if (dockingParameter === "Cobot" || dockingParameter === "Inspect") {
    serverName = "/Table_dock";
  } else if (dockingParameter === "cobotOperation") {
    serverName = "/scan_component";
    actionName = "robot_control/aruco_detectAction";
  } else if (dockingParameter === "InspectOperation") {
    serverName = "/scan_component";
    actionName = "robot_control/aruco_detectAction";
    detection = 2;
  } else if (dockingParameter === "Lift-Up") {
    serverName = "/Lift";
    detection = 1;
  } else if (dockingParameter === "Lift-Down") {
    serverName = "/Lift";
    detection = 0;
  } else if (dockingParameter === "Drop") {
    actionName = "hw_t/StringGoalAction";
    serverName = "/Drop";
    detection = dropPoseData;
  }

  const dockingClient = new ROSLIB.ActionClient({
    ros: ros,
    serverName: serverName,
    actionName: actionName,
  });


  return new Promise((resolve, reject) => {
    dockingGoal = new ROSLIB.Goal({
      actionClient: dockingClient,
      goalMessage: {
        detect: detection,
      },
    });

    dockingGoal.send();

    dockingGoal.on("feedback", (feedback) => {
      console.log("Docking feedback received:", feedback);
    });

    dockingGoal.on("result", async (result) => {

      if (!result) {
        console.error("No result received from docking server.");
        reject("No result received.");
        return;
      }

      console.log("Docking result received:", result);
      if (result && (result.distance_reached || result.status)) {
        await loadConveyor(dockingParameter);
        await unloadConveyor(dockingParameter);
        await handleCobot(dockingParameter);
        await handleInspection(dockingParameter);
        await handleLiftUp(dockingParameter);
        await handleLiftDown(dockingParameter);

        console.log("Docking is achieved, obtained result , for ", dockingParameter);
        console.log('this is the docking paramter', dockingParameter)
        if (
          dockingParameter === "Docking" ||
          dockingParameter === "Exit-Docking" ||
          dockingParameter === "Drop"
        ) {
          index = index + 1;
          console.log("current index", index)
          currentIndex = index;
          drop = false;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await sendGoal(currentIndex);
          console.log("current index after sending goal", currentIndex)
        }
        resolve(result.distance_reached);
      } else {
        console.warn(
          "Docking action did not return expected result. Rejecting."
        );

        reject("Docking action failed or did not return expected result");
        // await loadConveyor(dockingParameter);
        // await unloadConveyor(dockingParameter);
        // await handleCobot(dockingParameter);
        // await handleInspection(dockingParameter);
        // await handleLiftUp(dockingParameter);
        // await handleLiftDown(dockingParameter);
      }
    });

    dockingGoal.on("timeout", () => {
      console.warn("Docking action timed out.");
      reject("Docking action timed out.");
    });
  });
}

async function handleCobot(dockingParameter) {
  if (dockingParameter !== "Cobot") return;
  try {
    await enableDocking("cobotOperation");
    await enableDocking("Back");
    index = index + 1;
    currentIndex = index;
    await sendGoal(currentIndex);
  } catch (err) {
    console.error("Error in cobot insertion function:", err);
  }
}

async function handleInspection(dockingParameter) {
  if (dockingParameter !== "Inspect") return;
  try {
    await enableDocking("InspectOperation");
    await enableDocking("Back");
    index = index + 1;
    currentIndex = index;
    await sendGoal(currentIndex);
  } catch (err) {
    console.error("Error in cobot inspection function", err);
  }
}

async function handleLiftUp(dockingParameter) {
  if (dockingParameter !== "Lift-Up") return;
  try {
    index = index + 1;
    currentIndex = index;
    await sendGoal(currentIndex);
  } catch (err) {
    console.error("Error in Lift Up function", err);
  }
}

async function handleLiftDown(dockingParameter) {
  if (dockingParameter !== "Lift-Down") return;
  try {
    index = index + 1;
    currentIndex = index;
    await sendGoal(currentIndex);
  } catch (err) {
    console.error("Error in Lift Down function", err);
  }
}


async function loadConveyor(dockingParameter) {
  if (dockingParameter === "Load-Conveyor") {
    try {
      await taurusClient.connect();
      console.log("Connected to Taurus Redis client");

      await conveyorClient.connect();
      console.log("Connected to Conveyor Redis client");

      await taurusClient.set("conveyor", "pick");
      await conveyorClient.set("conveyor", "forward");

      const interval = setInterval(async () => {
        try {
          const value = await taurusClient.get("conveyor");
          if (value === "done") {
            clearInterval(interval);

            await taurusClient.quit();
            console.log("Taurus Redis client closed");

            await conveyorClient.quit();
            console.log("Conveyor Redis client closed");

            await enableDocking("Back");
            index = index + 1;
            currentIndex = index;
            await sendGoal(currentIndex);
          }
        } catch (error) {
          console.error("Error during interval execution:", error);
        }
      }, 1000);
    } catch (error) {
      console.error("Error in load Conveyor function:", error);
    }
  } else {
    console.warn(`${dockingParameter} docking parameter provided`);
    return;
  }
}

async function unloadConveyor(dockingParameter) {
  if (dockingParameter === "Unload-Conveyor") {
    try {
      await taurusClient.connect();
      console.log("Connected to Taurus Redis client");

      await conveyorClient.connect();
      console.log("Connected to Conveyor Redis client");

      await taurusClient.set("conveyor", "drop");
      await conveyorClient.set("conveyor", "reverse");

      const interval = setInterval(async () => {
        try {
          const value = await taurusClient.get("conveyor");
          if (value === "done") {
            clearInterval(interval);

            await taurusClient.quit();
            console.log("Taurus Redis client closed");

            await conveyorClient.quit();
            console.log("Conveyor Redis client closed");

            await enableDocking("Back");
            index = index + 1;
            currentIndex = index;
            await sendGoal(currentIndex);
          }
        } catch (error) {
          console.error("Error during interval execution:", error);
        }
      }, 1000);
      console.log("Unload conveyor ran successfully");
    } catch (error) {
      console.error("Error in unloadConveyor function:", error);
    }
  } else {
    console.warn(`${dockingParameter} docking parameter provided`);
    return;
  }
}

// Adding a comment for visibility sunday_16 branch


// cobot Functionalities

async function writeValue(nodeId, targetIndex, value, fullArray, session) {
  fullArray[targetIndex] = value;
  const writeValue = {
    nodeId,
    attributeId: AttributeIds.Value,
    value: {
      value: {
        dataType: "Int16",
        arrayType: VariantArrayType.Array,
        value: fullArray,
      },
    },
  };

  const statusCode = await session.write([writeValue]);
  return statusCode[0].isGood();
}

async function handleRobotAction(shouldHold) {
  // Use the correct 'cobotClient' variable here
  await cobotClient.connect(endpointUrl);
  const session = await cobotClient.createSession();  // Corrected: Use 'cobotClient'

  const nodeId = "ns=1;i=304";
  const dataValue = await session.readVariableValue(nodeId);
  const fullArray = dataValue.value.value;

  if (shouldHold) {
    await writeValue(nodeId, 1, 0, fullArray, session);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await writeValue(nodeId, 1, 1, fullArray, session);
    await writeValue(nodeId, 5, 1, fullArray, session);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await writeValue(nodeId, 5, 0, fullArray, session);
  }

  await session.close();
  await cobotClient.disconnect();  // Corrected: Use 'cobotClient'
}

app.post("/connect-to-robot", async (req, res) => {
  const { hold } = req.body;

  try {
    await handleRobotAction(hold);
    res.status(200).json({ message: `Successfully ${hold ? "held" : "released"} the robot.` });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to perform robot action." });
  }
});
