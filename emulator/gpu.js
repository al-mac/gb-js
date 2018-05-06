var gpu = (function(sys, display) {
	var me = this;
	var sys = sys;
	var palette = [0xFFFFFFFF, 0xFFC0C0C0, 0xFF606060, 0xFF000000];
	
	var triggers = { sync: 0, draw: 1, vblank: 1, scanline: 0 };
	var element = null;
	var context = null;
	var imageData = null;
	var buffer = null;
	var buffer8 = null;
	var frameBuffer = null;
	var bgLayer = null;
	var wnLayer = null;
	var llc = {  };
	var tilesets = null;
	
	// CACHES
	var pal = new Uint32Array(4);
	var spriteRam = new Uint8Array(160);
	var tileram = new Uint8Array(16);
	var scaler = null;
	var scalerContext = null;
	
	// GPU FUNCTIONS
	var setMode = function(val, mode) {									// CONTROL LCD STAT MODE
		sys.m.setAddr(0xFF41, (val & 0xFC) | mode, true);
	};
	
	me.step = function(taken) {											// GPU MAIN OPERATION
		var stat = sys.m.getAddr(0xFF41);								// STAT
		if(!sys.m.getBit(0xFF40, 7)) {
			triggers.draw = 1;
			triggers.vblank = 1;
			sys.m.setAddr(0xFF44, 0);
		};
		
		var mode = stat & 0x03;											// GPU MODE
		triggers.sync += taken;
		var ly = sys.m.getAddr(0xFF44);									// LY
		
		var flags = (stat & 0x1C) >> 2;									// GPU INTERRUPT FLAGS
		var coincidence = ly === sys.m.getAddr(0xFF45);
		if(coincidence && (stat & 0x40))								// IF COINCIDENCE INTERRUPT ENABLED
			sys.triggerInterrupt(1);
		sys.m.setBit(0xFF41, 2, coincidence, true);									
		
		stat = sys.m.getAddr(0xFF41);									// REFRESH STAT VALUE

		if(ly < 144) {													// LY (CURRENT SCANLINE)
			if(triggers.sync <= 80) {
				if(mode !== 0x02) {
					setMode(stat, 2);
					if(flags & 0x04)
						sys.triggerInterrupt(1);
				};
			}
			else if(triggers.sync > 80 && triggers.sync <= 252) {
				if(mode !== 0x03) setMode(stat, 3);
			}
			else if(triggers.sync > 252) {
				if(triggers.scanline != ly) {
					renderScanline(ly);
					triggers.scanline = ly;
				};
				if(mode !== 0x00) {
					setMode(stat, 0);									// MODE 0: H-BLANK
					if(flags & 0x01)
						sys.triggerInterrupt(1);
				};
			};
		}
		else {
			if(mode !== 0x01) {
				setMode(stat, 1);
				if(flags & 0x02)
					sys.triggerInterrupt(1);
			};
			
			if(triggers.draw) {
				draw();
				triggers.draw = 0;
			};
			
			if(triggers.vblank) {
				sys.triggerInterrupt(0);
				triggers.vblank = 0;
			};
		};
	
		if(triggers.sync >= 456) {
			++ly;
			triggers.sync -= 456;
			sys.m.setAddr(0xFF44, ly, true);
		}
		
		if(ly > 154) {
			preRender();
			if(sys.m.triggers.tile) {
				sys.m.triggers.tile = 0;
				updateTileset();
			};
			sys.m.setAddr(0xFF44, 0, true);
			setMode(stat, 2);
			if(!triggers.draw) triggers.draw = 1;
			if(!triggers.vblank) triggers.vblank = 1;
		};
	};
	
	// FRAMEBUFFER FUNCTIONS
	var getPalette = function(addr) {									// GENERATE GB PALETTE FROM 2 BYTES
		var val = sys.m.getAddr(addr);
		var indexes = [(val & 0x03), ((val & 0x0C) >> 2),
				((val & 0x30) >> 4), ((val & 0xC0) >> 6)];
		
		for(var i = 0; i < 4; i++)
			pal[i] = palette[indexes[i]];
	};
	
	var updateTileset = function(initialize) {							// ORGANIZE VRAM TO SO IT'S EASIER TO DRAW
		var offsets = [0x8800, 0x8000];									// OFFSET FOR BOTH TILESETS
		if(initialize) tilesets = [];									// CLEAR THE ARRAY
		var ix = 0;
		for(var o in offsets) {
			var offset = offsets[o];
			var tileset = null;
			if(initialize) tileset = [];
			else tileset = tilesets[ix];
			
			for(var j = 0; j <= 0xFF; j++) {							// FOR EACH TILE
				var tile = null;
				if(initialize) tile = [];
				else tile = tileset[j];
				sys.m.copyBuffer(tileram, offset + (16 * j));			// GET IT'S DATA
				
				for(var i = 0; i < 16; i += 2) {						// FOR EACH LINE
					var byte1 = tileram[i];								// READ BOTH BYTES THAT REPRESENT IT		
					var byte2 = tileram[i + 1];
					var line = null;
					if(initialize) line = new Uint8Array(8);
					else line = tile[i >> 1];
					
					for(var p = 7; p >= 0; p--) {						// FOR EACH PIXEL
						var mask = 1 << p;
						var pixel = ((byte2 & mask) >> p) << 1 |		// MASK BOTH BITS THAT MAKE THE COLOR	
									 (byte1 & mask) >> p;
						line[7 - p] = pixel;							// ADD THE PIXEL TO THE LINE
					};
					if(initialize)
						tile.push(line);								// ADD THE LINE TO THE TILE
				};
				if(initialize)
					tileset.push(tile);									// ADD THE TILE TO THE TILESET
			};
			if(initialize)
				tilesets.push(tileset);									// ADD THE TILESET TO THE ARRAY OF TILESETS
			ix++;
		};
	};
	
	var preRender = function() {										// GENERATE DATA OF BACKGROUND AND WINDOW
		var lcdc = sys.m.getAddr(0xFF40);
		var tsIndex = (lcdc & 0x10) >> 4;
		
		var tileset = tilesets[tsIndex];
		getPalette(0xFF47);												// GET CURRENT PALETTE
		
		var bgOffset = lcdc & 0x08 ? 0x9C00 : 0x9800;					// GET OFFSET FOR TILEMAP OF BACKGROUND
		var wnOffset = lcdc & 0x40 ? 0x9C00 : 0x9800;					// GET OFFSET FOR TILEMAP OF WINDOW
		
		llc.bgOffset = lcdc & 0x08;										// SET CURRENT DATA FROM LCDC
		llc.wnOffset = lcdc & 0x40;
		llc.tileData = lcdc & 0x10;
		
		for(var y = 0; y < 32; y++) {									// CYCLE THROUGH EACH BACKGROUND TILE
			for(var x = 0; x < 32; x++) {
				var bgMap = sys.m.getAddr(bgOffset + (y << 5) + x);		// GET TILEMAP BYTES
				var wnMap = sys.m.getAddr(wnOffset + (y << 5) + x);
				
				if(tsIndex === 0) {										// GET SIGNED INDEXES IF USING TILESET 0
					if(bgMap < 128) bgMap = bgMap + 128;
					else if(bgMap > 128) bgMap = bgMap - 128;
					else bgMap = 0;
					
					if(wnMap < 128) wnMap = wnMap + 128;
					else if(wnMap > 128) wnMap = wnMap - 128;
					else wnMap = 0;
				};
				
				var bgTile = tileset[bgMap];
				var wnTile = tileset[wnMap];
				var by = y << 3;
				var bx = x << 3;
				for(var ty = 7; ty >= 0; ty--) {						// CYCLE THROUGH EACH PIXEL
					var gy = (by + ty) << 8;
					var gx = bx + 8;
					var bgTileY = bgTile[ty];
					var wnTileY = wnTile[ty];
					for(var tx = 7; tx >= 0; tx--) {
						gx--;
						bgLayer[gy | gx] = pal[bgTileY[tx]];			// BACKGROUND COLOR
						wnLayer[gy | gx] = pal[wnTileY[tx]];			// WINDOW COLOR
					};
				};
			};
		};
	};
	
	var renderScanline = function(y) {									// RENDER SCANLINE TO FRAMEBUFFER
		if(y > 144) return;
		var yix = y * 160;
		var lcdc = sys.m.getAddr(0xFF40);
		if(llc.bgOffset !== (lcdc & 0x08) ||							// REDO PRERENDER IF TILE DATA
			llc.wnOffset !== (lcdc & 0x40) ||							// HAS CHANGED BETWEEN SCANLINES
			llc.tileData !== (lcdc & 0x10))
			preRender();
		
		var wnEnabled = lcdc & 0x20;									// WINDOW ENABLED
		var bgEnabled = lcdc & 0x01;									// BACKGROUND ENABLED
		var spEnabled = lcdc & 0x02;									// SPRITES ENABLED
		
		if(bgEnabled) {
			var scy = sys.m.getAddr(0xFF42);
			var scx = sys.m.getAddr(0xFF43);
			var gy = (y + scy) & 0xFF;
			for(var x = 159; x >= 0; x--) {								// FOR EACH PIXEL OF THE SCANLINE
				var gx = (x + scx) & 0xFF;								// GET THE OFFSET OF THE BACKGROUND TO
																		// START DISPLAYING ON THE SCREEN
				frameBuffer[yix + x] = bgLayer[(gy << 8) + gx];			// COPY THE COLOR TO THE FRAMEBUFFER
			};
		};
		
		if(wnEnabled) {
			var wcy = sys.m.getAddr(0xFF4A);
			var wcx = sys.m.getAddr(0xFF4B) - 7;
			var gy = y - wcy;
			for(var x = 159; x >= 0; x--) {								// FOR EACH PIXEL OF THE SCANLINE
				var gx = x - wcx;										// GET THE OFFSET OF THE WINDOW TO	
																		// START DISPLAYING ON THE SCREEN
				if(gx < 0 || gy < 0 || gx > 160 || gy > 144) continue;	// IGNORE IF IT IS OUT OF BOUNDS
				frameBuffer[yix + x] = wnLayer[(gy << 8) + gx];			// COPY THE COLOR TO THE FRAMEBUFFER
			};
		};
		
		if(spEnabled) {
			sys.m.copyBuffer(spriteRam, 0xFE00);
			var spriteMode = lcdc & 0x04;
			for(var i = 0; i < 160; i += 4) {
				var sy = spriteRam[i] - 16;								// SPRITE POSITION Y
				if(!spriteMode && sy + 8 < 0) continue;
				if(spriteMode && sy + 16 < 0) continue;
				if(y < sy) continue;									// VERIFY IF SPRITE INTERSECTS
				if(!spriteMode && y > (sy + 7)) continue;				// THE CURRENT SCANLINE
				if(spriteMode && y > (sy + 15)) continue;
				
				var attributes = spriteRam[i + 3];
				var tileAddr = spriteMode 
							? spriteRam[i + 2] & 0xFE					// LSB IS TREATED AS 0 IN 8x16 MODE.
							: spriteRam[i + 2];
				
				var xflip = attributes & 0x20;
				var yflip = attributes & 0x40;
				var secondTile = spriteMode && y > (sy + 7);
				
				var tile = secondTile									// GET RELEVANT TILE
						? yflip
							? tilesets[1][tileAddr]
							: tilesets[1][tileAddr + 1]
						: yflip && spriteMode
							? tilesets[1][tileAddr + 1]
							: tilesets[1][tileAddr];
				
				getPalette(attributes & 0x10 ? 0xFF49 : 0xFF48);		// PALETTE
				var sx = spriteRam[i + 1] - 8;
				var yindex = y - sy - (secondTile ? 8 : 0);
				
				if(yflip)
					yindex = 7 - yindex;
				
				for(var x = 0; x < 8; x++) {
					var gx = sx + x;
					if(gx < 0 || gx > 160) continue;
					var pixel = tile[yindex][(xflip ? 7 - x : x)];
					if(!pixel) continue;
					var color = pal[pixel];
					if(attributes & 0x80) {
						if(frameBuffer[yix + gx] === pal[0])
							frameBuffer[yix + gx] = color;
					}
					else
						frameBuffer[yix + gx] = color;
				};
			};
		};
	};

	// CANVAS FUNCTIONS
	var draw = function() {												// DRAW FRAMEBUFFER TO CANVAS
		if(!sys.m.getBit(0xFF40, 7)) return;
		imageData.data.set(buffer8);
		scalerContext.putImageData(imageData, 0, 0);
		context.drawImage(scaler, 0, 0);
	};
	
	// EMULATOR FUNCTIONALITY
	me.saveState = function() {
		return { triggers: triggers };
	};
	
	me.loadState = function(s) {
		triggers = s.triggers;
		updateTileset();
		preRender();
	};
	
	me.config = function(o) {
		if(!o) return;
		if(o.scale) {
			element.width = 160 * o.scale.x;
			element.height = 144 * o.scale.y;
			context.scale(o.scale.x, o.scale.y);
		};
		
		if(o.palette) {
			if(Array.isArray(o.palette) && o.palette.length === 4)
				palette = o.palette;
		};
	};
	
	// CONSTRUCTOR
	(function(display) {
		element = display;
		context = display.getContext("2d");
		imageData = context.getImageData(0, 0, 160, 144);
		buffer = new ArrayBuffer(imageData.data.length);
		buffer8 = new Uint8ClampedArray(buffer);
		frameBuffer = new Uint32Array(buffer);
		bgLayer = new Uint32Array(0x10000);
		wnLayer = new Uint32Array(0x10000);
		updateTileset(true);
		scaler = document.createElement("canvas");
		scaler.width = 160;
		scaler.height = 144;
		scalerContext = scaler.getContext("2d");
	})(display);
});
