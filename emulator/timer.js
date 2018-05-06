var timer = (function(sys) {
	var me = this;
	var sys = sys;
	var sync = { div: 0, tima: 0, frequency: 0 };
	var baseClock = 4194304;
	var frequency = 0;
	
	// TIMER FUNCTIONS
	me.step = function(taken) {											// TIMER MAIN OPERATION
		sync.div += taken;
		if(sync.div > 0xFF) {
			sync.div &= 0xFF;
			sys.m.incRamPriv(0xFF04, 1);
		};
		
		if(sys.m.triggers.tac) {
			if(!(sys.m.triggers.tac & 0x04)) return;
			var freqswitch = sys.m.triggers.tac & 0x3;
			switch (freqswitch) {
				case 0: frequency = 4096; break;
				case 1: frequency = 262144; break;
				case 2: frequency = 65536; break;
				case 3: frequency = 16384; break;
			};
			
			sys.m.triggers.tac = 0;
		};
		
		sync.tima += taken;
		if(sync.tima >= (baseClock / frequency)) {
			sync.tima = 0;
			var result = (sys.m.getAddr(0xFF05) + 1) & 0xFF;
			sys.m.setAddr(0xFF05, result, true);
			if(result === 0) {
				sys.m.setAddr(0xFF05, sys.m.getAddr(0xFF06), true);
				sys.triggerInterrupt(2);
			};
		};
	};

	// EMULATOR FUNCTIONALITY
	me.saveState = function() {
		return { sync: sync };
	};
	
	me.loadState = function(s) {
		sync = s.sync;
	};
});
