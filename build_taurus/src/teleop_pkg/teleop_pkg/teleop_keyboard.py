#!/usr/bin/env python3

import sys
import select
import os

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

# Keyboard support
if os.name == 'nt':
    import msvcrt
else:
    import tty
    import termios


# ============================================================
# Velocity limits
# ============================================================

MAX_LIN_VEL = 0.75
MAX_ANG_VEL = 2.0

LIN_VEL_STEP_SIZE = 0.05
ANG_VEL_STEP_SIZE = 0.05


# ============================================================
# Keyboard instructions
# ============================================================

msg = """
Controls
---------------------------
        w
   a    s    d
        x

w / W : increase forward velocity
x / X : increase backward velocity
a / A : rotate left
d / D : rotate right
r / R : reset angular velocity

s / S or SPACE : stop everything
q / Q : quit
"""


# ============================================================
# Keyboard input
# ============================================================

def getKey(settings):
    if os.name == 'nt':
        return msvcrt.getch().decode()

    tty.setraw(sys.stdin.fileno())

    rlist, _, _ = select.select(
        [sys.stdin],
        [],
        [],
        0.1
    )

    if rlist:
        key = sys.stdin.read(1)
    else:
        key = ''

    termios.tcsetattr(
        sys.stdin,
        termios.TCSADRAIN,
        settings
    )

    return key


# ============================================================
# Limit velocity
# ============================================================

def constrain(value, low, high):
    return max(low, min(value, high))


# ============================================================
# Display current velocity
# ============================================================

def vels(linear, angular):
    return (
        f"currently: linear vel {linear:.2f}"
        f"\t angular vel {angular:.2f}"
    )


# ============================================================
# Teleop Node
# ============================================================

class TeleopNode(Node):

    def __init__(self):

        super().__init__('teleop_keyboard')

        # ----------------------------------------------------
        # Taurus DiffDriveController configuration
        #
        # use_stamped_vel = false
        #
        # Therefore the controller expects:
        #
        # Topic:
        # /mobile_base_controller/cmd_vel_unstamped
        #
        # Message:
        # geometry_msgs/msg/Twist
        # ----------------------------------------------------

        self.pub = self.create_publisher(
            Twist,
            '/mobile_base_controller/cmd_vel_unstamped',
            10
        )

        # Current target velocities
        self.target_linear_vel = 0.0
        self.target_angular_vel = 0.0

        # ----------------------------------------------------
        # Publish continuously at 20 Hz
        # ----------------------------------------------------

        self.timer = self.create_timer(
            0.05,
            self.publish_cmd
        )

    # ========================================================
    # Publish velocity command
    # ========================================================

    def publish_cmd(self):

        msg = Twist()

        msg.linear.x = self.target_linear_vel
        msg.linear.y = 0.0
        msg.linear.z = 0.0

        msg.angular.x = 0.0
        msg.angular.y = 0.0
        msg.angular.z = self.target_angular_vel

        self.pub.publish(msg)


# ============================================================
# Main
# ============================================================

def main():

    # --------------------------------------------------------
    # Save terminal settings
    # --------------------------------------------------------

    if os.name != 'nt':
        settings = termios.tcgetattr(sys.stdin)

    # --------------------------------------------------------
    # Initialize ROS 2
    # --------------------------------------------------------

    rclpy.init()

    node = TeleopNode()

    print(msg)

    print(
        vels(
            node.target_linear_vel,
            node.target_angular_vel
        )
    )

    # --------------------------------------------------------
    # Keyboard loop
    # --------------------------------------------------------

    try:

        while rclpy.ok():

            # Allow ROS callbacks/timer to execute
            rclpy.spin_once(
                node,
                timeout_sec=0.01
            )

            # Read keyboard
            key = getKey(settings)

            if key == '':
                continue

            # Convert uppercase to lowercase
            key = key.lower()

            # ------------------------------------------------
            # Forward
            # ------------------------------------------------

            if key == 'w':

                node.target_linear_vel += LIN_VEL_STEP_SIZE

                node.target_linear_vel = constrain(
                    node.target_linear_vel,
                    -MAX_LIN_VEL,
                    MAX_LIN_VEL
                )

            # ------------------------------------------------
            # Backward
            # ------------------------------------------------

            elif key == 'x':

                node.target_linear_vel -= LIN_VEL_STEP_SIZE

                node.target_linear_vel = constrain(
                    node.target_linear_vel,
                    -MAX_LIN_VEL,
                    MAX_LIN_VEL
                )

            # ------------------------------------------------
            # Rotate left
            # ------------------------------------------------

            elif key == 'a':

                node.target_angular_vel += ANG_VEL_STEP_SIZE

                node.target_angular_vel = constrain(
                    node.target_angular_vel,
                    -MAX_ANG_VEL,
                    MAX_ANG_VEL
                )

            # ------------------------------------------------
            # Rotate right
            # ------------------------------------------------

            elif key == 'd':

                node.target_angular_vel -= ANG_VEL_STEP_SIZE

                node.target_angular_vel = constrain(
                    node.target_angular_vel,
                    -MAX_ANG_VEL,
                    MAX_ANG_VEL
                )

            # ------------------------------------------------
            # Reset angular velocity
            # ------------------------------------------------

            elif key == 'r':

                node.target_angular_vel = 0.0

            # ------------------------------------------------
            # Stop
            # ------------------------------------------------

            elif key == 's' or key == ' ':

                node.target_linear_vel = 0.0
                node.target_angular_vel = 0.0

            # ------------------------------------------------
            # Quit
            # ------------------------------------------------

            elif key == 'q' or key == '\x03':

                break

            # ------------------------------------------------
            # Display velocity
            # ------------------------------------------------

            print(
                vels(
                    node.target_linear_vel,
                    node.target_angular_vel
                )
            )

    # ========================================================
    # Exception handling
    # ========================================================

    except Exception as e:

        print(e)

    # ========================================================
    # Shutdown
    # ========================================================

    finally:

        # ----------------------------------------------------
        # Send zero velocity before shutting down
        # ----------------------------------------------------

        stop_msg = Twist()

        stop_msg.linear.x = 0.0
        stop_msg.linear.y = 0.0
        stop_msg.linear.z = 0.0

        stop_msg.angular.x = 0.0
        stop_msg.angular.y = 0.0
        stop_msg.angular.z = 0.0

        node.pub.publish(stop_msg)

        # ----------------------------------------------------
        # Destroy node
        # ----------------------------------------------------

        node.destroy_node()

        rclpy.shutdown()

        # ----------------------------------------------------
        # Restore terminal settings
        # ----------------------------------------------------

        if os.name != 'nt':

            termios.tcsetattr(
                sys.stdin,
                termios.TCSADRAIN,
                settings
            )


# ============================================================
# Entry point
# ============================================================

if __name__ == '__main__':
    main()