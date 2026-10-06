cmake_minimum_required(VERSION 3.8)
project(moons_hardware)

set(CMAKE_CXX_STANDARD 17)

#################################################
# Dependencies
#################################################

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_lifecycle REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(nav_msgs REQUIRED)
find_package(tf2 REQUIRED)

find_package(hardware_interface REQUIRED)
find_package(pluginlib REQUIRED)
find_package(controller_manager REQUIRED)

find_package(std_srvs REQUIRED)
find_package(std_msgs REQUIRED)

find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBMODBUS REQUIRED libmodbus)

#################################################
# Hardware Plugin
#################################################

add_library(moons_hardware_plugin SHARED
  src/taurus_node.cpp
  src/moonsModbus.cpp
)

target_include_directories(moons_hardware_plugin
  PUBLIC
    hardware/include
    ${LIBMODBUS_INCLUDE_DIRS}
)

ament_target_dependencies(moons_hardware_plugin
  rclcpp
  rclcpp_lifecycle
  hardware_interface
  pluginlib
)

target_link_libraries(moons_hardware_plugin
  ${LIBMODBUS_LIBRARIES}
)

# ================= ODOM READER =================


add_executable(odom_reader
  src/odom_reader.cpp
)

ament_target_dependencies(odom_reader
  rclcpp
  nav_msgs
  geometry_msgs
  tf2
)

install(TARGETS
  odom_reader
  DESTINATION lib/${PROJECT_NAME}
)
###############################################################
#######=======move 1m dist=======================
#######################################################
add_executable(move_1m src/move_1m.cpp)

ament_target_dependencies(move_1m
  rclcpp
  geometry_msgs
  nav_msgs
)


install(TARGETS
  move_1m
  DESTINATION lib/${PROJECT_NAME}
)
#################################################
# Hardware Service Node
#################################################

add_executable(hardware_service_node
  src/hardware_service_node.cpp
  src/moonsModbus.cpp
)

target_include_directories(hardware_service_node
  PUBLIC
    hardware/include
    ${LIBMODBUS_INCLUDE_DIRS}
)

ament_target_dependencies(hardware_service_node
  rclcpp
  std_srvs
  std_msgs
)

target_link_libraries(hardware_service_node
  ${LIBMODBUS_LIBRARIES}
)

#################################################
# Export Plugin
#################################################

pluginlib_export_plugin_description_file(
  hardware_interface
  hardware_plugin.xml
)

#################################################
# Install
#################################################

# Plugin library
install(
  TARGETS moons_hardware_plugin
  LIBRARY DESTINATION lib
)

# Service node
install(
  TARGETS hardware_service_node
  DESTINATION lib/${PROJECT_NAME}
)

# Header files
install(
  DIRECTORY hardware/include/
  DESTINATION include
)

# Share files
install(
  DIRECTORY
    bringup
    description
    maps
  DESTINATION share/${PROJECT_NAME}
)

# Plugin XML
install(
  FILES hardware_plugin.xml
  DESTINATION share/${PROJECT_NAME}
)

#################################################
# Package
#################################################

ament_package()

