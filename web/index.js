var sys = null;
var _speed = 1;
var menu = {
	desktop: document.body.offsetWidth >= 600,
	animation: null,
	element: document.getElementById("menu"),
	close: function() {
		if(menu.desktop) {
			menu.element.style.opacity = "1";
			menu.element.style.width = "250px";
			return;
		};
		clearInterval(menu.animation);
		menu.animation = setInterval(function() {
			var width = menu.element.offsetWidth + 10;
			var left = parseInt(menu.element.style.left);
			if(isNaN(left)) left = 0;
			
			if(width > -(left)) {
				var r = (width + left) * 0.1;
				if(r < 1) r = 1;
				left -= r;
				menu.element.style.left = left + "px";
			}
			else if(width <= -(left)) {
				left = -width;
				menu.element.style.left = left + "px";
				menu.element.style.opacity = "1";
				clearInterval(menu.animation);
			};
			
		}, 10);
	},
	
	open: function() {
		if(menu.desktop) return;
		clearInterval(menu.animation);
		menu.animation = setInterval(function() {
			var left = parseInt(menu.element.style.left);
			if(isNaN(left)) left = 0;
			
			if(left < 0) {
				var r = -left * 0.1;
				if(r < 1) r = 1;
				left += r;
				menu.element.style.left = left + "px";
			}
			else if(left >= 0) {
				left = 0;
				menu.element.style.left = left + "px";
				clearInterval(menu.animation);
			};
		}, 10);
	}
};

var ct = {
	openRom: () => { 
		document.getElementById("loader").click(); 
		menu.close();
	},
	
	reset: () => {
		sys.reload();
		menu.close();
	},
	
	speed: () => {
		_speed = _speed === 1.5 ? 1 : 1.5;
		sys.config({ speed: _speed });
		menu.close();
	},
	
	openWindow: (name) => {
		var wns = document.getElementsByClassName("gb-window");
		
		for(var i = 0; i < wns.length; i++) {
			if(wns[i].id == name)
				wns[i].style.display = "block";
			else
				wns[i].style.display = "none";
		};
		
		document.getElementById("gb-shadow").style.display = "block"
	},
	
	closeWindow: (name) => {
		document.getElementById("gb-shadow").style.display = "none";
	},
	
	localStorageWindow: () => {
		ct.openWindow("wn-localStorage");
		var tb = document.querySelector("#localStorage-table table tbody");
		tb.innerHTML = "";
		var free = 10485760;
		for (var i = 0, len = localStorage.length; i < len; ++i) {
			var tr = document.createElement("tr");
			
			var k = document.createElement("td");
			k.innerHTML = localStorage.key(i);
			tr.appendChild(k);
			
			var t = document.createElement("td");
			t.innerHTML = localStorage.key(i).indexOf("B_") === 0 
				? "Battery" : "Save State";
			tr.appendChild(t);
			
			var l = document.createElement("td");
			var ll = localStorage.getItem(localStorage.key(i)).length;
			free -= ll;
			l.innerHTML = (ll / 1024).toFixed(2) + " kB";
			tr.appendChild(l);
			
			var r = document.createElement("td");
			r.innerHTML = "<a href='javascript:ct.removelocalStorage(\""
				+ localStorage.key(i)
				+ "\")'>Remove</a>";
			tr.appendChild(r);
			tb.appendChild(tr);
		};
		
		document.getElementById("localStorage-free").innerHTML = 
			"Free Space: " + (free / 1024).toFixed(2) + " kB";
	},
	
	removelocalStorage: (i) => {
		localStorage.removeItem(i);
		ct.localStorageWindow();
	},
	
	resize: () => {
		var parent = document.getElementById("display").parentElement;
		var pw = parent.offsetWidth;
		var ph = parent.offsetHeight;
		
		var scaleX = pw / 160;
		var scaleY = ph / 144;
		
		if(scaleX < scaleY) {
			sys.config({ gpu: { scale: { x: scaleX, y: scaleX } } });
		};
	},
	
	sound: () => {
		sys.config({ apu: { toggle: true } });
		menu.close();
	},
	
	touchHandler: function(x, y, e, t) {
		var indexes = null;
		switch(e.getAttribute("data-type")) {
			case "directional":
				indexes = ct.directionalHandler(x, y, e);
				break;
			case "action":
				indexes = ct.actionHandler(x, y, e);
				break;
			case "ss":
				indexes = ct.ssHandler(x, y, e);
				break;
		};
		
		if(t === 0) {
			for(var i = 0; i < indexes.length; i++)
				sys.holdButton(indexes[i]);
		}
		else {
			for(var i = 0; i < indexes.length; i++)
				sys.releaseButton(indexes[i]);
		};
		
	},
	
	directionalHandler: function(x, y, e) {
		var ret = [];
		var ex = e.offsetWidth;
		var ey = e.offsetHeight;
		
		var bx = x - e.offsetLeft;
		var by = y - e.offsetTop;
		
		if(bx < ex * 0.33) ret[0] = 1;
		else if(bx > ex * 0.66) ret[0] = 0;
	
		if(by < ey * 0.33) ret[1] = 2;
		else if(by > ey * 0.66) ret[1] = 3;
		
		return ret;
	},
	
	actionHandler: function(x, y, e) {
		var ex = e.offsetWidth;
		var bx = x - e.offsetLeft;
		var by = y - e.offsetTop;
		
		var ret = [];
		if(bx < ex * 0.45) ret[0] = 5;
		else if(bx > ex * 0.55) ret[0] = 4;
		else { ret[0] = 5; ret[1] = 4 };
		return ret;
	},
	
	ssHandler: function(x, y, e) {
		var ex = e.offsetWidth;
		var bx = x - e.offsetLeft;
		var by = y - e.offsetTop;
		var ret = [];
		if(bx < ex * 0.5 && bx > ex * 0.25) ret[0] = 6;
		else if(bx > ex * 0.5 && bx < ex * 0.75) ret[0] = 7;
		return ret;
	},
	
	save: () => { sys.saveState("localStorage"); menu.close(); },
	load: () => { sys.loadState("localStorage"); menu.close(); },
};

