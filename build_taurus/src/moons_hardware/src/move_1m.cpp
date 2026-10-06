#include <rclcpp/rclcpp.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <geometry_msgs/msg/twist_stamped.hpp>

#include <cmath>
#include <chrono>

class MoveOneWheelRotation : public rclcpp::Node
{
public:
  MoveOneWheelRotation()
  : Node("move_one_wheel_rotation")
  {
    cmd_pub_ =
      create_publisher<geometry_msgs::msg::TwistStamped>(
        "/mobile_base_controller/cmd_vel", 10);

    odom_sub_ =
      create_subscription<nav_msgs::msg::Odometry>(
        "/mobile_base_controller/odom",
        10,
        std::bind(
          &MoveOneWheelRotation::odomCallback,
          this,
          std::placeholders::_1));

    timer_ =
      create_wall_timer(
        std::chrono::milliseconds(20),
        std::bind(
          &MoveOneWheelRotation::controlLoop,
          this));

    RCLCPP_INFO(
      get_logger(),
      "Move one wheel rotation node started.");

    RCLCPP_INFO(
      get_logger(),
      "Target distance = %.4f m",
      target_distance_);
  }

private:

  // --------------------------------------------------
  // ODOMETRY CALLBACK
  // --------------------------------------------------

  void odomCallback(
    const nav_msgs::msg::Odometry::SharedPtr msg)
  {
    current_x_ = msg->pose.pose.position.x;
    current_y_ = msg->pose.pose.position.y;

    if (!initialized_)
    {
      start_x_ = current_x_;
      start_y_ = current_y_;

      initialized_ = true;

      RCLCPP_INFO(
        get_logger(),
        "Starting position: x = %.4f, y = %.4f",
        start_x_,
        start_y_);
    }
  }

  // --------------------------------------------------
  // CONTROL LOOP
  // --------------------------------------------------

  void controlLoop()
  {
    if (!initialized_ || finished_)
      return;

    // Calculate distance travelled from starting position
    double dx = current_x_ - start_x_;
    double dy = current_y_ - start_y_;

    double distance =
      std::sqrt(dx * dx + dy * dy);

    RCLCPP_INFO_THROTTLE(
      get_logger(),
      *get_clock(),
      500,
      "Distance travelled = %.4f m",
      distance);

    // ------------------------------------------------
    // MOVE FORWARD
    // ------------------------------------------------

    if (distance < target_distance_)
    {
      geometry_msgs::msg::TwistStamped cmd;

      cmd.header.stamp = now();

      cmd.twist.linear.x = 0.2;
      cmd.twist.linear.y = 0.0;
      cmd.twist.linear.z = 0.0;

      cmd.twist.angular.x = 0.0;
      cmd.twist.angular.y = 0.0;
      cmd.twist.angular.z = 0.0;

      cmd_pub_->publish(cmd);
    }

    // ------------------------------------------------
    // TARGET REACHED
    // ------------------------------------------------

    else
    {
      stopRobot();

      finished_ = true;

      RCLCPP_INFO(
        get_logger(),
        "================================");

      RCLCPP_INFO(
        get_logger(),
        "ONE WHEEL ROTATION COMPLETED");

      RCLCPP_INFO(
        get_logger(),
        "Start: x = %.4f, y = %.4f",
        start_x_,
        start_y_);

      RCLCPP_INFO(
        get_logger(),
        "End:   x = %.4f, y = %.4f",
        current_x_,
        current_y_);

      RCLCPP_INFO(
        get_logger(),
        "Distance: %.4f m",
        distance);

      RCLCPP_INFO(
        get_logger(),
        "Target: %.4f m",
        target_distance_);

      RCLCPP_INFO(
        get_logger(),
        "================================");
    }
  }

  // --------------------------------------------------
  // STOP ROBOT
  // --------------------------------------------------

  void stopRobot()
  {
    geometry_msgs::msg::TwistStamped cmd;

    cmd.header.stamp = now();

    cmd.twist.linear.x = 0.0;
    cmd.twist.linear.y = 0.0;
    cmd.twist.linear.z = 0.0;

    cmd.twist.angular.x = 0.0;
    cmd.twist.angular.y = 0.0;
    cmd.twist.angular.z = 0.0;

    // Publish several stop commands
    for (int i = 0; i < 5; i++)
    {
      cmd_pub_->publish(cmd);
      rclcpp::sleep_for(
        std::chrono::milliseconds(20));
    }
  }

  // --------------------------------------------------
  // VARIABLES
  // --------------------------------------------------

  rclcpp::Publisher<
    geometry_msgs::msg::TwistStamped>::SharedPtr cmd_pub_;

  rclcpp::Subscription<
    nav_msgs::msg::Odometry>::SharedPtr odom_sub_;

  rclcpp::TimerBase::SharedPtr timer_;

  bool initialized_ = false;
  bool finished_ = false;

  double start_x_ = 0.0;
  double start_y_ = 0.0;

  double current_x_ = 0.0;
  double current_y_ = 0.0;

  // Wheel diameter = 250 mm = 0.25 m
  // Circumference = PI * diameter
  //
  // C = PI * 0.25
  // C = 0.785398 m

  const double target_distance_ = 0.785398;
};


int main(int argc, char **argv)
{
  rclcpp::init(argc, argv);

  auto node =
    std::make_shared<MoveOneWheelRotation>();

  rclcpp::spin(node);

  rclcpp::shutdown();

  return 0;
}