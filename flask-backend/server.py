from flask import Flask, render_template, request, jsonify,send_from_directory
import subprocess
import os
from pymongo import MongoClient
import base64
from PIL import Image
from anil_server import app1
import io
import yaml
app = Flask(__name__)

# Dictionary to keep track of launched processes
processes = {}

# MongoDB setup
client = MongoClient('mongodb://localhost:27017/')
db = client['map_database']
collection = db['maps']

# Define the directory to save maps
MAP_DIR = '/home/vijay/Music/react-ros-robot1/flask-backend/maps'

# Ensure the directory exists
if not os.path.exists(MAP_DIR):
    os.makedirs(MAP_DIR)

@app.route('/launch_gazebo', methods=['POST'])
def launch_gazebo():
    if 'gazebo' in processes:
        return jsonify(message="Already running", success=False), 400
    try:
        proc = subprocess.Popen(['roslaunch', 'hw_t', 'hardware.launch'])
        processes['gazebo'] = proc
        return jsonify(message="Started", success=True), 200
    except Exception as e:
        return jsonify(message="Error launching turtlebot3_world.launch: {}".format(e), success=False), 500


@app.route('/launch_slam_gmapping', methods=['POST'])
def launch_slam_gmapping():
    terminate_process('navigation') 
    if 'slam_gmapping' in processes:
        return jsonify(message="Already running", success=False), 400
    try:
        proc = subprocess.Popen(['roslaunch', 'hw_t', 'mapping.launch', 'slam_methods:=gmapping'])
        processes['slam_gmapping'] = proc
        return jsonify(message="Start Mapping", success=True), 200
    except Exception as e:
        return jsonify(message="Error launching turtlebot3_slam.launch: {}".format(e), success=False), 500


# @app.route('/launch_bridge', methods=['POST'])
# def launch_bridge():
#     if 'bridge' in processes:
#         return jsonify(message="Already Connected", success=False), 400
#     try:
#         proc = subprocess.Popen(['roslaunch', 'rosbridge_server', 'rosbridge_websocket.launch'])
#         processes['bridge'] = proc
#         return jsonify(message="You are connected to the robot..", success=True), 200
#     except Exception as e:
#         return jsonify(message="Error launching ROS Bridge: {}".format(e), success=False), 500


@app.route('/terminate/<string:process_name>', methods=['POST'])
def terminate_process(process_name):
    if process_name in processes:
        processes[process_name].terminate()
        processes[process_name].wait()
        del processes[process_name]
        return jsonify(message="Terminated", success=True), 200
    else:
        return jsonify(message="No process found", success=False), 404


@app.route('/save_map', methods=['POST'])
def save_map():
    data = request.get_json()
    map_name = data.get('name')
    user_name= data.get('user')
    map_path = os.path.join(MAP_DIR, map_name)
    print('recived data', data)
    try:
        # Run map_saver to save the map
        print('inside try block')
        proc = subprocess.Popen(['rosrun', 'map_server', 'map_saver', '-f', map_path])
        proc.wait()
        terminate_process('slam_gmapping')
        # Read the map files and store them in MongoDB
        with open("{}.pgm".format(map_path), 'rb') as pgm_file, open("{}.yaml".format(map_path), 'r') as yaml_file:
            pgm_data = base64.b64encode(pgm_file.read()).decode('utf-8')  # Encode PGM data as Base64
            yaml_data = yaml_file.read()
            collection.insert_one({
                'name': map_name,
                'user': user_name,
                'pgm': pgm_data,
                'yaml': yaml_data
            })
            print('inserted document')
        return jsonify(message="Map saved successfully", success=True), 200
    except Exception as e:
        return jsonify(message="Error saving map: {}".format(e), success=False), 500


@app.route('/maps', methods=['GET'])
def get_maps():
    maps = collection.find({}, {"_id": 0, "name": 1})
    map_names = [map['name'] for map in maps]
    return jsonify(map_names)


