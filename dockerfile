FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker
ENV ROS_DISTRO=humble

# --------------------------------
# Basic tools + Python + ROS tools
# --------------------------------
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    gnupg2 \
    lsb-release \
    ca-certificates \
    build-essential \
    python3 \
    python3-pip \
    python3-colcon-common-extensions \
    python3-flask \
    python3-pymongo \
    python3-opencv \
    python3-yaml \
    libusb-1.0-0-dev \
    nano \
    vim \
    htop \
    net-tools \
    tree \
    iputils-ping \
    xdotool \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libglu1-mesa \
    nautilus \
    gedit \
    lsof \
    usbutils \
    nginx \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --------------------------------
# ROS 2 packages
# --------------------------------
RUN apt-get update && apt-get install -y \
    ros-humble-ros-base \
    ros-humble-rosbridge-server \
    python3-rosdep \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --------------------------------
# Python packages
# --------------------------------
RUN pip3 install --no-cache-dir \
    redis \
    rospkg \
    pyyaml \
    pymodbus \
    opcua \
    colcon-common-extensions

# --------------------------------
# Node.js 16
# --------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get update && \
    apt-get install -y nodejs && \
    npm install -g \
        roslib \
        js-yaml \
        node-opcua && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# --------------------------------
# Copy ROS 2 workspace source
# --------------------------------
COPY build_taurus/src /root/build_taurus/src

# --------------------------------
# ROS 2 environment
# --------------------------------
RUN echo "source /opt/ros/humble/setup.bash" >> /root/.bashrc

# --------------------------------
# Build build_taurus workspace
# --------------------------------
RUN /bin/bash -c "source /opt/ros/humble/setup.bash && \
    cd /root/build_taurus && \
    colcon build"

# --------------------------------
# Automatically source build_taurus
# --------------------------------
RUN echo "source /root/build_taurus/install/setup.bash" >> /root/.bashrc

# --------------------------------
# Ports
# --------------------------------
EXPOSE 9090
EXPOSE 3000
EXPOSE 5000

# --------------------------------
# Start container
# --------------------------------
CMD ["/bin/bash", "-c", "source /opt/ros/humble/setup.bash && source /root/build_taurus/install/setup.bash && tail -f /dev/null"]
