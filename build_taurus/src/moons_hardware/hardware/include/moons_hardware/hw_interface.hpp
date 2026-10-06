#ifndef HW_T_HARDWARE_INTERFACE_HPP
#define HW_T_HARDWARE_INTERFACE_HPP

#include <vector>
#include <string>
#include <map>
#include <rclcpp/rclcpp.hpp>
#include <hardware_interface/system_interface.hpp>
#include <hardware_interface/types/hardware_interface_type_values.hpp>
#include <hardware_interface/handle.hpp>
#include <hardware_interface/hardware_info.hpp>
#include <hardware_interface/hardware_component_info.hpp>
#include <rclcpp_lifecycle/state.hpp>
#include "moons_hardware/moonsModbus.hpp"


namespace taurus_hw
{
class TaurusHardware : public hardware_interface::SystemInterface
{
public:
  RCLCPP_SHARED_PTR_DEFINITIONS(TaurusHardware)

  hardware_interface::CallbackReturn on_init(const hardware_interface::HardwareInfo & info) override;

  hardware_interface::CallbackReturn on_activate(const rclcpp_lifecycle::State & previous_state) override;

  hardware_interface::CallbackReturn on_deactivate(const rclcpp_lifecycle::State & previous_state) override;

  // Optional lifecycle callbacks (some ROS 2 distros don't require them)
  hardware_interface::CallbackReturn on_configure(const rclcpp_lifecycle::State & previous_state) override;
  hardware_interface::CallbackReturn on_cleanup(const rclcpp_lifecycle::State & previous_state) override;

  std::vector<hardware_interface::StateInterface> export_state_interfaces() override;
  std::vector<hardware_interface::CommandInterface> export_command_interfaces() override;

  hardware_interface::return_type read(const rclcpp::Time & time, const rclcpp::Duration & period) override;
  hardware_interface::return_type write(const rclcpp::Time & time, const rclcpp::Duration & period) override;

private:
  // --- Member Variables ---
  std::vector<std::string> joint_names_;
  std::map<std::string, double> joint_position_;
  std::map<std::string, double> joint_velocity_;
  std::map<std::string, double> joint_command_;

  std::vector<int32_t> enc_counts_;
  std::vector<int32_t> vel_counts_;

  std::string device_;
  int baud_;
  int l_inv_;
  int r_inv_;
  int gear_ratio_;
  double counts_per_rev_;
    double hw_start_sec_{0.0};
  double hw_stop_sec_{0.0};
  std::shared_ptr<Moons> moons_;
};
}  // namespace taurus_hw

#endif  // HW_T_HARDWARE_INTERFACE_HPP