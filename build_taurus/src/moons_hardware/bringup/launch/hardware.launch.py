from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import Command, FindExecutable, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():

    # ============================================================
    # Robot description
    # ============================================================

    robot_description_content = Command(
        [
            PathJoinSubstitution(
                [FindExecutable(name="xacro")]
            ),
            " ",
            PathJoinSubstitution(
                [
                    FindPackageShare("moons_hardware"),
                    "description",
                    "urdf",
                    "wheelcheck.urdf.xacro",
                ]
            ),
        ]
    )

    robot_description = {
        "robot_description": robot_description_content
    }


    # ============================================================
    # Controller YAML
    # ============================================================

    controller_yaml = PathJoinSubstitution(
        [
            FindPackageShare("moons_hardware"),
            "bringup",
            "config",
            "controller.yaml",
        ]
    )


    # ============================================================
    # EKF YAML
    # ============================================================

    ekf_yaml = PathJoinSubstitution(
        [
            FindPackageShare("moons_hardware"),
            "bringup",
            "config",
            "ekf.yaml",
        ]
    )


    # ============================================================
    # ros2_control
    # ============================================================

    control_node = Node(
        package="controller_manager",
        executable="ros2_control_node",
        parameters=[
            robot_description,
            controller_yaml
        ],
        output="both",
    )


    # ============================================================
    # Robot State Publisher
    # ============================================================

    robot_state_pub_node = Node(
        package="robot_state_publisher",
        executable="robot_state_publisher",
        output="both",
        parameters=[
            robot_description
        ],
    )


    # ============================================================
    # Joint State Broadcaster
    # ============================================================

    joint_state_broadcaster_spawner = Node(
        package="controller_manager",
        executable="spawner",
        arguments=[
            "joint_state_broadcaster"
        ],
        output="screen",
    )


    # ============================================================
    # Differential Drive Controller
    # ============================================================

    robot_controller_spawner = Node(
    package="controller_manager",
    executable="spawner",
    arguments=[
        "mobile_base_controller",
        "--param-file",
        controller_yaml,
    ],
    output="screen",
)


    # ============================================================
    # EKF Sensor Fusion
    # ============================================================

    ekf_node = Node(
        package="robot_localization",
        executable="ekf_node",
        name="ekf_filter_node",
        output="screen",
        parameters=[
            ekf_yaml
        ],
    )


    # ============================================================
    # XSENS IMU
    # ============================================================

    xsens_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            PathJoinSubstitution(
                [
                    FindPackageShare("xsens_mti_ros2_driver"),
                    "launch",
                    "xsens_mti_node.launch.py",
                ]
            )
        )
    )


    # ============================================================
    # SICK TiM 5xx LiDAR
    # ============================================================

    sick_launch_file = PathJoinSubstitution(
        [
            FindPackageShare("sick_scan_xd"),
            "launch",
            "sick_tim_5xx.launch",
        ]
    )

    sick_lidar_node = Node(
        package="sick_scan_xd",
        executable="sick_generic_caller",
        output="screen",
        arguments=[
            sick_launch_file,
            "hostname:=192.168.7.11",
            "frame_id:=sick_link1",
        ],
    )


    # ============================================================
    # Launch everything
    # ============================================================

    return LaunchDescription(
        [

            # ----------------------------------------------------
            # Robot
            # ----------------------------------------------------
            control_node,
            robot_state_pub_node,

            # ----------------------------------------------------
            # Controllers
            # ----------------------------------------------------
            joint_state_broadcaster_spawner,
            robot_controller_spawner,

            # ----------------------------------------------------
            # Sensor fusion
            # ----------------------------------------------------
             ekf_node,

            # ----------------------------------------------------
            # IMU
            # ----------------------------------------------------
             xsens_launch,

            # ----------------------------------------------------
            # LiDAR
            # ----------------------------------------------------
            sick_lidar_node,
        ]
    )