#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/int32.hpp>
#include <std_msgs/msg/float32.hpp>
#include <std_msgs/msg/bool.hpp>
#include <std_msgs/msg/int32_multi_array.hpp>
#include <vector>
#include <memory>
#include <cmath>
#include "moons_hardware/moonsModbus.hpp" // Your existing Moons class
using namespace std;

class MoonsNode : public rclcpp::Node {
public:
    MoonsNode() : Node("moons_node") {
        // Create Modbus object
        moonsModbus_ = std::make_shared<Moons>();

        // Publishers
        pub_enc1_ = this->create_publisher<std_msgs::msg::Int32>("wheel1/encoder", 10);
        pub_enc2_ = this->create_publisher<std_msgs::msg::Int32>("wheel2/encoder", 10);
        pub_vel1_ = this->create_publisher<std_msgs::msg::Float32>("wheel1/speed", 10);
        pub_vel2_ = this->create_publisher<std_msgs::msg::Float32>("wheel2/speed", 10);
        pub_cur1_ = this->create_publisher<std_msgs::msg::Float32>("wheel1/current", 10);
        pub_cur2_ = this->create_publisher<std_msgs::msg::Float32>("wheel2/current", 10);
        pub_alarm1_ = this->create_publisher<std_msgs::msg::Int32>("wheel1/alarm_code", 10);
        pub_alarm2_ = this->create_publisher<std_msgs::msg::Int32>("wheel2/alarm_code", 10);

        // Subscribers
        sub_speed_ = this->create_subscription<std_msgs::msg::Int32MultiArray>(
            "cmd_speed", 10, std::bind(&MoonsNode::speedCb, this, std::placeholders::_1));

        sub_jog_ = this->create_subscription<std_msgs::msg::Bool>(
            "cmd_jog", 10, std::bind(&MoonsNode::jogCb, this, std::placeholders::_1));

        sub_encoder_ = this->create_subscription<std_msgs::msg::Int32MultiArray>(
            "cmd_encoder", 10, std::bind(&MoonsNode::encoderCb, this, std::placeholders::_1));

        sub_reset_alarm_ = this->create_subscription<std_msgs::msg::Bool>(
            "cmd_reset_alarm", 10, std::bind(&MoonsNode::resetAlarmCb, this, std::placeholders::_1));

        // Motor inversion (like Python code)
        l_inv_ = 1;
        r_inv_ = -1;

        // Initialize motors
        moonsModbus_->resetAlarm();
        moonsModbus_->stopJog();
        moonsModbus_->setEncoder({0, 0});

        // Timer for periodic updates (50 Hz)
        timer_ = this->create_wall_timer(
            std::chrono::milliseconds(20),
            std::bind(&MoonsNode::updateLoop, this));

        RCLCPP_INFO(this->get_logger(), "MoonsNode initialized.");
    }

private:
    // Modbus object
    std::shared_ptr<Moons> moonsModbus_;

    // Publishers
    rclcpp::Publisher<std_msgs::msg::Int32>::SharedPtr pub_enc1_, pub_enc2_;
    rclcpp::Publisher<std_msgs::msg::Float32>::SharedPtr pub_vel1_, pub_vel2_;
    rclcpp::Publisher<std_msgs::msg::Float32>::SharedPtr pub_cur1_, pub_cur2_;
    rclcpp::Publisher<std_msgs::msg::Int32>::SharedPtr pub_alarm1_, pub_alarm2_;

    // Subscribers
    rclcpp::Subscription<std_msgs::msg::Int32MultiArray>::SharedPtr sub_speed_;
    rclcpp::Subscription<std_msgs::msg::Bool>::SharedPtr sub_jog_;
    rclcpp::Subscription<std_msgs::msg::Int32MultiArray>::SharedPtr sub_encoder_;
    rclcpp::Subscription<std_msgs::msg::Bool>::SharedPtr sub_reset_alarm_;

    // Timer
    rclcpp::TimerBase::SharedPtr timer_;

    // Previous encoder values
    int32_t prev_enc1_ = 0;
    int32_t prev_enc2_ = 0;

