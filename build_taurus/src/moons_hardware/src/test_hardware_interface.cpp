#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/int32_multi_array.hpp>
#include <std_msgs/msg/bool.hpp>
#include <std_msgs/msg/int32.hpp>
#include <std_msgs/msg/float32.hpp>
using namespace std;

class HardwareTestNode : public rclcpp::Node
{
public:
    HardwareTestNode() : Node("hardware_test_node")
    {
        // Publishers to send commands
        pub_speed_ = this->create_publisher<std_msgs::msg::Int32MultiArray>("cmd_speed", 10);
        pub_jog_ = this->create_publisher<std_msgs::msg::Bool>("cmd_jog", 10);
        pub_reset_alarm_ = this->create_publisher<std_msgs::msg::Bool>("cmd_reset_alarm", 10);

        // Subscribers to read feedback
        sub_enc1_ = this->create_subscription<std_msgs::msg::Int32>(
            "wheel1/encoder", 10, 
            [this](std_msgs::msg::Int32::SharedPtr msg){ RCLCPP_INFO(this->get_logger(), "Enc1: %d", msg->data); });

        sub_enc2_ = this->create_subscription<std_msgs::msg::Int32>(
            "wheel2/encoder", 10, 
            [this](std_msgs::msg::Int32::SharedPtr msg){ RCLCPP_INFO(this->get_logger(), "Enc2: %d", msg->data); });

        sub_speed1_ = this->create_subscription<std_msgs::msg::Float32>(
            "wheel1/speed", 10, 
            [this](std_msgs::msg::Float32::SharedPtr msg){ RCLCPP_INFO(this->get_logger(), "Vel1: %.2f", msg->data); });

        sub_speed2_ = this->create_subscription<std_msgs::msg::Float32>(
            "wheel2/speed", 10, 
            [this](std_msgs::msg::Float32::SharedPtr msg){ RCLCPP_INFO(this->get_logger(), "Vel2: %.2f", msg->data); });

        // Timer to send commands periodically
        timer_ = this->create_wall_timer(
            std::chrono::seconds(1), 
            std::bind(&HardwareTestNode::sendCommands, this));
    }

private:
    rclcpp::Publisher<std_msgs::msg::Int32MultiArray>::SharedPtr pub_speed_;
    rclcpp::Publisher<std_msgs::msg::Bool>::SharedPtr pub_jog_;
    rclcpp::Publisher<std_msgs::msg::Bool>::SharedPtr pub_reset_alarm_;

    rclcpp::Subscription<std_msgs::msg::Int32>::SharedPtr sub_enc1_, sub_enc2_;
    rclcpp::Subscription<std_msgs::msg::Float32>::SharedPtr sub_speed1_, sub_speed2_;

    rclcpp::TimerBase::SharedPtr timer_;

    void sendCommands()
    {
        cout<<"----------------------------------------------"<<endl;

        // Example: send wheel speed
        std_msgs::msg::Int32MultiArray speed_msg;
        speed_msg.data = {1000, 1000};
        pub_speed_->publish(speed_msg);
        RCLCPP_INFO(this->get_logger(), "Published speed: [%d, %d]", speed_msg.data[0], speed_msg.data[1]);

        // Example: start jog
        std_msgs::msg::Bool jog_msg;
        jog_msg.data = true;
        pub_jog_->publish(jog_msg);
        RCLCPP_INFO(this->get_logger(), "Published jog: %s", jog_msg.data ? "true" : "false");

        // Example: reset alarms (optional)
        // std_msgs::msg::Bool reset_msg;
        // reset_msg.data = false;  // true to reset
        // pub_reset_alarm_->publish(reset_msg);
        // RCLCPP_INFO(this->get_logger(), "Published reset_alarm: %s", reset_msg.data ? "true" : "false");
    }
};

int main(int argc, char **argv)
{
    rclcpp::init(argc, argv);
    auto node = std::make_shared<HardwareTestNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
