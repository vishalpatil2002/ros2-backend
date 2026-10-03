const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["OEM", "Supervisor", "Operator"],
    default: "",
  },
});

userSchema.methods.generateAuthToken = function () {
  const token = jwt.sign({ _id: this._id }, process.env.JWTPRIVATEKEY, {
    expiresIn: "7d",
  });
  return token;
};

const User = mongoose.model("user", userSchema);

const validate = (data) => {
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
  if (!data.role || !["OEM", "Supervisor", "Operator"].includes(data.role)) {
    errors.role = "Role must be one of OEM, Supervisor, or Operator.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
};

module.exports = { User, validate };
