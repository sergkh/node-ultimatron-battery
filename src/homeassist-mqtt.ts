import {UltimatronBattery, BatteryState} from './battery'
const mqtt = require('mqtt');

export default function startHomeassitantMQTTService(mqttUrl: string, username: string, password: string) {

  const options = {
    clean: true,
    connectTimeout: 4000,
    clientId: 'Ultimatron poller',
    username: username,
    password: password 
  }
  
  const client  = mqtt.connect(mqttUrl, options)

  console.log("Created a MQTT client")

  function batteryDiscoveredHA(battery: UltimatronBattery) {
    console.log("Publishing to config topic: ", `homeassistant/sensor/${battery.name}_capacity/config`)
    
    client.publish(`homeassistant/sensor/${battery.name}_capacity/config`, JSON.stringify({
      'name': 'Ultimatron battery remaining capacity',
      "device_class": "battery",
      "state_topic": `homeassistant/sensor/${battery.name}_capacity/state`,
      'unique_id': `${battery.name}_capacity`,
      "device": { "identifiers": [ battery.name ], "name": `Ultimatron battery ${battery.name}` }
    }))

    console.log("Publishing to config topic: ", `homeassistant/switch/${battery.name}_discharge/config`)

    client.publish(`homeassistant/switch/${battery.name}_discharge/config`, JSON.stringify({
      'name': 'Ultimatron battery discharge switch',
      "state_topic": `homeassistant/switch/${battery.name}_discharge/state`,
      "command_topic": `homeassistant/switch/${battery.name}_discharge/set`,
      'unique_id': `${battery.name}_discharge`,
      "device": { "identifiers": [ battery.name ], "name": `Ultimatron battery ${battery.name}` }
    }))
  }

  function subscribeToBatteryChanges(battery: UltimatronBattery) {
    client.subscribe(`homeassistant/switch/${battery.name}_discharge/set`, async (err: Error) => {
      console.log("Subscribed to discharge events", err)
      
      client.on("message", (topic: string, message: Buffer) => {      
        console.log("> " + topic, message.toString('utf8'));
        const on = message.toString('utf8') === 'ON'
        if (topic == `homeassistant/switch/${battery.name}_discharge/set`) {
          console.log("toggling battery discharge switch")
          battery.toggleDischarging(on)
        } else {
          console.log("ignoring message")
        }
      });
    })
  }


  function publishBatteryStateHA(battery: UltimatronBattery, state: BatteryState) {
    client.publish(`homeassistant/sensor/${battery.name}_capacity/state`, state.residualCapacityPercent.toString())
    client.publish(`homeassistant/sensor/${battery.name}_discharge/state`, state.status.discharing ? 'ON' : 'OFF')
  }

client.on('connect', async () => {
  console.log('Connected')

  const batteries = await UltimatronBattery.findAll(60000, 1, true, 10*60*1000)
  console.log("Found batteries: ", batteries.map(b => b.name))

  batteries.forEach(battery => {
    batteryDiscoveredHA(battery)
    subscribeToBatteryChanges(battery)

    battery.onStateUpdate((state: BatteryState) => {
      console.log('Got battery state update: ', state)
      publishBatteryStateHA(battery, state)
    })
  })      
})

}