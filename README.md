# Ultimatron battery BMS
Javascript interface for Ultimatron battery BMS via BLE. Using node-ble under the hood.
Allows getting battery information update and managing charge and discharge statuses.

## Obtaining battery MAC address

The simplest way is to scan for all devices without duplicates:

```bash
sudo hcitool -i hci0 lescan | head -n 100 | sort -u
```

Battery would have a name like '12100AE2100111'.

## Usage

```typescript
  // discover all battery instances, timing out scan after 60 seconds
  const batteries = await UltimatronBattery.findAll(60000)

  // discover up to 3 batterries or timing out scan after 60 seconds
  const batteries = await UltimatronBattery.findAll(60000, 3)

  // Find a specific battery by name
  const battery = await UltimatronBattery.forName('12100AE2100111')

  // Use battery in a shared mode, so status polling will disconnect 
  // between updates and won't exlusively keep the BLE connection 
  // Also sets interval between updates to 5 minutes
  const battery = await UltimatronBattery.forName('12100AE2100111', true, 60000, 5*60*1000)

  // Subscribes on battery state updates
  // Updates happen periodically even if state remains the same
  battery.onStateUpdate((state: BatteryState) => {
    console.log(`Battery state updated to ${state}`)
  }

  // enable discharging
  await battery.toggleDischarging(true)

  // get cached state and voltage
  console.log("Battery state:", battery.getState())

  // release the BLE connection of the device
  device.disconnect()
```

## Troubleshooting

If the battery disconnects immediatly after BLE connection was established it might require increasing BLE timesouts (for HCI0 device):

```bash
$ sudo sh -c "/bin/echo 100 > /sys/kernel/debug/bluetooth/hci0/conn_max_interval"^C
$ sudo sh -c "/bin/echo 99 > /sys/kernel/debug/bluetooth/hci0/conn_latency"
$ sudo sh -c "/bin/echo 10 > /sys/kernel/debug/bluetooth/hci0/conn_min_interval"
```