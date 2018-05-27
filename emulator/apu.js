var apu = (function(sys) {
	var me = this;
	var sys = sys;
	var context = null;
	var channels = [];
	var sampleRate = null;
	var baseFrequency = null;
	var maxGain = null;
	var table = [];
	var rix = 0;
	var enabled = true;
	
	var channelmap = [
		[0xFF10, 0xFF11, 0xFF12, 0xFF13, 0xFF14],
		[0x0000, 0xFF16, 0xFF17, 0xFF18, 0xFF19],
		[0xFF1A, 0xFF1B, 0xFF1C, 0xFF1D, 0xFF1E],
		[0x0000, 0xFF20, 0xFF21, 0xFF22, 0xFF23]
	];
	
	var random = function() {
		return ++rix >= table.length ? table[rix = 0] : table[rix];
	};
	
	me.config = function(o) {
		if(!o) return;
		if(o.toggle)
			enabled = !enabled;
	};
	
	me.step = function() {
		if(!enabled) return;
		var trigger = sys.m.triggers.audio;
		if(!trigger) return;
		sys.m.triggers.audio = 0;
		
		for(var c = 0; c < channelmap.length; c++) {
			var map = channelmap[c];
			var t = map.indexOf(trigger);
			if(t === -1) continue;
			
			switch(t) {
				case 0x00:
					cfgSweep(c, map[0]);
					break;
				case 0x01:
					cfgWaveData(c, map[1]);
					break;
				case 0x02:
					cfgEnvelope(c, map[2]);
					break;
				case 0x03:
					cfgFreq(c, map[3], map[4]);
					break;
				case 0x04:
					cfgFreq(c, map[3], map[4]);
					me.play(c);
					break;
			};
		};
	};
	
	me.play = function(channel) {
		var c = channels[channel];
		var data = c.buffer.getChannelData(0);
		var calc = baseFrequency / (c.frequency / 100);
		var waveDuty = c.waveDuty == null ? 0.5 : c.waveDuty;
		
		var length = data.length;
		
		if(c.lengthEnabled && c.length != null)
			length = data.length * c.length;
		
		var gain = c.envelope 
			? c.envelope.initial
			: maxGain;
		if(c.gain)
			gain = c.gain;
		var envelopeCalc = null;
		if(c.envelope)
			envelopeCalc = Math.round(sampleRate * c.envelope.step);
		
		for(var i = 0; i < data.length; i++) {							// GENERATE A SQUARE WAVE OR NOISE
			if(i <= length) {
				if(c.sweep && i > 0) {
					if((i % c.sweep.time) === 0) {
						var freqSweep = calc / (1 << c.sweep.shift);
						if(c.sweep.direction)
							calc += freqSweep;
						else
							calc -= freqSweep;
					};
					
				};
				var wave = 0;
				
				if(channel === 3) {
					var w = random() * gain;
					var wave = (i % calc) < (calc * waveDuty) 
						? w  : -w;
				}
				else {
					var wave = (i % calc) < (calc * waveDuty)
						? gain 
						: 0;
				}

				if(envelopeCalc != null) {
					if(i > 0 && (i % envelopeCalc) === 0) {
						if(c.envelope.direction) {
							gain += 0.01666;
							if(gain > 0.25)
								gain = 0.25;
						}
						else {
							gain -= 0.01666
							if(gain < 0)
								gain = 0;
						};
					};
				};
				data[i] = wave;
				continue;
			};
			
			data[i] = 0;
		};
		
		c.source.stop();
		c.source = context.createBufferSource();
		c.source.buffer = c.buffer;
		c.source.connect(context.destination);
		c.source.start();
	};
	
	// CHANNEL CONFIGURATION
	var cfgSweep = function(channel, addr) {
		if(channel === 2) {
			return;
		};
		
		var val = sys.m.getAddr(addr);
		if(channels[channel].sweep) {
			channels[channel].sweep.time = Math.round(
				sampleRate * (((val & 0x70) >> 4) * 7.8) * 0.001);
			channels[channel].sweep.direction = (val & 0x08) >> 3;
			channels[channel].sweep.shift = val & 0x07;
		}
		else {
			var sweep = {};
			sweep.time = Math.round(									// 7.8 MS - MIN SWEEP TIME. 1 / 128 HZ
				sampleRate * (((val & 0x70) >> 4) * 7.8) * 0.001);
			sweep.direction = (val & 0x08) >> 3;
			sweep.shift = val & 0x07;
			channels[channel].sweep = sweep;
		};
	};
	
	var cfgFreq = function(channel, loAddr, hiAddr) {					// CONFIG FREQUENCY
		var lo = sys.m.getAddr(loAddr);
		var hi = sys.m.getAddr(hiAddr);
		var x = (hi & 0x07) << 8 | lo;
		channels[channel].frequency = channel === 2
			? 4194304 / (64 * (2048 - x))
			: 131072 / (2048 - x);
		
		channels[channel].lengthEnabled = hi & 0x40;
	};
	
	var cfgWaveData = function(channel, addr) {
		if(channel === 2) {
			channels[channel].waveDuty = 0.5;
			cfgLength(channel, addr);
			return;
		};
		
		var val = sys.m.getAddr(addr);
		switch((val & 0xC0) >> 6) {
			case 0x00: channels[channel].waveDuty = 0.125; break;
			case 0x01: channels[channel].waveDuty = 0.25; break;
			case 0x02: channels[channel].waveDuty = 0.50; break;
			case 0x03: channels[channel].waveDuty = 0.75; break;
		};
		
		cfgLength(channel, val);
	};
	
	var cfgLength = function(channel, val) {
		if(channel === 2) {
			var t1 = sys.m.getAddr(val);								// CHANNEL 3
			channels[channel].length = (256 - t1) * 0.00390625;			// 1 / 256
			return;
		};
		var t1 = val & 0x3F;
		channels[channel].length = (64 - t1) * 0.00390625;				// 1 / 256
	};
	
	var cfgEnvelope = function(channel, addr) {
		var val = sys.m.getAddr(addr);
		if(channel === 2) {
			switch((val & 0x60) >> 5) {
				case 0x00: channels[channel].gain = 0; return;
				case 0x01: channels[channel].gain = 0.25; return;
				case 0x02: channels[channel].gain = 0.125; return;
				case 0x03: channels[channel].gain = 0.0625; return;
			};
		};
		
		if(channels[channel].envelope) {								// AVOID UNNECESSARY ALLOCATIONS
			channels[channel].envelope.initial = ((val & 0xF0) >> 4) 
				* 0.01666;
			channels[channel].envelope.direction = (val & 0x08) >> 3;
			channels[channel].envelope.step = (val & 0x07) * 0.015625;
		}
		else {
			var envelope = {};
			envelope.initial = ((val & 0xF0) >> 4) * 0.01666;			// 0.01666 = 1 / 15 OF MAX GAIN.
			envelope.direction = (val & 0x08) >> 3;
			envelope.step = (val & 0x07) * 0.015625;					// STEP IN SECONDS. 0.015625 = 1 / 64 SECONDS
			channels[channel].envelope = envelope;
		};
	};
	
	// CONSTRUCTOR
	(function() {
		context = new window.AudioContext();
		sampleRate = context.sampleRate;
		
		for(var i = 0; i < 4; i++) {
			channels[i] = {
				buffer: context.createBuffer(1, 
					sampleRate * 0.5, sampleRate),
				source: context.createBufferSource()
			}
			channels[i].source.start();
		};
		
		baseFrequency = sampleRate * 0.01;
		maxGain = 0.25;
		
		for(var i = 10000; i >= 0; i--)
			table.push(Math.random());
	})();
});
