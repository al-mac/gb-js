var cpu = (function(sys) {
	var me = this;
	var sys = sys;
	var registers = new Uint8Array(8);
	var interruptTrigger = false;
	var ime = false;
	
	var un = new Array(256);											// UNPREFIXED INSTRUCTIONS
	var cb = new Array(256);											// CB PREFIXED INSTRUCTIONS
	var handlers = [0x40, 0x48, 0x50, 0x58, 0x60];						// INTERRUPT HANDLER ADDRESSES
	
	// CPU FUNCTIONS
	me.step = function() {												// FETCH / DECODE / EXECUTE
		var op = sys.m.opcode(0);
		var map = un;
		if(op === 0xCB) {
			op = sys.m.opcode(1);
			map = cb;
		};
		var taken = map[op](op);
		handleInterrupts(op);
		return taken;
	};
	
	var handleInterrupts = function(op) {								// HANDLE INTERRUPTS
		var ffff = sys.m.getAddr(0xFFFF);
		var ffof = sys.m.getAddr(0xFF0F);
		for(var i = 0; i < 5; i++) {
			var mask = 1 << i;
			if((ffff & mask) && (ffof & mask)) {
				if(op === 0x76)
					interruptTrigger = true;
				if(ime) {
					ime = false;
					sys.m.setBit(0xFF0F, i, 0, true);
					sys.m.stackPush(sys.m.pc, 16);
					sys.m.pc = handlers[i];
					return;
				};
			};
		};
	};
	
	me.reset = function(smr) {											// RESET TO INITIAL VALUES POST DMG EXECUTION
		if(smr) {
			registers[6] = 0xB0;
			registers[7] = 0x01;
			me.setRegPair(0, 0x0013);
			me.setRegPair(1, 0x00D8);
			me.setRegPair(2, 0x014D);
			sys.m.sp = 0xFFFE;
			sys.m.setAddr(0xFF05, 0x00, 1);   							// TIMA
			sys.m.setAddr(0xFF06, 0x00, 1);   							// TMA
			sys.m.setAddr(0xFF07, 0x00, 1);   							// TAC
			sys.m.setAddr(0xFF10, 0x80, 1);   							// NR10
			sys.m.setAddr(0xFF11, 0xBF, 1);   							// NR11
			sys.m.setAddr(0xFF12, 0xF3, 1);   							// NR12
			sys.m.setAddr(0xFF14, 0xBF, 1);   							// NR14
			sys.m.setAddr(0xFF16, 0x3F, 1);   							// NR21
			sys.m.setAddr(0xFF17, 0x00, 1);   							// NR22
			sys.m.setAddr(0xFF19, 0xBF, 1);   							// NR24
			sys.m.setAddr(0xFF1A, 0x7F, 1);   							// NR30
			sys.m.setAddr(0xFF1B, 0xFF, 1);   							// NR31
			sys.m.setAddr(0xFF1C, 0x9F, 1);   							// NR32
			sys.m.setAddr(0xFF1E, 0xBF, 1);   							// NR33
			sys.m.setAddr(0xFF20, 0xFF, 1);   							// NR41
			sys.m.setAddr(0xFF21, 0x00, 1);   							// NR42
			sys.m.setAddr(0xFF22, 0x00, 1);   							// NR43
			sys.m.setAddr(0xFF23, 0xBF, 1);   							// NR30
			sys.m.setAddr(0xFF24, 0x77, 1);   							// NR50
			sys.m.setAddr(0xFF25, 0xF3, 1);   							// NR51
			sys.m.setAddr(0xFF26, 0xF1, 1);   							// $F0-SGB ; NR52
			sys.m.setAddr(0xFF40, 0x91, 1);   							// LCDC
			sys.m.setAddr(0xFF42, 0x00, 1);   							// SCY
			sys.m.setAddr(0xFF43, 0x00, 1);   							// SCX
			sys.m.setAddr(0xFF45, 0x00, 1);   							// LYC
			sys.m.setAddr(0xFF47, 0xFC, 1);   							// BGP
			sys.m.setAddr(0xFF48, 0xFF, 1);   							// OBP0
			sys.m.setAddr(0xFF49, 0xFF, 1);   							// OBP1
			sys.m.setAddr(0xFF4A, 0x00, 1);   							// WY
			sys.m.setAddr(0xFF4B, 0x00, 1);   							// WX
			sys.m.setAddr(0xFFFF, 0x00, 1);   							// IE
			sys.m.pc = 0x100;
		};
	};
	
	// EMULATOR FUNCTIONALITY
	me.saveState = function() {											// SAVE STATE
		var nregisters = [];
		for(var i = 0; i < registers.length; i++)
			nregisters[i] = registers[i];
		return {
			registers: nregisters,
			interruptTrigger: interruptTrigger,
			ime: ime
		};
	};
	
	me.loadState = function(s) {										// LOAD STATE
		for(var i in s.registers)
			registers[i] = s.registers[i];
		ime = s.ime;
		interruptTrigger = s.interruptTrigger;
	};
	
	// HELPERS
	me.getRegPair = function(index) {									// GET REGISTER PAIR
		return index === 0x3 
			? sys.m.sp 
			: ((registers[index << 1] << 8) | registers[(index << 1) + 1]);
	};
	
	me.setRegPair = function(index, val) {								// SET REGISTER PAIR
		if(index === 0x3) {
			sys.m.sp = val;
			return;
		};
		registers[(index << 1)] = ((val & 0xFF00) >> 8);
		registers[(index << 1) + 1] = (val & 0x00FF);
	};
	
	me.setFlag = function(mask, val) {									// SET FLAG
		registers[6] &= ~mask;
		if(val) registers[6] |= mask;
	};
	
	me.setZero = function(c) {											// SET ZERO FLAG BASED ON RESULT
		registers[6] &= ~0x80;
		if((c & 0xFF) === 0) registers[6] |= 0x80;
	};
	
	me.setSubtract = function(val) {									// SET SUBTRACT FLAG
		me.setFlag(0x40, val);
	};
	
	me.setHalfCarry = function(a, b, c, bits) {							// SET HALF-CARRY FLAG (THIS IS A MESS, I KNOW)
		registers[6] &= ~0x20;
		switch(bits) {
			case 8:
				if(b >= 0) {
					if(((c & 0xFF) ^ (b & 0xFF) ^ a) & 0x10)
						registers[6] |= 0x20;
				}
				else {
					if((a & 0xF) < ((-b) & 0xF))
						registers[6] |= 0x20;
				}
				break;
			case 16:
				if(b >= 0) {
					if((((a & 0xFFF) + (b & 0xFFF)) & 0x1000))
						registers[6] |= 0x20;
				}
				else {
					if(((c & 0xFF00) >> 4) != ((a & 0xFF00) >> 4))
						registers[6] |= 0x20;
				}
				break;
		};
	};
	
	me.setCarry = function(c, bits) {									// SET CARRY FLAG
		registers[6] &= ~0x10;
		switch(bits) {
			case 8:
				if(c < 0 || c > 255) registers[6] |= 0x10;
				return;
			case 16: if(c < 0 || c > 65535)
				registers[6] |= 0x10;
				return;
		};
	};
	
	me.getSigned = function(val) {										// TRANSFORM UNSIGNED BYTE IN SIGNED
		var n = val;
		if(n > 128) n = n - 256;
		return n;
	};
	
	me.advancePc = function(offset, cycles) {							// ADVANCE PROGRAM COUNTER AND RETURN CYCLES TAKEN
		sys.m.pc += offset;
		return cycles;
	};
	
	// MICRO-CODE
	var ldrp = function(o) {											// LOAD REGISTER PAIR
		var val = (sys.m.opcode(2) << 8) | sys.m.opcode(1);
		me.setRegPair((o & 0x30) >> 4, val);
		return me.advancePc(3, 12);
	};
	
	var ldma = function(o) {											// LOAD RAM TO A / A TO RAM
		var rp = (o & 0x30) >> 4;
		var setAccumulator = (o & 0x08) >> 3;
		var incDecFactor = 0;
		var pair = 0;
		switch(rp) {
			case 0x02: pair = rp; incDecFactor = 1; break;
			case 0x03: pair = 2; incDecFactor = -1; break;
			default: pair = rp;	incDecFactor = 0; break;
		}
		
		if(setAccumulator)
			registers[7] = sys.m.getAddr(me.getRegPair(pair));
		else
			sys.m.setAddr(me.getRegPair(pair), registers[7]);
		
		if(incDecFactor !== 0)
			me.setRegPair(pair, me.getRegPair(pair) + incDecFactor);
		
		return me.advancePc(1, 8);
	};
	
	var idrp = function(o) {											// INCREMENT / DECREMENT REGISTER PAIR
		var rp = (o & 0x30) >> 4;
		var a = me.getRegPair(rp);
		var b = (o & 0x8) >> 3 === 1 ? -1 : 1;
		me.setRegPair(rp, a + b);
		return me.advancePc(1, 8);
	};
	
	var idrhl = function(o) {											// INCREMENT / DECREMENT REGISTER / (HL)
		var r = (o & 0x38) >> 3;
		var inc = (o & 0x07) === 4;
		var a = 0;
		
		var b = inc ? 1 : -1;
		var c = 0;
		var cycles = 0;
		if(r === 6) {													// INC / DEC (HL)
			var hl = me.getRegPair(2);
			a = sys.m.getAddr(hl);
			c = a + b;
			sys.m.setAddr(hl, c);
			cycles = 12;
		}
		else {															// INC / DEC r
			a = registers[r];
			c = a + b;
			registers[r] = c;
			cycles = 4;
		}
		
		me.setZero(c & 0xFF);											// FLAGS
		me.setSubtract(!inc);
		me.setHalfCarry(a, b, c, 8);
		return me.advancePc(1, cycles);
	};
	
	var ldrr = function(o) {											// LOAD REGISTER INTO REGISTER
		var a = (o & 0x38) >> 3;
		var b = (o & 0x07);
		var len = 1;
		var cycles = 4;
		if(a === 6 && b === 6) {
			sys.m.setAddr(me.getRegPair(2), sys.m.opcode(1));			// LD (HL),d8
			len = 2;
			cycles = 12;
		}
		else if(a === 6)
			sys.m.setAddr(me.getRegPair(2), registers[b]);				// LD (HL),r
		else if(b === 6) {
			cycles = 8;
			switch((o & 0xC0) >> 6) {
				case 0:													// LD r,n 
					registers[a] = sys.m.opcode(1);
					len = 2; 
					break;
				case 1:													// LD r,(HL)
					registers[a] = sys.m.getAddr(me.getRegPair(2)); 
					break;
			}
		}
		else
			registers[a] = registers[b];								// LD r,r
		
		return me.advancePc(len, cycles);
	};
	
	var rotate = function(o) {											// ROTATE / SHIFT BITS
		var cb = sys.m.opcode(0) === 0xCB;								// IF IT IS CB, SET ZERO FLAG
		var r = o & 0x07;												// OPERAND INDEX
		var right = o & 0x08;											// ROTATE DIRECTION
		var operand = r === 0x06										// OPERAND (HL) or REGISTER
			? sys.m.getAddr(me.getRegPair(2))
			: registers[r];
		var opbit = right												// SHIFTED OUT BIT
			? operand & 0x01
			: (operand & 0x80) >> 7;
		var cybit = (registers[6] & 0x10) >> 4;							// CARRY BIT
		
		registers[6] = 0;
		var result = 0;
		switch((o & 0xF0) >> 4) {
			case 0x00:													// RLCA / RRCA / RLC n / RRC n
				result = right
					? operand >> 1 | opbit << 7
					: operand << 1 | opbit;
				registers[6] |= (opbit << 4);							// CARRY IS THE SHIFTED OUT BIT
				break;
			case 0x01:													// RLA / RRA / RL n / RR n
				result = right
					? operand >> 1 | cybit << 7
					: operand << 1 | cybit;
				registers[6] |= (opbit << 4);							// CARRY IS THE SHIFTED OUT BIT
				break;
			case 0x02:													// SLA / SRA
				if(right) {
					registers[6] |= (opbit << 4);						// CARRY IS THE SHIFTED OUT BIT
					var msb = operand & 0x80;
					result = operand >> 1 | msb;
				}
				else {
					result = operand << 1;
					registers[6] |= (opbit << 4);						// CARRY IS THE SHIFTED OUT BIT
				}
				break;
			case 0x03:
				if((o & 0xF) > 0x07) {									// SRL
					result = right
						? operand >> 1
						: operand << 1;
				}
				else {													// SRA
					result = right
						? operand >> 1 | opbit << 7
						: operand << 1 | opbit;
				}
				registers[6] |= (opbit << 4);							// CARRY IS THE SHIFTED OUT BIT
				break;
		};
		
		if(r === 0x06)
			sys.m.setAddr(me.getRegPair(2), result);
		else
			registers[r] = result;
		
		if(cb)
			me.setZero(result);
			
		return me.advancePc(cb ? 2 : 1, cb ? (r === 0x06 ? 16 : 8) : 4);
	};
	
	var addhlrp = function(o) {											// ADD REGISTER PAIR TO HL
		var hl = me.getRegPair(2);
		var rp = me.getRegPair((o & 0x30) >> 4);
		var result = hl + rp;
		me.setRegPair(2, result);
		
		me.setSubtract(0);												// FLAGS
		me.setHalfCarry(hl, rp, result, 16);
		me.setCarry(result, 16);
		
		return me.advancePc(1, 8);
	};
	
	var ld16immediate = function(o) {									// LOAD FROM / TO ADDRESS IMMEDIATE DATA
		var data = sys.m.opcode(2) << 8 | sys.m.opcode(1);
		var cycles = 16;
		switch(o) {
			case 0x08:													// LD (a16),SP
				sys.m.setAddr(data + 1, (sys.m.sp & 0xFF00) >> 8);
				sys.m.setAddr(data, sys.m.sp & 0xFF);
				cycles = 20;
				break;
			case 0xEA: sys.m.setAddr(data, registers[7]); break;		// LD (a16),A
			case 0xFA: registers[7] = sys.m.getAddr(data); break;		// LD A,(a16)
		}
		
		return me.advancePc(3, cycles);
	};
	
	var jrel = function(o) {											// JUMP RELATIVE TO SIGNED DATA
		if(o & 0x20) {													// CONDITIONAL
			var flag = o & 0x10
				? (registers[6] & 0x10) >> 4							// CARRY
				: (registers[6] & 0x80) >> 7;							// ZERO
			
			if(o & 0x08 ? !flag : flag) {								// CONDITION UNMET
				sys.m.pc += 2;
				return 8;
			}
		};
		
		var relative = me.getSigned(sys.m.opcode(1));					// MAKE JUMP
		sys.m.pc += relative;
		return me.advancePc(2, 12);
	};
	
	var daa = function(o) {												// DECIMAL ADJUST ACCUMULATOR
		var a = registers[7];
		if (!(registers[6] & 0x40)) {
			if ((registers[6] & 0x20) || (a & 0x0F) > 9)
				a += 6;
			if ((registers[6] & 0x10) || a > 0x9F)
				a += 0x60;
		} else {
			if (registers[6] & 0x20) {
				a -= 6;
				if (!(registers[6] & 0x10))
					a &= 0xFF;
			}
			if (registers[6] & 0x10)
				a -= 0x60;
		}
		
		registers[6] &= ~(0x20 | 0x80);
		if (a & 0x100)
			registers[6] |= 0x10;
		
		registers[7] = a & 0xFF;
		if (!registers[7])
			registers[6] |= 0x80;
		
		return me.advancePc(1, 4);
	};
	
	var cpl = function(o) {												// COMPLEMENT ACCUMULATOR
		registers[7] ^= 0xFF;
		registers[6] |= 0x60;											// SET NEGATIVE AND HALF-CARRY
		return me.advancePc(1, 4);
	};
	
	var scf = function(o) {												// SET CARRY FLAG
		registers[6] &= 0x80;
		registers[6] |= 0x10;
		return me.advancePc(1, 4);
	};
	
	var ccf = function(o) {												// COMPLEMENT CARRY FLAG
		var on = registers[6] & 0x10;
		registers[6] &= 0x80;
		if(!on) registers[6] |= 0x10;
		return me.advancePc(1, 4);
	};
	
	var addsub = function(o) {											// ADD OR SUBTRACT REGISTER OR (HL)
		var op = (o & 0x18) >> 3;
		var subtraction = op > 1;
		var carry = op % 2 === 1;										// IF CARRY
		var flag = (registers[6] & 0x10) >> 4;							// CARRY FLAG VALUE
		var immediate = (o & 0xF0) >= 0xC0;
		
		var r = o & 0x07;
		var a = registers[7];
		var b = r === 0x06
			? immediate 
				? sys.m.opcode(1)										// ADD OR SUBTRACT IMMEDIATE
				: sys.m.getAddr(me.getRegPair(2))						// ADD OR SUBTRACT (HL)
			: registers[r];												// ADD OR SUBTRACT REGISTER	
		var c = subtraction ? a - b : a + b;
		
		if(carry && flag) c += (subtraction ? -1 : 1);
		registers[7] = c;
		
		me.setZero(c);													// FLAGS
		me.setSubtract(subtraction);
		me.setHalfCarry(a, b, c, 8);
		me.setCarry(c, 8);
		
		return me.advancePc(immediate ? 2 : 1, r === 0x06 ? 8 : 4);
	};
	
	var logic = function(o) {											// LOGICAL OPERATIONS (AND, OR, XOR, CP)
		var immediate = (o & 0xF0) >= 0xE0;
		var r = o & 0x07;
		var a = registers[7];
		var b = r === 0x06
			? immediate 
				? sys.m.opcode(1)										// LOGIC IMMEDIATE
				: sys.m.getAddr(me.getRegPair(2))						// LOGIC (HL)
			: registers[r];												// LOGIC REGISTER
		var c = 0;
		
		var operation = (o & 0x18) >> 3;
		registers[6] = 0;
		switch(operation) {
			case 0x00: c = a & b; me.setFlag(0x20, 1); break;			// AND
			case 0x01: c = a ^ b; break;								// XOR
			case 0x02: c = a | b; break;								// OR
			case 0x03: c = a - b; break;								// CP
		}
		
		me.setZero(c);													// OTHER FLAGS
		if(operation !== 0x03) {
			registers[7] = c;
		}
		else {
			me.setSubtract(1);
			me.setHalfCarry(a, b, c, 8); 
			me.setCarry(c, 8);
		}
		
		return me.advancePc(immediate ? 2 : 1, r === 0x06 ? 8 : 4);
	};
	
	var ret = function(o) {												// RETURN / CONDITIONAL RETURN
		if(o === 0xD9) ime = true;										// RESTORE IME IF RETI
		var condition = false;
		var cycles = 16;
		if(o & 1)
			condition = true;
		else {
			var flag = (o & 0x10) >> 4									// OPCODE SAYS WHICH FLAG TO USE
				? (registers[6] & 0x10) >> 4							// CARRY FLAG 
				: (registers[6] & 0x80) >> 7;							// ZERO FLAG
			condition = (o & 0x08) >> 3									// OPCODE SAYS IF TO EXECUTE 
				? flag													// THE FLAG NEEDS TO BE ON OR OFF
				: !flag;
			cycles = condition ? 20 : 8;
		}
		
		if(condition)
			sys.m.pc = sys.m.stackPop(16);
		else
			sys.m.pc++;
		
		return cycles;
	};
	
	var pushpop = function(o) {											// PUSH / POP REGISTER PAIR
		var r = (o & 0x30) >> 4;
		var cycles = 16;
		switch(o & 0x0F) {
			case 1:														// POP RP
				var val = sys.m.stackPop(16);
				if(r === 3) {											// IN THIS CASE 3 MEANS AF, NOT SP.
					registers[6] = val & 0xF0;
					registers[7] = (val & 0xFF00) >> 8;
				}
				else
					me.setRegPair(r, val);
				cycles = 12;
				break; 													
			case 5:														// PUSH RP
				var h = 0, l = 0;
				if(r === 3) {											// IN THIS CASE 3 MEANS AF, NOT SP.
					var val = (registers[7] << 8) | registers[6];
					sys.m.stackPush(val, 16);
				}
				else
					sys.m.stackPush(me.getRegPair(r), 16);
				break;
		};
		
		return me.advancePc(1, cycles);
	};
	
	var jumpcall = function(o) {										// JUMP / CALL
		var flag = (o & 0x10) >> 4 
			? (registers[6] & 0x10) >> 4								// CARRY FLAG
			: (registers[6] & 0x80) >> 7;								// ZERO FLAG
		flag = o & 0x08 ? flag : !flag;									// NEGATE FLAG BASED ON OPCODE
		if(((o & 0x06) >> 1) > 1) {										// CALL
			var cycles = 24;
			var dest = (sys.m.opcode(2) << 8) | sys.m.opcode(1);		// DESTINATION
			sys.m.pc += 3;
			if((o & 1) || ((o & 1) === 0 && flag)) {
				sys.m.stackPush(sys.m.pc, 16);
				sys.m.pc = dest;
			}
			else cycles = 12;											// NOT PERFORMED, LESS CYCLES TAKEN
			return cycles;
		}
		else {															// JP
			if((o & 0x20) >> 5) {										// (HL)
				sys.m.pc = me.getRegPair(2);
				return 4;
			}
			else if((o & 1) || ((o & 1) === 0 && flag)) {
				sys.m.pc = (sys.m.opcode(2) << 8) | sys.m.opcode(1);	// DESTINATION
				return 16;
			}
			else
				return me.advancePc(3, 12);								// NOT PERFORMED, LESS CYCLES TAKEN
		};
	};
	
	var rst = function(o) {												// RESET
		sys.m.pc++;
		sys.m.stackPush(sys.m.pc, 16);
		sys.m.pc = o - 0xC7;
		return 16;
	};
	
	var interrupts = function(o) {										// ENABLE OR DISABLE IME
		ime = o === 0xFB;
		return me.advancePc(1, 4);
	};
	
	var ldh = function(o) {												// LOAD EFFECTIVE ADDRESS OR (C)
		var v = o & 2
			? registers[1]												// REGISTER C
			: sys.m.opcode(1);											// IMMEDIATE 8 BIT DATA
		switch(o & 0x10) {
			case 0: sys.m.setAddr(0xFF00 | v, registers[7]); break;
			default: registers[7] = sys.m.getAddr(0xFF00 | v); break;
		};
		
		return me.advancePc(o & 2 ? 1 : 2, o & 2 ? 8 : 12);
	};
	
	var hlsp = function(o) {											// LOAD HL, SP AND VARIATIONS
		var a = sys.m.sp;
		var b = sys.m.opcode(1);
		if(b > 128) b = b - 256;
		var c = a + b;
		
		switch(o) {
			case 0xE8:
				sys.m.sp = c & 0xFFFF;
				break;
			case 0xF8:
				me.setRegPair(2, c & 0xFFFF);
				break;
			case 0xF9:
				sys.m.sp = me.getRegPair(2);
				return me.advancePc(1, 8);
		};
		
		registers[6] = 0;
		if (b >= 0) {
			if(((a & 0xFF) + b) > 0xFF)
				registers[6] |= 0x10;
			if(((a & 0xF) + (b & 0xF)) > 0xF)
				registers[6] |= 0x20;
		}
		else {
			if((c & 0xFF) <= (a & 0xFF))
				registers[6] |= 0x10;
			if((c & 0xF) <= (a & 0xF))
				registers[6] |= 0x20;
		}
		
		return me.advancePc(2, o === 0xE8 ? 16 : 12);
	};
	
	var swap = function(o) {											// SWAP HIGH AND LOW NIBBLES OF REGISTER OR (HL)
		var r = o & 7;
		var operand = r === 6 
			? sys.m.getAddr(me.getRegPair(2))
			: registers[r];
		var result = (operand & 0x0F) << 4 | (operand & 0xF0) >> 4;
		if(r === 6)
			sys.m.setAddr(me.getRegPair(2), result);
		else
			registers[r] = result;
		
		registers[6] = 0;
		me.setZero(result);
		return me.advancePc(2, r === 6 ? 16 : 8);
	};
	
	var getbit = function(o) {											// SET ZERO BASED ON BIT B OF REGISTER OR (HL)
		var r = o & 0x07;
		var index = (o & 0x38) >> 3;
		var operand = r === 6
			? sys.m.getAddr(me.getRegPair(2))
			: registers[r];
		var bit = (operand & (1 << index)) >> index;
		me.setZero(bit);
		registers[6] &= ~0x40;
		registers[6] |= 0x20;
		return me.advancePc(2, r === 6 ? 16 : 8);
	};
	
	var setbit = function(o) {											// SET OR UNSET BIT OF REGISTER OR (HL)
		var r = o & 0x07;
		var set = (o & 0x40) >> 6;
		var index = (o & 0x38) >> 3;
		var v = r === 6 
			? sys.m.getAddr(me.getRegPair(2))
			: registers[r];
		var result = set ? (v | (1 << index)) : (v & ~(1 << index));
		if(r === 6)
			sys.m.setAddr(me.getRegPair(2), result);
		else
			registers[r] = result;
		return me.advancePc(2, r === 6 ? 16 : 8);
	};
	
	// CONSTRUCTOR
	(function() {
		un[0x00] = (o) => { return me.advancePc(1, 4); };				// NOP
		un[0x08] = (o) => { return ld16immediate(o); };					// LD (a16),SP
		un[0x10] = (o) => { return 4; };								// STOP 0
		un[0x27] = (o) => { return daa(o); };							// DAA
		un[0x2F] = (o) => { return cpl(o); };							// CPL
		un[0x37] = (o) => { return scf(o); };							// SCF
		un[0x3F] = (o) => { return ccf(o); };							// CCF
		
		for(var i = 0x01; i < 0x40; i++) {
			switch(i & 0xF) {
				case 0x00: case 0x08:
					if(i < 0x18) break;
					un[i] = (o) => { return jrel(o); };					// JR / JR c / JR not c
					break;
				case 0x01:
					un[i] = (o) => { return ldrp(o); };					// LD rp,d16
					break;
				case 0x02: case 0x0A:
					un[i] = (o) => { return ldma(o); };					// LD (rp),A / A,(rp)
					break;
				case 0x03: case 0x0B:
					un[i] = (o) => { return idrp(o); };					// INC / DEC rp
					break;
				case 0x04: case 0x05: case 0x0C: case 0x0D:
					un[i] = (o) => { return idrhl(o); };				// INC / DEC r / (HL)
					break;
				case 0x06: case 0x0E:
					un[i] = (o) => { return ldrr(o); };					// LD r,r
					break;
				case 0x09:
					un[i] = (o) => { return addhlrp(o); };				// ADD HL,rp
					break;
			};
			
			if(i > 0x20) continue;
			
			switch(i & 0xF) {
				case 0x07: case 0x0F:
					un[i] = (o) => { return rotate(o); };				// RLA / RRA / RLCA / RRCA
					break;
			};
		};
		
		for(var i = 0x40; i < 0x80; i++) {
			if(i === 0x76) {
				un[i] = (o) => {										// HALT
					if(interruptTrigger) {
						interruptTrigger = false;
						sys.m.pc++;
					};
					return 4;
				};
				continue;
			};
			un[i] = (o) => { return ldrr(o); };							// LD R,R
		};

		for(var i = 0x80; i < 0xA0; i++) {
			un[i] = (o) => { return addsub(o); };						// ADD / SUB / ADC / SBC
		};
		
		for(var i = 0xA0; i < 0xC0; i++) {
			un[i] = (o) => { return logic(o); };						// AND / OR / XOR / CP
		};
		
		for(var i = 0xC0; i < 0xE0; i++) {
			switch(i & 0xF) {
				case 0x00: case 0x08: case 0x09:
					un[i] = (o) => { return ret(o); };					// RET
					break;
				case 0x02: case 0x03: case 0x04:
				case 0x0A: case 0x0B: case 0x0C:
					un[i] = (o) => { return jumpcall(o); };				// JP / CALL
					break;
				case 0x06: case 0x0E:
					un[i] = (o) => { return addsub(o); };				// ADD / SUB / ADC / SBC
					break;
			};
		};
		
		for(var i = 0xE0; i < 0xFF; i++) {
			switch(i & 0xF) {
				case 0x00: case 0x02:
					un[i] = (o) => { return ldh(o); };					// LDH
					break;
				case 0x06: case 0x0E:
					un[i] = (o) => { return logic(o); };				// AND / OR / XOR / CP
					break;
				case 0x0A:
					un[i] = (o) => { return ld16immediate(o); };		// LD IMMEDIATE
					break;
			};
		};
		
		for(var i = 0xC0; i <= 0xFF; i++) {
			switch(i & 0xF) {
				case 0x01: case 0x05:
					un[i] = (o) => { return pushpop(o); };				// PUSH / POP RP
					break;
				case 0x07: case 0x0F:
					un[i] = (o) => { return rst(o); };					// RST 0xNN
					break;
			};
		}; 
		
		un[0xCD] = (o) => { return jumpcall(o); };
		un[0xE8] = (o) => { return hlsp(o); };
		un[0xE9] = (o) => { return jumpcall(o); };
		un[0xF3] = (o) => { return interrupts(o); };					// DI
		un[0xF8] = (o) => { return hlsp(o); };
		un[0xF9] = (o) => { return hlsp(o); };
		un[0xFB] = (o) => { return interrupts(o); };					// EI
		
		// 0xCB
		for(var i = 0x00; i < 0x30; i++) {
			cb[i] = (o) => { return rotate(o); };
		};
		
		for(var i = 0x30; i < 0x40; i++) {
			if(i < 0x38) cb[i] = (o) => { return swap(o); };
			else cb[i] = (o) => { return rotate(o); };
		};
		
		for(var i = 0x40; i < 0x80; i++) {
			cb[i] = (o) => { return getbit(o); };
		};
		
		for(var i = 0x80; i <= 0xFF; i++) {
			cb[i] = (o) => { return setbit(o); };
		};
		
		var clean = [0xCB, 0xD3, 0xDB, 0xDD, 0xE3, 0xE4,
					 0xEB, 0xEC, 0xED, 0xF4, 0xFC, 0xFD];
					 
		for(var i = 0; i < clean.length; i++) {
			un[clean[i]] = null;
		};		
	})();
});
