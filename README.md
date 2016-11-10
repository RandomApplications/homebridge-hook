# homebridge-hook
[Hook](http://hooksmarthome.com) platform plugin for [Homebridge](https://github.com/nfarina/homebridge)

# Installation
Follow the instruction in [Homebridge](https://www.npmjs.com/package/homebridge) for the Homebridge server installation. The plugin is published through [NPM](https://www.npmjs.com/package/homebridge-hook) and should be installed "globally" by typing:

	npm install -g homebridge-hook

# Configuration & Usage
This plugin needs to be configured in the `config.json` file in the `.homebridge` folder, which is created inside of your Home folder after installing Homebridge. If you haven't created this file already, you will need to do so. On macOS and Linux, the full path for your `config.json` file would be `~/.homebridge/config.json`.

Configuration is super simple! This plugin can load your Hook's Devices and Groups automatically by entering your Hook Username and Password into the `hookUsername` and `hookPassword` fields in the `config.json` file. Or, you can enter your Hook Token manually into the `hookToken` field in the `config.json` file. To see exactly how to enter these fields in your `config.json` file, check out this [`example-config.json`](https://github.com/RandomApplications/homebridge-hook/blob/master/example-config.json) file.

Devices and Groups are both supported and Custom Action Names are supported for Devices. Unfortunately, using Custom Action Names may cause the On and Off actions to be switched around. This can't be fixed without an update to the Hook API. For best results, just use the default On and Off action names in Hook.

Any Device or Group with a name containing the word "lamp", "light", "lights", or "lighting" will be set to the type "Light" in HomeKit. Any Device or Group with a name containing the word "fan" will be set to the type "Fan" in HomeKit. Everything else will default to the type "Switch" in HomeKit. From within HomeKit, accessories that are created with the "Switch" type can be changed to a "Light" or a "Fan" if you desire, but the accessories that start out as a "Light" or a "Fan" (because of the name matches mentioned above) cannot have their types changed in HomeKit.

If you make any changes to your Hook after you've launched Homebridge (eg. adding new Devices or Groups, or changing any Device, Group, or Action names), you must relaunch Homebridge (and this plugin) for the changes to appear in HomeKit.

When Homebridge is relaunched after a Device or Group name has been changed in Hook, the old Device or Group will be removed from HomeKit and the renamed Device or Group will be added to HomeKit as a new accessory with the new name. This means that if you set the accessory's Location in HomeKit it will be reset to Default Room, and the accessory will be removed from any Automation.

If your Hook Token has been reset and you've entered your Hook Token manually into the `config.json` file, you'll need to update it in the `config.json` file before relaunching Homebridge. If you've configured the plugin with your Hook Username and Password you'll just need to relaunch Homebridge so the plugin can retrieve your new token automatically.
