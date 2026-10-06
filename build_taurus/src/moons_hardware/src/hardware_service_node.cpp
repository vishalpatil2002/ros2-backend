#include <rclcpp/rclcpp.hpp>
#include <std_srvs/srv/trigger.hpp>
#include <std_msgs/msg/string.hpp>

#include "moons_hardware/moonsModbus.hpp"

using std::placeholders::_1;
using std::placeholders::_2;

class HardwareServiceNode : public rclcpp::Node
{
public:
  HardwareServiceNode()
  : Node("hardware_service_node")
  {
    // Create Moons driver object
    moons_ = std::make_shared<Moons>();

    // ------------------------------------------------
    // QoS for status topic
    // ------------------------------------------------
    auto status_qos = rclcpp::QoS(10)
                        .reliable()
                        .transient_local();

    status_pub_ =
      this->create_publisher<std_msgs::msg::String>(
        "hardware/status",
        status_qos);

    publish_status("Hardware service node started");

    // ------------------------------------------------
    // Services
    // ------------------------------------------------

    start_jog_srv_ =
      this->create_service<std_srvs::srv::Trigger>(
        "start_jog",
        std::bind(&HardwareServiceNode::start_jog_cb,
                  this,
                  _1,
                  _2));

    stop_jog_srv_ =
      this->create_service<std_srvs::srv::Trigger>(
        "stop_jog",
        std::bind(&HardwareServiceNode::stop_jog_cb,
                  this,
                  _1,
                  _2));

    reset_alarm_srv_ =
      this->create_service<std_srvs::srv::Trigger>(
        "reset_alarm",
        std::bind(&HardwareServiceNode::reset_alarm_cb,
                  this,
                  _1,
                  _2));

    // ------------------------------------------------
    // Periodic status timer
    // ------------------------------------------------

    status_timer_ = this->create_wall_timer(
      std::chrono::seconds(1),
      std::bind(&HardwareServiceNode::timer_cb, this));

    RCLCPP_INFO(
      get_logger(),
      "Hardware services ready: /start_jog /stop_jog /reset_alarm");
  }

private:

  // ------------------------------------------------
  // Member variables
  // ------------------------------------------------

  std::shared_ptr<Moons> moons_;

  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr status_pub_;

  rclcpp::Service<std_srvs::srv::Trigger>::SharedPtr start_jog_srv_;
  rclcpp::Service<std_srvs::srv::Trigger>::SharedPtr stop_jog_srv_;
  rclcpp::Service<std_srvs::srv::Trigger>::SharedPtr reset_alarm_srv_;

  rclcpp::TimerBase::SharedPtr status_timer_;

  // ------------------------------------------------
  // Helper function
  // ------------------------------------------------

  void publish_status(const std::string & text)
  {
    std_msgs::msg::String msg;
    msg.data = text;
    status_pub_->publish(msg);
  }

  // ------------------------------------------------
  // Timer callback
  // ------------------------------------------------

  void timer_cb()
  {
    std::string status;

    if (moons_ && moons_->isConnected())
      status = "CONNECTED";
    else
      status = "DISCONNECTED";

    publish_status(status);

    RCLCPP_INFO(
      get_logger(),
      "Periodic hardware status: %s",
      status.c_str());
  }

  // ------------------------------------------------
  // START JOG SERVICE
  // ------------------------------------------------

  void start_jog_cb(
    const std::shared_ptr<std_srvs::srv::Trigger::Request>,
    std::shared_ptr<std_srvs::srv::Trigger::Response> response)
  {
    if (!moons_ || !moons_->isConnected())
    {
      response->success = false;
      response->message = "Moons driver not connected";
      return;
    }

    moons_->resetAlarm();

    moons_->setEncoder({0, 0});

    moons_->startJog();

    moons_->setSpeed(3, 0, 0);

    publish_status("JOG_STARTED");

    response->success = true;
    response->message = "Jog mode started";

    RCLCPP_INFO(get_logger(), "Jog mode started");
  }

  // ------------------------------------------------
  // STOP JOG SERVICE
  // ------------------------------------------------

  void stop_jog_cb(
    const std::shared_ptr<std_srvs::srv::Trigger::Request>,
    std::shared_ptr<std_srvs::srv::Trigger::Response> response)
  {
    if (!moons_ || !moons_->isConnected())
    {
      response->success = false;
      response->message = "Moons driver not connected";
      return;
    }

    moons_->setSpeed(3, 0, 0);

    moons_->stopJog();

    publish_status("JOG_STOPPED");

    response->success = true;
    response->message = "Jog mode stopped";

    RCLCPP_INFO(get_logger(), "Jog mode stopped");
  }

  // ------------------------------------------------
  // RESET ALARM SERVICE
  // ------------------------------------------------

  void reset_alarm_cb(
    const std::shared_ptr<std_srvs::srv::Trigger::Request>,
    std::shared_ptr<std_srvs::srv::Trigger::Response> response)
  {
    if (!moons_ || !moons_->isConnected())
    {
      response->success = false;
      response->message = "Moons driver not connected";
      return;
    }

    moons_->resetAlarm();

    publish_status("ALARM_RESET");

    response->success = true;
    response->message = "Alarm reset successful";

    RCLCPP_INFO(get_logger(), "Alarm reset successful");
  }
};

// ------------------------------------------------
// Main
// ------------------------------------------------

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);

  auto node = std::make_shared<HardwareServiceNode>();

  rclcpp::spin(node);

  rclcpp::shutdown();

  return 0;
}