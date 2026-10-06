import os
import xacro
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    # Absolute path to your Xacro in the source folder
    xacro_file = '/home/ros2-taurus/build_taurus/src/moons_hardware/description/urdf/wheelcheck.urdf.xacro'

    # Make sure the file exists
    if not os.path.exists(xacro_file):
        raise FileNotFoundError(f"Xacro file not found: {xacro_file}")

    # Convert Xacro to URDF string
    urdf_content = xacro.process_file(xacro_file).toxml()

    return LaunchDescription([
        # Robot State Publisher
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='robot_state_publisher',
            output='screen',
            parameters=[{'robot_description': urdf_content}]
        ),

        # Joint State Publisher GUI
        Node(
            package='joint_state_publisher_gui',
            executable='joint_state_publisher_gui',
            name='joint_state_publisher_gui',
            output='screen'
        ),

        # RViz2
        Node(
            package='rviz2',
            executable='rviz2',
            name='rviz2',
            output='screen'
        ),
    ])