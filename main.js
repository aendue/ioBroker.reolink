"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

const utils = require("@iobroker/adapter-core");
const axios = require("axios").default;
const https = require("https");
let sslvalidation = false;
const refreshIntervalRecording = 10;
let refreshIntervalRecordingTimer = 0;

class ReoLinkCam extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "reolink",
		});

		this.apiConnected = false;
		this.reolinkApiClient = null;
		this.cameraModel = null;
		this.refreshStateTimeout = null;

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

	}

	async onReady() {
		this.setState("info.connection", false, true);
		this.log.info("Reolink adapter has started");
		if (!this.config.cameraIp){
			this.log.error("Camera Ip not set - please check instance!");
			return;
		}
		if(!this.config.cameraUser || !this.config.cameraPassword){
			this.log.error("Username and/or password not set properly - please check instance!");
			return;
		}
		if(!this.config.cameraProtocol){
			this.log.error("no protocol (http/https) set!");
			return;
		}
		//check Checkbox of ssl validation is set
		if(this.config.sslvalid == undefined){
			sslvalidation = false;
		}else{
			sslvalidation = this.config.sslvalid;
		}

		this.reolinkApiClient = axios.create({
			baseURL: `${this.config.cameraProtocol}://${this.config.cameraIp}`,
			timeout: 4000,
			responseType: "json",
			responseEncoding: "binary",
			httpsAgent: new https.Agent({
				rejectUnauthorized: sslvalidation,
			})
		});

		this.log.info(`Current IP: ${this.config.cameraIp}`);
		await this.setStateAsync("network.ip",{val: this.config.cameraIp, ack: true});
		await this.setStateAsync("network.channel",{val: Number(this.config.cameraChannel), ack: true});

		//first API Call...if something isnt working stop Adapter
		await this.getDevinfo().catch(error => {
			this.log.error(error + ": " + error.code);
		});

		if(!this.apiConnected){
			return;
		}

		await this.getLocalLink();
		await this.refreshState("onReady");
		await this.getDriveInfo();
		await this.getPtzGuardInfo();
		await this.getAutoFocus();
		await this.getZoomAndFocus();
		await this.getIrLights();
		await this.getWhiteLed();
		await this.getRecording();

		this.log.debug("getStateAsync start Email notification");
		//create state dynamically
		this.getStateAsync("device.name", (err, state) => {
			this.createState("", "settings", "EmailNotification", {
				name: this.namespace + "." + state.val + "_EmailNotify",
				type: "number",
				role: "value",
				read: true,
				write: true
			});
			this.getMailNotification();
			this.subscribeStates("settings.EmailNotification");
			this.log.debug("Email notification subscribed");
		});
		this.log.debug("start subscribtions");
		//State abbonieren
		this.subscribeStates("settings.ir");
		this.subscribeStates("settings.switchLed");
		this.subscribeStates("settings.ledBrightness");
		this.subscribeStates("settings.ledMode");
		this.subscribeStates("settings.ptzPreset");
		this.subscribeStates("settings.ptzPatrol");
		this.subscribeStates("settings.autoFocus");
		this.subscribeStates("settings.setZoomFocus");
		this.subscribeStates("settings.push");
		this.subscribeStates("settings.ftp");
		this.subscribeStates("settings.scheduledRecording");
		this.subscribeStates("settings.playAlarm");
		this.subscribeStates("settings.getDiscData");
		this.subscribeStates("settings.ptzEnableGuard");
		this.subscribeStates("settings.ptzGuardTimeout");
		this.subscribeStates("Command.Reboot");
	}
	//function for getting motion detection
	async getMdState(){
		if (this.reolinkApiClient) {
			try {
				const MdInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetMdState&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);

				this.log.debug(`camMdStateInfo ${JSON.stringify(MdInfoValues.status)}: ${JSON.stringify(MdInfoValues.data)}`);

				if(MdInfoValues.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const MdValues = MdInfoValues.data[0];

					this.log.debug("Motion Detection value: " + MdValues.value.state);
					await this.setStateAsync("sensor.motion", {val: !!(MdValues.value.state), ack: true});

				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
			}
		}
	}

	async getAiState(){
		if (this.reolinkApiClient){
			try{
				const AiInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetAiState&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);

				this.log.debug(`camAiStateInfo ${JSON.stringify(AiInfoValues.status)}: ${JSON.stringify(AiInfoValues.data)}`);

				if(AiInfoValues.status === 200){
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const AiValues = AiInfoValues.data[0];
					try {
						await this.setStateAsync("sensor.dog_cat.state", {val: !!(AiValues.value.dog_cat.alarm_state), ack: true});
						await this.setStateAsync("sensor.dog_cat.support", {val: !!(AiValues.value.dog_cat.support), ack: true});
						this.log.debug("dog_cat_state detection:" + AiValues.value.dog_cat.alarm_state);
					} catch (error) {
						this.log.debug("dog cat state not found.");
					}
					try {
						await this.setStateAsync("sensor.face.state", {val: !!(AiValues.value.face.alarm_state), ack: true});
						await this.setStateAsync("sensor.face.support", {val: !!(AiValues.value.face.support), ack: true});
						this.log.debug("face_state detection:" + AiValues.value.face.alarm_state);
					} catch (error) {
						this.log.debug("face state not found.");
					}
					try {
						await this.setStateAsync("sensor.people.state", {val: !!(AiValues.value.people.alarm_state), ack: true});
						await this.setStateAsync("sensor.people.support", {val: !!(AiValues.value.people.support), ack: true});
						this.log.debug("people_state detection:" + AiValues.value.people.alarm_state);
					} catch (error) {
						this.log.debug("people state not found.");
					}
					try {
						await this.setStateAsync("sensor.vehicle.state", {val: !!(AiValues.value.vehicle.alarm_state), ack: true});
						await this.setStateAsync("sensor.vehicle.support", {val: !!(AiValues.value.vehicle.support), ack: true});
						this.log.debug("vehicle_state detection:" + AiValues.value.vehicle.alarm_state);
					} catch (error) {
						this.log.debug("vehicle state not found.");
					}
				}
			}catch (error){
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
			}
		}
	}
	//function for getting general information of camera device
	async getDevinfo(){
		if (this.reolinkApiClient) {
			try {
				this.log.debug("getDevinfo");
				const DevInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetDevInfo&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`camMdStateInfo ${JSON.stringify(DevInfoValues.status)}: ${JSON.stringify(DevInfoValues.data)}`);

				if(DevInfoValues.status === 200){
					this.setState("info.connection", true, true);
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					const DevValues = DevInfoValues.data[0];

					await this.setStateAsync("device.buildDay", {val: DevValues.value.DevInfo.buildDay, ack: true});
					await this.setStateAsync("device.cfgVer", {val: DevValues.value.DevInfo.cfgVer, ack: true});
					await this.setStateAsync("device.detail", {val: DevValues.value.DevInfo.detail, ack: true});
					await this.setStateAsync("device.diskNum", {val: DevValues.value.DevInfo.diskNum, ack: true});
					await this.setStateAsync("device.firmVer", {val: DevValues.value.DevInfo.firmVer, ack: true});
					await this.setStateAsync("device.model", {val: DevValues.value.DevInfo.model, ack: true});
					await this.setStateAsync("device.name", {val: DevValues.value.DevInfo.name, ack: true});
					await this.setStateAsync("device.serial", {val: DevValues.value.DevInfo.serial, ack: true});
					await this.setStateAsync("device.wifi", {val: DevValues.value.DevInfo.wifi, ack: true});
				}

			} catch (error) {
				this.setState("info.connection", false, true);
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				//this.log.error(error + ": " + error.code);
				throw error;
			}
		}
	}
	async getPtzGuardInfo() {
		if (this.reolinkApiClient) {
			try {
				const driveInfoData = await this.reolinkApiClient.get(`/api.cgi?cmd=GetPtzGuard&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`ptz guard info ${JSON.stringify(driveInfoData.status)}: ${JSON.stringify(driveInfoData.data)}`);

			} catch (error) {
				this.log.error("ptz guard info: " + error);
			}
		}
	}
	async getDriveInfo() {
		if (this.reolinkApiClient) {
			try {
				const driveInfoData = await this.reolinkApiClient.get(`/api.cgi?cmd=GetHddInfo&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`getDriveInfo ${JSON.stringify(driveInfoData.status)}: ${JSON.stringify(driveInfoData.data)}`);

				if(driveInfoData.status === 200){
					const driveInfoValues = driveInfoData.data[0];
					const numberOfDiscs = Object.keys(driveInfoValues.value.HddInfo).length;
					if (numberOfDiscs > 0) {
						if (numberOfDiscs > 1) {
							this.log.warn("Only the first disc is read. You have " + numberOfDiscs.toString() + " Discs!");
						}
						await this.setStateAsync("disc.capacity", {val: driveInfoValues.value.HddInfo[0].capacity, ack: true});
						let discFormatted = false;
						if (driveInfoValues.value.HddInfo[0].format === 1) {
							discFormatted = true;
						}
						await this.setStateAsync("disc.formatted", {val: discFormatted, ack: true});
						await this.setStateAsync("disc.free", {val: driveInfoValues.value.HddInfo[0].size, ack: true});
						let discMounted = false;
						if (driveInfoValues.value.HddInfo[0].mount === 1) {
							discMounted = true;
						}
						await this.setStateAsync("disc.mounted", {val: discMounted, ack: true});
					} else {
						//no sd card inserted
						await this.setStateAsync("disc.capacity", {val: 0, ack: true});
						await this.setStateAsync("disc.formatted", {val: false, ack: true});
						await this.setStateAsync("disc.free", {val: 0, ack: true});
						await this.setStateAsync("disc.mounted", {val: false, ack: true});
					}
				}
			} catch (error) {
				this.log.error("drive info" + error);
			}
		}
	}
	async getLocalLink(){
		if (this.reolinkApiClient) {
			try {
				const LinkInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetLocalLink&channel=0&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`LinkInfoValues ${JSON.stringify(LinkInfoValues.status)}: ${JSON.stringify(LinkInfoValues.data)}`);

				if(LinkInfoValues.status === 200){
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					const LinkValues = LinkInfoValues.data[0];

					await this.setStateAsync("network.activeLink", {val: LinkValues.value.LocalLink.activeLink, ack: true});
					await this.setStateAsync("network.mac", {val: LinkValues.value.LocalLink.mac, ack: true});
					await this.setStateAsync("network.dns", {val: LinkValues.value.LocalLink.dns.dns1, ack: true});
					await this.setStateAsync("network.gateway", {val: LinkValues.value.LocalLink.static.gateway, ack: true});
					await this.setStateAsync("network.mask", {val: LinkValues.value.LocalLink.static.mask, ack: true});
					await this.setStateAsync("network.networkType", {val: LinkValues.value.LocalLink.type, ack: true});
				}
			} catch (error) {
				this.apiConnected = false;

				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

				this.log.error("get local link: " + error);
			}
		}
	}
	async getSnapshot() {
		if (this.reolinkApiClient) {
			try {
				const randomseed = Math.round(Math.random() * 10000000000000000000).toString(16);
				const snapShot = await this.reolinkApiClient.get(`/api.cgi?cmd=Snap&channel=${this.config.cameraChannel}&rs=${randomseed}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				const contentType = snapShot.headers["content-type"];
				const base64data = Buffer.from(snapShot.data, "binary").toString("base64");
				return {type: contentType, base64: base64data};
			} catch (error) {
				this.log.error("get snapshot: " + error);
				return null;
			}
		}
		return null;
	}
	async sendCmd(cmdObject, cmdName) {
		this.log.debug("sendCmd: " + cmdName);
		this.log.debug("sendCmdObj: " + JSON.stringify(cmdObject));
		try	{
			if (this.reolinkApiClient) {
				const result = await this.reolinkApiClient.post(`/api.cgi?cmd=${cmdName}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, cmdObject);
				this.log.debug(JSON.stringify(result.status));
				this.log.debug(JSON.stringify(result.data));
				if ("error" in result.data[0])
				{
					this.log.error("sendCmd " + cmdName + ": " + JSON.stringify(result.data[0].error.detail));

					switch(cmdName){
						case "SetAutoFocus":
							await this.setStateAsync("settings.autoFocus", {val: "Error or not supported", ack: true});
							break;
						default:
							this.log.error("not defined");
					}
				}
			}
		} catch(error) {
			this.log.error("send cmd: " + error);
			this.log.error("sendCmd " + cmdName + "connection error");
		}
	}
	async ptzCtrl(ptzPreset) {
		const ptzPresetCmd = [{
			"cmd":"PtzCtrl",
			"action":0,
			"param":{
				"channel":Number(this.config.cameraChannel),
				"id":ptzPreset,
				"op":"ToPos",
				"speed":32
			}
		}];
		this.sendCmd(ptzPresetCmd, "PtzCtrl");
	}
	async ptzCtrl2(ptzPatrolPos) {
		if (ptzPatrolPos === 0) {
			const ptzPresetCmd = [{
				"cmd":"PtzCtrl",
				"param":{
					"channel":Number(this.config.cameraChannel),
					"op":"StopPatrol"
				}
			}];
			this.sendCmd(ptzPresetCmd, "PtzCtrl");
		}
		else {
			const ptzPresetCmd = [{
				"cmd":"PtzCtrl",
				"param":{
					"channel":Number(this.config.cameraChannel),
					"op":"StartPatrol",
					"id":ptzPatrolPos
				}
			}];
			this.sendCmd(ptzPresetCmd, "PtzCtrl");
		}
	}
	async setPush(state) {
		let pushOn = 1;
		if(state == false) {
			pushOn = 0;
		}
		const pushOnCmd = [{
			"cmd": "SetPushV20",
			"param": {
				"Push": {
					"enable": pushOn
				}
			}
		}];
		this.sendCmd(pushOnCmd,"SetPush");
	}
	async setFtp(state) {
		let ftpOn = 1;
		if(state == false) {
			ftpOn = 0;
		}
		const ftpOnCmd = [{
			"cmd": "SetFtpV20",
			"param": {
				"Ftp": {
					"enable": ftpOn
				}
			}
		}];
		this.sendCmd(ftpOnCmd,"setFtp");
	}
	async setAutoFocus(state) {
		if (state == "Error or not supported") {
			return;
		}
		if (state == "0" || state == "1") {
			const AutoFocusval = parseInt(state);
			const autoFocusCmd = [{
				"cmd": "SetAutoFocus",
				"action": 0,
				"param": {
					"AutoFocus": {
						"channel": Number(this.config.cameraChannel),
						"disable": AutoFocusval
					}
				}
			}];
			this.sendCmd(autoFocusCmd, "SetAutoFocus");
		} else {
			this.log.error("Auto focus: Value not supported!");
			this.getAutoFocus();
		}
	}
	async getAutoFocus(){
		if (this.reolinkApiClient) {
			try {
				const getAutoFocusCmd = [{
					"cmd": "GetAutoFocus",
					"action": 0,
					"param": {
						"channel": Number(this.config.cameraChannel),
					}
				}];
				const AutoFocusValue = await this.reolinkApiClient.post(`/api.cgi?cmd=GetAutoFocus&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, getAutoFocusCmd);

				this.log.debug(`AutoFocusValue ${JSON.stringify(AutoFocusValue.status)}: ${JSON.stringify(AutoFocusValue.data)}`);

				if(AutoFocusValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					const AutoFocus = AutoFocusValue.data[0];

					if ("error" in AutoFocus) {
						this.log.debug("Error or not supported " + this.getAutoFocus.name);
						await this.setStateAsync("settings.autoFocus", {val: "Error or not supported", ack: true});
					} else {
						// The datatype of the object is string.
						// 1 means forbid (but is there any effect?)
						// 0 means not disabled
						const intState = AutoFocus.value.AutoFocus.disable;
						if (intState === 0) {
							await this.setStateAsync("settings.autoFocus", {val: "0", ack: true});
						} else if (intState === 1) {
							await this.setStateAsync("settings.autoFocus", {val: "1", ack: true});
						} else {
							await this.setStateAsync("settings.autoFocus", {val: "Unknown", ack: true});
						}
					}
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("get auto focus: " + error);
			}
		}
	}
	async getZoomAndFocus(){
		if (this.reolinkApiClient) {
			try {
				const getZoomFocusCmd = [{
					"cmd": "GetZoomFocus",
					"action": 0,
					"param": {
						"channel": Number(this.config.cameraChannel),
					}
				}];
				const ZoomFocusValue = await this.reolinkApiClient.post(`/api.cgi?cmd=GetZoomFocus&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, getZoomFocusCmd);

				this.log.debug(`ZoomFocusValue ${JSON.stringify(ZoomFocusValue.status)}: ${JSON.stringify(ZoomFocusValue.data)}`);

				if(ZoomFocusValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					const ZoomFocus = ZoomFocusValue.data[0];

					if ("error" in ZoomFocus) {
						this.log.debug("Error or not supported " + this.getZoomAndFocus.name);

						return;
					}

					// zoom is the zoom position. See setZoomFocus()
					const zoom = ZoomFocus.value.ZoomFocus.zoom.pos;
					// the lens focus is adjusted during auto focus procedure.
					const focus = ZoomFocus.value.ZoomFocus.focus.pos;

					await this.setStateAsync("settings.setZoomFocus", {val: zoom, ack: true});
					await this.setStateAsync("settings.focus", {val: focus, ack: true});
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("get zoom and focus: " + error);
			}
		}
	}
	async startZoomFocus(pos) {
		const ptzCheckCmd = [{
			"cmd":"StartZoomFocus",
			"action": 0,
			"param": {
				"ZoomFocus": {
					"channel": Number(this.config.cameraChannel),
					"pos": pos,
					"op": "ZoomPos"
				}
			}
		}];
		this.sendCmd(ptzCheckCmd,"StartZoomFocus");
	}
	async setScheduledRecording(state) {
		if (state !== true && state !== false) {
			this.log.error("Set scheduled recording: Value not supported!");
			this.getRecording();

			return;
		}

		const scheduledRecordingCmd = [{
			"cmd": "SetRecV20",
			"param": {
				"Rec": {
					"enable": state ? 1 : 0, // The description in API Guide v8 had this key inside `schedule`, which does not work.
					"schedule": {
						"channel": Number(this.config.cameraChannel)
					}
				}
			}
		}];

		this.sendCmd(scheduledRecordingCmd, "SetRecV20");
	}
	async getRecording(){
		if (!this.reolinkApiClient) {
			return;
		}

		try {
			const recordingCmd = [{
				"cmd": "GetRecV20",
				"action": 1,
				"param": {
					"channel": Number(this.config.cameraChannel),
				}
			}];
			const recordingSettingsResponse = await this.reolinkApiClient.post(`/api.cgi?cmd=GetRecV20&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, recordingCmd);

			this.log.debug(`recordingSettings ${JSON.stringify(recordingSettingsResponse.status)}: ${JSON.stringify(recordingSettingsResponse.data)}`);
			if (recordingSettingsResponse.status !== 200) {
				return;
			}

			this.apiConnected = true;
			await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

			const recordingSettingValues = recordingSettingsResponse.data[0];
			this.log.debug(`rec set val: ${JSON.stringify(recordingSettingValues)}`);
			// This response object contains much more than `enable`.
			// There would be as well `overwrite`, `postRec`, `preRec`, `saveDay` and the 4 schedule tables as "1010.."-string
			if (recordingSettingValues.error != null) {
				this.log.debug(`get record settings error ${recordingSettingValues.error.detail}`);
			} else {
				const scheduledRecordingState = recordingSettingValues.value.Rec.enable;
				if (scheduledRecordingState === 0) {
					await this.setStateAsync("settings.scheduledRecording", {val: false, ack: true});
				} else if (scheduledRecordingState === 1) {
					await this.setStateAsync("settings.scheduledRecording", {val: true, ack: true});
				} else {
					this.log.error(`An unknown scheduled recording state was detected: ${scheduledRecordingState}`);
				}
			}
		} catch (error) {
			this.apiConnected = false;
			await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
			this.log.error("get recording: " + error);
		}
	}
	async audioAlarmPlay(count) {
		const audioAlarmPlayCmd = [{
			"cmd":"AudioAlarmPlay",
			"action": 0,
			"param": {
				"alarm_mode": "times",
				"manual_switch": 0,
				"times": count,
				"channel": Number(this.config.cameraChannel)
			}
		}];
		this.sendCmd(audioAlarmPlayCmd, "AudioAlarmPlay");
	}
	async setIrLights(irValue) {
		if (irValue == "Error or not supported"){
			return;
		}
		if(irValue == "Auto" || irValue == "Off" || irValue == "On"){
			const irCmd = [{
				"cmd":"SetIrLights",
				"action": 0,
				"param": {
					"IrLights": {
						"channel": Number(this.config.cameraChannel),
						"state": irValue
					}
				}
			}];
			this.log.debug(JSON.stringify(irCmd));
			this.sendCmd(irCmd, "SetIrLights");
		}else{
			this.log.error("Set ir lights: Value not supported!");
			this.getIrLights();
		}
	}
	async getIrLights(){
		if (this.reolinkApiClient) {
			try {
				const IrLightValue = await this.reolinkApiClient.get(`/api.cgi?cmd=GetIrLights&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`IrLightValue ${JSON.stringify(IrLightValue.status)}: ${JSON.stringify(IrLightValue.data)}`);

				if(IrLightValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const IrLights = IrLightValue.data[0];

					//Antwort pruefen
					if ("error" in IrLights){
						this.log.debug("Error or not supported " + this.getIrLights.name);
						await this.setStateAsync("settings.autoFocus", {val: "Error or not supported", ack: true});
					}else{
						await this.setStateAsync("settings.ir", {val: IrLights.value.IrLights.state, ack: true});
					}
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("get ir lights: " + error);
			}
		}
	}
	async switchWhiteLed(state) {
		let ledState = 0;
		if (state === true)
		{
			ledState = 1;
		}
		const switchWhiteLedCmd = [{
			"cmd": "SetWhiteLed",
			"param": {
				"WhiteLed": {
					"channel": Number(this.config.cameraChannel),
					"state": ledState,
				}
			}
		}];
		this.sendCmd(switchWhiteLedCmd, "SetWhiteLed");
	}
	async setWhiteLed(state) {
		const setBrightnessCmd = [{
			"cmd": "SetWhiteLed",
			"param": {
				"WhiteLed": {
					"channel": Number(this.config.cameraChannel),
					"bright": state
				}
			}
		}];
		this.sendCmd(setBrightnessCmd, "SetWhiteLed");
	}
	async setWhiteLedMode(mode) {
		// mode 0 = off        -> Manual switching. See https://github.com/aendue/ioBroker.reolink/issues/25 @johndoetheanimal for possible restrictions
		// mode 1 = night mode -> Night Smart Mode
		// mode 2 = unknown    -> Maybe `Always on at night` if supported.
		// mode 3 = Timer mode -> Optional: [ { "cmd":"SetWhiteLed", "action":0, "param":{ "WhiteLed":{ "LightingSchedule":{ "EndHour":23, "EndMin":50, "StartHour":23, "StartMin":29 }, "mode":3, "channel":0 } } } ]
		if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) {
			this.log.error(`White Led mode ${mode} not supported!`);
			return;
		}
		const setModeCmd = [{
			"cmd": "SetWhiteLed",
			"param": {
				"WhiteLed": {
					"channel": Number(this.config.cameraChannel),
					"mode": mode
				}
			}
		}];
		this.sendCmd(setModeCmd, "SetWhiteLed");
	}
	async getWhiteLed(){
		if (this.reolinkApiClient) {
			try {
				const getLedCmd = [{
					"cmd": "GetWhiteLed",
					"action": 0,
					"param": {
						"channel": Number(this.config.cameraChannel),
					}
				}];
				const whiteLedValue = await this.reolinkApiClient.post(`/api.cgi?cmd=GetWhiteLed&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, getLedCmd);

				this.log.debug(`whiteLedValue ${JSON.stringify(whiteLedValue.status)}: ${JSON.stringify(whiteLedValue.data)}`);

				if(whiteLedValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const whiteLed = whiteLedValue.data[0];
					const brightness = whiteLed.value.WhiteLed.bright;
					const mode = whiteLed.value.WhiteLed.mode;
					const switchLed = whiteLed.value.WhiteLed.state ? true : false;

					await this.setStateAsync("settings.ledBrightness", {val: brightness, ack: true});
					await this.setStateAsync("settings.ledMode", {val: mode, ack: true});
					await this.setStateAsync("settings.switchLed", {val: switchLed, ack: true});
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("get white led: " + error);
			}
		}
	}

	async setPtzGuard(state) {
		let enable = 0;
		if (state === true) {
			enable = 1;
		}
		const setPtzGuardCmd = [{
			"cmd": "SetPtzGuard",
			"action": 0,
			"param": {
				"PtzGuard": {
					"channel": Number(this.config.cameraChannel),
					"cmdStr": "setPos",
					"benable": enable,
					"bSaveCurrentPos": 0
				}
			}
		}];
		await this.sendCmd(setPtzGuardCmd, "setPtzGuard");
		this.getPtzGuardInfo();
	}
	async setPtzGuardTimeout(timeout) {
		const setPtzGuardCmd = [{
			"cmd": "SetPtzGuard",
			"action": 0,
			"param": {
				"PtzGuard": {
					"channel": Number(this.config.cameraChannel),
					"cmdStr": "setPos",
					"timeout": timeout,
					"bSaveCurrentPos": 0
				}
			}
		}];
		await this.sendCmd(setPtzGuardCmd, "setPtzGuardTimeout");
		this.getPtzGuardInfo();
	}

	async refreshState(source){
		this.log.debug(`refreshState': started from "${source}"`);

		this.getMdState();
		this.getAiState();
		refreshIntervalRecordingTimer++;
		if (refreshIntervalRecordingTimer > refreshIntervalRecording) {
			this.getRecording();
			refreshIntervalRecordingTimer = 0;
		}

		//Delete Timer
		if(this.refreshStateTimeout){
			this.log.debug(`refreshStateTimeout: CLEARED by ${source}`);
			this.clearTimeout(this.refreshStateTimeout);
		}


		//Create new Timer (to re-run actions)
		if(!this.apiConnected){
			const notConnectedTimeout = 10;
			this.refreshStateTimeout = this.setTimeout(() => {
				this.refreshStateTimeout = null;
				this.refreshState("timeout (API not connected)");
			}, notConnectedTimeout * 1000);
			//this.log.debug(`refreshStateTimeout: re-created refresh timeout (API not connected): id ${this.refreshStateTimeout}- secounds: ${notConnectedTimeout}`);

		} else {
			let refreshInterval = parseInt(this.config.apiRefreshInterval);
			if (refreshInterval > 10000) {
				refreshInterval = 10000;
			}
			if (refreshInterval < 1) {
				refreshInterval = 1;
			}
			this.refreshStateTimeout = this.setTimeout(() => {
				this.refreshStateTimeout = null;
				this.refreshState("timeout(default");
			}, refreshInterval * 1000);
			//this.log.debug(`refreshStateTimeout: re-created refresh timeout (default): id ${this.refreshStateTimeout}- secounds: ${this.config.apiRefreshInterval}`);
		}
	}
	async getMailNotification(){
		if (this.reolinkApiClient) {
			try {
				const mailValue = await this.reolinkApiClient.get(`/api.cgi?cmd=GetEmailV20&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`mailValue ${JSON.stringify(mailValue.status)}: ${JSON.stringify(mailValue.data)}`);

				if(mailValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const mail = mailValue.data[0];

					//Antwort pruefen
					if ("error" in mail){
						this.log.debug("Error or not supported " + this.getMailNotification.name);
						await this.setStateAsync("settings.EmailNotification", {val: "Error or not supported", ack: true});
					}else{
						await this.setStateAsync("RAW.Email", {val: JSON.stringify(mail), ack: true});
						await this.setStateAsync("settings.EmailNotification", {val: mail.value.Email.enable, ack: true});
					}
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("get mail notification: " + error);
			}
		}
	}
	async setMailNotification(state){

		if(state == 0 || state == 1){

			const mail = await this.getStateAsync("RAW.Email");
			const val = JSON.parse(mail.val).value.Email;

			const mailCmd = [{
				"cmd": "SetEmailV20",
				"param": { "Email": {
					"ssl": val.ssl,
					"enable" : state,
					"smtpPort": val.smtpPort,
					"smtpServer": val.smtpServer,
					"userName": val.userName,
					"nickName": val.nickName,
					"addr1": val.addr1,
					"addr2": val.addr2,
					"addr3": val.addr3,
					"interval": val.interval
				}}
			}];
			//this.log.debug(JSON.stringify(mailCmd));
			this.sendCmd(mailCmd, "SetEmailV20");

		}else{
			this.log.error("Set mail notification: Value not supported!");
			this.getMailNotification();
		}
	}
	async rebootCam(){
		if (this.reolinkApiClient) {
			try {
				const mailValue = await this.reolinkApiClient.get(`/api.cgi?cmd=Reboot&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`mailValue ${JSON.stringify(mailValue.status)}: ${JSON.stringify(mailValue.data)}`);

				if(mailValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					this.log.info(this.config.cameraIp + " reboot triggered!");
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error("reboot cam: " + error);
			}
		}
	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			if(this.refreshStateTimeout){
				this.log.debug("refreshStateTimeout: UNLOAD");
				this.clearTimeout(this.refreshStateTimeout);
			}

			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			if (state.ack === false)
			{
				// The state was changed
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				const idValues= id.split(".");
				const propName = idValues[idValues.length -1];
				this.log.info(`Changed state: ${propName}`);
				if(propName == "ir") {
					this.setIrLights(state.val);
				}
				if(propName === "ptzPreset") {
					this.ptzCtrl(state.val);
				}
				if(propName === "ptzPatrol") {
					this.ptzCtrl2(state.val);
				}
				if(propName === "autoFocus") {
					this.setAutoFocus(state.val);
				}
				if(propName === "setZoomFocus") {
					this.startZoomFocus(state.val);
				}
				if(propName === "push") {
					this.setPush(state.val);
				}
				if(propName === "ftp") {
					this.setFtp(state.val);
				}
				if(propName === "scheduledRecording") {
					this.setScheduledRecording(state.val);
				}
				if(propName === "playAlarm") {
					this.audioAlarmPlay(state.val);
				}
				if(propName === "switchLed") {
					this.switchWhiteLed(state.val);
				}
				if(propName === "ledBrightness") {
					this.setWhiteLed(state.val);
				}
				if(propName === "ledMode") {
					this.setWhiteLedMode(state.val);
				}
				if(propName === "getDiscData") {
					this.getDriveInfo();
				}
				if(propName === "ptzEnableGuard") {
					this.setPtzGuard(state.val);
				}
				if(propName === "ptzGuardTimeout") {
					this.setPtzGuardTimeout(state.val);
				}
				if(propName === "EmailNotification") {
					this.setMailNotification(state.val);
				}
				if(propName === "Reboot") {
					// TODO: reboot command
				}
			}
		} else {
			// The state was deleted
			this.log.debug(`state ${id} deleted`);
		}
	}
	async onMessage(obj) {
		if (typeof obj === "object") {
			//this.log.debug(JSON.stringify(obj));
			//{"command":"send","message":{"action":"snap"},"from":"system.adapter.javascript.0","callback":{"message":{"action":"snap"},"id":13,"ack":false,"time":1660317360713},"_id":42782776}
			if (obj.message.action === "snap") {
				const image = await this.getSnapshot();
				if (obj.callback) {
					if (image){
						this.log.info("send back the image!");
						this.sendTo(obj.from, obj.command, image, obj.callback);
					}
				}
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new ReoLinkCam(options);
} else {
	// otherwise start the instance directly
	new ReoLinkCam();
}