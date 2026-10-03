const router = require("express").Router();
const { User, validate } = require("../models/user");
const bcrypt = require("bcrypt");

router.post("/", async (req, res) => {
  try {
    const { errors, isValid } = validate(req.body);
    if (!isValid) {
      console.error("Validation Error:", errors);
      return res
        .status(400)
        .send({ message: Object.values(errors).join(", ") });
    }

    const user = await User.findOne({ email: req.body.email });
    if (user) {
      console.error("User already exists with email:", req.body.email);
      return res
        .status(409)
        .send({ message: "User with given email already exists!" });
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT));
    const hashPassword = await bcrypt.hash(req.body.password, salt);

    await new User({ ...req.body, password: hashPassword }).save();
    res.status(201).send({ message: "User created successfully" });
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

module.exports = router;
