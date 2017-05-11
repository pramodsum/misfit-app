var events = new Events();

var AudioHandler = function() {

	var waveData = []; //waveform - from 0 - 1 . no sound is 0.5. Array [binCount]
	var levelsData = []; //levels of each frequecy - from 0 - 1 . no sound is 0. Array [levelsCount]
	var level = 0; // averaged normalized level from 0 - 1
	var bpmTime = 0; // bpmTime ranges from 0 to 1. 0 = on beat. Based on tap bpm
	var ratedBPMTime = 550;//time between beats (msec) multiplied by BPMRate
	var levelHistory = []; //last 256 ave norm levels
	var colorHistory = []; //last 256 ave norm levels
	var bpmStart;

	var BEAT_HOLD_TIME = 40; //num of frames to hold a beat
	var BEAT_DECAY_RATE = 0.88;
	var BEAT_MIN = 0.15; //a volume less than this is no beat

	//BPM STUFF
	var count = 0;
	var msecsFirst = 0;
	var msecsPrevious = 0;
	var msecsAvg = 633; //time between beats (msec)

	var timer;
	var gotBeat = false;
	var beatCutOff = 0;
	var beatTime = 0;
	var scl = 0;

	var freqByteData; //bars - bar data is from 0 - 256 in 512 bins. no sound is 0;
	var timeByteData; //waveform - waveform data is from 0-256 for 512 bins. no sound is 128.
	var levelsCount = 16; //should be factor of 512

	var binCount; //512
	var levelBins;

	var isPlayingAudio = false;

	var source;
	var buffer;
	var audioBuffer;
	var dropArea;
	var audioContext;
	var analyser;

	// Seed to get repeatable colors
	var seed = null;

	// Shared color dictionary
	var colorDictionary = {};

	function init() {
		//EVENT HANDLERS
		events.on("update", update);

		//Get an Audio Context
		try {
			window.AudioContext = window.AudioContext || window.webkitAudioContext;
			audioContext = new window.AudioContext();
		} catch(e) {
			//Web Audio API is not supported in this browser
			$('#info').append('Sorry!<br>This browser does not support the Web Audio API. Please use Chrome, Safari or Firefox.');
			$('#controls').hide();
			return;
		}

		analyser = audioContext.createAnalyser();
		analyser.smoothingTimeConstant = 0.8; //0<->1. 0 is no time smoothing
		analyser.fftSize = 1024;
		analyser.connect(audioContext.destination);
		binCount = analyser.frequencyBinCount; // = 512

		levelBins = Math.floor(binCount / levelsCount); //number of bins in each level

		freqByteData = new Uint8Array(binCount);
		timeByteData = new Uint8Array(binCount);

		var length = 256;
		for(var i = 0; i < length; i++) {
		    levelHistory.push(0);
		}

		getMicInput();
		setInterval(update, 5);

		onBMPBeat();
		msecsAvg = 640;
		timer = setInterval(onBMPBeat,msecsAvg);

		// Populate the color dictionary
		loadColorBounds();
	}

	function getMicInput() {
		//x-browser
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

		if (navigator.getUserMedia ) {
			navigator.getUserMedia(
				{audio: true},

				function(stream) {
					//reinit here or get an echo on the mic
					source = audioContext.createBufferSource();
					analyser = audioContext.createAnalyser();
					analyser.fftSize = 1024;
					analyser.smoothingTimeConstant = 0.3;

					microphone = audioContext.createMediaStreamSource(stream);
					microphone.connect(analyser);
					isPlayingAudio = true;
				},

				// errorCallback
				function(err) {
					alert("The following error occured: " + err);
				}
			);

		}else{
			alert("Could not getUserMedia");
		}
	}

	function onBMPBeat(){
		//console.log("onBMPBeat");
		bpmStart = new Date().getTime();

		//only fire bpm beat if there was an on onBeat in last timeframe
		//experimental combined beat + bpm mode
		//if (gotBeat){
			gotBeat = false;
		//}

	}

	//called every frame
	//update published viz data
	function update(){

		if (!isPlayingAudio) return;

		//GET DATA
		analyser.getByteFrequencyData(freqByteData); //<-- bar chart
		analyser.getByteTimeDomainData(timeByteData); // <-- waveform

		//normalize waveform data
		for(var i = 0; i < binCount; i++) {
			waveData[i] = ((timeByteData[i] - 128) / 128);
		}
		//TODO - cap levels at 1 and -1 ?

		//normalize levelsData from freqByteData
		for(var i = 0; i < levelsCount; i++) {
			var sum = 0;
			for(var j = 0; j < levelBins; j++) {
				sum += freqByteData[(i * levelBins) + j];
			}
			levelsData[i] = sum / levelBins / 256; //freqData maxs at 256

			//adjust for the fact that lower levels are percieved more quietly
			//make lower levels smaller
			levelsData[i] *=  1 + (i / levelsCount) / 2;
		}
		//TODO - cap levels at 1?

		//GET AVG LEVEL
		var sum = 0;
		for(var j = 0; j < levelsCount; j++) {
			sum += levelsData[j];
		}

		level = sum / levelsCount;

		levelHistory.push(level);
		levelHistory.shift(1);

		//BEAT DETECTION
		if (level  > beatCutOff && level > BEAT_MIN){
			getLastFreq();
			beatCutOff = level * 1.1;
			beatTime = 0;
		} else{
			if (beatTime <= BEAT_HOLD_TIME){
				beatTime ++;
			}else{
				beatCutOff *= BEAT_DECAY_RATE;
				beatCutOff = Math.max(beatCutOff,BEAT_MIN);
			}
		}

		bpmTime = (new Date().getTime() - bpmStart) / msecsAvg;
		//trace(bpmStart);
	}

	function invertColor(lastColor) {
		return {
			r: (255 - lastColor.r),
			g: (255 - lastColor.g),
			b: (255 - lastColor.b)
		};
	}

	function randomizeColor(options) {
	  options = options || {};

	  // Check if there is a seed and ensure it's an
	  // integer. Otherwise, reset the seed value.
	  if (options.seed !== undefined && options.seed !== null && options.seed === parseInt(options.seed, 10)) {
	    seed = options.seed;

	  // A string was passed as a seed
	  } else if (typeof options.seed === 'string') {
	    seed = stringToInteger(options.seed);

	  // Something was passed as a seed but it wasn't an integer or string
	  } else if (options.seed !== undefined && options.seed !== null) {
	    throw new TypeError('The seed value must be an integer or string');

	  // No seed, reset the value outside.
	  } else {
	    seed = null;
	  }

	  var H,S,B;

	  // Check if we need to generate multiple colors
	  if (options.count !== null && options.count !== undefined) {

	    var totalColors = options.count,
	        colors = [];

	    options.count = null;

	    while (totalColors > colors.length) {

	      // Since we're generating multiple colors,
	      // incremement the seed. Otherwise we'd just
	      // generate the same color each time...
	      if (seed && options.seed) options.seed += 1;

	      colors.push(randomColor(options));
	    }

	    options.count = totalColors;

	    return colors;
	  }

	  // First we pick a hue (H)
	  H = pickHue(options);

	  // Then use H to determine saturation (S)
	  S = pickSaturation(H, options);

	  // Then use S and H to determine brightness (B).
	  B = pickBrightness(H, S, options);

	  // Then we return the HSB color in the desired format
	  var rgbArray = setFormat([H,S,B], options);
		return {
			r: rgbArray[0],
			g: rgbArray[1],
			b: rgbArray[2]
		};
	}

	function getLastFreq() {
		const level = levelHistory.length ? levelHistory[levelHistory.length - 1] : 0;
		var gotoScale = level * 1.2 + 0.1;
		scl += (gotoScale - scl) / 3;

		if (bpmTime <= 0.25 && level < 0.7) {
			// console.log('not enough');
			return;
		}

		var color = 0;
		if (colorHistory.length % 2) {
			color = invertColor(colorHistory[colorHistory.length - 1]);
		} else {
			color = randomizeColor({
			   luminosity: 'bright',
			   format: 'rgbArray',
				 hue: 'random'
			});
		}
		colorHistory.push(color);
		console.log(color);

		$.ajax({
			headers : {
				'Accept' : 'application/json',
				'Content-Type' : 'application/json'
			},
			url : `${document.URL}254e381abc4b4d5cb3612817acba6345`,
			type : 'PATCH',
			data : JSON.stringify({
				"red": color.r,
				"green": color.g,
				"blue": color.b,
				"brightness": 100,
				"saturation": 100
			}),
			success : function(response, textStatus, jqXhr) {
					console.log("Successfully Patched!");
			},
			error : function(jqXHR, textStatus, errorThrown) {
					// log the error to the console
					console.log("The following error occured: " + textStatus, errorThrown);
			}
		});

		init();
	}

	function onBeat(){
		gotBeat = true;
	}

	function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function pickHue (options) {

  var hueRange = getHueRange(options.hue),
      hue = randomWithin(hueRange);

  // Instead of storing red as two seperate ranges,
  // we group them, using negative numbers
  if (hue < 0) {hue = 360 + hue;}

  return hue;

}

function pickSaturation (hue, options) {

  if (options.hue === 'monochrome') {
    return 0;
  }

  if (options.luminosity === 'random') {
    return randomWithin([0,100]);
  }

  var saturationRange = getSaturationRange(hue);

  var sMin = saturationRange[0],
      sMax = saturationRange[1];

  switch (options.luminosity) {

    case 'bright':
      sMin = 55;
      break;

    case 'dark':
      sMin = sMax - 10;
      break;

    case 'light':
      sMax = 55;
      break;
 }

  return randomWithin([sMin, sMax]);

}

function pickBrightness (H, S, options) {

  var bMin = getMinimumBrightness(H, S),
      bMax = 100;

  switch (options.luminosity) {

    case 'dark':
      bMax = bMin + 20;
      break;

    case 'light':
      bMin = (bMax + bMin)/2;
      break;

    case 'random':
      bMin = 0;
      bMax = 100;
      break;
  }

  return randomWithin([bMin, bMax]);
}

function setFormat (hsv, options) {

  switch (options.format) {

    case 'hsvArray':
      return hsv;

    case 'hslArray':
      return HSVtoHSL(hsv);

    case 'hsl':
      var hsl = HSVtoHSL(hsv);
      return 'hsl('+hsl[0]+', '+hsl[1]+'%, '+hsl[2]+'%)';

    case 'hsla':
      var hslColor = HSVtoHSL(hsv);
      var alpha = options.alpha || Math.random();
      return 'hsla('+hslColor[0]+', '+hslColor[1]+'%, '+hslColor[2]+'%, ' + alpha + ')';

    case 'rgbArray':
      return HSVtoRGB(hsv);

    case 'rgb':
      var rgb = HSVtoRGB(hsv);
      return 'rgb(' + rgb.join(', ') + ')';

    case 'rgba':
      var rgbColor = HSVtoRGB(hsv);
      var alpha = options.alpha || Math.random();
      return 'rgba(' + rgbColor.join(', ') + ', ' + alpha + ')';

    default:
      return HSVtoHex(hsv);
  }

}

function getMinimumBrightness(H, S) {

  var lowerBounds = getColorInfo(H).lowerBounds;

  for (var i = 0; i < lowerBounds.length - 1; i++) {

    var s1 = lowerBounds[i][0],
        v1 = lowerBounds[i][1];

    var s2 = lowerBounds[i+1][0],
        v2 = lowerBounds[i+1][1];

    if (S >= s1 && S <= s2) {

       var m = (v2 - v1)/(s2 - s1),
           b = v1 - m*s1;

       return m*S + b;
    }

  }

  return 0;
}

function getHueRange (colorInput) {

  if (typeof parseInt(colorInput) === 'number') {

    var number = parseInt(colorInput);

    if (number < 360 && number > 0) {
      return [number, number];
    }

  }

  if (typeof colorInput === 'string') {

    if (colorDictionary[colorInput]) {
      var color = colorDictionary[colorInput];
      if (color.hueRange) {return color.hueRange;}
    } else if (colorInput.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)) {
      const hue = HexToHSB(colorInput)[0];
      return [ hue, hue ];
    }
  }

  return [0,360];

}

