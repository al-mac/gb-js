var mmu = (function(sys) {
	var me = this;
	var sys = sys;
	var ram = new Uint8Array(0x10000);
	var cram = null;
	me.sp = 0xFFFE;
	me.pc = 0x0000;
	me.triggers = { audio: 0, tac: 0, tile: 0 };
	
	// RAM FUNCTIONS
	me.opcode = function(offset) {										// OPCODE + OFFSET
		return me.getAddr(me.pc + offset);
	};
	
	me.getAddr = function(addr) {										// GET BYTE FROM RAM
		if((addr >= 0x4000 && addr < 0x8000) ||
			(addr >= 0xA000 && addr < 0xC000 && cram.getExternalRam()))
			return cram.getAddr(addr);
		return ram[addr];
	};
	
	me.getBit = function(addr, index) {									// GET BIT FROM RAM
		return (me.getAddr(addr) & (1 << index)) >> index;
	};
	
	me.setAddr = function(addr, val, priv) {							// SET BYTE ON RAM
		if(priv) {														// AVOID VALIDATION
			ram[addr] = val;
			return;
		};
		
		if(addr < 0x8000) {												// MEMORY BANKING
			if(addr >= 0x2000 && addr < 0x4000) 
				cram.changeRomBank(val);
			else
				cram.setAddr(addr, val);
		}
		else if(addr >= 0x8000 && addr < 0x9800) {
			ram[addr] = val;
			me.triggers.tile = 1;
		}
		else if(addr >= 0xA000 && addr < 0xC000) {						// CARTRIDGE RAM
			if(cram.getExternalRam())
				cram.setAddr(addr, val);
			else ram[addr] = val;
		}
		else if(addr >= 0xC000 && addr < 0xDE00) {						// INTERNAL RAM, ECHOED
			ram[addr] = val;											// ON 0xE000 - 0xFDFF
			ram[addr + 0x2000] = val;
		}
		else if(addr === 0xFF00) {										// JOYPAD
			switch((val & 0x30) >> 4) {
				case 0x01:
					ram[addr] = (val & 0xF0) | ((sys.keys & 0xF0) >> 4);
					break;
				case 0x02:
					ram[addr] = (val & 0xF0) | (sys.keys & 0x0F);
					break;
			};
			ram[addr] = (val & 0xF0) | (ram[addr] & 0x0F);
		}
		else if(addr === 0xFF04) {										// TIMER: DIV REGISTER
			ram[addr] = 0;
		}
		else if(addr === 0xFF07) {										// TAC
			me.triggers.tac = ram[addr] = val;
		}
		else if(addr >= 0xFF10 && addr < 0xFF40) {						// AUDIO REGISTERS
			me.triggers.audio = addr;									// TRIGGER AUDIO
			ram[addr] = val;
		}
		else if(addr === 0xFF40) {										// GPU: LCDC. SETTING IT SETS LY TO 0
			if((ram[addr] & 0x80) && !(val & 0x80))						// GPU. LCD DISABLED.
				ram[0xFF41] = (ram[0xFF41] & 0xFC) | 0x01;				// SET STAT TO 1
			ram[addr] = val;
		}
		else if(addr === 0xFF44) {										// GPU: LY
			ram[addr] = 0;
		}
		else if(addr === 0xFF46) {										// DMA TRANSFER
			ram[addr] = val;
			var newAddr = val << 8;
			for(var i = 0; i < 0xA0; i++)
				me.setAddr(0xFE00 + i, me.getAddr(newAddr + i));
		}
		else
			ram[addr] = val;
	};
	
	me.setBit = function(addr, bit, val, priv) {						// SET BIT ON RAM
		var v = me.getAddr(addr);
		switch(val) {
			case false: case 0: v = (v & ~(1 << bit)); break;
			case true: case 1: v = (v | (1 << bit)); break;
			default: sys.log("setBit: invalid value: " + val); break;
		};
		
		if(priv) ram[addr] = v;
		else me.setAddr(addr, v);
	};

	me.stackPush = function(val, len) {									// PUSH TO THE STACK
		switch(len) {
			case 8:														// PUSH 8 BIT VALUE
				var b = (val & 0xFF);
				--me.sp;
				me.setAddr(me.sp, b);
				break;
			case 16:													// PUSH 16 BIT VALUE
				var hibyte = (val & 0xFF00) >> 8;
				var lobyte = (val & 0x00FF);
				--me.sp;
				me.setAddr(me.sp, hibyte);
				--me.sp;
				me.setAddr(me.sp, lobyte);
				break;
			default: 
				sys.log("stackPush: invalid length: " + len);
				break;
		};
	};
	
	me.stackPop = function(len) {										// POP FROM THE STACK
		switch(len) {
			case 8:
				var b = me.getAddr(me.sp);								// POP 8 BIT VALUE
				++me.sp;
				return b;
			case 16:													// POP 16 BIT VALUE
				var lobyte = me.getAddr(me.sp);
				++me.sp;
				var hibyte = me.getAddr(me.sp);
				++me.sp;
				return (hibyte << 8) | lobyte;
				break;
			default:
				sys.log("stackPop: invalid length: " + len);
				break;
		};
	};

	me.getBuffer = function(start, length) {
		var buffer = new Uint8Array(length);
		for(var i = start; i < start + length; i++)
			buffer[i - start] = ram[i];
		return buffer;
	};
	
	me.copyBuffer = function(buffer, start) {
		for(var i = start; i < start + buffer.length; i++)
			buffer[i - start] = ram[i];
	};

	me.getSaveTrigger = function() {
		return cram.getSaveTrigger();
	};
	
	me.saveBattery = function() {
		return cram.saveBattery();
	};
	
	// TIMER PERFORMANCE
	me.incRamPriv = function(addr, inc) {
		ram[addr] += inc;
	};
	
	// EMULATOR FUNCTIONALITY
	me.saveState = function() {											// SAVE STATE
		var nram = [];
		for(var i = 0; i < ram.length; i++)
			nram[i] = ram[i];
		return {
			ram: nram,
			sp: me.sp,
			pc: me.pc,
			triggers: me.triggers,
			cram: cram.saveState()
		};
	};
	
	me.loadState = function(s) {										// LOAD STATE
		for(var i in s.ram)
			ram[i] = s.ram[i];
		
		me.sp = s.sp;
		me.pc = s.pc;
		me.triggers = s.triggers;
		cram.loadState(s.cram);
	};

	me.loadRom = function(rom, battery) {								// LOAD ROM AND START MBC
		for(var i = 0; i < 0x8000; i++)									// LOAD FIRST 0x8000 BYTES INTO RAM
			ram[i] = rom[i];
		
		cram = new mbc(rom, sys);										// START MBC
	};
	
	me.loadBattery = function(battery) {
		if(!battery) return;
		cram.loadBattery(battery);										// LOAD SAVEGAME IF HAS BATTERY
	};
});
