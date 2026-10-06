#include <rclcpp/rclcpp.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <geometry_msgs/msg/twist_stamped.hpp>

#include <tf2/LinearMath/Quaternion.h>
#include <tf2/LinearMath/Matrix3x3.h>

#include <cmath>

class Rotate360Odom : public rclcpp::Node
{
public:
  Rotate360Odom() : Node("rotate_360_odom")
  {
    cmd_pub_ = create_publisher<geometry_msgs::msg::TwistStamped>(
      "/mobile_base_controller/cmd_vel", 10);

    odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
      "/mobile_base_controller/odom",
      10,
      std::bind(&Rotate360Odom::odomCallback, this, std::placeholders::_1));

    timer_ = create_wall_timer(
      std::chrono::milliseconds(20),
      std::bind(&Rotate360Odom::controlLoop, this));

    RCLCPP_INFO(get_logger(), "Waiting for odometry...");
  }

private:
  double normalizeAngle(double angle)
  {
    while (angle > M_PI)
      angle -= 2.0 * M_PI;

    while (angle < -M_PI)
      angle += 2.0 * M_PI;

    return angle;
  }

  void odomCallback(const nav_msgs::msg::Odometry::SharedPtr msg)
  {
    const auto &q_msg = msg->pose.pose.orientation;

    tf2::Quaternion q(q_msg.x, q_msg.y, q_msg.z, q_msg.w);

    double roll, pitch, yaw;
    tf2::Matrix3x3(q).getRPY(roll, pitch, yaw);

    current_yaw_ = yaw;

    if (!initialized_)
    {
      start_yaw_ = yaw;
      last_yaw_ = yaw;
      initialized_ = true;

      RCLCPP_INFO(get_logger(),
                  "Start yaw captured: %.2f deg",
                  start_yaw_ * 180.0 / M_PI);
    }
  }

  void controlLoop()
  {
    if (!initialized_ || finished_)
      return;

    double delta = normalizeAngle(current_yaw_ - last_yaw_);

    accumulated_yaw_ += delta;

    last_yaw_ = current_yaw_;

    geometry_msgs::msg::TwistStamped cmd;
    cmd.header.stamp = now();

    if (std::fabs(accumulated_yaw_) < 2.0 * M_PI)
    {
      cmd.twist.linear.x = 0.0;
      cmd.twist.angular.z = 0.18;

      cmd_pub_->publish(cmd);

      RCLCPP_INFO_THROTTLE(get_logger(),
                           *get_clock(),
                           1000,
                           "Rotated = %.2f deg",
                           accumulated_yaw_ * 180.0 / M_PI);
    }
    else
    {
      cmd.twist.linear.x = 0.0;
      cmd.twist.angular.z = 0.0;

      cmd_pub_->publish(cmd);

      finished_ = true;

      RCLCPP_INFO(get_logger(),
                  "360 degree rotation completed successfully");

      rclcpp::sleep_for(std::chrono::milliseconds(300));

      rclcpp::shutdown();
    }
  }

  rclcpp::Publisher<geometry_msgs::msg::TwistStamped>::SharedPtr cmd_pub_;
  rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
  rclcpp::TimerBase::SharedPtr timer_;

  bool initialized_ = false;
  bool finished_ = false;

  double start_yaw_ = 0.0;
  double current_yaw_ = 0.0;
  double last_yaw_ = 0.0;
  double accumulated_yaw_ = 0.0;
};

int main(int argc, char **argv)
{
  rclcpp::init(argc, argv);

  auto node = std::make_shared<Rotate360Odom>();

  rclcpp::spin(node);

  rclcpp::shutdown();
  return 0;
}