# @app.route('/launch_navigation', methods=['POST'])
# def launch_navigation():
#     terminate_process('slam_gmapping')
#     if 'navigation' in processes:
#         return jsonify(message="Stop navigation which is already running", success=False), 400
#     data = request.get_json()
#     map_name = data.get('map_name')
#     if map_name:
#         try:
#             proc = subprocess.Popen(['roslaunch', 'hw_t', 'navigation.launch', 'map_file:={}/{}.yaml'.format(MAP_DIR, map_name)])
#             processes['navigation'] = proc
#             return jsonify(message="Launching navigation with {} map.".format(map_name), success=True), 200
#         except Exception as e:
#             return jsonify(message="Error launching navigation: {}".format(e), success=False), 500
#     else:
#         return jsonify(message="No map name provided.", success=False), 400
    
@app.route('/launch_navigation', methods=['POST'])
def launch_navigation():
    terminate_process('slam_gmapping')
    
    if 'navigation' in processes:
        return jsonify(message="Stop navigation which is already running", success=False), 400

    data = request.get_json()
    map_names = data.get('map_names', [])
    navigation_type = data.get('navigation_type', 'normal')

    if navigation_type == "restricted" and len(map_names) != 2:
        return jsonify(message="Please select exactly two maps for restricted navigation.", success=False), 400
    elif navigation_type == "normal" and len(map_names) != 1:
        return jsonify(message="Please select exactly one map for normal navigation.", success=False), 400

    try:
      
        if navigation_type == "restricted":
            map_file_1 = "{}/{}.yaml".format(MAP_DIR, map_names[0])
            map_file_2 = "{}/{}.yaml".format(MAP_DIR, map_names[1])
            print("one"+map_file_1,"two"+map_file_2)
            proc = subprocess.Popen([
                'roslaunch', 'hw_t', 'navigation.launch', 
                'map_file_1:={}'.format(map_file_1),
                'map_file_2:={}'.format(map_file_2)
            ])
        else:
            map_file_1= "{}/{}.yaml".format(MAP_DIR, map_names[0])
            map_file_2= "{}/{}.yaml".format(MAP_DIR, map_names[0])
            print("one"+map_file_1,"two"+map_file_2)
            proc = subprocess.Popen([
                'roslaunch', 'hw_t', 'navigation.launch',
                'map_file_1:={}'.format(map_file_1),
                'map_file_2:={}'.format(map_file_2)
            ])
        
        processes['navigation'] = proc
        return jsonify(message="Launching navigation with maps: {}.".format(", ".join(map_names)), success=True), 200

    except Exception as e:
        return jsonify(message="Error launching navigation: {}".format(e), success=False), 500
  
# @app.route('/edit_map', methods=['POST'])
# def edit_map():
#     data = request.get_json()
#     old_name = data.get('oldName')
#     new_name = data.get('newName')
    
#     if not old_name or not new_name:
#         return jsonify(message="Old and new map names must be provided.", success=False), 400

#     map_path_old = os.path.join(MAP_DIR, old_name)
#     map_path_new = os.path.join(MAP_DIR, new_name)

#     try:
#         # Rename map files
#         if os.path.exists("{}.pgm".format(map_path_old)):
#             os.rename("{}.pgm".format(map_path_old), "{}.pgm".format(map_path_new))
#         if os.path.exists("{}.yaml".format(map_path_old)):
#             os.rename("{}.yaml".format(map_path_old), "{}.yaml".format(map_path_new))

#         # Update map name in MongoDB
#         result = collection.update_one({'name': old_name}, {'$set': {'name': new_name}})
#         if result.modified_count > 0:
#             return jsonify(message="Map name updated successfully", success=True), 200
#         else:
#             return jsonify(message="Map name not found", success=False), 404

#     except Exception as e:
#         return jsonify(message="Error updating map: {}".format(e), success=False), 500

