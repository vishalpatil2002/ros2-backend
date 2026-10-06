#pragma once
#include <modbus/modbus.h>
#include <vector>
#include <utility>

class Moons {
public:
    Moons();
    ~Moons();
    bool isConnected() const;

    // ==== Core interface ====
    void resetAlarm();
    void startJog();
    void stopJog();
    void disableMotor();  // (optional, can be empty if unused)
    void setSpeed(int motor_add, int speed1, int speed2);
    std::pair<int,int> getSpeed();
    std::pair<int,int> getEncoder(int prev1, int prev2);
    void setEncoder(std::pair<int,int> enc);
    std::vector<int> readAlarm(int slave);
    std::pair<int,int> getCurrent();

    // ==== Add these as public so TaurusHardware can access them ====
    int32_t readRegister(int address, int slave, bool signed_mode);
    int32_t longRead(int address, int slave, bool unsigned_mode, int32_t prev);
    void longWrite(int address, int32_t value, int slave);
    void end();  // cleanup
    bool brakeStatus(int slave);

private:
    modbus_t* mod_;
    int motor_status_;
    bool connected_;

    // Helper functions
    int32_t two_cmp(uint32_t val, int bits);
    std::vector<int> getBits(uint32_t val, int bits);
    void writeRegister(int address, int value, int slave);
};