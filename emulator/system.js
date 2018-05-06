var system = (function(display, loader, debugWindow) {
	var me = this;
	var debugWindow = debugWindow;
	me.binds = [39,37,38,40,90,88,32,13];								// DEFAULT BINDS (KEYCODES)
	me.keys = 0xFF;
	var requestId = 0;
	
	me.d = new dasm(me);												// DISASM / DEBUGGER.
	me.m = new mmu(me);													// MEMORY MANAGER.
	me.c = new cpu(me);													// PROCESSOR.
	me.t = new timer(me);												// TIMERS.
	me.g = new gpu(me, display);										// VIDEO.
	me.a = new apu(me);													// AUDIO.
	
	var baseClock = 70224;
	var speed = 1;
	var cycles = 0;
	
	var lastSaveTrigger = false;										// TRACKS THE BATTERY RAM ACCESS STATE
	
	// SYSTEM FUNCTIONS
	me.triggerInterrupt = function(index) {
		me.m.setBit(0xFF0F, index, 1, true);
	};
	
	me.log = function(text) {											// LOG TEXT ON DIV
		var p = document.createElement("div");
		p.innerHTML = text;
		debugWindow.appendChild(p);
		debugWindow.scrollTop = debugWindow.scrollHeight;
	};
	
	me.frame = function() {												// GAMEBOY LOOP
		while(cycles < baseClock * speed) {
			var pc = me.m.pc;
			var taken = me.c.step();
			//var debug = me.d.step(pc, {								// TRACE 
			//	cycles: taken, 
			//	pc: pc,
			//	ly: sys.m.getAddr(0xFF44)
			//});
			me.t.step(taken);
			me.g.step(taken);
			me.a.step();
			var trigger = me.m.getSaveTrigger();
			if(lastSaveTrigger && !trigger)								// FINISHED WRITING TO RAM
				saveBattery();
			lastSaveTrigger = trigger;
			//if(debug != null) me.log(debug); 
			cycles += taken;
		};
		
		cycles -= baseClock * speed;
		requestId = window.requestAnimationFrame(me.frame);
	};
	
	var saveBattery = function() {
		var battery = me.m.saveBattery();
		var compressed = compress(battery);
		localStorage["B_" + me.title()] = JSON.stringify(compressed);
	};
	
	var loadBattery = function() {
		var local = localStorage["B_" + me.title()];
		if(!local)
			return null;
		var decompressed = decompress(JSON.parse(local));
		return decompressed;
	};
	
	var compress = function(o) {	
		if(!Array.isArray(o)) return;
		var compressed = [];
		var compressing = 0;
		
		for(var i = 0; i < o.length; i++) {								// OMIT REPEATED ZEROES
			if(o[i] > 0) {												// WITH A WAY TO PARSE IT BACK
				if(compressing > 0) {									// (TYPEOF(STRING))
					if(compressing === 1) {
						compressed.push(0);
						compressing = 0;
					}
					else {
						compressed.push(compressing.toString());
						compressing = 0;
					};
				};
				compressed.push(o[i]);
				continue;
			};
			compressing++;
		};
	
		return compressed;
	};
	
	var decompress = function(o) {
		if(!Array.isArray(o)) return;
		var decompressed = [];
		for(var i = 0; i < o.length; i++) {
			if(typeof(o[i]) === "string") {
				var elements = parseInt(o[i]);
				while(elements > 0) {
					decompressed.push(0);
					elements--;
				};
				continue;
			};
			decompressed.push(o[i]);
		};
		return decompressed;
	};
	
	me.config = function(o) {											// CUSTOMIZE
		if(!o) return;
		me.g.config(o.gpu);												// CONFIG PALETTE AND SIZE
		me.a.config(o.apu);												// CONFIG SOUND
		
		if(o.bind)														// SET BIND
			me.binds[o.bind.index] = o.bind.key;
		
		if(o.speed)														// SET SPEED
			speed = o.speed;
	};

	me.saveState = function(destination) {								// SAVE STATE
		var state = {
			c: me.c.saveState(),
			t: me.t.saveState(),
			g: me.g.saveState(),
			m: me.m.saveState()
		};
		
		state.c.registers = compress(state.c.registers);
		state.m.ram = compress(state.m.ram);
		state.m.cram.ram = compress(state.m.cram.ram);
		
		switch(destination) {
			case "localStorage":
				localStorage["S_" + me.title()] = JSON.stringify(state);
				break;
			default:
				me.log("saveState - invalid destination: " + destination);
				break;
		};
	};

	me.loadState = function(source) {									// LOAD STATE
		switch(source) {
			case "localStorage":
				var json = localStorage["S_" + me.title()];
				if(!json) return;
				var state = JSON.parse(json);
				state.c.registers = decompress(state.c.registers);
				state.m.ram = decompress(state.m.ram);
				state.m.cram.ram = decompress(state.m.cram.ram);
				me.c.loadState(state.c);
				me.t.loadState(state.t);
				me.g.loadState(state.g);
				me.m.loadState(state.m);
				break;
			default:
				me.log("loadState - invalid source: " + source);
				break;
		};
	};

	me.title = function() {
		var tb = me.m.getBuffer(0x134, 16);
		var title = "";
		for(var i = 0; i < tb.length; i++) {
			if(tb[i] === 0) continue;
			title += String.fromCharCode(tb[i]);
		};
		return title;
	};
	
	var romLoadingHandler = function(e) {								// HANDLE FILE
		if(e.target.files.length == 0) return;
		var file = e.target.files[0];
		var r = new FileReader();
		r.onload = function() {
			window.cancelAnimationFrame(requestId);
			var rom = new Uint8Array(r.result);
			me.m.loadRom(rom);
			me.m.loadBattery(loadBattery());
			me.c.reset(true);
			
			me.frame();
		};
		r.readAsArrayBuffer(file);
	};
	
	me.holdButton = function(index) {
		if(index === -1) return;
		me.keys &= ~(1 << index);
	};
	
	me.releaseButton = function(index) {
		if(index === -1) return;
		me.keys |= (1 << index);
	};
	
	// MODIFIED DMG WITH NINTENDO LOGO
	var bios = [0x31,0xFE,0xFF,0xAF,0x21,0xFF,0x9F,0x32,0xCB,0x7C,0x20,0xFB,0x21,0x26,0xFF,0x0E,
				0x11,0x3E,0x80,0x32,0xE2,0x0C,0x3E,0xF3,0xE2,0x32,0x3E,0x77,0x77,0x3E,0xFC,0xE0,
				0x47,0x11,0x04,0x01,0x21,0x10,0x80,0x1A,0xCD,0x95,0x00,0xCD,0x96,0x00,0x13,0x7B,
				0xFE,0x34,0x20,0xF3,0x11,0xD8,0x00,0x06,0x08,0x1A,0x13,0x22,0x23,0x05,0x20,0xF9,
				0x3E,0x19,0xEA,0x10,0x99,0x21,0x2F,0x99,0x0E,0x0C,0x3D,0x28,0x08,0x32,0x0D,0x20,
				0xF9,0x2E,0x0F,0x18,0xF3,0x67,0x3E,0x64,0x57,0xE0,0x42,0x3E,0x91,0xE0,0x40,0x04,
				0x1E,0x02,0x0E,0x0C,0xF0,0x44,0xFE,0x90,0x20,0xFA,0x0D,0x20,0xF7,0x1D,0x20,0xF2,
				0x0E,0x13,0x24,0x7C,0x1E,0x83,0xFE,0x62,0x28,0x06,0x1E,0xC1,0xFE,0x64,0x20,0x06,
				0x7B,0xE2,0x0C,0x3E,0x87,0xE2,0xF0,0x42,0x90,0xE0,0x42,0x15,0x20,0xD2,0x05,0x20,
				0x4F,0x16,0x20,0x18,0xCB,0x4F,0x06,0x04,0xC5,0xCB,0x11,0x17,0xC1,0xCB,0x11,0x17,
				0x05,0x20,0xF5,0x22,0x23,0x22,0x23,0xC9,0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B,
				0x03,0x73,0x00,0x83,0x00,0x0C,0x00,0x0D,0x00,0x08,0x11,0x1F,0x88,0x89,0x00,0x0E,
				0xDC,0xCC,0x6E,0xE6,0xDD,0xDD,0xD9,0x99,0xBB,0xBB,0x67,0x63,0x6E,0x0E,0xEC,0xCC,
				0xDD,0xDC,0x99,0x9F,0xBB,0xB9,0x33,0x3E,0x3c,0x42,0xB9,0xA5,0xB9,0xA5,0x42,0x4C,
				0x21,0x04,0x01,0x11,0xA8,0x00,0x1A,0x13,0xBE,0x20,0xFE,0x23,0x7D,0xFE,0x34,0x20,
				0xF5,0x06,0x19,0x78,0x86,0x23,0x05,0x20,0xFB,0x86,0x20,0xFE,0x3E,0x01,0xE0,0x50,
				0x00,0x00,0x00,0x00,
				0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B,0x03,0x73,0x00,0x83,0x00,0x0C,0x00,0x0D,
				0x00,0x08,0x11,0x1F,0x88,0x89,0x00,0x0E,0xDC,0xCC,0x6E,0xE6,0xDD,0xDD,0xD9,0x99,
				0xBB,0xBB,0x67,0x63,0x6E,0x0E,0xEC,0xCC,0xDD,0xDC,0x99,0x9F,0xBB,0xB9,0x33,0x3E];

	me.runBios = function() {
		for(var i = 0; i < bios.length; i++) {
			me.m.setAddr(i, bios[i], true);
		};
		
		me.frame();
	};
	
	loader.onchange = romLoadingHandler;
});
