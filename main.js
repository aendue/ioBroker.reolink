"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

const utils = require("@iobroker/adapter-core");
const axios = require("axios").default;
const https = require("https");

class TestProject extends utils.Adapter {

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

		this.log.info("Reolink adapter has started");
		if (!this.config.cameraIp){
			this.log.error("Camera Ip not set - please check instance!");
			return;
		}
		if (!this.config.cameraType){
			this.log.error("Camera type not set - please check instance!");
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
		this.reolinkApiClient = axios.create({
			baseURL: `${this.config.cameraProtocol}://${this.config.cameraIp}`,
			timeout: 4000,
			responseType: "json",
			responseEncoding: "binary",
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
		});

		this.log.info(`Current IP: ${this.config.cameraIp}`);
		await this.setStateAsync("Network.Ip",{val: this.config.cameraIp, ack: true});
		await this.setStateAsync("Network.Channel",{val: this.config.cameraChannel, ack: true});

		this.log.info(`Current Devicetype: ${this.config.cameraType}`);

		//State abbonieren
		this.subscribeStates("settings.ir");
		this.subscribeStates("settings.ptzPreset");

		if(this.config.cameraType == "rlc510A"){
			//this.getDevinfo();
			//this.getLocalLink();
			this.setValue("onReady");
			this.refreshState("onReady");
		}else if(this.config.cameraType == "others"){

			this.log.info("camera type set to others...API functions not testet!");
			this.getDevinfo();
			this.getLocalLink();
			this.refreshState("onReady");
		}else {
			this.log.error("Cameratyp undefined...");
		}

	}
	//function for getting motion detection
	async getMdState(){
		if (this.reolinkApiClient) {
			try {
				// const MdInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetMdState&channel=${this.config.cameraChannel}&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);

				// this.log.debug(`camMdStateInfo ${JSON.stringify(MdInfoValues.status)}: ${JSON.stringify(MdInfoValues.data)}`);

				// if(MdInfoValues.status === 200){
				// 	this.apiConnected = true;
				// 	await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});

				// 	const MdValues = MdInfoValues.data[0];

				// 	this.log.info(MdValues.value.state);
				// 	await this.setStateAsync("sensor.motion", {val: MdValues.value.state, ack: true});

				// }
			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});
				this.log.error(error);
			}
		}
	}
	//function for getting general information of camera device
	async getDevinfo(){

		if (this.reolinkApiClient) {
			try {
				const DevInfoValues = await this.reolinkApiClient.get(`/api.cgi?cmd=GetDevInfo&channel=0&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`);
				this.log.debug(`camMdStateInfo ${JSON.stringify(DevInfoValues.status)}: ${JSON.stringify(DevInfoValues.data)}`);

				if(DevInfoValues.status === 200){
					this.apiConnected = true;
					await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});
					const DevValues = DevInfoValues.data[0];

					await this.setStateAsync("Device.BuildDay", {val: DevValues.value.DevInfo.buildDay, ack: true});
					await this.setStateAsync("Device.CfgVer", {val: DevValues.value.DevInfo.cfgVer, ack: true});
					await this.setStateAsync("Device.Detail", {val: DevValues.value.DevInfo.detail, ack: true});
					await this.setStateAsync("Device.DiskNum", {val: DevValues.value.DevInfo.diskNum, ack: true});
					await this.setStateAsync("Device.FirmVer", {val: DevValues.value.DevInfo.firmVer, ack: true});
					await this.setStateAsync("Device.Model", {val: DevValues.value.DevInfo.model, ack: true});
					await this.setStateAsync("Device.Name", {val: DevValues.value.DevInfo.name, ack: true});
					await this.setStateAsync("Device.Serial", {val: DevValues.value.DevInfo.serial, ack: true});
					await this.setStateAsync("Device.Wifi", {val: DevValues.value.DevInfo.wifi, ack: true});
				}

			} catch (error) {
				this.apiConnected = false;
				await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});


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
					await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});
					const LinkValues = LinkInfoValues.data[0];

					await this.setStateAsync("Network.ActiveLink", {val: LinkValues.value.LocalLink.activeLink, ack: true});
					await this.setStateAsync("Network.Mac", {val: LinkValues.value.LocalLink.mac, ack: true});
					await this.setStateAsync("Network.Dns", {val: LinkValues.value.LocalLink.dns.dns1, ack: true});
					await this.setStateAsync("Network.Gateway", {val: LinkValues.value.LocalLink.static.gateway, ack: true});
					await this.setStateAsync("Network.Mask", {val: LinkValues.value.LocalLink.static.mask, ack: true});
					await this.setStateAsync("Network.NetworkType", {val: LinkValues.value.LocalLink.type, ack: true});
				}
			} catch (error) {
				this.apiConnected = false;

				await this.setStateAsync("Network.Connected", {val: this.apiConnected, ack: true});

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
	async setPTZPreset(ptzPreset) {
		if (this.reolinkApiClient) {
			try {
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
				await this.reolinkApiClient.post(`/api.cgi?cmd=PtzCtrl&&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`, ptzPresetCmd);
			} catch (error) {
				this.log.error(error);
			}
		}
	}
	async refreshState(source){
		//this.log.debug(`refreshState': started from "${source}"`);

		this.getMdState();

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
			this.refreshStateTimeout = this.setTimeout(() => {
				this.refreshStateTimeout = null;
				this.refreshState("timeout(default");
			}, parseInt(this.config.apiRefreshInterval) * 1000);
			// this.log.debug(`refreshStateTimeout: re-created refresh timeout (default): id ${this.refreshStateTimeout}- secounds: ${this.config.apiRefreshInterval}`);

		}


	}

	async setValue(source, irvalue){
		this.log.debug(irvalue);

		const payload = [{ "cmd": "SetIrLights", "action": 0, "param": {
			"IrLights": {
				"channel": 0,
				"state": "Off"
			}
		}}];
		//this.log.debug(`setValue - error': started from "${source}"`);
		//this.log.debug(payload);

		try {
			if (this.reolinkApiClient !== null) {
				const res = await this.reolinkApiClient.post(`/api.cgi?cmd=SetIrLights&user=${this.config.cameraUser}&password=${this.config.cameraPassword}`,payload);
				this.log.debug(String(res.status));
				this.log.debug(res.statusText);
				this.log.debug(String(res.headers));
				this.log.debug(String(res.config));
			}
		} catch (error) {
			this.log.error(`Fehler: ${error}`);
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

			// The state was changed
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			const idValues= id.split(".");
			const propName = idValues[idValues.length -1];
			this.log.info(`Geändertes State: ${propName}`);
			if(propName == "ir"){
				this.setValue("onStateChange", state.val);

			}
			if(propName === "ptzPreset")
			{
				this.setPTZPreset(state.val);
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
	module.exports = (options) => new TestProject(options);
} else {
	// otherwise start the instance directly
	new TestProject();
}