#include "moons_hardware/hw_interface.hpp"
#include <chrono>
#include <cmath>
#include <sstream>
#include "pluginlib/class_list_macros.hpp"
#include "moons_hardware/moonsModbus.hpp"




using namespace std::chrono_literals;

#define DEG2RAD 0.017453292519943295
#define RAD2DEG 57.29577951308232

namespace taurus_hw
{

// Note: destructor removed from here. Cleanup is done in on_cleanup().

// hardware_interface::CallbackReturn TaurusHardware::on_init(
//   const hardware_interface::HardwareInfo & info)
// {
//   if (hardware_interface::SystemInterface::on_init(info) != hardware_interface::CallbackReturn::SUCCESS) {
//     RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Base SystemInterface on_init failed");
//     return hardware_interface::CallbackReturn::ERROR;
//   }

//   // read hardware parameters (if provided in ros2_control hardware section)
//   if (info_.hardware_parameters.count("device")) device_ = info_.hardware_parameters.at("device");
//   if (info_.hardware_parameters.count("baud")) baud_ = std::stoi(info_.hardware_parameters.at("baud"));
//   if (info_.hardware_parameters.count("l_inv")) l_inv_ = std::stoi(info_.hardware_parameters.at("l_inv"));
//   if (info_.hardware_parameters.count("r_inv")) r_inv_ = std::stoi(info_.hardware_parameters.at("r_inv"));
//   if (info_.hardware_parameters.count("gear_ratio")) gear_ratio_ = std::stoi(info_.hardware_parameters.at("gear_ratio"));
//   if (info_.hardware_parameters.count("counts_per_rev")) counts_per_rev_ = std::stod(info_.hardware_parameters.at("counts_per_rev"));

//   if (info_.hardware_parameters.count("example_param_hw_start_duration_sec"))
//     hw_start_sec_ = std::stod(info_.hardware_parameters.at("example_param_hw_start_duration_sec"));
//   if (info_.hardware_parameters.count("example_param_hw_stop_duration_sec"))
//     hw_stop_sec_ = std::stod(info_.hardware_parameters.at("example_param_hw_stop_duration_sec"));

//   // join names from URDF / ros2_control
//   for (const auto & joint : info_.joints) {
//     joint_names_.push_back(joint.name);
//   }
//   if (joint_names_.size() < 2) {
//     RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Expect at least 2 joints in hardware info");
//     return hardware_interface::CallbackReturn::ERROR;
//   }

//   // initialize sttaurus_hardwareorage
//   for (const auto & name : joint_names_) {
//     joint_position_[name] = 0.0;
//     joint_velocity_[name] = 0.0;
//     joint_command_[name] = 0.0;
//   }

//   // init encoder/vel arrays
//   enc_counts_.assign(2, 0);
//   vel_counts_.assign(2, 0);

//   // instantiate direct Modbus wrapper
//   moons_ = std::make_shared<Moons>(); // must have a public default ctor
  
//   if (!moons_->isConnected()) {
//     RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"),
//                  "Moons motor controller not connected.");
//     return hardware_interface::CallbackReturn::ERROR;
// }
//   if (!moons_) {
//     RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Failed to instantiate Moons modbus wrapper");
//     return hardware_interface::CallbackReturn::ERROR;
//   }

//   RCLCPP_INFO(rclcpp::get_logger("TaurusHardware"),
//               "TaurusHardware initialized device=%s baud=%d l_inv=%d r_inv=%d gear=%d counts=%f",
//               device_.c_str(), baud_, l_inv_, r_inv_, gear_ratio_, counts_per_rev_);

//   return hardware_interface::CallbackReturn::SUCCESS;
// }
hardware_interface::CallbackReturn TaurusHardware::on_init(
  const hardware_interface::HardwareInfo & info)
{
  // save info (important)
  info_ = info;

  if (hardware_interface::SystemInterface::on_init(info) !=
      hardware_interface::CallbackReturn::SUCCESS) {
    RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Base SystemInterface on_init failed");
    return hardware_interface::CallbackReturn::ERROR;
  }

  // read hardware parameters (if provided in ros2_control hardware section)
  if (info_.hardware_parameters.count("device")) device_ = info_.hardware_parameters.at("device");
  if (info_.hardware_parameters.count("baud")) baud_ = std::stoi(info_.hardware_parameters.at("baud"));
  if (info_.hardware_parameters.count("l_inv")) l_inv_ = std::stoi(info_.hardware_parameters.at("l_inv"));
  if (info_.hardware_parameters.count("r_inv")) r_inv_ = std::stoi(info_.hardware_parameters.at("r_inv"));
  if (info_.hardware_parameters.count("gear_ratio")) gear_ratio_ = std::stoi(info_.hardware_parameters.at("gear_ratio"));
  if (info_.hardware_parameters.count("counts_per_rev")) counts_per_rev_ = std::stod(info_.hardware_parameters.at("counts_per_rev"));

  if (info_.hardware_parameters.count("example_param_hw_start_duration_sec"))
    hw_start_sec_ = std::stod(info_.hardware_parameters.at("example_param_hw_start_duration_sec"));
  if (info_.hardware_parameters.count("example_param_hw_stop_duration_sec"))
    hw_stop_sec_ = std::stod(info_.hardware_parameters.at("example_param_hw_stop_duration_sec"));

  // join names from URDF / ros2_control
  for (const auto & joint : info_.joints) {
    joint_names_.push_back(joint.name);
  }
  if (joint_names_.size() < 2) {
    RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Expect at least 2 joints in hardware info");
    return hardware_interface::CallbackReturn::ERROR;
  }

  // initialize storage
  for (const auto & name : joint_names_) {
    joint_position_[name] = 0.0;
    joint_velocity_[name] = 0.0;
    joint_command_[name] = 0.0;
  }

  // init encoder/vel arrays
  enc_counts_.assign(2, 0);
  vel_counts_.assign(2, 0);

  // instantiate direct Modbus wrapper — pass device and baud from params (preferred)
  try {
    moons_ = std::make_shared<Moons>();  // requires Moons(string,int) ctor
  } catch (const std::exception &e) {
    RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Failed to create Moons: %s", e.what());
    return hardware_interface::CallbackReturn::ERROR;
  }

  if (!moons_) {
    RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"), "Failed to instantiate Moons modbus wrapper");
    return hardware_interface::CallbackReturn::ERROR;
  }

  // now check connection
  if (!moons_->isConnected()) {
    RCLCPP_FATAL(rclcpp::get_logger("TaurusHardware"),
                 "Moons motor controller not connected (device=%s baud=%d).",
                 device_.c_str(), baud_);
    return hardware_interface::CallbackReturn::ERROR;
  }

  RCLCPP_INFO(rclcpp::get_logger("TaurusHardware"),
              "TaurusHardware initialized device=%s baud=%d l_inv=%d r_inv=%d gear=%d counts=%f",
              device_.c_str(), baud_, l_inv_, r_inv_, gear_ratio_, counts_per_rev_);

  return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn TaurusHardware::on_configure(const rclcpp_lifecycle::State &)
{
  // nothing heavy here
  return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn TaurusHardware::on_cleanup(const rclcpp_lifecycle::State &)
{
  // cleanup hardware resourcescomplete
  if (moons_) {
    moons_->end();  // ensure Moons performs any required cleanup
    moons_.reset();
  }
  return hardware_interface::CallbackReturn::SUCCESS;
}

// hardware_interface::CallbackReturn TaurusHardware::on_activate(const rclcpp_lifecycle::State &)
// {
//   // bring commands to current state
//   for (const auto & name : joint_names_) {
//     joint_command_[name] = joint_position_[name];
//   }
//   return hardware_interface::CallbackReturn::SUCCESS;
// }
hardware_interface::CallbackReturn
TaurusHardware::on_activate(const rclcpp_lifecycle::State &)
{
    for (const auto & name : joint_names_)
        joint_command_[name] = 0.0;

    moons_->resetAlarm();

    moons_->setEncoder({0,0});

    moons_->startJog();

    moons_->setSpeed(3,0,0);

    RCLCPP_INFO(
        rclcpp::get_logger("TaurusHardware"),
        "Motors are now in JOG mode.");

    return hardware_interface::CallbackReturn::SUCCESS;
}

hardware_interface::CallbackReturn TaurusHardware::on_deactivate(const rclcpp_lifecycle::State &)
{
  // optionally stop motors
  return hardware_interface::CallbackReturn::SUCCESS;
}

std::vector<hardware_interface::StateInterface> TaurusHardware::export_state_interfaces()
{
  std::vector<hardware_interface::StateInterface> state_interfaces;
  for (const auto & name : joint_names_) {
    state_interfaces.emplace_back(hardware_interface::StateInterface(name, "position", &joint_position_[name]));
    state_interfaces.emplace_back(hardware_interface::StateInterface(name, "velocity", &joint_velocity_[name]));
  }
  return state_interfaces;
}

std::vector<hardware_interface::CommandInterface> TaurusHardware::export_command_interfaces()
{
  std::vector<hardware_interface::CommandInterface> cmd_interfaces;
  for (const auto & name : joint_names_) {
    cmd_interfaces.emplace_back(hardware_interface::CommandInterface(name, "velocity", &joint_command_[name]));
  }
  return cmd_interfaces;
}

hardware_interface::return_type TaurusHardware::read(const rclcpp::Time & /*time*/, const rclcpp::Duration & /*period*/)
{
  // Directly read encoders and velocity counts from device via Moons wrapper
  // Addresses same as your ROS1 code: enc long at 10, velocity at 16 (signed 16-bit)
  int32_t prev1 = enc_counts_[0];
  int32_t prev2 = enc_counts_[1];

  // NOTE: longRead and readRegister must be PUBLIC in your Moons wrapper header
  int32_t enc1 = moons_->longRead(10, 1, false, prev1);
  int32_t enc2 = moons_->longRead(10, 2, false, prev2);
  enc_counts_[0] = enc1;
  enc_counts_[1] = enc2;

  int32_t vel1_counts = moons_->readRegister(16, 1, true);
  int32_t vel2_counts = moons_->readRegister(16, 2, true);
  vel_counts_[0] = vel1_counts;
  vel_counts_[1] = vel2_counts;



  // Apply inversion - exactly as your ROS1 code (apply inversion when reading)
  enc1 *= l_inv_;
  enc2 *= r_inv_;
  vel1_counts *= l_inv_;
  vel2_counts *= r_inv_;

  // Convert to degrees and then to radians: same formula as ROS1
  double deg1 = (static_cast<double>(enc1) * 360.0) / (counts_per_rev_ * static_cast<double>(gear_ratio_));
  double deg2 = (static_cast<double>(enc2) * 360.0) / (counts_per_rev_ * static_cast<double>(gear_ratio_));

  double vel_deg1 = (360.0 * static_cast<double>(vel1_counts)) / (240.0 * static_cast<double>(gear_ratio_));
  double vel_deg2 = (360.0 * static_cast<double>(vel2_counts)) / (240.0 * static_cast<double>(gear_ratio_));

  // store in ROS state (radians)
  joint_position_[joint_names_[0]] = deg1 * DEG2RAD;
  joint_position_[joint_names_[1]] = deg2 * DEG2RAD;
  joint_velocity_[joint_names_[0]] = vel_deg1 * DEG2RAD;
  joint_velocity_[joint_names_[1]] = vel_deg2 * DEG2RAD;

static rclcpp::Clock steady_clock(RCL_STEADY_TIME);



  RCLCPP_DEBUG(rclcpp::get_logger("TaurusHardware"),
               "Read enc: %d %d => deg: %.3f %.3f rad: %.3f %.3f vel_counts: %d %d",
               enc1, enc2, deg1, deg2,
               joint_position_[joint_names_[0]], joint_position_[joint_names_[1]],
               vel_counts_[0], vel_counts_[1]);

  return hardware_interface::return_type::OK;
}

hardware_interface::return_type TaurusHardware::write(const rclcpp::Time & /*time*/, const rclcpp::Duration & /*period*/)
{
  // Get commanded velocities in rad/s -> convert to deg/s
  double cmd_rad_l = joint_command_[joint_names_[0]];
  double cmd_rad_r = joint_command_[joint_names_[1]];
  double cmd_deg_l = cmd_rad_l * RAD2DEG;
  double cmd_deg_r = cmd_rad_r * RAD2DEG;

  // conversion to device integer value using exact formula from ROS1:
  // deg_int = round((deg_per_sec / 360) * 240 * gear_ratio)
  long deg_int_l = static_cast<long>(std::round((cmd_deg_l / 360.0) * 240.0 * static_cast<double>(gear_ratio_)));
  long deg_int_r = static_cast<long>(std::round((cmd_deg_r / 360.0) * 240.0 * static_cast<double>(gear_ratio_)));

  // Apply inversion when writing exactly as in your ROS1 setSpeed
  long write_l = deg_int_l * l_inv_;
  long write_r = deg_int_r * r_inv_;

  // longWrite must be PUBLIC and returns void in your current header — call it directly
  moons_->longWrite(342, static_cast<int32_t>(write_l), 1);
  moons_->longWrite(342, static_cast<int32_t>(write_r), 2);

  RCLCPP_DEBUG(rclcpp::get_logger("TaurusHardware"),
               "Wrote motor values L=%ld R=%ld (after inversion)", write_l, write_r);
// RCLCPP_INFO(
//     rclcpp::get_logger("TaurusHardware"),
//     "Wrote motor values L=%ld R=%ld (after inversion)",
//     write_l,
//     write_r);
  return hardware_interface::return_type::OK;
}

} // namespace taurus_hw

PLUGINLIB_EXPORT_CLASS(taurus_hw::TaurusHardware, hardware_interface::SystemInterface)