function getSaturationRange (hue) {
  return getColorInfo(hue).saturationRange;
}

function getColorInfo (hue) {

  // Maps red colors to make picking hue easier
  if (hue >= 334 && hue <= 360) {
    hue-= 360;
  }

  for (var colorName in colorDictionary) {
     var color = colorDictionary[colorName];
     if (color.hueRange &&
         hue >= color.hueRange[0] &&
         hue <= color.hueRange[1]) {
        return colorDictionary[colorName];
     }
  } return 'Color not found';
}

function randomWithin (range) {
  if (seed === null) {
    return Math.floor(range[0] + Math.random()*(range[1] + 1 - range[0]));
  } else {
    //Seeded random algorithm from http://indiegamr.com/generate-repeatable-random-numbers-in-js/
    var max = range[1] || 1;
    var min = range[0] || 0;
    seed = (seed * 9301 + 49297) % 233280;
    var rnd = seed / 233280.0;
    return Math.floor(min + rnd * (max - min));
  }
}

function HSVtoHex (hsv){

  var rgb = HSVtoRGB(hsv);

  function componentToHex(c) {
      var hex = c.toString(16);
      return hex.length == 1 ? '0' + hex : hex;
  }

  var hex = '#' + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);

  return hex;

}

function defineColor (name, hueRange, lowerBounds) {

  var sMin = lowerBounds[0][0],
      sMax = lowerBounds[lowerBounds.length - 1][0],

      bMin = lowerBounds[lowerBounds.length - 1][1],
      bMax = lowerBounds[0][1];

  colorDictionary[name] = {
    hueRange: hueRange,
    lowerBounds: lowerBounds,
    saturationRange: [sMin, sMax],
    brightnessRange: [bMin, bMax]
  };

}

