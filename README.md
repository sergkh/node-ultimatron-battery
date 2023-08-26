# Ultimatron battery BMS
Javascript interface for Ultimatron battery BMS via BLE. Using node-ble under the hood.
Allows getting battery information update and managing charge and discharge statuses.

## Obtaining battery MAC address

The simplest way is to scan for all devices without duplicates:

```bash
sudo hcitool -i hci0 lescan | head -n 100 | sort -u
```

Battery would have a name like '12100AE2500733'.

## Usage

```typescript
// create an instance
const device = new UltimatronBattery('DEVICE MAC')

// subscribe to state updates, required for operations as well
await device.startScan()

// change chargind and discharging state
await device.toggleChargingAndDischarging(true, true)

// get cached state and voltage
console.log("Battery state:", device.getState())
console.log("Battery voltage:", device.getVoltage())

// release the BLE connection of the device
device.disconnect()

```
