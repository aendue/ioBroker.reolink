"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

const utils = require("@iobroker/adapter-core");
const { rejects } = require("assert");
const axios = require("axios").default;
const https = require("https");
let sslvalidation = false;

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
		await this.getIrLights();

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
		this.subscribeStates("settings.ptzPreset");
		this.subscribeStates("settings.ptzPatrol");
		this.subscribeStates("settings.autoFocus");
		this.subscribeStates("settings.setZoomFocus");
		this.subscribeStates("settings.push");
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

					await this.setStateAsync("sensor.dog_cat.state", {val: !!(AiValues.value.dog_cat.alarm_state), ack: true});
					await this.setStateAsync("sensor.dog_cat.support", {val: !!(AiValues.value.dog_cat.support), ack: true});
					await this.setStateAsync("sensor.face.state", {val: !!(AiValues.value.face.alarm_state), ack: true});
					await this.setStateAsync("sensor.face.support", {val: !!(AiValues.value.face.support), ack: true});
					await this.setStateAsync("sensor.people.state", {val: !!(AiValues.value.people.alarm_state), ack: true});
					await this.setStateAsync("sensor.people.support", {val: !!(AiValues.value.people.support), ack: true});
					await this.setStateAsync("sensor.vehicle.state", {val: !!(AiValues.value.vehicle.alarm_state), ack: true});
					await this.setStateAsync("sensor.vehicle.support", {val: !!(AiValues.value.vehicle.support), ack: true});

					this.log.debug("dog_cat_state detection:" + AiValues.value.dog_cat.alarm_state);
					this.log.debug("face_state detection:" + AiValues.value.face.alarm_state);
					this.log.debug("people_state detection:" + AiValues.value.people.alarm_state);
					this.log.debug("vehicle_state detection:" + AiValues.value.vehicle.alarm_state);
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
				this.log.error(error);
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
				this.log.error(error);
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

				this.log.error(error);
			}
		}
	}
	async getSnapshot() {
		if (this.reolinkApiClient) {
			try {
				const randomseed = Math.round(Math.random() * 10000000000000000000).toString(16);
				const snapShot = await this.reolinkApiClient.get(`/api.cgi?cmd=Snap&channel=0&rs=${randomseed}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				const contentType = snapShot.headers["content-type"];
				const base64data = Buffer.from(snapShot.data, "binary").toString("base64");
				return {type: contentType, base64: base64data};
			} catch (error) {
				this.log.error(error);
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
				const result = await this.reolinkApiClient.post(`/api.cgi?user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, cmdObject);
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
			this.log.error(error);
			this.log.error("sendCmd " + cmdName + "connection error");
		}
	}
	async ptzCtrl(ptzPreset) {
		const ptzPresetCmd = [{
			"cmd":"PtzCtrl",
			"action":0,
			"param":{
				"channel":0,
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
					"channel":0,
					"op":"StopPatrol"
				}
			}];
			this.sendCmd(ptzPresetCmd, "PtzCtrl");
		}
		else {
			const ptzPresetCmd = [{
				"cmd":"PtzCtrl",
				"param":{
					"channel":0,
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
	async setAutoFocus(state) {
		if (state == "Error or not supported"){
			return;
		}
		if(state == "0" || state == "1"){
			const AutoFocusval = parseInt(state);
			const autoFocusCmd = [{
				"cmd": "SetAutoFocus",
				"action": 0,
				"param": {
					"AutoFocus": {
						"channel": 0,
						"disable": AutoFocusval
					}
				}
			}];
			this.sendCmd(autoFocusCmd, "SetAutoFocus");
		}else{
			this.log.error("Value not supported!");
			this.getAutoFocus();
		}
	}
	async getAutoFocus(){
		if (this.reolinkApiClient) {
			try {
				const AutoFocusValue = await this.reolinkApiClient.get(`/api.cgi?cmd=GetAutoFocus&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);

				this.log.debug(`AutoFocusValue ${JSON.stringify(AutoFocusValue.status)}: ${JSON.stringify(AutoFocusValue.data)}`);

				if(AutoFocusValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
					const AutoFocus = AutoFocusValue.data[0];

					if ("error" in AutoFocus){
						this.log.debug("Error or not supported " + this.getAutoFocus.name);
						await this.setStateAsync("settings.autoFocus", {val: "Error or not supported", ack: true});
					}else{
						await this.setStateAsync("settings.autoFocus", {val: AutoFocus.value.AutoFocus.disable, ack: true});
					}
				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error(error);
			}
		}
	}
	async startZoomFocus(pos) {
		const ptzCheckCmd = [{
			"cmd":"StartZoomFocus",
			"action": 0,
			"param": {
				"ZoomFocus": {
					"channel": 0,
					"pos": pos,
					"op": "ZoomPos"
				}
			}
		}];
		this.sendCmd(ptzCheckCmd,"StartZoomFocus");
	}
	async audioAlarmPlay(count) {
		const audioAlarmPlayCmd = [{
			"cmd":"AudioAlarmPlay",
			"action": 0,
			"param": {
				"alarm_mode": "times",
				"manual_switch": 0,
				"times": count,
				"channel": 0
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
						"channel": 0,
						"state": irValue
					}
				}
			}];
			this.log.debug(irCmd);
			this.sendCmd(irCmd, "SetIrLights");
		}else{
			this.log.error("Value not supported!");
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
				this.log.error(error);
			}
		}
	}
	async switchWhiteLed(state) {
		let ledState = 0;
		if (state === true)
		{
			ledState = 1;
		}
		const setWhiteLedCmd = [{
			"cmd": "SetWhiteLed",
			"param": {
				"WhiteLed": {
					"state": ledState,
					"channel": 0,
					"mode": 1,
				}
			}
		}];
		this.sendCmd(setWhiteLedCmd, "SetWhiteLed");
	}
	async setWhiteLed(state) {
		const setWhiteLedCmd = [{
			"cmd": "SetWhiteLed",
			"param": {
				"WhiteLed": {
					"channel": 0,
					"mode": 1,
					"bright": state
				}
			}
		}];
		this.sendCmd(setWhiteLedCmd, "SetWhiteLed");
	}
	async getWhiteLed(){
		if (this.reolinkApiClient) {
			try {
				const whiteLedValue = await this.reolinkApiClient.get(`/api.cgi?cmd=GetWhiteLeds&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);

				this.log.debug(`whiteLedValue ${JSON.stringify(whiteLedValue.status)}: ${JSON.stringify(whiteLedValue.data)}`);

				if(whiteLedValue.status === 200) {
					this.apiConnected = true;
					await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});

					const whiteLed = whiteLedValue.data[0];

					// 	this.log.info(MdValues.value.state);
					await this.setStateAsync("settings.ledBrightness", {val: whiteLed.value.WhiteLed.bright, ack: true});

				}
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("network.connected", {val: this.apiConnected, ack: true});
				this.log.error(error);
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
					"channel": 0,
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
					"channel": 0,
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

		//Delete Timer
		if(this.refreshStateTimeout){
			this.log.debug(`refreshStateTimeout: CLEARED by ${source}`);
			this.clearTimeout(this.refreshStateTimeout);
		}


		//Cretae new Timer (to re-run actions)
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
				this.log.error(error);
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
			this.log.error("Value not supported!");
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
				this.log.error(error);
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
				if(propName === "playAlarm") {
					this.audioAlarmPlay(state.val);
				}
				if(propName === "switchLed") {
					this.switchWhiteLed(state.val);
				}
				if(propName === "ledBrightness") {
					this.setWhiteLed(state.val);
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