@app.route('/delete_map', methods=['POST'])
def delete_map():
    data = request.get_json()
    map_name = data.get('name')
    
    if not map_name:
        return jsonify(message="Map name must be provided.", success=False), 400

    map_path = os.path.join(MAP_DIR, map_name)

    try:
        # Delete map files
        if os.path.exists("{}.pgm".format(map_path)):
            os.remove("{}.pgm".format(map_path))
        if os.path.exists("{}.yaml".format(map_path)):
            os.remove("{}.yaml".format(map_path))

        # Remove map from MongoDB
        result = collection.delete_one({'name': map_name})
        if result.deleted_count > 0:
            return jsonify(message="Map deleted successfully", success=True), 200
        else:
            return jsonify(message="Map not found", success=False), 404

    except Exception as e:
        return jsonify(message="Error deleting map: {}".format(e), success=False), 500
            
@app.route('/get_map_image/<string:map_name>', methods=['GET'])
def get_map_image(map_name):
    """Fetches a PGM image from MongoDB, converts it to PNG, and serves it."""
    map_data = collection.find_one({"name": map_name}, {"_id": 0, "pgm": 1})
    
    if not map_data or 'pgm' not in map_data:
        return jsonify(message="PGM map not found in database.", success=False), 404

    try:
        pgm_bytes = base64.b64decode(map_data['pgm'])
        pgm_stream = io.BytesIO(pgm_bytes)
        
        with Image.open(pgm_stream) as img:
            img = img.convert("L")
            png_path = os.path.join(MAP_DIR, "{}.png".format(map_name))
            img.save(png_path, format="PNG")
        
        return send_from_directory(MAP_DIR, "{}.png".format(map_name))
    
    except Exception as e:
        return jsonify(message="Error converting PGM to PNG: {}".format(str(e)), success=False), 500

@app.route('/save_edited_map', methods=['POST'])
def save_edited_map():
    data = request.get_json()
    original_name = data.get('name')  # This is the base name entered by user
    image_data = data.get('image').replace('data:image/png;base64,', '')
    image_data = base64.b64decode(image_data)

    
    base_name = "{}".format(original_name)
    map_name = base_name
    counter = 1
    while collection.find_one({"name": map_name}):
        map_name = "{}_v{}".format(base_name,counter)
        counter += 1

   
    original_map_record= collection.find_one({"name": original_name}, {"_id": 0, "pgm": 1,"yaml":1})
    if not original_map_record:
        return jsonify(message="Original map not found.", success=False), 404

    pgm_bytes = base64.b64decode(original_map_record['pgm'])
    pgm_stream = io.BytesIO(pgm_bytes)
    with Image.open(pgm_stream) as img:
        original_size = img.size  

    png_path = os.path.join(MAP_DIR, "{}.png".format(map_name))
    pgm_path = os.path.join(MAP_DIR, "{}.pgm".format(map_name))
    yaml_path = os.path.join(MAP_DIR, "{}.yaml".format(map_name))
   
    try:

        with open(png_path, 'wb') as f:
            f.write(image_data)

     
        with Image.open(png_path) as img:
            img = img.convert('L').resize(original_size, Image.LANCZOS)
            img.save(pgm_path, format="PPM")
        
        original_yaml_data=yaml.safe_load(original_map_record['yaml'])
        original_yaml_data['image']=os.path.join(MAP_DIR,"{}.pgm".format(map_name))


        with open(yaml_path, 'w') as yaml_file:
            yaml.dump(original_yaml_data,yaml_file ,default_flow_style=False)

        with open(pgm_path, 'rb') as pgm_file:
            pgm_data = base64.b64encode(pgm_file.read()).decode('utf-8')

        collection.insert_one({
            'name': map_name,
            'pgm': pgm_data,
            'yaml': yaml.dump(original_yaml_data)
        })

        return jsonify(message="Map saved as {}".format(map_name), success=True), 200

    except Exception as e:
        return jsonify(message="Error saving edited map: {}".format(str(e)), success=False), 500
app.register_blueprint(app1)
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)