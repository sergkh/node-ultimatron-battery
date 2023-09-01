"use strict";
let hap;
class UltimatronBatteryAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.chargingSwitchService = new hap.Service.Switch(config.name + 'Charging');
        const characteristic = this.chargingSwitchService.getCharacteristic(hap.Characteristic.On);
        // characteristic.on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        //   log.info("Current state of the switch was returned: " + (this.switchOn ? "ON" : "OFF"));
        //   callback(undefined, this.switchOn);
        // })
        // characteristic.on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        //   console.log(`执行脚本：node ${[value ? this.onNode : this.offNode]}`)
        //   let spawnSyncRes = spawnSync("node", [value ? this.onNode : this.offNode], { encoding: "utf-8" })
        //   console.log("执行结果:", spawnSyncRes.stdout)
        //   this.switchOn = value as boolean;
        //   callback()
        // })
    }
    getServices() {
        return [this.chargingSwitchService];
    }
}
module.exports = (api) => {
    // Service = homebridge.hap.Service
    // Characteristic = homebridge.hap.Characteristic
    hap = api.hap;
    api.registerAccessory('homebridge-ble-ultimatron-battery', 'BLEUltimatronSensor', UltimatronBatteryAccessory);
};
//# sourceMappingURL=index.js.map