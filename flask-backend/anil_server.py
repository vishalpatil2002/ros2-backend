from flask import Flask,render_template,url_for,request,redirect
from flask import Blueprint,jsonify
from datetime import datetime
import pymongo
import time
import actionlib
import rospy
import time
from datetime import datetime

from hw_t.msg import aruco_detectAction,aruco_detectGoal
from move_base_msgs.msg import MoveBaseAction, MoveBaseGoal
app1=Blueprint("extra_api",__name__)
def feedback_cb(msg):
        print("feedback:",msg)
def init_ros_node():
    if not rospy.core.is_initialized():
        rospy.init_node("flask_ros_bridge", anonymous=True, disable_signals=True)
        rospy.loginfo("ROS node initialized in Flask")
        rospy.set_param('missionname',"No Active task")
        rospy.set_param('positionName',"No Active Tasks")
init_ros_node()
@app1.route('/api/activeMission', methods=['POST'])

def handle_active_mission():
    print("=== HIT /api/activeMission ===")
    # rospy.init_node("flask_ros_bridge", anonymous=True)
    try:
        # print("Request headers:", dict(request.headers))
        # print("Raw body:", request.data)
        data = request.get_json(force=True)
        n=data.get('inputValue')
        mission_id = data.get("missionId")
        myclient = pymongo.MongoClient("mongodb://localhost:27017")
        db=myclient["amcl_data"]
        # print(db.list_collection_names())
        col=db["Missions"]
        col2=db['Pose_data']
        M_history=db["MissionHistory"]
        l=0
        # rospy.set_param('positionName',"No Tasks")
        # print(col.list_collection_names())
        # print(list(col.find()))
        rospy.set_param('activationControl',1)
        rospy.set_param('mission','activated')
        rospy.set_param("/distance_goal_qr",1)
        rospy.set_param("/pauseplay",'playing')
        for i in range(n):
            l1=[]
            d=list(col.find())
            # print(d,"hoiuhoihoihoi")
            
            for j in d:
                # print(str(j['_id']),mission_id)
                if str(j['_id'])==mission_id:
                    l=j['queueData']['queue']
                    
                    rospy.set_param('missionname',j['queueData']['missionName'])
                    m_name=j['queueData']['missionName']
                    # print("ss")
                else:
                    # print(j['queueData']['missionName'],"kjbojbojbo")
                    pass
            print(l)
            n=0
            pose=dict()
            for i in l:
                # print(i)
                # for x in l:

                        # print(i['positionId'])
                        try:
                            if i['positionId']=='Drop':
                                n+=1
                                
                                pose[n]=i['dropPositionId']
                                print(pose)
                                # input("chebiebdjio")
                        except:
                            pass
                        
                        l1=l1+[i['positionId']]
            print(pose)
            # input('ckeck')
            count=0
            count2=0
            for i in l1:
                print(i)
                count+=1
                r = rospy.get_param("/distance_goal_qr")
                r1= rospy.get_param("/pauseplay")
                while r1=='paused':
                    r1= rospy.get_param("/pauseplay")
                    print("uhvuh")
                    pass
                if r==0:
                    break
                if i=="Lift-Up":
                    rospy.set_param('/positionName',i)
                    client1 = actionlib.SimpleActionClient('Lift', aruco_detectAction)
                    client1.wait_for_server()
                    goal = aruco_detectGoal()
                    result = 0
                    goal = aruco_detectGoal()
                    goal.detect = 1
                    # rospy.set_param("/distancce_goal_qr",goal.detect )

                    client1.send_goal(goal, feedback_cb=feedback_cb)
                    client1.wait_for_result()
                    result = client1.get_result()
                    print("the result is", result.distance_reached)
                elif i=='Docking':
                    rospy.set_param('/positionName',i)
                    client2 = actionlib.SimpleActionClient('Table_dock', aruco_detectAction)
                    client2.wait_for_server()
                    goal = aruco_detectGoal()
                    result = 0
                    goal = aruco_detectGoal()
                    goal.detect = 1
                    # rospy.set_param("/distance_goal_qr",goal.detect )

                    client2.send_goal(goal, feedback_cb=feedback_cb)
                    client2.wait_for_result()
                    result = client2.get_result()
                    print("the result is", result.distance_reached)
                elif i=='Drop':
                    rospy.set_param('/positionName',i)
                    count2+=1
                    from hw_t.msg import StringGoalAction, StringGoalGoal
                    print(type(pose[count2]))
                    client6 = actionlib.SimpleActionClient('Drop', StringGoalAction)
                    client6.wait_for_server()
                    goal = StringGoalGoal()
                    detect1=pose[count2]
                    goal.detect= detect1
                    print(detect1)
                    client6.send_goal(goal, feedback_cb=feedback_cb)
                    client6.wait_for_result()
                elif i=='Exit-Docking':
                    rospy.set_param('/positionName',i)
                    client4 = actionlib.SimpleActionClient('back', aruco_detectAction)
                    client4.wait_for_server()
                    goal = aruco_detectGoal()
                    result = 0
                    goal = aruco_detectGoal()
                    goal.detect = 1
                    # rospy.set_param("/distance_goal_qr",goal.detect )

                    client4.send_goal(goal, feedback_cb=feedback_cb)
                    client4.wait_for_result()
                    result = client4.get_result()
                    print("the result is", result.distance_reached)
                elif i=="Lift-Down":
                    client3 = actionlib.SimpleActionClient('Lift', aruco_detectAction)
                    client3.wait_for_server()
                    goal = aruco_detectGoal()
                    result = 0
                    goal = aruco_detectGoal()
                    goal.detect = 0
                    # rospy.set_param("/distance_goal_qr",goal.detect )

                    client3.send_goal(goal, feedback_cb=feedback_cb)
                    client3.wait_for_result()
                    result = client3.get_result()
                    print("the result is", result.distance_reached)
                else:
                    d1=list(col2.find())
                    
                    
                    for o in d1:
                        print(o,"kjbicjqbi")
                        rospy.set_param('list',l1)
                        if str(o['_id'])==i:
                            rospy.set_param('/positionName',o['name'])
                            # print(l['amclData']['pose'])

                            # input('svuhvbuhbu')
                            point=o
                            # print(point,"ijbiijbijb")
                            try:
                                x=point['amclData']['pose']['pose']['position']['x']
                                y=point['amclData']['pose']['pose']['position']['y']
                                x1=0
                                y1=0
                                z=point['amclData']['pose']['pose']['orientation']['z']
                                w=point['amclData']['pose']['pose']['orientation']['w']
                                # print(x,y,z,w,"kjbibiubiub")
                                client = actionlib.SimpleActionClient('move_base', MoveBaseAction)
                                client.wait_for_server()
                                r = rospy.get_param("/distance_goal_qr")
                                # r1= rospy.get_param("/pauseplay")
                                

                                if r==0:
                                    break
                                goal = MoveBaseGoal()
                                goal.target_pose.header.frame_id = "map"
                                goal.target_pose.header.stamp = rospy.Time.now()
                                goal.target_pose.pose.position.x = x
                                goal.target_pose.pose.position.y = y
                                goal.target_pose.pose.orientation.x = x1
                                goal.target_pose.pose.orientation.y = y1
                                goal.target_pose.pose.orientation.w = w 
                                goal.target_pose.pose.orientation.z=z # Set a default orientation (no rotation)
                                
                                client.send_goal(goal)
                                rospy.loginfo("Sent goal to move_base:")
                                s=client.wait_for_result()
                                state = client.get_state()
                                while state!=3:
                                    print("jibijb")
                                    r1= rospy.get_param("/pauseplay")
                                    r2 = rospy.get_param("/distance_goal_qr")
                                    if r2==0:
                                      
                                        break
                                    
                                    elif r1!='paused':
                                        client.send_goal(goal)
                                        rospy.loginfo("Sent goal to m")
                                        s=client.wait_for_result()
                                    
                                        
                                        
                                    state = client.get_state()
                                # while True:
                                #     r1= rospy.get_param("/pauseplay")
                                #     print("uhbuhbu")
                            
                                #     r1= rospy.get_param("/pauseplay")
                                  
                                #     if r1=='paused':
                                #         while r1=='paused':
                                #             r1= rospy.get_param("/pauseplay")
                                #             pass
                                #         else:
                                #             goal.target_pose.header.frame_id = "map"
                                #             goal.target_pose.header.stamp = rospy.Time.now()
                                #             goal.target_pose.pose.position.x = x
                                #             goal.target_pose.pose.position.y = y
                                #             goal.target_pose.pose.orientation.x = x1
                                #             goal.target_pose.pose.orientation.y = y1
                                #             goal.target_pose.pose.orientation.w = w 
                                #             goal.target_pose.pose.orientation.z=z
                                #             client.send_goal(goal)
                                #             rospy.loginfo("Sent goal to move_base:")
                                #             s=client.wait_for_result() 
                                #     else:
                                #         break

                                # d1.remove(o)
                                # rospy.set_param('c_count',count)
                                break
                            except Exception as e:
                                print('erro',e)
                        else:
                            print("not found")
        
        
        # print("Received missionI:", mission_id)
        allid=M_history.distinct("_id")
        # M_history.insert_one({"_id":len(allid)+1})
        completion_time = datetime.now().strftime("%d-%m-%Y %H:%M:%S")
        if rospy.get_param('distance_goal_qr')!=0:
            m_status='Completed'
        else:
            m_status='Aborted'
        mission_data = {
    "missionName": m_name,
    "status": m_status,
    "completionDateTime": completion_time
}
        M_history.insert_one(mission_data)
        rospy.set_param('missionname',"No Active task")
        rospy.set_param("/distance_goal_qr",1)
        rospy.set_param('mission','completed')
        rospy.set_param('activationControl',0)
        rospy.set_param('positionName',"No Active Tasks")
        return jsonify({"missionId": mission_id}), 200
    except Exception as e:
        print("ERROR in /api/activeMission:", str(e))
        return jsonify({"error": str(e)}), 500


# if __name__=="__main__":
    # app.run(debug=True, host='192.168.5.10', port=5000)
