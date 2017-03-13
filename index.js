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

		this.hookUsername = null; // Nullify global reference to username.
		this.hookPassword = null; // Nullify global reference to password.

		var platform = this;
		var allTokens = [];

		request.post(loginURL, function (loginError, loginResponse, loginBody)
		{
			if (!loginError && loginResponse && loginResponse.statusCode == 200 && loginBody)
			{
				try
				{
					var loginObject = JSON.parse(loginBody);
					if (loginObject.data && loginObject.data.token && loginObject.data.name)
					{
						var thisUserAccessToken = loginObject.data.token;
						platform.log('Got User Access Token for "' + loginObject.data.name + '": ' + thisUserAccessToken);
						allTokens.push(thisUserAccessToken);
					}
					else
					{
						platform.logRequestErrorMessages('Login', null, null, loginBody);
						throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
					}
				}
				catch (jsonLoginError)
				{
					platform.logRequestErrorMessages('Login', jsonLoginError, null, loginBody);
					throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
				}
			}
			else if (loginURL)
			{
				platform.logRequestErrorMessages('Login', loginError, loginResponse, loginBody);
				throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
			}

			loginURL = null; // Nullify local reference to login (containing username and password).

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

			platform.hookToken = null; // Nullify global reference to token.

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

						if (!getDevicesError && getDevicesResponse && getDevicesResponse.statusCode == 200 && getDevicesBody)
						{
							try
							{
								var devicesObject = JSON.parse(getDevicesBody);
								var devicesLists = devicesObject.data;
								if (devicesLists && Array.isArray(devicesLists) && devicesLists.length > 0)
								{
									for (var l = 0; l < devicesLists.length; l ++)
									{
										var thisDevicesList = devicesLists[l];
										if (Array.isArray(thisDevicesList) && thisDevicesList.length > 0)
										{
											for (var d = 0; d < thisDevicesList.length; d ++)
											{
												var thisDeviceObject = thisDevicesList[d];
												var thisDeviceID = thisDeviceObject.device_id;
												var thisDeviceName = thisDeviceObject.device_name;
												var thisDeviceActions = thisDeviceObject.actions;

												if (thisDeviceActions && Array.isArray(thisDeviceActions) && thisDeviceActions.length > 0)
												{
													var onActionName = null;
													var offActionName = null;

													if (thisDeviceActions.length == 1)
													{
														var onlyActionName = thisDeviceActions[0].action_name;
														onActionName = onlyActionName;
														offActionName = onlyActionName;
													}
													else
													{
														var leftoverActionNames = [];
														for (var a = 0; a < thisDeviceActions.length; a ++)
														{
															var thisActionName = thisDeviceActions[a].action_name;
															var lowercaseActionName = thisActionName.toLowerCase();

															if (lowercaseActionName == 'on')
																onActionName = thisActionName;
															else if (lowercaseActionName == 'off')
																offActionName = thisActionName;
															else
																leftoverActionNames.push(thisActionName);
														}

														if (onActionName == null)
														{
															onActionName = leftoverActionNames[0];

															if (offActionName == null)
																offActionName = leftoverActionNames[1];
														}
														else if (offActionName == null)
															offActionName = leftoverActionNames[0];
													}

													platform.addAccessory(thisDeviceID, thisDeviceName, 'device', onActionName, offActionName, devicesAccessToken);
												}
												else
													platform.logRequestErrorMessages('Add Accessory', null, null,
														'Device Has No Actions "' + thisDeviceName + '" (' + thisDeviceID + ')');
											}
										}
										else
											platform.log("No Devices: You haven't added any Devices to Hook (" + devicesAccessToken + ").");
									}
								}
								else
								{
									platform.logRequestErrorMessages('Get Devices', null, null, getDevicesBody);
									throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
								}
							}
							catch (jsonDevicesError)
							{
								platform.logRequestErrorMessages('Get Devices', jsonDevicesError, null, getDevicesBody);
								throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
							}
						}
						else
						{
							platform.logRequestErrorMessages('Get Devices', getDevicesError, getDevicesResponse, getDevicesBody);
							throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
						}

						platform.log('Loading Groups for ' + devicesAccessToken + '...');
						request(
							platform.hookAPIbaseURL + 'groups/listing?token=' + devicesAccessToken,
							function (getGroupsError, getGroupsResponse, getGroupsBody)
						{
							if (!getGroupsError && getGroupsResponse && getGroupsResponse.statusCode == 200 && getGroupsBody)
							{
								try
								{
									var groupsAccessToken = getGroupsResponse.request.uri.href.split('token=')[1];

									var groupsObject = JSON.parse(getGroupsBody);
									var groupsList = groupsObject.data;
									if (groupsList && Array.isArray(groupsList) && groupsList.length > 0)
									{
										for (var g = 0; g < groupsList.length; g ++)
										{
											var thisGroupObject = groupsList[g];
											var thisGroupID = thisGroupObject.groupId;
											var thisGroupName = thisGroupObject.groupName;

											platform.addAccessory(thisGroupID, thisGroupName, 'groups', 'ON', 'OFF', groupsAccessToken);
										}
									}
									else if (groupsList === null)
										platform.log("No Groups: You haven't created any Groups in Hook (" + groupsAccessToken + ").");
									else
									{
										platform.logRequestErrorMessages('Get Groups', null, null, getGroupsBody);
										throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
									}
								}
								catch (jsonGroupsError)
								{
									platform.logRequestErrorMessages('Get Groups', jsonGroupsError, null, getGroupsBody);
									throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
								}
							}
							else
							{
								platform.logRequestErrorMessages('Get Groups', getGroupsError, getGroupsResponse, getGroupsBody);
								throw new Error('Could not load Hook (see previous errors). Crashing Homebridge intentionally to preserve HomeKit configuration. Homebridge must be relaunched.');
							}

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
		var groupOrDevice = ((accessoryType == 'groups') ? 'Group' : 'Device');

		if (accessoryID && accessoryName)
		{
			var accessoryUUID = '"' + accessoryName + '" (' + accessoryID + ')';

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
		}
		else
			this.logRequestErrorMessages('Add Accessory', null, null, 'No ' + groupOrDevice + ' Name or ID');
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
		var loggedError = false;

		if (errorObject)
		{
			this.log(errorTitle + ' ' + errorObject);
			loggedError = true;
		}

		if (errorResponse && errorResponse.statusCode && errorResponse.statusCode != 200)
		{
			this.log(errorTitle + ' Error: Response Status Code ' + errorResponse.statusCode);
			loggedError = true;
		}
		else if (errorBody)
		{
			try
			{
				var errorBodyObject = JSON.parse(errorBody);
				if (errorBodyObject.return_value != undefined)
				{
					this.log(errorTitle + ' Error: Failed to Set State (Return ' + errorBodyObject.return_value + ')');
					loggedError = true;
				}
				if (errorBodyObject.data && errorBodyObject.data.message)
				{
					this.log(errorTitle + ' Error: API Message "' + errorBodyObject.data.message + '"');
					loggedError = true;
				}
			}
			catch (notJsonError)
			{
				if (errorBody == 'null')
					this.log(errorTitle + ' Error: No longer exists in Hook.');
				else
					this.log(errorTitle + ' Error: ' + errorBody);

				loggedError = true;
			}
		}

		if (!loggedError)
			this.log(errorTitle + ' Error: UNKNOWN (' + errorObject + ' - ' + errorResponse + ' - ' + errorBody + ')');
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
