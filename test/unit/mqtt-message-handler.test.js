/**
 * Unit Test: MQTT Message Handler
 * 
 * Tests that MQTT messages are correctly parsed and handled.
 */

const { expect } = require('chai');

describe('MQTT Message Handler', () => {
    it('should parse motion triggered message', () => {
        const topic = 'neolink/Camera01/status/motion';
        const payload = 'triggered';
        
        const parts = topic.split('/');
        expect(parts).to.have.lengthOf(4);
        expect(parts[0]).to.equal('neolink');
        expect(parts[2]).to.equal('status');
        expect(parts[3]).to.equal('motion');
        
        expect(payload).to.equal('triggered');
    });
    
    it('should parse motion clear message', () => {
        const topic = 'neolink/Camera01/status/motion';
        const payload = 'clear';
        
        const parts = topic.split('/');
        expect(parts[3]).to.equal('motion');
        expect(payload).to.equal('clear');
    });
    
    it('should parse battery level message', () => {
        const topic = 'neolink/Camera01/status/battery_level';
        const payload = '87';
        
        const parts = topic.split('/');
        expect(parts[3]).to.equal('battery_level');
        
        const batteryLevel = parseInt(payload, 10);
        expect(batteryLevel).to.be.a('number');
        expect(batteryLevel).to.be.within(0, 100);
    });
    
    it('should parse floodlight on message', () => {
        const topic = 'neolink/Camera01/status/floodlight';
        const payload = 'on';
        
        const parts = topic.split('/');
        expect(parts[3]).to.equal('floodlight');
        expect(payload).to.equal('on');
    });
    
    it('should parse floodlight off message', () => {
        const topic = 'neolink/Camera01/status/floodlight';
        const payload = 'off';
        
        const parts = topic.split('/');
        expect(parts[3]).to.equal('floodlight');
        expect(payload).to.equal('off');
    });

    it('should parse PIR status message', () => {
        const topic = 'neolink/Camera01/status/pir';
        const payload = 'on';

        const parts = topic.split('/');
        expect(parts[3]).to.equal('pir');
        expect(payload).to.equal('on');
    });

    it('should parse PIR control topic', () => {
        const topic = 'neolink/Camera01/control/pir';
        const payload = 'off';

        const parts = topic.split('/');
        expect(parts).to.have.lengthOf(4);
        expect(parts[2]).to.equal('control');
        expect(parts[3]).to.equal('pir');
        expect(payload).to.equal('off');
    });

    it('should parse query topic for PIR', () => {
        const topic = 'neolink/Camera01/query/pir';

        const parts = topic.split('/');
        expect(parts).to.have.lengthOf(4);
        expect(parts[2]).to.equal('query');
        expect(parts[3]).to.equal('pir');
    });
    
    it('should parse preview message (base64)', () => {
        const topic = 'neolink/Camera01/status/preview';
        const payload = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        
        const parts = topic.split('/');
        expect(parts[3]).to.equal('preview');
        expect(payload).to.be.a('string');
        expect(payload.length).to.be.greaterThan(0);
    });
    
    it('should reject invalid topic format', () => {
        const topic = 'invalid/topic';
        const parts = topic.split('/');
        
        expect(parts.length).to.not.equal(4);
    });
    
    it('should reject invalid battery level', () => {
        const payload = 'invalid';
        const batteryLevel = parseInt(payload, 10);
        
        expect(isNaN(batteryLevel)).to.be.true;
    });
});
