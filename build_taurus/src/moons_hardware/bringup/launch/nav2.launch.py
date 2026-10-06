from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():

    # ============================================================
    # Map
    # ============================================================

    map_file = DeclareLaunchArgument(
        "map",
        default_value=PathJoinSubstitution(
            [
                FindPackageShare("moons_hardware"),
                "maps",
                "oct-03.yaml",
            ]
        ),
        description="Full path to map YAML file",
    )

    # ============================================================
    # Nav2 parameters
    # ============================================================

    params_file = PathJoinSubstitution(
        [
            FindPackageShare("moons_hardware"),
            "bringup",
            "config",
            "nav2",
            "nav2_params.yaml",
        ]
    )

    # ============================================================
    # Map Server
    # ============================================================

    map_server = Node(
        package="nav2_map_server",
        executable="map_server",
        name="map_server",
        output="screen",
        parameters=[
            params_file,
            {
                "yaml_filename": LaunchConfiguration("map"),
            },
        ],
    )

    # ============================================================
    # AMCL
    # ============================================================

    amcl = Node(
        package="nav2_amcl",
        executable="amcl",
        name="amcl",
        output="screen",
        parameters=[
            params_file,
        ],
    )

    # ============================================================
    # Planner Server
    # ============================================================

    planner_server = Node(
        package="nav2_planner",
        executable="planner_server",
        name="planner_server",
        output="screen",
        parameters=[
            params_file,
        ],
    )

    # ============================================================
    # Controller Server
    # ============================================================

    controller_server = Node(
        package="nav2_controller",
        executable="controller_server",
        name="controller_server",
        output="screen",
        parameters=[
            params_file,
        ],
        remappings=[
            ("cmd_vel",  "/mobile_base_controller/cmd_vel_unstamped"),
        ],
    )

    # ============================================================
    # Behavior Server
    # ============================================================

    behavior_server = Node(
        package="nav2_behaviors",
        executable="behavior_server",
        name="behavior_server",
        output="screen",
        parameters=[
            params_file,
        ],
    )

    # ============================================================
    # BT Navigator
    # ============================================================

    bt_navigator = Node(
        package="nav2_bt_navigator",
        executable="bt_navigator",
        name="bt_navigator",
        output="screen",
        parameters=[
            params_file,
        ],
    )


    # ============================================================
    # Lifecycle Manager
    # ============================================================

    lifecycle_manager = Node(
        package="nav2_lifecycle_manager",
        executable="lifecycle_manager",
        name="lifecycle_manager_navigation",
        output="screen",
        parameters=[
            params_file,
        ],
    )

    # ============================================================
    # Launch
    # ============================================================

    return LaunchDescription(
        [
            map_file,

            map_server,
            amcl,

            planner_server,
            controller_server,

            behavior_server,
            bt_navigator,

            lifecycle_manager,
        ]
    )

