![Logo](admin/reolink_logo.png)
# ioBroker.reolink

[![NPM version](https://img.shields.io/npm/v/iobroker.reolink.svg)](https://www.npmjs.com/package/iobroker.reolink)
[![Downloads](https://img.shields.io/npm/dm/iobroker.reolink.svg)](https://www.npmjs.com/package/iobroker.reolink)
![Number of Installations](https://iobroker.live/badges/reolink-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/reolink-stable.svg)
[![Dependency Status](https://img.shields.io/david/aendue/iobroker.reolink.svg)](https://david-dm.org/aendue/iobroker.reolink)

[![NPM](https://nodei.co/npm/iobroker.reolink.png?downloads=true)](https://nodei.co/npm/iobroker.reolink/)

**Tests:** ![Test and Release](https://github.com/aendue/ioBroker.reolink/workflows/Test%20and%20Release/badge.svg)

## reolink adapter for ioBroker

Adapter for ioBroker Plattform to get Reolink camera information.

In general all newer Reolink cameras support API commands. They just differ in their supported commands.

This adapter was just tested with RLC-510A. If you have tested this adapter with a different typ please let me now. I will add this bellow.

At the moment following API commands are included:

GetDevInfo		- General Information about camera
GetLocalLink	- Network information
GetMdState		- Motion Detection

Further Commands (not included):
GetAlarm
GetHDD
GetOsd
GetMask
GetNetPort
GetWifi
GetDdns
GetNtp
GetEmail
GetPush
GetFtp
GetEnc
GetRec
GetPerformance
GetTime
GetOnline
GetUser

There are also Set API Commands. I plan to add them later.

If you wish to have any specific API command included...just let me now.


### Supported Devices

RLC-510A

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

* (aendue) added languages

### 0.0.1 (2022-07-05)

* (aendue) initial release

## License
MIT License

Copyright (c) 2022 Andy Grundt <andygrundt@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.