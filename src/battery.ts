const noble = require('@abandonware/noble')

const cmdVoltage = Buffer.from("dda50400fffc77", 'hex')
const cmdDetails = Buffer.from("dda50300fffd77", 'hex')

// const cmdBattery = Buffer.from("dda5aa00ff5677", 'hex')
// battery output:
//Notification handle = 0x0011 value: dd aa 00 18 00 01 00 00 00 00 2f 53 00 00 00 00 00 03 00 00
//Notification handle = 0x0011 value: 00 00 00 01 00 00 00 2a ff 37 77

const batteryServiceId = 'ff00'
const notifyCharId = 'ff01'
const writeCharId = 'ff02'

const cmdEnableChargeOnly          = Buffer.from('dd5ae1020002ff1b77', 'hex')
const cmdEnableDischargeOnly       = Buffer.from('dd5ae1020001ff1c77', 'hex')
const cmdEnableChargeAndDischarge  = Buffer.from('dd5ae1020000ff1d77', 'hex')
const cmdDisableChargeAndDischarge = Buffer.from('dd5ae1020003ff1a77', 'hex')

const scanTimeout = 120*1000

export interface InOutStatus {
  charging: boolean,
  discharing: boolean 
}

export interface BatteryState {
  voltage: number,
  current: number,
  residualCapacity: number,
  standardCapacity: number,
  cycles: number,
  prodDate: number,
  stateProtection: number,
  swVersion: number,
  residualCapacityPercent: number,
  status: InOutStatus,
  batteryNo: number,
  temperatures: number[],
  stamp: Date
}

// volatage is mainly ignored for now
export interface BatteryVoltage {
  voltages: number[],
  stamp: Date
}

export class UltimatronBattery {
  name: string
  /** Shared mode means that device migth by other apps and we need to release the connection between state fetches or updates */
  sharedMode: boolean  
  private updateInterval = 30000
  private device: any | null = null
  private writeChar: any | null = null
  private state: BatteryState | null = null
  private voltages: BatteryVoltage | null = null
  private pollerId: any | null = null
  private stateListeners: ((a: BatteryState) => void)[] = []
  private connected: boolean = false

  private constructor(name: string, shared: boolean = false, updateInterval: number) { // TODO: make private
    this.name = name
    this.sharedMode = shared
    this.updateInterval = updateInterval
  }

  static async forName(name: string, shared: boolean = false, updateIntervalMs: number = 30000): Promise<UltimatronBattery> {
    const battery = new UltimatronBattery(name, shared, updateIntervalMs)
    var connected = false

    return await new Promise((resolve, reject) => {
      // Fail after 'scanTimeout' milliseconds
      setTimeout(() => {
        if (!connected) {
          noble.stopScanningAsync().then(() => {
            if(!connected) reject(Error('Timeout while looking for a device'))
          })
          
        }
      }, scanTimeout)

      noble.on('stateChange', async (state: any) => {
        if (state === 'poweredOn') {
          console.log('Started device scanning')
          await noble.startScanningAsync([batteryServiceId], false)
        } else {
          await noble.stopScanningAsync()
        }
      })
  
      noble.on('discover', async (peripheral: any) => {
        if (peripheral.advertisement.localName !== name) return     
        await noble.stopScanningAsync()
        await battery.initialSetup(peripheral)
        connected = true
        resolve(battery)
      })
    })
  }

