import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service
} from "homebridge";

let hap: HAP;

export = (api: API) => {
  // Service = homebridge.hap.Service
  // Characteristic = homebridge.hap.Characteristic
  hap = api.hap;
  api.registerAccessory('homebridge-ble-ultimatron-battery', 'BLEUltimatronSensor', UltimatronBatteryAccessory)
};

class UltimatronBatteryAccessory implements AccessoryPlugin {
  private readonly log: Logging
  private readonly chargingSwitchService: Service

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log
    this.chargingSwitchService = new hap.Service.Switch(config.name + 'Charging')
    
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

  getServices(): Service[] {
    return [this.chargingSwitchService]
  }
}