function loadColorBounds () {

  defineColor(
    'monochrome',
    null,
    [[0,0],[100,0]]
  );

  defineColor(
    'red',
    [-26,18],
    [[20,100],[30,92],[40,89],[50,85],[60,78],[70,70],[80,60],[90,55],[100,50]]
  );

  defineColor(
    'orange',
    [19,46],
    [[20,100],[30,93],[40,88],[50,86],[60,85],[70,70],[100,70]]
  );

  defineColor(
    'yellow',
    [47,62],
    [[25,100],[40,94],[50,89],[60,86],[70,84],[80,82],[90,80],[100,75]]
  );

  defineColor(
    'green',
    [63,178],
    [[30,100],[40,90],[50,85],[60,81],[70,74],[80,64],[90,50],[100,40]]
  );

  defineColor(
    'blue',
    [179, 257],
    [[20,100],[30,86],[40,80],[50,74],[60,60],[70,52],[80,44],[90,39],[100,35]]
  );

  defineColor(
    'purple',
    [258, 282],
    [[20,100],[30,87],[40,79],[50,70],[60,65],[70,59],[80,52],[90,45],[100,42]]
  );

  defineColor(
    'pink',
    [283, 334],
    [[20,100],[30,90],[40,86],[60,84],[80,80],[90,75],[100,73]]
  );

}