document.body.onload = function() {
	sys = new system(
		document.getElementById("display"),
		document.getElementById("loader"),
		document.getElementById("debugWindow")
	);
	ct.resize();
	menu.close();
	
	if(!menu.desktop) {
		var c = document.getElementById("display");
		var ctx = c.getContext("2d");
		ctx.font = "8px Monospace, Consolas";
		ctx.fillText("Touch here to open menu.", 2, 10);
	};
	
	document.onkeydown = function(e) {									// HANDLE KEYS
		var index = sys.binds.indexOf(e.keyCode);
		sys.holdButton(index);
	};

	document.onkeyup = function(e) {
		var index = sys.binds.indexOf(e.keyCode);
		sys.releaseButton(index);
	};

	document.ontouchstart = function(e) {
		for(var j = 0; j < e.changedTouches.length; j++) {
			var touch = e.changedTouches[j];
			for(var i = 0; i < e.path.length; i++) {
				if(e.path[i].tagName !== "DIV") continue;
				if(!e.path[i].hasAttribute("data-type")) continue;
				ct.touchHandler(touch.clientX, touch.clientY, e.path[i], 0);
				break;
			};
		};
	};

	document.ontouchend = function(e) {
		for(var j = 0; j < e.changedTouches.length; j++) {
			var touch = e.changedTouches[j];
			for(var i = 0; i < e.path.length; i++) {
				if(e.path[i].tagName !== "DIV") continue;
				if(!e.path[i].hasAttribute("data-type")) continue;
				ct.touchHandler(touch.clientX, touch.clientY, e.path[i], 1);
				break;
			};
		};
	};

	if ('serviceWorker' in navigator)
		navigator.serviceWorker.register('web/service-worker.js');
};

