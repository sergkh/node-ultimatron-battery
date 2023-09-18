#!/usr/bin/env node
import startHomeassitantMQTTService from './homeassist-mqtt'
import config from './config.json'

startHomeassitantMQTTService(config.mqttUrl, config.user, config.password)