  static async findAll(scanTimeoutMs: number, limit: number, shared: boolean = false, updateIntervalMs: number = 30000): Promise<UltimatronBattery[]> {
    const batteries: UltimatronBattery[] = []

    return await new Promise((resolve, reject) => {
      // Return whatever we found in specified time
      const timeout = setTimeout(() => noble.stopScanningAsync().then(() => resolve(batteries)), scanTimeoutMs)

      noble.on('stateChange', async (state: any) => {
        if (state === 'poweredOn') {
          console.log('Started device scanning')
          await noble.startScanningAsync([batteryServiceId], false)
        } else {
          await noble.stopScanningAsync()
        }
      })
  
      noble.on('discover', async (peripheral: any) => {
        if (batteries.find(b => b.name === peripheral.advertisement.localName)) {
          console.log('Ignoring already found battery:', peripheral.advertisement.localName)
        } else {
          console.log("Found a battery: " + peripheral.advertisement.localName)

          const battery = new UltimatronBattery(peripheral.advertisement.localName, shared, updateIntervalMs)
          batteries.push(battery)
          
          try {
            await noble.stopScanningAsync()            
            await battery.initialSetup(peripheral)
            await noble.startScanningAsync([batteryServiceId], false)
          } catch (e) {
            reject(e)
            return ;
          }
          
          // Early return
          if (batteries.length == limit) {
            console.log("Found enough batteries. Returning")
            clearTimeout(timeout)
            resolve(batteries)
            noble.stopScanningAsync()
          }
        }
      })
    })
  }

  async initialSetup(peripheral: any) {
    try {
      this.device = peripheral
      console.log("initializing battery")

      this.device.once('disconnect', () => {
        this.connected = false
      })

      await this.connect()

      await this.writeCommand(cmdDetails)    
      this.initPoller()

    } catch (e) {
      console.log("Initialization error", e)
      throw e
    }
  }

  async connect() {
    if(!this.connected) {
      console.log("connecting to device")
      await this.device.connectAsync()
      this.connected = true

      console.log("Getting characteristics")
      const {characteristics} = await this.device.discoverSomeServicesAndCharacteristicsAsync([batteryServiceId])
      console.log("Got characteristics")

      const notifyChar = characteristics.find((c: any) => c.uuid == notifyCharId)
      this.writeChar = characteristics.find((c: any) => c.uuid == writeCharId)

      var bufferPart: Buffer | null = null
      notifyChar.on('data', (buffer: Buffer) => {        
        try {
          if (this.header(buffer) === 'dd03') {
            console.log('[Data] leaving for later: ' + buffer.toString('hex'))
            bufferPart = buffer
          } else {            
            console.log('[Data] last chunk: ' + buffer.toString('hex'))
            this.messagesRouter(bufferPart ? Buffer.concat([bufferPart, buffer]) : buffer)        
            bufferPart = null
          }
        } catch(e) {
          console.log("Error", e)
          bufferPart = null
        }

      })
      
      await notifyChar.subscribeAsync()
      await this.writeCommand(cmdDetails)
      
      console.log("Connected to device")
    } else {
      console.log("already connected")
    }
  }

  async disconnect() {
    console.log('Disconnecting')
    const device = this.device
    if (device) {
      await device.disconnectAsync()
      device.removeAllListeners()
      this.writeChar = null
      this.connected = false
    } 
  }

  setUpdateInterval(intervalMs: number) {
    this.updateInterval = intervalMs
  }

  async shutdown() {
    await this.disconnect()    
    if (this.pollerId) clearTimeout(this.pollerId)
  }

  onStateUpdate(fn: (a: BatteryState) => void) {
    this.stateListeners.push(fn) 
  }

  private async initPoller() {
    this.pollerId = setTimeout(() => this.polling(), 1000) // smal initial timeout
    this.pollerId = setInterval(() => this.polling(), this.updateInterval)
  }

  private async polling(tries: number = 5) {    
    await this.connect()
    await this.writeCommand(cmdDetails)

    if (this.sharedMode) {
      console.log('[shared mode] waiting for state')
      try {
        await this.awaitForState();
    } catch (e) {
        // device not always responds on the first details command
        if (tries > 0) {
            await this.polling(tries - 1)
        } else {
            throw e
        }
    }
      console.log('[shared mode] disconnecting')
      await this.disconnect()
    }
  }

  getState(): BatteryState | null {
    return this.state
  }

  getVoltages(): BatteryVoltage | null {
    return this.voltages
  }

  async toggleChargingAndDischarging(charging: boolean = true, discharging: boolean = true): Promise<UltimatronBattery> {
    console.log("Toggling charge and discharge: ", charging, discharging)
    await this.writeCommand(this.commandForStates(charging, discharging))
    await this.writeCommand(cmdDetails)
    await this.awaitForState()
    return this
  }

