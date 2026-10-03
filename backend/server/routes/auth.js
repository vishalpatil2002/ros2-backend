const router = require("express").Router();
const { User } = require("../models/user");
const logs = require("../models/Logs");
const bcrypt = require("bcrypt");
const Joi = require("joi");

const loggedIn = [];
const isLogged = false;

router.post("/", async (req, res) => {
  try {
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    const user = await User.findOne({ email: req.body.email });
    console.log("userrrr", user);
    if (!user)
      return res.status(401).send({ message: "Invalid Email or Password" });

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword)
      return res.status(401).send({ message: "Invalid Email or Password" });

    const salt = await bcrypt.genSalt(Number(process.env.SALT));
    const hashrole = await bcrypt.hash(user.role, salt);

    const token = user.generateAuthToken();

    console.log("tokeeenn", token);
    console.log("roleee", user.role);

    // Adding logged In user's details into a stack for session management
    loggedIn.push({
      userName: user.firstName,
      role: user.role,
      isJoysticBeingkUsed: false,
    });

    // Save login log
    await logs.create({
      userId: user._id,
      userName: user.firstName,
      role: user.role,
      event: "login",
      timestamp: new Date(),
    });

    res.status(200).send({
      // send userName also
      data: token,
      role: user.role,
      id: user._id,
      UserName: user.firstName,
      Email: user.email,
      message: "logged in successfully",
    });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});
router.post("/logout", async (req, res) => {
  try {
    console.log(req.body.UserId);
    console.log("Logging OuTTTTT");
    const user = await User.findById(req.body.UserId);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    const newLog = new logs({
      userName: user.firstName,
      role: user.role,
      event: "Logout",
      timestamp: new Date(),
    });

    await newLog.save();

    res.status(200).send({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

const validate = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
  });
  return schema.validate(data);
};

module.exports = router;
