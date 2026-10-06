#include <modbus/modbus.h>
#include <iostream>
#include <vector>
#include <unistd.h> // for sleep
#include <stdint.h> // int32_t, uint32_t

modbus_t *mod;
int motor_status = 0;

// ---------- Helper Functions ----------

// Two's complement conversion
int32_t two_cmp(uint32_t val, int bits) {
    if (val >= (1u << (bits - 1))) {
        return (int32_t)(val - (1u << bits));
    }
    return (int32_t)val;
}

// Extract set bits from value
std::vector<int> getBits(uint32_t val, int bits) {
    std::vector<int> bit_list;
    for (int i = 0; i < bits; i++) {
        if (val & (1u << i)) bit_list.push_back(i);
    }
    return bit_list;
}

// ---------- Modbus Read/Write ----------

int32_t readRegister(int address, int slave, bool signed_mode) {
    modbus_set_slave(mod, slave);
    uint16_t reg[1];
    if (modbus_read_registers(mod, address, 1, reg) == -1) {
        std::cerr << "Error reading register (slave " << slave << ")" << std::endl;
        motor_status = 0;
        return 0;
    }
    motor_status = 1;
    return signed_mode ? two_cmp(reg[0], 16) : reg[0];
}

int32_t longRead(int address, int slave, bool unsigned_mode, int32_t prev) {
    modbus_set_slave(mod, slave);
    uint16_t reg[2];
    if (modbus_read_registers(mod, address, 2, reg) == -1) {
        std::cerr << "Error reading long register (slave " << slave << ")" << std::endl;
        motor_status = 0;
        return prev;
    }
    motor_status = 1;
    uint32_t value = ((uint32_t)reg[0] << 16) | reg[1]; // swap if hardware requires
    return unsigned_mode ? (int32_t)value : two_cmp(value, 32);
}

void writeRegister(int address, int value, int slave) {
    modbus_set_slave(mod, slave);
    if (modbus_write_register(mod, address, value) == -1) {
        std::cerr << "Error writing register (slave " << slave << ")" << std::endl;
        motor_status = 0;
    } else {
        motor_status = 1;
    }
}

void longWrite(int address, int32_t value, int slave) {
    modbus_set_slave(mod, slave);
    uint16_t msb = (value >> 16) & 0xFFFF;
    uint16_t lsb = value & 0xFFFF;
    uint16_t regs[2] = {msb, lsb};
    if (modbus_write_registers(mod, address, 2, regs) == -1) {
        std::cerr << "Error writing long register (slave " << slave << ")" << std::endl;
        motor_status = 0;
    } else {
        motor_status = 1;
    }
}

// ---------- Motor Control ----------

bool brakeStatus(int slave) {
    int val = readRegister(4, slave, false);
    return (val & 4) == 4;
}

void resetAlarm() {
    writeRegister(124, 186, 1);
    writeRegister(124, 186, 2);
    std::cout << "Alarms reset" << std::endl;
}

void startJog() {
    writeRegister(124, 159, 1);
    writeRegister(124, 159, 2);
    if (brakeStatus(1) || brakeStatus(2)) {
        motor_status = 3;
        std::cout << "Brake engaged, reset alarm" << std::endl;
    } else {
        writeRegister(124, 150, 1);
        writeRegister(124, 150, 2);
        std::cout << "Jog started" << std::endl;
    }
}

void stopJog() {
    writeRegister(124, 226, 1);
    writeRegister(124, 226, 2);
    writeRegister(124, 158, 1);
    writeRegister(124, 158, 2);
    std::cout << "Jog stopped" << std::endl;
}

void disableMotor() {
    writeRegister(124, 158, 1);
    writeRegister(124, 158, 2);
    std::cout << "Motor disabled" << std::endl;
}

std::vector<int> readAlarm(int slave) {
    int32_t val = longRead(0, slave, false, 0);
    std::vector<int> alarms = getBits(val, 32);

    std::vector<std::string> alarm_messages = {
        "position error overrun", "reverse prohibition limit", "positive prohibition limit",
        "over temperature", "internal error", "supply voltage out of range", "reserved",
        "drive overcurrent", "reserved", "motor encoder not connected", "communication exception",
        "reserved", "vent failure", "motor overload protection", "reserved", "unusual start alarm",
        "input phase loss", "STO", "reserved", "motor speed exceeds limit", "drive undervoltage",
        "emergency stop", "second encoder not connected", "full closed loop deviation overrun",
        "absolute encoder battery undervoltage", "accurate position lost", "absolute position overflow",
        "communication interrupt", "absolute encoder multi-turn error", "abnormal motor action protection",
        "EtherCAT communication error", "Back to origin parameter configuration error"};

    for (int i : alarms) {
        if (i < (int)alarm_messages.size())
            std::cout << "Alarm: " << alarm_messages[i] << std::endl;
    }
    return alarms;
}

void setSpeed(int motor_add, int32_t speed1, int32_t speed2) {
    if (motor_add & 10) {         // If bit 1 or bit 3 is set (10 decimal = 0b1010)
        longWrite(342, speed2, 2); // Write to motor 2 (slave 2)
    }
    if (motor_add & 1) {          // If bit 0 is set
        longWrite(342, speed1, 1); // Write to motor 1 (slave 1)
    }
}

std::pair<int32_t,int32_t> getSpeed() {
    int32_t vel1 = readRegister(16, 1, true);
    int32_t vel2 = readRegister(16, 2, true); 
    return {vel1, vel2};
}

std::pair<int32_t,int32_t> getEncoder(int32_t prev1, int32_t prev2) {
    int32_t enc1 = longRead(10, 1, false, prev1);
    int32_t enc2 = longRead(10, 2, false, prev2);
    return {enc1, enc2};
}

void setEncoder(std::pair<int32_t,int32_t> enc) {
    std::cout << "SetEncoder: " << enc.first << ", " << enc.second << std::endl;
    longWrite(125, enc.first, 1);
    writeRegister(124, 0x98, 1);
    longWrite(125, enc.second, 2);
    writeRegister(124, 0x98, 2);
}

// ---------- End / Close ----------

void end() {
    stopJog();
    std::cout << "Closing connection" << std::endl;
    modbus_close(mod);
    modbus_free(mod);
}

// ---------- Main ----------

int main() {
    mod = modbus_new_rtu("/dev/ttyUSB0", 115200, 'N', 8, 1);
    if (!mod) {
        std::cerr << "Unable to allocate Modbus context" << std::endl;
        return -1;
    }

    if (modbus_connect(mod) == -1) {
        std::cerr << "Connection failed: " << modbus_strerror(errno) << std::endl;
        modbus_free(mod);
        return -1;
    }

    std::cout << "Motor connection status: Connected" << std::endl;
    sleep(1);
	
	int32_t prev1=0, prev2=0;
	auto encoders=getEncoder(prev1, prev2);
	std::cout << "Left motor encoder: " << encoders.first << std::endl;
        std::cout << "Right motor encoder: " << encoders.second << std::endl;
    // Example usage
    resetAlarm();
    // startJog();
    // //setSpeed(10, 0, 1000);  // motor_add=1 → sets speed1=1000
    // setSpeed(10,1000,1000);

    // sleep(2); // run for 2 sec
    // stopJog();
    // end();

    return 0;
}
