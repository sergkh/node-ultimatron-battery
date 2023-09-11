"use strict";
const noble = require('@abandonware/noble');
const cmdVoltage = Buffer.from("dda50400fffc77", 'hex');
const cmdDetails = Buffer.from("dda50300fffd77", 'hex');
// const cmdBattery = Buffer.from("dda5aa00ff5677", 'hex')
// battery output:
//Notification handle = 0x0011 value: dd aa 00 18 00 01 00 00 00 00 2f 53 00 00 00 00 00 03 00 00
//Notification handle = 0x0011 value: 00 00 00 01 00 00 00 2a ff 37 77
const batteryServiceId = 'ff00';
const notifyCharId = 'ff01';
const writeCharId = 'ff02';
const cmdEnableChargeOnly = Buffer.from('dd5ae1020002ff1b77', 'hex');
const cmdEnableDischargeOnly = Buffer.from('dd5ae1020001ff1c77', 'hex');
const cmdEnableChargeAndDischarge = Buffer.from('dd5ae1020000ff1d77', 'hex');
const cmdDisableChargeAndDischarge = Buffer.from('dd5ae1020003ff1a77', 'hex');
class UltimatronBattery {
    constructor(name) {
        this.updateInterval = 10000;
        this.device = null;
        this.writeChar = null;
        this.state = null;
        this.voltages = null;
        this.name = name;
        noble.on('stateChange', async (state) => {
            if (state === 'poweredOn') {
                console.log('Started device scanning');
                await noble.startScanningAsync([batteryServiceId], false);
            }
            else {
                await noble.stopScanningAsync();
            }
        });
        noble.on('discover', async (peripheral) => {
            if (peripheral.advertisement.localName !== this.name)
                return;
            await noble.stopScanningAsync();
            this.connectToDevice(peripheral);
        });
    }
    async connectToDevice(peripheral) {
        this.device = peripheral;
        console.log("Device found");
        // TODO: remove me
        setInterval(async () => {
            await peripheral.disconnectAsync();
            process.exit(0);
        }, 120000);
        peripheral.once('disconnect', () => {
            peripheral.removeAllListeners();
            // TODO: this.connectToDevice(peripheral)
        });
        await peripheral.connectAsync();
        console.log("Device connected");
        const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([batteryServiceId]);
        const notifyChar = characteristics.find((c) => c.uuid == notifyCharId);
        this.writeChar = characteristics.find((c) => c.uuid == writeCharId);
        var bufferPart = null;
        notifyChar.on('data', (buffer) => {
            try {
                console.log("DBG buf: ", buffer);
                console.log("Header: ", this.header(buffer));
                if (this.header(buffer) === 'dd03') {
                    console.log("Saving buffer part for later");
                    bufferPart = buffer;
                }
                else {
                    console.log("Processing data");
                    this.messagesRouter(bufferPart ? Buffer.concat([bufferPart, buffer]) : buffer);
                    if (this.state)
                        console.log("State", this.state);
                    if (this.voltages)
                        console.log("Voltages", this.voltages);
                    bufferPart = null;
                }
            }
            catch (e) {
                console.log("Error", e);
            }
        });
        await notifyChar.subscribeAsync();
        await this.writeCommand(cmdVoltage);
        await this.writeCommand(cmdDetails);
        console.log("started polling");
        this.polling();
        // const batteryLevel = (await characteristics[0].readAsync())[0];
        // peripheral.connect(function(error: any) {
        //   if (error) { this.shutdown(error) }
        //     peripheral.discoverSomeServicesAndCharacteristics([ serviceUUID ], [ writeUUID, notifyUUID ], function(error, services, characteristics) {
        //       if (error) { shutdown(error); }
        //       var service = services[0]
        //       var write = characteristics[0], notify = characteristics[1]
        //       notify.on('data', function(data, isNotification) {
        //         const response = FanResponse.fromBuffer(data)
        //         if (response) {
        //           console.log(response)
        //         } else {
        //           console.log('sent')
        //         }
        //         process.exit()
        //       })
        //   }
        // }
    }
    polling() {
        var cmdCounter = 0;
        setInterval(() => {
            switch (cmdCounter++) {
                case 0:
                    this.writeCommand(cmdDetails);
                    break;
                case 1:
                    this.writeCommand(cmdVoltage);
                    break;
            }
            if (cmdCounter > 1)
                cmdCounter = 0;
        }, this.updateInterval);
    }
    shutdown(error) {
        console.log('Failure, shutting down: ', error);
        process.exit(1);
    }
    getState() {
        return this.state;
    }
    getVoltages() {
        return this.voltages;
    }
    async toggleChargingAndDischarging(charging = true, discharging = true) {
        await this.writeCommand(this.commandForStates(charging, discharging));
        this.state = null;
        await this.writeCommand(cmdDetails);
        await this.awaitForState();
        return this;
    }
    async toggleDischarging(enable = true) {
        const state = (this.state != null) ? this.state : await this.awaitForState();
        await this.writeCommand(this.commandForStates(state.status.charging, enable));
        this.state = null;
        await this.writeCommand(cmdDetails);
        await this.awaitForState();
        return this;
    }
    async toggleCharging(enable = true) {
        const state = (this.state != null) ? this.state : await this.awaitForState();
        await this.writeCommand(this.commandForStates(enable, state.status.discharing));
        this.state = null;
        await this.writeCommand(cmdDetails);
        await this.awaitForState();
        return this;
    }
    // Returns a proper command to toggle battery charge or discharge
    commandForStates(charge, discharge) {
        if (charge) {
            return discharge ? cmdEnableChargeAndDischarge : cmdEnableChargeOnly;
        }
        else {
            return discharge ? cmdEnableDischargeOnly : cmdDisableChargeAndDischarge;
        }
    }
    async awaitForState() {
        const self = this;
        return await new Promise((resolve, reject) => {
            var waitIterations = 10;
            function stateAwait() {
                setTimeout(() => {
                    if (self.state != null) {
                        resolve(self.state);
                    }
                    else if (waitIterations-- > 0) {
                        stateAwait();
                    }
                    else {
                        reject(new Error("Timed out while waiting for the initial battery state"));
                    }
                }, 10);
            }
            stateAwait();
        });
    }
    /*
    private async discoverByMac() {
      if (this.writeChar != null) return Promise.resolve()
  
      const adapter = await bluetooth.defaultAdapter()
      if (!await adapter.isDiscovering())
      await adapter.startDiscovery()
  
      console.log("Looking for the device")
      this.device = await adapter.waitDevice(this.mac)
  
      await adapter.stopDiscovery()
  
      console.log("Device found. Connecting")
      await this.device.connect()
  
      const gattServer = await this.device.gatt()
      const batteryService = await gattServer.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb')
      const notifyChar = await batteryService.getCharacteristic('0000ff01-0000-1000-8000-00805f9b34fb')
      
      // some responses come in 2 buffers
      var bufferPart: Buffer | null = null
      
      console.log("Subscribing to updates")
      notifyChar.on('valuechanged', (buffer: Buffer) => {
        try {
          console.log("DBG buf: ", buffer)
          console.log("Header: ", buffer.subarray(0, 2).toString('hex'))
          if (this.header(buffer) === 'dd03') {
            console.log("Saving buffer part for later")
            bufferPart = buffer
          } else {
            console.log("Processing data")
            this.messagesRouter(bufferPart ? Buffer.concat([bufferPart, buffer]) : buffer)
            bufferPart = null
          }
        } catch(e) {
          console.log("Error", e)
        }
      })
  
      notifyChar.startNotifications()
      return this.writeChar = await batteryService.getCharacteristic('0000ff02-0000-1000-8000-00805f9b34fb')
    } */
    async writeCommand(cmd) {
        if (this.writeChar == null)
            throw "Device is not initialized";
        console.log("Writing cmd: " + cmd.toString('hex'));
        return await this.writeChar.write(cmd, true);
    }
    messagesRouter(buf) {
        switch (this.header(buf)) {
            case 'dd03':
                return this.state = this.processBatteryData(buf);
            case 'dd04':
                return this.voltages = this.processVoltageData(buf);
            default:
                return console.log("Ignoring incoming buffer: " + buf.toString('hex'));
        }
    }
    processBatteryData(buf) {
        return {
            voltage: buf.readUint16BE(4) / 100,
            current: buf.readUint16BE(6) / 100,
            residualCapacity: buf.readUint16BE(8) / 100,
            standardCapacity: buf.readUint16BE(10) / 100,
            cycles: buf.readUint16BE(12),
            prodDate: this.parseDate(buf.readUint16BE(14)),
            stateProtection: buf.readUint16BE(20),
            swVersion: buf.readUint16BE(22),
            residualCapacityPercent: buf.readUint8(23),
            status: {
                charging: (buf.readUint8(24) & 1) != 0,
                discharing: (buf.readUint8(24) & 2) != 0
            },
            batteryNo: buf.readUint8(25),
            temperatures: this.getTemperatures(buf)
        };
    }
    // example data: dd0400080d000d020d030d04ffbb77
    processVoltageData(buf) {
        const voltageBuf = buf.subarray(4, buf.length - 3);
        const count = voltageBuf.length / 2;
        var voltages = [];
        for (var i = 0; i < count; i++) {
            voltages.push(voltageBuf.readInt16BE(i * 2) / 1000);
        }
        return {
            voltages: voltages
        };
    }
    parseDate(num) {
        return Date.parse(((num >> 9) + 2000) + "-" +
            ((num >> 5) & 15).toString().padStart(2, '0') + "-" +
            (31 & num).toString().padStart(2, '0'));
    }
    getTemperatures(buf) {
        const offset = 4 + 22;
        const size = buf[offset];
        const array = [];
        for (let i = 0; i < size; i++) {
            const nextOffset = offset + 1 + i * 2;
            if (buf.length - 3 > nextOffset + 1) {
                const temp = (buf.readInt16BE(nextOffset) - 2731) / 10;
                array.push(temp);
            }
        }
        return array;
    }
    header(buf) {
        return buf.subarray(0, 2).toString('hex');
    }
}
// const deviceMac = process.env.BATTERY_MAC
// if (deviceMac == null) {
//   throw new Error("Please define 'BATTERY_MAC' env variable with the battery MAC address.\n" +
//   "MAC can be found for instance using hcitool: sudo hcitool -i hci0 lescan | head -n 100 | sort -u")
// }
const device = new UltimatronBattery('12100AE2500733');
// process.on('SIGINT', function() {
//   console.log("Interrupting...");
//   device.disconnect()
//   process.exit()
// });
// device.startScan()
//   .then(d => d.toggleChargingAndDischarging(true, true))
//   .then(d => {console.log("New state with all enabled ", d.getState()); return d })
//   .then(d => d.toggleChargingAndDischarging(false, false))
//   .then(d => {console.log("New state with all disabled ", d.getState()); return d })
//# sourceMappingURL=battery.js.map