function HSVtoRGB (hsv) {

  // this doesn't work for the values of 0 and 360
  // here's the hacky fix
  var h = hsv[0];
  if (h === 0) {h = 1;}
  if (h === 360) {h = 359;}

  // Rebase the h,s,v values
  h = h/360;
  var s = hsv[1]/100,
      v = hsv[2]/100;

  var h_i = Math.floor(h*6),
    f = h * 6 - h_i,
    p = v * (1 - s),
    q = v * (1 - f*s),
    t = v * (1 - (1 - f)*s),
    r = 256,
    g = 256,
    b = 256;

  switch(h_i) {
    case 0: r = v; g = t; b = p;  break;
    case 1: r = q; g = v; b = p;  break;
    case 2: r = p; g = v; b = t;  break;
    case 3: r = p; g = q; b = v;  break;
    case 4: r = t; g = p; b = v;  break;
    case 5: r = v; g = p; b = q;  break;
  }

  var result = [Math.floor(r*255), Math.floor(g*255), Math.floor(b*255)];
  return result;
}

function HexToHSB (hex) {
  hex = hex.replace(/^#/, '');
  hex = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;

  const red = parseInt(hex.substr(0, 2), 16) / 255,
        green = parseInt(hex.substr(2, 2), 16) / 255,
        blue = parseInt(hex.substr(4, 2), 16) / 255;

  const cMax = Math.max(red, green, blue),
        delta = cMax - Math.min(red, green, blue),
        saturation = cMax ? (delta / cMax) : 0;

  switch (cMax) {
    case red: return [ 60 * (((green - blue) / delta) % 6) || 0, saturation, cMax ];
    case green: return [ 60 * (((blue - red) / delta) + 2) || 0, saturation, cMax ];
    case blue: return [ 60 * (((red - green) / delta) + 4) || 0, saturation, cMax ];
  }
}

function HSVtoHSL (hsv) {
  var h = hsv[0],
    s = hsv[1]/100,
    v = hsv[2]/100,
    k = (2-s)*v;

  return [
    h,
    Math.round(s*v / (k<1 ? k : 2-k) * 10000) / 100,
    k/2 * 100
  ];
}

function stringToInteger (string) {
  var total = 0
  for (var i = 0; i !== string.length; i++) {
    if (total >= Number.MAX_SAFE_INTEGER) break;
    total += string.charCodeAt(i)
  }
  return total
}

	return {
		update:update,
		init:init,
		getMicInput:getMicInput,
	};

}();