    // Motor inversion
    int l_inv_, r_inv_;

    // Gear ratio
    const int gear_ratio_ = 40;

    // Update loop
    void updateLoop() {
        // Read raw encoder
        auto encs = moonsModbus_->getEncoder(prev_enc1_, prev_enc2_);
        prev_enc1_ = encs.first;
        prev_enc2_ = encs.second;

        // Read raw speed
        auto vels = moonsModbus_->getSpeed();

        // Read currents
        auto cur = moonsModbus_->getCurrent();

        // Read alarms
        auto alarms1 = moonsModbus_->readAlarm(1);
        auto alarms2 = moonsModbus_->readAlarm(2);

        // Convert raw encoder counts to degrees
        double enc1_deg = (encs.first * 360.0) / (10000.0 * gear_ratio_);
        double enc2_deg = (encs.second * 360.0) / (10000.0 * gear_ratio_);

        // Convert speed to deg/s
        double vel1_deg = (360.0 * vels.first) / (240.0 * gear_ratio_);
        double vel2_deg = (360.0 * vels.second) / (240.0 * gear_ratio_);
        cout<<vel1_deg<<endl;

        // Apply inversion
        enc1_deg *= l_inv_;
        enc2_deg *= r_inv_;
        vel1_deg *= l_inv_;
        vel2_deg *= r_inv_;
        double cur1 = cur.first * l_inv_;
        double cur2 = cur.second * r_inv_;

        // Publish encoder
        std_msgs::msg::Int32 msg_enc;
        msg_enc.data = static_cast<int>(enc1_deg); pub_enc1_->publish(msg_enc);
        msg_enc.data = static_cast<int>(enc2_deg); pub_enc2_->publish(msg_enc);

        // Publish speed
        std_msgs::msg::Float32 msg_vel;
        msg_vel.data = vel1_deg; pub_vel1_->publish(msg_vel);
        cout<<msg_vel.data<<endl;

        msg_vel.data = vel2_deg; pub_vel2_->publish(msg_vel);


        // Publish current
        msg_vel.data = cur1; pub_cur1_->publish(msg_vel);
        msg_vel.data = cur2; pub_cur2_->publish(msg_vel);

        // Publish alarms as bitmask
        std_msgs::msg::Int32 msg_alarm;
        int bitmask1 = 0; for (int i : alarms1) bitmask1 |= (1 << i);
        msg_alarm.data = bitmask1; pub_alarm1_->publish(msg_alarm);

        int bitmask2 = 0; for (int i : alarms2) bitmask2 |= (1 << i);
        msg_alarm.data = bitmask2; pub_alarm2_->publish(msg_alarm);
    }

    // Subscriber callbacks
    void speedCb(const std_msgs::msg::Int32MultiArray::SharedPtr msg) {
        if (msg->data.size() < 2) return;
        double vel1 = msg->data[0];
        double vel2 = msg->data[1];

        // Convert deg/s to raw motor units
        long int deg1 = round((vel1 / 360.0) * 240.0 * gear_ratio_);
        long int deg2 = round((vel2 / 360.0) * 240.0 * gear_ratio_);

        deg1 *= l_inv_;
        deg2 *= r_inv_;

        moonsModbus_->setSpeed(1, deg1, deg2);
    }

    void jogCb(const std_msgs::msg::Bool::SharedPtr msg) {
        if (msg->data) moonsModbus_->startJog();
        else moonsModbus_->stopJog();
    }

    void encoderCb(const std_msgs::msg::Int32MultiArray::SharedPtr msg) {
        if (msg->data.size() < 2) return;
        int enc1 = msg->data[0] * l_inv_;
        int enc2 = msg->data[1] * r_inv_;
        moonsModbus_->setEncoder({enc1, enc2});
    }

    void resetAlarmCb(const std_msgs::msg::Bool::SharedPtr msg) {
        if (msg->data) moonsModbus_->resetAlarm();
    }
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<MoonsNode>();
    rclcpp::spin(node);
    return 0;
}
