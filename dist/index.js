"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homeassist_mqtt_1 = __importDefault(require("./homeassist-mqtt"));
const config_json_1 = __importDefault(require("./config.json"));
(0, homeassist_mqtt_1.default)(config_json_1.default.mqttUrl, config_json_1.default.user, config_json_1.default.password);
//# sourceMappingURL=index.js.map