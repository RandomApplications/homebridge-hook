'use strict';

var Service, Characteristic;
var request = require('request');

module.exports = function(homebridge)
{
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerPlatform('homebridge-hook', 'Hook', HookPlatform);
}

function HookPlatform(log, config)
{
	this.log = log;
	this.hookAccessories = [];
	this.hookAccessoryUUIDs = [];

	this.hookAPIbaseURL = 'https://api.gethook.io/v1/';

	this.hookUsername = config['hookUsername'];
	this.hookPassword = config['hookPassword'];
	this.hookToken = config['hookToken'];
}

HookPlatform.prototype = {

	accessories: function(callback)
	{
		var loginURL = null;

		if (this.hookUsername && this.hookPassword)
		{
			this.log('Logging in as "' + this.hookUsername + '" to Get User Access Token...');

			loginURL = {
				url: this.hookAPIbaseURL + 'user/login',
				form: {
					username: this.hookUsername,
					password: this.hookPassword
				}
			};
		}

		this.hookPassword = null; // Nullify reference to password.
		var platform = this;
		var allTokens = [];

		request.post(loginURL, function (loginError, loginResponse, loginBody)
		{
			if (!loginError && loginResponse && loginResponse.statusCode == 200 &&
				loginBody && !loginBody.includes('"data":{"message":'))
			{
				var userAccessTokenMatches = loginBody.match(/\{"token":"(.*?)",/g);

				if (userAccessTokenMatches && userAccessTokenMatches.length > 0)
					for (var t = 0; t < userAccessTokenMatches.length; t ++)
					{
						var thisUserAccessToken = userAccessTokenMatches[t].substring(10).slice(0, -2);
						platform.log('Got User Access Token for "' + platform.hookUsername + '": ' + thisUserAccessToken);
						allTokens.push(thisUserAccessToken);
					}
			}
			else if (loginURL)
				platform.logRequestErrorMessages('Login', loginError, loginResponse, loginBody);

			loginURL = null; // Nullify reference to password.

			if (platform.hookToken)
			{
				var allHookTokens = platform.hookToken.replace(/\s/g, '').split(',');
				for (var t = 0; t < allHookTokens.length; t ++)
				{
					var thisHookToken = allHookTokens[t];
					platform.log('Got Hook Token from Configuration: ' + thisHookToken);
					allTokens.push(thisHookToken);
				}
			}

			if (allTokens.length > 0)
			{
				var loadedTokens = 0;

				for (var t = 0; t < allTokens.length; t ++)
				{
					var thisToken = allTokens[t];

					platform.log('Loading Devices for ' + thisToken + '...');
					request(
						platform.hookAPIbaseURL + 'device?token=' + thisToken,
						function (getDevicesError, getDevicesResponse, getDevicesBody)
					{
						var devicesAccessToken = (getDevicesResponse ? getDevicesResponse.request.uri.href.split('token=')[1] : null);

						if (!getDevicesError && getDevicesResponse && getDevicesResponse.statusCode == 200 &&
							getDevicesBody && !getDevicesBody.includes('"data":{"message":'))
						{
							var deviceIDMatches = getDevicesBody.match(/,"device_id":"(.*?)",/g);

							if (deviceIDMatches && deviceIDMatches.length > 0)
							{
								var deviceNameMatches = getDevicesBody.match(/,"device_name":"(.*?)",/g);
								var deviceActionMatches = getDevicesBody.match(/,"actions":\[(.*?)]/g);

								for (var d = 0; d < deviceIDMatches.length; d ++)
								{
									var thisDeviceID = deviceIDMatches[d].substring(14).slice(0, -2);
									var thisDeviceName = deviceNameMatches[d].substring(16).slice(0, -2);

									var thisDeviceActions = deviceActionMatches[d];
									var actionIDMatches = thisDeviceActions.match(/\{"deviceActionId":"(.*?)",/g);
									var actionNameMatches = thisDeviceActions.match(/,"action_name":"(.*?)"}/g);
									var actionIDsForNames = {};
									for (var a = 0; a < actionIDMatches.length; a ++)
									{
										var thisActionID = actionIDMatches[a].substring(19).slice(0, -2);
										var thisActionName = actionNameMatches[a].substring(16).slice(0, -2);

										actionIDsForNames[thisActionID] = thisActionName;
									}

									// Wishing this would sort them properly, but it doesn't always for custom action names.
									var actionIDs = Object.keys(actionIDsForNames).sort();

									var onActionName = actionIDsForNames[actionIDs[0]];
									var offActionName = actionIDsForNames[actionIDs[1]];

									if (onActionName.toLowerCase() == 'off' || offActionName.toLowerCase() == 'on')
									{
										// Switch default actions names just in case sort them wrong.
										onActionName = actionIDsForNames[actionIDs[1]];
										offActionName = actionIDsForNames[actionIDs[0]];
									}

									platform.addAccessory(thisDeviceID, thisDeviceName, 'device', onActionName, offActionName, devicesAccessToken);
								}
							}
							else
								platform.log("No Devices: You haven't added any Devices to Hook (" + devicesAccessToken + ").");
						}
						else
							platform.logRequestErrorMessages('Get Devices', getDevicesError, getDevicesResponse, getDevicesBody);

						platform.log('Loading Groups for ' + devicesAccessToken + '...');
						request(
							platform.hookAPIbaseURL + 'groups/listing?token=' + devicesAccessToken,
							function (getGroupsError, getGroupsResponse, getGroupsBody)
						{
							if (!getGroupsError && getGroupsResponse && getGroupsResponse.statusCode == 200 &&
								getGroupsBody && !getGroupsBody.includes('"data":{"message":'))
							{
								var groupsAccessToken = getGroupsResponse.request.uri.href.split('token=')[1];
								var groupIDMatches = getGroupsBody.match(/\{"groupId":"(.*?)",/g);

								if (groupIDMatches && groupIDMatches.length > 0)
								{
									var groupNameMatches = getGroupsBody.match(/,"groupName":"(.*?)"}/g);

									for (var g = 0; g < groupIDMatches.length; g ++)
									{
										var thisGroupID = groupIDMatches[g].substring(12).slice(0, -2);
										var thisGroupName = groupNameMatches[g].substring(14).slice(0, -2);

										platform.addAccessory(thisGroupID, thisGroupName, 'groups', 'ON', 'OFF', groupsAccessToken);
									}
								}
								else
									platform.log("No Groups: You haven't created any Groups in Hook (" + groupsAccessToken + ").");
							}
							else
								platform.logRequestErrorMessages('Get Groups', getGroupsError, getGroupsResponse, getGroupsBody);

							loadedTokens ++;
							if (loadedTokens == allTokens.length)
								callback(platform.hookAccessories);
						});
					});
				}
			}
			else
			{
				platform.log('No Token: Could not load Hook.');

				callback(platform.hookAccessories);
			}
		});
	},

	addAccessory: function(accessoryID, accessoryName, accessoryType, onActionName, offActionName, accessToken)
	{
		var accessoryUUID = '"' + accessoryName + '" (' + accessoryID + ')';
		var groupOrDevice = ((accessoryType == 'groups') ? 'Group' : 'Device');

		if (this.hookAccessoryUUIDs.indexOf(accessoryUUID) == -1)
		{
			var lowercaseNameWords = accessoryName.toLowerCase().split(' ');

			var wordsForLight = ['lamp', 'light', 'lights', 'lighting'];
			var defaultsToLight = false;
			for (var w = 0; w < wordsForLight.length; w ++)
				if (lowercaseNameWords.indexOf(wordsForLight[w]) > -1)
				{
					defaultsToLight = true;
					break;
				}

			var defaultsToFan = (lowercaseNameWords.indexOf('fan') > -1);

			var newAccessory = new HookAccessory([{
				controlService: (defaultsToLight ? new Service.Lightbulb(accessoryName, accessoryType) :
									(defaultsToFan ? new Service.Fan(accessoryName, accessoryType) :
										new Service.Switch(accessoryName, accessoryType))),
				characteristics: [Characteristic.On]
			}]);

			if (newAccessory != null)
			{
				newAccessory.uuid_base = accessoryUUID;
				newAccessory.name = accessoryName;
				newAccessory.id = accessoryID;
				newAccessory.type = accessoryType;

				newAccessory.platform = this;
				newAccessory.accessToken = accessToken;

				newAccessory.getServices = function() { return newAccessory.platform.getServices(newAccessory); };

				newAccessory.defaultsToLight = defaultsToLight;
				newAccessory.onActionName = onActionName;
				newAccessory.offActionName = offActionName;

				var modManSerNumFiller = 'Hook ' + groupOrDevice + ' (Homebridge)';
				newAccessory.model = modManSerNumFiller;
				newAccessory.manufacturer = modManSerNumFiller;
				newAccessory.serialNumber = modManSerNumFiller;

				this.hookAccessories.push(newAccessory);
				this.hookAccessoryUUIDs.push(accessoryUUID);

				this.log('Added Accessory: ' + groupOrDevice + ' ' + accessoryUUID);
			}
		}
		else
			this.logRequestErrorMessages('Add Accessory', null, null, groupOrDevice + ' Already Added ' + accessoryUUID);
	},

	bindCharacteristicEvents: function(characteristic, service, accessory)
	{
		characteristic.on('set', function(value, callback, context)
		{
			var toState = (value ? accessory.onActionName : accessory.offActionName);

			request(
				accessory.platform.hookAPIbaseURL + accessory.type + '/trigger/' +
				accessory.id + '/' + toState + '?token=' + accessory.accessToken,
				function (doActionError, doActionResponse, doActionBody)
			{
				var actionTitlePrefix =
					(accessory.isIdentifying ? 'Identify ' : '') +
					((accessory.type == 'groups') ? 'Group' : 'Device') + ' Action ';

				if (!doActionError && doActionResponse && doActionResponse.statusCode == 200 &&
					doActionBody && doActionBody == '{"return_value":"1"}')
				{
					accessory.platform.log(actionTitlePrefix + 'Success: ' + accessory.name + ' (' + toState + ')');

					callback();

					if (accessory.isIdentifying)
					{
						if (value)
						{
							accessory.platform.log('Finish Identify ' + accessory.identifyCount + ': ' + accessory.name);
							accessory.identifyCount ++;
							accessory.isIdentifying = false;
						}
						else
							characteristic.setValue(true);
					}
				}
				else
				{
					var actionFailedTitle = actionTitlePrefix + 'Failed: ' + accessory.name + ' (' + toState + ')';
					accessory.platform.logRequestErrorMessages(actionFailedTitle + ' -', doActionError, doActionResponse, doActionBody);

					callback(actionFailedTitle);
				}
			});
		}.bind(this));
	},

	logRequestErrorMessages: function(errorTitle, errorObject, errorResponse, errorBody)
	{
		if (errorObject)
			this.log(errorTitle + ' ' + errorObject);

		if (errorResponse && errorResponse.statusCode && errorResponse.statusCode != 200)
			this.log(errorTitle + ' Error: Response Status Code ' + errorResponse.statusCode);
		else if (errorBody)
		{
			if (errorBody == '{"return_value":"0"}')
				this.log(errorTitle + ' Error: Failed to Set State (Return 0)');
			else if (errorBody.includes('"data":{"message":'))
			{
				var bodyMessageMatches = errorBody.match(/\{"message":"(.*?)"}/g);

				for (var m = 0; m < bodyMessageMatches.length; m ++)
					this.log(errorTitle + ' Error: ' + bodyMessageMatches[m].substring(11).slice(0, -1));
			}
			else
				this.log(errorTitle + ' Error: ' + errorBody);
		}
	},

	getServices: function(accessory)
	{
		var services = [];
		var informationService = accessory.platform.getInformationService(accessory);
		services.push(informationService);
		for (var s = 0; s < accessory.services.length; s ++)
		{
			var service = accessory.services[s];
			for (var c = 0; c < service.characteristics.length; c ++)
			{
				var characteristic = service.controlService.getCharacteristic(service.characteristics[c]);
				if (characteristic == undefined)
					characteristic = service.controlService.addCharacteristic(service.characteristics[c]);
				accessory.platform.bindCharacteristicEvents(characteristic, service, accessory);
			}
			services.push(service.controlService);
		}

		return services;
	},

	getInformationService: function(accessory)
	{
		var informationService = new Service.AccessoryInformation();

		informationService
			.setCharacteristic(Characteristic.Name, accessory.name)
			.setCharacteristic(Characteristic.Manufacturer, accessory.manufacturer)
			.setCharacteristic(Characteristic.Model, accessory.model)
			.setCharacteristic(Characteristic.SerialNumber, accessory.serialNumber);

		return informationService;
	}
}

function HookAccessory(services)
{
	this.services = services;

	this.identifyCount = 1;
	this.isIdentifying = false;
	this.identify = function(callback)
	{
		var platform = this.platform;

		if (this.identifyCount == 1 && !this.defaultsToLight)
		{
			platform.log('Skipping First Identify: ' + this.name);
			this.identifyCount ++;
		}
		else if (!this.isIdentifying)
		{
			this.isIdentifying = true;
			var isFirstIdentify = (this.identifyCount == 1);

			platform.log(
				'Begin Identify ' + this.identifyCount + ': ' + this.name +
				' (Switching ' + (isFirstIdentify ? 'On' : 'Off > On') + ')'
			);

			var service = services[0];
			service.controlService.getCharacteristic(service.characteristics[0]).setValue(isFirstIdentify);
		}
		else
			platform.log('Already Identifying: ' + this.name);

		callback();
	};
}
