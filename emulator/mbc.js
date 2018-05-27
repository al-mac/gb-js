var mbc = (function(rom, sys) {
	var me = this;
	var sys = sys;
	var rom = rom;
	
	var ram = new Uint8Array(0x8000);
	var state = {
		rom: 1, 														// CURRENT ROM BANK
		ram: 0, 														// CURRENT RAM BANK
		mode: 0,														// CURRENT MODE
		type: 0, 														// MBC TYPE
		battery: 0,														// MBC IS BATTERY BACKED
		externalRam: 0													// EXTERNAL RAM ENABLED
	};
	
	var saveTrigger = false;
	
	me.getRom = function() {
		return rom;
	};
	
	// MBC FUNCTIONS
	me.changeRomBank = function(bank) {
		switch(state.type) {
			case 1:
				state.rom = bank & 0x1F;
				switch(state.rom) {
					case 0x00: case 0x20: case 0x40: case 0x60:			// THOSE BANKS ARE UNAVALIABLE IN MBC1
						state.rom++;
						break;
				};
				break;
			case 2: break; 												// TODO (IMPLEMENT MBC2)
			case 3:
				state.rom = bank;
				if(state.rom === 0) state.rom = 1;						// BANK 0 IS UNAVALIABLE IN MBC3
				break;
		};
	};
	
	me.currentRomBank = function() {
		return state.rom;
	};
	
	var changeRamBank = function(v, r) {
		if(r) {
			state.rom = (state.rom & 0xE0) | (v & 0x1F);
			return;
		}
		switch(state.mode) {
			case 0: state.rom = (state.rom & 0x9F) | (v & 0x60); break;
			case 1: state.ram = v;
		};
	};
	
	me.getAddr = function(addr) {
		if(addr >= 0x4000 && addr < 0x8000)
			return rom[(0x4000 * state.rom) + (addr - 0x4000)];
		return ram[(0x2000 * state.ram) + (addr - 0xA000)];
	};
	
	me.setAddr = function(addr, val) {
		saveTrigger = false;
		if(addr < 0x2000)												// ENABLE / DISABLE EXTERNAL RAM
			state.externalRam = val;
		else if(addr >= 0x2000 && addr < 0x4000)
			changeRamBank(val, true);									// CHANGE ROM BANK
		else if(addr >= 0x4000 && addr < 0x6000)						// CHANGE ROM OR RAM BANK DEPENDING
			changeRamBank(val, false);									// ON THE CURRENT MODE
		else if(addr >= 0x6000 && addr < 0x8000) {						// CHANGE MODE
			state.mode = val;
		}
		else {
			var offset = ((0x2000 * state.ram)) + (addr - 0xA000);		// WRITE TO CARTRIDGE RAM.
			ram[offset] = val;
			saveTrigger = state.battery;								// SAVE GAME.
		};
	};
	
	me.getExternalRam = function() {
		return state.externalRam;
	};
	
	me.getSaveTrigger = function() {
		return saveTrigger;
	};
	
	// EMULATOR FUNCTIONALITY
	me.saveState = function() {
		var nram = [];
		for(var i = 0; i < ram.length; i++)
			nram[i] = ram[i];
	
		return {
			ram: nram,
			state: state,
			saveTrigger: saveTrigger
		};
	};
	
	me.loadState = function(s) {
		me.loadBattery(s.ram);
		state = s.state;
		saveTrigger = s.saveTrigger;
	};
	
	me.saveBattery = function() {
		var nram = [];
		for(var i = 0; i < ram.length; i++)
			nram[i] = ram[i];
		
		return nram;
	};
	
	me.loadBattery = function(b) {
		for(var i in b)
			ram[i] = b[i];
	};
	
	// CONSTRUCTOR
	(function() {
		var type = rom[0x0147];
		switch(type) {
			case 0x00: break;											// ROM ONLY
			case 0x01: case 0x02: case 0x03:							// MBC 1	
				state.type = 1;
				state.battery = type === 0x03;
				break;
			case 0x05: case 0x06:										// MBC 2 (?)
				state.type = 2;
				state.battery = type === 0x06;
				break;
			case 0x0F: case 0x10: case 0x11: case 0x12: case 0x13:		// MBC 3
				state.type = 3;
				state.battery = type === 0x13;
				break;
		};
	})();
});