  async toggleDischarging(enable: boolean = true): Promise<UltimatronBattery> {
    console.log("Toggling discharge: ", enable)
    const state = (this.state != null) ? this.state : await this.awaitForState()
    await this.writeCommand(this.commandForStates(state.status.charging, enable))
    await this.writeCommand(cmdDetails)
    await this.awaitForState()
    return this;
  }

  async toggleCharging(enable: boolean = true): Promise<UltimatronBattery> {
    console.log("Toggling charge: ", enable)
    const state = (this.state != null) ? this.state : await this.awaitForState()
    await this.writeCommand(this.commandForStates(enable, state.status.discharing))
    await this.writeCommand(cmdDetails)
    await this.awaitForState()
    return this;
  }

  // Returns a proper command to toggle battery charge or discharge
  private commandForStates(charge: boolean, discharge: boolean): Buffer {
    if (charge) {
      return discharge ? cmdEnableChargeAndDischarge : cmdEnableChargeOnly
    } else {
      return discharge ? cmdEnableDischargeOnly : cmdDisableChargeAndDischarge
    }
  }

  async awaitForState(): Promise<BatteryState> {
    const curState = this.state
    console.log('[state await] current: ', curState)

    return await new Promise((resolve, reject) => {
      const stateAwait = (waitIterations: number) => {
        setTimeout(() => { 
          if (this.state !== curState) {
            console.log('[state await] state updated to: ', this.state)
            resolve(this.state!)
          } else if (waitIterations > 0) {
            stateAwait(waitIterations - 1)
          } else {
            reject(new Error("Timed out while waiting for the initial battery state"))
          }
        }, 20);
      }

      stateAwait(500)
    })
  }
 
  private async writeCommand(cmd: Buffer) {
    if (this.writeChar == null) throw "Device is not initialized"
    console.log("writing cmd: " + cmd.toString('hex'))
    return await this.writeChar.write(cmd, true)
  }

  private messagesRouter(buf: Buffer) {
    console.log("Processing data: " + buf.toString('hex'))
    switch(this.header(buf)) {
      case 'dd03': 
        this.state = this.processBatteryData(buf)        
        this.stateListeners.forEach((listener) => listener(this.state!))
        break;
      case 'dd04': 
        this.voltages = this.processVoltageData(buf)
        break;
      default: 
        console.log("Ignoring incoming buffer: " + buf.toString('hex'))
    }
  }

  // dd03001b053000dd0400080cf500dd03001b0530000023ce2710000c2a8c000000001000225c0104
  private processBatteryData(buf: Buffer) {
    const current = buf.readUint16BE(6) / 100

    return {
      voltage: buf.readUint16BE(4) / 100,
      current: current > 327.68 ? current - 655.36 : current,
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
      temperatures: this.getTemperatures(buf),
      stamp: new Date()
    } as BatteryState
  }
  
  // example data: dd0400080d000d020d030d04ffbb77
  private processVoltageData(buf: Buffer) {
    const voltageBuf = buf.subarray(4, buf.length-3)
    const count = voltageBuf.length / 2
    var voltages  = []
    for (var i = 0; i < count; i++) {
      voltages.push(voltageBuf.readInt16BE(i*2) / 1000)
    }

    return {
      voltages: voltages,
      stamp: new Date()
    } as BatteryVoltage
  }

  private parseDate(num: number) {
    return Date.parse(((num >> 9) + 2000) + "-" + 
      ((num >> 5) & 15).toString().padStart(2, '0') + "-" + 
      (31 & num).toString().padStart(2, '0'))
  }

  private getTemperatures(buf: Buffer) {
    const offset = 4 + 22
    const size = buf[offset]
    const array = []
    for (let i = 0; i < size; i++) {
      const nextOffset = offset + 1 + i*2
      if (buf.length - 3 > nextOffset + 1) {
        const temp = (buf.readInt16BE(nextOffset) - 2731) / 10
        array.push(temp)
      }
    }

    return array
  }

  private header(buf: Buffer) {
    return buf.subarray(0, 2).toString('hex')
  }
}
