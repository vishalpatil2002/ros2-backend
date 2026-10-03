const ROSLIB = require("roslib");

// Connect to rosbridge websocket
const ros = new ROSLIB.Ros({
  url: 'ws://192.168.5.10:9090'  // Replace with your rosbridge IP/port
});

// Log connection events
ros.on('connection', () => {
  console.log('✅ Connected to ROS');

  // Create action client
  const actionClient = new ROSLIB.ActionClient({
    ros: ros,
    serverName: '/Drop',
    actionName: 'hw_t/StringGoalAction'
  });

  // Wait a moment for server discovery
  setTimeout(() => {
    const goal = new ROSLIB.Goal({
      actionClient: actionClient,
      goalMessage: {
        detect: "Dock to Station A"
      }
    });

    goal.on('feedback', (fb) => {
      console.log("📩 Feedback:", fb);
    });

    goal.on('result', (res) => {
      console.log("🎯 Result:", res);
    });

    console.log("🚀 Sending goal...");
    goal.send();
  }, 1000);  // Small delay to ensure action server is discovered
});

ros.on('error', (err) => console.error('❌ Connection Error:', err));
ros.on('close', () => console.log('🔌 Disconnected from ROS'));
